import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * agent-route — the agentic router.
 *
 * Takes messy field input (voice transcript / text / document) + a project id,
 * fetches the project's real entities (context-provider), and asks the model to
 * map the input to a list of structured PROPOSALS against those entities.
 *
 * It NEVER applies anything — the client renders proposals in ConfirmDiff and
 * the user confirms. Proposal envelope contract: src/services/agent/types.ts.
 * See .claude/briefs/agentic-mvp.md.
 */

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5002",
  "http://localhost:3000",
  "https://app.renofine.com",
  "https://renofine.com",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

// Context is fetched AS THE CALLER (their JWT) so Postgres RLS scopes it to
// projects they can actually access — never service-role. This prevents a
// caller from enumerating another project's rooms/tasks by passing its id.
function supabaseRestHeaders(authHeader: string) {
  return {
    apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
    Authorization: authHeader,
    "Content-Type": "application/json",
  };
}

function supabaseRestUrl(table: string): string {
  return `${Deno.env.get("SUPABASE_URL")!}/rest/v1/${table}`;
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English", sv: "Swedish", de: "German", fr: "French", es: "Spanish",
  pl: "Polish", uk: "Ukrainian", ro: "Romanian", lt: "Lithuanian", et: "Estonian",
};

interface RoomCtx { id: string; name: string }
interface TaskCtx { id: string; title: string; status: string | null; checklistItems?: string[] }
interface MemoryCtx { kind: string; key: string; value: string }

// deno-lint-ignore no-explicit-any
function extractChecklistItems(checklists: any): string[] {
  if (!Array.isArray(checklists)) return [];
  return checklists.flatMap((cl) =>
    Array.isArray(cl?.items) ? cl.items.map((i: { title?: string }) => i?.title).filter((t: unknown): t is string => typeof t === "string" && t.length > 0) : [],
  );
}

async function fetchContext(projectId: string, authHeader: string): Promise<{ rooms: RoomCtx[]; tasks: TaskCtx[]; memories: MemoryCtx[] }> {
  const headers = supabaseRestHeaders(authHeader);
  const [roomsRes, tasksRes, memRes] = await Promise.all([
    fetch(
      `${supabaseRestUrl("rooms")}?project_id=eq.${projectId}&select=id,name&order=name.asc`,
      { headers },
    ),
    fetch(
      `${supabaseRestUrl("tasks")}?project_id=eq.${projectId}&select=id,title,status,checklists&order=created_at.desc&limit=200`,
      { headers },
    ),
    // Renaida's learned facts about this user (project-specific + global).
    // RLS scopes these to the caller's own profile automatically.
    fetch(
      `${supabaseRestUrl("renaida_user_memory")}?or=(project_id.eq.${projectId},project_id.is.null)&select=kind,key,value,evidence_count&order=evidence_count.desc&limit=40`,
      { headers },
    ),
  ]);
  const rooms = roomsRes.ok ? await roomsRes.json() : [];
  const tasksRaw = tasksRes.ok ? await tasksRes.json() : [];
  const memories: MemoryCtx[] = memRes.ok ? await memRes.json() : [];
  const tasks: TaskCtx[] = tasksRaw.map((t: { id: string; title: string; status: string | null; checklists?: unknown }) => ({
    id: t.id, title: t.title, status: t.status, checklistItems: extractChecklistItems(t.checklists),
  }));
  return { rooms, tasks, memories };
}

/** Render Renaida's learned facts as prompt hints. Corrections carry the most
 *  weight: they are prior mistakes the user fixed, so we phrase them as rules. */
function buildMemorySection(memories: MemoryCtx[]): string {
  if (!memories.length) return "";
  const corrections = memories.filter((m) => m.kind === "correction");
  const others = memories.filter((m) => m.kind !== "correction");
  const lines: string[] = [];
  for (const c of corrections) {
    lines.push(`  - When the user says something like "${c.key}", they have previously meant the work: "${c.value}". Prefer matching a task of that work.`);
  }
  for (const o of others) {
    lines.push(`  - ${o.kind}: "${o.key}" → "${o.value}"`);
  }
  return `
WHAT YOU'VE LEARNED ABOUT THIS USER (apply these preferences; they override generic guessing):
${lines.join("\n")}
`;
}

function buildSystemPrompt(language: string, rooms: RoomCtx[], tasks: TaskCtx[], memories: MemoryCtx[]): string {
  const langName = LANGUAGE_NAMES[language] || "English";
  const roomList = rooms.length
    ? rooms.map((r) => `  - id="${r.id}" name="${r.name}"`).join("\n")
    : "  (no rooms yet)";
  const taskList = tasks.length
    ? tasks.map((t) => {
        const cl = t.checklistItems && t.checklistItems.length
          ? ` checklist=[${t.checklistItems.map((x) => `"${x}"`).join(", ")}]`
          : "";
        return `  - id="${t.id}" title="${t.title}" status="${t.status ?? ""}"${cl}`;
      }).join("\n")
    : "  (no tasks yet)";

  return `You are the routing brain of a renovation app. You convert a user's quick, possibly
rambling field note into a list of STRUCTURED PROPOSALS — small concrete changes to their project.

You are given the project's REAL rooms and tasks. You may ONLY reference ids that appear below.
NEVER invent an id. If the note refers to something you cannot confidently map to an existing
id, emit an "unknown" proposal asking for clarification instead of guessing.

ROOMS:
${roomList}

TASKS:
${taskList}
${buildMemorySection(memories)}

Output STRICT JSON of this exact shape (no prose, no markdown):
{
  "proposals": [
    {
      "summary": "<one short human line in ${langName}>",
      "confidence": <number 0..1>,
      "action": <one of the action objects below>,
      "matchConfidence": <0..1 — for task-targeting actions (update_task/set_progress/log_time/toggle_checklist): how sure you are that taskId is the RIGHT task>,
      "candidateTaskIds": [<up to 3 existing task ids that could plausibly be meant — for task-targeting actions>]
    }
  ]
}

Allowed action objects:
- { "type": "update_task", "taskId": "<existing task id>", "changes": { "status"?: string, "title"?: string, "description"?: string, "progress"?: number } }
- { "type": "set_progress", "taskId": "<existing task id>", "progress": <0..100>, "status"?: string }
- { "type": "create_task", "roomId"?: "<existing room id>", "title": string, "description"?: string }
- { "type": "create_purchase", "roomId"?: "<existing room id>", "item": string, "quantity"?: number, "unit"?: string }
- { "type": "log_time", "taskId"?: "<existing task id>", "hours": <number>, "date"?: "YYYY-MM-DD", "description"?: string }
- { "type": "toggle_checklist", "taskId": "<existing task id>", "itemText": "<the checklist item text, taken from that task's checklist=[...]>", "completed"?: <boolean, default true> }
- { "type": "add_note", "target": "task"|"room"|"project", "targetId": "<existing id>", "text": string }
- { "type": "unknown", "rawText": "<the part you couldn't route>", "reason": "<short why, in ${langName}>" }

Rules:
- "Köket är färdigmålat" → if a painting task exists for the kitchen → set_progress 100. Otherwise update_task or unknown.
- "behöver beställa tio kvm klinker" → create_purchase { item, quantity: 10, unit: "kvm" }, roomId if a room is named.
- NEW work the user describes in an EXISTING room that has no matching task → create_task (set roomId). A new material/product to buy → create_purchase. Do NOT mark clearly-actionable new work as "unknown".
- "jobbade tre timmar i köket igår" → log_time { taskId (the matching kitchen task, set matchConfidence), hours: 3, date if stated }. If no clear task matches, log_time WITHOUT taskId (project-level time).
- "listerna är klara/monterade" → if a task has a checklist item matching that text (see checklist=[...]) → toggle_checklist { taskId, itemText: "<the matching item verbatim>", completed: true }. If it names whole-task work instead, use set_progress.
- Reserve "unknown" for input you genuinely cannot map: a place or thing that does not exist in the project, or truly unclear intent. NOT for choosing between existing tasks — that is the AMBIGUOUS case above (low-confidence proposal + candidateTaskIds).
- CRITICAL for update_task/set_progress/log_time: you MUST set matchConfidence, and BEFORE picking a task you MUST COUNT how many existing tasks match the described WORK ITSELF (the trade/activity — NOT the room; being in the same room is NOT a match):
    • 0 tasks match the work → emit "unknown", or "create_task" if it is clearly new work. NEVER mutate a loosely-related task.
    • exactly 1 task matches → pick it; matchConfidence may be high (>= 0.85) if the note is clear.
    • 2 OR MORE tasks match the SAME work and the note does NOT disambiguate (no specific room or task named) → AMBIGUOUS, even if the note sounds like a completion ("the painting is done"). Emit exactly ONE proposal for that work: the intended action type (e.g. set_progress) with taskId = the most plausible candidate, matchConfidence BELOW 0.7, and candidateTaskIds listing ALL matching task ids. NEVER emit "unknown" for this case — "unknown" hides the choices, while the low-confidence proposal with candidateTaskIds lets the app show the user a picker with the real options. Do NOT confidently pick one, and do NOT emit one confident set_progress per task to "cover them all". The user picks via the candidates.
  WRONG-match example (0 match): note = "the underfloor heating in the bathroom is done", but the only bathroom tasks are "Waterproofing" and "Tiling". Underfloor heating is neither → "unknown"/create_task, matchConfidence low. Do NOT set_progress on Waterproofing or Tiling just because they share the room.
  AMBIGUOUS example (2+ match): note = "the painting is done", tasks include BOTH "Paint living room" and "Paint bedroom", no room named → matchConfidence < 0.7, candidateTaskIds = [both ids]. Do NOT confidently complete one.
- If the note contains NO actionable instruction (pure chit-chat, mood, weather), return an EMPTY proposals array — invent nothing.
- A single note may yield MULTIPLE proposals (e.g. a progress update AND a purchase).
- Summaries MUST be written in ${langName}.
- confidence reflects how sure you are about the mapping (id match, intent). Below 0.5 the user will have to opt in manually.
- Prefer "unknown" over a WRONG guess — but an honest create_task/create_purchase for clear new work is NOT a guess, and a low-confidence proposal WITH candidateTaskIds for ambiguous-between-existing-tasks is NOT a guess either (the user gets to pick).`;
}

interface RawProposal {
  summary?: unknown;
  confidence?: unknown;
  action?: { type?: string; [k: string]: unknown };
  matchConfidence?: unknown;
  candidateTaskIds?: unknown;
}

interface NormalizedProposal {
  id: string;
  summary: string;
  confidence: number;
  action: Record<string, unknown>;
  matchConfidence?: number;
  candidates?: { id: string; title: string }[];
}

/** Validate + normalize model output against the real context. Drops/repairs unsafe proposals. */
function normalizeProposals(
  raw: RawProposal[],
  rooms: RoomCtx[],
  tasks: TaskCtx[],
): NormalizedProposal[] {
  const roomIds = new Set(rooms.map((r) => r.id));
  const taskIds = new Set(tasks.map((t) => t.id));
  const taskTitle = new Map(tasks.map((t) => [t.id, t.title]));
  const out: NormalizedProposal[] = [];

  for (const p of raw) {
    const action = p.action;
    if (!action || typeof action.type !== "string") continue;

    const summary = typeof p.summary === "string" ? p.summary : "";
    const confidence = typeof p.confidence === "number" ? Math.max(0, Math.min(1, p.confidence)) : 0.4;
    const id = crypto.randomUUID();

    const toUnknown = (reason: string) =>
      out.push({ id, summary: summary || reason, confidence: 0.2, action: { type: "unknown", rawText: JSON.stringify(action), reason } });

    switch (action.type) {
      case "update_task":
      case "set_progress": {
        if (typeof action.taskId !== "string" || !taskIds.has(action.taskId)) {
          toUnknown("Hittade ingen matchande uppgift");
          break;
        }
        const matchConfidence = typeof p.matchConfidence === "number"
          ? Math.max(0, Math.min(1, p.matchConfidence))
          : confidence;
        // Resolve candidate ids (+ the chosen task) → {id,title} for manual re-pick.
        const candIds = Array.isArray(p.candidateTaskIds)
          ? (p.candidateTaskIds as unknown[]).filter((c): c is string => typeof c === "string")
          : [];
        const candidates = [action.taskId as string, ...candIds]
          .filter((tid, i, arr) => taskIds.has(tid) && arr.indexOf(tid) === i)
          .slice(0, 4)
          .map((tid) => ({ id: tid, title: taskTitle.get(tid) ?? "" }));
        out.push({ id, summary, confidence, action: { ...action }, matchConfidence, candidates });
        break;
      }
      case "create_task": {
        if (typeof action.title !== "string" || !action.title.trim()) break;
        if (action.roomId && !roomIds.has(action.roomId as string)) delete action.roomId;
        out.push({ id, summary, confidence, action: { ...action } });
        break;
      }
      case "create_purchase": {
        if (typeof action.item !== "string" || !action.item.trim()) break;
        if (action.roomId && !roomIds.has(action.roomId as string)) delete action.roomId;
        out.push({ id, summary, confidence, action: { ...action } });
        break;
      }
      case "log_time": {
        if (typeof action.hours !== "number" || !(action.hours > 0)) break;
        let matchConfidence: number | undefined;
        let candidates: { id: string; title: string }[] | undefined;
        if (typeof action.taskId === "string") {
          if (!taskIds.has(action.taskId)) {
            delete action.taskId; // no real task match → log at project level
          } else {
            matchConfidence = typeof p.matchConfidence === "number" ? Math.max(0, Math.min(1, p.matchConfidence)) : confidence;
            const candIds = Array.isArray(p.candidateTaskIds)
              ? (p.candidateTaskIds as unknown[]).filter((c): c is string => typeof c === "string") : [];
            candidates = [action.taskId as string, ...candIds]
              .filter((tid, i, arr) => taskIds.has(tid) && arr.indexOf(tid) === i)
              .slice(0, 4).map((tid) => ({ id: tid, title: taskTitle.get(tid) ?? "" }));
          }
        }
        out.push({ id, summary, confidence, action: { ...action }, matchConfidence, candidates });
        break;
      }
      case "toggle_checklist": {
        if (typeof action.taskId !== "string" || !taskIds.has(action.taskId) ||
            typeof action.itemText !== "string" || !action.itemText.trim()) {
          toUnknown("Hittade ingen matchande checklistpunkt");
          break;
        }
        out.push({ id, summary, confidence, action: { ...action } });
        break;
      }
      case "add_note": {
        const validTarget = action.target === "task" || action.target === "room" || action.target === "project";
        const targetExists =
          action.target === "project" ||
          (action.target === "task" && taskIds.has(action.targetId as string)) ||
          (action.target === "room" && roomIds.has(action.targetId as string));
        if (!validTarget || !targetExists || typeof action.text !== "string") {
          toUnknown("Kunde inte koppla anteckningen");
          break;
        }
        out.push({ id, summary, confidence, action: { ...action } });
        break;
      }
      case "unknown": {
        out.push({ id, summary, confidence: Math.min(confidence, 0.3), action: { ...action } });
        break;
      }
      default:
        break;
    }
  }

  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  try {
    const { input, projectId, language = "en" } = await req.json();

    if (!input || typeof input.content !== "string" || !input.content.trim()) {
      return new Response(JSON.stringify({ error: "input.content is required" }), {
        status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    if (!projectId || typeof projectId !== "string") {
      return new Response(JSON.stringify({ error: "projectId is required" }), {
        status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      return new Response(JSON.stringify({ error: "OpenAI API key not configured" }), {
        status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const { rooms, tasks, memories } = await fetchContext(projectId, authHeader);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.1,
        max_tokens: 1200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildSystemPrompt(language, rooms, tasks, memories) },
          { role: "user", content: input.content },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", errorText);
      return new Response(JSON.stringify({ error: "AI API error" }), {
        status: 502, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? "{}";

    let parsed: { proposals?: RawProposal[] };
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { proposals: [] };
    }

    const proposals = normalizeProposals(
      Array.isArray(parsed.proposals) ? parsed.proposals : [],
      rooms,
      tasks,
    );

    return new Response(
      JSON.stringify({ proposals, transcript: input.content }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message || "agent-route failed" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
    );
  }
});

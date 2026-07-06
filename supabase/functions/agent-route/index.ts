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
interface MemberCtx { id: string; name: string }

// deno-lint-ignore no-explicit-any
function extractChecklistItems(checklists: any): string[] {
  if (!Array.isArray(checklists)) return [];
  return checklists.flatMap((cl) =>
    Array.isArray(cl?.items) ? cl.items.map((i: { title?: string }) => i?.title).filter((t: unknown): t is string => typeof t === "string" && t.length > 0) : [],
  );
}

/**
 * Project members = people a task can be assigned to. Mirrors TaskEditDialog's
 * two-step fetch (project_shares has no FK to profiles): shares → profile names.
 * RLS-scoped via the caller's JWT like everything else here.
 */
async function fetchMembers(projectId: string, headers: Record<string, string>): Promise<MemberCtx[]> {
  const sharesRes = await fetch(
    `${supabaseRestUrl("project_shares")}?project_id=eq.${projectId}&select=shared_with_user_id`,
    { headers },
  );
  const shares: { shared_with_user_id: string | null }[] = sharesRes.ok ? await sharesRes.json() : [];
  const profileIds = shares.map((s) => s.shared_with_user_id).filter((id): id is string => typeof id === "string" && id.length > 0);
  if (profileIds.length === 0) return [];
  const profilesRes = await fetch(
    `${supabaseRestUrl("profiles")}?id=in.(${profileIds.join(",")})&select=id,name`,
    { headers },
  );
  const profiles: { id: string; name: string | null }[] = profilesRes.ok ? await profilesRes.json() : [];
  return profiles.filter((p) => p.name).map((p) => ({ id: p.id, name: p.name as string }));
}

async function fetchContext(projectId: string, authHeader: string): Promise<{ rooms: RoomCtx[]; tasks: TaskCtx[]; memories: MemoryCtx[]; members: MemberCtx[] }> {
  const headers = supabaseRestHeaders(authHeader);
  const [roomsRes, tasksRes, memRes, members] = await Promise.all([
    fetch(
      `${supabaseRestUrl("rooms")}?project_id=eq.${projectId}&select=id,name&order=name.asc`,
      { headers },
    ),
    fetch(
      `${supabaseRestUrl("tasks")}?project_id=eq.${projectId}&select=id,title,status,checklists&order=created_at.desc&limit=200`,
      { headers },
    ),
    // Renaida's learned facts about this user (project-specific + global).
    // ONLY routing-relevant kinds: correction/phrase_map/vendor. App-layer rows
    // (kind=preference, e.g. the autonomy setting) MUST NOT reach the prompt —
    // verified 2026-07-05: an injected `preference: "autonomy" → "suggest"` row
    // flipped the model to "unknown" on ambiguous input 5/5 (killed the picker).
    // RLS scopes these to the caller's own profile automatically.
    fetch(
      `${supabaseRestUrl("renaida_user_memory")}?or=(project_id.eq.${projectId},project_id.is.null)&kind=in.(correction,phrase_map,vendor)&select=kind,key,value,evidence_count&order=evidence_count.desc&limit=40`,
      { headers },
    ),
    fetchMembers(projectId, headers),
  ]);
  const rooms = roomsRes.ok ? await roomsRes.json() : [];
  const tasksRaw = tasksRes.ok ? await tasksRes.json() : [];
  const memories: MemoryCtx[] = memRes.ok ? await memRes.json() : [];
  const tasks: TaskCtx[] = tasksRaw.map((t: { id: string; title: string; status: string | null; checklists?: unknown }) => ({
    id: t.id, title: t.title, status: t.status, checklistItems: extractChecklistItems(t.checklists),
  }));
  return { rooms, tasks, memories, members };
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

function buildSystemPrompt(language: string, rooms: RoomCtx[], tasks: TaskCtx[], memories: MemoryCtx[], members: MemberCtx[]): string {
  const langName = LANGUAGE_NAMES[language] || "English";
  const roomList = rooms.length
    ? rooms.map((r) => `  - id="${r.id}" name="${r.name}"`).join("\n")
    : "  (no rooms yet)";
  const memberList = members.length
    ? members.map((m) => `  - id="${m.id}" name="${m.name}"`).join("\n")
    : "  (no members yet)";
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

TODAY is ${new Date().toISOString().slice(0, 10)} (${["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][new Date().getUTCDay()]}). When resolving relative dates ("på fredag", "imorgon", "nästa vecka"), LOOK THEM UP in this table — do not compute them yourself:
${Array.from({ length: 14 }, (_, i) => {
  const d = new Date(Date.now() + (i + 1) * 86400000);
  return `  ${["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][d.getUTCDay()]} = ${d.toISOString().slice(0, 10)}`;
}).join("\n")}

ROOMS:
${roomList}

TASKS:
${taskList}

PROJECT MEMBERS (the only people a task can be ASSIGNED to):
${memberList}
${buildMemorySection(memories)}

Output STRICT JSON of this exact shape (no prose, no markdown):
{
  "proposals": [
    {
      "summary": "<one short human line in ${langName}>",
      "confidence": <number 0..1>,
      "action": <one of the action objects below>,
      "matchConfidence": <0..1 — for task-targeting actions (update_task/set_progress/log_time/toggle_checklist/assign_task): how sure you are that taskId is the RIGHT task>,
      "candidateTaskIds": [<up to 3 existing task ids that could plausibly be meant — for task-targeting actions>]
    }
  ]
}

Allowed action objects:
- { "type": "update_task", "taskId": "<existing task id>", "changes": { "status"?: string, "title"?: string, "description"?: string, "progress"?: number, "due_date"?: "YYYY-MM-DD", "start_date"?: "YYYY-MM-DD", "budget"?: <number>, "priority"?: "low"|"medium"|"high" } }
- { "type": "set_progress", "taskId": "<existing task id>", "progress": <0..100>, "status"?: string }
- { "type": "create_room", "name": "<room name the user said, e.g. Badrum>" }
- { "type": "create_task", "roomId"?: "<existing room id>", "roomName"?: "<room name when the room does NOT exist yet — pair with a create_room proposal>", "title": string, "description"?: string }
- { "type": "create_purchase", "roomId"?: "<existing room id>", "item": string, "quantity"?: number, "unit"?: string }
- { "type": "log_time", "taskId"?: "<existing task id>", "hours": <number>, "date"?: "YYYY-MM-DD", "description"?: string }
- { "type": "toggle_checklist", "taskId": "<existing task id>", "itemText": "<the checklist item text, taken from that task's checklist=[...]>", "completed"?: <boolean, default true> }
- { "type": "create_checklist", "taskId": "<existing task id>", "title"?: string, "items": ["<moment 1>", "<moment 2>", ...] }
- { "type": "remove_checklist_item", "taskId": "<existing task id>", "itemText": "<the checklist item to REMOVE, taken from that task's checklist=[...]>" }
- { "type": "assign_task", "taskId": "<existing task id>", "assigneeProfileId": "<existing member id from PROJECT MEMBERS>" }
- { "type": "add_note", "target": "task"|"room"|"project", "targetId": "<existing id>", "text": string }
- { "type": "unknown", "rawText": "<the part you couldn't route>", "reason": "<short why, in ${langName}>" }

Rules:
- "Köket är färdigmålat" → if a painting task exists for the kitchen → set_progress 100. Otherwise update_task or unknown.
- "behöver beställa tio kvm klinker" → create_purchase { item, quantity: 10, unit: "kvm" }, roomId if a room is named.
- NEW work the user describes in an EXISTING room that has no matching task → create_task (set roomId). A new material/product to buy → create_purchase. Do NOT mark clearly-actionable new work as "unknown".
- SCAFFOLDING (empty or sparse project): when the user names rooms that do NOT exist in ROOMS ("vi ska renovera badrummet och köket") → emit ONE create_room per named room, AND a create_task for each described work with roomName set to the new room's name (NOT roomId — it doesn't exist yet). Renovation intent for a room with no specified work → create_room + one create_task "Renovering <room>" with that roomName. This is how a brand-new project gets its structure — never answer "nothing to do" to clear renovation intent just because the project is empty.
- "jobbade tre timmar i köket igår" → log_time { taskId (the matching kitchen task, set matchConfidence), hours: 3, date if stated }. If no clear task matches, log_time WITHOUT taskId (project-level time).
- "listerna är klara/monterade" → if a task has a checklist item matching that text (see checklist=[...]) → toggle_checklist { taskId, itemText: "<the matching item verbatim>", completed: true }. If it names whole-task work instead, use set_progress.
- CHECKLIST AUTHORING: "skapa en checklista på kakelsättningen: primer, tätskikt, kakel, foga" → ONE create_checklist { taskId, items: ["Primer", "Tätskikt", "Kakel", "Foga"] }. Adding single items ("lägg till en punkt…") is ALSO create_checklist (the app appends) — but when the task ALREADY has checklist items (see checklist=[...]), phrase the summary as adding a point ("Lägger till punkten X i …"), NOT as creating a list. Any request to break a task into steps/moments → create_checklist (NEVER toggle_checklist — toggling only ticks items that already exist in checklist=[...]).
- REMOVING a checklist item ("ta bort punkten primer") → remove_checklist_item { taskId, itemText } — NOT toggle_checklist (unticking is not removing). Unticking ("bocka ur", "var inte klar ändå") → toggle_checklist { completed: false }.
- PLANNING FIELDS on an existing task → update_task with the matching change (resolve relative dates using TODAY below):
    "sätt deadline på fredag för kakelsättningen" → { "changes": { "due_date": "<next Friday as YYYY-MM-DD>" } }
    "målningen ska börja på måndag" → { "changes": { "start_date": "<next Monday>" } }
    "höj budgeten för golvslipningen till 15000" → { "changes": { "budget": 15000 } }
    "sätt hög prioritet på kakelsättningen" → { "changes": { "priority": "high" } }
    "ta bort deadlinen på kakelsättningen" → { "changes": { "due_date": null } } — null CLEARS a field (works for due_date/start_date/budget). Clearing is a normal update_task, never "unknown".
- ASSIGNMENT to a PERSON: "tilldela målningen till <namn>", "säg åt <namn> att <göra jobbet>", "<namn> ska göra <jobbet>", "ge <namn> uppgiften <jobbet>" → assign_task { taskId, assigneeProfileId } ONLY when <namn> fuzzy-matches the name of a PROJECT MEMBER above (first name alone or small spelling/inflection differences are fine). Pick the task whose work matches the described job, and set matchConfidence + candidateTaskIds like other task-targeting actions. If the named person does NOT match any member — or PROJECT MEMBERS is empty — this is a WORK INSTRUCTION instead: add_note on the matching task (see below). NEVER invent a member id, and NEVER assign to a member whose name was not said.
    Example: PROJECT MEMBERS has name="Ahmed Hassan" and the note is "säg åt Ahmed att fixa eluttagen" → assign_task { taskId: <the electrical task's id>, assigneeProfileId: <Ahmed's member id> } — NOT add_note. Always check PROJECT MEMBERS for the named person BEFORE falling back to add_note.
    Counter-example: "säg åt målaren att taket ska ha två strykningar" — "målaren" is a TRADE WORD, not a member's name → add_note on the painting task, NOT assign_task. NEVER guess which member a trade word refers to; only an explicitly said member name triggers assign_task.
- WORK INSTRUCTIONS: phrasings like "säg åt/till <yrkesperson> att …", "påminn <någon> att …", "viktigt: …", "<yrkesperson> behöver veta att …", "notera att …" are instructions to be SAVED → add_note. BUT FIRST: if the person named after "säg åt/påminn/…" matches a PROJECT MEMBER name → this is an ASSIGNMENT → emit assign_task (see above), NOT add_note. add_note is only for trade words (målaren, snickaren, elektrikern) and people who are NOT in PROJECT MEMBERS. Target the task whose work matches the trade/activity mentioned (målaren → painting task); if the instruction names a ROOM as its subject ("instruktionerna för badrummet") → target that room; if neither is clear → target "project" with the project id. NEVER return an empty proposals array for a clear instruction — a saved note is always better than losing it.
- Reserve "unknown" for input you genuinely cannot map: a place or thing that does not exist in the project, or truly unclear intent. NOT for choosing between existing tasks — that is the AMBIGUOUS case above (low-confidence proposal + candidateTaskIds).
- CRITICAL for update_task/set_progress/log_time/assign_task: you MUST set matchConfidence, and BEFORE picking a task you MUST COUNT how many existing tasks match the described WORK ITSELF (the trade/activity — NOT the room; being in the same room is NOT a match):
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

/**
 * Deterministic same-trade ambiguity guard (defense in depth, 2026-07-05).
 * The model sometimes confidently picks ONE of several same-trade tasks
 * ("Måla kök" vs "Måla hall") on input that names no distinguishing word —
 * prompt rules alone are not reliably followed. So we enforce the picker
 * server-side: if the chosen task shares its leading work-word with other
 * OPEN tasks, and the user's text doesn't mention anything that singles the
 * chosen one out, cap matchConfidence below the confident threshold and make
 * sure the siblings are offered as candidates.
 */
function sameTradeGuard(
  chosenId: string,
  matchConfidence: number,
  candidates: { id: string; title: string }[],
  tasks: TaskCtx[],
  inputText: string,
): { matchConfidence: number; candidates: { id: string; title: string }[] } {
  const chosen = tasks.find((t) => t.id === chosenId);
  if (!chosen) return { matchConfidence, candidates };
  const firstWord = chosen.title.trim().toLowerCase().split(/\s+/)[0] ?? "";
  if (firstWord.length < 4) return { matchConfidence, candidates };

  const siblings = tasks.filter((t) =>
    t.id !== chosenId &&
    t.status !== "completed" &&
    (t.title.trim().toLowerCase().split(/\s+/)[0] ?? "") === firstWord
  );
  if (siblings.length === 0) return { matchConfidence, candidates };

  // Does the input single the chosen task out? (its distinguishing title words,
  // e.g. "kök" in "Måla kök" — substring match covers Swedish definite forms
  // like "köket"/"hallen")
  const input = inputText.toLowerCase();
  const distinguishing = chosen.title.trim().toLowerCase().split(/\s+/).slice(1).filter((w) => w.length >= 3);
  if (distinguishing.some((w) => input.includes(w))) return { matchConfidence, candidates };

  const merged = [...candidates];
  for (const s of siblings) {
    if (!merged.some((c) => c.id === s.id)) merged.push({ id: s.id, title: s.title });
  }
  return { matchConfidence: Math.min(matchConfidence, 0.6), candidates: merged.slice(0, 4) };
}

/** Validate + normalize model output against the real context. Drops/repairs unsafe proposals. */
function normalizeProposals(
  raw: RawProposal[],
  rooms: RoomCtx[],
  tasks: TaskCtx[],
  members: MemberCtx[],
  inputText: string,
): NormalizedProposal[] {
  const roomIds = new Set(rooms.map((r) => r.id));
  const taskIds = new Set(tasks.map((t) => t.id));
  const taskTitle = new Map(tasks.map((t) => [t.id, t.title]));
  const memberById = new Map(members.map((m) => [m.id, m]));
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
        const rawMatchConfidence = typeof p.matchConfidence === "number"
          ? Math.max(0, Math.min(1, p.matchConfidence))
          : confidence;
        // Resolve candidate ids (+ the chosen task) → {id,title} for manual re-pick.
        const candIds = Array.isArray(p.candidateTaskIds)
          ? (p.candidateTaskIds as unknown[]).filter((c): c is string => typeof c === "string")
          : [];
        const rawCandidates = [action.taskId as string, ...candIds]
          .filter((tid, i, arr) => taskIds.has(tid) && arr.indexOf(tid) === i)
          .slice(0, 4)
          .map((tid) => ({ id: tid, title: taskTitle.get(tid) ?? "" }));
        const { matchConfidence, candidates } = sameTradeGuard(
          action.taskId as string, rawMatchConfidence, rawCandidates, tasks, inputText,
        );
        // Whitelist + type-check update_task changes so a malformed field can
        // never reach the tasks UPDATE.
        if (action.type === "update_task" && action.changes && typeof action.changes === "object") {
          const raw = action.changes as Record<string, unknown>;
          const clean: Record<string, unknown> = {};
          if (typeof raw.title === "string" && raw.title.trim()) clean.title = raw.title.trim();
          if (typeof raw.description === "string") clean.description = raw.description;
          if (typeof raw.status === "string" && raw.status.trim()) clean.status = raw.status.trim();
          if (typeof raw.progress === "number") clean.progress = Math.max(0, Math.min(100, raw.progress));
          if (raw.due_date === null || (typeof raw.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.due_date))) clean.due_date = raw.due_date;
          if (raw.start_date === null || (typeof raw.start_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.start_date))) clean.start_date = raw.start_date;
          if (raw.budget === null || (typeof raw.budget === "number" && raw.budget >= 0)) clean.budget = raw.budget;
          if (raw.priority === "low" || raw.priority === "medium" || raw.priority === "high") clean.priority = raw.priority;
          if (Object.keys(clean).length === 0) {
            toUnknown("Ingen giltig ändring att göra");
            break;
          }
          action.changes = clean;
        }
        out.push({ id, summary, confidence, action: { ...action }, matchConfidence, candidates });
        break;
      }
      case "create_room": {
        if (typeof action.name !== "string" || !action.name.trim()) break;
        // Dedupe: if a room with this name already exists, the create is a no-op
        // (create_task proposals should reference the existing roomId instead).
        const nameLower = (action.name as string).trim().toLowerCase();
        if (rooms.some((r) => r.name.trim().toLowerCase() === nameLower)) break;
        out.push({ id, summary, confidence, action: { type: "create_room", name: (action.name as string).trim() } });
        break;
      }
      case "create_task": {
        if (typeof action.title !== "string" || !action.title.trim()) break;
        if (action.roomId && !roomIds.has(action.roomId as string)) delete action.roomId;
        // roomName is only meaningful when the room doesn't exist yet. If it DOES
        // exist → convert to roomId; otherwise pass through for batch-resolution
        // against create_room proposals at apply time.
        if (typeof action.roomName === "string" && action.roomName.trim()) {
          const rnLower = (action.roomName as string).trim().toLowerCase();
          const existing = rooms.find((r) => r.name.trim().toLowerCase() === rnLower);
          if (existing) {
            action.roomId = existing.id;
            delete action.roomName;
          } else {
            action.roomName = (action.roomName as string).trim();
          }
        } else {
          delete action.roomName;
        }
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
      case "assign_task": {
        if (typeof action.taskId !== "string" || !taskIds.has(action.taskId)) {
          toUnknown("Hittade ingen matchande uppgift");
          break;
        }
        // Deterministic member guard: never trust the model with member ids.
        // An assignee that isn't a real project member downgrades to add_note
        // (a saved instruction — today's behavior for unmatched names).
        const member = typeof action.assigneeProfileId === "string"
          ? memberById.get(action.assigneeProfileId)
          : undefined;
        if (!member) {
          out.push({
            id, summary, confidence,
            action: { type: "add_note", target: "task", targetId: action.taskId, text: inputText },
          });
          break;
        }
        const rawMatchConfidence = typeof p.matchConfidence === "number"
          ? Math.max(0, Math.min(1, p.matchConfidence))
          : confidence;
        const candIds = Array.isArray(p.candidateTaskIds)
          ? (p.candidateTaskIds as unknown[]).filter((c): c is string => typeof c === "string")
          : [];
        const rawCandidates = [action.taskId as string, ...candIds]
          .filter((tid, i, arr) => taskIds.has(tid) && arr.indexOf(tid) === i)
          .slice(0, 4)
          .map((tid) => ({ id: tid, title: taskTitle.get(tid) ?? "" }));
        const { matchConfidence, candidates } = sameTradeGuard(
          action.taskId as string, rawMatchConfidence, rawCandidates, tasks, inputText,
        );
        out.push({
          id, summary, confidence,
          action: { type: "assign_task", taskId: action.taskId, assigneeProfileId: member.id, assigneeName: member.name },
          matchConfidence, candidates,
        });
        break;
      }
      case "toggle_checklist":
      case "remove_checklist_item": {
        if (typeof action.taskId !== "string" || !taskIds.has(action.taskId) ||
            typeof action.itemText !== "string" || !action.itemText.trim()) {
          toUnknown("Hittade ingen matchande checklistpunkt");
          break;
        }
        out.push({ id, summary, confidence, action: { ...action } });
        break;
      }
      case "create_checklist": {
        const items = Array.isArray(action.items)
          ? (action.items as unknown[]).filter((it): it is string => typeof it === "string" && it.trim().length > 0)
              .map((it) => it.trim()).slice(0, 20)
          : [];
        if (typeof action.taskId !== "string" || !taskIds.has(action.taskId) || items.length === 0) {
          toUnknown("Kunde inte koppla checklistan till ett arbete");
          break;
        }
        out.push({ id, summary, confidence, action: { type: "create_checklist", taskId: action.taskId, title: typeof action.title === "string" ? action.title : undefined, items } });
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
    const { input, projectId, language: rawLanguage = "en" } = await req.json();
    // Browser-detected codes arrive as region variants ("sv-SE") — normalize so
    // the LANGUAGE_NAMES lookup doesn't silently fall back to English.
    const language = String(rawLanguage).slice(0, 2);

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

    const { rooms, tasks, memories, members } = await fetchContext(projectId, authHeader);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.1,
        max_tokens: 1200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildSystemPrompt(language, rooms, tasks, memories, members) },
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
      members,
      input.content,
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

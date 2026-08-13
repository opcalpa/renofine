import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * renaida-critic — the Fas C+ "missing-something" critic for the Renaida
 * project-creation flow. ONE LLM pass over the fully-merged draft that flags
 * what the user FORGOT ("totalrenovering utan rivning?", "badrum utan
 * tätskikt?") — genuinely missing prerequisites/safety items only, never
 * comfort extras (renaida-suggest owns those).
 *
 * Fail-open by design: any failure (or a clean plan) returns { flags: [] } and
 * the client silently skips the step, so the birth flow never blocks on this.
 */

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5002",
  "http://localhost:3000",
  "https://app.renofine.com",
  "https://renofine.com",
];

const RATE_LIMIT_SCOPE = "renaida-critic";
const RATE_LIMIT_MAX = 40;
const RATE_LIMIT_WINDOW_MINUTES = 60;

const VALID_WORK_TYPES = [
  "rivning", "el", "vvs", "kakel", "snickeri", "malning",
  "golv", "kok", "badrum", "fonster_dorrar", "fasad",
  "tak", "tradgard", "annat",
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

function jsonResponse(data: unknown, status: number, req: Request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function getClientFingerprint(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf;
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}

function supabaseRestHeaders() {
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

function supabaseRestUrl(path: string): string {
  return `${Deno.env.get("SUPABASE_URL")!}/rest/v1/${path}`;
}

async function checkRateLimit(fingerprint: string): Promise<{ allowed: boolean; count: number }> {
  try {
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString();
    const params = new URLSearchParams({
      select: "id",
      scope: `eq.${RATE_LIMIT_SCOPE}`,
      fingerprint: `eq.${fingerprint}`,
      created_at: `gte.${since}`,
    });
    const countRes = await fetch(`${supabaseRestUrl("edge_rate_limits")}?${params}`, {
      headers: { ...supabaseRestHeaders(), Prefer: "count=exact" },
    });
    if (!countRes.ok) return { allowed: true, count: 0 };
    const range = countRes.headers.get("content-range") || "";
    const count = parseInt(range.split("/")[1] || "0", 10) || 0;
    if (count >= RATE_LIMIT_MAX) return { allowed: false, count };
    fetch(supabaseRestUrl("edge_rate_limits"), {
      method: "POST",
      headers: supabaseRestHeaders(),
      body: JSON.stringify({ fingerprint, scope: RATE_LIMIT_SCOPE }),
    }).catch((e) => console.error("rate-limit insert failed:", e));
    return { allowed: true, count: count + 1 };
  } catch (err) {
    console.error("checkRateLimit failed (failing open):", err);
    return { allowed: true, count: 0 };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  try {
    const fingerprint = getClientFingerprint(req);
    const rl = await checkRateLimit(fingerprint);
    if (!rl.allowed) {
      return jsonResponse({ error: "Rate limit exceeded", flags: [] }, 429, req);
    }

    const { projectType, rooms = [], tasks = [], language, userType } = await req.json();
    const lang = (language || "sv").slice(0, 2);
    const roomList: Array<{ name: string; areaSqm?: number | null }> = Array.isArray(rooms)
      ? rooms.filter((r: unknown) => r && typeof (r as Record<string, unknown>).name === "string")
      : [];
    const taskList: Array<{ workType: string; roomName?: string | null; title?: string | null }> =
      Array.isArray(tasks)
        ? tasks.filter((t: unknown) => t && typeof (t as Record<string, unknown>).workType === "string")
        : [];
    if (taskList.length === 0) {
      return jsonResponse({ flags: [] }, 200, req);
    }

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      // No key configured → the client silently skips the critic step.
      return jsonResponse({ flags: [] }, 200, req);
    }

    const roleLine =
      userType === "contractor"
        ? "The user is a building professional preparing a job/quote. Flag missing items a pro would be embarrassed to have forgotten in front of a client (demolition/waste before rebuilds, waterproofing/tätskikt in wet rooms, ventilation, electrical safety work)."
        : "The user is a homeowner planning their own renovation. Flag missing items a professional would warn them about — things that cause water damage, failed inspections or redone work if skipped.";

    const roomDesc = roomList
      .map((r) => (r.areaSqm ? `${r.name} (${r.areaSqm} m²)` : r.name))
      .join(", ");
    const taskDesc = taskList
      .map((t) => `${t.title || t.workType}${t.roomName ? ` [${t.roomName}]` : ""}`)
      .join("; ");

    const systemPrompt = `You are Renaida, an expert Swedish renovation reviewer doing ONE final check of a renovation plan before it is created.
Your ONLY job: flag genuinely MISSING critical work — prerequisites, safety items, or steps that professionals know are required but laypeople forget. ${roleLine}

Project type: ${projectType || "unknown"}
Room(s): ${roomDesc || "unspecified"}
Planned work: ${taskDesc}

Decision procedure — follow it strictly:
1. Everything in "Planned work" is COVERED: each item covers its work type AND its meaning, including synonyms (a listed "Tätskikt" covers waterproofing/fuktspärr; a listed "el" work type covers electrical work; "rivning" covers demolition).
2. A flag is valid ONLY if BOTH hold: (a) skipping it risks water damage, a failed inspection, or redone work; (b) neither its meaning nor any synonym of it appears in the planned work.
3. If no valid flag remains, return an empty list — an empty list is a GOOD answer for a well-planned project.

Examples:
- Planned work only "kakel [Badrum]" (wet room) → flag waterproofing/tätskikt (tiling a wet room without it is a critical miss).
- Planned work "rivning; vvs; el; kakel; malning; golv; Tätskikt [Badrum]" → return { "flags": [] } (demolition, plumbing, electrical, waterproofing all covered — do NOT flag fuktspärr, elinstallationer or other synonyms of covered items).
- Full kitchen renovation with no "rivning" → flag demolition.

Never suggest comfort extras, upgrades or nice-to-haves. Max 3 flags.
Both "label" and "reason" MUST be written in the language "${lang}" — never in English unless ${lang} is "en".
- Each flag maps to EXACTLY ONE work type from: ${VALID_WORK_TYPES.join(", ")}
- "roomName" MUST be one of the room names above when the flag concerns a specific room, else omit it.
- "label" = the missing item, SHORT (1–4 words), in ${lang}. "reason" = one short sentence (max ~12 words) in ${lang} explaining why it matters.

Return valid JSON only, no markdown:
{ "flags": [ { "label": "<missing item in ${lang}>", "workType": "<one valid work type>", "roomName": "<optional room name>", "reason": "<short why in ${lang}>" } ] }`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        // Premium tier on purpose (model-tiering): the critic is an expert-
        // judgment moment — mini models both re-flag covered work (synonyms)
        // and miss real gaps. ONE call per project birth ≈ negligible cost.
        model: "gpt-4o",
        temperature: 0.1,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Review the plan. What critical work is missing?" },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      console.error("OpenAI error:", await response.text());
      return jsonResponse({ flags: [] }, 200, req);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return jsonResponse({ flags: [] }, 200, req);

    const parsed = JSON.parse(content);
    const knownRooms = new Set(roomList.map((r) => r.name.toLowerCase()));
    const seenLabels = new Set<string>();
    const flags = (parsed.flags || [])
      .filter((f: Record<string, unknown>) => f && typeof f.label === "string" && typeof f.workType === "string")
      .map((f: Record<string, unknown>) => ({
        label: String(f.label).trim().slice(0, 60),
        workType: String(f.workType),
        roomName:
          typeof f.roomName === "string" && knownRooms.has(f.roomName.trim().toLowerCase())
            ? f.roomName.trim()
            : null,
        reason: typeof f.reason === "string" ? f.reason.trim().slice(0, 140) : undefined,
      }))
      .filter((f: { label: string; workType: string }) => {
        if (!f.label || !VALID_WORK_TYPES.includes(f.workType)) return false;
        const key = f.label.toLowerCase();
        if (seenLabels.has(key)) return false;
        seenLabels.add(key);
        return true;
      })
      .slice(0, 3);

    return jsonResponse({ flags }, 200, req);
  } catch (err) {
    console.error("renaida-critic error:", err);
    return jsonResponse({ flags: [] }, 200, req);
  }
});

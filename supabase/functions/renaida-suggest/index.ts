import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * renaida-suggest — LLM-generated "smart add-on" suggestions for the Renaida
 * project-creation flow. Given the project type + the work already chosen, it
 * proposes a few commonly-forgotten add-ons the user might want, each mapped to
 * one valid work type, with labels in the user's language.
 *
 * The client (renaidaProjectIntake.fetchAddonSuggestions) falls back to a
 * curated deterministic list when this returns nothing, so the flow always
 * works even if the function is unavailable.
 */

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5002",
  "http://localhost:3000",
  "https://app.renofine.com",
  "https://renofine.com",
];

const RATE_LIMIT_SCOPE = "renaida-suggest";
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
      return jsonResponse({ error: "Rate limit exceeded", suggestions: [] }, 429, req);
    }

    const { projectType, rooms = [], existingWorkTypes = [], language, userType } = await req.json();
    const lang = (language || "sv").slice(0, 2);
    const roomList = Array.isArray(rooms) ? rooms.filter((r: unknown) => typeof r === "string") : [];
    const existing: string[] = Array.isArray(existingWorkTypes)
      ? existingWorkTypes.filter((w: unknown) => typeof w === "string")
      : [];

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      // No key configured → let the client use its deterministic fallback.
      return jsonResponse({ suggestions: [] }, 200, req);
    }

    const roleLine =
      userType === "contractor"
        ? "The user is a building professional creating a project for a client. Prefer add-ons a PRO quotes but clients forget: site setup/establishment, demolition & waste removal, scaffolding, construction cleaning, protective covering — plus tasteful trade extras. Map overhead items to the 'annat' work type."
        : "The user is a homeowner planning their own renovation. Prefer tasteful comfort/finish extras (underfloor heating, heated towel rail, shower niche, spotlights).";

    const systemPrompt = `You are Renaida, a helpful renovation planning assistant.
Given a renovation project, suggest 3–5 commonly-forgotten ADD-ONS the user might also want — the kind of thing pros remind clients about. ${roleLine}

Project type: ${projectType || "unknown"}
Room(s): ${roomList.join(", ") || "unspecified"}
Work already chosen (work types): ${existing.join(", ") || "none"}

Rules:
- Each suggestion maps to EXACTLY ONE valid work type from: ${VALID_WORK_TYPES.join(", ")}
- Prefer add-ons whose work type is NOT already chosen, but a relevant add-on with an existing work type is fine.
- Keep labels SHORT (1–3 words), concrete, in ${lang}. Examples: underfloor heating, heated towel rail, shower niche, spotlights, kitchen island, dishwasher.
- Do not suggest the main renovation itself — only tasteful extras.

Return valid JSON only, no markdown:
{ "suggestions": [ { "label": "<short label in ${lang}>", "workType": "<one valid work type>" } ] }`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.5,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Suggest the add-ons." },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      console.error("OpenAI error:", await response.text());
      return jsonResponse({ suggestions: [] }, 200, req);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return jsonResponse({ suggestions: [] }, 200, req);

    const parsed = JSON.parse(content);
    const seenWt = new Set<string>();
    const suggestions = (parsed.suggestions || [])
      .filter((s: Record<string, unknown>) => s && typeof s.label === "string" && typeof s.workType === "string")
      .map((s: Record<string, unknown>) => ({
        label: String(s.label).trim().slice(0, 40),
        workType: String(s.workType),
      }))
      .filter((s: { label: string; workType: string }) => {
        if (!s.label || !VALID_WORK_TYPES.includes(s.workType)) return false;
        if (seenWt.has(s.workType)) return false; // one add-on per work type
        seenWt.add(s.workType);
        return true;
      })
      .slice(0, 6);

    return jsonResponse({ suggestions }, 200, req);
  } catch (err) {
    console.error("renaida-suggest error:", err);
    return jsonResponse({ suggestions: [] }, 200, req);
  }
});

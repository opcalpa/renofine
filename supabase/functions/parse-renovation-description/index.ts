import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5002",
  "http://localhost:3000",
  "https://app.renofine.com",
  "https://renofine.com",
];

// Rate-limit config: max RATE_LIMIT_MAX calls per fingerprint within the window.
// Tuned for guest-mode wizard usage (a person tries 2-5 times) plus headroom.
const RATE_LIMIT_SCOPE = "parse-renovation-description";
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MINUTES = 60;

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
  // Cloudflare → cf-connecting-ip; Supabase Edge Functions in Fly → x-real-ip;
  // generic chained proxy → first IP in x-forwarded-for. Fall back to "unknown"
  // (which acts as a shared bucket — still better than no limit at all).
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

/**
 * Returns true if the request is allowed (under the cap), false if it should be rejected.
 * On any internal error, returns true ("fail open") — we'd rather serve a request than
 * block legitimate users due to a transient DB hiccup.
 */
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

    // Record this call (fire-and-forget — don't block on the insert)
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

const VALID_ROOMS = [
  "kitchen", "bathroom", "livingRoom", "bedroom", "wcShower",
  "laundry", "hallway", "office", "kidsRoom", "balcony",
  "basement", "attic", "garage", "patio",
];

const VALID_WORK_TYPES = [
  "rivning", "el", "vvs", "kakel", "snickeri", "malning",
  "golv", "kok", "badrum", "fonster_dorrar", "fasad",
  "tak", "tradgard", "annat",
];

const ROOM_NAME_MAP: Record<string, string> = {
  kitchen: "Kök", bathroom: "Badrum", livingRoom: "Vardagsrum",
  bedroom: "Sovrum", wcShower: "WC/Dusch", laundry: "Tvättstuga",
  hallway: "Hall", office: "Kontor", kidsRoom: "Barnrum",
  balcony: "Balkong", basement: "Källare", attic: "Vind",
  garage: "Garage", patio: "Uteplats",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  try {
    // Rate-limit before parsing the body — cheap rejection for hammering callers.
    const fingerprint = getClientFingerprint(req);
    const rl = await checkRateLimit(fingerprint);
    if (!rl.allowed) {
      return jsonResponse(
        {
          error: "Rate limit exceeded",
          message: `Too many requests. Limit is ${RATE_LIMIT_MAX} per ${RATE_LIMIT_WINDOW_MINUTES} minutes.`,
        },
        429,
        req
      );
    }

    const { description, language } = await req.json();

    if (!description || typeof description !== "string") {
      return jsonResponse({ error: "description is required" }, 400, req);
    }

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      return jsonResponse({ error: "OpenAI API key not configured" }, 500, req);
    }

    const lang = language || "sv";

    const systemPrompt = `You are a renovation planning assistant. Parse the user's free-text renovation description and extract structured data.

Return JSON with this exact structure:
{
  "propertyType": "<one of: apartment, villa, townhouse, summerhouse, other>" or null,
  "floors": <integer number of floors> or null,
  "totalAreaSqm": <total living area in m²> or null,
  "rooms": [
    {
      "nameKey": "<one of the valid room keys>",
      "name": "<display name in ${lang}>",
      "suggestedWorkTypes": ["<valid work types>"],
      "taskTitles": { "<workType>": "<specific task title using user's own words>" }
    }
  ],
  "otherSpaces": [
    { "nameKey": "<one of the valid room keys>", "name": "<display name in ${lang}>" }
  ],
  "globalWorkTypes": ["<work types that apply to ALL rooms>"],
  "globalTaskTitles": { "<workType>": "<specific task title for this global work>" },
  "summary": "<one sentence summary>"
}

Valid room keys: ${VALID_ROOMS.join(", ")}
Room display names (Swedish): ${Object.entries(ROOM_NAME_MAP).map(([k, v]) => `${k}=${v}`).join(", ")}

Valid work types: ${VALID_WORK_TYPES.join(", ")}
Work type meanings: rivning=demolition, el=electrical, vvs=plumbing, kakel=tiling, snickeri=carpentry, malning=painting, golv=flooring, kok=kitchen installation, badrum=bathroom installation, fonster_dorrar=windows/doors, fasad=facade, tak=roofing, tradgard=landscaping, annat=other

GRANULARITY: Prefer the granular work types (rivning, el, vvs, kakel, snickeri, malning, golv, fonster_dorrar) over the categorical rollups (kok, badrum, fasad, tak, tradgard, annat). For example, "renovera köket med nytt kök från IKEA" should produce ["rivning", "snickeri", "el"] — NOT ["kok"]. Use kok/badrum/etc. only if no granular type fits.

Object-level extraction rules:
- propertyType: detect from words like "lägenhet" or "trea/tvåa/etta/femma" (apartment), "villa" (villa), "radhus" (townhouse), "fritidshus" (summerhouse). Return null if not clear.
- floors: detect from "2 plan", "två våningar", etc. Return null if not mentioned.
- totalAreaSqm: detect from "180 kvm", "100 m²", "ca 75 kvadratmeter", "trea på 78 kvm". Return null if not mentioned.

Room rules:
- "rooms" array: include ONLY rooms where the user proposes or implies specific work. Each must have at least one entry in suggestedWorkTypes.
- "otherSpaces" array: include rooms the user MENTIONS or that are typically PART of the property but for which NO specific work is proposed. Examples: "hall", "korridor", "klädkammare", "tvättstuga", "garderob". Detect these from the text — do not invent rooms not implied by the user.
- Map rooms to the closest valid nameKey. If "sovrum" mentioned, use "bedroom". If "toalett" or "gästtoalett", use "wcShower". If "matsal", use "livingRoom".
- A room only appears in ONE of "rooms" or "otherSpaces" — never both.

CONSISTENCY for enumerated rooms — CRITICAL:
- If the user mentions MULTIPLE rooms of the same type (e.g. "2 barnrum", "3 sovrum", "båda badrummen"), create SEPARATE entries for each with numbered names ("Barnrum 1", "Barnrum 2").
- When multiple rooms are listed together with shared work in ONE sentence (e.g. "Vardagsrum och två sovrum: riva tapeter, måla, lägga parkett"), apply the EXACT SAME suggestedWorkTypes AND taskTitles to ALL of them. Do not be selective. If you list 3 rooms with shared work, all 3 must have identical workType lists.

UNIVERSAL signals — apply broadly (be CONSERVATIVE):
- ONLY put a work type in globalWorkTypes if the user EXPLICITLY says it happens in EVERY room. Trigger phrases: "i hela lägenheten/villan", "överallt", "alla rum", "varje rum", "samtliga rum".
- Example (correct global): "Lägga nytt parkettgolv i hela lägenheten" → globalWorkTypes includes "golv". DO NOT also list "golv" per room.
- ⚠️ DO NOT put a work type in globalWorkTypes just because the user describes a generic contractor scope or trade-skill need. Sentences like "Vi söker en totalentreprenad som kan hålla i allt (snickeri, måleri, el)" describe which TRADES are needed, not that all those works happen in every room. Those work types should be per-room based on where the user actually described the work.
- Default to per-room. Only escalate to global when the user truly means "everywhere".

Work-type triggers — be aggressive about detecting:
- "rivning": when user mentions "riva", "borttagning", "demontera", "plocka bort", "skala av" (existing surfaces or installations).
- "golv": when user mentions "parkett", "plastmatta", "heltäckningsmatta", "klinker på golv", "laminat", "slipa", or any flooring change.
- "malning": when user mentions "måla", "bredspackla", "tapetsera", "spackla väggar", "rolla".
- "el": when user mentions "eluttag", "spotlights", "ny belysning", "vitvaror" (installation), "dimmer", "flytta el".
- "vvs": when user mentions "blandare", "diskho", "kran", "rör", "avlopp", "wc-stol".
- "snickeri": when user mentions "garderob", "bänkskiva", "montera", "bygga in", "skåp", "list", "tröskel".
- "kakel": when user mentions "kakel på vägg" specifically (NOT "klinker på golv" — that's "golv").
- "fonster_dorrar": when user mentions "fönster", "dörrar" (replace or add).

TASK TITLES — write specific, action-oriented titles using the user's own words:
- For EACH (room × workType) intersection, generate a taskTitle in the room's taskTitles map.
- For EACH globalWorkType, generate a globalTaskTitles entry.
- Titles should be 2-8 words, start with a verb when possible, in ${lang}.
- ⚠️ FOCUS ON THE MAIN ACTION, NOT PREP OR PARENTHETICALS. If a sentence has a main clause and a parenthetical (e.g. "Lägga nytt parkettgolv i hela lägenheten (borttagning av gammal plastmatta i hallen)"), the title for globalTaskTitles.golv should describe the MAIN action ("Lägga nytt parkettgolv i hela lägenheten") — NOT the parenthetical prep work. Prep work belongs in its own per-room task only if explicitly distinct.
- Use the user's specific language. Examples:
  - Kök + rivning: "Riva befintligt kök" (NOT "Rivning - Kök")
  - Kök + snickeri: "Montera nytt IKEA-kök"
  - Kök + el: "Flytta eluttag och installera vitvaror"
  - Hall + rivning: "Riva gammal plastmatta"
  - Hall + snickeri: "Bygga garderobslösning"
  - Hall + el: "Sätta upp spotlights i taket"
  - Vardagsrum + malning: "Riva tapeter, bredspackla och måla"
  - Global golv: "Lägga nytt parkettgolv i hela lägenheten"
  - Global malning: "Bredspackla och måla väggar och tak"
- If you can't find specific user-provided detail for a particular intersection, OMIT the title (we fall back to a generic name).

Return valid JSON only, no markdown.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: description },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI error:", errorText);
      return jsonResponse({ error: "AI service error" }, 502, req);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return jsonResponse({ error: "Empty AI response" }, 502, req);
    }

    const parsed = JSON.parse(content);

    // Validate and filter to valid values
    function sanitizeTaskTitles(raw: unknown, allowedWorkTypes: string[]): Record<string, string> {
      if (!raw || typeof raw !== "object") return {};
      const out: Record<string, string> = {};
      Object.entries(raw as Record<string, unknown>).forEach(([k, v]) => {
        if (!VALID_WORK_TYPES.includes(k)) return;
        if (allowedWorkTypes.length > 0 && !allowedWorkTypes.includes(k)) return;
        if (typeof v !== "string") return;
        const trimmed = v.trim().slice(0, 100);
        if (trimmed.length === 0) return;
        out[k] = trimmed;
      });
      return out;
    }

    const validatedRooms = (parsed.rooms || []).map((r: Record<string, unknown>) => {
      const workTypes = ((r.suggestedWorkTypes as string[]) || []).filter((wt: string) =>
        VALID_WORK_TYPES.includes(wt)
      );
      return {
        nameKey: VALID_ROOMS.includes(r.nameKey as string) ? r.nameKey : "annat",
        name: r.name || ROOM_NAME_MAP[r.nameKey as string] || r.nameKey,
        suggestedWorkTypes: workTypes,
        taskTitles: sanitizeTaskTitles(r.taskTitles, workTypes),
      };
    });

    const validatedOtherSpaces = (parsed.otherSpaces || []).map((r: Record<string, unknown>) => ({
      nameKey: VALID_ROOMS.includes(r.nameKey as string) ? r.nameKey : "annat",
      name: r.name || ROOM_NAME_MAP[r.nameKey as string] || r.nameKey,
    }));

    const validatedGlobals = ((parsed.globalWorkTypes as string[]) || []).filter((wt: string) =>
      VALID_WORK_TYPES.includes(wt)
    );

    const validatedGlobalTaskTitles = sanitizeTaskTitles(parsed.globalTaskTitles, validatedGlobals);

    const VALID_PROPERTY_TYPES = ["apartment", "villa", "townhouse", "summerhouse", "other"];
    const propertyType =
      typeof parsed.propertyType === "string" && VALID_PROPERTY_TYPES.includes(parsed.propertyType)
        ? parsed.propertyType
        : null;

    const floors =
      typeof parsed.floors === "number" && parsed.floors > 0 && parsed.floors < 10
        ? Math.round(parsed.floors)
        : null;

    const totalAreaSqm =
      typeof parsed.totalAreaSqm === "number" && parsed.totalAreaSqm > 0 && parsed.totalAreaSqm < 5000
        ? Math.round(parsed.totalAreaSqm)
        : null;

    return jsonResponse(
      {
        propertyType,
        floors,
        totalAreaSqm,
        rooms: validatedRooms,
        otherSpaces: validatedOtherSpaces,
        globalWorkTypes: validatedGlobals,
        globalTaskTitles: validatedGlobalTaskTitles,
        summary: parsed.summary || "",
      },
      200,
      req
    );
  } catch (err) {
    console.error("parse-renovation-description error:", err);
    return jsonResponse({ error: "Internal error" }, 500, req);
  }
});

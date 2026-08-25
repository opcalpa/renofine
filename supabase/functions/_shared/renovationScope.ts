/**
 * The renovation-scope extractor: prompt + validation, in ONE place.
 *
 * Two functions need it now — `parse-renovation-description` (free text from
 * the wizard) and `classify-document` (which answers "what is this?" and "what
 * work does it describe?" in a SINGLE model call for a dropped folder). Two
 * copies of a prompt this long drift within a month, so both import from here.
 *
 * The eval mirror lives in evals/lib/prompt.mjs + evals/lib/extraction-scorers.mjs;
 * change one, change the other.
 */

export const VALID_ROOMS = [
  "kitchen", "bathroom", "livingRoom", "bedroom", "wcShower",
  "laundry", "hallway", "office", "kidsRoom", "balcony",
  "basement", "attic", "garage", "patio",
];

export const VALID_WORK_TYPES = [
  "rivning", "el", "vvs", "kakel", "snickeri", "malning",
  "golv", "kok", "badrum", "fonster_dorrar", "fasad",
  "tak", "tradgard", "annat",
];

export const ROOM_NAME_MAP: Record<string, string> = {
  kitchen: "Kök", bathroom: "Badrum", livingRoom: "Vardagsrum",
  bedroom: "Sovrum", wcShower: "WC/Dusch", laundry: "Tvättstuga",
  hallway: "Hall", office: "Kontor", kidsRoom: "Barnrum",
  balcony: "Balkong", basement: "Källare", attic: "Vind",
  garage: "Garage", patio: "Uteplats",
};

const VALID_PROPERTY_TYPES = ["apartment", "villa", "townhouse", "summerhouse", "other"];

export interface RenovationScope {
  propertyType: string | null;
  floors: number | null;
  totalAreaSqm: number | null;
  rooms: Array<{
    nameKey: string;
    name: string;
    suggestedWorkTypes: string[];
    taskTitles: Record<string, string>;
  }>;
  otherSpaces: Array<{ nameKey: string; name: string }>;
  globalWorkTypes: string[];
  globalTaskTitles: Record<string, string>;
  summary: string;
}

/** What a document that carries no work scope contributes: nothing. */
export const EMPTY_SCOPE: RenovationScope = {
  propertyType: null,
  floors: null,
  totalAreaSqm: null,
  rooms: [],
  otherSpaces: [],
  globalWorkTypes: [],
  globalTaskTitles: {},
  summary: "",
};

/** The JSON shape the model must return for the scope part. */
export function scopeJsonShape(lang: string): string {
  return `{
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
}`;
}

/**
 * The extraction rules themselves — everything after the JSON shape. Shared so
 * a merged classify+parse call reasons exactly like the standalone parser.
 */
export function scopeRules(lang: string): string {
  return `Valid room keys: ${VALID_ROOMS.join(", ")}
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
- If you can't find specific user-provided detail for a particular intersection, OMIT the title (we fall back to a generic name).`;
}

/** The standalone parser's full system prompt (free text in, scope out). */
export function buildScopeSystemPrompt(lang: string): string {
  return `You are a renovation planning assistant. Parse the user's free-text renovation description and extract structured data.

Return JSON with this exact structure:
${scopeJsonShape(lang)}

${scopeRules(lang)}

Return valid JSON only, no markdown.`;
}

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

/**
 * Guard against over-eager globals (eval case: global-vs-perroom-trap). The
 * model sometimes promotes per-room trades to globalWorkTypes when the user
 * merely lists which trades a contractor handles ("totalentreprenad som kan
 * hålla i allt: snickeri, el") — which would create phantom tasks in EVERY
 * room. Only keep globals when the text has a spatial "every room" trigger;
 * this is the prompt's own rule, enforced deterministically.
 * Mirror in evals/lib/extraction-scorers.mjs (applyGlobalGuard) if changed.
 */
const GLOBAL_TRIGGERS = [
  "i hela", "hela lägenhet", "hela villan", "hela huset", "hela bostaden",
  "överallt", "alla rum", "alla rummen", "varje rum", "samtliga rum", "i samtliga",
];

/**
 * Turn whatever the model returned into a scope we are willing to act on.
 * `sourceText` is the text the model read — the global guard is checked
 * against it, so it must be the same text, not a summary of it.
 */
export function validateScope(raw: unknown, sourceText: string): RenovationScope {
  if (!raw || typeof raw !== "object") return { ...EMPTY_SCOPE };
  const parsed = raw as Record<string, unknown>;

  const rooms = ((parsed.rooms as Record<string, unknown>[]) || []).map((r) => {
    const workTypes = ((r.suggestedWorkTypes as string[]) || []).filter((wt: string) =>
      VALID_WORK_TYPES.includes(wt)
    );
    return {
      nameKey: VALID_ROOMS.includes(r.nameKey as string) ? (r.nameKey as string) : "annat",
      name: (r.name as string) || ROOM_NAME_MAP[r.nameKey as string] || (r.nameKey as string),
      suggestedWorkTypes: workTypes,
      taskTitles: sanitizeTaskTitles(r.taskTitles, workTypes),
    };
  });

  const otherSpaces = ((parsed.otherSpaces as Record<string, unknown>[]) || []).map((r) => ({
    nameKey: VALID_ROOMS.includes(r.nameKey as string) ? (r.nameKey as string) : "annat",
    name: (r.name as string) || ROOM_NAME_MAP[r.nameKey as string] || (r.nameKey as string),
  }));

  const validatedGlobals = ((parsed.globalWorkTypes as string[]) || []).filter((wt: string) =>
    VALID_WORK_TYPES.includes(wt)
  );
  const lower = (sourceText || "").toLowerCase();
  const hasGlobalTrigger = GLOBAL_TRIGGERS.some((t) => lower.includes(t));
  const globalWorkTypes = hasGlobalTrigger ? validatedGlobals : [];

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

  return {
    propertyType,
    floors,
    totalAreaSqm,
    rooms,
    otherSpaces,
    globalWorkTypes,
    globalTaskTitles: sanitizeTaskTitles(parsed.globalTaskTitles, globalWorkTypes),
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
  };
}

// Mirrors the production system prompt in
// /Users/calpa/Developer/Renofine/supabase/functions/translate-task-content/index.ts
// Keep these in sync — if production changes, change here, re-run the suite.

export const LANGUAGE_NAMES = {
  sv: "Swedish",
  en: "English",
  pl: "Polish",
  uk: "Ukrainian",
  ar: "Arabic",
  de: "German",
  fi: "Finnish",
  es: "Spanish",
};

export function buildTranslateSystem(targetName) {
  return `You translate renovation/construction work content to ${targetName}.

Rules:
- Translate tasks (title, description, checklistItems[].title), rooms (name, description) and roomItems (title, notes).
- NEVER translate product names, brand names, color codes (NCS, RAL, Pantone), material codes, or measurements.
- Keep the same JSON structure with three top-level arrays "tasks", "rooms" and "roomItems".
- Return ONLY a JSON object — no markdown, no explanation.

Input/output format:
{
  "tasks": [{ "id": "...", "title": "...", "description": "...", "checklistItems": [{"checklistId":"...","itemId":"...","title":"..."}] }],
  "rooms": [{ "id": "...", "name": "...", "description": "..." }],
  "roomItems": [{ "id": "...", "title": "...", "notes": "..." }]
}`;
}

export function buildTranslateUser(input) {
  return JSON.stringify(input);
}

// ----------------------------------------------------------------------------
// parse-renovation-description (free-text → structured plan)
// Mirrors the production system prompt in
// /Users/calpa/Developer/Renofine/supabase/functions/parse-renovation-description/index.ts
// Keep in sync. Production calls gpt-4o-mini, temp 0.3, response_format json_object.
// ----------------------------------------------------------------------------

const PARSE_VALID_ROOMS = [
  "kitchen", "bathroom", "livingRoom", "bedroom", "wcShower",
  "laundry", "hallway", "office", "kidsRoom", "balcony",
  "basement", "attic", "garage", "patio",
];
const PARSE_VALID_WORK_TYPES = [
  "rivning", "el", "vvs", "kakel", "snickeri", "malning",
  "golv", "kok", "badrum", "fonster_dorrar", "fasad",
  "tak", "tradgard", "annat",
];
const PARSE_ROOM_NAME_MAP = {
  kitchen: "Kök", bathroom: "Badrum", livingRoom: "Vardagsrum",
  bedroom: "Sovrum", wcShower: "WC/Dusch", laundry: "Tvättstuga",
  hallway: "Hall", office: "Kontor", kidsRoom: "Barnrum",
  balcony: "Balkong", basement: "Källare", attic: "Vind",
  garage: "Garage", patio: "Uteplats",
};

export function buildParseSystem(lang = "sv") {
  return `You are a renovation planning assistant. Parse the user's free-text renovation description and extract structured data.

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

Valid room keys: ${PARSE_VALID_ROOMS.join(", ")}
Room display names (Swedish): ${Object.entries(PARSE_ROOM_NAME_MAP).map(([k, v]) => `${k}=${v}`).join(", ")}

Valid work types: ${PARSE_VALID_WORK_TYPES.join(", ")}
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
}

export function buildParseUser(description) {
  return description;
}

// The "naive LLM, no domain knowledge" baseline for the head-to-head. Same
// model, same input — but stripped of every construction rule the production
// prompt carries (don't-translate color codes, preserve meaning). This isolates
// how much the DOMAIN PROMPT is worth, separate from the model itself.
export function buildGenericTranslateSystem(targetName) {
  return `Translate the following JSON content to ${targetName}.
Keep the exact same JSON structure and leave every "id" field unchanged.
Return ONLY the JSON object — no markdown, no explanation.`;
}

// ----------------------------------------------------------------------------
// generate-work-checklist
// Mirrors the production prompt in
// /Users/calpa/Developer/Renofine/supabase/functions/generate-work-checklist/index.ts
// Keep in sync — if production changes, change here and re-run the suite.
// ----------------------------------------------------------------------------

export function buildChecklistSystem(langName) {
  return `You are a renovation project assistant. Generate a practical, step-by-step work checklist for a construction/renovation task.

Rules:
- Write in ${langName}
- 4-10 steps, ordered logically (preparation → execution → cleanup)
- Each step should be a clear, actionable instruction
- Include specific product names, color codes (NCS, RAL), and measurements from the room specs when relevant
- Include protection/masking steps at the beginning and cleanup at the end
- Do NOT include purchasing/ordering steps — only on-site work
- Return ONLY a JSON object with this exact structure (no markdown):
{
  "title": "Checklist title in ${langName}",
  "items": ["Step 1 text", "Step 2 text", ...]
}`;
}

// Rebuilds the production user message (the specLines block) verbatim from a
// checklist input object: { taskTitle, taskDescription, roomName, wallSpec,
// floorSpec, ceilingSpec, joinerySpec, dimensions }.
export function buildChecklistUser(input) {
  const { taskTitle, taskDescription, roomName, wallSpec, floorSpec, ceilingSpec, joinerySpec, dimensions } = input;
  const specLines = [];
  if (roomName) specLines.push(`Room: ${roomName}`);
  if (dimensions?.area_sqm) specLines.push(`Area: ${dimensions.area_sqm} m²`);

  if (wallSpec) {
    if (wallSpec.treatments?.length) specLines.push(`Wall treatments: ${wallSpec.treatments.join(", ")}`);
    if (wallSpec.main_color) specLines.push(`Wall color: ${wallSpec.main_color}`);
    if (wallSpec.has_accent_wall && wallSpec.accent_wall_color) specLines.push(`Accent wall color: ${wallSpec.accent_wall_color}`);
  }
  if (floorSpec) {
    if (floorSpec.material) specLines.push(`Floor: ${floorSpec.material}`);
    if (floorSpec.specification) specLines.push(`Floor spec: ${floorSpec.specification}`);
    if (floorSpec.skirting_type) specLines.push(`Skirting: ${floorSpec.skirting_type}`);
    if (floorSpec.skirting_color) specLines.push(`Skirting color: ${floorSpec.skirting_color}`);
  }
  if (ceilingSpec) {
    if (ceilingSpec.material) specLines.push(`Ceiling: ${ceilingSpec.material}`);
    if (ceilingSpec.color) specLines.push(`Ceiling color: ${ceilingSpec.color}`);
  }
  if (joinerySpec) {
    if (joinerySpec.door_type) specLines.push(`Door type: ${joinerySpec.door_type}`);
    if (joinerySpec.trim_type) specLines.push(`Trim type: ${joinerySpec.trim_type}`);
  }

  const roomContext = specLines.length > 0
    ? `\n\nRoom specifications:\n${specLines.join("\n")}`
    : "";

  return `Task: ${taskTitle}${taskDescription ? `\nDescription: ${taskDescription}` : ""}${roomContext}`;
}

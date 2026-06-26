// Deterministic scorers for parse-renovation-description (free-text → structure).
//
// Extraction fails differently from translation: the danger is silently getting
// the SET wrong — missing a room the user asked for, inventing one they didn't,
// flattening granular trades into a rollup, or marking per-room work as "global".
// These all corrupt a user's project without an obvious error. So we score by
// recall/precision over rooms, work types, object fields and globals — not verbatim.
//
// Valid values mirror the production function
// (supabase/functions/parse-renovation-description/index.ts). Keep in sync.

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

const VALID_PROPERTY_TYPES = ["apartment", "villa", "townhouse", "summerhouse", "other"];

// Mirrors the production global-guard in parse-renovation-description/index.ts.
// Keep the trigger list in sync with that file. Drops globalWorkTypes (and
// globalTaskTitles) unless the description has a spatial "every room" trigger —
// so the eval measures what production actually returns, not the raw model output.
const GLOBAL_TRIGGERS = [
  "i hela", "hela lägenhet", "hela villan", "hela huset", "hela bostaden",
  "överallt", "alla rum", "alla rummen", "varje rum", "samtliga rum", "i samtliga",
];

export function applyGlobalGuard(description, output) {
  const desc = (description || "").toLowerCase();
  const hasTrigger = GLOBAL_TRIGGERS.some((t) => desc.includes(t));
  if (hasTrigger) return output;
  return { ...output, globalWorkTypes: [], globalTaskTitles: {} };
}

// Structure: the three arrays exist, nameKeys + work types are from the valid sets.
export function scoreExtractionStructure(output) {
  const issues = [];
  if (output == null || typeof output !== "object" || Array.isArray(output)) {
    return { ok: false, issues: ["output is not a JSON object"] };
  }
  for (const key of ["rooms", "otherSpaces", "globalWorkTypes"]) {
    if (!Array.isArray(output[key])) issues.push(`missing array "${key}"`);
  }
  if (issues.length) return { ok: false, issues };

  for (const r of output.rooms) {
    if (!r || typeof r !== "object") { issues.push("a room is not an object"); continue; }
    if (!VALID_ROOMS.includes(r.nameKey)) issues.push(`room nameKey "${r.nameKey}" invalid`);
    if (!Array.isArray(r.suggestedWorkTypes)) issues.push(`room "${r.nameKey}" suggestedWorkTypes not array`);
    else for (const wt of r.suggestedWorkTypes) if (!VALID_WORK_TYPES.includes(wt)) issues.push(`room "${r.nameKey}" invalid work type "${wt}"`);
  }
  for (const wt of output.globalWorkTypes) {
    if (!VALID_WORK_TYPES.includes(wt)) issues.push(`global invalid work type "${wt}"`);
  }
  if (output.propertyType != null && !VALID_PROPERTY_TYPES.includes(output.propertyType)) {
    issues.push(`propertyType "${output.propertyType}" invalid`);
  }
  return { ok: issues.length === 0, issues };
}

// Rooms: recall (expected room-instances found), hallucination (output rooms not
// expected), per-room work-type recall + forbidden-type violations, and forbidRooms
// (rooms that must NOT appear anywhere — the hallucination guard).
export function scoreRooms(expect, output) {
  const outRooms = Array.isArray(output?.rooms) ? output.rooms : [];
  const outOther = Array.isArray(output?.otherSpaces) ? output.otherSpaces : [];
  const expRooms = expect.rooms || [];

  // count output rooms per nameKey
  const outCountByKey = {};
  for (const r of outRooms) outCountByKey[r?.nameKey] = (outCountByKey[r?.nameKey] || 0) + 1;

  // recall by instance (respects expected count, e.g. 2 bedrooms)
  let expectedInstances = 0, foundInstances = 0;
  const expectedKeys = new Set();
  for (const er of expRooms) {
    const count = er.count || 1;
    expectedInstances += count;
    expectedKeys.add(er.nameKey);
    foundInstances += Math.min(count, outCountByKey[er.nameKey] || 0);
  }

  // hallucinated rooms: output rooms whose nameKey is neither expected nor a known otherSpace
  const otherKeys = new Set(expect.otherSpaces || []);
  const hallucinated = outRooms
    .map((r) => r?.nameKey)
    .filter((k) => !expectedKeys.has(k) && !otherKeys.has(k));

  // work-type recall + forbidden violations, per expected room
  let reqTotal = 0, reqFound = 0;
  const forbidViolations = [];
  for (const er of expRooms) {
    const matching = outRooms.filter((r) => r?.nameKey === er.nameKey);
    const union = new Set(matching.flatMap((r) => (Array.isArray(r.suggestedWorkTypes) ? r.suggestedWorkTypes : [])));
    for (const req of er.requireWorkTypes || []) {
      reqTotal++;
      if (union.has(req)) reqFound++;
    }
    for (const forb of er.forbidWorkTypes || []) {
      if (union.has(forb)) forbidViolations.push(`${er.nameKey}: forbidden work type "${forb}" present`);
    }
  }

  // forbidRooms: must not appear in rooms OR otherSpaces
  const allOutKeys = new Set([...outRooms.map((r) => r?.nameKey), ...outOther.map((r) => r?.nameKey)]);
  const forbidRoomViolations = (expect.forbidRooms || []).filter((k) => allOutKeys.has(k));

  return {
    roomRecall: { found: foundInstances, expected: expectedInstances, ratio: expectedInstances ? foundInstances / expectedInstances : 1 },
    missedRooms: expectedInstances - foundInstances,
    hallucinated,
    workTypeRecall: { found: reqFound, required: reqTotal, ratio: reqTotal ? reqFound / reqTotal : 1 },
    forbidViolations,
    forbidRoomViolations,
  };
}

// Object fields: only checked when the case `expect` defines the key (including
// when it expects null — guards against hallucinated numbers/types).
export function scoreObjectFields(expect, output) {
  const mismatches = [];
  let checked = 0, correct = 0;
  for (const key of ["propertyType", "floors", "totalAreaSqm"]) {
    if (!(key in expect)) continue;
    checked++;
    const got = output?.[key] ?? null;
    const want = expect[key] ?? null;
    if (got === want) correct++;
    else mismatches.push(`${key}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
  }
  return { checked, correct, mismatches };
}

// Globals: exact set match (only checked if the case defines globalWorkTypes).
// This is where the conservative "only when truly everywhere" rule is graded.
export function scoreGlobals(expect, output) {
  if (!("globalWorkTypes" in expect)) return { checked: false, ok: true, expected: null, got: null };
  const got = [...(Array.isArray(output?.globalWorkTypes) ? output.globalWorkTypes : [])].sort();
  const want = [...expect.globalWorkTypes].sort();
  const ok = got.length === want.length && got.every((v, i) => v === want[i]);
  return { checked: true, ok, expected: want, got };
}

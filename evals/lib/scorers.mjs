// Deterministic scorers — no API, no cost, hard pass/fail.

// Collect every string value in a nested object/array into one array.
export function flattenStrings(obj, acc = []) {
  if (obj == null) return acc;
  if (typeof obj === "string") {
    acc.push(obj);
  } else if (Array.isArray(obj)) {
    for (const v of obj) flattenStrings(v, acc);
  } else if (typeof obj === "object") {
    for (const v of Object.values(obj)) flattenStrings(v, acc);
  }
  return acc;
}

// Structure preserved: arrays present, ids + checklist itemIds + counts kept.
export function scoreStructure(input, output) {
  const issues = [];
  if (output == null || typeof output !== "object") {
    return { ok: false, issues: ["output is not a JSON object"] };
  }
  for (const key of ["tasks", "rooms", "roomItems"]) {
    if (!Array.isArray(output[key])) issues.push(`missing array "${key}"`);
  }
  if (issues.length) return { ok: false, issues };

  for (const key of ["tasks", "rooms", "roomItems"]) {
    const inArr = input[key] || [];
    const outArr = output[key] || [];
    if (inArr.length !== outArr.length) {
      issues.push(`"${key}" count ${outArr.length} != expected ${inArr.length}`);
    }
    const outIds = new Set(outArr.map((x) => x && x.id));
    for (const item of inArr) {
      if (!outIds.has(item.id)) issues.push(`"${key}" id "${item.id}" missing in output`);
    }
  }

  // checklist item ids inside tasks
  for (const t of input.tasks || []) {
    const outTask = (output.tasks || []).find((x) => x && x.id === t.id);
    if (!outTask) continue;
    const outItemIds = new Set((outTask.checklistItems || []).map((c) => c && c.itemId));
    for (const ci of t.checklistItems || []) {
      if (!outItemIds.has(ci.itemId)) issues.push(`task "${t.id}" checklist item "${ci.itemId}" missing`);
    }
  }

  return { ok: issues.length === 0, issues };
}

// Checklist structure: { title: string, items: string[] }.
// ok = valid shape with at least one non-empty step. countOk = 4–10 steps
// (the production prompt's rule), tracked separately so an out-of-range count
// is visible without failing the table-stakes structure check.
export function scoreChecklistStructure(output) {
  const issues = [];
  if (output == null || typeof output !== "object" || Array.isArray(output)) {
    return { ok: false, countOk: false, count: 0, issues: ["output is not a JSON object"] };
  }
  if (typeof output.title !== "string" || output.title.trim() === "") {
    issues.push('missing or empty "title"');
  }
  if (!Array.isArray(output.items)) {
    return { ok: false, countOk: false, count: 0, issues: [...issues, 'missing array "items"'] };
  }
  const count = output.items.length;
  const nonEmpty = output.items.filter((s) => typeof s === "string" && s.trim() !== "");
  if (nonEmpty.length !== count) issues.push("one or more steps are empty or not strings");
  if (count === 0) issues.push("no steps");
  const countOk = count >= 4 && count <= 10;
  if (!countOk) issues.push(`step count ${count} outside 4–10`);

  // ok: shape is valid and there is at least one real step. Count range is a
  // soft rule surfaced via countOk, not a hard structural failure.
  const ok = issues.filter((i) => !i.startsWith("step count")).length === 0 && count > 0;
  return { ok, countOk, count, issues };
}

// Terms that must appear unchanged (color codes, measurements, brands).
export function scoreVerbatim(preserveVerbatim, output) {
  const total = (preserveVerbatim || []).length;
  if (total === 0) return { total: 0, pass: 0, missing: [], ratio: 1 };
  const haystack = flattenStrings(output).join("  ¶  ");
  const missing = [];
  for (const term of preserveVerbatim) {
    if (!haystack.includes(term)) missing.push(term);
  }
  const pass = total - missing.length;
  return { total, pass, missing, ratio: pass / total };
}

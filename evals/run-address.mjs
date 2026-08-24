#!/usr/bin/env node
// Renofine eval runner — classify-document, P1: property_address.
//
// The question this answers is narrow and matters: when a folder of documents
// is dropped, does the app suggest the HOME's address — and never the store on
// a receipt or the contractor on a letterhead? A wrong address here groups a
// renovation under the wrong home, and the totals on that page then lie
// without looking wrong (the S5 lesson). Every case carries a decoy address.
//
// Deterministic only — there is nothing here a judge sees better than a
// string compare. Cheap enough to run before every prompt change.
//
// Usage:
//   node evals/run-address.mjs                       # gpt-4o-mini
//   node evals/run-address.mjs --models gpt-4o-mini,gpt-4o
//   node evals/run-address.mjs --cases kvitto-bauhaus-null
//
// Needs OPENAI_API_KEY (and ANTHROPIC_API_KEY if a claude model is used).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildClassifySystem, buildClassifyUser, applyAddressGuard } from "./lib/classify-prompt.mjs";
import { callModel, safeParseJson } from "./lib/models.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPERATURE = 0.1; // matches production

function parseArgs(argv) {
  const args = { models: ["gpt-4o-mini"], cases: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--models") args.models = argv[++i].split(",").map((s) => s.trim());
    else if (a === "--cases") args.cases = argv[++i].split(",").map((s) => s.trim());
  }
  return args;
}

const norm = (s) => (s || "").toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();

// One case → {ok, issues}. ok only when EVERY expectation holds.
function score(expect, result) {
  const issues = [];
  const addr = result.property_address;
  if (expect.null) {
    if (addr) issues.push(`expected null, got "${addr.street}" (${result.address_source})`);
    if (expect.type && result.type !== expect.type) issues.push(`type ${result.type} != ${expect.type}`);
    return { ok: issues.length === 0, issues };
  }
  if (!addr) {
    issues.push(`expected "${expect.street}", got null`);
    return { ok: false, issues };
  }
  if (!norm(addr.street).includes(norm(expect.street))) issues.push(`street "${addr.street}" != "${expect.street}"`);
  if (expect.source && result.address_source !== expect.source) issues.push(`source ${result.address_source} != ${expect.source}`);
  for (const bad of expect.forbid || []) {
    const all = norm([addr.street, addr.city, addr.postal_code].join(" "));
    if (all.includes(norm(bad))) issues.push(`decoy leaked: "${bad}"`);
  }
  return { ok: issues.length === 0, issues };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dataset = JSON.parse(readFileSync(join(HERE, "dataset", "classify-document-address.json"), "utf8"));
  let cases = dataset.cases;
  if (args.cases) cases = cases.filter((c) => args.cases.includes(c.id));
  if (!cases.length) throw new Error("no cases matched --cases filter");

  console.log(`\nRenofine eval · classify-document · property_address (P1)`);
  console.log(`models: ${args.models.join(", ")}`);
  console.log(`cases:  ${cases.length}\n`);

  const rows = [];
  for (const model of args.models) {
    let pass = 0, decoy = 0, errors = 0;
    const details = [];
    for (const c of cases) {
      try {
        const text = await callModel(model, buildClassifySystem(), buildClassifyUser(c.input.fileName, c.input.text), {
          temperature: TEMPERATURE,
          maxTokens: 512,
          label: "lab:renofine:eval-address",
        });
        const parsed = safeParseJson(text);
        if (!parsed.ok) { errors++; details.push({ id: c.id, ok: false, issues: ["unparseable"] }); continue; }
        const raw = parsed.value;
        const guarded = applyAddressGuard(raw.type, raw);
        const result = { type: raw.type, ...guarded };
        const s = score(c.expect, result);
        if (s.ok) pass++;
        if (s.issues.some((i) => i.startsWith("decoy leaked") || i.startsWith("expected null"))) decoy++;
        details.push({ id: c.id, ok: s.ok, issues: s.issues, got: result });
        console.log(`${s.ok ? "✓" : "✗"} ${model.padEnd(12)} ${c.id.padEnd(30)} ${s.ok ? "" : s.issues.join("; ")}`);
      } catch (e) {
        errors++;
        details.push({ id: c.id, ok: false, issues: [String(e.message || e)] });
        console.log(`! ${model.padEnd(12)} ${c.id.padEnd(30)} ${e.message || e}`);
      }
    }
    rows.push({ model, pass, total: cases.length, decoy, errors, details });
  }

  console.log(`\nmodel            pass     wrong-address   errors`);
  for (const r of rows) {
    console.log(`${r.model.padEnd(16)} ${`${r.pass}/${r.total}`.padEnd(8)} ${String(r.decoy).padEnd(15)} ${r.errors}`);
  }
  console.log(`\n"wrong-address" is the number that must be 0: a decoy (store/letterhead) address offered as the home's.\n`);

  mkdirSync(join(HERE, "results"), { recursive: true });
  const out = join(HERE, "results", `address-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(out, JSON.stringify({ ranAt: new Date().toISOString(), rows }, null, 2));
  console.log(`saved ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

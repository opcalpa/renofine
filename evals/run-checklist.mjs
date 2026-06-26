#!/usr/bin/env node
// Renofine eval runner — generate-work-checklist.
//
// Sibling of run.mjs (translate). Same discipline, different feature: does the
// on-site work-checklist generator order steps safely, respect the room spec,
// keep color codes/measurements intact, and never sneak in purchasing steps.
//
// Usage:
//   node evals/run-checklist.mjs                        # gpt-4o-mini, langs sv,en,pl, judge gpt-4o
//   node evals/run-checklist.mjs --models gpt-4o-mini,gpt-4o,claude-haiku-4-5-20251001
//   node evals/run-checklist.mjs --langs sv,en --cases bathroom-waterproof-before-tile
//   node evals/run-checklist.mjs --no-judge             # deterministic only (free, no judge calls)
//   node evals/run-checklist.mjs --judge gpt-4o-mini    # cheaper judge
//
// Needs OPENAI_API_KEY (and ANTHROPIC_API_KEY if a claude model is used).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildChecklistSystem, buildChecklistUser, LANGUAGE_NAMES } from "./lib/prompt.mjs";
import { scoreChecklistStructure, scoreVerbatim } from "./lib/scorers.mjs";
import { callModel, safeParseJson } from "./lib/models.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// Production runs generate-work-checklist at temperature 0.3.
const GEN_TEMPERATURE = 0.3;

function parseArgs(argv) {
  const args = { models: ["gpt-4o-mini"], langs: ["sv", "en", "pl"], judge: "gpt-4o", cases: null, judgeOn: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--models") args.models = argv[++i].split(",").map((s) => s.trim());
    else if (a === "--langs") args.langs = argv[++i].split(",").map((s) => s.trim());
    else if (a === "--judge") args.judge = argv[++i].trim();
    else if (a === "--cases") args.cases = argv[++i].split(",").map((s) => s.trim());
    else if (a === "--no-judge") args.judgeOn = false;
  }
  return args;
}

function buildJudgeSystem() {
  return `You are a strict QA reviewer for renovation/construction work checklists.
You are given a TASK (with optional room specifications) and a generated step-by-step CHECKLIST.
Judge whether the checklist is a correct, safe and logically ordered ON-SITE work plan.

Score 1-5 (integer):
5 = correct and safe: logical order (protection/prep → execution → cleanup), respects the room spec materials/colors/measurements, on-site work only.
3 = usable but with notable gaps (missing protection or cleanup, slightly illogical order, vague steps).
1 = dangerous or wrong: critical steps out of order (e.g. tiling before waterproofing, painting before masking), wrong material vs spec (e.g. wall paint on a ceiling), unsafe DIY where a professional is required, or it includes purchasing/ordering steps.

A CRITICAL issue is anything that would cause damage, rework or a safety risk, OR a rule violation: must be on-site work only (no buying/ordering), must respect the room spec.
You are also given caseRequirements — list each one that is NOT satisfied as a critical issue.
Return ONLY JSON: {"score": <1-5 integer>, "criticalIssues": ["..."], "notes": "..."}`;
}

async function judge(judgeModel, lang, input, caseRequirements, checklistObj) {
  const user = JSON.stringify({
    targetLanguage: LANGUAGE_NAMES[lang] || lang,
    task: {
      title: input.taskTitle,
      description: input.taskDescription || null,
      roomName: input.roomName || null,
      wallSpec: input.wallSpec || null,
      floorSpec: input.floorSpec || null,
      ceilingSpec: input.ceilingSpec || null,
      joinerySpec: input.joinerySpec || null,
      dimensions: input.dimensions || null,
    },
    caseRequirements,
    checklist: checklistObj,
  });
  const text = await callModel(judgeModel, buildJudgeSystem(), user, { temperature: 0 });
  const parsed = safeParseJson(text);
  if (!parsed.ok) return { score: 0, criticalIssues: ["judge returned unparseable output"], notes: "" };
  const v = parsed.value;
  return {
    score: Number(v.score) || 0,
    criticalIssues: Array.isArray(v.criticalIssues) ? v.criticalIssues : [],
    notes: v.notes || "",
  };
}

function pct(n) {
  return (n * 100).toFixed(0) + "%";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dataset = JSON.parse(readFileSync(join(HERE, "dataset", "generate-work-checklist.json"), "utf8"));
  let cases = dataset.cases;
  if (args.cases) cases = cases.filter((c) => args.cases.includes(c.id));
  if (!cases.length) throw new Error("no cases matched --cases filter");

  console.log(`\nRenofine eval · generate-work-checklist`);
  console.log(`models: ${args.models.join(", ")}`);
  console.log(`langs:  ${args.langs.join(", ")}`);
  console.log(`judge:  ${args.judgeOn ? args.judge : "(off)"}`);
  console.log(`cases:  ${cases.length}\n`);

  const rows = []; // one per model×case×lang
  for (const model of args.models) {
    for (const c of cases) {
      for (const lang of args.langs) {
        const row = { model, caseId: c.id, lang, structureOk: false, countOk: false, count: 0, verbatim: null, judge: null, error: null };
        try {
          const system = buildChecklistSystem(LANGUAGE_NAMES[lang] || lang);
          const user = buildChecklistUser(c.input);
          const raw = await callModel(model, system, user, { temperature: GEN_TEMPERATURE });
          const parsed = safeParseJson(raw);
          if (!parsed.ok) {
            row.error = "unparseable JSON";
          } else {
            const out = parsed.value;
            const struct = scoreChecklistStructure(out);
            row.structureOk = struct.ok;
            row.countOk = struct.countOk;
            row.count = struct.count;
            row.verbatim = scoreVerbatim(c.preserveVerbatim, out);
            if (args.judgeOn) {
              row.judge = await judge(args.judge, lang, c.input, c.criticalRequirements, out);
            }
          }
        } catch (e) {
          row.error = String(e.message || e);
        }
        const j = row.judge ? `judge ${row.judge.score}/5${row.judge.criticalIssues.length ? " ⚠" + row.judge.criticalIssues.length : ""}` : "";
        const v = row.verbatim && row.verbatim.total > 0 ? `verbatim ${row.verbatim.pass}/${row.verbatim.total}` : "";
        const cnt = `n=${row.count}${row.countOk ? "" : "!"}`;
        console.log(`  [${model}] ${c.id} → ${lang}: ${row.error ? "ERROR " + row.error : `${row.structureOk ? "struct✓" : "struct✗"} ${cnt} ${v} ${j}`}`);
        rows.push(row);
      }
    }
  }

  // ---- aggregate per model ----
  const summary = [];
  for (const model of args.models) {
    const r = rows.filter((x) => x.model === model);
    const n = r.length;
    const structPass = r.filter((x) => x.structureOk).length;
    const countPass = r.filter((x) => x.countOk).length;
    const vbRows = r.filter((x) => x.verbatim && x.verbatim.total > 0);
    const vbRatio = vbRows.length ? vbRows.reduce((s, x) => s + x.verbatim.ratio, 0) / vbRows.length : 1;
    const jRows = r.filter((x) => x.judge);
    const judgeAvg = jRows.length ? jRows.reduce((s, x) => s + x.judge.score, 0) / jRows.length : null;
    const critical = jRows.reduce((s, x) => s + x.judge.criticalIssues.length, 0);
    const errors = r.filter((x) => x.error).length;
    summary.push({ model, n, structPass, countPass, vbRatio, judgeAvg, critical, errors });
  }

  console.log(`\n──── SUMMARY ────`);
  console.log(`model                        struct   count   verbatim   judge   critical   errors`);
  for (const s of summary) {
    const ja = s.judgeAvg == null ? "  -  " : s.judgeAvg.toFixed(2) + "/5";
    console.log(
      `${s.model.padEnd(28)} ${pct(s.structPass / s.n).padStart(5)}   ${pct(s.countPass / s.n).padStart(5)}   ${pct(s.vbRatio).padStart(6)}   ${ja.padStart(6)}   ${String(s.critical).padStart(6)}    ${String(s.errors).padStart(4)}`
    );
  }

  // collect every critical issue for the report
  const criticalList = rows
    .filter((x) => x.judge && x.judge.criticalIssues.length)
    .map((x) => ({ model: x.model, caseId: x.caseId, lang: x.lang, issues: x.judge.criticalIssues }));
  if (criticalList.length) {
    console.log(`\n⚠ critical issues:`);
    for (const c of criticalList) {
      for (const i of c.issues) console.log(`  [${c.model}] ${c.caseId}/${c.lang}: ${i}`);
    }
  }

  // ---- write results ----
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = join(HERE, "results");
  mkdirSync(outDir, { recursive: true });
  const jsonPath = join(outDir, `checklist-${stamp}.json`);
  writeFileSync(jsonPath, JSON.stringify({ args, summary, rows }, null, 2));
  console.log(`\nsaved ${jsonPath}\n`);
}

main().catch((e) => {
  console.error("FATAL:", e.message || e);
  process.exit(1);
});

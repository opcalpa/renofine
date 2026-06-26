#!/usr/bin/env node
// Renofine eval runner — translate-task-content.
//
// Usage:
//   node evals/run.mjs                         # gpt-4o-mini, langs pl,en,uk, judge gpt-4o
//   node evals/run.mjs --models gpt-4o-mini,gpt-4o,claude-haiku-4-5-20251001
//   node evals/run.mjs --langs pl,en --cases ceiling-vs-wall-paint,plumbing-safety
//   node evals/run.mjs --no-judge             # deterministic only (free, no judge calls)
//   node evals/run.mjs --judge gpt-4o-mini    # cheaper judge
//
// Needs OPENAI_API_KEY in the environment (and ANTHROPIC_API_KEY if a claude model is used).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTranslateSystem, buildTranslateUser, LANGUAGE_NAMES } from "./lib/prompt.mjs";
import { scoreStructure, scoreVerbatim } from "./lib/scorers.mjs";
import { callModel, safeParseJson } from "./lib/models.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = { models: ["gpt-4o-mini"], langs: ["pl", "en", "uk"], judge: "gpt-4o", cases: null, judgeOn: true };
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
  return `You are a strict QA reviewer for renovation/construction translations.
You are given SOURCE content (Swedish) and a TRANSLATION into a target language.
Judge ONLY whether the translation preserves the exact meaning of safety- and instruction-critical content.
Inverting or losing an instruction is a CRITICAL failure (e.g. ceiling paint becoming wall paint, or a safety step like "shut off water BEFORE removing" being reordered/dropped).
Color codes, measurements and brand names should stay unchanged; note if they were altered.
Return ONLY JSON: {"score": <1-5 integer>, "criticalIssues": ["..."], "notes": "..."}
5 = meaning fully preserved. 3 = minor meaning drift. 1 = dangerous or wrong instruction.`;
}

async function judge(judgeModel, lang, source, criticalMeaning, translationObj) {
  const user = JSON.stringify({
    targetLanguage: LANGUAGE_NAMES[lang] || lang,
    source,
    mustPreserveMeaning: criticalMeaning,
    translation: translationObj,
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
  const dataset = JSON.parse(readFileSync(join(HERE, "dataset", "translate-task-content.json"), "utf8"));
  let cases = dataset.cases;
  if (args.cases) cases = cases.filter((c) => args.cases.includes(c.id));
  if (!cases.length) throw new Error("no cases matched --cases filter");

  console.log(`\nRenofine eval · translate-task-content`);
  console.log(`models: ${args.models.join(", ")}`);
  console.log(`langs:  ${args.langs.join(", ")}`);
  console.log(`judge:  ${args.judgeOn ? args.judge : "(off)"}`);
  console.log(`cases:  ${cases.length}\n`);

  const rows = []; // one per model×case×lang
  for (const model of args.models) {
    const system = (lang) => buildTranslateSystem(LANGUAGE_NAMES[lang] || lang);
    for (const c of cases) {
      for (const lang of args.langs) {
        const row = { model, caseId: c.id, lang, structureOk: false, verbatim: null, judge: null, error: null };
        try {
          const raw = await callModel(model, system(lang), buildTranslateUser(c.input));
          const parsed = safeParseJson(raw);
          if (!parsed.ok) {
            row.error = "unparseable JSON";
          } else {
            const out = parsed.value;
            row.structureOk = scoreStructure(c.input, out).ok;
            row.verbatim = scoreVerbatim(c.preserveVerbatim, out);
            if (args.judgeOn) {
              row.judge = await judge(args.judge, lang, c.input, c.criticalMeaning, out);
            }
          }
        } catch (e) {
          row.error = String(e.message || e);
        }
        const j = row.judge ? `judge ${row.judge.score}/5${row.judge.criticalIssues.length ? " ⚠" + row.judge.criticalIssues.length : ""}` : "";
        const v = row.verbatim ? `verbatim ${row.verbatim.pass}/${row.verbatim.total}` : "";
        console.log(`  [${model}] ${c.id} → ${lang}: ${row.error ? "ERROR " + row.error : `${row.structureOk ? "struct✓" : "struct✗"} ${v} ${j}`}`);
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
    const vbRows = r.filter((x) => x.verbatim && x.verbatim.total > 0);
    const vbRatio = vbRows.length ? vbRows.reduce((s, x) => s + x.verbatim.ratio, 0) / vbRows.length : 1;
    const jRows = r.filter((x) => x.judge);
    const judgeAvg = jRows.length ? jRows.reduce((s, x) => s + x.judge.score, 0) / jRows.length : null;
    const critical = jRows.reduce((s, x) => s + x.judge.criticalIssues.length, 0);
    const errors = r.filter((x) => x.error).length;
    summary.push({ model, n, structPass, vbRatio, judgeAvg, critical, errors });
  }

  console.log(`\n──── SUMMARY ────`);
  console.log(`model                        struct   verbatim   judge   critical   errors`);
  for (const s of summary) {
    const ja = s.judgeAvg == null ? "  -  " : s.judgeAvg.toFixed(2) + "/5";
    console.log(
      `${s.model.padEnd(28)} ${pct(s.structPass / s.n).padStart(5)}   ${pct(s.vbRatio).padStart(6)}   ${ja.padStart(6)}   ${String(s.critical).padStart(6)}    ${String(s.errors).padStart(4)}`
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
  const jsonPath = join(outDir, `translate-${stamp}.json`);
  writeFileSync(jsonPath, JSON.stringify({ args, summary, rows }, null, 2));
  console.log(`\nsaved ${jsonPath}\n`);
}

main().catch((e) => {
  console.error("FATAL:", e.message || e);
  process.exit(1);
});

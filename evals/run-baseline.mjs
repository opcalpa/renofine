#!/usr/bin/env node
// Renofine eval — head-to-head: does our DOMAIN-tuned translation actually beat
// commodity machine translation on construction content? This is the moat-proof.
//
// Engines compared on the translate-task-content golden set:
//   renofine    — production domain prompt (don't-translate codes, preserve meaning) + model
//   generic-llm — same model, naive "just translate this JSON" prompt (isolates the prompt's value)
//   deepl       — DeepL raw machine translation (the commodity competitor)
//
// The number that matters: verbatim (color codes / measurements survived) and
// the judge's `critical` count (ceiling↔wall paint, dropped safety steps). If
// renofine holds verbatim ~100% / critical ~0 while deepl/generic don't, that
// gap IS the sales proof and the reason the engine is worth packaging as an API.
//
// Usage:
//   node evals/run-baseline.mjs                                  # all engines, langs pl,de, judge gpt-4o
//   node evals/run-baseline.mjs --engines renofine,deepl --langs pl
//   node evals/run-baseline.mjs --model gpt-4o-mini --no-judge   # deterministic only (cheap)
//   node evals/run-baseline.mjs --cases ceiling-vs-wall-paint
//
// Needs OPENAI_API_KEY (renofine/generic + judge) and DEEPL_API_KEY (deepl engine,
// skipped gracefully if unset). DeepL free tier covers this suite many times over.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTranslateSystem, buildTranslateUser, buildGenericTranslateSystem, LANGUAGE_NAMES } from "./lib/prompt.mjs";
import { scoreStructure, scoreVerbatim } from "./lib/scorers.mjs";
import { callModel, callDeepL, safeParseJson, DEEPL_TARGET } from "./lib/models.mjs";
import { collectStrings } from "./lib/translate-fields.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ALL_ENGINES = ["renofine", "generic-llm", "deepl"];

function parseArgs(argv) {
  const args = { engines: ALL_ENGINES, model: "gpt-4o-mini", langs: ["pl", "de"], judge: "gpt-4o", cases: null, judgeOn: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--engines") args.engines = argv[++i].split(",").map((s) => s.trim());
    else if (a === "--model") args.model = argv[++i].trim();
    else if (a === "--langs") args.langs = argv[++i].split(",").map((s) => s.trim());
    else if (a === "--judge") args.judge = argv[++i].trim();
    else if (a === "--cases") args.cases = argv[++i].split(",").map((s) => s.trim());
    else if (a === "--no-judge") args.judgeOn = false;
  }
  return args;
}

// Same judge as run.mjs (kept local so this runner doesn't touch the working translate runner).
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

// Produce a translated output object for one engine. Throws on hard failure
// (caller records the error); returns null if engine should be skipped for lang.
async function runEngine(engine, model, lang, input) {
  if (engine === "renofine") {
    const raw = await callModel(model, buildTranslateSystem(LANGUAGE_NAMES[lang] || lang), buildTranslateUser(input));
    const parsed = safeParseJson(raw);
    return parsed.ok ? parsed.value : { __error: "unparseable JSON" };
  }
  if (engine === "generic-llm") {
    const raw = await callModel(model, buildGenericTranslateSystem(LANGUAGE_NAMES[lang] || lang), buildTranslateUser(input));
    const parsed = safeParseJson(raw);
    return parsed.ok ? parsed.value : { __error: "unparseable JSON" };
  }
  if (engine === "deepl") {
    if (!DEEPL_TARGET[lang]) return { __skip: `deepl: no target for ${lang}` };
    const { strings, rebuild } = collectStrings(input);
    const translated = await callDeepL(strings, lang);
    return rebuild(translated);
  }
  throw new Error(`unknown engine ${engine}`);
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

  // Warn (don't fail) if deepl requested without a key — skip it cleanly.
  let engines = args.engines;
  if (engines.includes("deepl") && !process.env.DEEPL_API_KEY) {
    console.log("⚠ DEEPL_API_KEY not set — skipping the deepl engine.\n");
    engines = engines.filter((e) => e !== "deepl");
  }

  console.log(`\nRenofine eval · head-to-head (domain vs commodity translation)`);
  console.log(`engines: ${engines.join(", ")}`);
  console.log(`model:   ${args.model} (for renofine + generic-llm)`);
  console.log(`langs:   ${args.langs.join(", ")}`);
  console.log(`judge:   ${args.judgeOn ? args.judge : "(off)"}`);
  console.log(`cases:   ${cases.length}\n`);

  const rows = []; // one per engine×case×lang
  for (const engine of engines) {
    for (const c of cases) {
      for (const lang of args.langs) {
        const row = { engine, caseId: c.id, lang, structureOk: false, verbatim: null, judge: null, error: null, skipped: false };
        try {
          const out = await runEngine(engine, args.model, lang, c.input);
          if (out && out.__skip) {
            row.skipped = true;
            row.error = out.__skip;
          } else if (out && out.__error) {
            row.error = out.__error;
          } else {
            row.structureOk = scoreStructure(c.input, out).ok;
            row.verbatim = scoreVerbatim(c.preserveVerbatim, out);
            if (args.judgeOn) row.judge = await judge(args.judge, lang, c.input, c.criticalMeaning, out);
          }
        } catch (e) {
          row.error = String(e.message || e);
        }
        const j = row.judge ? `judge ${row.judge.score}/5${row.judge.criticalIssues.length ? " ⚠" + row.judge.criticalIssues.length : ""}` : "";
        const v = row.verbatim && row.verbatim.total > 0 ? `verbatim ${row.verbatim.pass}/${row.verbatim.total}` : "";
        console.log(`  [${engine}] ${c.id} → ${lang}: ${row.error ? (row.skipped ? "skip " : "ERROR ") + row.error : `${row.structureOk ? "struct✓" : "struct✗"} ${v} ${j}`}`);
        rows.push(row);
      }
    }
  }

  // ---- aggregate per engine ----
  const summary = [];
  for (const engine of engines) {
    const r = rows.filter((x) => x.engine === engine && !x.skipped);
    const n = r.length || 1;
    const structPass = r.filter((x) => x.structureOk).length;
    const vbRows = r.filter((x) => x.verbatim && x.verbatim.total > 0);
    const vbRatio = vbRows.length ? vbRows.reduce((s, x) => s + x.verbatim.ratio, 0) / vbRows.length : 1;
    const jRows = r.filter((x) => x.judge);
    const judgeAvg = jRows.length ? jRows.reduce((s, x) => s + x.judge.score, 0) / jRows.length : null;
    const critical = jRows.reduce((s, x) => s + x.judge.criticalIssues.length, 0);
    const errors = rows.filter((x) => x.engine === engine && x.error && !x.skipped).length;
    summary.push({ engine, n: r.length, structPass, vbRatio, judgeAvg, critical, errors });
  }

  console.log(`\n──── HEAD-TO-HEAD ────`);
  console.log(`engine                       struct   verbatim   judge   critical   errors`);
  for (const s of summary) {
    const ja = s.judgeAvg == null ? "  -  " : s.judgeAvg.toFixed(2) + "/5";
    console.log(
      `${s.engine.padEnd(28)} ${pct(s.structPass / (s.n || 1)).padStart(5)}   ${pct(s.vbRatio).padStart(6)}   ${ja.padStart(6)}   ${String(s.critical).padStart(6)}    ${String(s.errors).padStart(4)}`
    );
  }
  console.log(`\nThe story to look for: renofine holds verbatim high + critical at 0,`);
  console.log(`while deepl/generic-llm drop color codes or flip instruction meaning.\n`);

  const criticalList = rows
    .filter((x) => x.judge && x.judge.criticalIssues.length)
    .map((x) => ({ engine: x.engine, caseId: x.caseId, lang: x.lang, issues: x.judge.criticalIssues }));
  if (criticalList.length) {
    console.log(`⚠ critical issues (the demo material):`);
    for (const c of criticalList) {
      for (const i of c.issues) console.log(`  [${c.engine}] ${c.caseId}/${c.lang}: ${i}`);
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = join(HERE, "results");
  mkdirSync(outDir, { recursive: true });
  const jsonPath = join(outDir, `baseline-${stamp}.json`);
  writeFileSync(jsonPath, JSON.stringify({ args, summary, rows }, null, 2));
  console.log(`\nsaved ${jsonPath}\n`);
}

main().catch((e) => {
  console.error("FATAL:", e.message || e);
  process.exit(1);
});

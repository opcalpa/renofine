#!/usr/bin/env node
// Renofine eval runner — parse-renovation-description (free-text → structured plan).
//
// This is the eval that actually protects users: a wrong extraction silently
// corrupts a project (a missed room, an invented one, a granular trade flattened
// to a rollup, per-room work marked global). It scores by recall/precision over
// rooms, work types, object fields and globals — not verbatim/translation quality.
//
// Usage:
//   node evals/run-extraction.mjs                                 # gpt-4o-mini, judge gpt-4o
//   node evals/run-extraction.mjs --models gpt-4o-mini,gpt-4o
//   node evals/run-extraction.mjs --no-judge                      # deterministic only (cheap)
//   node evals/run-extraction.mjs --cases kitchen-granularity,global-vs-perroom-trap
//
// Needs OPENAI_API_KEY (and ANTHROPIC_API_KEY if a claude model is used).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildParseSystem, buildParseUser } from "./lib/prompt.mjs";
import { scoreExtractionStructure, scoreRooms, scoreObjectFields, scoreGlobals, applyGlobalGuard } from "./lib/extraction-scorers.mjs";
import { callModel, safeParseJson } from "./lib/models.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const GEN_TEMPERATURE = 0.3; // matches production

function parseArgs(argv) {
  const args = { models: ["gpt-4o-mini"], judge: "gpt-4o", cases: null, judgeOn: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--models") args.models = argv[++i].split(",").map((s) => s.trim());
    else if (a === "--judge") args.judge = argv[++i].trim();
    else if (a === "--cases") args.cases = argv[++i].split(",").map((s) => s.trim());
    else if (a === "--no-judge") args.judgeOn = false;
  }
  return args;
}

// Judge focuses on the one thing deterministic scoring can't fully see:
// faithfulness to the user's intent — invented or clearly-missed content.
function buildJudgeSystem() {
  return `You are a strict QA reviewer for a renovation intake parser.
You are given the user's free-text DESCRIPTION (Swedish) and the parser's structured EXTRACTION.
Judge ONLY faithfulness to what the user actually said.
A CRITICAL failure is: inventing a room or work the user never implied (hallucination), or dropping a room/work the user clearly asked for.
Minor: a slightly off task title or a debatable rollup-vs-granular choice.
Return ONLY JSON: {"score": <1-5 integer>, "criticalIssues": ["..."], "notes": "..."}
5 = fully faithful, nothing invented or missed. 3 = minor drift. 1 = invented or dropped significant content.`;
}

async function judge(judgeModel, description, extraction) {
  const user = JSON.stringify({ description, extraction });
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
  const dataset = JSON.parse(readFileSync(join(HERE, "dataset", "parse-renovation-description.json"), "utf8"));
  let cases = dataset.cases;
  if (args.cases) cases = cases.filter((c) => args.cases.includes(c.id));
  if (!cases.length) throw new Error("no cases matched --cases filter");

  console.log(`\nRenofine eval · parse-renovation-description`);
  console.log(`models: ${args.models.join(", ")}`);
  console.log(`judge:  ${args.judgeOn ? args.judge : "(off)"}`);
  console.log(`cases:  ${cases.length}\n`);

  const rows = [];
  for (const model of args.models) {
    for (const c of cases) {
      const lang = c.input.language || "sv";
      const row = { model, caseId: c.id, structureOk: false, rooms: null, objects: null, globals: null, judge: null, error: null };
      try {
        const raw = await callModel(model, buildParseSystem(lang), buildParseUser(c.input.description), { temperature: GEN_TEMPERATURE, jsonObject: true });
        const parsed = safeParseJson(raw);
        if (!parsed.ok) {
          row.error = "unparseable JSON";
        } else {
          // Mirror production's post-processing (global-guard) so the eval scores
          // what a user actually gets, not just the raw model output.
          const out = applyGlobalGuard(c.input.description, parsed.value);
          row.structureOk = scoreExtractionStructure(out).ok;
          row.rooms = scoreRooms(c.expect, out);
          row.objects = scoreObjectFields(c.expect, out);
          row.globals = scoreGlobals(c.expect, out);
          if (args.judgeOn) row.judge = await judge(args.judge, c.input.description, out);
        }
      } catch (e) {
        row.error = String(e.message || e);
      }

      // per-row critical = missed rooms + hallucinated + forbidden-room + forbidden-worktype + wrong globals
      if (!row.error) {
        row.critical =
          (row.rooms.missedRooms || 0) +
          row.rooms.hallucinated.length +
          row.rooms.forbidRoomViolations.length +
          row.rooms.forbidViolations.length +
          (row.globals.checked && !row.globals.ok ? 1 : 0);
      }

      if (row.error) {
        console.log(`  [${model}] ${c.id}: ERROR ${row.error}`);
      } else {
        const rr = row.rooms.roomRecall;
        const wt = row.rooms.workTypeRecall;
        const obj = row.objects.checked ? ` obj ${row.objects.correct}/${row.objects.checked}` : "";
        const gl = row.globals.checked ? ` glob ${row.globals.ok ? "✓" : "✗"}` : "";
        const hall = row.rooms.hallucinated.length ? ` ⚠hall:${row.rooms.hallucinated.join("/")}` : "";
        const j = row.judge ? ` judge ${row.judge.score}/5` : "";
        console.log(`  [${model}] ${c.id}: ${row.structureOk ? "struct✓" : "struct✗"} rooms ${rr.found}/${rr.expected} wt ${wt.found}/${wt.required}${obj}${gl}${j} crit:${row.critical}${hall}`);
      }
      rows.push(row);
    }
  }

  // ---- aggregate per model ----
  const summary = [];
  for (const model of args.models) {
    const r = rows.filter((x) => x.model === model && !x.error);
    const n = r.length || 1;
    const structPass = r.filter((x) => x.structureOk).length;
    const roomRecall = avg(r.map((x) => x.rooms.roomRecall.ratio));
    const wtRecall = avg(r.filter((x) => x.rooms.workTypeRecall.required > 0).map((x) => x.rooms.workTypeRecall.ratio));
    const objRows = r.filter((x) => x.objects.checked > 0);
    const objAcc = objRows.length ? avg(objRows.map((x) => x.objects.correct / x.objects.checked)) : 1;
    const globRows = r.filter((x) => x.globals.checked);
    const globAcc = globRows.length ? globRows.filter((x) => x.globals.ok).length / globRows.length : 1;
    const jRows = r.filter((x) => x.judge);
    const judgeAvg = jRows.length ? avg(jRows.map((x) => x.judge.score)) : null;
    const critical = r.reduce((s, x) => s + (x.critical || 0), 0);
    const errors = rows.filter((x) => x.model === model && x.error).length;
    summary.push({ model, n: r.length, structPass, roomRecall, wtRecall, objAcc, globAcc, judgeAvg, critical, errors });
  }

  console.log(`\n──── SUMMARY ────`);
  console.log(`model                        struct  roomRec  wtRec  objAcc  globAcc  judge  critical  errors`);
  for (const s of summary) {
    const ja = s.judgeAvg == null ? "  -  " : s.judgeAvg.toFixed(2) + "/5";
    console.log(
      `${s.model.padEnd(28)} ${pct(s.structPass / (s.n || 1)).padStart(5)}  ${pct(s.roomRecall).padStart(6)}  ${pct(s.wtRecall).padStart(5)}  ${pct(s.objAcc).padStart(5)}  ${pct(s.globAcc).padStart(6)}  ${ja.padStart(6)}  ${String(s.critical).padStart(7)}  ${String(s.errors).padStart(5)}`
    );
  }

  const criticalList = rows
    .filter((x) => !x.error && x.critical > 0)
    .map((x) => {
      const parts = [];
      if (x.rooms.missedRooms) parts.push(`missed ${x.rooms.missedRooms} room(s)`);
      if (x.rooms.hallucinated.length) parts.push(`hallucinated ${x.rooms.hallucinated.join(",")}`);
      if (x.rooms.forbidRoomViolations.length) parts.push(`forbidden room(s) ${x.rooms.forbidRoomViolations.join(",")}`);
      if (x.rooms.forbidViolations.length) parts.push(...x.rooms.forbidViolations);
      if (x.globals.checked && !x.globals.ok) parts.push(`globals got [${x.globals.got}] expected [${x.globals.expected}]`);
      return { model: x.model, caseId: x.caseId, parts };
    });
  if (criticalList.length) {
    console.log(`\n⚠ critical issues (what would corrupt a user's project):`);
    for (const c of criticalList) console.log(`  [${c.model}] ${c.caseId}: ${c.parts.join(" · ")}`);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = join(HERE, "results");
  mkdirSync(outDir, { recursive: true });
  const jsonPath = join(outDir, `extraction-${stamp}.json`);
  writeFileSync(jsonPath, JSON.stringify({ args, summary, rows }, null, 2));
  console.log(`\nsaved ${jsonPath}\n`);
}

function avg(arr) {
  return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 1;
}

main().catch((e) => {
  console.error("FATAL:", e.message || e);
  process.exit(1);
});

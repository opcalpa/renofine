#!/usr/bin/env node
// Renofine eval runner — agent-route (messy field note → structured proposals).
//
// This protects the voice/agentic layer: a router that invents an id silently
// mutates the wrong task, and one that guesses instead of asking erodes trust.
// We score the RAW model output (not the edge function's normalized output) on
// purpose — the edge fn has a safety net that converts invented ids to "unknown";
// the eval must see the model's TRUE behavior so the prompt can be improved.
//
// Usage:
//   node evals/run-router.mjs                                  # gpt-4o-mini, judge gpt-4o
//   node evals/run-router.mjs --models gpt-4o-mini,gpt-4o
//   node evals/run-router.mjs --no-judge                       # deterministic only (cheap)
//   node evals/run-router.mjs --cases seal-done,buy-tiles
//
// Needs OPENAI_API_KEY (and ANTHROPIC_API_KEY if a claude model is used).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRouterSystem } from "./lib/router-prompt.mjs";
import { scoreRouterCase } from "./lib/router-scorers.mjs";
import { callModel, safeParseJson } from "./lib/models.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const GEN_TEMPERATURE = 0.1; // matches production agent-route

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

function buildJudgeSystem() {
  return `You are a strict QA reviewer for a renovation app's input router.
You are given a user's field NOTE (Swedish) and the router's PROPOSALS (structured changes).
Judge ONLY whether the proposals faithfully capture the note's intent.
CRITICAL failure: proposing a change the note never implied, or ignoring a clear instruction.
Minor: a slightly off summary, a debatable progress number.
Return ONLY JSON: {"score": <1-5 integer>, "criticalIssues": ["..."], "notes": "..."}
5 = fully faithful. 3 = minor drift. 1 = invented or ignored a clear instruction.`;
}

async function judge(judgeModel, note, proposals) {
  const user = JSON.stringify({ note, proposals });
  const text = await callModel(judgeModel, buildJudgeSystem(), user, { temperature: 0 });
  const parsed = safeParseJson(text);
  if (!parsed.ok) return { score: 0, criticalIssues: ["judge unparseable"], notes: "" };
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
function avg(arr) {
  return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 1;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dataset = JSON.parse(readFileSync(join(HERE, "dataset", "agent-route.json"), "utf8"));
  const ctx = dataset.context;
  let cases = dataset.cases;
  if (args.cases) cases = cases.filter((c) => args.cases.includes(c.id));
  if (!cases.length) throw new Error("no cases matched --cases filter");

  const system = buildRouterSystem(ctx.language || "sv", ctx.rooms, ctx.tasks, [], ctx.members || []);

  console.log(`\nRenofine eval · agent-route (router)`);
  console.log(`models: ${args.models.join(", ")}`);
  console.log(`judge:  ${args.judgeOn ? args.judge : "(off)"}`);
  console.log(`cases:  ${cases.length}\n`);

  const rows = [];
  for (const model of args.models) {
    for (const c of cases) {
      const row = { model, caseId: c.id, score: null, judge: null, error: null };
      try {
        // A case may carry userType to test role-gated behavior (e.g. open_feature
        // for a contractor); otherwise the shared neutral prompt is used.
        const caseSystem = c.userType
          ? buildRouterSystem(ctx.language || "sv", ctx.rooms, ctx.tasks, [], ctx.members || [], c.userType)
          : system;
        const raw = await callModel(model, caseSystem, c.input, { temperature: GEN_TEMPERATURE, jsonObject: true, label: `router:${c.id}` });
        const parsed = safeParseJson(raw);
        if (!parsed.ok) {
          row.error = "unparseable JSON";
        } else {
          const proposals = Array.isArray(parsed.value.proposals) ? parsed.value.proposals : [];
          row.proposals = proposals;
          row.score = scoreRouterCase(c, ctx, proposals);
          row.score.proposalCount = proposals.length;
          if (args.judgeOn) row.judge = await judge(args.judge, c.input, proposals);
        }
      } catch (e) {
        row.error = String(e.message || e);
      }

      if (row.error) {
        console.log(`  [${model}] ${c.id}: ERROR ${row.error}`);
      } else {
        const s = row.score;
        const rec = s.kind === "expect" ? ` rec ${s.recall.found}/${s.recall.expected}` : ` ${s.kind}`;
        const fp = s.falsePositives ? ` fp:${s.falsePositives}` : "";
        const cr = s.critical.length ? ` ⚠${s.critical.length}` : "";
        const j = row.judge ? ` judge ${row.judge.score}/5` : "";
        console.log(`  [${model}] ${c.id}: ${s.ok ? "OK " : "FAIL"}${rec}${fp}${cr}${j}`);
      }
      rows.push(row);
    }
  }

  // ---- aggregate per model ----
  const summary = [];
  for (const model of args.models) {
    const r = rows.filter((x) => x.model === model && !x.error);
    const n = r.length || 1;
    const passed = r.filter((x) => x.score.ok).length;
    const expectRows = r.filter((x) => x.score.kind === "expect");
    const recall = expectRows.length ? avg(expectRows.map((x) => x.score.recall.found / (x.score.recall.expected || 1))) : 1;
    const fp = r.reduce((s, x) => s + (x.score.falsePositives || 0), 0);
    const invented = r.reduce((s, x) => s + x.score.inventedIds.length, 0);
    const critical = r.reduce((s, x) => s + x.score.critical.length, 0);
    const jRows = r.filter((x) => x.judge);
    const judgeAvg = jRows.length ? avg(jRows.map((x) => x.judge.score)) : null;
    const errors = rows.filter((x) => x.model === model && x.error).length;
    summary.push({ model, n: r.length, passed, recall, fp, invented, critical, judgeAvg, errors });
  }

  console.log(`\n──── SUMMARY ────`);
  console.log(`model                        pass    recall  fp  invented  critical  judge  errors`);
  for (const s of summary) {
    const ja = s.judgeAvg == null ? "  -  " : s.judgeAvg.toFixed(2) + "/5";
    console.log(
      `${s.model.padEnd(28)} ${pct(s.passed / (s.n || 1)).padStart(5)}  ${pct(s.recall).padStart(6)}  ${String(s.fp).padStart(2)}  ${String(s.invented).padStart(8)}  ${String(s.critical).padStart(8)}  ${ja.padStart(6)}  ${String(s.errors).padStart(5)}`
    );
  }

  const criticalList = rows
    .filter((x) => !x.error && x.score.critical.length > 0)
    .map((x) => ({ model: x.model, caseId: x.caseId, parts: x.score.critical }));
  if (criticalList.length) {
    console.log(`\n⚠ critical issues (what would corrupt a user's project):`);
    for (const c of criticalList) console.log(`  [${c.model}] ${c.caseId}: ${c.parts.join(" · ")}`);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = join(HERE, "results");
  mkdirSync(outDir, { recursive: true });
  const jsonPath = join(outDir, `router-${stamp}.json`);
  writeFileSync(jsonPath, JSON.stringify({ args, summary, rows }, null, 2));
  console.log(`\nsaved ${jsonPath}\n`);
}

main().catch((e) => {
  console.error("FATAL:", e.message || e);
  process.exit(1);
});

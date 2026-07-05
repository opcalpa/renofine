#!/usr/bin/env node
// Repro harness for the Cowork-reported picker bug (2026-07-05): run the REAL
// demo-project context (+ the two test tasks Cowork added) through the router
// prompt N times and count how often the model emits the correct low-confidence
// pick WITH candidateTaskIds vs an "unknown" (which hides the picker).
//
//   node evals/repro-ambiguous-demo.mjs [--n 5] [--input "..."]
import { buildRouterSystem } from "./lib/router-prompt.mjs";
import { callModel, safeParseJson } from "./lib/models.mjs";

const args = process.argv.slice(2);
const N = Number(args[args.indexOf("--n") + 1]) || 5;
const inputArg = args.indexOf("--input") >= 0 ? args[args.indexOf("--input") + 1] : null;

// Real demo context (fetched from public_demo 2026-07-05) + Cowork's two test tasks.
const rooms = [
  { id: "r-living", name: "Vardagsrum" },
  { id: "r-hall", name: "Hall" },
  { id: "r-bed", name: "Sovrum" },
  { id: "r-kitchen", name: "Kök" },
  { id: "r-bath", name: "Badrum" },
];
const tasks = [
  // created_at DESC: tasks created today come FIRST (matches Cowork's live run)
  { id: "t-paint-hall", title: "Måla hall", status: "to_do" },
  { id: "t-paint-kitchen", title: "Måla kök", status: "to_do" },
  { id: "t-prep", title: "Förberedelse och skydd", status: "completed" },
  { id: "t-demo", title: "Rivning och demontering", status: "completed" },
  { id: "t-spackle", title: "Spackling av väggar", status: "completed" },
  { id: "t-paint", title: "Målning väggar & tak", status: "completed" },
  { id: "t-wallpaper", title: "Tapetsering fondvägg", status: "in_progress" },
  { id: "t-seal", title: "Tätskikt badrum", status: "to_do" },
  { id: "t-tile", title: "Kakelsättning badrum", status: "to_do" },
  { id: "t-counter", title: "Bänkskiva och stänkskydd", status: "to_do" },
  { id: "t-floor", title: "Slipning och lackning av golv", status: "to_do" },
  { id: "t-elec", title: "Eluttag och belysning", status: "to_do" },
  { id: "t-trim", title: "Montering av lister", status: "to_do" },
  { id: "t-clean", title: "Slutstädning", status: "to_do" },
];

const inputs = inputArg
  ? [inputArg]
  : ["jag blev klar med målningen i ett av rummen", "målningen är klar"];

// --with-correction: a routing-relevant memory (what prod injects post-fix).
// --with-preference: the app-layer row that CAUSED the 2026-07-05 picker bug —
// kept to document/reproduce it; prod now filters kind=preference at the query.
const memories = args.includes("--with-correction")
  ? [{ kind: "correction", key: "listerna i hallen", value: "Montering av lister" }]
  : args.includes("--with-preference")
    ? [{ kind: "preference", key: "autonomy", value: "suggest" }]
    : [];
const system = buildRouterSystem("sv", rooms, tasks, memories);
const taskIds = new Set(tasks.map((t) => t.id));

function classify(proposals) {
  const list = Array.isArray(proposals) ? proposals : [];
  const results = [];
  for (const p of list) {
    const type = p.action?.type ?? "?";
    const cands = Array.isArray(p.candidateTaskIds)
      ? p.candidateTaskIds.filter((id) => taskIds.has(id))
      : [];
    const mc = typeof p.matchConfidence === "number" ? p.matchConfidence : null;
    results.push({ type, taskId: p.action?.taskId, mc, cands });
  }
  const taskAction = results.find((r) => r.type === "set_progress" || r.type === "update_task");
  if (taskAction && taskAction.mc !== null && taskAction.mc < 0.7 && new Set([taskAction.taskId, ...taskAction.cands].filter(Boolean)).size >= 2) return { verdict: "PICKER ✅", results };
  if (taskAction && taskAction.mc !== null && taskAction.mc >= 0.7) return { verdict: "CONFIDENT ❌", results };
  if (results.some((r) => r.type === "unknown")) return { verdict: "UNKNOWN (no picker) ❌", results };
  return { verdict: "OTHER", results };
}

for (const input of inputs) {
  console.log(`\n=== input: "${input}" ===`);
  const tally = {};
  for (let i = 0; i < N; i++) {
    const raw = await callModel("gpt-4o-mini", system, input, { jsonObject: true, label: "repro" });
    const parsed = safeParseJson(raw);
    const { verdict, results } = classify(parsed.ok ? parsed.value?.proposals : null);
    tally[verdict] = (tally[verdict] ?? 0) + 1;
    console.log(`  run ${i + 1}: ${verdict}  ${results.map((r) => `${r.type}(task=${r.taskId ?? "-"},mc=${r.mc ?? "-"},cands=${r.cands.length})`).join(" | ")}`);
    if (verdict === "OTHER") console.log("    raw:", String(raw).slice(0, 500).replace(/\n/g, " "));
  }
  console.log("  tally:", JSON.stringify(tally));
}

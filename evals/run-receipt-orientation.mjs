#!/usr/bin/env node
// Renofine eval runner — the receipt reader, on real photographed receipts.
//
// It scores the SAME receipts twice:
//
//   raw      — the bytes exactly as they came off the phone. This is what the
//              app did until 2026-09-03, and it is the baseline the fix has to
//              beat. Do not delete it: the number it produces is the reason the
//              fix exists, and without it "we fixed it" is a claim, not a fact.
//   upright  — what ships: the image is read flat AND turned 270°, plus 90/180
//              if neither closes, and the attempt whose ARITHMETIC holds wins.
//              Not the model's confidence — that was 0.72 on an invented ICA
//              receipt. See src/services/documentRead.ts for why it is a search
//              and not a single question.
//
// It calls the DEPLOYED process-document-v2, not a copy of its prompt, so the
// prompt cannot drift away from what the eval measures.
//
// Usage:
//   RECEIPT_EVAL_DIR=/path/to/receipts node evals/run-receipt-orientation.mjs
//   ... --cases hornbach-496-sideways        # one case
//   ... --only upright                       # skip the baseline (half the calls)
//
// Needs VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (read from .env.local) and
// macOS `sips` for the rotation. The anon rate limit on process-document-v2 is
// 20 calls/hour, which is one full run of five cases in both conditions.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

function loadEnv() {
  for (const f of [".env.local", ".env"]) {
    const p = join(ROOT, f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

function parseArgs(argv) {
  const args = { cases: null, only: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--cases") args.cases = argv[++i].split(",").map((s) => s.trim());
    else if (argv[i] === "--only") args.only = argv[++i].trim();
  }
  return args;
}

/** Rotate CLOCKWISE by `deg` into a temp file. Returns the new path. */
function rotate(path, deg) {
  const out = join(tmpdir(), `receipt-eval-${deg}-${basename(path)}`);
  execFileSync("sips", ["-r", String(deg), path, "--out", out], { stdio: "ignore" });
  return out;
}

async function read(path, url, key) {
  const b64 = readFileSync(path).toString("base64");
  const res = await fetch(`${url}/functions/v1/process-document-v2`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      imageBase64: b64,
      mimeType: "image/jpeg",
      fileName: basename(path),
      mode_hint: "receipt",
    }),
  });
  if (res.status === 429) throw new Error("RATE_LIMITED");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const ROTATIONS = [0, 270, 90, 180];
const ALWAYS_TRY = 2;

/**
 * The shipping strategy, mirrored: try turning the image, and let the ARITHMETIC
 * decide which attempt won — never the model's own confidence, which is the
 * number that was 0.72 on an invented receipt.
 */
function rank(data) {
  const r = data?.receiptData;
  if (!r) return { score: 0, good: false };
  const hasVendor = !!(r.vendor_name || "").trim();
  const hasTotal = (r.total_amount ?? 0) > 0;
  if (!hasVendor && !hasTotal) return { score: 0, good: false };
  const issues = r.issues ?? [];
  const blocking = issues.filter((i) => i.level === "blocking").length;
  const arith = issues.filter((i) =>
    ["vat_rate_off", "line_sum_mismatch", "printed_total_differs", "vat_exceeds_total"].includes(i.code)
  ).length;
  const checks = issues.length - blocking - arith;
  const score = (hasVendor ? 10 : 0) + (hasTotal ? 10 : 0)
    + (data?.text_is_upright === false ? -20 : 0)
    - blocking * 8 - arith * 6 - checks;
  const good = hasVendor && hasTotal && data?.text_is_upright !== false && blocking === 0 && arith === 0;
  return { score, good };
}

async function readUpright(path, url, key) {
  let best = null;
  let calls = 0;
  for (const [i, deg] of ROTATIONS.entries()) {
    const p = deg === 0 ? path : rotate(path, deg);
    const data = await read(p, url, key);
    calls += 1;
    const { score, good } = rank(data);
    if (!best || score > best.score) best = { result: data, rotationApplied: deg, score };
    if (good && i + 1 >= ALWAYS_TRY) break;
  }
  return { ...best, calls };
}

const near = (a, b, tol = 0.02) =>
  typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= tol;

function score(expected, data) {
  const r = data?.receiptData ?? {};
  const checks = {
    document_type: data?.document_type === expected.document_type,
    vendor: (r.vendor_name ?? "").toLowerCase().includes(expected.vendor_contains),
    total: near(r.total_amount, expected.total_amount),
    vat: near(r.vat_amount, expected.vat_amount),
    date: r.purchase_date === expected.purchase_date,
    line_items: (r.line_items?.length ?? 0) >= expected.line_items_min,
  };
  const passed = Object.values(checks).filter(Boolean).length;
  return { checks, passed, of: Object.keys(checks).length, read: r };
}

async function main() {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  const dir = process.env.RECEIPT_EVAL_DIR;
  if (!url || !key) throw new Error("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing");
  if (!dir) throw new Error("Set RECEIPT_EVAL_DIR to the folder holding the receipt images");

  const ds = JSON.parse(readFileSync(join(HERE, "dataset", "receipt-orientation.json"), "utf8"));
  const cases = args.cases ? ds.cases.filter((c) => args.cases.includes(c.id)) : ds.cases;
  const conditions = args.only ? [args.only] : ["raw", "upright"];

  const rows = [];
  for (const c of cases) {
    const path = join(dir, c.file);
    if (!existsSync(path)) {
      console.log(`  SKIP ${c.id} — ${c.file} not in ${dir}`);
      continue;
    }
    const row = { id: c.id, file: c.file };
    for (const cond of conditions) {
      try {
        const { result, rotationApplied } =
          cond === "upright"
            ? await readUpright(path, url, key)
            : { result: await read(path, url, key), rotationApplied: 0 };
        row[cond] = { ...score(c.expected, result), rotationApplied };
      } catch (e) {
        row[cond] = { error: e.message, passed: 0, of: 6 };
        if (e.message === "RATE_LIMITED") {
          console.log("\n  Rate limited (20 anon calls/hour on this endpoint). Wait and re-run.\n");
        }
      }
    }
    rows.push(row);
    const line = conditions
      .map((cond) => {
        const s = row[cond];
        if (s.error) return `${cond}: ${s.error}`;
        const turn = s.rotationApplied ? ` (vred ${s.rotationApplied}°)` : "";
        return `${cond}: ${s.passed}/${s.of}${turn}`;
      })
      .join("   ");
    console.log(`  ${c.id.padEnd(34)} ${line}`);
  }

  const totals = {};
  for (const cond of conditions) {
    totals[cond] = rows.reduce((n, r) => n + (r[cond]?.passed ?? 0), 0);
  }
  const max = rows.length * 6;
  console.log("");
  for (const cond of conditions) {
    const pct = max ? Math.round((totals[cond] / max) * 100) : 0;
    console.log(`  ${cond.padEnd(8)} ${totals[cond]}/${max} fält rätt  (${pct} %)`);
  }

  mkdirSync(join(HERE, "results"), { recursive: true });
  const out = join(HERE, "results", `receipt-orientation-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(out, JSON.stringify({ totals, max, rows }, null, 2));
  console.log(`\n  → ${out}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

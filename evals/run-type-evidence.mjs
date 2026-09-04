/**
 * Does the evidence gate actually work on real papers?
 *
 * The confidence number it replaced measured CONSTANT at 0.95 across 47 real
 * classifications (edge logs, 2026-09-03), so a threshold on it was a placebo.
 * This asks the deployed classifier the new question — "quote the words that
 * told you the type" — and reports how often it can, and what the gate then
 * does with the answer.
 *
 * The number that matters is not accuracy. It is how often a REAL type gets
 * demoted to Övrigt for lack of evidence: that is the cost of the gate, and it
 * has to be small enough to be worth the protection.
 *
 *   TYPE_EVAL_DIR="<folder of jpgs>" node evals/run-type-evidence.mjs IMG_4089 IMG_4058 ...
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

function loadEnv() {
  for (const f of [".env.local", ".env"]) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

async function signIn(url, key) {
  const email = process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;
  if (!email || !password) return { token: key, who: "anon (20 anrop/timme)" };
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return { token: key, who: "anon (inloggning misslyckades)" };
  const j = await res.json();
  return { token: j.access_token ?? key, who: `${email} (400 anrop/timme)` };
}

/** Mirrors settleDocumentType in src/services/smartUploadService.ts. */
function settle(type, confidence, evidence) {
  const exempt = type === "other" || type === "product_image";
  if (exempt) return { type, demoted: false };
  const missing = evidence === null || (typeof evidence === "string" && !evidence.trim());
  const weak = typeof confidence === "number" && confidence < 0.7;
  return missing || weak ? { type: "other", demoted: true } : { type, demoted: false };
}

async function main() {
  loadEnv();
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  const dir = process.env.TYPE_EVAL_DIR;
  if (!url || !key) throw new Error("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY saknas");
  if (!dir) throw new Error("Sätt TYPE_EVAL_DIR till mappen med bilderna");

  const names = process.argv.slice(2);
  if (names.length === 0) throw new Error("Ange filnamn (utan .jpg) som argument");

  const { token, who } = await signIn(url, key);
  console.log(`  som ${who}\n`);

  const rows = [];
  for (const name of names) {
    const path = join(dir, name.endsWith(".jpg") ? name : `${name}.jpg`);
    if (!existsSync(path)) { console.log(`  SKIP ${name} — finns inte`); continue; }
    const b64 = readFileSync(path).toString("base64");
    let r;
    try {
      const res = await fetch(`${url}/functions/v1/classify-document`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, apikey: key, "Content-Type": "application/json" },
        body: JSON.stringify({ image: b64, fileName: `${name}.jpg` }),
      });
      if (res.status === 429) { console.log(`  ${name}: STRYPT`); continue; }
      if (!res.ok) { console.log(`  ${name}: HTTP ${res.status}`); continue; }
      r = await res.json();
    } catch (e) { console.log(`  ${name}: ${e.message}`); continue; }

    const ev = r.type_evidence ?? null;
    const s = settle(r.type, r.confidence, ev);
    rows.push({ name, said: r.type, conf: r.confidence, ev, filed: s.type, demoted: s.demoted });
    console.log(
      `  ${name.padEnd(10)} sa "${String(r.type).padEnd(17)}" conf ${String(r.confidence).padEnd(5)}` +
      ` bevis ${ev === null ? "— SAKNAS" : JSON.stringify(ev)}` +
      (s.demoted ? `  => Övrigt (FRÅGA)` : `  => ${s.type}`)
    );
  }

  const demoted = rows.filter((r) => r.demoted).length;
  const withEv = rows.filter((r) => r.ev !== null).length;
  const confs = [...new Set(rows.map((r) => r.conf))];
  console.log(`\n  ${rows.length} filer`);
  console.log(`  bevis angivet:      ${withEv}/${rows.length}`);
  console.log(`  degraderade:        ${demoted}/${rows.length}  <- grindens KOSTNAD`);
  console.log(`  confidence-varianter: ${confs.join(", ")}${confs.length === 1 ? "  <- konstant, alltså värdelös" : ""}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });

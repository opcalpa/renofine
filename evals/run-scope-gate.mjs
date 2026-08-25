#!/usr/bin/env node
// Renofine eval — the P4.0 gate on the merged classify+scope call.
//
// The extraction evals ask "did it read the quote correctly?". This one asks the
// opposite, and it is the question that actually went wrong in production: given
// a document that describes NO renovation — a CV, a köpekontrakt, a bank
// statement, a receipt — does the one-call path keep its hands off the project?
//
// A pass means: the class is not scope-bearing AND no rooms come back. One
// invented room here is worse than ten missed ones: the person did not ask for
// a project, and now they have to delete rooms they never created.
//
// Usage:
//   node evals/run-scope-gate.mjs                 # gpt-4o-mini (production model)
//   node evals/run-scope-gate.mjs --models gpt-4o
//
// Needs OPENAI_API_KEY.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMergedSystem, buildMergedUser } from "./lib/prompt.mjs";
import { callModel, safeParseJson } from "./lib/models.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const GEN_TEMPERATURE = 0.1; // matches classify-document

const SCOPE_BEARING = ["quote", "contract", "specification"];

/**
 * Each case is a document a real renovation folder contains but that must not
 * shape the project. `allowType` lists the classes we consider a correct read —
 * the gate is about the SCOPE, so a debatable label is fine as long as it is
 * not scope-bearing (or, for a köpekontrakt, is scope-bearing but empty).
 */
const CASES = [
  {
    id: "cv",
    fileName: "CV Anna Lindqvist.pdf",
    text: `CURRICULUM VITAE

Anna Lindqvist
Byggnadsingenjör, Stockholm

ARBETSLIVSERFARENHET
2019-2026  Projektledare, Skanska Sverige AB
           Ansvarig för ombyggnation av kök och badrum i flerbostadshus.
           Ledde renovering av 40 lägenheter, budget 12 MSEK.
2015-2019  Arbetsledare, NCC
           Stambyten, våtrumsrenovering, plattsättning.

UTBILDNING
2011-2015  Högskoleingenjör byggteknik, KTH

KOMPETENSER
Kalkylering, AMA Hus, projektering, el och VVS-samordning.`,
  },
  {
    id: "kopekontrakt",
    fileName: "Köpekontrakt Furusundsgatan 14.pdf",
    text: `KÖPEKONTRAKT

Säljare: Erik Bergström, 19XXXXXX-XXXX
Köpare: Carl Palmquist, 19XXXXXX-XXXX

Objekt: Bostadsrättslägenhet nr 1204, Furusundsgatan 14, 115 37 Stockholm
Bostadsrättsföreningen Furusund, org.nr 769600-XXXX

Köpeskilling: 4 950 000 kronor
Tillträdesdag: 2026-09-01

Lägenheten omfattar 3 rum och kök om 78 kvm med balkong.
Lägenheten överlåtes i befintligt skick. Köparen har beretts tillfälle att
undersöka lägenheten och godtar dess skick.`,
  },
  {
    id: "kontoutdrag",
    fileName: "Kontoutdrag mars.pdf",
    text: `SWEDBANK — KONTOUTDRAG
Konto 8327-9 123 456 789-0
Period 2026-03-01 – 2026-03-31

2026-03-03  KORTKÖP ICA MAXI               -842,00
2026-03-07  ÖVERFÖRING SPARKONTO        -5 000,00
2026-03-12  KORTKÖP BAUHAUS SICKLA      -4 512,00
2026-03-15  LÖN ACME AB                 32 400,00
2026-03-28  AUTOGIRO HYRA                -8 950,00

Ingående saldo 12 300,00   Utgående saldo 25 396,00`,
  },
  {
    id: "kvitto",
    fileName: "Kvitto Bauhaus.pdf",
    text: `BAUHAUS SICKLA
Kvitto 4471-002913
2026-03-12 14:22

2 st Klinker Calacatta 60x60      1 998,00
1 st Fästmassa Weber 20kg           289,00
4 st Fogmassa grå                   436,00
1 st Våtrumsmatta 3x2m            1 789,00

Totalt inkl moms                  4 512,00
Varav moms 25%                      902,40
Betalt med kort ****4471`,
  },
  {
    id: "forsakringsbrev",
    fileName: "Försäkringsbrev hemförsäkring.pdf",
    text: `FÖLKSAM — FÖRSÄKRINGSBREV
Hemförsäkring Stor, avtalsnummer 55-812-993

Försäkringsställe: Furusundsgatan 14, 115 37 Stockholm
Försäkringstid: 2026-01-01 – 2026-12-31
Premie: 3 240 kr per år

OMFATTNING
Lösöre upp till 1 500 000 kr. Bostadsrättstillägg ingår och omfattar
ytskikt i kök och badrum som bostadsrättshavaren ansvarar för enligt
föreningens stadgar. Självrisk 1 800 kr.`,
  },
];

function parseArgs(argv) {
  const args = { models: ["gpt-4o-mini"] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--models") args.models = argv[++i].split(",").map((s) => s.trim());
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log(`\nRenofine eval · scope gate (P4.0 — an unrelated document must add nothing)`);
  console.log(`models: ${args.models.join(", ")}`);
  console.log(`cases:  ${CASES.length}\n`);

  const rows = [];
  for (const model of args.models) {
    for (const c of CASES) {
      const row = { model, caseId: c.id, type: null, rooms: 0, globals: 0, pass: false, error: null };
      try {
        const raw = await callModel(
          model,
          buildMergedSystem("sv"),
          buildMergedUser(c.text).replace('arbetsbeskrivning.pdf', c.fileName),
          { temperature: GEN_TEMPERATURE, jsonObject: true }
        );
        const parsed = safeParseJson(raw);
        if (!parsed.ok) {
          row.error = "unparseable JSON";
        } else {
          const v = parsed.value;
          row.type = v.type ?? null;
          const scope = v.scope ?? null;
          row.rooms = Array.isArray(scope?.rooms) ? scope.rooms.length : 0;
          row.globals = Array.isArray(scope?.globalWorkTypes) ? scope.globalWorkTypes.length : 0;
          // Two ways to be right: not scope-bearing at all, or scope-bearing
          // with nothing in it. Both leave the project untouched.
          row.pass = !SCOPE_BEARING.includes(row.type) || (row.rooms === 0 && row.globals === 0);
        }
      } catch (e) {
        row.error = String(e.message || e);
      }
      rows.push(row);
      const verdict = row.error ? `ERROR ${row.error}` : row.pass ? "PASS" : "FAIL";
      console.log(
        `  [${model}] ${c.id}: type=${row.type} rooms=${row.rooms} globals=${row.globals} → ${verdict}`
      );
    }
  }

  const failed = rows.filter((r) => !r.pass);
  console.log(`\n──── SUMMARY ────`);
  console.log(`${rows.length - failed.length}/${rows.length} kept their hands off the project.`);
  if (failed.length) {
    console.log(`FAILED: ${failed.map((f) => `${f.caseId} (${f.type}, ${f.rooms} rum)`).join(", ")}`);
  }

  const outDir = join(HERE, "results");
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, `scope-gate-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify({ rows }, null, 2));
  console.log(`\nsaved ${file}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

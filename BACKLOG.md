# Renofine Backlog

Live backlog för Renofine — **en samlad sanning** för allt: produkt/features, tagna
byggbeslut OCH go-to-market (FB-grupper, outreach, demo-videos). Läses och skrivs av
pappens Developer-flik. Format: se /Users/calpa/Developer/PA/BACKLOG_FORMAT.md

Detaljplaner för många items bor i /Users/calpa/Developer/Renofine/.claude/memory/project_*.md
(Claudes minne). Levererat flyttas till `status: done` och loggas i `.claude/memory/shiplog.md`.

## Goals
- Bli verktyget en byggare eller projektledare faktiskt öppnar varje dag i ett pågående projekt
- Beta till betalande: landa de första betalande projekten
- Behåll kärnan vass, ingen feature utan tydlig användarnytta

---
id: fb-grupper-outreach
status: todo
priority: P1
tags: [growth, launch]
created: 2026-06-12
---
## Facebook-grupper: posta + värva betatestare
**Mål:** 20–30 nya betatestare på 1–2 veckor via FB-grupper. **Strategi:** "mobilen
övertygar" — alla läser posten på mobilen, demon måste sitta där.
Källfiler: `.claude/briefs/fb-launch-kit.md` + `.claude/briefs/fb-post-varianter.md`.

### 0. Innan första posten (15 min, en gång)
- [ ] **Ta 2 skärmdumpar på iPhone:** (1) Översikt-vyn i demoprojektet (rumsfoto + kort — snyggaste mobilvyn), (2) planritningen eller budgetvyn på desktop. Poster med bild får mångdubbelt fler svar.
- [ ] **Testa demon kallt:** öppna renofine.com i privat flik på mobilen → "Se demoprojekt" → bekräfta att det imponerar utan inloggning.
- [ ] **Öppna PostHog** (session recordings) i en flik — titta samma kväll som du postar.
- [ ] Ha `Interviews/`-mappen eller ett kalkylark redo för loggen (se §6).

### 1. Postningsregler (ordning spelar roll)
1. **Gå med i grupperna NU** — många har 1–3 dagars godkännandetid. Svara ärligt på medlemsfrågorna ("bygger en renoveringsapp, söker feedback").
2. **Läs gruppens regler före varje post.** Står det "ingen reklam" → skicka meddelande C till en admin först. Vissa grupper har "reklamfredag/söndag" — använd den.
3. **Max 2–3 grupper per dag.** Sprid över 1–2 veckor — du hinner svara på kommentarer, och FB flaggar identiska massposter som spam.
4. **Variera texten per grupp** (en unik variant per grupp, se §3) — FB:s spamfilter + det ser ärligare ut.
5. **Bästa tider:** tis–tors 19–21, söndag 10–12. Undvik fredag kväll/lördag.
6. **Bild på varje post:** mobil-skärmdumpen av Översikt-vyn först, desktop-bilden som tvåa. Aldrig bara länk.
7. **Posta D (egen profil) först av allt** — varma kontakter ger snällaste första testarna, du övar på frågorna.

### 2. Grupplista — bocka av när postat (sök upp, verifiera storlek/aktivitet själv)
Manus per grupp finns i fliken **`fb-post-varianter.md`** — hoppa dit, kopiera, kom tillbaka och bocka av här. Lägg till `· postat ÅÅÅÅ-MM-DD` efter raden om du vill datum-logga.

**Postat 2026-06-23 (generisk text, ej variant-anpassad):**
- [x] **Inredning, inspiration & renovering** (Hemägare) · postat 2026-06-23
- [x] **Inredning, inspiration & renovering (utan regler)** (Hemägare) · postat 2026-06-23
- [x] **Bygg och Renovering i Stockholm** (Hemägare/blandat) · postat 2026-06-23 + foto
- [x] **Hitta Snickare, Målare i Stockholm** (Hitta-hantverkare) · postat 2026-06-23
- [x] **Jag vill hitta en plattsättare, målare, snickare, vvs** (Hitta-hantverkare) · postat 2026-06-23
- [x] **Jag vill hitta målare, snickare och elektriker** (Hitta-hantverkare) · postat 2026-06-23
- [x] **Claude Code Sverige** (AI/dev) · postat 2026-06-23 (två-appar-text: Renofine + GetProdulog)
- [x] **Vibe Coding - Sverige** (AI/dev) · postat 2026-06-23 (två-appar-text)
- [x] **AI Sverige** (AI/dev) · postat 2026-06-23 (två-appar-text)

> ⚠️ Lärdom: 9 grupper på ~11 min med nästan identisk text → FB:s spamfilter triggas lätt, och varje grupp förtjänar en egen vinkel. Nästa runda: max 2–3/dag, en unik variant per grupp (P1–P3 till proffs, V-serien till hemägare), alltid bild. "Hitta-hantverkare"-grupper är hemägare som SÖKER proffs — där passar hemägar-vinkeln (V2/V4), inte proffs-texten.

**Kvar att posta (en unik variant var):**
- [ ] **Egen profil + ev. story** (Privat) → variant **D** — borde postats FÖRST
- [ ] **Din lokala stadsgrupp** (Lokal) → variant **V1**
- [ ] **"Vi som renoverar"** (Hemägare) → variant **V2**
- [ ] **"Hus, hem & renovering"** (Hemägare) → variant **V3**
- [ ] **"Vi som bor i hus"** (Hemägare) → variant **V6**
- [ ] **"DIY – gör det själv"** (Hemägare) → variant **V5**
- [ ] **"Bygga & renovera hus"** (Hemägare/nybygge) → variant **V7**
- [ ] **"Hantverkare i Sverige"** (Proffs) → variant **P1**
- [ ] **"Snickare"** (Proffs) → variant **P2**
- [ ] **"Småföretagare inom bygg"** (Proffs) → variant **P3**
- [ ] **byggahus.se-forumet** (Forum, ej FB) → V2 omskriven, läs deras regler
- [ ] Grupper med reklamförbud: skicka variant **C** (admin-DM) innan du postar

### 3. Manustexterna bor i egen flik
Alla texter ligger i fliken **`fb-post-varianter.md`** — copy-paste därifrån, bocka av i §2 här. Hemägare: V1–V7. Proffs: P1–P3. AI/dev-grupper: **P4** (byggprocess-vinkeln, ej säljpitch). Admin-DM: C, egen profil: D. Full spelbok med svarsmallar m.m. i fliken **`fb-launch-kit.md`**.

### 4. Svarsplaybook (första timmen avgör)
- **Svara på ALLT inom en timme** första kvällen. En post med 10 kommentarer bubblar upp i flödet; en med 0 dör.
- "Kostar det?" → *"Gratis hela betan, inget kort. Early adopters får förmånligt pris när betalplaner kommer."*
- "Finns det app?" → *"Funkar direkt i mobilens webbläsare, ingen installation."*
- "Hur skiljer det sig från X?" → ärligt + en konkret styrka (ROT-beräkning i offerten / dela med hantverkaren / planritning). Skäll aldrig på konkurrenten.
- Skeptiker/gnäll → tacka för synpunkten, bjud in: *"Exakt sånt här behöver jag höra — testa 5 min och säg var det brister?"*
- Intresserade hantverkare → flytta till DM, boka 15 min (manus i `outreach-kit.md` §5–6).
- **Aldrig försvara, alltid fråga.** Du lär dig, du säljer inte.

### 5. Samma kväll + dag 2
- **Titta på PostHog-inspelningarna** av kvällens besökare — var fastnar de? Det är din buggrapport ingen skriver. (Kvällscoach-rutin aktiv, Google Calendar 19:30.)
- Dag 2: svara på nattens kommentarer, lägg en uppföljningskommentar på egna posten om något hänt ("Wow, 15 testare första dygnet — tack!").
- Buggar som rapporteras: svara *"Fixat — ladda om!"* så fort det är ute. Snabb loop = lojala testare.

### 6. Logg (en rad per post/kontakt)
| Datum | Grupp | Variant | Reaktioner | Kommentarer | DM:s | Signups (PostHog) | Bästa citat |
|------|------|------|------|------|------|------|------|
| | | | | | | | |

PostHog-mått per vecka: besökare → demo-öppningar → signups → dag-2-retur.

---
id: demo-videos
status: todo
priority: P2
tags: [growth, launch]
created: 2026-06-12
---
## Spela in 3 demo-videos
Bullet-scripts i PA: `projects/renomate/demo-videos-scripts.md`. Demoprojekt finns redan i appen.
1. "Vad är Renofine?" (60–90 sek) — prioritera först
2. Hemägare-genomgång (2–3 min)
3. Byggare-genomgång (2–3 min)
Verktyg: Loom eller QuickTime. Använd i FB-poster + landningssida.

---
id: vc-peter-muir
status: todo
priority: P3
tags: [growth]
---
## Svara Peter Muir (33East VC)
Draft finns i PA: `projects/renomate/vc-pitch.md`. Uppföljning på inkommande VC-intresse.

---
id: joel-jansson-betatestare
status: todo
priority: P3
tags: [growth]
---
## Joel Jansson — betatestare (uppföljning)
Beta-testare, byggstart april, projektleder mellan arkitekt/byggare. Svarat på LinkedIn,
invänta att han testar appen. Passiv uppföljning — ping om tyst.

---
id: taulant-bara-lead
status: doing
priority: P2
tags: [growth, lead]
created: 2026-06-24
updated: 2026-07-05
---
## Taulant Bara — lead från FB-kampanjen (aktiv dialog)
Första riktiga leaden från FB-rundan 2026-06-23. Mejl: taulant.bara@icloud.com,
tel 070 573 44 88.
**Profil:** IT-administratör, Malmö stads grundskoleförvaltning. Vid sidan av jobbet
**köper/renoverar/säljer lägenheter** (fix-and-flip, flera projekt) — stark ICP +
affärsmässigt skarp. Intresserad av AI.
**Validerade moaten oombedd:** fastnade mest för **rum↔arbetsmoment-strukturen**
("logiskt, enkelt att följa") — exakt det domän-system research+evals pekade ut som
vallgraven, ej översättningen.
**Dialog (mejl):** ställer investerar-/strategifrågor (abonnemang vs plattform,
framtiden för bolaget). Carl svarat ärligt: abonnemang proffs-först → plattform på sikt
(affiliate/finansiering), traction före monetisering. Ställt intent-fråga tillbaka
("nyfikenhet eller vill du vara med och påverka") — **ej besvarad än**.
**2026-07-03 — Taulant svarade (varmt, starkt):** bekräftade affärsmodell-tänket,
självidentifierade som ICP (renoverar ~2 lgh/år, gör mycket själv, lever i struktur/admin),
**betalningsvillig om det sparar tid**, vill aktivt betatesta + ge ärlig feedback, öppen för
samtal "längre fram". **Föreslog oombedd RÖSTINMATNING** (mic → AI tolkar → placerar i projektet)
— exakt det agentiska spår vi just byggt (se [[project_agentic_strategy]]). Carl **skickade svar**
(tackade, bekräftade röst-idén, erbjöd beta-tillgång + guidning, ankrade samtal mjukt mot hans
nästa renovering). Utkast: scratchpad `taulant-svar.txt`.
**2026-07-05 — Taulant-paketet klart (allt tekniskt grönt):** P1–P4 levererade (röst på alla
flikar, skaffoldning, expert-hjärnan, describe-först-onboarding). Välkomstmejl-utkast med
15-min-testväg skrivet (scratchpad `taulant-valkomstmejl.txt`, på urklipp). OBS: pusha main
(P4 + kvitto-fix) FÖRE utskick — testvägen förutsätter describe-steget på prod.
**Testväg i mejlet:** skapa konto (Hemägare) → beskriv projekt med rösten i steg 1 → Renaida-capture
inne i projektet (uttag/klart/timmar) → expertfråga ("vilken ordning i badrummet?") → Ge feedback.
**PostHog-uppföljningsritual (samma kväll som han testar):** (1) filtrera person på
taulant.bara@icloud.com, (2) titta hans session recordings i sin helhet, (3) följ eventen
renaida_proposed/applied/corrected/dismissed + signup→projekt-tratten, (4) notera var han
fastnar/avbryter → nästa fix. Kärnfrågan i mejlet = hans norrstjärna: sparar det TID?
**Nästa:** Carl skickar mejlet (efter push). När Taulant testat → PostHog-ritualen + ev. samtal.
Bevaka advisor-/partnerlutning.

---
id: agent-mode-additive-flag
status: todo
priority: P1
tags: [architecture, agent-ui, safety]
created: 2026-06-26
---
## Agentiskt läge = opt-in ovanpå manuellt (aldrig ersättning)
Strategisk omställning 2026-06-26 (agent-UI-linsen). Designregel som gäller alla
thesis-* poster: alla dagens manuella flöden bevaras som förstklassig väg
("2021-appen" — smart manuell app). Agenten ligger bakom feature-flag, auto-körs
aldrig på befintliga projekt, och kan stängas av med en kill-switch. Drag 1
(motor-exponering) är additivt/refaktor-bakom-stabilt-gränssnitt och rör inte
befintligt beteende.

---
id: agent-cost-guardrails
status: todo
priority: P1
tags: [cost, ai, safety, agent-ui]
created: 2026-06-26
---
## Kostnadsgrindar för agentflödet
Bunden deterministisk pipeline (fasta, räknebara steg — ej autonom loop). Behåll
gpt-4o-mini + befintlig översättnings-cache (task_translations). Human-approve före
varje betalt steg = kostnadsgrind. Usage-logg + per-användare/per-projekt-kvot +
hård OpenAI billing-cap (sätt idag). Beta: server-side API-nyckel, testare matar EJ
in egna nycklar. Modellval: stanna billigt, låt evals avgöra ev. uppgradering per motor.

---
id: engine-pure-translate-contract
status: todo
priority: P2
tags: [api, ai, agent-ui]
created: 2026-06-26
updated: 2026-06-26
---
## Drag 1: Frikoppla translate-task-content från DB (ren content-in/ut-kärna)
**GRINDAD (nedprio P1→P2 2026-06-26 per research):** påbörjas FÖRST när
`translate-domain-vs-commodity-eval` bevisat precisions-gapet vs DeepL. Bygg inte
API-paketeringen innan moaten är verifierad.
Idag tar fn {taskIds[], targetLanguage} och läser/skriver tasks + task_translations.
Extrahera en ren kärna {items:[{id,title,description,checklists}], targetLanguage} →
översatt innehåll, noll DB. UI-vägen blir tunn wrapper ovanpå (befintligt beteende
oförändrat). Kärnan finns redan i evals/run.mjs (prompt-nivå) — lyft därifrån.
Förutsättning för agent-/MCP-exponering.

---
id: generate-checklist-evals
status: done
priority: P1
tags: [ai, evals, agent-ui]
created: 2026-06-26
updated: 2026-06-26
---
## Drag 1: Evals för generate-work-checklist (byggd + baseline körd)
Suite byggd: `evals/dataset/generate-work-checklist.json` (8 bygg-fällor),
`evals/run-checklist.mjs`, scorers (struct, count 4–10, verbatim, LLM-judge för säker
ordning/material/inga-inköp). **Baseline körd 2026-06-26** (gpt-4o-mini, sv) — avslöjade
att motorn är SVAG (se `checklist-engine-quality`). Eval-bygget klart; kvalitetsarbetet
är eget item.

---
id: checklist-engine-quality
status: todo
priority: P1
tags: [ai, agent-ui, moat, bugfix]
created: 2026-06-26
---
## Härda checklistemotorn — moaten är svag (eval-fynd 2026-06-26)
Baseline (`run-checklist.mjs`, sv): **judge 2.75/5, 18 kritiska, verbatim 67%, count 88%**
— vs 5.00/5 för översättning/extraktion. Detta är funktionen vi pekat ut som vallgraven,
och den är motorns svagaste del. Allvarliga fel: tätskikt EJ före kakel (våtrum 1/5),
golv utan acklimatisering/underlag + tappade brand/mått, väggmålning utan spackel/grundning
+ inköpssteg smiter in, rivning utan vattenavstängning/dammskydd, spotlights utan "behörig
elektriker", count >10. **Fix-plan (eval-driven):** (a) skärp prompten i
`generate-work-checklist/index.ts` — domän-specifik säkerhetsordning (tätskikt→kakel,
avstängning→rivning, maskering→färg), prep-steg (grundning/acklimatisering/spackel),
hårdare no-purchasing + verbatim-koder, ev. few-shot; (b) om prompt ej räcker, låt evalen
avgöra modelluppgradering (gpt-4o/claude) bara för denna motor; (c) count-cap. Verifiera
med `node evals/run-checklist.mjs`. KRÄVER DEPLOY efter fix.

---
id: translate-domain-vs-commodity-eval
status: done
priority: P1
tags: [ai, evals, agent-ui, moat]
created: 2026-06-26
updated: 2026-06-26
---
## Drag 1: Multi-engine eval-experiment (avslutat — lärdom, ej strategisk pelare)
**OBS framing korrigerad 2026-06-26:** DeepL är INTE en Renofine-konkurrent — ingen
renoverar med DeepL. Head-to-head:en var fel artefakt som "konkurrensbevis". Behåll
den inte som säljpelare.
**Vad som faktiskt gjordes:** byggde multi-engine-stöd i eval-harnessen
(`run-baseline.mjs` + `lib/translate-fields.mjs` + `callDeepL`,
`buildGenericTranslateSystem` — rör ej `run.mjs`) och körde renofine vs generic-llm
vs deepl (gpt-4o-mini, PL+DE).
**Resultat:** renofine 5.00/5 0 kritiska · generic-llm (naiv LLM) 5.00/5 0 kritiska ·
deepl 4.38/5 4 kritiska (t.ex. "takfärg"→yttertaksfärg). Resultat:
evals/results/baseline-*.json.
**Vad det är värt (ärligt):** (1) Eval-muskeln tränad + harnessen kan nu jämföra
modeller/motorer — återanvändbart. (2) En *värde-berättelse* för marknadsföring:
"arbetaren slipper klistra in svensk instruktion i Google Translate som gör takfärg
till yttertaksfärg — den är redan korrekt." EJ ett benchmark.
**Vad det INTE bevisar:** översättning är ingen teknisk moat (naiv LLM matchade oss).
→ Moaten = bygg-domän-SYSTEMET (checklistor, spec-medvetenhet, arbetsflöde, godkänn-
grind). Nästa eval som faktiskt rör användare: **AI-extraktion** (quote/kvitto→rum/
arbeten/budget — idag omätt, fel där korrumperar projekt tyst).

---
id: engine-agent-api-surface
status: todo
priority: P2
tags: [api, mcp, auth, agent-ui]
created: 2026-06-26
---
## Drag 1: Agent-anropbar yta — API-nycklar + MCP-server för de två motorerna
Ny endpoint/server BREDVID de befintliga (ersätter inget). API-key-utgivning + rate
limit + usage-logg (frikopplad från Supabase user-JWT). Versionerat JSON-kontrakt.
Tunn MCP-server som exponerar generate_work_checklist + translate_work_content som
tools. Beror på engine-pure-translate-contract + agent-cost-guardrails.

---
id: thesis-agent-orchestrator-spec
status: todo
priority: P1
tags: [ai, agent-ui, architecture]
created: 2026-06-26
---
## Drag 2: Orkestrator-spec — beskrivning → checklista → översätt → fördela (+ approve)
Kedja ihop parse-renovation-description → generate-work-checklist →
translate-task-content → worker-flödet under en agent, med explicit human-APPROVE
mellan förslag och utskick. Motorerna finns — detta är orkestrering + state + var
godkännandet sitter. Bunden pipeline (se agent-cost-guardrails). Spec först, ej kod.

---
id: approve-not-operate-ux
status: todo
priority: P1
tags: [ux, agent-ui]
created: 2026-06-26
---
## Drag 2: "Godkänn, inte operera"-UX för entreprenörsflödet
Bygg om hantverkar-/hemägar-ytan så agenten föreslår checklistor/tilldelning och
människan godkänner/justerar — aldrig handmatar. Kilen mot "ännu en projektapp".
Opt-in ovanpå manuellt flöde (se agent-mode-additive-flag). Beror på
thesis-agent-orchestrator-spec.

---
id: multilang-crew-assignment
status: todo
priority: P2
tags: [feature, agent-ui, i18n]
created: 2026-06-26
---
## Drag 2: Flerspråkig lagtilldelning (payoffen)
Uppgifter ut till icke-svensktalande montörer med språk per person, byggt på
worker-* + översättningsmotorn. "Agenten som får ditt flerspråkiga bygglag att
förstå jobbet rätt" — SE/DE med utländsk arbetskraft. Beror på approve-not-operate-ux.

---
id: proffs-bygglet-gap
status: todo
priority: P2
tags: [feature, pro]
---
## Proffs-flödet — kvarvarande Bygglet-gap
Fas 1–6, 8, 10+ levererade. Kvar: **E-post-ingest för fakturor** (P2), **Fortnox API**
(kräver partnerskap), **Arbetsorder + GPS**, **EDI-följesedlar** (grossist-partnerskap),
**Factoring** (partnerskap), XML→Skatteverket för personalliggare.
Detaljer: `.claude/memory/reference_competitor_bygglet.md`

---
id: role-based-ux-audit
status: todo
priority: P2
tags: [feature, ux]
---
## Role-based UX audit — per-tab visibility
Route guards + CTA gating klart. Kvar: per-tab visibility för alla 4 inbjudna roller
(inkl. läck-fix L3: PurchaseOrderDetailSheet visar vendor_name/price_total omaskat för
UE-medlem Mode None). Detaljer: `.claude/memory/project_role_based_ux_audit.md`

---
id: ai-onboarding-edge-cases
status: todo
priority: P2
tags: [feature, ai]
---
## AI-onboarding — edge cases
Quote-upload MVP klar. Robustera: inga rum/tasks extraheras → vad händer? Felmeddelanden?
Edit-preview innan create? Detaljer: `.claude/memory/project_ai_onboarding_flow.md`

---
id: parse-overeager-global-worktypes
status: done
priority: P2
tags: [bugfix, ai, evals]
created: 2026-06-26
updated: 2026-06-26
---
## parse-renovation-description: överivrig globalWorkTypes (eval-fynd → fixat)
**Hittat & fixat 2026-06-26 via eval-driven-fix.** Buggen: trade-lista i totalentreprenad
("kan hålla i allt: snickeri, el") hamnade i `globalWorkTypes` → fantom-uppgifter i alla rum.
**Fix (alt b):** deterministisk guard i `parse-renovation-description/index.ts` — behåller
globals bara om beskrivningen har spatial trigger ("i hela", "överallt", "alla/varje/samtliga
rum"). Speglad i `evals/lib/extraction-scorers.mjs` (`applyGlobalGuard`) så evalen mäter
produktionsbeteende. **Verifierat:** full svit 0 kritiska, globAcc 100%; trap-fallet droppar
globals, `true-global-flooring` ("i hela lägenheten") behåller dem. **⚠ DEPLOY KRÄVS:**
`supabase functions deploy parse-renovation-description`.

---
id: role-separation-arkitektur
status: todo
priority: P3
tags: [refactor, architecture]
---
## Role-separation arkitektur
Separata komponentträd för hemägare/proffs. Beslut taget, ej implementerat. ~1 vecka.
Detaljer: `.claude/memory/project_role_separation_architecture.md`

---
id: unified-purchase-budget
status: todo
priority: P3
tags: [refactor]
---
## Unified purchase + budget — slutför
Materialbudget + inköpsorder som samma data på tidsaxel. Block 1–6 levererade.
Kvar: split-rad-funktion (Block 5, deferred) + sunset V1 process-document (~2v wait).
Detaljer: `.claude/memory/project_unified_purchase_budget_model.md`

---
id: unified-document-extraction
status: todo
priority: P3
tags: [refactor, ai]
---
## Unified document extraction
Slå ihop process-receipt + process-document till en endpoint med union-schema. ~2 dagar.
Detaljer: `.claude/memory/project_unified_document_extraction.md`

---
id: drop-total-budget-column
status: todo
priority: P3
tags: [cleanup, db]
---
## Droppa projects.total_budget-kolumnen
Separat migration efter att budget-split verifierats i prod ett tag. Bakåtkompat-skydd
tills allt UI-arbete bekräftats.

---
id: post-activation-guidance
status: todo
priority: P3
tags: [feature, ux]
---
## Post-activation guidance
Guida ägare att fylla i rumsdetaljer efter aktivering.
Detaljer: `.claude/memory/project_post_activation_guidance.md`

---
id: intake-form-redesign
status: todo
priority: P3
tags: [feature, ux]
---
## Intake-form redesign
Fritext-AI istället för checkboxar. 4 steg: berätta → rum → bilder → kontakt.
Detaljer: `.claude/memory/project_intake_redesign_plan.md`

---
id: batch-smart-tolk
status: todo
priority: P3
tags: [feature, ai]
---
## Batch Smart Tolk
Bulk-tolkning av 50+ filer. Progress bar, sammanfattningstabell, smart filnamnsbyte.
Detaljer: `.claude/memory/project_batch_smart_tolk.md`

---
id: joel-beta-features
status: todo
priority: P3
tags: [feature]
---
## Joel beta-features
DM via avatar-click, quote→tasks structured extraction, canvas↔room bidirectional linking.
Detaljer: `.claude/memory/project_joel_beta_features.md`

---
id: alla-rum-shortcut
status: todo
priority: P3
tags: [feature, ux]
---
## "Alla rum" UX-shortcut
Multi-select rooms i planning/quotes/wizard. "Alla rum" visas när alla rooms valda.
Detaljer: `.claude/memory/project_alla_rum_feature.md`

---
id: taskstab-toolbar-layout
status: todo
priority: P3
tags: [feature, ux]
---
## TasksTab toolbar-layout
Filter + add-knapp ovanför timeline. Detail-toolbar mellan sektionerna.
Detaljer: `.claude/memory/project_tasks_tab_toolbar_layout.md`

---
id: landing-page-v2
status: todo
priority: P3
tags: [growth, ux]
---
## Landing Page v2
Editorial redesign. Redo att implementera.
Detaljer: `.claude/memory/project_landing_page_v2.md`

---
id: i18n-locale-audit
status: todo
priority: P3
tags: [cleanup, i18n]
---
## i18n locale-audit + ROT-lokalisering per marknad
Granska översättningar, ROT-stöd per marknad (SE klar).
Detaljer: `.claude/memory/project_i18n_locale_audit.md`

---
id: ai-verification-pass
status: todo
priority: P4
tags: [ai, idea]
---
## AI verification pass (2-pass actor-critic)
Bygg endast om anti-lazy-prompt inte räcker långsiktigt. ~halvdag.
Detaljer: `.claude/memory/project_ai_verification_pass.md`

---
id: start-page-redesign
status: todo
priority: P4
tags: [ux, idea]
---
## Start page redesign
Utöver dashboard A/B (som är pausad). Detaljer: `.claude/memory/project_start_page_redesign.md`

---
id: post-project-phase
status: todo
priority: P4
tags: [feature, idea]
---
## Post-project phase
Garantibevakning, manualer, underhållsläge efter avslutat projekt.
Detaljer: `.claude/memory/project_post_project_phase.md`

---
id: feedback-pipeline
status: todo
priority: P4
tags: [feature, idea]
---
## In-app feedback pipeline
In-app feedback → `user_feedback`-tabell. Detaljer: `.claude/memory/project_feedback_pipeline.md`

---
id: tax-deduction-multicountry
status: todo
priority: P4
tags: [feature, idea]
---
## Tax deduction multi-country (Fas 2)
Generalisera ROT till DE/US. Detaljer: `.claude/memory/project_tax_deduction_framework.md`

---
id: files-page-part2
status: todo
priority: P4
tags: [refactor, idea]
---
## Files page Part 2
Extrahera table views ur 2500-radig fil. Detaljer: `.claude/memory/project_files_ux_review.md`

---
id: sharing-team-merge
status: todo
priority: P4
tags: [idea, parked]
---
## Delning + Team merge
Diskussion parkerad. Sharing levererad. Detaljer: `.claude/memory/project_sharing_team_merge.md`

---
id: seo-www-apex-redirect
status: done
priority: P2
tags: [growth, seo]
updated: 2026-06-17
---
## SEO: www→apex 301-redirect (Cloudflare)
GSC "Duplicate without user-selected canonical" — www + apex svarade båda 200. Satte
Single Redirect-regel via Cloudflare API (www.renofine.com → https://renofine.com, 301,
path+query bevaras). letsrenomate.com redirectade redan. Verifierat live.

---
id: seo-canonical-sitemap
status: done
priority: P2
tags: [growth, seo]
pr: 2cefc31
updated: 2026-06-17
---
## SEO: canonical-taggar + sitemap
Self-referencing `<link rel="canonical">` (hårdkodad apex-host → täcker även
renomate.pages.dev) via ny `<Canonical>`-komponent + statisk fallback i index.html.
Plus sitemap.xml (8 publika sidor) + Sitemap-direktiv i robots.txt. Deployad & verifierat
live på apex + pages.dev. **Kvar (manuellt): GSC → "Validate Fix" + skicka in sitemap.**

---
id: guest-signup-migration
status: done
priority: P1
tags: [bugfix, onboarding]
pr: d359c4b
updated: 2026-06-12
---
## Gäst-projekt följer med vid signup
Gäst-wizardens projekt försvann vid signup (migration kollades bara på /auth + kolumnnamn-bugg
language_preference). Fix: auto-migrera vid signup + säkerhetsnät på /start. E2E-verifierat.

---
id: edge-functions-cors-deploy
status: done
priority: P3
tags: [cleanup, ops]
updated: 2026-06-17
---
## Deploya edge functions (localhost:5002 CORS)
29 funktioner fick localhost:5002 i CORS-listan. Deployade alla via supabase functions deploy,
verifierat CORS reflekterar både ny origin + prod. Prod oförändrat.

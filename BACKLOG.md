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
id: scaffold-project-engine
status: doing
priority: P2
tags: [arkitektur, agent, single-source, renaida]
created: 2026-07-15
---
## 🏗️ En motor för projektskapande (single source of truth)

Projekt-*skapande* är idag utspritt över ≥4 ställen som var för sig kör egna
inserts: `intakeService.createProjectFromGuidedSetup` + inline-kod i
`AIProjectImportModal`, `PlanningSmartImportDialog`, `QuoteReviewDialog`. Det
bryter single-source-of-truth och blockerar att en agent (Renaida) kan styra
projektskapande rent. Konsolidera till EN dokumenterad `scaffoldProject`-motor
som wizarden, importörerna OCH framtida mapp-ingest/Renaida alla kallar.
Self-explaining (returnerar skapade id:n + `decisions[]`). Prerekvisit för
mapp-ingest-snabbstarten och agent-drivet projektskapande.

Se stående riktning [[feedback_agent_readable_architecture]].

**Steg (fasat, ett call site i taget = låg risk):**
1. ✅ `src/services/scaffoldProject.ts` — motorn + normaliserat input-kontrakt
   (superset: projekt-meta, rum m. dimensions, tasks m. kostnad/ROT, task- +
   fristående material) + `existingProjectId` (täcker nytt OCH befintligt projekt).
   Self-explaining `decisions[]`. (commits 0c47a56, 23d2ea4)
2. ✅ `createProjectFromGuidedSetup` delegerar (behavior-preserving).
3. ✅ `AIProjectImportModal` delegerar (commit 2d3bd0b) — VAT i callern, fil-länkning
   via `taskIds`. Delta: bespoke plain-insert-fallback borttagen (getUser-refreshen
   täcker stale-token-fallet). ✅ `PlanningSmartImportDialog` delegerar via
   `existingProjectId` (commit 23d2ea4).
4. ⛔ `QuoteReviewDialog` MEDVETET UTELÄMNAD — det är ett `purchase_orders`/
   `external_quotes`-pengaflöde (inköps-domänen/PO-invarianten), inte projekt-
   skaffoldning. Hör inte hemma i motorn.

**⚠️ KVAR: inloggad E2E** av de tre migrerade vägarna (headless kunde jag bara
build/typecheck-verifiera). Verifiera: (a) skapa projekt via onboarding-wizarden,
(b) AI-import av dokument → nytt projekt, (c) PlanningSmartImport i befintligt
projekt. Alla ska ge rum+arbeten+material som förr.

---
id: folder-ingest-quickstart
status: todo
priority: P2
tags: [onboarding, agent, renaida, migrering, aktivering, distribution]
created: 2026-07-15
---
## 📁 Mapp-in → färdigt projekt (migrerings-snabbstart)

**= Fas C i epicen [[renaida-projektfodelse-multimodal]].** Bygg EFTER Fas B (härkomst/granskning) — merge-lagret skriver in i samma utkast med provenance, aldrig tyst. Ingången bor i describe-steget ("släpp hela projektmappen här").

Släpp en projektmapp → deterministisk motor klassar filerna (kvitto/faktura →
`import_purchase`, offert/scope → `process-document-v2` → rum+tasks, beskrivning
→ `parse-renovation-description`-matris, foton → rum-taggade) → EN proposal-batch
→ ConfirmDiff → luckor frågar Renaida om ("6 foton jag inte kunde placera — vilket
rum?"). Låter en ny användare "kasta in allt" och känna Renofine utan att fylla i
från noll — särskilt någon som migrerar från Excel/annat verktyg.

**~80% finns redan:** mapp-gåendet (`BatchSmartUploadDialog.readDroppedItems`,
`webkitGetAsEntry`, instängt som fil-arkiverare), extraktorerna, destinationen
(envelope + ConfirmDiff + undo). Bygget: en delad `ingestProjectFolder`-motor +
`scaffold-project-engine` (ovan) som destination.

**Avgränsning (ärlig):** desktop-migrerings-/aktiverings-wedge för NÄSTA våg —
EJ Taulant-nu (han är mobil-först, släpper ingen mapp från telefon). Ligger efter
Tier 1-tillitsfixar + `agent-cost-guardrails` (renoveringsmapp är luddigare än en
produktkatalog → lutar tyngre på betald LLM-extraktion). Bild-biblioteks-analog:
släpp befintligt fotobibliotek → auto-taggat per rum/task (samma motor).

Se [[feedback_agent_readable_architecture]] + [[project_agentic_strategy]].

---
id: iphone-rosttest
status: todo
priority: P1
tags: [carl, verifiering, mobil, taulant]
created: 2026-07-06
---
## 📱 iPhone-rösttestet — BLOCKERAR Taulant-mejlet (⏱ ~10 min)

Allt testas på **renofine.com** i mobilens Safari, inloggad med ditt vanliga konto,
i **demo-projektet** (inget viktigt kan gå sönder; Renaida frågar alltid först + Ångra finns).
När allt är grönt: skicka Taulant-mejlet (ligger på urklipp / se item taulant-bara-lead).

1. **Prata med Renaida** ⭐ — Demo-projektet → runda gröna knappen nere till höger →
   "Berätta vad som hänt" → tillåt mikrofon → säg "logga två timmar på målningen" →
   tryck stopp. RÄTT: "Tolkar rösten…" → förslagskort med Genomför-knapp.
   FEL: inget händer, eller fastnar >15 sek på "Tolkar rösten…".
2. **Tangentbordet** — tryck i textfältet längst ned i Renaida-rutan. RÄTT: fältet
   syns ovanför tangentbordet. FEL: du skriver i blindo bakom tangentbordet.
3. **Inspelningsläget** — starta rösten igen. RÄTT: knappen blir RÖD, "Spelar in —
   tryck för att stoppa" + sekundklocka. Ska vara omöjligt att missa.
4. **Gröna knappen vs menyn** — bläddra genom flikarna längst ned. RÄTT: Renaida-
   knappen svävar strax OVANFÖR menyraden utan att täcka någon knapp.
5. **Skapa projekt med rösten** — Start → Skapa → "Berätta om din renovering" →
   micken i skrivrutan → prata. RÄTT: orden blir text, inget sticker ut utanför
   skärmen. Tryck Avbryt efteråt (skapa inget).
6. **Flik-minnet** — inne i projekt: tryck Inköp → ladda om sidan. RÄTT: du landar
   på Inköp igen (inte Översikt).
7. **Checklist-papperskorgen** — öppna ett arbete → skapa checklista "TEST" → spara →
   öppna igen → papperskorgen på checklistan → stäng UTAN spara → öppna igen.
   RÄTT: borta, och rutan stängdes inte vid papperskorgstrycket. FEL: återuppstått.

Rapportera till Claude: vilken punkt + vad du såg. Grönt på 1–5 = skicka mejlet.

**2026-07-07 — första rundan körd, största missen hittad & fixad samma dag:**
Carl testade rösten på prod från STARTSIDAN (inte inne i ett projekt) → allt föll
tyst till chatten som ljög ("kan inte logga timmar") och hittade på fliknamn.
Fixat & live (`830f25f` + help-bot v19): Renaida agerar nu från startsidan
(annonserar vilket projekt hon utgår från), färsk app-load landar direkt i senaste
projektet, hjälp-boten förnekar aldrig sina förmågor. **Kör om punkt 1–5 ovan** —
nu ska rösten ge förslagskort även om du inte hunnit in i ett projekt.

**2026-07-09 — stort UI-paket live, 3 nya testpunkter (allt på renofine.com):**
8. **Kvittolänkarna** — säg "beställ tio meter golvsockel" → Genomför. RÄTT:
   kvittot listar i punktform vad som gjordes, och punktraden är GRÖN LÄNK —
   tryck på den → köpordern öppnas. Ångra efteråt.
9. **Nya arbetskortet** — öppna ett arbete. RÄTT: 3 flikar (Översikt/Ekonomi/
   Relaterat); Översikt har Beskrivning⇄Interna anteckningar-växel, checklistor
   med "Generera med AI", foton, chip-rad ("1 köporder" = tryckbar) och
   kommentarer längst ned. Kugghjulet uppe till höger döljer fält du inte
   använder. Rumsnamnet = länk in i rummet.
10. **Aktivitetsflödet** — Översikt → Aktivitet. RÄTT: Renaida-kvittoraderna är
    tryckbara och öppnar objektet de handlar om.
11. **Fota ett kvitto** ⭐ NYTT — Renaida-rutan → gem-knappen bredvid textfältet →
    "Ta foto" → fota valfritt kvitto du har hemma. RÄTT: förslagskort med
    leverantör, belopp, datum och antal rader → Genomför → tryck på kvittoraden →
    du landar på ordern i Inköp med bilden som underlag → Ångra tar bort allt.

---
id: renaida-doc-d1-kvitto-faktura
status: done
priority: P1
tags: [renaida, agent, dokument, inkop, mobil]
created: 2026-07-09
updated: 2026-07-10
done: 2026-07-10 — Byggd + E2E-verifierad lokalt (commit 1e02d26): foto → process-document-v2 → import_purchase-förslag (belopp/datum/rader synliga före Genomför) → PO delivered/ai_receipt + materialrader + underlag uppladdat & länkat → klickbar kvittorad → Ångra tar bort allt. Aldrig auto-apply (pengar bekräftas alltid). Offert/scope → vägvisning till Filer. Unik filnamnssuffix (kollisionsbugg hittad genom att köra E2E två ggr). EJ PUSHAD/DEPLOYAD ännu — Carls beslut om timing mot Taulants testrunda.
---
## 📄 D1: Kvitto + faktura via Renaida (foto/fil in i panelen)
Kamera/filknapp i Renaida-panelen → classify-document → process-document-v2 (FINNS redan, union-schema) → resultatet blir FÖRSLAG i samma kuvert → ConfirmDiff (vendor, summa, radantal, ROT) → Genomför → klickbart kvitto + Ångra. Ny action `import_purchase` i applyProposals som återanvänder kvitto-spar-flödet. **Carls beslut: skapar ALLTID inköpsorder (delivered/invoiced) + materialrader — inköpslistan är sanningen.** = Taulants "ute på bygget vill jag skanna ett kvitto" ordagrant. Plan: .claude-minnet project_renaida_document_flows.

---
id: renaida-doc-d2-offert-scope
status: done
priority: P2
tags: [renaida, agent, dokument, offert]
created: 2026-07-09
updated: 2026-07-10
done: 2026-07-10 — Byggd + E2E-verifierad lokalt (commit 4740caa + 8e5e666): gem-knappen tar PDF (Claude document-block i process-document-v2:s kvitto-path, deployad), faktura-PDF → import_purchase (Tretti-fakturan exakt rätt, .pdf-underlag, full Ångra), offert-PDF → QuoteReviewDialog FÖRIFYLLD (SLD-offerten: 120 000 kr, 2 rum, 10 rader — allt rätt), arbetsbeskrivning → PlanningSmartImport förifylld (ny initialFile-prop), Renaida kvitterar i panelen efteråt. VIKTIG BUGG HITTAD PÅ VÄGEN: RECEIPT_TOOL-schemat tillät bara receipt/invoice → offerter TVINGADES bli fakturor; nu quote/scope/other + hallucination-vakt (0 kr → unreadable). Fotade offerter (bilder) behåller vägvisning till Filer (text-extraktion kan ej läsa bilder). EJ PUSHAD till prod ännu.
---
## 📄 D2: Offert/scope via Renaida → handoff till befintlig granskning
Tunga dokument (rum+arbeten-matriser) ska INTE klämmas in som chattkort. Renaida tar emot filen, klassificerar, öppnar QuoteReviewDialog/PlanningSmartImport FÖRIFYLLD och kvitterar utfallet i aktivitetsflödet efteråt. **Carls beslut: handoff, inte allt-i-chatten** (tydlighet > chattifiering). Därefter D3: röst + foto i samma capture ("här är kvittot från Bauhaus, lägg det på badrummet"). ~1 dag.

---
id: renaida-role-gated-actions
status: doing
priority: P2
tags: [renaida, agent, roller, arkitektur]
created: 2026-07-09
progress: 2026-07-12 — commit a8a8636. Router är rollmedveten (onboarding_user_type → prompt-gate + normalize-gate), open_feature-vägvisaren byggd (contractor "förbered en offert" → /quotes/new, navigerar utan DB-skrivning, aldrig auto-apply), mottagen offert = kostnad för båda roller (redan klart via upload-handoff). Eval 33/33 (nytt golden prepare-quote-open-feature + per-fall userType-stöd). agent-route deployad. KVAR = arbetar-Renaida, se eget kort renaida-worker-assistant.
---
## 🎭 Roll-gated action-katalog + Renaida som vägvisare
Routern får onboarding_user_type i kontexten + action-vitlista per roll (samma princip som dual-view-gaten). Samma yttrande landar olika: "jag fick en offert" → hemägare: "ladda upp den så lägger jag in den"; byggare: "vill du att jag förbereder en offert?" (generate-quote-items finns, Renaida-väg saknas). Byggarflöden: skapa offert, förbereda faktura, ÄTA. Hemägarflöden: ta emot/scanna, planera mot egen budget. **+ Vägvisar-principen (Carl 2026-07-09): features som inte motiverar exekvering inne hos Renaida ska hon GUIDA till** — ny `open_feature`-action som öppnar rätt flik/dialog (gärna förifylld) via befintliga deep-links (?tab=&entityId=, open:-syntaxen); användaren kanske aldrig hittat featuren själv.

**✅ BESLUT (Carl 2026-07-12):** Renaida gör det som är logiskt för rolltypen,
frågar bara vid osäkerhet eller flera giltiga val.
- **Mottagen offert/faktura = kostnad för BÅDE hemägare och byggare** → båda kan
  ladda upp/scanna den som en kostnad (inte bara hemägare).
- **Skapa offert = ENDAST byggare.** Renaida förbereder/utkastar dokument (offert,
  faktura, ÄTA) så gott hon kan → ber om granskning → användaren **Sparar/Skickar
  själv**. Aldrig auto-skick.
- **Arbetare — skilj på typ:** instruktions-mottagaren (token/länk-baserad WorkerView,
  ej fullt konto) får en **förenklad, förtydligad Renaida** med egen välkomstfras som
  guidar "berätta vad du utfört / hur långt du kommit / ladda upp foto på arbetet".
  Inbjuden projektmedlem (eget konto) ligger närmare full Renaida.
- **Personlig kontext som växer över tid = FINNS REDAN** (`renaida_user_memory` /
  wow-engine, Fas 0–3 live). Utöka den med roll + vokabulär + projektmönster per användare.

---
id: rot-totalsemantik-beslut
status: done
priority: P2
tags: [carl, produktbeslut, renaida, dokument]
created: 2026-07-10
done: 2026-07-12 — commit 5435390. PO lagrar netto (efter ROT) + nytt rot_amount-fält; budgetens ROT-kolumn matas av importerade köp (en gång per order) + footern summerar; kortet visar brutto→ROT→"Att betala efter ROT". Migration 20260712120000 applicerad på remote. Ej pushad ännu.
---
## 💰 ROT-totalsemantik på fakturaimport (Carls beslut)

Saprunoff-fakturan (varv 15): förslagskortet visade "att betala" (56 890 kr) som
ordertotal — men det är beloppet EFTER ROT-avdrag. Ordern/budgeten borde spegla
kostnaden, inte kassaflödet. **Rekommendation:** extrahera brutto som total +
visa "Att betala efter ROT: X kr" som separat rad i kortet och på ordern.
Alternativ: behåll att-betala som total men labela tydligt (bryter mot
moms/belopps-regeln "alla belopp labellade"). Säg vilket, så bygger Claude.

**✅ BESLUT (Carl 2026-07-12):** Total = **EFTER ROT** (ROT sänker faktiskt
användarens kostnad → budget/köporder ska spegla nettot man betalar). MEN:
spara ALLTID brutto + nyttjat ROT-avdrag per order. Budgetvyn får en **egen
ROT-avdrag-kolumn/summa** som visar totalt nyttjade avdrag.
Bygg: extrahera brutto + avdrag + netto; `purchase_orders.total` = netto;
ny/återanvänd `rot_deduction`-kolumn på purchase_orders (`invoices` har redan
`total_rot_deduction`); budgetvyn aggregerar summa avdrag i egen kolumn.
Liten migration krävs om PO saknar rot-kolumn.

---
id: wizard-proffs-test
status: todo
priority: P2
tags: [carl, verifiering]
created: 2026-07-06
---
## Testa wizard-vägen som proffs (aldrig körd)

**Device:** desktop (eller mobil) · **Kontotyp:** Pro (contractor, t.ex. testkonto enligt
konvention carl.palmquist+proLäge@gmail.com). Gör: "+ Nytt projekt" → describe-wizarden
hela vägen till färdigt projekt. Kolla även nya gröna röstknappen "Beskriv jobbet med
rösten" på proffsens startsida (kräver konto med 0 projekt). Rapportera konstigheter
till Claude. (P4-rest från session 50 — Claude saknar proffs-testläge i sandbox.)

---
id: gsc-validate-sitemap
status: todo
priority: P2
tags: [carl, seo]
created: 2026-07-06
---
## Google Search Console: Validate Fix + skicka in sitemap

Öppna GSC → duplicate-without-canonical-ärendet → tryck "Validate Fix". Sedan under
Sitemaps: skicka in `https://renofine.com/sitemap.xml`. ~3 minuter. (Kvar sedan
session 46 — canonical-taggarna och sitemapen är live sedan dess, Google behöver
bara få startskottet.)

---
id: pdf-mobil-fitwidth
status: todo
priority: P3
tags: [mobil, parkerad-till-efter-taulant]
created: 2026-07-06
---
## PDF-läsning på mobil (fit-to-width)

PDF:er (offerter/ritningar) blir för breda och pyttesmå på mobilskärm. Fix kräver
react-pdf (~300KB tyngre förstaladdning) — beslutat VÄNTA till efter Taulant-utskicket,
och göras ihop med startvikt-uppdelningen nedan så vikten inte känns.

---
id: startvikt-code-splitting
status: todo
priority: P3
tags: [mobil, prestanda, parkerad-till-efter-taulant]
created: 2026-07-06
---
## Dela upp appens startvikt (7.7MB → ladda det man öppnar)

Första besöket laddar hela appen inkl. 3D-vyn och ritverktyget. På byggarbetsplats-nät
= trög första start. Fix: ladda tunga delar först när de öppnas. Ingen design behövs —
Carl säger go efter Taulant-utskicket, ~1 dags jobb.

---
id: demo-renaida-prova
status: todo
priority: P3
tags: [gtm, demo, parkerad-till-efter-taulant]
created: 2026-07-06
---
## Prova-Renaida i öppna demon (utloggade ser henne inte alls)

Kallbesökaren som klickar "Se demoprojekt" ser aldrig Renaida-knappen (kräver konto) —
vår häftigaste grej är osynlig för exakt den vi vill övertyga. Idé: begränsad prova-
Renaida i demon som visar känslan utan att spara något. Beslutat: efter Taulant.

---
id: carl-kön
status: done
priority: P1
tags: [carl, verifiering, produktbeslut]
created: 2026-07-06
updated: 2026-07-06
---
## 🙋 Carl-kön (konsoliderings-logg — UPPSTYCKAD i egna kort)

Denna samlingslista är ersatt av egna To Do-kort (regel: allt som väntar på Carl =
eget kort med status todo, direkt). Kvarvarande Carl-kort: `iphone-rosttest` (P1,
blockerar Taulant), `wizard-proffs-test`, `gsc-validate-sitemap` + befintliga
`taulant-bara-lead`, Peter Muir, Joel, FB/demo-videos. Parkerade byggen:
`pdf-mobil-fitwidth`, `startvikt-code-splitting`, `demo-renaida-prova`.

### ✅ Leverans-logg 2026-07-06
- Mobil-först-paketet: Whisper-röst (iPhone+Android), tangentbordssäker panel,
  44px touch-mål, FAB-fix, wizard-dialogfix (`0ffce2b` m.fl.)
- Varv 12-buggarna: flik överlever reload, checklist-papperskorg persisterar +
  håller dialogen öppen, tabell synkas efter Renaida (`bf094fc`, `754f985`)
- Alla 7 godkända produktbeslut: budget-vägran, riktig tilldelning (eval 27/27,
  agent-route deployad), Meddelanden-rename, röst-direkt + proffs-röstingång,
  nyast överst, papperskorg bakom ⋯, kort-klickbarhet verifierad
  (`bc0d4d2` + `7979de2`)

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
**2026-07-04 — Taulant bekräftade beta-test** ("skicka över den när du tycker att den är
redo"), lovade ärlig feedback, upprepade norrstjärnan: sparar det TID i vardagen?
**2026-07-07 — Carl svarade (2 mejl, 17:17+17:22):** presenterade Renaida vid namn
(Ren-ofine + AI), ärlig "tekniken finns delvis, förbättras konstant"-ton, och ställde
två discovery-frågor: (1) vilka verktyg/lösningar använder han idag (Excel/Sheets/annat?),
(2) desktop eller mobil — var i vardagen? **Bollen hos Taulant.** Samma dag levererades
tre fixar som avväpnar hans troliga första-snubblingar: Renaida agerar från startsidan,
färsk load landar i senaste projektet, hjälp-boten förnekar inte sina förmågor.
**2026-07-08 — Taulant svarade på desktop/mobil-frågan (ICP-GULD):** validerar Carls
strategi ordagrant — "datorn är där man planerar och administrerar, mobilen är verktyget
man använder i farten"; varnar för appar som gör mobilen till desktop-kopia. Mobil på
bygget = foto, kvittoskanning, röst-/snabbanteckning, markera klart, lägga till inköp,
dagens planering ("ska gå snabbt, inte kännas omständligt"). Hans drömexempel ordagrant:
"Köket är färdigmålat. Det saknas lister och vi behöver beställa tio meter golvsockel."
→ nu GOLDEN-CASE `taulant-north-star` i evalen (29/29 PASS, agent-route v20): målning
100% + lister-not på befintlig task (dubblettregel tillagd) + köporder "Golvsockel · 10
meter" kurerad.
**2026-07-09 23:47 — Taulant svarade (STORT):** (1) **testar Renaida ordentligt de närmaste
dagarna, mobilen först** — lovar rak feedback ("säger det rakt ut"); (2) **verktygsfrågan
BESVARAD: Excel** — "budget, material och lite planering, även om det blir ganska utspritt
med bilder, kvitton och anteckningar" = ordagrant problemet D1/D2-kvittoskanningen löser;
(3) **två nya frågor: App Store/Google Play-planer + långsiktiga visionen — uttryckligen
"ur ett investerarperspektiv"** (intent-frågan från juni därmed i praktiken besvarad:
han VILL påverka/investera). **Svarsutkast klart 2026-07-10** (Excel-kroken + kvittoskanningen,
ärligt webbapp-först-svar på App Store, kort vision + förslag om videocall för
investerarsamtalet): scratchpad `taulant-svar-excel-appstore-vision.txt`, på urklipp.
**2026-07-11 ~11:49 — Carl SKICKADE svaret.** Excel-kroken + kvittoskanningen, ärligt
webbapp-först på App Store, vision (EN plats, prata med den som smartaste kollegan, mål:
majoriteten av bygg/renovering via Renofine). **Investerar-vinkeln:** öppnade mjukt för
samtal/video ("går alltid att boka in ifall du skulle vilja") + ställde nyfiken motfråga
tillbaka (vill han själv vara med, eller mest nyfiken på affären — intent-skillnaden ej
100% klar än). Låg tröskel, ingen press, bollen medvetet hos Taulant.
**Nästa:** Taulant testar mobilen (PROD har D1+D2+D3+ångra-paketet live) → **PostHog-ritualen
ovan samma kväll han testar** → ev. videocall om vision/investering när HAN initierar.

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
status: parked
priority: P1
tags: [cost, ai, safety, agent-ui]
created: 2026-06-26
updated: 2026-07-16 — PARKERAT (Carls beslut). Vid ~1 medveten betatestare finns ingen akut kostnadsbrand; server-side nyckel + billig mini-modell är enda skyddet idag och det räcker för nu. Återuppta FÖRE arbetar-Renaida (renaida-worker-assistant) eller bredare utrullning — då blir rate-limit/kvot/access-koll (infran finns i parse-renovation-description) nödvändig.
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

---
id: prod-readiness-hardening
status: todo
priority: P2
tags: [hardening, pre-launch, legal, testing, infra]
created: 2026-07-11
---
## 🧪 Pre-launch hardening (parkerad epic — plocka vid ~10+ riktiga användare)

Från prod-readiness-granskning 2026-07-11 (Adams skill, 12 dim, **4.9/10**). Full karta +
file:line i Claudes minne `project_prod_readiness_review.md`. **Medvetet beslut:** vid ~1 äkta
extern användare är detta fel fokus (distribution är flaskhalsen). Görs INTE nu — detta är
kartan för när riktiga användare finns / faktisk launch närmar sig.

**✅ GJORT nu (build-breakern — enda som var akut):** JSX-kommentar mellan attributen på
`<QuoteReviewDialog>` (`ProjectFilesTab.tsx:1761`) föll `tsc` på TS1005 → `npm run build`/deploy
failade. Var troligen "CF-bygget hänger"-gåtan i session 56. Fixad, `typecheck:strict` grön.
⚠️ Kräver `git push` för att nå Cloudflare.

**Top quick-win kvar (billig anständighet, ~5 min):** maska session-replay — Sentry
`maskAllText/blockAllMedia:true` (`main.tsx:16-17`) + PostHog `text:true` (`analytics.ts:141`).
Spelar just nu in Taulants skärm omaskad → 2 tredjeparter.

### Legal/GDPR (launch-blockers innan bredare release)
- Consent-gate före Sentry+PostHog (idag laddar de vid start utan opt-in). OBS: lägger friktion i
  onboarding → först när man faktiskt launchar, ej under Taulant-test.
- Deletion/erasure-flöde (finns inte; policyn PÅSTÅR att det går = falskt).
- Privacy-policy-rewrite: personuppgiftsansvarig, namngivna underbiträden (OpenAI/Anthropic/DeepL/
  Resend/PostHog/Sentry), laglig grund, AI-processing-disclosure. "Senast uppdaterad" = `new Date()`.

### Dependencies (26 vulns: 2 critical/5 high) — `npm audit fix` klarar det mesta
- `jspdf@4.2.0` critical CVE på PDF-export. Droppa död `fabric`-dep (+ oanvänd `emptyState.ts`).

### Infra / testing
- CI saknas (`.github/workflows` tomt). Lägg vitest + workflow (typecheck→lint→evals --no-judge→Playwright).
- Money-applier (`applyProposals.ts`) + RLS (owner+shared) otestade. 12 test-briefs i minnesfilen.
- `VITE_PINTEREST_CLIENT_SECRET` i browser-bundlen → flytta till edge-fn + rotera.
- `.env.example` saknas. Ingen dev/prod-separation (lokal dev skriver mot prod-DB). README dokumenterar fel host.

### Data integrity (money)
- Wrappa money-multi-writes i Postgres-RPC/transaktion. UNIQUE på invoice_number (dubbelimport-skydd).
  Non-negative CHECK på money-kolumner. Undo rapporterar success även vid partiellt fel.

### Perf / error handling / API (lägst urgens)
- Bundle: route-split + manualChunks (rör Taulants mobiltest). N+1 `MaterialsList.tsx:204`. `.limit()` på
  obundna listor. Retry/backoff på LLM-anrop. `_shared/`-modul (CORS kopierad 33×). Sentry `release`+`setUser`.
  `ProjectDetail.tsx:969` blank vit skärm vid load-fail. Landing-SEO (meta/OG absoluta URL:er).

---
id: task-description-primary
status: done
priority: P2
tags: [carl, ux, arbetskort, produktbeslut]
created: 2026-07-12
done: 2026-07-12 — commit c773014. Beskrivningen alltid synlig överst på Översikt-fliken, interna anteckningar egen sektion under checklistorna (toggle-växeln borttagen). Ej pushad ännu.
---
## 📝 Arbetsbeskrivningen ska premieras — separera interna anteckningar

**✅ BESLUT (Carl 2026-07-12):** Beskrivningen ska visas i FÖRSTA hand (alltid synlig,
inte gömd bakom en växel). Interna anteckningar separeras till en egen yta — annars
missar folk beskrivningen. Idag (session 53) bor båda i en toggle-växel på Översikt.
Bygg: beskrivningen alltid synlig/primär på arbetskortet; flytta interna anteckningar
till egen sektion så de inte konkurrerar med eller döljer beskrivningen.

---
id: renaida-worker-assistant
status: todo
priority: P2
tags: [renaida, agent, arbetare, worker, säkerhet]
created: 2026-07-12
---
## 👷 Förenklad arbetar-Renaida (token-baserad, eget bygge)

Carls beslut 2026-07-12 (del (e) av roll-gating): arbetare som bara får instruktioner
skickade till sig (token/länk-baserad WorkerView, INGET eget konto) ska kunna använda
en **förenklad, förtydligad Renaida** — egen välkomstfras, guidar "berätta vad du utfört /
hur långt du kommit / ladda upp foto på arbetet".

**Varför eget bygge (inte del av router-passet):** WorkerView har noll Renaida idag, och
arbetare autentiseras med share-token, inte JWT — agent-route/help-bot kräver JWT-header,
så INGEN av dem kan återanvändas rakt av. Kräver: ny/forkad edge-funktion med token-auth
(säkerhetskänsligt: rate-limit, scope till projektet/uppgifterna arbetaren fått), ny UI-
komponent i WorkerView, egen enkel prompt. Inbjuden projektmedlem (eget konto) ligger
närmare full Renaida — separat nivå.

Beror på: kostnadsgrindar (agent-cost-guardrails) bör finnas först, eftersom detta öppnar
LLM-anrop för en oautentiserad-ish yta.

---
id: ci-eval-gate
status: todo
priority: P2
tags: [agent-proposed, sil-förslag, ai, evals, ci, safety]
created: 2026-07-17
---
## 🤖 CI-eval-grind — kör golden-suiterna automatiskt på PR (regressionsbarriär)

**Agent-förslag (SIL) — triageras av Carl.** Idag körs alla 4 golden-set manuellt
lokalt (`node evals/run-*.mjs` med lokalt exporterade nycklar, se `evals/README.md`).
`.github/` innehåller bara en `.DS_Store` — inga workflows. Router-scorers straffar
redan "confident mutation on ambiguous/unmatched work" (`evals/lib/router-scorers.mjs`
:100-126) men värdet realiseras bara om en människa minns att köra det före deploy.

Utan grind har även de täckta motorerna (router, translate, checklist, extraktion)
inget automatiskt skydd mot att en prompt-edit eller modellbyte regresserar dem vid
deploy — evalerna blir dokumentation istället för guardrail. **Detta är den billigaste
höghävstångs-fixen och den låser upp värdet i alla eval-förslagen nedan** (ett nytt
golden-set skyddar bara mot drift om det körs automatiskt).

**Fix:** GitHub Action som kör sviten på PR:er som rör `supabase/functions/**` eller
`evals/**`, med per-scorer-trösklar som failar bygget, nycklar som repo-secrets.
Kör `--no-judge`-läget som snabb gate + judge-läget nightly om kostnad oroar.

Relaterat: `prod-readiness-hardening` nämner CI brett (vitest+workflow) i en parkerad
epic — detta är den fokuserade eval-gate-biten som är värd att lyfta ut och göra först.

---
id: eval-financial-extraction
status: todo
priority: P2
tags: [agent-proposed, sil-förslag, ai, evals, extraktion, pengar]
created: 2026-07-17
---
## 🤖 Golden-set för finansiell dokument-extraktion (process-document-v2 är omätt)

**Agent-förslag (SIL) — triageras av Carl.** Detta är exakt den "nästa eval som rör
användare" som `translate-domain-vs-commodity-eval` pekade ut (*"AI-extraktion — idag
omätt, fel där korrumperar projekt tyst"*). `supabase/functions/process-document-v2/
index.ts` extraherar `total_amount`, `vat_amount`, `ocr_number`, `rot_amount` och
`rot_personnummer` via Anthropic vision (index.ts:345/427) → matar `import_purchase`
som skriver pengar. `evals/dataset/` har INGET golden-set för något dokument/kvitto/
faktura. `confidence`-fältet som gatar autopilot är modell-självrapporterat och
defaultat (`numOrNull(raw.confidence) ?? 0.5` index.ts:399, hårdkodat 0.9 på flera
grenar ~471/504/532) — aldrig kalibrerat mot facit.

**Risken:** en prompt-tweak eller Anthropic-modellbump kan börja läsa fel total (8→3)
eller ta fel OCR/betalreferens, och inget i koden fångar det — siffran blir en
leverantörsbetalning. Renaida tvingar människa-bekräftelse för `import_purchase`
(Renaida.tsx:44-47), men det skyddar bara *skrivningen*, inte korrektheten i siffrorna
människan ankras mot.

**Fix:** golden-set med 15–20 riktiga SE-kvitton/fakturor med kända belopp/OCR/ROT +
exact-match-scorers på pengafälten (`evals/lib`-stil) + wire in i run-script + CI-gaten
ovan så belopp/OCR-träffsäkerhet blir ett spårat tal över tid. Kompletterar
per-fält-konfidens-förslaget nedan (evalen mäter, konfidensen surfar osäkerheten).

---
id: eval-generate-quote-items
status: todo
priority: P2
tags: [agent-proposed, sil-förslag, ai, evals, offert]
created: 2026-07-17
---
## 🤖 generate-quote-items: eval + per-rad-konfidens + frys upp 2024-priserna

**Agent-förslag (SIL) — triageras av Carl.** `supabase/functions/generate-quote-items/
index.ts` (gpt-4o-mini, temp 0.3) har en SYSTEM_PROMPT som **hårdkodar prisintervall
uttryckligen märkta "2024"** (t.ex. "Hantverkararbete: 450-650 kr/tim", "Kakel/klinker:
800-1500 kr/m2"). Funktionen returnerar **inget confidence-fält alls** (grep 'confidence'
→ 0 träffar), till skillnad från övriga extraktorer, och saknar eval-dataset. Output
flödar in i QuoteReviewDialog + `src/pages/contractor/CreateQuote*.tsx` och skickas till
kund som riktiga, pengabärande offerter.

Två tysta drift-problem sammanfaller: (1) prisreferensen är fryst vid 2024 inuti prompten
utan ägare → blir gammal, (2) utan per-rad-konfidens har granskaren i QuoteReviewDialog
ingen låg-tillit-flagga att fokusera på (ConfidenceIndicator finns där för andra flöden
men denna funktion matar den inget) → granskning degraderar till att rubber-stampa
AI-siffror.

**Fix:** returnera per-rad-konfidens, lägg golden-set som poängsätter kategori-etikett-
korrekthet + pris-inom-rimligt-band, och flytta pristabellen UT ur prompten till en
underhållen config som kan uppdateras utan att röra modellanropet.

---
id: eval-help-bot-rag-grounding
status: todo
priority: P3
tags: [agent-proposed, sil-förslag, ai, moat, safety, evals]
created: 2026-07-17
---
## 🤖 RAG-grunda checklista + expertsvar i svenska byggnormer (Säker Vatten/GVK/BBV/AMA/BBR)

**Agent-förslag (SIL) — triageras av Carl.** Kompletterar `checklist-engine-quality`
(P1, judge 2.75/5, tätskikt EJ före kakel, saknad acklimatisering/grundning) vars
föreslagna fix är prompt-härdning + few-shot. Prompt-tweaks ensamt fixar inte
säkerhetskritisk sekvensering pålitligt — det gängse mönstret för domän-säkerhet är
retrieval-grundad generering mot auktoritativa källdokument så modellen citerar en
riktig norm istället för att minnas en. Sverige har kanoniska källor för exakt de
felklasser som setts: Säker Vatten / GVK / BBV (Byggkeramikrådets branschregler för
våtrum/tätskikt-före-kakel), AMA Hus, Boverkets byggregler.

Samma grind gäller `help-bot` (`supabase/functions/help-bot/index.ts`): svarar som
"tailored construction expert" och slår fast hårda säkerhetsordningar ur modellens eget
minne ("tätskikt i våtrum (KRAV före ytskikt)", index.ts:166); generiska svar cachas
(index.ts:267-277) → en hallucinerad säkerhetsklaim serveras om till många. Appens
ursprungsberättelse är en hantverkare som använde fel färg — dålig ordnings-/tätskikts-
rådgivning är precis den ansvarsrisk produkten finns för att förhindra.

**Fix:** chunk+embed normerna i ett litet retrieval-lager som grundar
`generate-work-checklist` OCH help-bots expertsvar; hämtade norm-snuttar höjer korrekthet
OCH ger en citerbar tillitssignal (differentiator vs naiv LLM). Lägg golden Q&A-set med
LLM-as-judge som poängsätter faktiska/säkerhetsordnings-klaim (speglar den stränga
granskaren i `evals/run.mjs`). Stärker direkt rum↔arbetsmoment-strukturen Taulant
validerade som vallgraven.

---
id: corrections-as-evals-flywheel
status: todo
priority: P3
tags: [agent-proposed, sil-förslag, evals, observability, renaida]
created: 2026-07-17
---
## 🤖 Rättelser-som-evals-svänghjul — auto-utvinn corrected/dismissed till regressions-set

**Agent-förslag (SIL) — triageras av Carl.** Renofine emitterar redan
`renaida_proposed/applied/corrected/dismissed` till PostHog och instrumenterar
AI-anrop mot aidev-admin, men inget sluter loopen: varje mänsklig rättelse/avfärdande
är ett labelat fel-fall som idag bara avdunstar. Det breda, etablerade mönstret
(LangSmith annotation queues, Braintrust, OpenAI "evals from logs", Anthropics
"bygg evals från riktiga fel") är att befordra produktions-traces där människan
överröstade agenten till golden eval-fall automatiskt.

Detta är en distributions-/moat-multiplikator vid ~1–10 riktiga användare: Taulants
rättelser blir bokstavligen testsviten som stoppar regressioner på exakt hans flöden.

**Konkret:** ett veckojobb läser corrected/dismissed-traces (input + modellförslag +
människans slutvärde), dedupar, och appenderar kandidat-fall till `evals/dataset/*.json`
för att Carl ska acceptera/förkasta → matar den befintliga `run.mjs`/`run-checklist.mjs`-
harnessen + CI-eval-gaten ovan. Distinkt från de handskrivna sviterna och från den
parkerade `ai-verification-pass`.

---
id: confidence-in-confirmdiff
status: todo
priority: P3
tags: [agent-proposed, sil-förslag, hitl, data-integritet, renaida]
created: 2026-07-17
---
## 🤖 Per-fält-konfidens synlig i ConfirmDiff (kalibrerad osäkerhet som gransknings-nudge)

**Agent-förslag (SIL) — triageras av Carl.** Backloggens egen notering är att
extraktionsfel "korrumperar projekt tyst" — och pengaflöden (kvitton/fakturor → PO +
budget) är precis där ett fel belopp/leverantör gör bestående tyst skada. Det moderna
HITL-mönstret är inte bara "bekräfta allt" (som tränar användare att rubber-stampa)
utan selektiv prediktion: modellen returnerar per-fält-konfidens och gransknings-UI:t
flaggar visuellt bara låg-konfidens-fälten (belopp tvetydigt, leverantör gissad, ROT
härledd) så människans uppmärksamhet landar där den behövs.

Billig self-consistency (sampla extraktionen 2–3× — oenighet = låg konfidens) eller be
modellen självskatta per fält funkar utan en tung andra-modell. Uppgraderar befintliga
ConfirmDiff/hallucination-vakten (`renaida-doc-d1/d2`, vendor/summa/radantal/ROT) från
binär (läsbar/0kr) till graderad, behåller Carls "bekräfta alltid pengar"-regel intakt,
och minskar tyst korruption — en Tier-1-tillitsfråga. Distinkt från P4-generiska
`ai-verification-pass`: detta är osäkerhet gjord synlig i diffen, inte ett dolt extra-anrop.

---
id: email-delivery-silent-failure
status: todo
priority: P2
tags: [agent-proposed, sil-förslag, bugfix, observability, felhantering]
created: 2026-07-17
---
## 🤖 Offert-/faktura-mejl failar tyst men returnerar success (+ noll Sentry-capture)

**Agent-förslag (SIL) — triageras av Carl.** `src/services/quoteService.ts:358-367`
skickar offert-mejlet via `await supabase.functions.invoke('send-quote-email', ...)` i
en try/catch som bara `console.error`ar + kommenterar `// Don't fail`, sedan
`return true`. supabase-js `functions.invoke` **kastar inte** på icke-2xx edge-svar — det
returnerar `{ data, error }` — så try/catch fångar bara nätverkskast, medan det faktiska
felläget (edge-funktion 500) returneras i ett okontrollerat `error` och sväljs helt.
Samma mönster i `invoiceService.ts:457` (send-invoice-email). Inkonsekvent mot 11 andra
`functions.invoke`-anropsställen som korrekt destrukturerar `{ data, error }`
(smartUploadService, receiptAnalysisService, agent/routeClient m.fl.).

Förvärrande: `@sentry/react` är initialiserat (`main.tsx`) och wrappar en ErrorBoundary,
men `captureException` anropas **0 gånger** i `src`, och `vite.config.ts` har ingen
`drop_console`/terser-config — så de 394 console-satserna är ENDA spåret av dessa fel,
och de finns bara i användarens webbläsarkonsol, inte i Sentry.

**Effekt:** en hantverkare får veta att offerten/fakturan skickades när mejlet tyst
misslyckades — en affärskritisk, kundvänd handling som failar osynligt utan server-side-
eller Sentry-spår att diagnosticera med. **Fix:** kontrollera `error` från invoke,
returnera faktiskt utfall, och `captureException` på failväg.

---
id: dead-code-v1-quote-pages
status: todo
priority: P3
tags: [agent-proposed, sil-förslag, cleanup, dead-code, bundle]
created: 2026-07-17
---
## 🤖 Två fullstora V1-offertsidor (2 248 rader) är död kod — bakom hårdkodat `= true`, ändå bundlade

**Agent-förslag (SIL) — triageras av Carl.** `src/App.tsx:33-34` deklarerar
`const USE_QUOTE_VIEW_V2 = true;` och `const USE_QUOTE_CREATE_V2 = true;` (vanliga
konstanter, inte runtime-flaggor). App.tsx:125,129 använder dem bara som
`flag ? <V2/> : <V1/>`, så `CreateQuote` (`src/pages/contractor/CreateQuote.tsx`, 1218
rader) och `ViewQuote` (`src/pages/ViewQuote.tsx`, 1030 rader) renderas aldrig. Båda är
**statiska** imports (App.tsx:27,29) — bara 4 av 27 sid-imports är lazy — så de landar i
huvud-JS-bundlen varje användare laddar, och `build` kör `typecheck:strict` över dem.
V1-filerna är orörda sedan 2026-04-28 / 2026-05-08 medan V2 fortsätter utvecklas (commits
2d3bd0b, 23d2ea4) → de ruttnar ur synk.

2 248 rader onåbar kod som ändå bundlas, typkollas och dyker upp i varje grep/refactor,
vilseleder alla som läser offert-flödet och blåser upp bundlen. Eftersom toggeln är en
kompileringstids-literal kan fallbacken ändå aldrig avfyras i prod. **Fix:** ta bort V1-
filerna + toggeln, eller (om de vill behålla dem) lazy-importera. Bör synka mot
`scaffold-project-engine`s medvetna QuoteReviewDialog-avgränsning så inget levande rörs.

---
id: guest-migration-skip-dataloss
status: todo
priority: P2
tags: [agent-proposed, sil-förslag, bugfix, aktivering, konvertering, dataförlust]
created: 2026-07-17
---
## 🤖 "Skip" i gäst→konto-migreringen raderar tyst och permanent arbetet användaren just byggt

**Agent-förslag (SIL) — triageras av Carl.** `src/components/guest/GuestMigrationDialog.tsx`
`handleSkip` (rad 110-116) kallar `clearAllGuestData()`; den funktionen
(`src/services/guestStorageService.ts:311-322`) gör `localStorage.removeItem` på varje
`renofine_guest_*`-nyckel — ingen bekräftelse, ingen ångra. Triggas från
`src/pages/Auth.tsx` `handleSignIn` (rad 199) i exakt ögonblicket en gäst loggar in på ett
konto.

Detta är det enda konverteringsögonblicket där en betatestare gör sitt lokala trial till
ett riktigt konto, och det är en dataförlust-footgun. Knappen läser "Skip"
(`t('guest.skip','Skip')`) vilket en användare tolkar som "hoppa över dialogen / gör det
sen", men den förstör varje lokalt byggt projekt, rum, arbete och planritning direkt.
Den som avfärdar dialogen för att "ta det senare" förlorar exakt det arbete som motiverade
dem att skapa konto — värsta möjliga första intryck på betalvägen.

**Fix:** gör sekundär-handlingen icke-destruktiv — döp om till "Inte nu" och stäng bara
(`onOpenChange(false)`); säkerhetsnätet på `/start` erbjuder migreringen igen och
`hasGuestProjectsToMigrate` överlever medvetet `exitGuestMode`. Radera data bara bakom en
explicit, separat märkt "Radera mina lokala projekt"-bekräftelse.

---
id: define-activation-event
status: done
priority: P2
tags: [agent-proposed, sil-förslag, aktivering, analytics, growth]
created: 2026-07-17
---
LEVERERAT 2026-08-04 (`00c4564`): `activation_reached` fyras en gång per användare vid första värde-handlingen (arbete skapat / Renaida applicerad / kvitto tolkat / arbetare inbjuden), som EN intercept i analytics.capture() — guardad per user-id i localStorage. Motiverat av avhopps-analysen: alla signups slutför onboarding men få tar första handlingen. Gör signup→aktivering mätbart. Nästa: bygg en PostHog-tratt signup_completed → activation_reached.
## 🤖 Definiera + instrumentera ETT explicit aktiverings-event NU (före FB-distribution)

**Agent-förslag (SIL) — triageras av Carl.** Renofine spårar rika event
(`renaida_proposed/applied/corrected/dismissed`, signup→projekt-tratten per
`taulant-bara-lead`) och tittar på session recordings, men det finns **inget enda
definierat "aktivering nådd"-event/kohort**. Norrstjärnan är kvalitativ ("sparar det
TID"). Mönster: Reforge/Amplitude North Star + Setup→Aha→Habit-ramverk — välj en mätbar
värde-milstolpe och gör den till en tratt+kohort.

**Konkret:** avfyra `activation_reached` när ett projekt först korsar en värde-tröskel i
första sessionen / 7 dagarna (t.ex. första Renaida-förslag APPLIED, eller första kvitto
skannat, eller första arbete markerat klart). Detta är några rader givet att eventen redan
finns (`analytics.ts` är wire:ad), och det gör `fb-grupper-outreach`-vågen (mål: 20–30
testare) mätbar från dag ett istället för att retro-fittas efter att trafiken är borta.
Billigt nu, ovärderligt i det ögonblick distributionen startar.

---
id: diy-sketch-vision
status: todo
priority: P2
tags: [floorplanner, diy, homeowner, vision]
created: 2026-07-23
---
## DIY-skissverktyget — "Paint med riktiga mått" (Carls vision, epic)
Carls ord: space plannern ska bli ett kul och enkelt verktyg för hemägare som vill skissa DIY-lösningar, skräddarsydda möbler och installationer — kasta ut idéer lika enkelt som i Google Slides/Paint, men skalenligt mot din faktiska hemmiljö så du ser hur måtten lirar.
FÖRSTA SKIVAN LEVERERAD 2026-07-23: "Eget objekt" (custom_box) i objektpanelen — gul skiss-box som placeras/dras in, namn + B×D mm redigeras i selektionsverktygsraden, måtten ritas PÅ objektet. /Users/calpa/Developer/Renofine/src/components/floormap/objectLibrary/definitions/custom.ts
KVAR I EPICEN: (a) rita-till-storlek (dra upp boxen som RoomRectTool, live-mått), (b) höjd-fält + väggvy-etikett, (c) flera former (L-form, cirkel, hylla), (d) frihandsskiss-läge ovanpå planen, (e) dela/exportera skissen som bild med måttsättning, (f) ev. koppling till material/kapnotor ("så många meter regel behöver du").

---
id: task-room-unlink-saknas
status: todo
priority: P2
tags: [ux, rooms, tasks, cowork-fynd]
created: 2026-07-23
---
## Arbete↔rum-koppling går att skapa men inte ta bort i UI
Cowork-fynd (rapport-floorplanner-v2-spegling): Rumsdetaljers Relaterat har Link-knapp för att koppla arbete till rum, men INGEN unlink/ta bort-kontroll någonstans (varken rummets eller arbetets sida). Kopplingen blir permanent via UI. Residual i Carls demo: "Måla hall" är nu länkat till Hall (var inte det före testet) och kan inte avlänkas.
Fix: unlink-kontroll (hover-X eller meny) på båda sidor + bekräftelse.

---
id: room-area-stale-efter-geometri-radering
status: todo
priority: P3
tags: [floorplanner, rooms, data-integrity, cowork-fynd]
created: 2026-07-23
---
## Rumsmått ligger kvar när ritgeometrin raderas (stale area)
Cowork-fynd: rita rum → binds till rumsentitet → area/omkrets/volym synkas till rooms-raden. Raderas geometrin från planen ligger måtten KVAR på entiteten (Hall visar nu 14,9 m² från en tillfällig testrektangel). Beslut behövs: nollställa mått vid geometri-radering, markera som "senast uppmätt", eller behåll medvetet. Residual: Halls mått i Carls demo speglar nu VARV 2-testgeometrin (YTA 18,7 / OMKRETS 17,60 / VOLYM 48,7 per 2026-07-24; varv 1 lämnade 14,9) — Carl får återställa om originalvärden fanns.

---
id: url-subtab-tappas-vid-reload
status: done
priority: P3
tags: [floorplanner, deep-links, cowork-fynd]
created: 2026-07-23
---
## Hård reload nollställer &subtab=floorplan → landar i Rumshantering
Cowork-fynd: `?tab=spaceplanner&subtab=floorplan&editor=v2` överlever inte reload — tab-synken strippar subtab-parametern (samma familj som editor=v2-strippningen, fixad via localStorage-konsumtion i 7ff1981). v2-flaggan bevaras men användaren måste navigera till Planer igen. Fix: konsumera/återställ subtab likadant.

---
id: demo-seed-ritade-rum
status: todo
priority: P3
tags: [demo, floorplanner, testbarhet]
created: 2026-07-23
---
## Seeda demon med ritade rum på planritningen
Cowork-fynd: demons Floor Plan 1 är tom — rummen finns bara som entiteter i Rumshantering, inte ritade på planen. Alla flöden som utgår från ritade rum (objektplacering, väggvy, spegling) kräver att testaren först ritar+binder ett rum. Utöka seed_demo_content() med en enkel ritad lägenhetsplan kopplad till rumsentiteterna — hjälper både testloopen och nya användares första intryck av ritvyn.

---
id: elevation-oppningar-text
status: todo
priority: P2
tags: [floorplanner, elevation, paritet]
created: 2026-07-23
---
## Väggvyn: öppningar + text ritbara direkt i elevation
Kvarvarande paritetsblock: öppningar (dörr/fönster) och textanteckningar kan idag bara läggas från planritningen. Väggvyns v2-rail (Välj/Objekt/Mät) ska växa med Öppning + Text när elevation-stödet byggs; även ytor/färg-kvalitet och auto-måttkedjor i väggvyn hör hit.

---
id: objekt-kantsnap-avstandsguider
status: todo
priority: P3
tags: [floorplanner, objekt, snapping]
created: 2026-07-23
---
## Objekt-till-objekt-kantsnap med avståndsguider
Fas 4-rest (SmartDraw-mönstret): när ett objekt dras nära ett annat ska kanterna snäppa och blå avståndsguider visas (avstånd till grannobjekt/vägg). Även "liknande objekt"-swap och favoriter i objektpanelen hör till fas 4-resten.

---
id: ytskikt-monster-p1
status: doing
priority: P1
tags: [floorplanner, ytskikt, homeowner-wow]
created: 2026-07-24
---
## Ytskikt P1: golvmönster + ytor/mönster-toggles + enhetlig ytskikts-vokabulär
Carls beslut 2026-07-24 ("kör på detta 3"). Golvmönster-tiles (fiskbens, rak parkett, klinker, storformat, betong) härledda ur floor_spec.material, renderade på planens rum (Konva fillPattern) + samma tiles i arbetarens SVG-vy. Visning-popovern (v2) får "Ytor & färg" (portas från v1) + "Mönster"-toggle. Gemensam SurfaceSpecFields-komponent (material+behandling+kulör) som första steg mot EN ytskikts-vokabulär över floor/wall/ceiling/joinery-spec (agent-läsbart: en action-typ för Renaida).

---
id: ytskikt-monster-p2
status: done
priority: P2
tags: [floorplanner, ytskikt, elevation]
created: 2026-07-24
---
## Ytskikt P2: kakel/mönster i väggvyn + per-objekt-finish + färgkod-chips + templates i v2
Kakelmönster på våtrumsväggar i väggvyn (samma tile-bibliotek). Per placerat objekt: kulör/material-fält (metadata.finishColor) synligt i etikett/tooltip + speglat till room_items → arbetarvyn ("Skåpstommen vit, luckor NCS S 3005-G80Y"). Färgkod-etiketter togglebara på ytorna. Rums-templates (groupId-systemet finns) framlyfta i v2-objektpanelen.

---
id: ytskikt-monster-p3-diy2
status: done
priority: P3
tags: [floorplanner, diy, ytskikt]
created: 2026-07-24
---
## Ytskikt P3 / DIY-skiva 2: fria former + gruppering till eget objekt + takdata till arbetare
Rita linjer/cirklar/rektanglar i v2 → markera → "Gruppera som eget objekt" (groupId/isGroupLeader finns i typerna) → gruppen får namn + mått som enhet. Takvisualisering lågprio; säkerställ att ceiling_spec presenteras i arbetar-instruktionerna.
LEVERERAT 2026-07-28 (`00a9904`): (a) Former-flyout i v2-railen (ShapeDrawTool linje/rektangel/cirkel → vanliga FloorMapShapes, renderas av LegacyShapesLayer, valbara/mätbara). (b) selection.group/ungroup — groupId + gruppledare m. namn + uppmätta bounds (mm) i templateInfo; klick på medlem markerar hela gruppen (Figma-stil); Gruppera-knapp + gruppnamn-input + Dela upp-knapp i FloatingSelectionToolbar. (c) Takdata: RoomSpecsSummary-takraden visas nu även på enbart molding_type (taklist); takfärg nådde redan arbetaren via ColorSwatchRow + ceiling_spec går redan hela vägen (ingen edge-deploy). Takvisualisering medvetet utelämnad (låg prio). E2e 28/28, build grönt, live-verifierat.

---
id: plattforms-audit-anvandartyper
status: doing
priority: P1
tags: [ux, roles, audit, byggare, hemagare]
created: 2026-07-24
---
## Plattforms-audit: är projektledning logisk per användartyp?
Carls fråga 2026-07-24: verifiera hela plattformen utifrån de tre perspektiven — (a) BYGGARE som startar/projektleder eget projekt: offerter, fakturor, fakturerande budget, UE-kostnader; (b) HEMÄGARE som projektleder själv: egen bestämd ELLER flytande budget (max spend), fakturerande total och/eller UE; (c) BYGGPROFFS som projektleder och bjuder in privatkunden till den begränsade delningsvyn (Kundvyn). Läs-bara kodaudit först (agent), fynden → backlog-kort + rapport till Carl. Kända regler: role-gating ENBART via onboarding_user_type; moms ex/inc per roll; dual-view-grinden.

---
id: user-type-builder-budget-fel-falt
status: todo
priority: P1
tags: [audit, budget, byggare, bug]
created: 2026-07-24
---
## CreateProjectDialog skriver byggarens budget till hemägar-privatfältet
Audit-fynd #4: dialogen skriver ALLTID beloppet till project_private_budget.private_budget_cap ("homeowner's private cap") oavsett roll. En byggares inmatade budget försvinner tyst — BuilderSummaryCards läser aldrig fältet. Fix: roll-medveten skrivning (byggare → ingen/eget fält) eller dölj fältet för contractor.

---
id: user-type-hemagare-forbrukat-tvetydigt
status: todo
priority: P1
tags: [audit, budget, hemagare]
created: 2026-07-24
---
## Hemägarvyn visar två olika "förbrukat" i samma vy
Audit-fynd #1: "Kvar att spendera"-kortet räknar committed (accepterade offerter+inköp+ÄTA) medan progressbaren "Förbrukat av budget" räknar fakturerat — två motsägande tal om samma budget. Fix: EN definition som båda läser (del av budget_mode-greppet, se user-type-budget-mode).

---
id: user-type-budget-mode-saknas
status: todo
priority: P2
tags: [audit, budget, hemagare, produktbeslut]
created: 2026-07-24
---
## Fast vs flytande budget (max spend) för hemägare finns inte
Audit-fynd #2 + strukturgrepp 3: bara ett enda private_budget_cap (soft cap). Carls beskrivna modell "bestämd ELLER flytande budget" kräver budget_mode ∈ {fixed_cap, floating_max} + konsekvent förbrukat-definition. Produktbeslut: hur ska fast tak bete sig vid överskridande (blockera/varna)?

---
id: user-type-mottagen-faktura-hemagare
status: todo
priority: P2
tags: [audit, budget, hemagare, ue]
created: 2026-07-24
---
## Förstklassig mottagen-faktura/UE-kostnadspost för hemägare
Audit-fynd #3 + strukturgrepp 2: invoices är byggarens UTGÅENDE modell; hemägare som anlitar extern firma har inget kostnadsobjekt (bara material/"eget inköp"), och subcontractor_cost är dold i hemägarens kolumnuppsättning. i18n har redan "Received invoices" utan datamodell. Symmetriskt kostnadsobjekt med egen paid_by/paid_at-semantik.

---
id: user-type-kundvy-persona-kontrakt
status: todo
priority: P1
tags: [audit, kundvy, sakerhet, proffs]
created: 2026-07-24
---
## Inbjuden kund ser råa flikar + ekonomiskydd hänger på feature-flagga
Audit-fynd #5+#6 + strukturgrepp 4: client-personan mappas till homeowner och får view på Översikt/Arbeten/Ritning/Filer — Kundvyn är EN flik, inte den begränsade vyn. Och är isTeamV2MaskingEnabled av visar ReadOnlyBudgetView builderns kostnader för kunden. Fix: customer-safe-projektion i persona-kontraktet (oavsett flagga) + dedikerad Kundvy-shell; aktivera den döda isInvitedClient-grenen; lägg invited_client i RequireRole-typen.

---
id: user-type-smaerre-inkonsekvenser
status: todo
priority: P3
tags: [audit, roller, moms]
created: 2026-07-24
---
## Mindre roll-inkonsekvenser: is_professional-dubbelskrivning, paid_amount-semantik, moms per belopp, "Offert"-label
Audit-fynd #7–#10: (a) is_professional skrivs parallellt i Profile/WelcomeModal — deprecatera som rollkälla; (b) paid_amount flippar betydelse mellan roller oetiketterat; (c) momsmärkning bara som tabell-fotnot — sätt ex/inc-moms per belopp; (d) hemägarens egna estimat rubriceras "Offert".

---
id: arbetar-lank-utan-utskick
status: todo
priority: P3
tags: [ux, sharing, team, cowork-fynd]
created: 2026-07-24
---
## Arbetar-delningslänk kan bara skapas genom att skicka inbjudan
Cowork-fynd (varv 2): enda vägen till en arbetar-länk är Skicka jobb → Bjud in person med namn + telefon/e-post + "Skicka inbjudan" — det finns ingen "skapa/kopiera länk utan att skicka". Byggare som vill visa länken på plats, testa den själv, eller dela via annan kanal tvingas hitta på en mottagare. Fix: "Kopiera länk"-variant i steg 2 som genererar token utan utskick (samma återkallnings-flöde).

---
id: worker-post-gar-ej-radera
status: todo
priority: P3
tags: [ux, team, cowork-fynd]
created: 2026-07-24
---
## Återkallad arbetar-post kan inte tas bort ur teamlistan
Cowork-fynd (varv 2): X-knappen återkallar åtkomsten men den inaktiva posten ligger kvar under Utgångna/Inaktiva för alltid — ingen radering finns i UI. Ofarligt (revoke-historik) men listan växer med varje testinbjudan/felskick. Fix: "Ta bort ur listan" på återkallade poster (behåll ev. audit-raden i DB).

---
id: vaggvy-enhet-imperial-i-gast
status: todo
priority: P3
tags: [floorplanner, elevation, i18n, enheter]
created: 2026-07-24
---
## Enhetsformat skiljer mellan plan (mm) och väggvy (m/ft)
OMVÄRDERAD efter rotorsakning: väggvyn följer measurement-systemet (browser-locale: en-US → ft/tum, svenska → metriskt "2.50 m") — det jag såg som "imperial-bugg" var Playwrights en-US-locale, svenska användare får metriskt. Äkta kvarvarande skav: v2-PLANEN hårdkodar mm (formatWorldAsMm) och ignorerar både measurement-system och projectSettings.unit, så samma vägg visar "2 500 mm" på planen och "2.50 m" i väggvyn. Lågprio: branschen ritar i mm på plan; beslut behövs om väggvyn också ska visa mm (konsekvens) eller planen följa enhetsinställningen.

---
id: unify-category-vocabulary
status: done
priority: P1
tags: [floorplanner, arkitektur, agent-readable, objekt-instruktions-audit]
created: 2026-07-28
---
## En kategori-vokabulär över objekt ↔ room_items ↔ arbetstyp
Audit-fynd (objekt-instruktions-audit 2026-07-28): fyra parallella kategori-enums som bara råkar överlappa. (a) ROOM_ITEM_CATEGORIES (`room-details/constants.ts:185`): electrical/plumbing/kitchen/ventilation/appliance; (b) room_items.category DB-doc: electrical/paint/flooring/plumbing/ventilation/appliance (diverges — paint/flooring vs kitchen); (c) objektbibliotek `objectLibrary/types.ts:11`: electrical/plumbing/kitchen/appliances/furniture/doors/windows/hvac/lighting/custom (appliances PLURAL ≠ appliance); (d) arbetstyper `materialRecipes.ts:564`: painting/flooring/tiling/demolition/spackling/sanding/carpentry/electrical/plumbing. Bara subtyper hålls i sync (el-katalogen). Mismatchar: appliance vs appliances, kitchen saknar arbetstyp, painting/flooring/tiling saknar room-item-kategori. Detta är [[feedback_agent_readable_architecture]] materialiserat: EN källa (single source), läsbar vokabulär, ett mappnings-lager där de skiljer sig. Låser upp konsekvent färg + filter över alla ytor. Design-test: kan Renaida uttrycka "visa allt el-arbete" som en action mot EN yta?
LEVERERAT 2026-07-28 (`559183b`): trade-axeln (el/VVS/kök/vent/vitvara) samlad i src/lib/workCategories.ts (id/labelKey/färg/objekt-alias). Konsumenter deriverar: ROOM_ITEM_CATEGORIES, isMirroredCategory→isWorkCategory (normaliserar appliances→appliance, hvac→ventilation, lighting→electrical), room_items skrivs kanoniskt, worker CATEGORY_COLORS/LABEL_KEYS (kitchen får äntligen färg), v1+v2 filter-labels. Objektbibliotekets palett + estimeringens arbetstyper är EGNA axlar, medvetet ej hopslagna (bryggar via alias resp. där de sammanfaller). AVGRÄNSNING: labor-axel-bryggan (task work-type ↔ item-kategori auto-match) hör till [[room-item-task-scoping]]. Behavior-preserving, 29/29 e2e.

---
id: room-item-task-scoping
status: done
priority: P1
tags: [floorplanner, worker, tasks, data-model, objekt-instruktions-audit]
created: 2026-07-28
---
## Aktivera task_id på room_items — scopa objekt till rätt jobb/arbetare
Audit-fynd: `room_items.task_id` FK + index finns (migration 20260604110000) men skrivs ALDRIG från klienten. Alla arbets-ytor når objekten via rummet (`.in("room_id", …)`) — `RoomItemsSummary.tsx:45`, `get-worker-data/index.ts:222`. Konsekvens: har köket "Dra el" (elektriker) + "Måla kök" (målare) ser BÅDA arbetskorten och BÅDA arbetarvyerna alla köksobjekt — elektrikern ser målningsgrejer, målaren ser alla uttag. Kategoriseringen finns på objektet men scopingen till rätt jobb saknas. Fix: skriv task_id vid länkning (canvas-placering i länkat rum + rumsdetaljers add/edit), låt arbetskortet/arbetarvyn filtrera på task_id när det finns (fall tillbaka på room_id för äldre data). Största samspels-vinsten; gör de fyra silorna till ETT system i stället för råkade rum-överlapp. Beroende: helst efter [[unify-category-vocabulary]] men kan göras separat.
LEVERERAT 2026-07-28 (`ccc1832`), Carls modell = auto-förslag + override: labor-axel-brygga i registret + roomItemTaskLink-util (länkar bara vid EXAKT en matchande rums-task, annars rums-bred). Auto-länk vid canvas-placering + rumsdetaljers add-dialog; manuell 'Koppla till arbete'-selector + task-badge. Filter på ägarens arbetskort (RoomItemsSummary) + arbetarens list-vy (WorkerTaskCard: egna+rums-breda, döljer andra taskers); rums-vyn medvetet rums-bred. Bakåtkompatibelt. **⚠️ KRÄVER EDGE-DEPLOY: `supabase functions deploy get-worker-data`** (bär task_id→taskId; utan deploy visas allt som förr = graceful). Ingen migration (task_id-kolumnen fanns).

---
id: canvas-category-colors
status: done
priority: P2
tags: [floorplanner, ui, objekt-instruktions-audit]
created: 2026-07-28
---
## Kategori-färger på editor-canvasen (spegla arbetarvyns färgspråk)
Audit-fynd: v2 `ObjectsLayer.tsx` ritar alla objekt monokromt `#374151` — ingen färg/ikon per arbetstyp på planritningen. Bakvänt: ARBETARVYN har färg per kategori (`worker/roomObjectShared.tsx:66` CATEGORY_COLORS: el=amber #f59e0b, VVS=blå #3b82f6, vent=cyan #06b6d4, vitvara=lila #a855f7) men den som RITAR ser grått. Fix: spegla CATEGORY_COLORS till ObjectsLayer (stroke/tint per kategori) + ev. i väggvyn, så ritaren ser samma färgspråk som arbetaren och kan läsa "allt el" i en blick. Delvis blockerad av [[unify-category-vocabulary]] (färg bör bindas till den enhetliga vokabulären, inte hårdkodas två ggr).
LEVERERAT 2026-07-28 (`cfe3387`): ObjectsLayer ger work-item-objekt en svag arbetstyps-tonad platta + tunn ram bakom symbolen (färg ur registret, samma som arbetarvyn). Symbolkonsten orörd (grå strokes hårdkodade), layout-objekt neutrala, markeringsram har företräde.

---
id: worker-freetext-translation
status: doing
priority: P2
tags: [worker, i18n, instruktioner, objekt-instruktions-audit]
created: 2026-07-28
---
## Översätt fri text i arbetsinstruktionerna (wallNotes, ytor, finish, bildtexter)
Audit-fynd: get-worker-data översätter bara strukturerade titel+notering-fält (task/room/room_item-translations). Visas RÅTT på svenska för polsk/ukrainsk arbetare: (a) `wallNotes.text` (väggförankrade lappar) — WallElevationMiniView.tsx:206; (b) `wallSurfaces` material/behandling/färgkod — WallElevationMiniView.tsx:144; (c) objektens `detail.finish` (t.ex. "vit", "NCS…") — roomObjectShared.tsx:153; (d) instruktionsbildernas `description` — WorkerTaskCard.tsx:363. Exakt de konkreta instruktionerna som betyder mest är oöversatta → urholkar arbetar-språk-löftet. Fix: utöka översättnings-blocket i get-worker-data (edge) eller runtime translate-comments för dessa fält. NCS-koder/färgkoder ska INTE översättas (identifierare) — bara den fria beskrivande texten.
DELVIS LEVERERAT 2026-07-28 (`eec311d`): **wallNotes** översätts nu i samma runtime-pass som meddelanden (translate-comments, workerLang ∉ {sv,en}), WallElevationMiniView visar översättningen + original i tooltip. Ingen edge-deploy. KVAR: väggytornas material/behandling (enum-artat, ev. via i18n i st.f. AI), instruktionsbilders bildtexter. **objekt-finish KLART** 2026-07-28 (`bdb99cc`, samma runtime-pass, LLM bevarar NCS-koder).

---
id: room-details-item-editing-parity
status: done
priority: P2
tags: [floorplanner, rumsdetaljer, ux, objekt-instruktions-audit]
created: 2026-07-28
---
## Rumsdetaljers objekt-dialog: subtyp för alla kategorier + finish + bild
Audit-fynd: `RoomItemsSection.tsx` add/edit-dialog är halvfärdig utanför el. (a) Subtyp-väljaren visas BARA för electrical (`SUBTYPE_OPTIONS` har bara el, :44) — VVS/kök/vent får ingen subtyp; (b) finish/kulör går inte redigera i dialogen (sätts bara via canvas-sync `roomItemLink.ts:51`); (c) ingen bild per objekt (`ObjectInfoCard` i arbetarvyn är ren text). Fix: subtyp-optioner för alla mirror-kategorier (spegla objektbibliotekets kataloger), finish-fält i dialogen, valfri bild per room_item → visas i arbetarvyns ObjectInfoCard. Gör listan⇄canvas⇄arbetarvy symmetrisk. Relaterat: [[unify-category-vocabulary]] (subtyperna bör komma ur samma katalog).
LEVERERAT 2026-07-28 (`bdb99cc`): (a) subtyp för alla kategorier (härledd ur getObjectsByCategory); (b) finish-fält i dialogen + på raden; (c) referensbild per objekt (upload→detail.image_url, thumbnail i dialog+rad, renderas i arbetarvyns ObjectInfoCard). place-on-plan gatas fortsatt electrical (utökning = follow-up).

---
id: worker-object-markers-icons-images
status: done
priority: P3
tags: [worker, ui, objekt-instruktions-audit]
created: 2026-07-28
---
## Arbetarvyns objektmarkörer: ikon per kategori + bild per objekt
Audit-fynd: markörerna i RoomMiniMap/WallElevationMiniView är oetiketterade (bara färg + tapp för ObjectInfoCard, ingen ikon); identitet vilar helt på färg. Och ObjectInfoCard saknar bild per objekt. Fix: ikon per kategori på markören (samma ikonspråk som objektbiblioteket) + rendera valfri objekt-bild i ObjectInfoCard (kräver bild-fältet från [[room-details-item-editing-parity]]). Lågprio läsbarhets-lyft; färgkodningen fungerar redan bra.
LEVERERAT 2026-07-28 (`bdb99cc`): kategori-ikon i ObjectInfoCard-pillen (per trade) + referensbild per objekt renderas i kortet (via #6c). AVGRÄNSNING: ikon på själva SVG-markören i mini-kartan/väggvyn utelämnad (fiddligt i rå SVG, lågt värde) — ikonen sitter där detaljen läses (info-kortet).

---
id: imperial-units-full-support
status: todo
priority: P2
tags: [imperial, measurement, i18n, us-market, audit, keerthi-feedback]
created: 2026-08-04
---
## Imperial-enheter genom HELA appen (audit + fasad plan)
Audit 2026-08-04 (Keerthi Naidu, US-realtor, bad om detta i mars; Carl trodde det var live men bara väggvyn är korrekt). **Kör i prio-ordning nedan.**

**KORTSVAR:** imperial stöds INTE genom appen. Enda helt korrekta ytan = **väggvyn/elevation** (`RoomElevationView.tsx:705` ms.fmtLength). Flera ytor är HALVKOPPLADE → aktiv bugg (imperial-etikett på oomvandlat m²-tal).

**ROTORSAK:** två parallella enhetssystem — `utils/units.ts` (imperial-korrekt) vs `utils/formatting.ts` (bara mm/cm/m) + v2:s `editor/core/units.ts` hårdkodar mm (`formatWorldAsMm`). Och `useMeasurement`-contexten saknar `convertArea(m²)` — bara `fmtArea(mm²)` finns. Rum lagrar area i m² (area_sqm) → listor byter bara ETIKETT, inte tal.

**TÄCKNINGSKARTA:**
- ✅ Väggvyn (ft/in korrekt). ✅ SmartEstimateCard konverterar area (läcker m² i per-rums-tabell rad 317/323).
- ⚠️ AKTIV BUGG (imperial-etikett på råa m²): RoomsList.tsx:238, rooms-table/RoomsTableView.tsx:109, rooms-list-v2/RoomCardV2.tsx:219, v2/RoomHeroV2.tsx:288 (+ volym m³ 300), overview/PlanningRoomList.tsx:152.
- ❌ Metrisk-hårdkodad: v2-canvas (WallsLayer.tsx:98, DimensionChainLayer.tsx:80, LegacyShapesLayer.tsx:98 area, MeasureTool.ts:40, OverlayLayer.tsx:93 skriv-in-mått), v1-canvas (formatting.ts:20-30 saknar imperial → WallShape.tsx:264/RoomShape.tsx:528 visar råa mm när imperial valt), rumsmått-INMATNING (IdentitySection.tsx:125-149 unit="m" *1000), CalculationsSection.tsx, GuestTaskEstimateSheet, GuestPlanningSection, PlanningTaskList, EconomyTab, arbetarvyn (TaskRoomDetails.tsx:124/129, RoomInstructionCard.tsx:144), offerter (QuoteItemRow.tsx:11 ["st","m2","m","h","kg"]), intake-wizards, ShareRfqDialog-export.

**Mätsystem-källa:** per-USER (profiles.measurement_system, toggle Profile.tsx:796). useMeasurement() ger system/isImperial/fmtLength(mm)/fmtArea(mm²)/areaLabel. useMeasurementSystem.ts har även units/convertLength/convertArea men contexten exponerar dem EJ (och fallback saknar units → kraschar utanför provider).

**FASAD PLAN (prio-ordning):**
1. **[P2, ~1 commit, GÖR FÖRST] Fixa aktiva area-buggen:** lägg `convertAreaSqm(m²)`/`fmtAreaSqm(m²)` på MeasurementContext (multiplicera 10.7639 vid imperial) → uppdatera alla ⚠️-ställen ovan att konvertera talet, inte bara etiketten. Fixar det enda som är direkt FEL idag. Fixa även SmartEstimateCard per-rums-läckan.
   **✅ LEVERERAT 2026-08-04:** nya `convertAreaFromSqm`/`formatAreaFromSqm`/`formatVolumeFromM3` i `utils/units.ts` → exponerade som `ms.fmtAreaSqm`/`ms.convertAreaSqm`/`ms.fmtVolumeM3` på MeasurementContext (+ komplett fallback). Alla ⚠️-ställen konverterar nu talet: RoomsList, RoomsTableView (area + wallArea), RoomCardV2, RoomHeroV2 (area + volym m³→ft³), PlanningRoomList (paint-rader + totals). SmartEstimateCard: per-rums-tabellen (317/323) + de tre inline `*10.7639`-uttrycken + spill-formeln (356) → alla via helpern (magiskt tal borta). typecheck:strict + build + 32/32 e2e grönt. **AVGRÄNSNING (Fas 3):** rumsmått-INMATNINGENS edit-celler (RoomsTableView/PlanningRoomList) visar/redigerar fortfarande råa m² — display-only fix, inte input.
2. **[P3] Ena enhetssystemen + koppla canvasen:** döda metric-only `formatting.ts` (route via units.ts), gör v2:s `formatWorldAsMm` unit-aware (läs system) → v2 + v1 canvas vägglängder/areor/måttband/skriv-in-mått i aktiv enhet. Ena de två `Unit`-typerna.
3. **[P3] Rumsmått-INMATNING** (IdentitySection) tar imperial (ft/in → mm).
4. **[P3] Svep resten:** planering/estimering (Calculations, Guest-flöden, wizards), arbetarvyn, offert/material/budget-enhetsdropdown (ft²/ft/yd), RFQ-export, AI-import.

**Strategisk not:** noll aktiva US-användare (Keerthi testade 1 dag i mars, aldrig tillbaka). Fas 1 = värd nu (tar bort pinsam bugg). Fas 2–4 = när US är validerat fokus, ej reflexmässigt. Alternativ tills dess: gate imperial-toggeln bakom "beta" så den inte ljuger.

---
id: floorplanner-v2-default-parity
status: doing
priority: P2
tags: [floorplanner, editor-v2, parity, default-flip, audit]
created: 2026-08-09
---
## Floorplanner v2 → default (desktop-first flip + paritets-closeout)
Paritets-audit 2026-08-09 (v1 vs v2, 3 blocker-tiers). Beslut: **desktop-first flip** — skeppa v2 nu, täpp kvarvarande gap drivet av verklig användning i st.f. spekulativt (aktivering, ej floorplanner, är flaskhalsen).

**✅ LEVERERAT denna session:**
- **B1 väggtjocklek/höjd** (`42e4383`): wall.setThickness/setHeight-kommandon + WallPropsInput i FloatingSelectionToolbar (tjocklek+höjd-input + Väggtyp-preset Ytter 300/Inner 120/Lätt 70, bulk på alla markerade väggar). Direkt svar på Attefall-frågan.
- **Desktop-first flip** (`621ebb5`): isEditorV2Enabled() → v2 default på desktop (>=768px), v1 på mobil, ?editor=v1 = sticky opt-out. Badge-escapehatch + regressionstest.
- **B3 kalkerbild skala+opacitet** (`591a65b`): uploadPlanImage materialiserar naturlig storlek; image.setOpacity/setWidth-kommandon; ImagePropsInput (bredd-mm-kalibrering + opacitets-reglage).
- **B4/B5/B7 closeout** (`75302da`): selection.setStyle (fyll/kontur/opacitet, opacitet renderas nu på fria shapes) + ShapeStyleInput; selection.reorder (fram/bak) + kontextmeny; text.setStyle (storlek/fet/kursiv, fontStyle renderas) + TextStyleInput.
- **B2 resize-handtag** (`01c54a9`): ResizeTransformer (Konva Transformer) för rektangel/triangel/cirkel/bild — dra hörn → skala bakas till världsmått, ett undo-steg; ger kalkerbilden drag-skala. ToolController ignorerar transformer-gester (annars avmarkerade SelectTool mitt i draget).

**KVAR (usage-driven closeout, låg prio):**
- **B9 mobil-UI** för v2 (tills dess kör mobil kvar på v1 — medvetet, "desktop först").
- **P4-rest**: ritskala-preset (1:20–1:500) + canvas-storlek saknas i v2:s ViewSettings.
- Not: resize-handtag täcker EJ text-box (typsnitts-kontroller i st.f.) eller biblioteksobjekt (vägg-magnet+rotate); äldre bilder m. width=0 saknar mm-skala-input tills materialiserade.

**MEDVETET EJ portat (v1-cruft mot Renofines modell):** B6 (noteringar/material/foto per canvas-shape — bor i Rumsdetaljer/rums-objekt), B8 (sticky note/bezier/connector/eraser — whiteboard, ej måttsatt plan; frihand ev. för DIY), B10 (skapa-väggar-från-rum — rum deriveras ur väggar i v2). B10 = ej regression.

---
id: renaida-project-creation-dialog
status: doing
priority: P1
tags: [renaida, activation, onboarding, project-creation, agent-readable]
created: 2026-08-09
---
## Renaida-ledd projektfödelse (interaktiv skapa-projekt-dialog)
Attackerar aktiverings-flaskhalsen (traction-check: alla slutför onboarding, bara ~2/11 skapar arbete → bounce vid tomt projekt). I st.f. fritext/tomt projekt: ledande Renaida-dialog där projektet föds bit för bit, samtal + live-växande preview. Renaida = smartare ANVÄNDARE av appen (capture→föreslå→bekräfta över scaffoldProject-kommandoytan), ej ny app.

**✅ FAS 0 LEVERERAD 2026-08-09 (`b18e31a`):** deterministiskt villkorligt beslutsträd (renaidaProjectFlow.ts) + helfönster-dialog (RenaidaProjectDialog.tsx) + "Skapa med Renaida (beta)"-knapp på Projects. Badrum/kök/måla/golv/annat-vertikaler; scope-chips → arbeten m. rätt kostnadsställe; toScaffoldInput → scaffoldProject. Flödet enhetstestat. **KVAR: Carls inloggade test av UI + scaffold-finish** (guest-RLS stoppar skrivningar).

**✅ FAS 1 LEVERERAD 2026-08-09 (`4c1a9bb`+`b2ab93e`):**
- **1a översättning + roll-gating:** trädet språk-neutralt (i18n-nycklar + strukturerad data), titlar via intake.workType.*, hela dialogen en/sv/de/fr/es (57+ nycklar × 5). nextStep(draft, userType) varierar framing hemägare/byggare.
- **1b LLM fritext-jumpstart:** valfritt describe-steg → parse-renovation-description (deployad) tolkar → seedDraftFromParse (ren, unit-testad) seedar rum/arbeten → trädet frågar bara resten. Graciös fallback. Flödestest 5/5. **KVAR: Carls inloggade test av LLM-anropet.**

- **1c smarta tillval (`31406aa`+`68b90d3`):** villkorliga TILLVALS-förslag per projekttyp efter scope → extra arbeten (deduped). Deterministisk kurerad lista + **LLM-genererad dynamisk lista via ny edge-funktion `renaida-suggest` (DEPLOYAD & live-verifierad, fail-open till fallback)**. i18n × 5.

**FAS 1 KOMPLETT.** KVAR: Carls inloggade test av dialogen (jumpstart + LLM-tillval + språk + roll).

**✅ FAS 3 LEVERERAD 2026-08-10 (`99ab086`, pushad):** aktiverings-instrumentering — 5 `renaida_project_*`-events (started/describe_used/addons_shown/completed/abandoned) + delad `creation_method`-prop på `project_created` (renaida_dialog/guided_wizard/manual/quick_plan; guided wizard fyrade ALDRIG project_created förut → baseline saknades). 2 PostHog-trattar byggda ([dashboard 886161](https://eu.posthog.com/project/140317/dashboard/886161)): "Aktivering per skapa-metod" + "Renaida-dialog drop-off". Tomma tills trafik flödar. **KVAR: Carl kör dialogen inloggat → verifiera events i PostHog Activity.**

**✅ FAS 2 LEVERERAD 2026-08-10 (pushad):**
- **2a röst (`2fa9c4f`):** DictationTextarea (Whisper via transcribe-audio) i describe-steget → samma parseProjectDescription. "Bygg-Siri" för projektskapande.
- **2b foto (`bd915c8`):** kamera/fil → compressImage → extract-document-text (OCR) → SAMMA parser. Alla modaliteter (skriv/prata/fota) → en text → ett utkast. seedFromDescription utbruten som delad kärna.
- **2c gäst-stöd (`eca8bd4`):** dialogen öppen för gäster (createGuestProjectFromGuidedSetup, samma route som guided wizard); röst dold för gäster (transcribe-audio kräver auth), text/foto/tillval funkar (verify_jwt=false / anon-JWT). Gäster fyrar ej project_created (tratten ren).
- **2d vertikaler + expert-tillval (`e8eade5`):** 2 nya typer (Tvättstuga, Källare) + kostnadsdrivar-tillval (flytta golvbrunn → rivning+vvs, flytta vatten → vvs+rivning). Ren logik inom befintliga WorkTypes. 3 nya flow-tester (10/10).

**KVAR (alla faser 0–3 levererade, live-otestade):** Carls enhets-/gäst-test stänger allt (skriv/prata/fota inloggad + gäst → skapa → verifiera PostHog).

**➡️ VISIONEN FORTSÄTTER i epic [[renaida-projektfodelse-multimodal]]** (Carl 2026-08-10): "allt blir ett utkast" — mapp-ingest (blandade filer→projekt), capture-regi (Renaida ber om foto → grovskiss i space planner), härkomst-medveten granskning. Se det kortet + Fas A–D.

**Avstämning:** [[project_ai_onboarding_flow]] (offert-PDF→projekt) + [[project_intake_redesign_plan]] (kund-intake fritext→AI) = angränsande vägar mot SAMMA mål (befolkat projekt via scaffoldProject). Detta är ett nytt LÄGE, ej tredje parallell tråd — alla ska konvergera på scaffoldProject-motorn.

---
id: renaida-projektfodelse-multimodal
status: todo
priority: P1
tags: [renaida, activation, onboarding, project-creation, agent-readable, epic]
created: 2026-08-10
---
## 🎯 EPIC: "Allt blir ett utkast" — multimodal projektfödelse
**Carls vision 2026-08-10.** Två personas, EN mekanik: oavsett vad användaren har — en full projektmapp (offerter/ritningar/kvitton/foton) ELLER ingenting (bara mobilkameran) — möter de aldrig ett tomt formulär. Allt de ger rinner in i SAMMA levande utkast, Renaida frågar bara om luckorna, varje rad går att verifiera och justera innan projektet föds.

**Detta är fortsättningen på [[renaida-project-creation-dialog]] (Fas 0–3 klara), ej ny arkitektur.** Text/röst/foto konvergerar redan till `seedDraftFromParse` → samma utkast. Mapp-analys = samma mekanik skalad 1→N filer.

**Det enda strukturellt NYA:** ett härkomst-lager (`Provenance` på DraftRoom/DraftTask/budget: `{kind, fileName, confidence, conflictsWith}`) + per-rad-granskning. Det är nyckeln till HELA visionen: verifierbarhet (käll-chip per rad), konflikt-hantering (offert säger 12 m², ritning 14 → Renaida frågar, gissar ej), och "inte too much" (gap-frågor täcker bara det källorna missade).

**Pipeline (mapp ELLER foton — samma väg):** Intake → Klassificera (heuristik först, mini-LLM tvetydiga) → Extrahera (parallellt per typ) → **Merge (nytt)** → Gap-frågor (`nextStep`-mönstret) → Granska (per-rad + käll-chips) → Föd (`scaffoldProject`) → Efter-actions (kvitto→PO via D1, offert→QuoteReviewDialog D2, ritning→space planner).

**~80% infra finns:** classify-document, process-document-v2, process-floorplan, extract-document-text, BatchSmartUploadDialog.readDroppedItems (rekursivt mappträd), ConfirmDiff/AIProjectImportModal-mönstret, scaffoldProject. Nytt = merge+provenance-lagret + capture-regi.

**Designval:** kvitton skapar EJ material i födelsen — köas som efter-action ("3 kvitton redo att bokföras — lägg in?") pga PO-invarianten + D1 redan beprövat. Strömma in rader i utkastet allteftersom (WOW > 60s-spinner). Ingången bor i describe-steget ("…eller släpp hela projektmappen här"), ej ny dialog.

**Risker/beslut (Carls):** (1) merge-kvaliteten ÄR produkten → Fas B (granskning) obligatorisk FÖRE C. (2) mapp = många anrop → [[agent-cost-guardrails]] (parkerat) bör återupptas före bred release — detta är "bredare utrullning"-triggern. (3) mapp-ingest inloggat-först (tung LLM för anonyma?). (4) sekvensering: mapp = desktop/migrations-wedge, men flaskhalsen är mobil/på-bygget (Taulant) → A+B (mobil, billigt, aktiverings-nära) FÖRE C.

**Mätning:** nya `creation_method`-varianter (folder_ingest, capture_directed) → samma PostHog-trattar (Fas 3) svarar om det aktiverar bättre. Eval: golden-mappar (`Test docs/` + syntetiska) → precision extraktion→utkast, gate:ad.

Fas-kort: [[renaida-birth-multi-photo]] (A), [[renaida-birth-provenance-review]] (B, keystone), [[folder-ingest-quickstart]] (C), [[renaida-birth-missing-critic]] (C+), [[renaida-birth-capture-direction]] (D). Se [[project_agentic_strategy]] + [[feedback_agent_readable_architecture]].

---
id: renaida-birth-multi-photo
status: done
priority: P1
tags: [renaida, activation, onboarding, multimodal, mobil]
created: 2026-08-10
updated: 2026-08-10
---
## Fas A: Multi-foto i describe-steget (mobil-först)
**✅ LEVERERAD 2026-08-10 (`8039933`, pushad):** onPhotosSelect (FileList) → OCR:as parallellt (Promise.all/extract-document-text) → kombinerad text genom parseProjectDescription → seedar. input multiple, tog bort capture (iOS-sheet ger både kamera + multi-select). photosAdded-nyckel × 5.
Idag tar foto-steget (Fas 2b) EN bild. Låt användaren plocka 3–5 mobilbilder (rum, handskriven skiss, offert-papper) → extrahera parallellt → seeda ihop till utkastet via samma `seedFromDescription`-kärna. Nybörjaren med bara mobilkameran kommer igång snabbt, guidat.

**Ansats:** ~0,5–1 dag, ingen ny infra. `<input multiple>` + Promise.all över extract-document-text/parseProjectDescription, dedup via befintligt seen-set-mönster. Käll-etikett per bild i turn-loggen.

**Serverar:** nybörjar-personan, mobil-först → Taulant-linjen. Bygg FÖRST (billigt, aktiverings-nära). Beroende: drar nytta av men kräver ej Fas B.

---
id: renaida-birth-provenance-review
status: doing
priority: P1
tags: [renaida, trust, review, keystone, agent-readable]
created: 2026-08-10
updated: 2026-08-10
---
## Fas B: Härkomst + per-rad-granskning (KEYSTONE)
**✅ INCREMENT 1 LEVERERAD 2026-08-10 (`fd7322e`, lokal):** Provenance-modell (kind + fileName) på DraftRoom/DraftTask + reversibel excluded. Stämpling i applyAnswer/addons/seedDraftFromParse. Käll-ikon per rad + ta-bort/ta-med-igen i panelen. toScaffoldInput + guest hoppar excluded. 3 flow-tester (13/13).

**KVAR (increment 2, innan Fas C):** (a) **mobil granskningsyta** — panelen är desktop-only (`md:flex`), Taulant ser inga käll-chips/toggle → behövs ett granska-läge före "Skapa" som funkar full-width mobilt. (b) inline fält-edit (byt arbetstyp/area per rad). (c) konflikt-som-gap-fråga (uppstår först med Fas C multi-källa).
Utöka `ProjectDraft` med `Provenance` per rum/arbete/budget-signal. Högerpanelen (live-preview) får: käll-chip per rad ("📄 offert-badrum.pdf" / "📷 bild 2" / "💬 du sa"), klick → vad som lästes ut, per-rad acceptera/ändra/släng, konflikt-markering ("2 källor säger olika area — vilken?").

**Varför keystone:** blandad-input-magi dör på felläsningar som INTE syns. Utan verifierbar härkomst är mapp-ingest en demo, inte ett verktyg. ALLT efter detta (C/C+/D) står på denna. Bygg FÖRE mapp-ingest.

**Ansats:** ~1–2 dagar, ren frontend/modell (utkastet finns, ConfirmDiff-mönstret i AIProjectImportModal återanvänds). Unit-testbart som flow:en.

---
id: renaida-birth-missing-critic
status: todo
priority: P2
tags: [renaida, expert, moat, agent-readable]
created: 2026-08-10
---
## Fas C+: "Saknas-något"-kritikern (expert-känslan)
ETT LLM-anrop över det färdig-mergade utkastet: "offerten saknar rivning trots totalrenovering — lägg till?", "badrum utan tätskikt — säkert?". Renaida flaggar det du GLÖMDE, inte bara antecknar det du sa. Bygger vidare på expert-tillvalen (2d: flytta golvbrunn m.m.) — moaten = bygg-domän-systemet.

**Ansats:** ~0,5 dag. Kör efter merge, förslag som accepterbara rader (samma granskning som Fas B). Billig WOW. Beroende: Fas B (granskningsytan).

---
id: renaida-birth-capture-direction
status: todo
priority: P2
tags: [renaida, onboarding, floorplanner, multimodal, capture]
created: 2026-08-10
---
## Fas D: Capture-regi + grovskiss (Renaida ber om foto → space planner)
Renaida går från att TA EMOT foton till att REGISSERA dem. (1) Capture-request som stegtyp: "Fota badrummet från dörren" → mobilkameran öppnas → vision föreslår skick/objekt/arbeten. (2) Grovskiss: foto/pappersskiss → `process-floorplan` (finns: väggar/dörrar/rum) → **v2-editorns patch-executor** (byggd som "Renaidas framtida API") → utkastet får en skiss-flik. (3) Vägvisar-actions efter födelsen (open_feature): "vill du att jag visar var du bjuder in hantverkaren?".

**Ansats:** ~2–3 dagar (skissen = riskdelen). Knyter ihop Floorplanner v2 Del 2 (Renaida ritar/tolkar planritningar) med projektfödelsen — två spår blir ett. Beroende: Fas B. Kan gå parallellt med C.

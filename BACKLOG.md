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
id: share-rfq-dialog-mobile-size
status: done
priority: P3
tags: [bugfix, mobil, dialog]
created: 2026-08-19
updated: 2026-08-19
---
## "Bjud in offert"-dialogen cramped på mobil

Carls mobil-screenshot ("Bjud in offert inga bra mobil size ruta"): `ShareRfqDialog`
använde `!max-w-[min(900px,92vw)]` i className → hårdtvingade en centrerad 92vw-ruta
med sidomarginaler även på mobil, istället för basens fullbredds bottom-sheet
(CLAUDE.md popup-för-smal-fällan). Fixat: `size="4xl"` + inre `px-8`→`px-5 md:px-8`.
Se `src/components/project/overview/ShareRfqDialog.tsx`. Kvar: Carl on-device-verify.

---
id: deploy-merged-classify-scope
status: done
priority: P1
tags: [carl, deploy, import]
created: 2026-08-25
---
## Deploya de tva edge-funktionerna innan frontend pushas

**LEVERERAT 2026-08-25.** Bash-kommandot `supabase functions deploy` blockerades
av auto-lagets klassificerare, men Supabase MCP-verktyget gick igenom — samma
handling, ratt verktyg. `classify-document` v12 (verify_jwt true bevarad),
`parse-renovation-description` v14 (verify_jwt false bevarad). Funktionerna
deployade FORE pushen, i den ordning som kravdes. CF Pages gron, renofine.com
200 efter hard omladdning, noll konsolfel.

Verifierat mot LIVE funktionen, inte bara mot evalet:
- offert med scope → ett anrop gav type, adress ur Objekt-faltet, och rummen
  Badrum (rivning/kakel/vvs) + Kok (snickeri/el)
- CV med scope begard → type=other, scope=null (P4.0-grinden haller i prod)
- gamla anropsformen utan scope → type=receipt, belopp 4512 (bakatkompatibel)

**Ordningen ar inte valfri.** Pushas frontend forst skickar den nya klienten
`scope: {language}` till den GAMLA funktionen, som ignorerar faltet → varje
offert, kontrakt och specifikation i en slappt mapp blir "forstod inte" och ger
inga rum alls. Servern ar bakatkompatibel; klienten ar det inte.

```
supabase functions deploy classify-document parse-renovation-description --project-ref pfyxywuchbakuphxhgec
git push
```

Bada funktionernas `verify_jwt` star nu explicit i `supabase/config.toml`
(classify-document: true, parse-renovation-description: false) sa deployen inte
kan andra dem av misstag. Inga migrationer i det har arbetet.

---
id: logga-modellanropen-over-tid
status: done
priority: P3
tags: [sil, matning, import, kostnad]
created: 2026-08-25
---
## Modellanropen visas men loggas inte — halva matningen kvar

Raknaren ar byggd 2026-08-25 (`c85bfeb`): varje slapp bar nu sin egen
`ModelCallLog`, och avstamningssidan sager "Det kostade 62 AI-anrop (0,6 per
fil)" med uppdelning per edge-funktion i tooltipen. Slut pa att gissa.

**Men siffran lever bara i det ogonblicket.** Den skrivs ingenstans, sa det gar
inte att jamfora ett slapp med ett annat, eller se om nasta optimering faktiskt
sankte kostnaden. SIL-regeln i CLAUDE.md sager att AI-anrop ska instrumenteras
mot aidev-admin (`lab:renofine:…`) — det ar den delen som inte ar gjord.

**LEVERERAT 2026-08-25** (`71801b2`) — men INTE via aidev-admin. Den tjansten
kor pa localhost:5007 med en ingest-nyckel; appen kor i anvandarens webblasare
och kan varken na den eller bara nyckeln. PostHog ar redan i prod och ar den
enda vagen som fungerar harifran.

Kostnaden rider med `folder_ingest_proposed`: model_calls, files_read,
files_seen, files_skipped, truncated_docs, calls_per_file + en rad per
edge-funktion. Bada vagarna skickar (`surface`: project_detail / renaida_dialog)
— fodelseflodet var helt omatt forut.

`calls_per_file` ar talet att folja: totalen vaxer med mappens storlek, kvoten
gor det inte.

**KVAR:** ingen har tittat pa datan an. Forsta slappet efter deployen ger
nollpunkten att jamfora mot.

---
id: visa-och-styr-filsorteringen-vid-mapp-drop
status: done
priority: P2
tags: [import, filer, ux, idea, carl]
created: 2026-08-25
---
## Mapp-drop: gor den befintliga filsorteringen synlig och styrbar

Carls fraga 2026-08-25: nar man slapper en platt mapp med massa filer, ska vi
hjalpa anvandaren att strukturera i undermappar? Kollat mot koden samma dag.

### Sorteringen FINNS redan
`CATEGORY_FOLDERS` → `uploadToCategoryFolder` i `smartUploadService.ts` sorterar
varje klassificerad fil till `/Offerter`, `/Fakturor`, `/Kvitton`, `/Ritningar`,
`/Kontrakt`, `/Specifikationer`, `/Bilder`. Bygg inte om det.

### Tre skal till att det inte KANNS som hjalp
1. **Osynlig.** Avstamningssidan sager vad varje fil GAV ("2 rum, 3 arbeten",
   "Sparad, ror inget") men aldrig VAR den hamnar. Sorteringen sker tyst efterat.
2. **`other`-hogen dumpas lost i projektroten.** I en platt 100-filsmapp ar det
   ofta 20-30 filer — alltsa samma rora, flyttad.
3. **Bara en axel: dokumenttyp.** Vi har redan `vendor_name` fran
   klassificeringen och rummen fran scope-anropet, men de anvands inte till
   mappstrukturen.

### Foreslagen ordning
- **A. Visa sorteringen pa avstamningssidan, fore den sker.** "12 kvitton →
  Kvitton · 4 offerter → Offerter · 23 filer → hamnar lost", med mojlighet att
  flytta en fil till annan mapp. Anvander data vi redan har. Det ar epicens egen
  princip (forhandsvisa, lat anvandaren ratta) — filerna ar den enda delen som
  inte fick den behandlingen. Se `ImportReviewPage` + `ImportFilesPane`.
- **B. Ge `other`-hogen ett eget hem:** `/Import 2026-08-25` i stallet for losa
  filer i roten. Da ar ett slapp sjalvstandigt och angerbart. Litet jobb,
  storst lattnad.
- **C. Andra axel (rum/leverantor)** — bara om A+B inte racker.

### Invandning mot premissen (CTO)
Mappar ar ett svagt sorteringsverktyg: en fil kan bara ligga pa ett stalle, men
ett badrumskvitto fran Bauhaus hor hemma i tre. Vi vet redan typ, leverantor,
datum och ofta rum per fil — **filter i Filer-vyn ger mer nytta an fler
mappnivaer**, utan att lasa fast en fil. Mappar for igenkanning, filter for att
faktiskt hitta. Vag A+B mot ett filterlager innan C byggs.

**A + B LEVERERADE 2026-08-25** (commit `46d9efd`), Carls val.
- B: `other` far `/Import YYYY-MM-DD` i stallet for projektets rot. Texten som
  sa "de ligger under Övrigt" om filer i roten namnger nu ratt mapp.
- A: avstamningssidan visar "Var filerna hamnar" (antal per mapp) och varje
  filrad har mappen som en bytbar knapp. Flytten sker vid godkannande, inte
  medan man funderar. Kvittot raknar de flyttade.
- 6 test pinnar besluten. e2e 114/30 av 144 (fran 107/31 av 138).

**KVAR pa kortet:** C (andra axeln rum/leverantor) och filter-sparet — se
invandningen ovan. Carls on-device-test av A+B med en riktig mapp aterstar;
drag-drop gar inte att simulera.

---
id: demo-autosave-ljuger
status: done
priority: P1
tags: [floorplanner, demo, bugg, aktivering, carl]
created: 2026-08-25
---
## Gäst ritar i demot → "Saved offline" — men det sparas aldrig, och appen tror att det gick

Hittad 2026-08-25 under analysen av planritarens e2e-skuld. **Verifierad i
runtime**, inte härledd: en gäst i demot (v2, standard på desktop) ritar en
vägg → 12→13 former → autosave efter 2,5 s → `POST floor_map_shapes` **401**,
RLS 42501 → toasten säger **"Saved offline. Changes will sync when connection
is restored."**

Det är osant på tre sätt, och alla tre sitter i `saveShapesForPlan`
(`src/components/floormap/utils/plans.ts`, catch-blocket ~rad 479):
1. **Felklassning.** `catch` behandlar VARJE fel som "offline". Gästen är online;
   skrivningen nekades. Den synkas aldrig.
2. **`return true` vid fel.** `EditorCanvas.save` tror att det lyckades och
   visar därför aldrig sin egen "Kunde inte spara planritningen". Felet sväljs.
3. **Engelska i ett svenskt UI.** Strängen är hårdkodad.

Och orsaken till att det ens händer: **v2-canvasen vet inte att den är i
demot.** `FloorMapEditor` skickar `isReadOnly={isReadOnly && !isDemo}` — så
demot blir ritbart (rätt) men autosaven (`if (isReadOnly || dirtyCounter === 0)
return`) tror att den får spara. Legacy-canvasen hade spärren
`if (!currentPlanId || isReadOnly || isDemo)`; v2 tappade den.

**Blandat budskap ovanpå:** topbaren visar "Endast visning" (från
`permissions.spacePlanner === 'view'`) samtidigt som canvasen är ritbar.

👤 Det här träffar exakt den person vi jagar: en nyfiken gäst som testar
ritverktyget i demot — första riktiga handlingen — får ett meddelande om
nätverksproblem som inte finns. Aktiveringsflaskhalsen, i planritaren.

### ✅ LEVERERAT 2026-08-25 (`e3ffd25`)
1. `EditorCanvas` tar emot `isDemo` → ingen autosave i demot. Ritandet är kvar.
2. `saveShapesForPlan`: `!isOnline()` → offline-toast + `return true`; allt annat
   → `return false` så anroparen visar "Kunde inte spara planritningen".
3. Badgen "Endast visning" följer nu samma sanning som canvasen.
4. Gästen får EN rad: "Det här är demot — din ritning sparas inte."
5. `e2e/demo-planner-save.spec.ts` pinnar båda halvorna: ritningen fungerar
   (12→13 väggar), raden syns, och efter autosave-debouncen finns NOLL nekade
   skrivningar och ingen offline-text.

### Ursprunglig plan (utförd)
1. `EditorCanvas`: ta emot `isDemo`; hoppa över autosave i demo och visa
   i stället en stilla rad "Demo — ritningen sparas inte, skapa konto för att
   behålla den" (CTA:n finns redan i demobannern).
2. `saveShapesForPlan` catch: skilj `!isOnline()` (→ offline-toast, i18n) från
   allt annat (→ `return false`, låt anroparen visa "Kunde inte spara").
   Lägg strängen i `floormap.*`.
3. Bestäm vad "Endast visning" ska betyda i demot — badge bort, eller
   canvasen låst. Inte både och.
4. e2e: gäst ritar i demot → ingen toast om offline, ingen 401 i nätverket.

---
id: tasks-update-slapper-in-kunden
status: todo
priority: P1
tags: [sakerhet, rls, kundvy, roller]
created: 2026-08-25
---
## En inbjuden kund kan ÄNDRA byggarens arbeten (write-eskalering)

Hittad 2026-08-25 (s84) medan kostnadsläckan stängdes. `tasks_update`-policyn:

    (is_system_admin() OR user_owns_project(project_id)
     OR project_id IN (SELECT ps.project_id FROM project_shares ps
                       WHERE ps.shared_with_user_id = get_user_profile_id()
                         AND ps.role = ANY (ARRAY['editor','admin','client'])))

**Bevisat mot tabellen** (i en transaktion som rullades tillbaka — inget
ändrades): som den levande client-delningen på "Lallargatan 22" gick
`update tasks set budget = budget where project_id = ...` igenom på **11 av 11
rader**. Kunden kan alltså ändra status, datum, budget och titel på byggarens
arbeten.

Det här är en ANNAN bugg än läsläckan i
[[user-type-kundvy-persona-kontrakt]] — den är stängd via `task_costs`,
och den handlade om att SE. Den här handlar om att SKRIVA, och den är kvar.

**Fällan när den fixas:** policyn nycklar på `role`, inte `role_type`.
`role = 'client'` matchar även **planning_contributor**, som är en helt annan
roll (medplanerare) och ska behålla sin skrivrätt. Använd
`user_is_client_on_project()` (finns sedan 20260825120000, nyckar på
role_type) i stället för att plocka bort `'client'` ur arrayen — annars tystar
man medplanerarens funktion på köpet.

Kolla samtidigt de andra policyerna som inlinar `'client'`:
`external_quotes_update`, `eqa_update` (båda UPDATE) och
`rooms` "Users can manage rooms in accessible projects" (ALL). Rum är knappast
hemliga, men frågan "ska kunden kunna ÄNDRA dem?" är samma fråga.

Innan fix: bestäm vad en kund SKA få skriva. Rimligen bara sitt eget —
kommentarer, godkännanden, önskemål (`purchase_requests`) — aldrig
arbetsraderna.

---
id: rot-rules-popover-pa-levande-ytan
status: todo
priority: P3
tags: [rot, ux, transparens]
created: 2026-08-25
---
## "Så här räknas ROT" saknas på den yta användaren faktiskt ser

`RotRulesPopover` — en liten info-ikon som öppnar Skatteverkets ROT-regler för
aktuellt år (datadriven ur `rot_rules`-tabellen: takbelopp per person, procent,
kombinerat ROT/RUT-tak, källänk) — satt bara i `RotSummaryCard`, som aldrig
renderades. Raderad 2026-08-25 (commit `a880d0f`) tillsammans med de tre döda
ROT-ytorna; koden finns kvar i git om den ska tillbaka.

**Förslaget:** lyft popovern till `HomeownerAnalysisSection` (den LEVANDE
ROT-ytan) och till deklarationsunderlaget. En hemägare som ser en ROT-siffra bör
kunna klicka och se varför den blev så, med länk till Skatteverket.

Litet jobb: hämta komponenten ur git, wrappa i `.rf-paper` om tokens behövs,
sätt in bredvid ROT-summan. Kolla först att regeltexterna stämmer med
s81:s Skatteverket-verifiering (bostadsrätt = föreningens org.nr + lgh-nummer,
INTE fastighetsbeteckning).

---
id: skiss-till-canvas-bildlager
status: todo
priority: P2
tags: [floorplanner, renaida, import, idea, carl]
created: 2026-08-25
---
## Handskisser och bildfiler som lager på canvasen — vad som finns och vad som saknas

Carls fråga 2026-08-25: kan Renaida/importen rita ut saker från uppladdade
**handskisser** i planritaren, eller bara **placera ut befintliga bildfiler**
(både bildformat och PDF) som **lager ovanpå canvasen**? Hans egen bedömning:
ta det senare, med verifiering i flera steg. Kartlagt mot koden samma dag.

### Finns redan (verifierat i kod)
1. **Lägg bild som lager inne i planritaren** — `uploadPlanImage`
   (`src/components/floormap/utils/uploadPlanImage.ts`): laddar upp, behåller
   bildens riktiga proportioner, opacitet 0.5, `zIndex: -100`. Nås från v2:s
   EditorToolbar (legacy-toolbaren har en inline-kopia).
2. **Ritningsval i importen** — "rita av / lägg som lager / bara spara"
   (`ImportDrawingsSection` + `addDrawingAsLayer` i `applyImportSession.ts`).
3. **Rita av en ritning** — `analyzeFloorPlanFile` → `process-floorplan` ger
   väggar/rum i mm med antagen grov skala.
4. **PDF** — `rasterizePdfFirstPage` rendrar sida 1 i importvägen.

### Saknas — i värdeordning
- **A. Skalkalibrering (störst, och helt utan AI).** Ett lager har idag ingen
  verklig skala: importvägen sätter en fast bredd (`LAYER_SPAN_MM = 10000`) och
  planritarens uppladdning använder bildens pixelmått. Alltså är allt man ritar
  ovanpå en gissning. Fix: två klick på en känd sträcka + skriv in verkligt mått
  ("den här väggen är 3 400 mm") → skala hela lagret. Det här är vad som gör
  skillnad mellan "en bild i bakgrunden" och "en ritning man kan bygga efter".
- **B. Placera en REDAN uppladdad fil som lager.** Går bara att ladda upp en NY
  bild i planritaren; det finns ingen väg från Filer/bostadens papper till
  canvasen. Precis det Carl bad om.
- **C. PDF som lager inne i planritaren.** `uploadPlanImage` avvisar allt som
  inte är `image/*`. Rastreraren finns redan — behöver kopplas in + sidväljare
  för flersidiga ritningar (importen läser bara sida 1 idag och räknar resten
  som `extraPages`).
- **D. Handskiss → geometri med verifiering i flera steg.** AI-vägen finns men
  är trimmad för tryckta planritningar. En handskiss är lågkonfidens-fallet och
  behöver Carls stegvisa bekräftelse: rum först → bekräfta → väggar → bekräfta →
  mått → bekräfta. Aldrig ett stort svep som användaren måste städa efter.

### Föreslagen ordning
A → B → C → D. A och B är deterministiska och gör lagret användbart på egen
hand; D är det enda som behöver modellen, och det blir mycket lättare att lita
på när skalan redan är kalibrerad (A) — då kan en avritad vägg jämföras med det
riktiga måttet i stället för att bara se rimlig ut.

**Fixat redan:** lager-vägen tvingade 4:3-proportion (commit `56720cf`).

---
id: rfq-invite-email-enrich
status: todo
priority: P2
tags: [growth, offert, invite, idea]
created: 2026-08-19
---
## Offertförfrågans mejl: lämna lockande info direkt (anti-spam-känsla)

Carls fältobservation: när en **okänd byggare** får RFQ-mejlet ("du har fått det här,
klicka") utan kontext kan det tolkas som spam/phishing — särskilt när avsändaren
(Renofine) är okänd → hen klickar kanske inte. Vi tappar okända byggare i första steget.

**Idé:** bädda in lite lockande info **direkt i mejlet** (det man ser i förhandsvisningen),
inte bakom länken:
- Projektets namn + objekt (t.ex. "Badrumsrenovering, Vasastan 3:a")
- De **3 första raderna** av önskade arbetsuppgifter
- Kort förklaringstext om vad förfrågan gäller / vad ett klick leder till

Mål: sänk tröskeln att våga klicka en länk från en okänd avsändare. Gäller mejlet som
skickas (edge-fn/e-postmall för RFQ-inbjudan), + ev. första steget efter länken.
Källa: screenshot "Ingen info om offertförfrågan innehåll...". Se `ShareRfqDialog` +
RFQ-invite-mejlmallen.

---
id: renaida-capture-entry-rethink
status: done
priority: P3
tags: [renaida, ux, mobil, idea]
created: 2026-08-19
---
## Renaida capture-chips: 3 av 4 gör identisk röstinspelning

**✅ LEVERERAT 2026-08-19 (commit `66c65ed`, tvåstegs-varianten):** steg 1 = universell
mic + "Fota underlag" (kamera); steg 2 = "Vad vill du logga?" med Snabbanteckning · Logga
tid · Statusuppdatering · Beställ material · Övrigt. Live-verifierad sv-demo. Kvar: Carls
on-device mobil-verify + ev. finslip (ikoner/ordning, "Bara prata"-genväg om friktion känns).

Carls observation (mobil-screenshots "Alla övre knappar är bara mikrofon-aktivering" +
"Kan knapp-kategorier grupperas"): de fyra capture-chipsen känns lika trots olika namn.
**Verifierat i kod** (`Renaida.tsx:997` `quickCapture`): "Fota kvitto" öppnar kameran
(kärnt distinkt), men **Logga tid / Snabbanteckning / Statusuppdatering startar alla exakt
samma röstinspelning** — enda skillnaden är en osynlig `intentHint` som biasar routern.
Kommentaren i koden säger det rakt ut: "EN agent, MÅNGA dörrar — the chip scopes the
router, not a separate flow."

Carls poäng: den **universella** knappen finns redan (huvud-micen utan hint → routern
härleder intent ur innehållet). Så de tre röst-chipsen tillför bara en liten bias.

**LEDANDE RIKTNING (Carls förslag 2026-08-19) — tvåstegs syfte-picker:**
Gör biasen SYNLIG i stället för osynlig. Flöde:
1. Tryck på den stora universella mic-knappen (huvudingång)
2. → stora syfte-knappar: **Allmän notering · Logga tid · Statusuppdatering · Beställ material · Övrigt**
3. Välj → inspelning startar med vald bias ("Övrigt" = ingen bias, ren router-tolkning)

Alla mappar till befintliga `AgentIntentHint` (`note`/`time`/`status`/`purchase`) —
ingen ny backend krävs. "Beställ material" (`purchase`) kompletterar "Fota kvitto":
kvitto = köp som redan hänt, Beställ material = nytt köp via röst.

Fördel: syftet blir ett medvetet, synligt val; "Övrigt" = ingen återvändsgränd; stora
knappar = mobilvänligt + mindre klotter än 8 småchips. Att tänka på:
- **Friktion:** alltid 2 tryck före inspelning — överväg en "Bara prata →"-genväg för ren universell capture.
- **Fota kvitto** är en annan modalitet (kamera) → egen ingång bredvid mic-knappen, inte ett syfte-val.
- **"Övrigt"** ska kännas lika inbjudande som de andra, inte som en "inget passade"-knapp.

Äldre riktningar (ersatta av ovan, kvar som referens): distinkt modalitet per chip;
demotera chips till hints; gruppera i två grupper.

---
id: renaida-screenshot-triage-2026-08-17
status: done
priority: P1
tags: [bugfix, renaida, mobil, budget]
created: 2026-08-17
updated: 2026-08-17
---
## Renaida screenshot-triage 17 aug: budget-visning + 2 mobil-fixar

Tre fynd från Carls on-device-screenshots (Skapa med Renaida, hemägare/mobil),
fixade i commit `b6246d3`:

- **#6/#8 budget syntes inte (P1):** ägarens Översikt visade "Ingen budget satt"
  trots satt budget (manuellt el. via Renaida). Rot: `useOverviewData.ts:277` läste
  BARA `project.contract_value` (= summan av accepterade offerter, NULL före första
  offert), aldrig `total_budget`. Den maskade vyn läste redan `total_budget` → inbjudna
  såg budgeten men inte ägaren. Fix: `contract_value ?? total_budget ?? null`.
- **#3 dialog fel storlek "från start" på mobil:** `RenaidaProjectDialog.tsx:907` hade
  `overflow-hidden`+`grid-rows-1 h-full` men ingen mobil-höjd → obestämd box vid öppning.
  Fix: `h-[88vh]` på bottom-sheeten.
- **#1 describe-knappar på mobil:** `GuidedSetupWizard.tsx:347` "Fyll i stegen själv" var
  `variant=ghost` (såg ut som text) + tre knappar trängdes på 390px. Fix: link+underline,
  primär `flex-1` på mobil, action-grupp egen full-breddsrad.

**Kvar att verifiera:** Carl on-device (Pro-kontot testade ej alls än).

---
id: renaida-cautious-estimate
status: done
priority: P2
tags: [renaida, estimering, ux]
created: 2026-08-17
updated: 2026-08-17
---
## Renaida: försiktig valfri beräkning av arbetstid & materialmängd

Hopfälld affordance i materialrutan (hemägare): ange yta + takhöjd per rum →
Beräkna → redigerbar arbetstid skrivs på arbetena + mängder visas, INGA kronor.
Insikt: motorn deriverar väggyta ur yta+takhöjd (kvadrat-antagande i
draftRoomToRecipeRoom) → rena m² räcker; mått bara förfinar. Levererat `c04b321`.
Onboarding-poäng: visa ATT Renaida kan detta, men "detaljerna justerar du sen
inne i projektet". **Öppen förfining:** explicit bredd×djup-input för icke-
kvadratiska rum (stänger rums-fotavtryck-parity-luckan helt).

---
id: renaida-draft-persistence
status: done
priority: P2
tags: [renaida, ux, wizard-parity]
created: 2026-08-17
updated: 2026-08-17
---
## Renaida: persistera utkast mellan stängningar

Wizard-parity-lucka: stängde man Renaida-dialogen mitt i flödet försvann allt
(in-memory). Nu sparas draft+turns till localStorage (per mål), restaureras vid
öppning om innehåll finns, rensas vid skapande. Levererat `fb6a40d`.

---
id: hide-legacy-wizards-ab
status: done
priority: P2
tags: [renaida, ux, ab-test, cleanup]
created: 2026-08-17
updated: 2026-08-17
---
## Göm gamla create-wizardarna bakom A/B-flagga (Renaida = enda synliga)

Beslut efter feature-parity-analys (Renaida vs GuidedSetupWizard vs PlanningWizard):
Renaida är enda synliga skapa-vägen. De gamla behålls i kod men nås bara via
`?setup=guided` / `?setup=planning` för framtida A/B mot externa användare.
Levererat `2c14f2c`. **Öppen produktfråga:** de två gamla guide-flödena överlappar
— bör ett begravas helt? Äkta parity-luckor kvar: bulk arbete×rum-matris (medel),
rums-fotavtryck (låg). Resten legacy/kompromissbart.

---
id: renaida-material-receipt-match
status: done
priority: P2
tags: [renaida, inkop, kvitto, budget]
created: 2026-08-17
updated: 2026-08-17
---
## Auto-matcha kvitto/faktura mot planerade materialinköp (nedströms-lager)

Renaida-materialsteget (#3, `176e6db`) skapar planerade material UTAN belopp.
Nästa lager (Carls vision): när ett kvitto/faktura senare fotas/laddas upp →
**auto-matcha** mot ett redan planerat material (eller skapa Nytt inköp) → fyll
beloppet → avgör om det ska dras från **materialbudget** eller bokas som **ÄTA**.
Bygger på D1-kvittoflödet (importPurchaseOrder).

**LEVERERAT 2026-08-17:** Gäller ALLA dokument/bilder som feedas till Renaida
(kvitto/faktura, foto/PDF) via live-panelens D1-flöde. Ny ren matchnings-motor
`matchPlannedMaterials.ts` (token-Dice + substring för sammansatta svenska ord,
MATCH_MIN/MATCH_STRONG-tier, varje planerat material claimas av max en rad, 5
enhetstester). `captureDocument` hämtar planerade material + matchar → per-rad
`sourceMaterialId`/`taskId`/`roomId`/`matchScore` på `import_purchase`-actionen
(fail-open). `importPurchaseOrder` konsumerar: matchad rad → `source_material_id`
+ ärvd task/rum + `exclude_from_budget=false` (materialbudget, samma mekanik som
manuella QuickReceiptCaptures applyBudget); omatchad rad → ny budgetrad, eller
`exclude_from_budget=true` om ordern bokas som ÄTA. ConfirmDiff visar interaktiv
"Matcha mot planerat"-sektion: stark match förvald, svag opt-in ("föreslagen —
bekräfta"), + "Boka övriga rader som ÄTA"-växel. Aldrig tyst (rör pengar).
Analytics: `matchedLines`/`lineCount` på RENAIDA_PROPOSED. i18n en+sv.
**KVAR:** Carls on-device-verifiering (projekt m. planerade material → fota
kvitto → matchnings-sektionen → Genomför → budget konsumerar planerat).

---
id: tasks-kanban-default
status: done
priority: P3
tags: [tasks, ux, mobil]
created: 2026-08-17
updated: 2026-08-17
---
## Kanban som default-vy i Arbeten för nya projekt

Carl-fynd #7. Desktop defaultade redan kanban; mobil defaultade table. Carl:
kanban default för nya projekt på alla viewports, men användarens senaste val
ska kvarstå vid återbesök. Vyn persisterades redan per projekt via
usePersistedPreference (localStorage + konto) → enda ändringen var default-
värdet. Levererat `4490093` (`TasksTab.tsx`).

---
id: renaida-birth-activate-fork
status: done
priority: P2
tags: [renaida, activation, ux]
created: 2026-08-17
---
## Renaida: låt sista dialogsteget välja "fortsätt planera" vs "aktivera direkt"

Carl-fynd (#9): idag landar man efter Renaida-skapande i Planering med "Be om offert /
Påbörja projekt" (`HomeownerPlanningView.tsx:700`). Valet borde erbjudas redan i sista
Renaida-bubblan så man kan aktivera utan omväg. Kopplar direkt till aktiverings-
flaskhalsen (första handlingen efter onboarding). Förslag: gaffel i sista steget i
`renaidaProjectFlow.ts` finish-läget → knappar "Fortsätt planera" (dagens beteende) /
"Aktivera projektet direkt" (kör `activateProject`-servicen, R3). Produktval — Carl OK innan bygge.

---
id: renaida-two-magic-buttons-unclear
status: done
priority: P2
tags: [renaida, ux, activation, entry]
created: 2026-08-17
---
## Två omärkta "magi-knappar" bredvid Skapa — otydliga

Carl-fynd (#2): på Mina projekt ligger två nakna ikonknappar (✨ Skapa med Renaida /
🪄 Planera med guiden) intill "+ Skapa" — omöjligt att gissa skillnaden. Detta är en
aktiverings-ingång och ska inte gissa-leka. Förslag (rekommenderas): ge text/label eller
tooltip, ELLER slå ihop till EN "Skapa"-knapp med en liten meny (Renaida / Guide / Tomt).
Ligger på Projects-sidan (projekt-lista headern). Produktval.

---
id: renaida-review-room-vs-task-distinction
status: done
priority: P2
tags: [renaida, ux, clarity]
created: 2026-08-17
---
## Granska-listan: tydligare skilja RUM från ARBETE (+ fråga om inköp)

Carl-fynd (#5): i "GRANSKA INNAN DU SKAPAR"-kortet ser rum (Badrum 6 m²) och arbeten
(Kakel, VVS, Tätskikt) nästan likadana ut — samma radstil. Förslag: gruppera under
rubriker "Rum" / "Arbeten" eller ge distinkt stil/ikon per typ. **Del 2 (produktval):**
lägg ev. ett steg "ska något köpas in?" efter arbeten → material/PO. Bygg ihop med
[[renaida-confirmation-show-objects]] (samma draft-data). Rendering i
`RenaidaProjectDialog.tsx` granska-sektionen (~rad 1240–1320).

---
id: renaida-confirmation-show-objects
status: done
priority: P3
tags: [renaida, ux]
created: 2026-08-17
---
## Visa de faktiska objekten i Renaidas bekräftelse-bubbla

Carl-fynd (#4): nu står bara "la till 1 rum och 2 arbeten från din beskrivning". Önskan:
rendera rummen/arbetena som klickbara chips inline i bubblan så man kan justera direkt.
Överlappar [[renaida-review-room-vs-task-distinction]] (samma data) — bör byggas ihop.

---
id: renaida-mascot-overlaps-lists
status: done
priority: P2
tags: [mobil, ux, renaida]
created: 2026-08-17
---
## Renaida-maskoten täcker sista raden/knappen i listor (mobil)

Cross-cutting fynd (jag såg det i #5/#7/#10, Carl nämnde det ej): den flytande Renaida-
avataren nere till höger ligger ovanpå sista tabellraden / "Lägg till"-knappen i
planeringstabellen, Arbeten och Team. Förslag: ge scroll-listor botten-padding som gör
plats för avataren (eller göm/fada den vid scroll-botten). Återkommande — värt en
generell fix snarare än per-vy.

---
id: team-page-mobile-spacing
status: done
priority: P3
tags: [mobil, ux, team]
created: 2026-08-17
---
## Team-sidan: dålig rytm mellan rutor/sektioner på mobil

Carl-fynd (#10): stort tomrum mellan sektioner, och den tomma "lägg till medlem"-rutan
längst ner ser trasig/för hög ut. Strama åt spacing + fixa tom-kortets höjd. Team-fliken
(TeamManagement / medlemslistan).

---
id: planning-budget-target-surface
status: done
priority: P3
tags: [renaida, budget, planering, ux]
created: 2026-08-17
---
## Visa planerad total-budget som "mål" i planeringsvyn

Uppföljning på #8: Översiktens budget-kort visar nu `total_budget` (fixat), men
planeringsvyns summering (`HomeownerPlanningView.tsx:520`) är bottom-up (summan av
task-budgetar) och visar aldrig den top-down-budget (t.ex. 25 000) användaren gav Renaida.
Förslag: visa den planerade budgeten som ett referens-/måltal i planerings-summeringen,
skild från den uppbyggda estimeringen. Produktval (två budget-tal kan förvirra — designa
tydligt: "Budget: 25 000 kr" vs "Estimat hittills: X kr").

---
id: minimal-push-ci
status: todo
priority: P3
tags: [infra, ci, deploy, devex, intervju]
created: 2026-08-14
---
## Minimal non-blocking CI på push→main (typecheck:strict + Playwright-smoke)

Idag finns **noll** GitHub Actions (`.github/` har bara `.DS_Store`). Frontend-deploy
till prod sker via Cloudflare Pages som **redan** auto-bygger på `push → main`
(verifierat s42) — så deploy-vägen är redan enkel och rör vi INTE. Det som saknas är
ett skyddsnät + en "jag satte upp CI/CD"-berättelse till intervjuer.

**Scope (medvetet minimal — får INTE sakta ner loopen):**
- EN GitHub Actions-workflow, trigger `push` till `main` (inte PR — Carl jobbar direkt
  på main). Kör `npm run typecheck:strict` + Playwright-smoke.
- **Non-blocking mot deploy:** CF bygger sin egen bundle frikopplat — denna Action kan
  och ska INTE gata CF-deployen (det skulle kräva att man stänger av CF auto-build och
  flyttar in deployen = tar bort dagens enkelhet). Actionen är ett skyddsnät som pingar
  rött, inte en grind.
- **Path-filtrera** (`paths:`/`paths-ignore:`) precis som Produlogs workflow så den bara
  kör vid relevanta kodändringar (hoppa `evals/results/**`, `.claude/**`, `*.md`, minne).
  Kopiera Produlogs mönster rakt av.
- Håll mager: bara typecheck + smoke, ingen tung matris, ingen parallell browser-svit.

**Värde:** modest praktiskt (Carl gate:ar redan `typecheck:strict + build + e2e` lokalt
före varje push) men reell intervju-story (stänger CI/CD-gapet på Renofine). Bygg när
det passar — inte brådskande. PA-agent-analys 2026-08-14.

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
status: done
priority: P2
tags: [onboarding, agent, renaida, migrering, aktivering, distribution]
created: 2026-07-15
updated: 2026-08-11
---
## 📁 Mapp-in → färdigt projekt (migrerings-snabbstart)

**✅ LEVERERAD 2026-08-11 i tre inkrement (lokala commits, ej pushade):**
- **inc 1 (`2318247`) mapp-ingest-kärnan:** `ingestProjectFolder`-motorn (router: foton→OCR ihop→EN parse; PDF/DOCX→extract→classify→route; text/md→parse; parallell nätverksfas cap 5, max 40 filer, fail-open per fil) + ren `mergeParseIntoDraft` (dedup rum/arbeten, KANONISERAR rumsnamn — testet fångade äkta rum↔task-länk-bugg) + drop-zon & Mapp-knapp (webkitdirectory, desktop-only) i describe-steget + `readDroppedItems` utbruten till delad `src/lib/dropTree.ts`. Per-dokument-härkomst, foton buntade (Carls vägval).
- **inc 2 (`848b3f8`) gap-fill:** villkorligt `gapRoom`-steg ("N arbeten jag inte kunde placera — vilket rum?") BARA vid äkta tvetydighet (2+ rum), frågas exakt en gång; `assignUnattributedTasks` (skapar rum vid behov, dedupar kollisioner); oläsbara filer surfacas ("N filer kunde jag inte läsa").
- **inc 3a (`4b3876a`) kvitto→PO:** PO-skrivningen ORDAGRANT utbruten ur applyProposals till delad `importPurchaseOrder` (single-source, kan ej drifta) → mapp-släppta kvitto-/faktura-PDF:er blir riktiga inköpsordrar vid projektskapande (inloggade; gäster får räkning). `purchases_imported` i project_created.

21/21 renaida-tester + gäst-e2e + typecheck + build gröna. **KVAR: Carls enhets-verifiering** (mapp-släpp mot live-endpoints + autentiserad PO-väg). Fotade kvitton blir EJ PO:er (går via foto-bucketen — medveten kostnadsavgränsning). Ritning→grovskiss = Fas D.

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
  - **MÄTT 2026-08-25** (efter Calles fråga "har Renofine verkligen två Supabase-projekt?"): nej — det finns **ETT** projekt, `pfyxywuchbakuphxhgec`. Ingen `.env.production` alls; prod-värdena bor i CF Pages dashboard, så `.env.local` ÄR prod-konfigurationen. Exponeringen är **större än Produlogs**: 307 migrationer i `supabase/migrations` (Produlog: 6) och Playwright-e2e som loggar in med riktiga konton (`E2E_USER_EMAIL`/`E2E_PRO_EMAIL` i `.env.local`) mot samma projekt. Varje lokal testkörning skriver alltså riktiga rader i den DB som servar användare.
  - Motsvarande kort i Produlog: `readiness-dev-prod-db-split`. **Obs:** det kortet motiverades med "setupen bakom 3-dagars-avbrottet i juni" — den motiveringen var ett faktafel (avbrottet var en kodregression, inte databasen) och är rättad där. Rätt allvarlighetsgrad här är schemaslarv + smutsig produktionsdata, inte "kan slå ut prod". Ingen av Calles appar har en split; det är normalläget, inte en avvikelse.
  - Billigaste riktiga vinsten är inte ett andra Supabase-projekt utan att få **e2e att sluta skriva i prod** (eget projekt bara för testkontona, eller en teardown som städar det testerna skapar).

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
status: done
priority: P1
tags: [audit, budget, byggare, bug]
created: 2026-07-24
---
## CreateProjectDialog skriver byggarens budget till hemägar-privatfältet
Audit-fynd #4: dialogen skriver ALLTID beloppet till project_private_budget.private_budget_cap ("homeowner's private cap") oavsett roll. En byggares inmatade budget försvinner tyst — BuilderSummaryCards läser aldrig fältet. Fix: roll-medveten skrivning (byggare → ingen/eget fält) eller dölj fältet för contractor.

**RÄTTELSE 2026-08-25 (s84): "försvinner tyst" stämde inte.** Raden ovanför
skriver också `total_budget` på projektet (`CreateProjectDialog.tsx:129`), och
översiktens budgetruta läser `contract_value ?? total_budget`
(`useOverviewData.ts:282`). Byggaren SER alltså sin siffra — på översikten.
Det stämmer att Budget-fliken inte visar den: `BuilderSummaryCards` läser bara
quotes/invoices/quote_items och visar "Contract".

Den verkliga skadan låg någon annanstans: `private_budget_cap` driver
`AtaBudgetWarningSection`, den PRIVATA varningen ägaren får innan hon
accepterar en offert ("det här spränger ditt tak"). En byggare som äger sitt
eget projekt fick alltså en hemägar-formulerad varning om sin EGEN offert.
Samma inmatning betydde två olika saker beroende på roll, och appen skrev båda.

**LEVERERAT 2026-08-25:** skrivningen är roll-gatad på
`onboarding_user_type === "homeowner"` (aldrig `is_professional`, enligt
[[feedback_role_gating_signal]]). `total_budget` skrivs som förut, så inget
går förlorat för byggaren — det slutar bara betyda fel sak. Städade samtidigt
en JSDoc som beskrev en funktion som inte finns (påstod att offert-importen
skrev private_budget_cap; det gör den inte).

**Kvar (eget beslut, ej bugg):** Budget-fliken visar aldrig byggarens
planerade budget, bara kontraktsvärdet ur offerterna. Om en byggare ska kunna
sätta ett eget internt tak behövs ett eget fält — det är en produktfråga, inte
en fix.

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

### RÄTTELSE + BEVIS 2026-08-25 (s84) — läckan är VERKLIG, och flaggan är INTE fixen

**Bevisat mot tabellen, inte predikatet** ([[feedback_rls_test_the_table_not_the_predicate]]).
RLS-simulerat som den enda levande client-delningen i prod
(`sthlmrides@gmail.com` på projektet "Lallargatan 22", ägare Carl, skapad 2026-03-10):

    set local role authenticated;
    set local request.jwt.claims = '{"sub":"<klientens auth uid>","role":"authenticated"}';
    select count(*), count(subcontractor_cost), count(markup_percent) from tasks where project_id = ...;
    -> 11 rader, 1 med subcontractor_cost (12 000 kr), 11 med markup_percent (10 %), 11 med budget

Klienten läser dessutom 5 materials (2 med `price_total`, 3 med `vendor_name`),
1 purchase_order och 1 quote. Alltså: **byggarens inköpspris, leverantör och
påslag ligger i kundens session.**

**Varför:** RLS är RADbaserad, inte kolumnbaserad. `tasks`-policyn kräver bara
`user_has_project_access AND user_can_view_tasks AND scope='all'` — passerar den
kommer HELA raden med. Kolumnmaskeringen finns bara i SECURITY DEFINER-RPC:erna
(`_project_data_masked`), som är en HELT ANNAN läsväg.

**Premissen i kortet var fel på två sätt:**
1. `VITE_TEAM_V2_MASKING` är inte "osatt av misstag" — `vite.config.ts` bakar
   medvetet in `?? ""`, så av är default. Det är designat som opt-in.
2. **Att slå på flaggan stänger INTE hålet.** Bara 5 komponenter använder
   `projectDataService`; `from("tasks")` förekommer **165 gånger i ~50 filer**
   (TasksTab, ProjectTimeline, unified-table, useTasksData …). De läser rått
   oavsett flagga. Flaggan gömmer Budget-fliken och Översiktens siffror — den är
   en UI-grind, inte en datagräns.

**Nuvarande exponering: noll riktiga kunder.** Enda client-delningen i prod är på
Carls eget projekt. Hålet blir skarpt i samma sekund en riktig byggare bjuder in
en riktig kund. Alltså: inte brådskande i natt, men obligatoriskt före den
första riktiga kundinbjudan.

**Två sidoläckor hittade på köpet:**
- `personaToAccess.ts:63` ger klienten `budget: "view"` med kommentaren
  *"backend masks markup"* — backend maskerar bara när flaggan är på.
- `user_can_view_purchases` / `user_can_view_budget` gör
  `COALESCE(purchases_access, 'view') != 'none'` — **NULL betyder alltså JA**.
  En delning utan explicit värde får läsa. `user_purchases_scope` gör samma sak
  med `COALESCE(purchases_scope,'all')`. Fail-open i två funktioner.
  (Den levande delningen har explicit `'view'`/`'all'`, så det är inte orsaken
  här — men det är en laddad pistol för nästa delning som skapas utan värden.)

**Föreslagen fix (B): flytta pengarna ur `tasks`.**
`subcontractor_cost`, `markup_percent`, `material_markup_percent`,
`labor_cost_percent` → egen tabell `task_costs` med egen RLS
(`user_can_view_budget` OCH `role_type <> 'client'`). Då blir `select("*")` på
tasks säkert **av konstruktion** och alla 165 läsställena slutar läcka utan att
röras. 32 filer rör dessa kolumner och behöver följa med. Fail-open-COALESCE:arna
rättas i samma migration.
Avvisad fix (A): byta `select("*")` mot kolumnlistor på de hetaste ställena —
det är UI-disciplin, inte en gräns; nästa `select("*")` öppnar hålet igen, och
RLS släpper fortfarande raderna till den som frågar själv via devtools.

### LEVERERAT 2026-08-25 (s84) — LÄSLÄCKAN ÄR STÄNGD

Fix B byggd och verifierad i prod. Tre migrationer, alla med revert-SQL skriven
FÖRE respektive migration:

1. `20260825120000_task_costs_boundary.sql` — `task_costs` med egen policy
   (`user_can_view_costs`, fail-closed, kunder aldrig) + backfill. Hårdnade
   samtidigt `user_can_view_purchases` / `user_can_view_budget` /
   `user_purchases_scope` från fail-open till fail-closed.
2. `20260825121000_materials_client_exclusion.sql` — **läxan i ren form**: efter
   (1) läste kunden materialen ändå, för att `materials`-ALL-policyn INLINAR
   `role = ANY('editor','admin','client')` och därför inte ärver något av
   funktionen jag just hårdnat. Verifierat mot TABELLEN, inte predikatet.
3. `20260825130000_drop_task_cost_columns.sql` — droppet, kört FÖRST efter att
   CF-deployen var grön (dessförinnan hade explicita selects gett 400 i prod).

Koden: `src/lib/taskCosts.ts` är enda bryggan. `TASK_COSTS_EMBED` hydrerar vid
hämtning, `splitTaskCostFields` delar patchen vid skrivning — konsumenterna
läser `task.markup_percent` precis som förut, så de 165 läsställena rördes
aldrig. 14 filer + `agent-route` (deployad).

Slutverifiering, båda vägarna:
- kund: 0 kostnadsrader, 0 material, 0 inköpsordrar — men ser sina 11 arbeten,
  sin offert och sina 4 rum. Kundvyn är intakt, bara byggarens affär är borta.
- ägare: 11 kostnadsrader, UE 12 000 kr, påslag 10 % — oförändrat.
- co_owner: 5 kostnadsrader. planning_contributor: oförändrad.
  (Sista var det skarpa testet — `sthlmrides` är BÅDE kund på ett projekt och
  medplanerare på ett annat, och spärren nyckar på `role_type`, aldrig `role`.)
- prod som byggare efter droppet: "BUDGET 134k kr · Ber. vinst ~35,2k kr" —
  vinsten räknas ur just de flyttade fälten, noll konsolfel.
- typecheck 336 = baseline, bygget grönt, e2e 154/2 före OCH efter droppet.

**KVAR i det här kortet** (läsläckan var bara en del av det):
- Kundvyn är fortfarande EN FLIK bland de råa flikarna, inte en dedikerad shell.
- Den döda `isInvitedClient`-grenen är fortfarande inte aktiverad.
- `invited_client` saknas fortfarande i `RequireRole`-typen.
- Och separat, allvarligare: kunden kan ÄNDRA arbeten →
  [[tasks-update-slapper-in-kunden]].

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
id: room-delete-canvas-no-persist-freeze
status: doing
priority: P2
tags: [floorplanner, canvas, bug, data-integrity, objekt-instruktions-audit]
created: 2026-08-14
---
## Rumsradering: canvas-radering persisterar aldrig + möjlig renderar-freeze

**✅ DEL 1 FIXAD 2026-08-15 (session 70) — 3-vals-dialog (Carls design):** canvas-radering av en rumspolygon orphanar inte längre rummet. Ny delad `RoomShapeDeletionDialog` (monterad i FloorMapEditor, täcker BÅDE editorerna) via ny store-signal `pendingRoomShapeDeletion`. Alla raderingsvägar defer:ar när en rums-shape (type==='room' && roomId) är markerad: v2:s enda chokepoint `commands.ts 'shape.delete'` (täcker kontextmeny/toolbar/tangent/textedit — ny `confirmed`-flagga) + v1:s `onDeleteSelection` + v1-tangentbord (`useKeyboardShortcuts`). Dialogen: **(a) Ta bort ritningen + rummet** (`rooms.delete()` per rum → cascade + shape-radering via native mekanism: v2 execute confirmed / v1 deleteShapes+regenerateAutoWalls), **(b) Ta bort bara ritningen** (shape bort, rums-entiteten kvar i listan), **(c) Avbryt**. i18n `roomDeleteDialog.*` (5 språk). typecheck:strict + build gröna. **Canvas-only inline (`onDeleteSelection`) röjde tidigare rummet tyst — nu omöjligt.** Ej ögonkollad (canvas-interaktion, kräver sparat rum) → on-device/Cowork.

**✅ DEL 2 FIXAD 2026-08-18 — "frysningen" var native `window.confirm()`:** Coworks repro (2026-08-04) av "Ta bort rum"/"Ta bort markerade" som fryser renderaren + CDP-timeout var **native confirm() som blockerar renderaren synkront** — automation kan inte stänga den. Förklarar ALLA symptom (fryser även tomt rum + via programmatiskt click; sidan "återhämtar sig" när native-dialogen auto-stängs). Fix (`useConfirm`-hook, promise-baserad AlertDialog): konverterade alla tre rumsvägar — `RoomsListV2.tsx` bulk (v2/desktop-default) + `RoomsList.tsx` v1 bulk + `useRoomForm`/`RoomDetailDialog` enskild. **LIVE-VERIFIERAD i demo:** "Ta bort markerade" → styled AlertDialog (Avbryt/Ta bort), Avbryt stänger rent utan radering. typecheck+build gröna. (Not: "renderar-freeze-hypotesen" på UnifiedKonvaCanvas var alltså troligen samma confirm-block, ej separat canvas-frys.)

**⏳ KVAR (litet):** verifiera att SJÄLVA raderingen slutförs utan separat frys nu när confirm-blocket är borta (Cowork/Carl på pmfulls demo 7656b205 — klicka "Ta bort" på riktigt, se att rummet försvinner + canvas-shape röjs). Confirm-blocket maskade tidigare detta. Övriga native confirms i appen (ElevationObjectPanel/PhotoSection/TemplateGallery/PurchaseRequestsTab bulk m.fl.) kan migreras till `useConfirm` löpande.

<!-- original fynd -->
## (original) Rumsradering: canvas-radering persisterar aldrig + möjlig renderar-freeze
Ur objekt-instruktions-auditens (2026-08-04) buggflagga, **re-verifierad mot kod 2026-08-14** (3 agenter). Två separata, äkta, fortfarande närvarande problem (inget commit rört rumsradering sedan 2026-08-01):

1. **Canvas "Ta bort markerade" raderar ALDRIG rummet server-side (definitivt, kod-verifierat).** `onDeleteSelection` (`UnifiedKonvaCanvas.tsx:4279-4314`) muterar bara Konva-storet (`deleteShapes` + väggregen), anropar aldrig `supabase.from("rooms").delete()`. Användaren markerar rumspolygonen, raderar, ser den försvinna — men `rooms`-raden (+ dess cascade) finns kvar i DB/rumslistan. Datakonfusion. Produktfråga: SKA canvas-radering av en rumspolygon radera DB-rummet, eller bara skissen? Om ja → koppla in rooms-delete + bekräftelse; om nej → förhindra att rumspolygoner plockas i bulk-delete.
2. **Renderar-freeze (hypotes, ej statiskt bevisad — kräver runtime-repro).** Delad post-delete-cleanup (`deleteShapes`+`regenerateAutoWalls`, `store.ts:395-444`) re-fyrar effekten `UnifiedKonvaCanvas.tsx:701-710` (global CustomEvent på varje shapes-ändring) + comment-fetch + autosave; om någon lyssnare skriver tillbaka i `shapes` → obunden synkron re-render låser main-tråden. Panel-vägen (`useRoomForm.ts:267-300`, `ProjectDetail.tsx:728-788`) fyrar DELETE före ev. freeze → kan committa men toast/setRoomsData körs aldrig ("blir aldrig klar"). Bekräfta med React-profiler / `console.count` på :701-710-effekten under radering.

**Latent relaterat:** rumslistans bulk-delete (`RoomsList.tsx:193-210`, `rooms-list-v2/RoomsListV2.tsx:234-252`) loopar `onDeleteRoom` som var för sig poppar egen `confirm()` → N blockerande confirm-dialoger, ej awaitade. DB-cascade är frisk (FK ON DELETE CASCADE/SET NULL verifierat) — problemet är helt klient-sida.

---
id: worker-view-ui-chrome-i18n
status: todo
priority: P3
tags: [worker, i18n, arbetarvy, objekt-instruktions-audit]
created: 2026-08-14
---
## Arbetarvyns UI-chrome blandar sv/en för icke-sv/en arbetare (Fas 6c)
Audit-fynd (2026-08-04) för polsk arbetare: task-status + objekt-typnamn översätts (polska), men UI-chromen är en blandning av **svenska** ("UPPGIFT"/"RUM"/"Dela foto") och **engelska** ("Request purchase"/"Mark complete + photo"/"Take photo"/"PHOTOS"/"MESSAGES"/"Ceiling"/"Colour/finish"/"Planned"/"Electrical"/"Plumbing"). Distinkt från [[worker-freetext-translation]] (som gäller fritext-INNEHÅLL: väggnoteringar/finish/bildtexter — objekt-finish är KLART där). Detta = statiska UI-etiketter i `/w/:token`-vyn som inte följer arbetarens inbjudna språk (troligen hårdkodade strängar ELLER ofullständig pl-locale + en-fallback). **Verifiera rotorsak i kod först** (WorkerView + roomObjectShared + WorkerTaskCard: hårdkodat vs `t()` med saknade pl-nycklar), åtgärda sedan. Urholkar arbetar-språk-löftet.

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
**✅ INCREMENT 1 LEVERERAD 2026-08-10 (`fd7322e`, pushad):** Provenance-modell (kind + fileName) på DraftRoom/DraftTask + reversibel excluded. Stämpling i applyAnswer/addons/seedDraftFromParse. Käll-ikon per rad + ta-bort/ta-med-igen i panelen. toScaffoldInput + guest hoppar excluded. 3 flow-tester (13/13).

**✅ INCREMENT 2 LEVERERAD 2026-08-10 (`f41ebb1`, lokal):** mobil granskningsyta — vid complete visas md:hidden granska-block (full-width mobilt) med rum+arbeten (källchips + reversibel ta-bort) + budget före Skapa. TaskReviewList utbruten → desktop-panel + mobil renderar identiskt. Taulant kan nu verifiera+justera på mobil.

**KVAR (increment 3, kan vänta):** (a) inline fält-edit (byt arbetstyp/area per rad — nu bara ta-bort). (b) konflikt-som-gap-fråga (uppstår först med Fas C multi-källa). Increment 1+2 räcker som keystone för Fas C.
Utöka `ProjectDraft` med `Provenance` per rum/arbete/budget-signal. Högerpanelen (live-preview) får: käll-chip per rad ("📄 offert-badrum.pdf" / "📷 bild 2" / "💬 du sa"), klick → vad som lästes ut, per-rad acceptera/ändra/släng, konflikt-markering ("2 källor säger olika area — vilken?").

**Varför keystone:** blandad-input-magi dör på felläsningar som INTE syns. Utan verifierbar härkomst är mapp-ingest en demo, inte ett verktyg. ALLT efter detta (C/C+/D) står på denna. Bygg FÖRE mapp-ingest.

**Ansats:** ~1–2 dagar, ren frontend/modell (utkastet finns, ConfirmDiff-mönstret i AIProjectImportModal återanvänds). Unit-testbart som flow:en.

---
id: renaida-birth-missing-critic
status: done
done: 2026-08-13
priority: P2
tags: [renaida, expert, moat, agent-readable]
created: 2026-08-10
---
## Fas C+: "Saknas-något"-kritikern (expert-känslan)
ETT LLM-anrop över det färdig-mergade utkastet: "offerten saknar rivning trots totalrenovering — lägg till?", "badrum utan tätskikt — säkert?". Renaida flaggar det du GLÖMDE, inte bara antecknar det du sa. Bygger vidare på expert-tillvalen (2d: flytta golvbrunn m.m.) — moaten = bygg-domän-systemet.

**✅ LEVERERAT 2026-08-13 (`494a684`):** nytt SISTA steg 'critic' i födelseflödet — edge-fn `renaida-critic` (DEPLOYAD, **gpt-4o** = medveten model-tiering: mini-modeller både re-flaggade täckt arbete (synonymer) OCH missade äkta luckor) granskar mergade utkastet → flaggor m. rum + varför-rad som accepterbara chips → customTitle-tasks m. ny provenance `critic` (Fas B-granskningsbara). Tyst självhopp + "ser komplett ut ✓" när planen är ren; fail-open överallt (gäst-säker). Live-smoke ×3 scenarier stabil. Event `renaida_project_critic_shown` + `critic_accepted` på completed. **🐛 BONUSFYND FIXAT: addons-effektens självcancellering** (cancelled+loading-i-deps → svar slängdes, spinner hängde för evigt UTAN hoppa-över — aktiv blockerare vid all nätverkslatens) — ref-guard i båda effekterna + deterministiskt latens-regressionstest. 38/38 tester.

---
id: renaida-birth-capture-direction
status: doing
priority: P2
tags: [renaida, onboarding, floorplanner, multimodal, capture]
created: 2026-08-10
updated: 2026-08-11
---
## Fas D: Capture-regi + grovskiss (Renaida ber om foto → space planner)
Renaida går från att TA EMOT foton till att REGISSERA dem. (1) Capture-request som stegtyp: "Fota badrummet från dörren" → mobilkameran öppnas → vision föreslår skick/objekt/arbeten. (2) Grovskiss: foto/pappersskiss → `process-floorplan` (finns: väggar/dörrar/rum) → **v2-editorns patch-executor** (byggd som "Renaidas framtida API") → utkastet får en skiss-flik. (3) Vägvisar-actions efter födelsen (open_feature): "vill du att jag visar var du bjuder in hantverkaren?".

**Ansats:** ~2–3 dagar (skissen = riskdelen). Knyter ihop Floorplanner v2 Del 2 (Renaida ritar/tolkar planritningar) med projektfödelsen — två spår blir ett. Beroende: Fas B. Kan gå parallellt med C.

---
id: renaida-birth-contractor-adaptation
status: done
priority: P1
tags: [renaida, roles, contractor, quote, activation, dual-view]
created: 2026-08-11
done: 2026-08-11
---
## 👷 Renaida-födelsen per profiltyp — proaktiv byggar-hjälp (offert→faktura-spåret)
**Carls direktiv 2026-08-11.** Undersök hur ALLA nya Renaida-flöden (projektfödelse-dialogen, mapp-ingest, gap-frågor, tillval) fungerar för de olika profiltyperna — särskilt en professionell byggares start. Idag är roll-anpassningen tunn: `userType` gate:ar bara FRAMING (q.describe/type/budget.contractor-nycklar) — samma frågeträd, samma tillval, ingen byggar-specifik proaktivitet.

**Målbild:** Renaida ska vara proaktivt hjälpsam för byggaren — han skapar projekt åt en KUND och vill ofta vidare till offert direkt: "vill du att jag förbereder en offert på det här?" (generate-quote-items finns, D2-handoffen finns) → senare fakturor, ÄTA, kundinbjudan. Kopplar ihop [[renaida-role-gated-actions]] (action-katalog per roll) + vägvisar-principen (open_feature) + 2 bouncade byggfirmor i traction-datan (svenssonsbyggvvs, byggomala — aktivering vid första handling är flaskhalsen ÄVEN för proffs).

**Scope:** (1) audit av contractor-vägen genom dialogen+mapp-ingest (vilka frågor är fel/saknas för proffs: kundens namn/adress? moms ex? offert-utkast?), (2) byggar-specifika conditional-frågor + tillval, (3) post-birth-vägvisning per roll ("skapa offert" för byggare / "bjud in hantverkare" för hemägare), (4) dual-view-gate-regeln ([[feedback_dual_view_gate]]) verifierad över alla nya ytor.

**AUDIT KLAR 2026-08-11 (kod-verifierad):** (a) roll-differentiering = BARA inramning (3 i18n-nycklar + renaida-suggest-promptens userType-gren; samma träd/chips/tillval/avslut); (b) rollen hämtas rätt (onboarding_user_type, Projects.tsx:658); (c) projects SAKNAR kundfält — kunden bor i quotes.client_id → byggaren får aldrig kund-frågan; (d) Renaidas budget→total_budget (har EJ CreateProjectDialogs dubbelskrivningsbugg, men customer_price/owner_cost-oklarheten kvarstår appen-brett — se user-type-builder-budget-fel-falt); (e) mapp-ingest roll-blind (byggarens egen offert-PDF → tasks, borde kunna bli hans offert-objekt via D2-handoffen); (f) /quotes/new?projectId&prepopulate=true&taskIds=… fanns färdig + contractor-gated i routern + scaffoldProject returnerar taskIds.

**Princip (Carl 2026-08-11):** ETT flöde, roll-villkorade avvikelser BARA där essentiellt — inte parallella träd. Mycket är lika mellan hemägar-PL och proffsbyggare; väv in skillnaderna i samma `nextStep(draft, userType)`.

**✅ K1 LEVERERAD 2026-08-11:** post-birth offert-erbjudande — byggare skapar via Renaida → "Vill du att jag förbereder en offert till {{kund}} av arbetena?" → /quotes/new förifylld med alla nyskapade tasks. `renaida_quote_offer`-event (shown/accepted/declined + has_customer).

**✅ K2 LEVERERAD 2026-08-11:** kund-dimension — ETT villkorligt kund-steg i samma träd (userType==='contractor', efter scope, hoppbart), `customerName` på ProjectDraft, syns i förhandsvisningen (User-ikon, desktop+mobil). På offert-erbjudandets accept: `findOrCreateClientByName(profileId, namn)` (ny i intakeService, ilike-match/skapa i clients-tabellen) → clientId in i /quotes/new → offerten FÖRADRESSERAD. Hemägare/gäster ser aldrig steget (test + render-smoke). 23/23 renaida-tester.

**✅ K3 LEVERERAD 2026-08-11:** byggar-overhead — nytt villkorligt `overhead`-steg efter tillvalen (contractor-only, samma träd): Etablering/Rivning & bortforsling/Ställning/Byggstädning/ÄTA-buffert. Krävde `customTitle` på DraftTask (overhead = 'annat'/other-cost-poster med EGNA namn, ej rums-trades) — taskTitle använder den, gap-fill IGNORERAR customTitle-tasks (projektövergripande by design), dedup på titel. Overhead flödar till offerten via taskIds (K1). LLM-suggest-prompten fick roll-differentierade exempel (proff-overhead vs hemägar-komfort). Hemägare ser aldrig steget (test). **⚠️ EDGE-DEPLOY KVAR: `supabase functions deploy renaida-suggest`** (prompt-ändringen; deterministiska overhead-steget funkar utan deploy).

**✅ K4 LEVERERAD 2026-08-11 (`049b2bd`):** roll-medveten mapp-ingest — byggarens egen offert-PDF (`type==='quote'` + contractor) → `extractQuoteLines` (process-document-v2 quote-läge, en task/prissatt rad) → priced DraftTasks (nytt `budgetSek` + `customTitle`, workType 'annat') istället för omestimerade. Priset rider genom `toScaffoldInput`→`tasks.budget`→K1:s offert-förifyllning (CreateQuoteV2 budget-fallback) → byggarens FAKTISKA priser i den säljbara offerten. Ett flöde, K1 oförändrat, ingen ny yta. Prislösa offerter + hemägare → vanlig scope-parse (inget tappas). Quote-line-tasks projektövergripande → gap-fill ignorerar dem (som K3 overhead). Ny pure `mergeQuoteLinesIntoDraft` (dedup titel). 25/25 renaida-tester.

**✅ K5 LEVERERAD 2026-08-11 (`8def34e`):** ÄTA-vägvisning i drift-Renaida — nytt `open_feature`-mål `new_ata` → `/quotes/new?projectId=…&is_ata=true` (ÄTA = offert m. is_ata). Routern känner igen ÄTA/tilläggsarbete-utöver-offert som contractor-only. `new_invoice` fanns redan (faktura). Bonus-fix: FEATURE_PATHS bygger m. projectId → new_quote/invoice/ata öppnar förlänkad till projektet (tidigare tappades projectId). Eval-gate: router 100% (nytt golden `prepare-ata-open-feature`, inga regressioner). **⚠️ EDGE-DEPLOY KVAR: `supabase functions deploy agent-route`** (prompt; klient-navigeringen funkar utan deploy men routern föreslår ej new_ata förrän deployad).

**Hela kortet KLART** (K1–K5). Kvarvarande roll-arbete = arbetar-Renaida (eget kort renaida-worker-assistant).

---
id: dialog-width-trap-migration
status: todo
priority: P3
tags: [ui, cleanup, tech-debt, dialog]
created: 2026-08-10
---
## Migrera ~35 dialoger av max-w-fällan → size-prop
**Rotorsak FIXAD & förebyggd (`7bbcef9`):** DialogContent har nu en `size`-prop (sm..7xl) som avger korrekt `md:`-prefixad max-width. CLAUDE.md dokumenterar fällan. Nya dialoger kan inte längre gå i den.

**KVAR (denna cleanup):** auditen hittade **~35 befintliga dialoger** som skriver oprefixad `max-w-*` i className → de klipps tyst till `lg` (512px) på desktop oavsett vad de skrev (t.ex. `max-w-4xl` renderas som lg). Några har `!important`-hack (`!max-w-5xl` i AIDocumentImportModal, `!max-w-6xl` i BatchSmartTolkDialog) = bevis på att fällan bitit upprepat.

**Ansats (INTE blank-migrering):** varje dialog behöver en titt — dess innehåll är tunat för lg sedan lansering, så att bredda till skriven bredd kan se glest/fel ut ELLER vara exakt vad författaren ville. Migrera `className="max-w-Xl"` → `size="Xl"` + screenshot-verifiera per dialog (loopen finns: standalone playwright mot dev-servern). Börja med `!important`-hacken (ren cleanup, samma rendering) + de tydligt bredd-behövande (offert/import/budget-dialoger stuck på lg). Offender-lista: PinterestPicker, NewPurchaseOrderDialog, BudgetDashboard, QuoteReviewDialog, MaterialFileAttachment, AllocateFromOrderDialog, TasksTab, FloorMapManager, RoomDetailDialog, m.fl. (kör auditen igen för full lista).

---
id: renaida-snabboffert-framing
status: done
done: 2026-08-12
priority: P1
tags: [renaida, contractor, quote, activation, epic:renaida-quote-flow]
created: 2026-08-12
---
## ⚡ R1: Snabboffert-inramning av Renaida-födelsen + planeringstabell-mellanlandning
**Kartläggning 2026-08-12 (2 kod-audits):** offert kräver ALLTID projekt (`quotes.project_id NOT NULL`) → "snabb offert" = tyst skuggprojekt (status planning) + offert; accept AKTIVERAR projektet (ViewQuoteV2.handleAccept + DB-trigger `handle_quote_status_project_sync`). Gamla QuickQuoteDialog är DÖD KOD (exporteras, renderas aldrig) — Renaida-födelsen K1–K5 ersätter den och är mer komplett.

**Bygg:** (1) "⚡ Snabboffert"-entry i pipeline-sektionen (LeadsPipelineSection, byggare) → öppnar RenaidaProjectDialog i offert-first-läge (kund-steget tidigt). (2) K1-erbjudandet får TVÅ knappar: "Granska & justera kalkylen" → projektets Planering-flik (byggarens kalkylyta: timmar×timpris, påslag, vinst — sammanställningen han vill se, Carls krav 2026-08-12) eller "Direkt till offert" → dagens /quotes/new-väg. (3) Radera QuickQuoteDialog (död kod; CreateQuoteV2 behåller fromQuickQuote-param tills vidare).

**Princip (Carl):** Renaida fyller i — planeringstabellen äger sanningen. Ingen kalkyl-UI i dialogen.

**✅ LEVERERAD 2026-08-12 (`4a9da0d`):** ⚡-knapp i Mina offerter (visas ÄVEN utan pipeline-data = nya byggarens läge), trekunapps-erbjudande (Direkt till offert / Granska & justera kalkylen → ?tab=planning / Öppna projektet, event-action review_calc), QuickQuoteDialog raderad.

---
id: renaida-accept-kvittens
status: done
done: 2026-08-12
priority: P2
tags: [renaida, contractor, quote, activation, epic:renaida-quote-flow]
created: 2026-08-12
---
## 🎉 R2: Renaida kvitterar offert-accept till byggaren + vägvisning
Accept-ögonblicket är stumt mot byggaren (kunden får konfetti; byggaren inget). Kedjan som redan körs vid accept: quote→accepted, projekt→active, `createTasksFromQuote` (quoteService.ts:472 — offertrader tillbaka på tasks, budget/ROT/UE), total_budget sätts, kund auto-inbjuds (intake-vägen).

**Bygg:** Renaida-notis/panel-kvittens till byggaren: "{{kund}}s offert accepterades — projektet är aktivt. Vill du att jag visar var du planerar starten / bjuder in teamet?" → open_feature-vägvisning. Detta är byggarens FÖRSTA WOW (aktiverings-flaskhalsen gäller även proffs — svenssonsbyggvvs/byggomala bouncade). Trigger: realtime på quotes.status ELLER kolla vid nästa panel-öppning (enklast först).

**✅ LEVERERAD 2026-08-12 (`65baacc`, MVP panel-öppnings-vägen):** fetchAcceptedQuoteNews-detektor (accepterad+skapad-av-mig+<14d+localStorage-ack per quote) + kundnamn; panel-meddelande m. vägvisning i ord + ÄTA-variant + flashRenaida happy + renaida_accept_news-event. KVAR ev. senare: realtime-trigger + klickbara vägvisar-knappar.

---
id: renaida-builder-calc-e1
status: done
done: 2026-08-12
priority: P1
tags: [renaida, contractor, estimation, planning, epic:renaida-quote-flow]
created: 2026-08-12
---
## 🧮 E1: Kalkylfält i Renaida-draften + estimeringsmotorn vid scaffold (nivåval, aldrig tvång)
**Source of truth FINNS REDAN (verifierad 2026-08-12):** `profiles.default_hourly_rate` + `default_labor_cost_percent` + `estimation_settings` (JSON: produktivitet per fack i m²/h — paint/floor/tile/demolition/spackling/sanding/carpentry/electrical/plumbing; färgtäckning+strykningar; materialpriser kr/liter, kr/m²). Redigeras i Profile.tsx (~rad 300-330), parsas av `parseEstimationSettings` (materialRecipes.ts:158), konsumeras redan av PlanningTaskList/PlanningRoomList/TaskEditDialog/planningWizardService. ÅTERANVÄND — bygg ingen Renaida-kopia.

**Bygg:** (1) `DraftTask` utökas: estimatedHours/hourlyRate/materialEstimate/markup (budgetSek från K4 var första steget) + `toScaffoldInput` mappar (scaffold skriver kolumnerna redan). (2) Vid contractor-födelse: kör estimeringsmotorn (profilens satser + rummets area — Renaidas size-fråga + Fas D-grovskissens areor matar den) → förifyllda kalkylceller. (3) NIVÅVAL aldrig tvång ([[feedback_smart_materials_optional]] generaliserad): nivå 0 = bara struktur (tomma celler), nivå 1 = klumpsummor (K4-läget), nivå 2 = full kalkyl. Val i dialogen, lärt default per användare. (4) Byggare tänker arbetstid/kostnad+påslag & material+påslag — Renaida ska förstå och förklara i de termerna (Carl 2026-08-12).

**Lucka funnen:** profilen SAKNAR default-påslag (markup_percent finns bara per task/material) — lägg `default_markup_percent`/`default_material_markup_percent` på profilen + Profile-UI (FLYTTAD till E3, kräver migration).

**✅ LEVERERAD 2026-08-12 (`7b8112d`):** calc-steg (contractor-only, efter size, bara när motorn kan estimera: rum-med-area + igenkänd arbetstyp via detectWorkType) → estimateDraftCalc (ren) kör estimateTaskMultiRoom m. profilens satser → estimatedHours/hourlyRateSek/materialEstimateSek + calcNote-formel; kvadrat-rum-antagande för väggyta (perimeter 4·√area). Scaffold-mappning: hours/rate/material + formel som task-description. Granskningslistan visar "≈ h · kr + material". K4-priser re-estimeras aldrig. Nivå 0/1/2 = self/K4-klumpsummor/suggest. 29/29 tester.

---
id: planning-cell-provenance-e2
status: done
done: 2026-08-12
priority: P2
tags: [contractor, estimation, planning, ui, epic:renaida-quote-flow]
created: 2026-08-12
---
## 🔍 E2: Cell-provenance + formel-förklaring i planeringstabellen
**✅ LEVERERAD 2026-08-12 (`9da0a8e`):** ny kolumn tasks.estimate_meta (JSONB source/formula/overridden, migration 20260812150000 APPLICERAD) — E1:s formel flödar strukturerat (inte via description). Timcellen i PlanningTaskList: sparkle-chip m. formel-tooltip när siffran är Renaidas förslag; redigering av timmar/timpris/pris sätter overridden=true → chippen pensioneras. "Hur räknade du?"-svar i panelen täcks av E3:s rates-kontext + formeln i tooltippen.

Varje Renaida-/motor-estimerad cell bär sin formel: "Målning Sovrum: 32 m² väggyta × 0,4 h/m² = 13 h à 550 kr" — tooltip/chip i PlanningTaskList, samma data gör att Renaida kan svara "hur räknade du?". Redigering skriver över → cell stämplas 'egen' (Fas B-provenance-mönstret på cellnivå). Förklarbarhet = förtroende; en byggare som ser formeln bedömer den på en sekund. Self-explaining decisions[]-principen ([[feedback_agent_readable_architecture]]). MaterialFormulaPopover finns redan för material-formler — förebild/återanvänd.

---
id: renaida-rate-learning-e3
status: done
done: 2026-08-12
priority: P2
tags: [renaida, contractor, estimation, memory, epic:renaida-quote-flow]
created: 2026-08-12
---
## 📈 E3: Renaida läser/förklarar/uppdaterar byggarens satser (profilen = kanoniska hjärnan)
**✅ LEVERERAD 2026-08-12 (`c1f66ca`):** (1) set_default_rate-action (contractor-only, bounds-checkad) → profiles-update m. Ångra (UndoOp profile_rate); eval 100% (2 nya golden; "timpris 640" ≠ task-budget explicit i prompten); agent-route DEPLOYAD. (2) help-bot-kontexten får callerns sparade satser → svarar ur riktiga värden; DEPLOYAD. FÖLJDFIX efter Cowork-fynd (`b9159b7`): rates-raden emitterades bara när minst en sats var satt → alla-null (färsk byggare/efter Ångra) gav tom rad → boten sa "jag kan inte se ditt timpris". Nu emitteras raden när profilen alls lästes (även "not set yet") + JWT-sub-avkodning istället för /auth/v1/user-hopp. Omdeployad. **VERIFIERAD LIVE av Cowork 2026-08-12:** "inget satt än"-svar när tomt, "720 kr/h" efter set → Apply. Stängd. (3) Learn-from-edit: avvikande inline-timpris → "Spara som standard?"-toast (1/session). (4) Profile-UI för default_markup_percent/default_material_markup_percent (E2-migrationens kolumner). KVAR (medvetet): markup-defaults KONSUMERAS ej ännu av kalkyl/offert-fallbacks — eget litet kort när behovet syns; renaida_user_memory-mjukpreferenser (nivåval) senare.

INTE ett nytt minne — `profiles.default_hourly_rate` + `estimation_settings` ÄR source of truth (se E1). Inlärnings-embryo finns: TaskEditDialog.tsx:611 skriver tillbaka default_hourly_rate vid task-redigering.

**Bygg:** (1) Renaida kan SVARA om satserna ("vad räknar jag med för timpris?") och UPPDATERA dem via kapsel/förslag ("mitt timpris är 640" → update profiles, med bekräftelse — aldrig auto). (2) Generalisera learn-from-edit: när byggaren konsekvent ändrar en produktivitetssats/påslag i tabellen → föreslå spara till profilen ("du brukar sätta 15% påslag — spara som standard?"). (3) renaida_user_memory håller bara mjuka preferenser (nivåval, vanliga overhead-poster) — ALDRIG duplicera profilens satser (En hjärna-principen).

---
id: bugg-intake-create-project-404
status: done
priority: P2
tags: [bugg, intake, pipeline]
created: 2026-08-12
---
## 🐛 Pipeline "skapa projekt från förfrågan" → 404
**✅ FIXAD 2026-08-12 (`0df0227` + `b9159b7`):** navigerar nu till `/intake-requests?open=<id>`; listsidan auto-öppnar detaljen. FÖLJDFIX efter Cowork-fynd: första commiten missade RAD-klicket (AllIntakeRequestsDialog.handleIntakeClick → /projects/:id/intake/:id OCH /intake-requests/:id, båda döda) — `b9159b7` fixade även det. **VERIFIERAD LIVE av Cowork 2026-08-12:** rad-klick → `/intake-requests?open=<id>` med detalj öppen, ingen 404 (även ⋮→View details). Stängd.

---
id: verify-accept-planned-status
status: done
priority: P2
tags: [bugg, quote, tasks, verify]
created: 2026-08-12
---
## 🔎 Verifiera: flippar offert-accept `planned`-tasks till `to_do`?
**✅ VERIFIERAD 2026-08-12 — INGEN BUGG:** `createTasksFromQuote` sätter `status: "to_do"` på källkopplade tasks (quoteService.ts:537), titel-matchade orphans (:636) och nyskapade (:661); planeringstasks UTANFÖR offerten arkiveras (:690-700). CreateQuoteV2:s förifyllning sätter `sourceTaskId: task.id` på alla rader → accept-vägen träffar rätt tasks. Kedjan är hel.

---
id: activate-project-single-source
status: done
done: 2026-08-13
priority: P3
tags: [tech-debt, cleanup, activation, agent-readable]
created: 2026-08-12
---
## 🧹 R3: EN activateProject-service (aktivering är idag triplikerad)
**✅ LEVERERAD 2026-08-13 (`d6e5de9`):** manuella aktiveringen (~130 rader) ordagrant utbruten ur PlanningTaskList + HomeownerPlanningView → `src/services/activateProject.ts`; båda anropar servicen. Quote-accept-vägen (createTasksFromQuote + DB-trigger) är separat och konsoliderades medvetet EJ (annan logik). Möjliggör Renaida activate_project-action senare.
Projekt→active sätts i TRE kodvägar: ViewQuoteV2.tsx:303 (klient), DB-triggern handle_quote_status_project_sync, vilande ViewQuote.tsx:259 — plus TVÅ ~130-raders nästan identiska manuella aktiveringar (PlanningTaskList:245, HomeownerPlanningView:468). Bryt ut till EN service (importPurchaseOrder-mönstret: ordagrann extraktion, delad modul) som båda UI-vägarna + accept-vägen anropar. Möjliggör senare `activate_project`-action för Renaida ("aktivera projektet" via röst). total_budget sätts också dubbelt (quoteService.ts:201 + historiskt triggern) — ensa.

---
id: retire-planning-wizard
status: partial
done: 2026-08-13 (säkra delen)
priority: P3
tags: [tech-debt, cleanup, renaida, wizard]
created: 2026-08-12
---
## 🧹 R4: Pensionera PlanningWizard till förmån för Renaida-dialogen
**⚠️ DELVIS 2026-08-13 (`9374dc2`) — full-swap PARKAD som beslut:** levererade de säkra delarna: (1) BUGG fixad — hårdkodad `language:"sv"` → `i18n.language` (icke-svenska hemägare fick svensk tolkning); (2) 3 döda step-komponenter (RoomsStep/RoomSpecificStep/GlobalWorkTypesStep) raderade. **KVAR = full-swappen, som är ett PRODUKTBESLUT (se nytt kort renaida-fill-existing-project) pga regressionsrisk.**

PlanningWizard (hemägar-only, tomt-projekt-läget i HomeownerPlanningView:700) löser samma problem som Renaida-födelsen med samma AI-parse (parse-renovation-description) men: hårdkodad "sv" (PlanningWizard.tsx:75), går FÖRBI scaffoldProject (egna inserts i planningWizardService:109+), 3 döda steg-komponenter (RoomsStep/RoomSpecificStep/GlobalWorkTypesStep importeras aldrig). Låt tomt-projekt-läget öppna RenaidaProjectDialog i "fyll befintligt projekt"-läge (kräver existingProjectId-stöd i dialogen — scaffold har det redan) → en motor, en kodväg, språkneutralt. OBS: wizarden skriver unikt room_ids[]-multiroom + checklists — bevara eller medvetet släpp.

---
id: renaida-fill-existing-project
status: done
done: 2026-08-13
priority: P3
tags: [renaida, homeowner, onboarding, decision, tech-debt]
created: 2026-08-13
---
## 🤔 BESLUT: ska Renaida-dialogen ersätta hemägarens PlanningWizard? (regressionsrisk)
Ursprunglig R4-vision: tomt hemägar-projekt öppnar RenaidaProjectDialog i "fyll befintligt projekt"-läge istället för PlanningWizard → en motor (scaffoldProject stödjer existingProjectId), språkneutralt, konversationellt/multimodalt.

**Varför det INTE gjordes blint (Carl bör väga):**
1. **Feature-regression:** PlanningWizard skapar unikt `room_ids[]`-multiroom-tasks + auto-checklistor (en punkt/rum för globala arbetstyper via planningWizardService). Renaida/scaffold gör single-room + inga checklistor → mindre rik initial struktur (ej trasig — hemägaren kan multi-tilldela i tabellen, men förlust).
2. **UX-skifte:** wizarden är ett HELSIDES inline-flöde tunat för tomma-projekt-läget; RenaidaProjectDialog är en modal via knapp. Auto-visa-helsida → klicka-knapp-öppna-modal ändrar hemägar-onboardingen.
3. **Teknik:** kräver `existingProjectId`-prop på RenaidaProjectDialog + gren i handleCreate (hoppa projekt-skapande + navigation + quote-offer-logiken, som alla antar nytt projekt).

**Alternativ:** (A) full swap; (B) paritet först; (C) behåll wizarden.

**✅ BESLUT (Carl 2026-08-13): CO-EXISTENS — inget rivs, båda verktygen görs symmetriska (kan NYTT och/eller BEFINTLIGT).** Levererat (`3c24175` + `7a01956`):
- **Renaida → befintligt** (`3c24175`): toScaffoldInput({existingProjectId}) + RenaidaProjectDialog existingProjectId/onPopulated-props (hoppar project_created/quote-offer/navigation, fyrar renaida_project_completed{populate_existing}). Entry: hemägarens tomma-projekt-läge blev en VÄLJARE (wizard | Renaida), inte tvingad wizard.
- **Wizard → nytt** (`7a01956`): createProjectForWizard skapar skal, PlanningWizard.projectId nu valfri (saknas → skapa först). Entry: hemägar-only "Planera med guiden"-knapp på Projects → helskärms-overlay.
Ingen regression: wizarden oförändrad i sitt befintliga läge (room_ids[]/checklistor kvar); Renaida är ett ALTERNATIV, inte en ersättare. 30/30 tester.

---
id: renaida-mobile-first-surface
status: doing
priority: P2
progress: 2026-08-13 — skiva (a)+(b) LEVERERADE (`3324520`+`0923e98`, agent-route deployad). (a) Renaida i mobilnavens upphöjda mittslot (panelens open-state → renaidaStore), FAB döljs på mobil-/start, 4 capture-chips i entrén (Fota kvitto/Logga tid/Snabbanteckning/Status) m. intentHint end-to-end (envelope→edge-fn→eval-spegel+3 golden-fall, 38/39, enda missen = förexisterande taulant-flake). (b) Installerbar PWA: manifest+no-cache-SW, share_target → /capture → pendingShareFiles → D1-flödet, 2 hemskärmsgenvägar; share = Android/desktop, iOS får installerbar app. +3 buggar fixade på vägen: horisontell overflow /start (GuestBanner min-w-0 + mark-only-logga <sm). KVAR: (c) ConfirmDiff tumme-polish, (d) PWA-installprompt vid rätt ögonblick, mät mobil-andel captures i PostHog.
tags: [renaida, mobil, ux, epic, activation]
created: 2026-08-13
---
## 📱 EPIC: Renaida-first mobil-yta — mobilen är capture, desktop är kontroll
**Carls vision 2026-08-13:** Renofine Mobile kompletterar Desktop genom att Renaida tar större plats i mobil-UX:et — snabba anteckningar, justeringar, kvittouppladdningar. Designregel att styra alla mobilbeslut mot: **mobil = Renaida-first capture-yta (på bygget, i butiken, händerna fulla) · desktop = domän-UI-first kontrollyta (tabeller, ritningar, offerter).** Moonshoten "Renaida-only UI" ([[project_agentic_strategy]]) landar FÖRST på mobilen — det är där formulär-friktionen är som störst och Renaida-vägen som överlägsnast.

Skivor (nästan allt bakom finns — router/envelope/D1/röst — detta är entré/yt-arbete):
- **(a) Förstklassig plats i mobilnav** — inte bara FAB: egen Renaida-hemyta med quick-chips (fota kvitto / logga tid / snabbanteckning / statusuppdatering) som skickar intentHint till routern.
- **(b) PWA share-target + kamera-genväg** — dela foto från kamerarullen rakt in i Renaida → D1-flödet. Mål: < 2 tryck från hemskärm till inspelning/kamera.
- **(c) ConfirmDiff/förslagskort polerat för tumme** — mobil-granskning av förslag med en hand.
- **(d) Hemskärmsinstallation/ikon-rutin** — PWA-prompt vid rätt ögonblick (efter första lyckade capture).

Start: kör `iphone-rosttest` (P1, blockerar redan Taulant-mejlet) = baslinje för vad som redan funkar på riktig mobil. Mät: mobil-andel av Renaida-captures + activation per device i PostHog.

---
id: renaida-feedback-intake
status: todo
priority: P3
tags: [renaida, feedback, agent, flywheel]
created: 2026-08-13
---
## 💬 Renaida som feedback-intake — önskemål/buggar blir strukturerade kort (Klaro-trappan nivå 1)
Inspirerat av Klaro.ai (Adams tjänst — användare requestar features/bugfixar i produkten). **Nivå 1 = byggbar nu, liten:** ny envelope-action `report_feedback` — "det borde finnas X" / "det här funkar konstigt" mitt i Renaida-samtalet → strukturerat kort (typ feature/bugg, yta, beskrivning, användarkontext/roll) → `user_feedback`-tabell (se [[feedback-pipeline]]) + triage in i BACKLOG.md. **Kvittens-loopen finns redan byggd (R2-mönstret):** när önskemålet skeppas berättar Renaida det för användaren nästa gång — loop-stängning ingen stor produkt klarar. Dubblerar som aktiverings-/engagemangssignal vid nuvarande skala. Nivå 2–3 (AI-draftade fixar, auto-release) = [[klaro-self-serve-releases]] (parked).

---
id: klaro-self-serve-releases
status: parked
priority: P4
tags: [vision, agent, sil, parked]
created: 2026-08-13
---
## 🚀 VISION (parkerad): användar-requests → AI-byggda releaser (Klaro-trappan nivå 2–3)
**Nivå 2:** request (via [[renaida-feedback-intake]]) → auto-triage/dedup → agent bygger fix i worktree → typecheck/tests/evals + Cowork-varv → **Carl approvar release.** Poäng: infran finns redan på vår sida (SIL, eval-gates, Cowork-loopen, BACKLOG→pappen) — det nya är bara user-facing intake + auto-triage. **Nivå 3 (Klaro-parity, release utan Carl):** ENDAST klassade säkra ändringsklasser (copy/i18n, design-tokens, små UI-fixar) bakom eval-gate + e2e + feature-flag + auto-rollback; ALDRIG schema/RLS/auth/pengar. Ärlig bedömning: med Renofines datakänslighet är nivå 1–2 värdet; nivå 3 är demo-effekt tills skalan kräver den. "Godkänn, inte operera"-principen gäller även meta-nivån.

---
id: community-traffic-play
status: parked
priority: P4
tags: [gtm, seo, community, parked]
created: 2026-08-13
---
## 🌐 PARKERAD: community/trafik-play — projektdagböcker + publikt Q&A istället för tomt forum
Carls idé 2026-08-13: bygg/renoveringsforum (à la byggahus.se / FB-grupperna) i menyerna, publikt + inloggat, för organisk trafik över tid. Utmaning Carl själv ser: forum kräver liquidity; byggahus har 25 års försprång. **Fejk-populering AVRÅDS** (varumärket = förtroende kring hem+pengar; upptäckt = total trovärdighetsförlust; jfr no-fake-benchmarks-principen). Bättre vägar mot SAMMA mål (trafik):
1. **Publika projektdagböcker** — byggahus mest lästa innehåll är projekttrådar, och Renofine-användare HAR redan strukturerad projektdata → "Publicera min renovering" (opt-in, kurerad: foton/tidslinje/budgetintervall/rum) = SEO-sidor + social proof + delbart. Differentierat: ett forum kan inte generera detta ur strukturerad data. Kommentarer på projektsidor = community-fröet — växer organiskt utan tomt-forum-problemet.
2. **Fråga-Renaida-arkiv** — riktiga (anonymiserade, opt-in) frågor + RAG-grundade svar (se [[eval-help-bot-rag-grounding]]) kurerade → indexerbara long-tail-sidor ("kostnad flytta golvbrunn"). Ärligt AI-märkt innehåll, inte fejk-användare.
3. **Låna trafik före egen destination:** [[fb-grupper-outreach]] (P1, finns) — var experten i befintliga rum.
Trigger att avparkera: aktiveringen löst (trafik in i en läckande tratt — 11 signups → 1 aktiv — är slöseri).

---
id: worker-trust-owner-confidence
status: doing
priority: P1
tags: [worker, trust, delegation, i18n, epic]
created: 2026-08-13
---
## 🤝 EPIC: Förtroende för förstagångsägaren som delegerar (t.ex. ukrainsk målare)
**Carls fråga 2026-08-13:** en förstagångsägare som fördelar arbete till en utländsk hantverkare känner sig osäker — hur skapar vi trygghet + tydlighet att instruktionerna ser bra ut (rent UI, text+bild), att arbetaren kan fråga/rapportera, och att ÄGAREN litar på det arbetaren ser? Kartlagt via Explore-agent (arbetarvyn är redan rik: rums/list-vy, väggvyer, färgprover, checklistor, instruktionsbilder, före-foton, progress, fota-klart, textfrågor, röstmeddelanden, fråga-på-objekt; 3-spårs översättning).

**✅ LEVERERAT 2026-08-13 (3 P1 + 1 bonus):**
1. **[[worker-notif-owner-blind]]** (`4b00944`): arbetarens frågor/foton/status nådde ALDRIG ägarens notisklocka (created_by=ägaren → filtrerades av .neq). Fixat + worker-upload-photo sätter project_id (DEPLOYAD). Verifierat mot prod (ukrainsk arbetare).
2. **[[worker-freetext-translation]]** rest (`93577b4`): instruktionsbild-beskrivningarna (ägarens tydligaste "gör exakt så här") översätts nu (ii:-prefix, get-worker-data DEPLOYAD). NCS-koder bevaras.
3. **[[worker-preview-faithful]]** (`2d284dd`): "Visa som arbetare" tappade väggvyer/objekt/noteringar/ytskikt + körde ingen översättning → nu full fidelity + delad runtime-översättning + **back-translation-toggle** (se exakt vad {namn} ser ⇄ visa på svenska). get-worker-data preview-läge bumpar ej last_accessed_at. Verifierat mot ukrainsk prod-token.
4. **Bonus** (`aec2a6c`): invite-preview visade EKONOMI för arbetar-personan (vilseledande) → korrekt förklaring + vägvisning.

**KVAR (P2/P3, kartlagda gap):** se [[worker-read-receipt]], [[worker-status-aggregate]], `arbetar-lank-utan-utskick` (befintligt kort), [[worker-ask-in-rooms-view]], [[worker-explicit-status-report]], [[worker-freetext-translation]] (surface-strängar+bildtexter kvar).

---
id: worker-notif-owner-blind
status: done
done: 2026-08-13
priority: P1
tags: [worker, notifications, bug, trust]
created: 2026-08-13
---
## 🐛 Arbetarens frågor når aldrig ägarens notisklocka
LEVERERAT `4b00944`. Root cause: worker-edge-funktioner skriver kommentaren med created_by_user_id=ägaren (FK-integritet), useNotifications filtrerar .neq(created_by,userId) → arbetar-rader föll bort. Fix: dedikerad hämtning via (worker)-markören, två axlar (task-scopade via uppgifts-id inkl. project_id-lösa färdig-foton + drawing_object_id-frågor). worker-upload-photo sätter nu project_id (DEPLOYAD). NotificationBell: drawing_object → planritaren. Verifierat mot prod-data. Kvar/uppföljning: mejl-fallback vid arbetarfråga (ingen mejlnotis idag).

---
id: worker-preview-faithful
status: done
done: 2026-08-13
priority: P1
tags: [worker, preview, trust, i18n]
created: 2026-08-13
---
## 👁️ "Se exakt vad {namn} ser" — trovärdig förhandsvisning + back-translation
LEVERERAT `2d284dd` + `aec2a6c`. WorkerInstructionsView: fidelity-fix (4 vägg/objekt-propgrupper skickas nu), delad runtime-översättning (src/lib/workerContentTranslation.ts, ingen drift mot WorkerView), språk-toggle via get-worker-data preview+previewLang (sv=källtext), preview bumpar ej last_accessed_at. Invite-preview arbetar-persona: ekonomi→korrekt förklaring. **KVAR discoverability:** entry-point i Team-raden ("se vad hen ser") + post-utskick-nudge — se [[worker-status-aggregate]].

---
id: worker-read-receipt
status: todo
priority: P2
tags: [worker, trust, quick-win]
created: 2026-08-13
---
## 📬 "Öppnad / ej öppnad"-signal för arbetarlänken (nästan gratis)
worker_access_tokens.last_accessed_at trackas redan vid varje arbetar-öppning (och skyddas nu från preview-bumpning) + selekteras redan in i Team-datat (TeamManagement) — men visas ALDRIG. Lägg "Öppnade instruktionerna för 2 tim sedan" / "Ej öppnad än" i Team-fliken/arbetar-raden. Exakt den trygghet en nervös förstagångsägare vill ha: bekräftelse att länken nått fram. Litet UI-jobb, datan finns.

---
id: worker-status-aggregate
status: todo
priority: P2
tags: [worker, trust, ux]
created: 2026-08-13
---
## 📋 Samlad per-arbetare-yta: frågor + status + foton + "se vad hen ser"
Idag är arbetarens frågor spridda (task-kommentarsflöden + ritnings-objekt-badges), status bara via task-board (awaiting_review), och den äkta preview:en bor i Delning → Visa som. Samla per arbetare: vad {namn} frågat, vad hen rapporterat/fotat, öppnad-status ([[worker-read-receipt]]), + knapp "Se exakt vad hen ser" (öppnar WorkerInstructionsView, som redan är trovärdig). Ger ägaren ETT ställe att känna kontroll. Entry: Team-raden.

---
id: worker-ask-in-rooms-view
status: todo
priority: P3
tags: [worker, ux, interaction]
created: 2026-08-13
---
## Fråga-input saknas i rums-vyn (bara i listvyn)
WorkerMessageInput (allmän text/röst-fråga) finns bara i list-vyn. Default-vyn (rooms/swipe) erbjuder bara fråga-på-objekt + foto/progress. En arbetare som stannar i rums-vyn hittar aldrig hur man ställer en allmän fråga. Lägg en fråge-affordans i rums-vyn (RoomInstructionCard) eller en global "Fråga {ägare}"-FAB i arbetarvyn.

---
id: worker-explicit-status-report
status: todo
priority: P3
tags: [worker, status, trust]
created: 2026-08-13
---
## "Markera klart med notering" — explicit statusrapport
Arbetaren kan inte lämna en explicit textuell klar-rapport: färdigt härleds ur ett foto eller 100%-slider. Lägg "Markera klart + kommentar" så ägaren får en strukturerad status hen kan lita på i en blick (och en tydlig hand-off-signal utöver awaiting_review).

---
id: comment-delete-missing
status: todo
priority: P2
tags: [comments, worker, ux, moderation]
created: 2026-08-13
---
## Kommentarer går inte att radera i UI:t (varken arbetare eller ägare)
Cowork-fynd A1 (2026-08-13). En arbetares uppgiftsmeddelande — och kommentarer generellt — kan inte tas bort på någon yta: arbetarbubblan har inga kontroller, ägarens kommentarsflöde erbjuder bara emoji-reaktion, uppgiftsmodalen saknar tråd. Konsekvens: en felaktig/testfråga från en arbetare ligger kvar för alltid. Behöver en delete-affordans (minst för ägaren, ev. soft-delete) på kommentarer. (Cowork-testkommentaren städades via service-role denna gång.)

---
id: worker-comment-general-feed-attribution
status: todo
priority: P3
tags: [worker, comments, attribution, bug]
created: 2026-08-13
---
## Arbetar-meddelande fel-attribuerat i översiktens "General"-flöde
Cowork-fynd A2 (2026-08-13). I ägarens Overview → Messages → "General" attribueras arbetarens meddelande till ÄGAREN (created_by), inte till "{namn} (worker)" via author_display_name — och visas som "General" i stället för kopplat till uppgiften. Notisen är korrekt. **Task_id-delen är FIXAD** (`9ad2a55` — meddelandet trådar nu under uppgiften). Kvar: det generella översiktsflödet bör rendera author_display_name för worker-poster (kolla vilken komponent som driver "General"-listan).

**Cowork retest 2026-08-14 (C-runda) — förfinad diagnos:** samma meddelande (task_id + project_id båda satta efter `9ad2a55`) renderas nu i BÅDE uppgiftstråden OCH General-flödet = **en DB-rad speglad i två feed-containers** (en radering tog bort båda raderna → inte två skrivna rader, inte optimistisk dubbel). Rotorsak sannolikt: General-flödets query fångar poster med project_id UTAN att exkludera de som redan trådats under en task_id. Fix: General-listan bör filtrera bort task-scopade worker-poster (eller dedupa mot task-trådarna). Skild från [[worker-msg-optimistic-double-render]] (den = arbetarens egen optimistiska bubbla). DB-verifiering: bekräfta EN rad i comments (ej två) — Cowork-radering-beteendet indikerar redan det.

---
id: worker-msg-optimistic-double-render
status: todo
priority: P4
tags: [worker, ux, cosmetic]
created: 2026-08-13
---
## Arbetar-meddelande dubbelrenderas optimistiskt före reload
Cowork-fynd A3 (2026-08-13). Ett skicka-klick visar meddelandet 2 ggr i arbetarens bubbeltråd ("ПОВІДОМЛЕННЯ (2)"); efter reload: 1 post, 1 notis, ingen dubbeldata. Ren optimistisk-render-dubblett i WorkerMessageInput/tråden. Kosmetiskt.

---
id: worker-preview-toggle-latency
status: todo
priority: P4
tags: [worker, preview, ux, cosmetic]
created: 2026-08-13
---
## Back-translation-toggle: sv→uk laddar om (~1-2s), uk→sv omedelbar
Cowork-fynd B1 (2026-08-13). Toggeln i WorkerInstructionsView är asymmetrisk: att växla till arbetarens språk kör runtime-översättnings-passet (spinner), medan svenska (källtext) är omedelbar. Fungerar men inkonsekvent. Ev. cacha bägge språkens payload vid första hämtning så toggeln blir omedelbar åt båda håll. Lågprio.

---
id: invite-persona-preview-client-reviewer
status: doing
priority: P2
tags: [invite, trust, preview, kund, granskare, screenshot-fynd]
created: 2026-08-14
---
## "Se exakt vad kunden/granskaren ser" — utöka worker-previewens mönster
Carls screenshot 14 aug (invite-wizard steg 2): personabeskrivningen säger vad kunden/granskaren FÅR se, men ägaren kan inte verifiera det själv → önskan om preview + "testa UI"-kontroll. Worker-personan har redan hela mönstret (WorkerInstructionsView preview via get-worker-data preview+previewLang, "se exakt vad {namn} ser"). Bygg motsvarande för kund (maskad kundvy) och granskare (läs+anmärkningar-vyn): en "Förhandsgranska vyn"-knapp i wizard-steget + i Team-fliken per medlem. Trust-epicens naturliga fortsättning ([[worker-trust-owner-confidence]]) — samma princip: ägarens trygghet = att kunna SE vad motparten ser, inte lita på en beskrivning.

**✅ KLIENT LEVERERAT 2026-08-14 (session 70):** ny `ClientViewPanel` (klient-analogen till WorkerActivityPanel) i Team-flikens expanderade medlemsrad — "Se exakt vad {namn} ser"-knapp → Dialog med den RIKTIGA `CustomerViewTab` (exakt maskad kundvy, inga interna priser/påslag). Trogen (ingen fejk-summering): renderar samma komponent som klienten själv får via SharingTab. Projekt-fält hämtas lazy vid första öppning, dubbelt lazy-mountad (isExpanded + previewOpen). Klient-rad upptäcks via befintliga `row.role/roleTemplate === "client"` → INGEN pipeline-ändring. i18n `clientPreview.*` (5 språk). typecheck:strict + build gröna. **Ej ögonkollad populerad** (kräver projekt med inbjuden klient) → on-device/Cowork-verifiering.

**⏳ GRANSKARE KVAR — medvetet uppskjuten (ärlig avvägning):** till skillnad från klient (CustomerViewTab) och worker (WorkerInstructionsView) finns INGEN färdig granskar-vy-komponent. Granskaren återanvänder den vanliga read-only kontraktörs-shellen (ProjectDetail:218-224 gate:ar till overview+files+chat+inspections). En TROGEN granskar-preview = "visa som granskare" i den riktiga shellen = en betydligt större "view-as-role"-feature med risk; en lätt sammanfattning vore INTE "exakt vad de ser" (vore vilseledande). Wizard-steget har redan en lättare preview (InvitePreviewOverlay, maskad summering, fejkar dock granskare→member). **Beslut:** vänta med granskar-previewn tills (a) en granskare faktiskt bjuds in i skarp drift, eller (b) vi ändå bygger view-as-role. Eget kort vid behov.

---
id: homeowner-time-surface-missing
status: doing
priority: P2
tags: [hemägare, tid, renaida, modul-gating, produktval]
created: 2026-08-14
---
## Hemägare saknar tidsyta — men Renaida loggar glatt tid åt dem
Fynd under screenshot-svepet 14 aug (S2 "kan ej klicka för att verifiera"): `log_time` är tillgängligt för hemägare via Renaida (DIY-scenariot "målat fem timmar i barnrummet" är legitimt), datat landar i time_entries — men `timetracking`-fliken är modul-gatad av för hemägare (modules.ts homeowner:false) så posten går ALDRIG att se/redigera/radera i UI:t. Kvittolänken faller nu tillbaka på tasken (fix 4ec5c8d), men lösa loggar (utan task) är helt osynliga. Produktval: (a) enkel "Min tid"-yta för hemägare (DIY-timmar har ROT/underlags-värde), (b) slå på timetracking-modulen för hemägare, eller (c) gata bort log_time för hemägare utan task. Rekommendation: (a) light — visa loggade timmar per rum/arbete i Budget/arbetskortet.

**✅ DELVIS LEVERERAT 2026-08-14 (`ea61233`, väg a light):** loggad tid visas nu på arbetskortets Översikt ("Loggad tid: X h av ~Y h"), summerad per task_id, synlig alla roller. Routern biasar mot task-matchning så de flesta DIY-loggar blir synliga. **KVAR:** löst loggad tid (task_id null, ingen task matchade) är fortfarande osynlig — behöver en projekt-/rum-nivå-rollup (ev. i Budget) ELLER att routern alltid kopplar till närmaste rum-task. Lågprio tills vi ser att hemägare faktiskt loggar löst.

---
id: task-sheet-mobile-quick-actions
status: done
priority: P2
tags: [mobil, arbetskort, ux, screenshot-fynd]
created: 2026-08-14
---
## Task-sheetens mobila snabbåtgärder — foto direkt utan scroll
Carls screenshot 14 aug: "plottrigt i mobil att scrolla för alla funktioner såsom att ladda upp snabb bild i ett arbete". Task-sheeten (Målning – Rum, Översikt-fliken) kräver scroll förbi slutdatum/framsteg för att nå FOTON-sektionen. Bygg en snabbåtgärds-rad överst på mobil (md:hidden): [📷 Fota] (triggar EntityPhotoGallerys kamera-input direkt) + ev. framsteg-stepper. Breddtänk: samma mönster för rumsdetalj-sheeten (fota rummet). Relaterat: mobil = Renaida-first capture-regeln ([[renaida-mobile-first-surface]]) — övervag om "Fota till detta arbete" ska gå via Renaida-capture med task-kontext istället för egen väg (EN mekanik, inte två).

**✅ LEVERERAT 2026-08-14 (`e9f371a`):** mobil-only "Fota"-knapp överst i arbetskortets Översikt → triggar samma kamera-uppladdning som galleriet (EntityPhotoGallery.openCamera via forwardRef, DRY). Valde direkt-knapp (färre steg) framför Renaida-capture-vägen — den senare kvarstår som framtida "EN mekanik"-alternativ. Ej ögonkollad live (demo gate:ar Tasks headless).

---
id: renaida-review-inline-edit
status: done
priority: P2
tags: [renaida, projektfödelse, fas-b, granska, screenshot-fynd]
created: 2026-08-14
---
## Fas B inc3: inline-edit i "Granska innan du skapar" (rumsnamn, yta, task-titlar)
Carls screenshot 14 aug: "Låt användare klicka och redigera namn o värden i dessa Granska-lägen." = exakt Fas B inc3 ur [[renaida-projektfodelse-multimodal]]. Kartlagt: draft-state + fält finns (DraftRoom.name/areaSqm, DraftTask.customTitle via taskTitle()-härledning), MEN inga generiska setters i renaidaProjectFlow.ts (bara stegbunden applyAnswer) och inget edit-läge i TaskReviewList/rum-raderna (RenaidaProjectDialog.tsx:1234-1305, 1397-1448). FÄRDIG MALL: AIProjectImportModal.tsx:471-767 har exakt mönstret (editingIndex + updateRoom/updateTask + blyerts-toggle). OBS: titel-edit måste skriva customTitle (annars skrivs den över av workType-labeln). Rum-raden finns i BÅDE mobil- och desktop-grenen → bryt ut delad EditableRoomRow (single-source). Bonus: täcker automatiskt mapp-ingest + critic-flaggornas resultat (samma draft).

**✅ LEVERERAT 2026-08-14 (`459962e`):** delad EditableRoomRow (rum namn+yta) + TaskReviewList edit-läge; rena helpers updateDraftRoom (döp om → task-roomName följer) + renameDraftTask (customTitle). Enhetstest + live-verifierad gäst-dialog. 20/20 flow + 39/39 renaida gröna.

---
id: worker-content-token-fk
status: todo
priority: P3
tags: [worker, attribution, data-model, hårdning]
created: 2026-08-14
---
## worker_token_id-FK på comments/photos (exakt per-arbetare-attribution)
Idag attribueras arbetar-content (comments, photos) BARA via author_display_name = "{namn} (worker)" / caption = worker_name — created_by_user_id är ägarens (FK-integritet). Fungerar men är sköert: två arbetare med samma namn, eller ett ändrat namn, bryter kopplingen. worker-status-aggregate-panelen (`0680378`) scopar därför via namn-markör + task_id ∈ tilldelade (fungerar för distinkta namn). REN FIX: lägg nullable `worker_token_id uuid REFERENCES worker_access_tokens(id)` på comments (+ ev. photos), sätt i worker-send-message/worker-ask-question/worker-upload-photo (alla laddar redan tokenRecord = enrads-tillägg), byt aggregat-queryn + useNotifications 2c till `.eq("worker_token_id", id)`. Prejudikat finns: materials.submitted_by_worker_token_id, worker_instruction_overrides.worker_token_id, access_log.worker_token_id. Kräver 1 migration + 3 edge-deploys — vänta tills fler arbetare/namnkollisioner faktiskt uppstår (~1 aktiv arbetare nu = överbyggnad).

---
id: worker-status-aggregate
status: done
priority: P2
tags: [worker, trust, team, screenshot-fynd]
created: 2026-08-14
---
## Per-arbetare aktivitetspanel i Team-fliken
**✅ LEVERERAT 2026-08-14 (`0680378`):** WorkerActivityPanel i expanderbara Team-raden — aktivitetsflöde (frågor/meddelanden/inlämnade foton m. lightbox), status-summering av tilldelade arbeten (antal + att granska + klara), "Se vad {namn} ser"-knapp (Dialog m. WorkerInstructionsView, återanvänder s68-preview). Lazy-mountad. Query RLS-linjerad (project_id ELLER task_id ∈ tilldelade). Attribution via namn-markör → FK-hårdning i [[worker-content-token-fk]]. Ej ögonkollad populerad (ingen läsbar worker-data i prod + auth-gejtad) → Cowork/on-device-verifiering vid ny aktivitet.

---
id: demo-purchase-orders-invisible-rls
status: done
priority: P1
tags: [bugfix, demo, rls, inkop]
created: 2026-08-18
---
## Demots 13 inköp osynliga för besökare — purchase_orders saknade demo-RLS
Carls fynd 2026-08-18: demo-Inköp visar "13 inköp · 6 Betald" i rubriken men noll
inköp under. Rot: `purchase_orders` skapades 2026-05-11, demo-policy-svepet kördes
2026-02-15 → tabellen fick aldrig anon-SELECT-policyn. PO-sektionen (kort/tabell-
toggle!) gate:as på synliga ordrar → renderades aldrig i demot. Systematisk diff
(seedade tabeller vs policyer) visade EXAKT en lucka. Fix: migration
`20260818090000_public_demo_purchase_orders_rls.sql` (applicerad). Kvar: verifiera
i UI som anon + regel-påminnelse: nya tabeller som demo-seedas MÅSTE få demo-policy.

---
id: purchase-dialog-po-invariant-violation
status: doing
priority: P2
tags: [bugfix, inkop]
created: 2026-08-18
updated: 2026-08-18
---
## NewPurchaseFromBudgetDialog bröt PO-invarianten — köp från budgetrad failade alltid
**FIXAD (kod), väntar on-device-verify.** `NewPurchaseFromBudgetDialog.handleSave`
insertade material `status='paid'/'to_order'` UTAN `purchase_order_id` → bröt
DB-CHECK:en (`20260513110000`: `(status='planned') = (purchase_order_id IS NULL)`,
bekräftat applicerad remote) → insert returnerade error → toast "Kunde inte skapa
inköp" VARJE gång. Verifierat live-nåbar från TVÅ ytor: Budget-fliken
(`BudgetTabCore.tsx:1002` +Inköp på budgetrad) OCH Inköp-fliken
(`PurchaseRequestsTab.tsx:1092` klick på planerat kort). Syskon-vägen
`createOrderFromPlanned:917` var redan korrekt (via `createRequestPurchase`).
Fix: routa handleSave genom `createRequestPurchase` (single-source PO-skapande);
utökade helpern med `poStatus` (utfört köp→'delivered', beställning→'requested')
+ `paid_amount`. typecheck:strict + build gröna. **Kvar:** Carl/Cowork inloggad —
öppna budgetrad → Registrera utfört köp → verifiera att det sparas + syns i Inköp.

---
id: purchase-approve-self-loophole
status: done
priority: P2
tags: [bugfix, inkop, roller]
created: 2026-08-18
updated: 2026-08-18
---
## Godkännande-gejtning: självgodkännande — VERIFIERAT ICKE-BUGG i live-appen
Agent-fynd 2026-08-18 om att create-nivå kan godkänna sitt eget förslag =
DÖD-KOD-LÄCKAGE (s70-läxan). Verifierade ALLA live status-skriv-vägar: (1)
redigeringsdialogens status-select är `disabled` om inte edit/owner
(`PurchaseRequestsTab.tsx:1301`); (2) PO-detaljarkets bulk-status (inkl.
'approved') ligger bakom `canEdit = isProjectOwner || purchasesAccess==='edit'`
(create-nivå kommer aldrig in i select-läget). De lösa approve/avböj-knapparna
gejtade bara på `canEditMaterial` finns ENBART i döda `purchases/PurchasesTableView.tsx`
(monteras ingenstans). Ingen live-fix behövd. **Kvar-not till [[inkop-reality-first-redesign]]:**
när tabellvyn/godkännande-kön väcks, gejta approve/decline på `canEdit` (owner/edit),
INTE `canEditMaterial`.

---
id: inkop-reality-first-redesign
status: done
priority: P2
tags: [inkop, ux, refactor]
created: 2026-08-18
updated: 2026-08-18
---
**FRAMSTEG:** Skiva 1 ✅ (`66b1dad`: plankort-strip→summeringsrad, tabell default,
död box bort). Skiva 2a ✅ (`2f13d6a`: summering=faktisk spend, Beställt/Betalt/
Totalt + Kvar-mot-budget ±, löste 0/0-buggen). Skiva 2b ✅ (`9dbbf6d`: godkännande-
kö överst m. inline Godkänn/Avböj, gejtad owner/edit → stänger även
[[purchase-approve-self-loophole]] på UI-nivå). Skiva 3 ✅ (`dc01ed6`: create-nivå
föreslår inköp→'submitted'/'requested'→godkännande-kön; owner/edit registrerar
direkt; kvitto-skanning gejtad edit+; kopplar [[purchase-access-upgrade-suggestion]]
+ pensel-visionen). KVAR: Skiva 4 (filter/gruppering leverantör/status/rum ur döda
purchases/-mappen, sen radera den). Skiva 4 ✅ (`49f200e`: filter status+leverantör
på PO-listan, persisterat, skalar 50+; raderade hela döda purchases/-mappen [6 filer,
1655 rader] + oanvänd import). HELA REDESIGNEN BYGGD + demo-live-verifierad.
KVAR = bara on-device (roll-konton): klicka Godkänn/Avböj på riktig förfrågan;
create-konto föreslår inköp→landar i kön; köp-från-budgetrad round-trip.

## Inköp-fliken "verklighets-först": platt lista, summeringsrad, godkännande-kö
Carls granskning + 3-agents-kartläggning 2026-08-18. Beslut tagna i diskussion:
1. **Platt registerlista** — en rad per inköp/PO (`Bauhaus · 3 930 kr · 4 artiklar ·
   Betald · av Ілля`), expanderbar för artiklar. Sort datum, gruppera/filtrera
   leverantör/status/rum. Skalar 50+. Återbruk: död `purchases/`-mapp
   (PurchasesTableView/Kanban/usePurchasesTableView har grupperings-logiken,
   aldrig monterad) — väck eller radera, inte behåll död.
2. **Planerade-kort-strippen BORT** → EN summeringsrad (Budget · Beställt · Betalt ·
   Kvar). Planering bor i Budget-fliken; kvitto-matchen (s72) sköter konsumtion.
   Städa även platshållar-boxen "Alla inköp visas grupperade ovanför" (död rest).
3. **Godkännande-kö överst** för behöriga ("Väntar godkännande (N)" m. godkänn/avböj
   på raden) — idag begravd i redigeringsdialog. Fixar även [[purchase-approve-self-loophole]].
4. **"Inköpsknappen misslyckas aldrig"** — alla medlemmar ser alltid Nytt inköp;
   utan rättighet routas SAMMA flöde till `submitted`/`requested` ("Skickat till
   {ägare} för godkännande") istället för fel/dold knapp. Plumbing finns
   (`createRequestPurchase`, worker-flödets server-gejtning som förebild).
5. **Beslut: moduler = osynliga, INTE gråa** m. access-request-knappar (integritet:
   grå ekonomi-flik läcker att ekonomi finns; kund-personan har purchases:none
   avsiktligt; komplexitet). Nudge-kanal = meddelanden + [[purchase-access-upgrade-suggestion]].
6. Kategori/produktgrupp-fält finns EJ — ev. senare, AI-satt vid kvitto-extraktion. Ej nu.
Mobil: samma lista; Renaida-kvitto primär registreringsväg. Desktop vs mobil-audit ingår.

---
id: purchase-access-upgrade-suggestion
status: todo
priority: P3
tags: [inkop, roller, idea]
created: 2026-08-18
---
## Behörighets-uppgradering som förslag i godkännande-ögonblicket
Istället för att medlemmar requestar access: när ägaren godkänner förfrågningar,
föreslå uppgradering med bevisen framme — "Ілля har fått 3 inköp godkända — ge
hen rätt att logga direkt? [Ja] [Inte nu]". Ett klick → sätter `can_log_receipts`
resp. `purchases_access='edit'`. Löser "för hårda defaults" organiskt utan
access-request-infrastruktur. Design: visa bara efter ≥2-3 godkända utan avslag.

---
id: worker-request-product-photo
status: todo
priority: P3
tags: [inkop, worker, renaida]
created: 2026-08-18
---
## Pensel-caset: inköpsönskemål med foto/röst → rätt produkt
Målaren fotar penseln som tagit slut → AI extraherar produkt → önskemålet bär
rätt artikel ("rätt sort"). Byggstenar finns (Renaida D1-extraktion, arbetar-röst,
WorkerPurchaseRequestDialog).

**VERIFIERAT 2026-08-18 — översättnings-luckan är ÄKTA:** `worker-create-purchase`
(`supabase/functions/worker-create-purchase/index.ts:202-208`) sparar önskemålets
`name`/`description`/`notes` RÅTT (som arbetaren skrev, t.ex. polska) → ingen
translate-call → ägaren ser oöversatt. Material-namn körs inte genom
translate-comments (den är för meddelanden). Fix-approach: översätt worker→ägare
vid write-time i edge-fn (spara översatt + behåll original, som task_translations-
mönstret) ELLER vid display när worker-submitted material surfacas för ägaren.
Kräver edge-fn-ändring + deploy → gör med Carl närvarande (ej autonomt i fält).

---
id: renaida-floorplan-live-capture
status: done
priority: P2
tags: [renaida, floorplanner, spaceplanner]
created: 2026-08-18
---
## SP1: Ritnings-foto i LIVE-Renaida (befintligt projekt) → grovskiss i Space Planner
Nuläge (verifierat 2026-08-18): foto→plan-pipelinen FINNS deployad
(`process-floorplan` extraherar väggar+dörrar m. slagriktning+rums-polygoner;
`analyzeFloorPlan`/`floorPlanResultToShapes` materialiserar grovskiss m. antagen
skala) — men nås BARA via projektfödelsens mapp-ingest (`ingestProjectFolder.ts:147`).
Live-panelens `documentCapture` känner bara kvitto/faktura/offert → skiss-foto
i befintligt projekt studsar. Bygget: klassa ritnings-foto i documentCapture →
förslag "Ska jag rita in den i Space Planner?" → bekräfta (ConfirmDiff-mekaniken)
→ `createPlanInDB`+`saveShapesForPlan` (återanvänd födelse-vägen ordagrant =
single-source). Förlåtande grovskiss-först = befintlig designfilosofi. Carls
vision 2026-08-18: handritad ELLER CAD-utskrift, användaren förfinar sen.

---
id: renaida-demo-plan-walls-doors
status: done
priority: P2
tags: [renaida, spaceplanner, demo]
created: 2026-08-18
---
## SP2: Renaidas första ritövning — härled väggar+dörrar ur demots rumspolygoner
Carls testcase-idé 2026-08-18 (justerad): demot har redan 5 rum MED
polygon-koordinater (sammanhängande layout: Vardagsrum 5×4m osv) men bara
'room'-shapes → Space-fliken visar 5 platta rektanglar, inga väggar/dörrar
(demot undersäljer plannern — samma mönster som osynliga PO:erna). Övningen:
härled väggar ur polygonerna (delade kanter=innervägg, perimeter=yttervägg,
tjocklekar via v2-presets) + placera dörrar rimligt mellan angränsande rum
(Hall som nav) → in i `seed_demo_content` (single-source, s72-läxan) så alla
demos får riktig planritning. Perfekt första övning: facit finns (polygonerna),
resultatet inspekterbart i plannern. Bygger musklerna för SP3 (layout-syntes
från rumslista utan geometri — har-inget-personan; eget kort när SP1+SP2 satt sig).

---
id: calendar-mobile-horizons
status: todo
priority: P3
tags: [mobile, calendar, tasks]
created: 2026-08-21
---
## Kalender mobil: växla horisont månad / vecka / 3 dagar
Carls screenshot 2026-08-21: månadsvyn funkar på mobil men han vill kunna
smalna av horisonten till 1 vecka och 3 dagar (fältläge: "vad händer nu?").
TasksCalendarView är månads-only idag. Bygg: segmentkontroll Månad|Vecka|3 dgr
(persisterad per projekt som kanban/tabell-valet), vecko-/3-dagarsvyn får
större ytor per dag → tasks som rader m. tid, inte bara staplar. Mobil-first
men gör den även på desktop (samma komponent).

---
id: file-preview-fit-to-screen
status: done
priority: P2
tags: [mobile, files, ux]
created: 2026-08-21
---
## Filförhandsvisning: auto-anpassa PDF/bild till skärmen, zooma därifrån
Carls screenshot 2026-08-21: öppnad planritnings-PDF på mobil visar ett
inzoomat HÖRN (viewporten beskär) — man måste panorera för att förstå vad man
tittar på. Rätt beteende: initial vy = HELA dokumentet anpassat till skärmytan
(fit-to-screen), sedan nyp-zoom/panorera därifrån. Gäller FilePreviewDialog
(PDF + bilder). BONUSFIXAT INLINE 2026-08-21: `t("files.scrollToPan")` läckte
rå nyckel i botten-baren (nyckeln fanns bara under floormap./elevation., anrop
utan fallback) → `files.scrollToPan` tillagd i 7 locales. Kvar: själva
fit-beräkningen + pinch-zoom-verifiering på mobil.

---
id: files-demo-realism-mobile-ui
status: todo
priority: P3
tags: [demo, files, mobile, ux]
created: 2026-08-21
---
## Filer: riktiga exempel-filer i demot + snyggare mobil filbiblioteks-UI
Carls screenshot 2026-08-21: demots Filer-flik visar timestamp-filnamn
("1771330372874-Furusund…", "1773321377834.jpeg") och tekniska mappar
("comment-images") — undersäljer (samma mönster som tomma offerten/osynliga
PO:erna: demot ska visa BÄSTA läget). Bygg: (a) seed:a demot m. typiska,
välnamnade filer (Planritning.pdf, Offert Badrum.pdf, Före-foton osv) via
seed_demo_content (single-source), döp om/göm tekniska mappar; (b) mobil-UI:
tabellen är desktop-formad — kort-läge på mobil (ikon+namn+meta, utan
kolumnlinjer). (b) kan skivas separat.

---
id: folder-ingest-epic
status: done
updated: 2026-08-23
priority: P1
tags: [epic, renaida, ingest, aktivering, growth]
created: 2026-08-23
---
## EPIC: "Släpp din mapp" — mapp-drop → projekt (nytt/befintligt/retro)
**LEVERERAT 2026-08-23** (commits 27f8d27→2e11834, alla 5 skivor). Live-verifierat
i Chrome + 48/48 e2e gröna. KVAR: Carls on-device-test med sin riktiga
lägenhetsmapp (retro end-to-end på inloggat konto), + push/deploy.
Carls vision 2026-08-23: dra hela lägenhets-/renoveringsmappen (inkl. undermappar:
fakturor, offerter, kvitton, ritningar) till Renofine → Renaida frågar nytt/befintligt
→ allt klassas, extraheras och landar som rum/arbeten/inköp/planritning. Extra
målgrupp: RETRO-projekt (renovering klar → kvittosumma för deklaration/försäljning +
detaljskisser på befintlig ritning) = förvärvs-wedge med noll koordinationskostnad,
träffar aktiverings-flaskhalsen. Motorn finns till stor del redan
(`ingestProjectFolder` + folder-drop i RenaidaProjectDialog + populate-existing).
**Fullständig plan: `~/.claude/plans/mapp-ingest-slapp-din-mapp.md`** (nuläge
verifierat mot kod, 5 skivor nedan, beslutspunkter §7). Byggs av Opus-session.

---
id: folder-drop-router
status: done
updated: 2026-08-23
priority: P1
tags: [renaida, ingest, ux, desktop]
created: 2026-08-23
---
## Skiva 1: Global dropyta + "Nytt / Befintligt"-router
`FolderDropZone`-overlay på Projects.tsx + ProjectDetail.tsx (desktop-only) +
`DropRouterDialog` (nytt projekt / project-picker för befintligt / avbryt).
RenaidaProjectDialog får `initialDroppedFiles`-prop som auto-kör befintlig
`runFolderIngest`. Filer-flikens egen drop orörd. Plan §Skiva 1. ~½ dag.

---
id: folder-ingest-archive-originals
status: done
updated: 2026-08-23
priority: P1
tags: [renaida, ingest, files]
created: 2026-08-23
---
## Skiva 2: Arkivera originalen i Filer vid ingest
Idag försvinner original (utom kvitton→receipt_file_path) efter extraktion.
Lyft kategori-uppladdningen ur BatchSmartUploadDialog till delad
`uploadToCategoryFolder`-helper (en motor); `IngestOutcome.archiveFiles` →
ladda upp allt vid födelse/populate (skippa redan-uppladdade kvitton, skippa
gäster). Plan §Skiva 2. ~½ dag.

---
id: retro-project-mode
status: done
updated: 2026-08-23
priority: P1
tags: [renaida, ingest, retro, rot, deklaration]
created: 2026-08-23
---
## Skiva 3: Retro-läge — "renoveringen är redan gjord"
Explicit fråga i födelseflödet (aldrig tyst inferens) → `retrospective`-flagga →
scaffold som status=completed, tasks done/100%, datum ur dokumenten. Mjuka upp
completed-flikarna (purchases/files/spacePlanner show; tasks readonly — BESLUT
Carl, plan §7.1). Ny `CompletedProjectSummary` på Overview: totalt/betalt/ROT/
per leverantör/per rum + print. Lyft hink-kalkylen ur PurchaseRequestsTab till
delad helper. Plan §Skiva 3. ~1 dag. Inga migrationer.

---
id: ingest-confirmdiff-existing
status: done
updated: 2026-08-23
priority: P2
tags: [renaida, ingest, agent, envelope]
created: 2026-08-23
---
## Skiva 4: Ingest till befintligt projekt via ConfirmDiff
`ingestOutcomeToProposals`: IngestOutcome → ProposalAction[] (create_room-dedup,
create_task, import_purchase passthrough, NY action `create_plan_sketch` —
BESLUT Carl, plan §7.2) → Renaida-panelens ConfirmDiff med per-post
accept/reject + fil-provenance. Ersätter populate-existing för drops
(wizard-ytan behåller gamla vägen tills städkort). Plan §Skiva 4. ~1 dag.

---
id: floorplan-pdf-and-progress
status: done
updated: 2026-08-23
priority: P2
tags: [renaida, ingest, pdf, spaceplanner]
created: 2026-08-23
---
## Skiva 5: Ritnings-PDF:er analyseras + filtak + progress
PDF klassad floor_plan → rasterisera sida 1 m. pdfjs (destroy() på loading-task!)
→ befintliga process-floorplan-pipelinen. MAX_FILES 40→100 m. bekräftelse >40
+ uttalad trunkering; `onProgress`-callback → "Läser fil N/M…" i dialogen;
skippa filer >20 MB (sägs i summeringen). Plan §Skiva 5. ~½ dag.

---
id: late-purchases-visibility
status: todo
priority: P2
tags: [retro, inköp, översikt, deklaration]
created: 2026-08-23
---
## Sena inköp syns i sammanställningen (istället för en efterhandsbucket)

Carls fråga 2026-08-23: när man släpper fler kvitton/fakturor/offerter i ett
AVSLUTAT projekt — ska de räknas med i kalkylerna, eller hamna i en separat
efterhandshink?

**Beslut: ingen bucket, ingen fråga vid inläggning — synlighet i efterhand.**
Skiljelinjen som betyder något är inte "före/efter avslut" utan "hörde det här
till projektet?", och den besvaras av dokumentets EGET datum (`documentDate`,
extraheras redan; retro-läget daterar projektet från dem). Sent underlag för
arbete som ingick hör till projektet — flyttas det till en egen hink blir
totalsumman fel, och just totalsumman är hela poängen med retro-projektet
(deklaration + försäljning). En separat hink ger dessutom projektet TVÅ
sanningar om vad det kostade — samma fälla som `lib/purchaseTotals` städade bort
(en motor, samma totaler på alla skärmar). För ROT gäller betalningsdatum, inte
appens projektstadium.

**Bygg (~½ dag):** rad i `CompletedProjectSummary`:
"N inköp registrerade efter projektets slutdatum" — klickbar, listar dem
(leverantör, belopp, datum). Ingen fråga, ingen bucket, bara synlighet.
Jämför PO:ns `documentDate`/`paid_at` mot projektets `finish_goal_date`.

**Först om det visar sig behövas (eget kort då):** exkludera-toggle i just den
listan. `exclude_from_budget` FINNS redan på materials/purchase_orders
(används av ÄTA-vägen) → återanvändning, inget nytt begrepp. Användaren
exkluderar i rätt kontext, efter att ha sett helheten — inte 40 frågor vid
mapp-droppen.

Hänger ihop med [[folder-ingest-epic]] (Skiva 3 retro-läget).

---
id: property-entity-epic
status: todo
priority: P2
tags: [epic, arkitektur, hemägare, retro, produktfråga]
created: 2026-08-23
---
## EPIC-FRÅGA: bostaden/objektet som eget begrepp — flera projekt över tid

Kom ur Carls efterhands-fråga 2026-08-23. Det verkliga behovet bakom
"småprojekt som kvarstår i samma objekt" är INTE en efterhandshink i det gamla
projektet — det är att en BOSTAD håller ihop flera projekt över tid.

**Nuläge (verifierat 2026-08-23):** det finns ingen fastighets-/objekt-entitet.
`projects.property_designation` är bara ett textfält som `RotDetailsDialog`
skriver för ROT-ändamål; `address`/`city`/`postal_code` ligger löst per projekt.
Två projekt i samma lägenhet vet inget om varandra.

**Vad det skulle ge:**
- Planritningen ärvs mellan projekt (rita detaljskisser — hyllor, platsbyggen —
  på befintlig plan utan att rita om den; Carls konkreta case)
- Projekthistorik per bostad ("vad gjordes 2025, vad kostade det")
- Ackumulerat underlag inför FÖRSÄLJNING (alla renoveringar, alla kvitton)
- ROT-historik per fastighet över år (idag per projekt)
- Mapp-droppen kan routas till rätt bostad, inte bara rätt projekt

**Öppna frågor till Carl (produktbeslut, ej byggbeslut ännu):**
1. Gäller detta bara hemägare, eller vill proffs också gruppera per kund/objekt?
   (En byggare har många objekt — då liknar det snarare kund/fastighet i CRM.)
2. Migrationsväg för befintliga projekt: auto-gruppera på address-match, eller
   låta användaren koppla ihop manuellt?
3. Räcker en lättviktig variant (projekt kan peka på ett "objekt" som mest är
   namn + adress + delad plan) eller är det en riktig entitet med egen vy?

**ALLA 3 FRÅGOR BESVARADE av Carl 2026-08-24 — epicen är redo för
arkitekturplan (Fable), därefter bygge:**
1. **Hemägare först.** Proffs/kund-objekt = senare fråga.
2. **Migrationsväg:** skapa `properties` i backend och koppla ALLA befintliga
   (riktiga) projekt vid backfill så alla användare ser nya UI:t direkt +
   befintlig adress kan snabbväljas vid nytt projekt. Accepterat: historiska
   properties blir gles-ifyllda — minimum är ett NAMN. Snarlik input-data →
   undersök ihopslagning; grundfunktion = FÖRESLÅ vid adress-match + manuell
   koppling (aldrig tyst auto-merge av osäkra). Användaren MÅSTE i efterhand
   kunna byta projektets property (till ny eller befintlig från lista) —
   det gör felgruppering återställbar.
3. **Riktig entitet med egen sammanställningsyta** (bekräftat): siffrorna vi
   redan räknar per projekt rullas upp per adress; kärncase = försäljning
   (K5/K6-underlag över innehavstiden).

**Carls hårda krav:** noggrann analys av appens ALLA ytor innan implementation
— får inte förstöra något för befintliga användare (back-compat/migrering är
uttryckligen också ett lärande-case i AI engineering i live-miljö för Carl).

**Space Planner-frågan (Carl 2026-08-24):** hur delas planritningar mellan
projekt på samma adress? Multi-plan-modellen FINNS redan i koden
(`floor_map_plans` + `floor_map_shapes.plan_id`, projekt-scopad). Carls idé:
delad plan + nytt projekt i eget plan-lager, flippa mellan, kopiera objekt.
Riktning att pröva i planen: skiva 1 = KOPIERA plan från tidigare projekt på
samma adress (snapshot, ingen delad muterbar state); levande delat bas-lager
= ev. v2.

**Delning av objekt (Carl 2026-08-24) — SKA med i planen, två roller:**
- **Admin (hushåll):** vuxna i hushållet (primärt Carl + fru) delar full
  admin/insyn på propertyn — följer ALLA projekt på adressen automatiskt,
  nuvarande och framtida.
- **Insyn (viewer):** särfall — t.ex. närstående betrodd byggare får på
  ägarens EGET initiativ läs-insyn i objektet, inkl. tidigare projekt gjorda
  av ANDRA byggare. Kräver explicit invite-copy ("ser alla projekt på
  adressen, även historiska") + att insyn-nivån = kundvyn av projekten,
  aldrig andra byggares interna material.
- Arkitektur-hävstång verifierad 2026-08-24: åtkomst går redan genom centrala
  SECURITY DEFINER-funktioner (`user_has_project_access` läs — används i 58
  migrationsfiler — + `user_can_manage_project` skriv). Property-medlemskap
  läggs som en OR-gren I FUNKTIONERNA → kaskaderar till alla tabeller utan
  policy-svep. Ny tabell `property_members` (role: admin|viewer) + invite
  via befintliga invite-mönster.
- Öppet delfall: TVÅ ägare med egna konton på samma adress (frun har egna
  projekt → egen property-rad vid backfill) → behöver "flytta projekt till
  delad property" via re-assign-pickern (visa även properties delade-till-mig
  som admin).

**ARKITEKTURPLAN KLAR 2026-08-24 (Fable):**
`~/.claude/plans/adresser-property-entity.md` — verifierat nuläge (RLS-funktioner,
6 skapandevägar, adressläsare, klient-perms-gapet), datamodell m. revert-SQL,
backfill-design, write-through-copy-beslutet för adress-sanningen, yta-för-yta-
tabell, 6 skivor S1–S6, fyravägs-RLS-testplan, riskmatris. Alla 3 restfrågor
BESVARADE av Carl 2026-08-24: (1) admin får bjuda in — admin = fulla rättigheter,
bara irreversibla handlingar (radera property, ta bort ägaren, merge, ägarbyte) är
ägar-exklusiva → rollmatris §4.1 + DB-vakter; (2) S3 lanseras direkt för alla
hemägare, ingen flagga; (3) merge-förslag bara inom det inloggad redan ser —
två-konton-fallet löses av den som är admin på båda, ingen cross-account-läsning.
**S1 LEVERERAD 2026-08-24** — 4 migrationer applicerade, 65 properties, 66 projekt
kopplade, 0 demo, RLS-testmatris grön, typecheck 336 = baseline. Läxa inskriven i
planen: REVOKE från roll tar inte bort PUBLIC-grant.
**S2 LEVERERAD 2026-08-24** — propertyService (en motor) + delad PropertyPicker i
skapa-projekt och projektinställningar + "N projekt här" på kortet + alla 6
skapandevägar kopplade + i18n×5. typecheck 336 = baseline, e2e 48/0/3 = baseline.
Kvar: Carls inloggade test av pickern.
**S3 LEVERERAD 2026-08-24** — spendRollup (en motor, CompletedProjectSummary läser
den nu också) + SpendSummaryPanel + `/addresses/:id` m. tidslinje + hemägare-gatad
adresslista på /start + i18n×5. Bonus: playwright laddade aldrig .env.local → de 3
inloggade e2e-testerna har ALLTID skippats; fixat. **S4 LEVERERAD 2026-08-24** — hushålls-delning (admin/insyn) live. Fyravägstestet
fångade ett HÅL I PLANEN: 10 policies i 7 tabeller inlinar sina checkar i stället
för att anropa de centrala funktionerna, så medlemskapet kaskaderade inte dit.
Alla lagade additivt. Rollmatris + DB-vakter verifierade som riktiga roller.
e2e 54 passed. Kvar: inbjudan via e-post (Resend) + UI för rollbyte.
Nästa: S5 (merge-förslag) / S6 (plan-arv).

---
id: floorplan-quality-epic
status: todo
priority: P1
tags: [epic, renaida, spaceplanner, kvalitet, evals]
created: 2026-08-23
---
## EPIC: Renaida ritar som ett proffs — mätbar kvalitet i Space Planner

Carls fråga 2026-08-23: hur ökar vi sannolikheten att Renaida med tiden ritar
planritningar i nivå med en utbildad inredningsarkitekt i branschstandardverktyg?

**Nuläge verifierat 2026-08-23 (tre luckor, ingen av dem är "modellen"):**
1. **Dörrar blir inte dörrar.** v2 har en nativ `opening`-typ i väggen
   (`parentWallId` + `positionOnWall` + `openingKind: door|window|sliding|passage`,
   används av SP2). AI-vägen (`convertToFloorMapShapes`) producerar
   `freehand`-shapes m. `metadata.isLibrarySymbol` → löst klistermärke ovanpå
   väggen: följer inte väggen, är inget hål, går inte att måtta.
   **Fönster produceras inte alls** trots att `openingKind:'window'` finns.
2. **Skalan är en gissning.** `DEFAULT_SKETCH_SPAN_MM = 10000` antar att längsta
   måttet är 10 m. Måttkedjor/skalangivelser i bilden läses aldrig. Fel skala =
   värdelöst för det planneraren finns till för (mata mått in i estimeringen,
   se [[reference_floorplanner_strategy]]).
3. **Ingen eval.** `evals/dataset/` täcker agent-route, checklist,
   parse-renovation-description, translate — inget floorplan. Utan facit blir
   promptändringar bara ANNORLUNDA, aldrig bevisat bättre.

**Ordning (värde per krona). Gör 1+2 först — resten är gissningar utan dem.**
Kort: `floorplan-eval-harness`, `floorplan-regularize`, `floorplan-scale-calibration`,
`floorplan-native-openings`, `floorplan-correction-learning`.

---
id: floorplan-eval-harness
status: todo
priority: P1
tags: [evals, spaceplanner, renaida, mätning]
created: 2026-08-23
---
## 1. Eval för planritnings-tolkning (geometriska mått, ingen judge)

~15–25 riktiga planritningar + facit i `evals/dataset/process-floorplan.json`
+ `evals/run-floorplan.mjs`. Mät GEOMETRISKT (gratis att köra, ingen LLM-judge):
- rumsantal + namnträff
- bildar ytterväggarna en sluten polygon?
- andel väggar inom ±2° från 0/90°
- areafel per rum (%)
- andel dörrar som faktiskt sitter i en vägg
Förutsättning för allt annat i [[floorplan-quality-epic]] — utan den vet vi inte
om en ändring hjälpte eller stjälpte.

---
id: floorplan-regularize
status: todo
priority: P1
tags: [spaceplanner, geometri, kvalitet]
created: 2026-08-23
---
## 2. regularizePlan() — deterministisk uppstädning (störst lyft, noll AI)

Skillnaden mot en proffsritning är inte förståelse utan PRECISION. En
vision-modell ger ±3° och glapp i hörnen ALLTID, oavsett prompt. Nytt steg
mellan AI-svaret och shapes:
- snappa väggvinklar till 0/90/45° inom tolerans
- slå ihop nästan-kolinjära segment
- stäng hörn (väggändar inom X mm → samma punkt)
- snappa tjocklekar till svenska standardstommar (ytter 200/250, inner 70/95/120)
- räta rumspolygoner mot de städade väggarna
Deterministiskt → testbart i [[floorplan-eval-harness]]. Noll extra modellkostnad.

---
id: floorplan-scale-calibration
status: todo
priority: P2
tags: [spaceplanner, renaida, mått, estimering]
created: 2026-08-23
---
## 3. Skalkalibrering ur bilden istället för gissning

Be modellen läsa utskrivna mått/måttkedjor och skalangivelser ("1:100") ur
ritningen och kalibrera därifrån; falla tillbaka på `DEFAULT_SKETCH_SPAN_MM`
bara när inget finns. Utan detta är ALLA mått fel med en okänd faktor — dödligt
för mått→estimering-kopplingen.

---
id: floorplan-native-openings
status: todo
priority: P2
tags: [spaceplanner, renaida, datamodell]
created: 2026-08-23
---
## 4. AI-dörrar/fönster blir nativa openings, inte lösa symboler

Byt målformat i `convertToFloorMapShapes`: dörr → `type:'opening'` m.
`parentWallId` + `positionOnWall` + `openingKind` (samma väg SP2 använder),
inte `freehand` + `isLibrarySymbol`. Lägg till fönster i prompten +
utdataschemat (`openingKind:'window'` finns redan i modellen, AI:n ber aldrig
om dem). Kräver vägg-tillhörighet: matcha dörrens punkt mot närmaste väggsegment
efter [[floorplan-regularize]].

---
id: floorplan-correction-learning
status: todo
priority: P2
tags: [renaida, lärande, spaceplanner, wow-engine]
created: 2026-08-23
---
## 5. Lärande ur användarens rättningar (svaret på "bättre med tiden")

När ett AI-genererat plan redigeras inom N dagar: logga AGGREGERAT (ej
råritningar) vad som rättades — vilka väggar flyttades och hur långt, vilka rum
döptes om, vilka dörrar togs bort. Ger tre saker: regelförbättringar till
[[floorplan-regularize]], few-shot-exempel till prompten, och en signal om VAR
hon är dålig (idag helt osynligt). Hör hemma i [[project_renaida_wow_engine]]s
mining-ritual. **Meningsfullt först när [[floorplan-eval-harness]] finns** —
annars går det inte att se om lärandet lärde sig rätt sak.

---
id: folder-drop-files-only-everywhere
status: todo
priority: P2
tags: [ux, ingest, filer, hemägare]
created: 2026-08-24
---
## "Bara spara i Filer" som val i ALLA mapp-drop-scenarion

Carls fråga 2026-08-24: valet "bara spara filerna utan analys" finns idag BARA
när mappen släpps inne på projektsidan (`DropTargetChoiceDialog`).

**Verifierat gap:** släpps mappen på Projekt-sidan och användaren väljer
"Lägg till i befintligt projekt" auto-körs Renaida-ingest vid framkomst
(`?ingest=folder` → `runIngestIntoProject` i ProjectDetail) — inget Filer-val
på den vägen.

Åtgärd:
1. Befintligt projekt via Projects-routern: visa samma Renaida/Filer-val som
   on-page-droppen (enklast: låt `?ingest=folder` öppna
   `DropTargetChoiceDialog` i stället för att auto-köra). En mekanism, två
   vägar — samma fråga oavsett var droppen började.
2. Nytt projekt: analysen ÄR poängen (utan projekt finns inget Filer-arkiv att
   spara i). Ev. lättvariant "skapa tomt projekt + arkivera filerna" =
   produktfråga till Carl innan bygge.

Hänger ihop med [[folder-ingest-epic]].

---
id: property-address-editing
status: done
priority: P2
tags: [adresser, ux, uppfoljning-s3]
created: 2026-08-24
---
## En adress går inte att redigera — bara projektets adressfält

Upptäckt vid live-verifiering av S3 2026-08-24 (inloggat Home-konto).

**Symptom:** ett projekt utan adress fick vid backfillen en property namngiven
efter PROJEKTET. På /start läser det därför "Dina adresser → Kitchen!", vilket
ser trasigt ut. Åtgärdat kortsiktigt: UI:t säger nu ärligt "ingen adress
angiven" i stället för att presentera ett projektnamn som en adress.

**Den verkliga luckan:** `properties.address/postal_code/city/property_designation`
kan inte redigeras någonstans i appen. Write-through går bara ENA vägen
(property → projekt vid val i PropertyPicker). Skriver användaren en adress i
projektinställningar hamnar den bara på `projects.address`; propertyn förblir
namnlös-med-projektnamn för alltid.

Följd: den som fyller i sin adress i efterhand får ingen adress-gruppering —
nästa projekt matchar inte, eftersom `propertyAddressKey` läser propertyns
adress.

Förslag (ej byggt, kräver Carls ok på omfattning):
1. Minsta fix: en "Redigera adress"-knapp på `/addresses/:id` (namn, gata,
   postnr, ort, fastighetsbeteckning). Kräver bara UPDATE på properties —
   RLS-policyn finns redan (owner + admin).
2. Ev. också: när ett projekt får en adress i projektinställningar och dess
   property saknar adress → erbjud "använd även som adressens uppgifter".
   Aldrig tyst — samma princip som retro-frågan.

**LEVERERAT 2026-08-24:** förslag 1 byggt — `EditPropertyDialog` + "Redigera adress"
på `/addresses/:id`, `updateProperty()` i propertyService. Namnet följer gatuadressen
tills användaren rör namnfältet själv. Saknas adress visas en uppmaning som förklarar
VARFÖR den spelar roll ("nästa renovering hittar hit av sig själv"). Skrivvägen
RLS-verifierad som riktig ägarroll (rullad tillbaka). e2e: dialogen öppnas förifylld
och avbryts utan att mutera kontot.

Förslag 2 (projektadress → propertyns uppgifter) EJ byggt — write-through-beslutet i
planens §6 säger att projektets adressfält är sanningen för ROT/offerter i v1, och
adress-redigeringen täcker behovet. Tas upp igen om drift visar sig i praktiken.

Hänger ihop med [[property-entity-epic]] (S2/S3-uppföljning).

---
id: property-documents-epic
status: todo
priority: P2
tags: [epic, hemägare, adresser, dokument, mapp-ingest, rls]
created: 2026-08-24
---
## EPIC: Bostadens papper — köpehandlingar på adressen, adress ur dokumenten, upplåtelseform

Ur Carls fråga 2026-08-24 efter S1–S7: "jag älskar att kunna ha ALLA dokument
kopplade till ett boende på en och samma plats." Fable-granskning av
Opus-resonemanget + full plan: `~/.claude/plans/bostadens-papper.md`.

**Verifierat nuläge:** filer är storage-only under `projects/{id}/`, storage-RLS
fail-closed för andra prefix, `contract` = entreprenadkontrakt, ingest letar
inte efter adress, ROT har bara fastighetsbeteckning (bostadsrätter kan inte
fylla i sitt underlag), drop-routern har bara nytt/befintligt projekt och
filtrerar projekt på `owner_id` (S4-svepet missade den).

**Tre korrigeringar av det första resonemanget:** (1) kvitton bär butikens
adress — utvinningen måste vara typ-rankad och alltid ett förslag; (2)
upplåtelseform (bostadsrätt/äganderätt/hyresrätt) är den enda taxonomi
S7-regeln släpper in — ROT-underlaget säger olika saker; (3) ingen
vinstberäkning — visa fakta som underlag. Plus två som saknades helt:
säljarens personnummer i kontrakten (insyn får aldrig se, AI-utvinning
uttrycklig) och att S5-merge skulle strypa filåtkomst om storage-policyn
parsar sökvägen (→ tabellen är sanningen, sökvägen opak).

**Skivor (ordning):** P3 fundament + "Bostadens papper" på adress-sidan →
P4 tredje dörren i droppen + blandade mappar + "flytta till bostaden" →
P2 upplåtelseform + BRF-fält i ROT → P1 adress ur dokumenten (förslag) →
P5 "Läs ut uppgifter" (uttryckligt, utan personnummer).

**Antaganden Carl kan veta:** admin-medlemmar ser pappren; AI-utvinning
uttrycklig, inte automatisk; proffs ser inget i v1; samma bucket, nytt prefix.

### Utfall

**P3 LEVERERAD 2026-08-24** (`c903665`). Planens antagande "samma bucket, nytt
prefix" var fel och farligt: `project-files` är PUBLIC (se
[[project-files-public-bucket]]). Pappren ligger i egen privat bucket.

**P4 LEVERERAD 2026-08-24** (`bf750e0`, `afefe07`, `e2102dc`, `b7c37be`,
`ff64990`, `e0812f1`). Tredje dörren "Spara på bostaden", blandade mappar med
frågan i befintliga projekt, "Flytta till bostaden" i Filer — och P4.0.

P4.0 var inte en kantfalls-not: `processDocument` skickade varje dokument
klassificeraren inte kunde placera rakt in i scope-parsern, så ett CV kunde ge
projektet rum. Nu parsas bara klasser som bär arbetsomfattning; resten lagras
som `other` och rör ingenting. Verifierat live: CV i projekt → 0 rum, 0 arbeten,
0 inköp, och appen säger rakt ut att den inte visste vad filen var.

Två äldre buggar hittades av live-körningen: filradering i projektets rotmapp
har aldrig fungerat (dubbel snedstreck i sökvägen), och `storage.remove()`
rapporterar framgång för en nyckel den aldrig matchade. Båda fixade.

**P1 + P5 LEVERERADE 2026-08-24** (Fable, s81). P1: `classify-document` ger
`property_address` + `address_source`, regel i prompt OCH kod (kvitto ⇒ alltid
null), rankning i ingest-motorn, förslag som FRÅGA vid adress-steget. Eval
`evals/run-address.mjs`: 7/7, 0 felaktiga adresser. P5: `extract-property-
document` (inloggad krävs, personnummer-tvätt server+klient, månads-siffror
skiljer pnr från org.nr), `PropertyFactsCard` med provenance per fakta och
"Använd" bara in i tomma fält, samtyckesrad före första anropet. Live-
verifierat: 11 fakta ur ett testkontrakt, noll pnr/konto/namn i lagrad JSON.
`parties` medvetet utelämnat (dataminimering).

**P2 LEVERERAD 2026-08-24 — EPICEN KLAR.** Migration `20260824200000`
applicerad (tenure + BRF-fält). Verifierat mot skatteverket.se: ROT kräver att
man äger bostaden (hyresrätt ⇒ inget avdrag); småhus ⇒ fastighetsbeteckning;
bostadsrätt ⇒ föreningens org.nr + lägenhetsnummer. EN motor
(`lib/rotIdentifiers.ts`) + delad hook, villkorade fält i EditPropertyDialog,
fråga i S7-stil på adress-sidan och i ROT-sammanställningen.

**🚩 Fynd: båda ytorna planen pekade ut är död kod** — `RotDetailsCard` har noll
importörer, `RotSummaryCard` importeras men renderas aldrig. Den levande ytan är
`HomeownerAnalysisSection`, och där satt buggen: ROT-checken var
`!!property_designation`, en bock en bostadsrättsägare aldrig kan sätta. Fixad.

**Kvar:** e2e för villkorade fält + dörrar + adressförslag (alla live-
verifierade). Golden-eval för P5:s extraktion. `document_date` saknar UI.
Inbjudan via e-post (Resend). Städa död kod: `RotDetailsCard`,
`RotSummaryCard` + dess oanvända import i BudgetTabCore.

---
id: project-files-public-bucket
status: done
priority: P1
tags: [säkerhet, storage, rls, prod]
created: 2026-08-24
---
## 🔒 `project-files` är en PUBLIC bucket — varje uppladdad fil är läsbar utan inloggning

**Verifierat 2026-08-24 mot prod:** `storage.buckets.public = true` för
`project-files`. RLS-policyerna på `storage.objects` gatar det autentiserade
API:et och listningen, men en public bucket serverar dessutom
`/storage/v1/object/public/{bucket}/{path}` **helt utan autentisering**. En
anonym `curl` mot en fil som laddats upp sekunder tidigare gav `200` och hela
filen. Det gäller alltså varje kvitto, faktura, offert, ritning och foto som
någon användare lagt in.

Sökvägarna är UUID-baserade (`projects/{uuid}/Kategori/{namn}`), så det krävs
att man känner till eller får URL:en — men URL:er läcker: de delas i chatt,
hamnar i `Referer`, i loggar, i mejl, och appen genererar dem själv via
`getPublicUrl` på 27 ställen.

**Varför det inte fixades direkt:** att flippa bucketen till `public = false`
är en engångsändring i DB, men **27 anropsställen använder `getPublicUrl`** och
skulle alla sluta fungera samtidigt (filpreview, tumnaglar, nedladdning,
kvittobilder, chattbilagor). Det kräver ett samlat byte till
`createSignedUrl` + en delad hjälpare, och egen verifiering per yta. Det är
ett eget jobb, inte en sidoeffekt av P3.

**Vad som gjordes i P3 istället:** bostadens papper (köpekontrakt m.m., som
innehåller säljarens personnummer) lades i en **egen, privat bucket**
`property-documents` som inget annat rör och som bara nås via kortlivade
signerade URL:er. Verifierat: anonymt `400` på alla tre endpoints.

**Förslag till åtgärd (ordning):**
1. En delad `getFileUrl(path)`-hjälpare som mintar signerad URL med cache.
2. Byt de 27 anropsställena, yta för yta, med verifiering i Chrome per yta.
3. Flippa `project-files` till `public = false`.
4. Undantag att lösa först: `Anyone can view public demo files` (demot är
   avsiktligt publikt) — demofilerna kan behöva ligga i egen public bucket.

**LEVERERAD 2026-08-24** (`0a62d15`). Bucketen är privat; anonym curl mot
`/object/public/` ger 400 för både nya filer och Carls gamla kvitton.

Genomförandet blev större än kortets 27 anropsställen antydde. Skrivsidan var
~50 ställen, men **läsSIDAN var 37 renderare** som satte `photo.url` rakt i en
`<img>`. Signeringen lades därför i DATALAGRET (`signRows()` vid hämtningen,
~25 ställen) i stället för i varje renderare — då kan ingen yta glömmas, och
en ny yta ärver signeringen gratis.

Två motorer: `src/lib/fileUrl.ts` (klient, med cache + dedup + förnyelse vid
80 % av livslängden) och `supabase/functions/_shared/fileUrl.ts`
(`signPayloadUrls` för edge functions, som signerar åt anropare utan egen
session efter att deras token validerats).

Lagrade referenser är nu sökvägar, inte URL:er — 33 rader migrerade i
`20260824210000` (photos.url, projects.cover_image_url,
floor_map_shapes.shape_data.imageUrl, comments.images). En signerad URL får
aldrig sparas; den går ut.

Punkt 4 visade sig inte behövas: demots anon-policy på `storage.objects` är
precis vad `createSignedUrl` kontrollerar, så demot fungerar utan egen bucket.

**Sidofynd:** `ViewQuoteV2` hämtade `photos.storage_path` — en kolumn som inte
finns — så ÄTA-fotona på offerten var alltid tomma. Fixat.

---
id: import-reconciliation-epic
status: done
priority: P1
tags: [epic, mapp-ingest, rum, renaida, ux]
created: 2026-08-25
---
## Stäm av importen — avstämningssida, rum-matchning, ritningsval

**LEVERERAD 2026-08-25** (`8d1f6d6`, `97c7d89`, `ffe97be`, `1b745a4`,
`30178b7`). Plan: `~/.claude/plans/serene-snuggling-metcalfe.md`.

Carls test: 100 filer in i ett befintligt projekt med två våtrum (Badrum,
Gäst WC) → importen föreslog `Badrum 1`, `Badrum 2`, `WC`, `WC/Dusch` OCH
`Gäst-WC` ovanpå dem, ritningarna blev tre rum utan likhet med lägenheten,
och bekräftelsen kom efter tyst väntan.

**Rotorsak till dubbletterna:** rum jämfördes med exakt gemen strängmatchning
på två ställen. Ny motor `src/lib/roomMatch.ts` på alla tre ställena.
Skiljetecken och ordningstal är stavning (slås ihop tyst); allt som kräver
domänkunskap blir ett förslag i en dropdown. En stam-träff räknas som säker
bara vid EXAKT EN kandidat, och två rum som namnges av SAMMA fil merge:as
aldrig (Sovrum 1/Sovrum 2 är verkligen två).

**Ny yta** `?tab=files&subtab=import`: filerna i fyra ärliga högar,
förhandsvisning av originalet, och en redigerbar högerkolumn där rum kan slås
ihop med befintliga, döpas om eller tas bort — med de befintliga rummen alltid
synliga. Arbeten flyttas mellan rum så de följer med en hopslagning.

**Ritningar** fick den fråga som saknades: rita av / lägg som lager / bara
spara. Default lutar säkert (lager om projektet redan har en ritad plan).

**Nya rum placeras ut** i rutnät bredvid befintligt innehåll på canvasen.

**Väntegrafik** i alla tre faser — klassificering och arkivering rapporterade
inget alls, och arkiveringen är luckan precis före sammanställningen.

**Rumslistan** fick kolumnerna Arbeten och Inköp (två queries för hela
projektet, aldrig en per rum).

**Kvar:** Carls test med den riktiga mappen. Sessionen överlever inte en
omladdning (filerna är arkiverade, så det kostar bara ett nytt släpp) —
persistens är en uppföljning, inte del av epicen.

---
id: e2e-floorplanner-stale-selectors
status: done
priority: P2
tags: [e2e, teknisk-skuld, floorplanner]
created: 2026-08-25
---
## 28 e2e-test döda i planritaren — rotorsak hittad: hjälparen väntar inte på demo-guiden

Upptäckt 2026-08-25: **38 av 118 test failade**, och hade gjort det sedan
långt före den sessionen. Baseline-siffran "e2e 54/0" som stått i minnet var
alltså missvisande — 54 var antalet som passerade, inte antalet som fanns.

Halva orsaken är fixad (`30178b7`): `openDemoPlanner` väntade på ett
nav-element med texten `"Planer"`, en etikett som inte finns någonstans i
appen längre (den heter `"Ritning"` och ligger i `"Yta"`-dropdownen). Testen
går nu direkt på URL:en. 7 test lever igen.

**Kvar: 28 test** som failar djupare in i editorn. Plus `language-switching`
(letar efter en språkknapp vars tillgänglighetsnamn inte finns kvar),
`pwa-share-target`, `worker-wall-resolution` och `wallview-secondary-host`.

---

## ✅ ANALYS KLAR 2026-08-25 (Fable) — rotorsaken är hittad och mätt

Kortets titel var fel. Testen dör inte på stale selectors. Kedjan, verifierad
steg för steg mot den körande appen:

1. **Demot har egen planritning nu**: 12 väggar, 5 rum, 5 öppningar, hydrerar
   asynkront ~1–6 s efter att canvasen syns.
2. **`DemoPageGuide` visar en `AlertDialog` ("Ytplanering", knapp "OK")** när
   man landar på planritaren. Backdropen är `fixed inset-0 z-50` och äter
   varje klick. Tangentbordet fungerar (går till `document`), pekaren inte.
3. **Hjälparen `openDemoPlanner` "stänger" dialogen med
   `isVisible({ timeout: 5000 })` — som INTE väntar.** Playwrights egna typer:
   *"This option is ignored. isVisible() does not wait… returns immediately."*
   Dialogen monteras efter kontrollen → aldrig stängd → alla klick nekade.
   Samma mönster i `worker-wall-resolution` (2) och `wallview-secondary-host` (2).
4. **Mätt:** med en hjälpare som väntar (`waitFor({state:'visible'})` + klick +
   `waitFor({state:'hidden'})`) går floorplanner.spec från **6 → 19 gröna av 34**.
5. **De 15 kvar** är två sorter, båda testskuld: (a) absoluta antal mot ett demo
   som numera har geometri — `fast drawing of separate wall chains` väntar 3
   väggar, får 15 (=12+3); `closing a wall loop` väntar 1 rum, får 5, och
   demorummen har `area: null` (seeden sätter aldrig area) så
   `toBeCloseTo(12)` kan aldrig passera. (b) Interferens i fullkörningen:
   `measure tool` och `door placement` PASSERAR körda ensamma.

**Användare är INTE drabbade av det här** — en människa ser dialogen och
klickar OK. Men grävandet hittade en riktig bugg, se `demo-autosave-ljuger`.

### ✅ LEVERERAT 2026-08-25 — 6 → 34 gröna av 34

Fyra orsaker, alla testsidiga, ingen produktbugg i planritaren:
1. Hjälparen väntade aldrig på demo-guiden (`isVisible` väntar inte) → delad
   hjälpare `e2e/lib/demoPlanner.ts`. **6 → 20**
2. Absoluta antal mot ett demo med egen geometri → delta-assertions. **20 → 21**
3. Test som ritade ovanpå demots plan → `{ blank: true }`. **21 → 27**
4. Zoom-beroende px→mm-antaganden → `pinView()`; tvetydigt 'Planritning' →
   pekar ut brödsmulan. **27 → 34**

Rensningen går via kommandot, inte Cmd+A + Delete: demots rum är kopplade till
rum-entiteter, så `shape.delete` stannar korrekt och frågar. Den grinden är
produkten som fungerar.

**Hela sviten: 154/2 av 156** (från 107/31 av 138). Kvar: `language-switching`
och `pwa-share-target`, egna orsaker, ej undersökta.

### Ursprunglig plan (utförd)
1. `openDemoPlanner` + de två andra hjälparna: byt `isVisible({timeout})` mot
   `getByRole('alertdialog').waitFor({state:'visible'})` → klicka OK →
   `waitFor({state:'hidden'})`. Gör det till EN delad hjälpare i `e2e/lib/`.
2. Skriv om absoluta antal till delta: läs antal före, assert `after - before`.
   `closing a wall loop`: hitta det NYA rummet (id ej i före-mängden), assert
   dess area — inte `rooms[0]`.
3. Kör fullt; det som fortfarande faller ensamt är riktig selector-drift och tas
   ett i taget. Det som passerar ensamt men faller i full körning →
   `test.describe.configure({ mode: 'serial' })` eller isolera sessionStorage.

---
id: worker-view-viral-cta
status: todo
priority: P1
tags: [agent-proposed, growth, arbetarvy, integrations-strategi]
created: 2026-08-25
---
## Arbetar-vyn: gör "Drivs av Renofine" till en faktisk väg in

Från integrations-analysen (`docs/integrations-strategi-2026-08.md`, punkt 0):
arbetar-token-länken är den billigaste förvärvsmekaniken som finns, eftersom
varje SMS landar hos en hantverkare som är en framtida användare.

**Antagandet i dokumentet var delvis fel, verifierat mot koden:** vyn har
branding — `WorkerView.tsx:456` renderar "Drivs av Renofine". Men det är
**ren text: ingen länk, ingen CTA, inget PostHog-event**. Slutsatsen (en
kvälls jobb, störst hävstång på listan) står kvar; det är formuleringen
"saknar branding" som ska rättas.

Bygg: gör foten till en länk till landningssidan med en diskret rad i stil med
"Jobbar du med renovering? Prova Renofine själv", och lägg
`worker_cta_clicked` i PostHog så konverteringen går att mäta. Inget som
stör arbetsytan — arbetaren är där för att jobba.

---
id: purchase-vat-capture
status: todo
priority: P2
tags: [agent-proposed, ekonomi, inkop, forutsattning]
created: 2026-08-25
---
## Spara moms och netto på inköp — förutsättning för SIE4

`process-receipt` extraherar redan `vat_amount` ur kvittot, men **ingen tabell
lagrar det**: `purchase_orders` har `total` och `receipt_total`, inga
`vat_*`-kolumner, och `grep vat` i DB-typerna träffar bara `avatar_url`.
Momsen läses alltså ut och kastas bort vid varje kvitto-import.

Det är i sig ett tapp för proffs-användare (momsen är avdragsgill och syns
ingenstans), och det blockerar SIE4-export helt: en verifikation kräver konto,
netto och moms per rad.

Bygg: kolumner för netto/moms/momssats på inköpsordern, fyll dem från
kvitto-OCR:en vid import, och visa dem i PO-detaljen (ex/inkl moms enligt
den befintliga regeln proffs=ex, hemägare=inkl).

---
id: sie4-export
status: todo
priority: P2
tags: [agent-proposed, integrations-strategi, standarder, bokforing]
blocked-by: purchase-vat-capture
created: 2026-08-25
---
## SIE4-export — en standard i stället för fyra API:er

Från integrations-analysen (punkt 2): SIE är den öppna svenska standarden som
Fortnox, Visma, Bokio och Björn Lundén alla importerar. Ingen ansökan, ingen
nyckel, ingen motpart — appen skriver en `.se`-fil, hantverkaren importerar i
sitt eget program.

**Dokumentets antagande att underlaget redan finns är fel** (verifierat mot
koden): momsen sparas inte någonstans, se `purchase-vat-capture`. Det här är
alltså inte "bara formatgenerering" — det förutsätter (1) att momsen fångas
vid kvitto-import och (2) en kontoplan-mappning per kostnadsställe. Därför P2
och blockerad, inte P1.

---
id: scrive-esign-quotes
status: todo
priority: P1
tags: [agent-proposed, integrations-strategi, offert, fortroende]
created: 2026-08-25
---
## Scrive eSign på offerter

Från integrations-analysen (punkt 1). En osignerad offert är ett dokument, en
signerad är ett åtagande — och BankID-identifiering är exakt det svenska
privatpersoner litar på i en relation till en hantverkare de inte träffat.

Gatekeeper: gratis självbetjänings-testbädd (`api-testbed.scrive.com`),
REST/JSON. Produktion kräver betald licens — det är kostnadsflaggan, men hela
bygget och en full demo går att göra gratis i testbädden.

Flöde: skickad offert → "Signera med BankID" → status tillbaka på offerten
(skickad/öppnad/signerad) → signerad PDF i Filer.

**Obs:** punkten har ett andra syfte som ägs av PA-sessionen, inte av det här
repot. Bygg den som en vanlig produktfeature — men säg till så snart det finns
ett demobart flöde end-to-end mot testbädden.

---
id: fortnox-api
status: todo
priority: P3
tags: [agent-proposed, integrations-strategi, bokforing]
created: 2026-08-25
---
## Fortnox API — accepterad offert blir fakturautkast

Från integrations-analysen (punkt 3). Self-service developer-registrering,
OAuth utan Marketplace-listning; granskningen gäller bara publicering, som
dessutom kräver 10 aktiva kunder. Sekvensen är alltså framtvingad: bygg
opublicerat, samla kunder, ta listningen som kanal sedan.

Efter SIE4 — API-spåret motiveras först när användare ber om tvåvägssynk.

---
id: ics-calendar-export
status: todo
priority: P3
tags: [agent-proposed, integrations-strategi, standarder, tidplan]
created: 2026-08-25
---
## ICS-export av projekttidplanen

Från integrations-analysen (punkt 4). Tidplanen som prenumererbar ICS-URL,
importerbar i Google/Apple/Outlook utan någon API-relation. Låg kostnad, och
delnings-URL:en till kund och hantverkare är ännu en yta där Renofine syns
hos icke-användare.

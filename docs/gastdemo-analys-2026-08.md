# Gäst-personifierade demon — syn, domslut och ombyggnad (2026-08-26)

Underlag: koden i `main` (`5bde3ca`) + PostHog 90 dagar (2026-05-28 → 2026-08-26)
för `renofine.com`. Frågan Carl ställde: kan Renofine göra som Produlog och låta
en besökare få ett skräddarsytt demo ur sin egen input (mapp, rad, boxar) innan
kontot skapas — billigt i tokens, och VAR/HUR i UI:t.

## Domslut i en mening

**Avvisa idén som den är formulerad — inte för att den är dålig, utan för att
den redan är byggd och konverterar 0 av 36.** Bygg om den till EN sak som
saknas: ett värde-överskott ("Renaidas plan") som visas i det ögonblick
gästen är klar, och gör det till dörren på landningssidan.

## Vad som redan finns (verifierat i kod)

| Idé i Carls formulering | Finns i dag | Var |
|---|---|---|
| Personligt projekt utan konto | Ja — gästläge, 3 lokala projekt, migreras vid signup | `guestStorageService`, `guestMigrationService`, `RequireAuth allowGuest` |
| "Skriv en rad" → tolkad renovering | Ja — beskriv-steget kallar `parse-renovation-description` (anon-JWT, 20/h/IP) | `GuidedSetupWizard` (`isGuest`) |
| "Färdiga boxar" | Ja — rum-chips + arbetstyps-chips, 0 tokens | `RoomsStep`, `WorkTypesStep` |
| Mapp-drop som gäst | Ja — `RenaidaProjectDialog isGuest + initialDroppedFiles` kör hela ingest-motorn | `Projects.tsx handleDropRoute` |
| Publikt demo utan konto | Ja — `PUBLIC_DEMO_PROJECT_ID`, RLS-läsbart | `ProjectDetail` |
| Kostnadsuppskattning för gäst | Ja — `GuestTaskEstimateSheet`, `materialRecipes` (klient, 0 tokens) | `GuestPlanningSection` |

Det finns alltså inget "gäst-demo att bygga". Det finns ett gästflöde som
människor faktiskt går igenom — och lämnar.

## Vad datan säger (renofine.com, 90 dagar)

- **813 personer**, 791 på landningssidan. **82 % mobil** (651), varav 452 från
  Facebook. Tre trafiktoppar = tre FB-inlägg (23 jun: 115, 5 jul: 105, 6 jul: 238).
  Övriga dagar: 0–20 besökare.
- **51 klickade "Kom igång — gratis"** → gästläge. 47 slutförde onboardingen.
  **11 skapade konto. 3 aktiverade.**
- **36 gäster gjorde personifieringen — beskrev sin renovering, lät AI:n tolka
  ("Analysera & fortsätt"), valde rum och arbeten, fick ett lokalt projekt — och
  lämnade utan konto. 0 av 36.**
- **14 personer öppnade det publika demot** = 1,8 % av besökarna. Demot är inte
  dörren. "Kom igång" är dörren.
- Mapp-drop som gäst: `folder_drop_started` 2 gånger, 1 person, på 90 dagar.
- Produlog-förebilden: `kaisa_hero_built` = 9 händelser från **en** person
  (Carl). Mönstret är alltså obevisat även där det kopieras ifrån.

### Fem gästresor, klick för klick (PostHog autocapture)

Mönstret är identiskt i alla fem: 2–4 minuter, wizarden klar, projektet öppnas,
den guidade turen ("Nästa" ×5 → "Sätt igång!"), 10–60 sekunder i det tomma
projektet, sedan bort.

1. **Proffs-besökare 10 jul** (läste FAQ om ROT, kunder, priser): tomt projekt →
   "Lägg till första arbetet" → bort efter 20 s → tillbaka → wizard → rage-klick på
   rumschips → Nyheter → demot → **spelade in röst till Renaida, fick förslag,
   tryckte Genomför** → 20 min i demot → **aldrig konto.** Han fick appens bästa
   ögonblick och det räckte inte, för det fanns ingen "spara det här"-dörr där.
2. **Engelsk UI 6 jul**: "Utforska först" → skrev beskrivning → AI tolkade →
   arbetstyper → rage-klick → adress → projekt → tur → "Planering" → bort → demot
   → Kundvy → bort. 17 min totalt.
3. **Hemägare 27 jun**: valde "Jag planerar en renovering av mitt hem" → hall,
   målning → "Använd detta" → projekt → tur ×6 → "Påbörja projekt" → bort efter
   19 s.
4. **22 jul**: "Guida mig steg för steg" → tvättstuga, kakel, golv, fönster, el →
   "Skapa ditt första projekt" → **kom tillbaka två dagar senare till /start
   (det lokala projektet fanns kvar), 5 min, bort — sedan tre gånger till
   landningssidan utan att gå vidare.** En person som ville, och inte hittade
   nästa steg.
5. **7 jul**: onboarding → återkom nästa morgon, skrev beskrivning, AI tolkade,
   lade till eget rum, "Garage & Carport renovering" → projekt → tur → bort.

## Diagnosen: output ≈ input

Personifieringen fungerar. Det som saknas är **överskott**. Gästen skriver "kök
och badrum, kakel och el" och får tillbaka rum som heter Kök och Badrum och
arbeten som heter Kakel och El — plus en tur som säger "Nästa" fem gånger och
ett projekt som ber om "första arbetet".

Produlogs katalog-demo imponerar för att outputen (en färdig katalog) är
uppenbart *mer* än inputen (en mapp). Här är outputen en tom projektyta.
Renofines överskott — kostnadsspann, ROT-besparing, yrkesordning i veckor, vad
du glömt, checklistor — finns i motorn men visas aldrig i det ögonblicket.

Mapp-drop löser inte det: rikare input ger fortfarande output ≈ input. Och
**82 % kommer på mobil, där det inte finns någon mapp att släppa.** 130
desktop-besökare per kvartal är taket för den gesten.

## Ombyggnaden: "Renaidas plan" som säljartefakt

EN skärm, *Din renoveringsplan*, som visas direkt när beskriv/boxar är klara
(i stället för projektturen), byggd deterministiskt ur utkastet:

1. **Kostnadsspann per rum** — `materialRecipes` + SmartEstimate, 0 tokens
   (finns redan för gäster i `GuestTaskEstimateSheet`).
2. **ROT-uppskattning** — 30 % av arbetskostnaden, tak per person, 0 tokens.
3. **Yrkesordning som veckoplan** — rivning → el/VVS → kakel → snickeri →
   målning → golv, ur `workTypeUtils`, 0 tokens.
4. **"Tre saker du troligen glömt"** — `renaida-critic` (EN modellutropning,
   redan rate-limitad 20/h/IP) med mallfallback per arbetstyp om anropet nekas.
5. **"Det här frågar en byggare dig"** — mallar per arbetstyp, 0 tokens.

Och dörren **där värdet är**: *"Spara planen"* → konto (migrationen finns),
i stället för dagens banner "Sparas lokalt. Logga in för att spara permanent."

Kostnad per gäst: ≈ 1 gpt-4o-mini-anrop ≈ 0,02 kr. 36 gäster/kvartal → 0 kr i
praktiken; 10 000 gäster → ~200 kr.

### Proffs-varianten (skiva 2)

Proffsens överskott är **offerten**: "beskriv jobbet → färdig offert med ROT
på 60 sekunder". Offertskapande är `allowGuest={false}` i dag; en läs-bara
förhandsvisning ur samma utkast (E1 `calcLevel: 'suggest'`) är möjlig men ett
större bygge. Hemägar-planen först, för motorn finns redan gäst-anpassad.

## VAR det bor (UI)

1. **Landningssidans hero.** Sekundär-CTA:n "Se demoprojekt" (1,8 %) ersätts av
   själva dörren: ett fält *"Vad ska du renovera?"* + sex boxar (Kök, Badrum,
   Måla om, Golv, El, Hela lägenheten). Submit → gästläge tyst → planen. Inga
   tre klick före värdet (i dag: rollmodal → språksteg → val). `RenaidaLive`
   bredvid är "visa", fältet är "gör". Mobil-först: boxarna är tumvänliga,
   beskrivningen kan dikteras (röst finns).
2. **Slutet av wizarden.** `GuidedSetupWizard`:s `submitted`-vy blir planen —
   inte "Projekt skapat" + tur. Turen flyttas till efter första riktiga
   handlingen, eller tas bort för gäster.
3. **Gästprojektets översikt.** Ett "Din plan"-kort överst i
   `GuestPlanningSection`, så resa 4 (som kom tillbaka två dagar senare)
   hittar tillbaka till värdet.
4. **Mapp-drop** ligger kvar som desktop-tillägg på planen: *"Har du redan
   offerter eller ritningar? Släpp mappen här"* → planen blir rikare. Inget
   nytt bygge — bara att det inte får gå sönder.

## Missbruks- och kostnadsgränser för anonyma flöden

Nuläge (verifierat i `supabase/config.toml` + funktionerna):

- `parse-renovation-description`, `renaida-suggest`, `renaida-critic`: rate-limit
  20/h/IP via `edge_rate_limits`. OK.
- **`classify-document`, `extract-document-text`, `transcribe-audio`,
  `process-document-v2`: `verify_jwt = true` släpper igenom anon-nyckeln
  (den är en giltig signerad JWT) och har INGEN rate-limit.** Gästens mapp-drop
  och röst går dit i dag. Ett skript med anon-nyckeln kan loopa
  gpt-4o-mini-anrop obegränsat. Liten kostnad per anrop, obegränsat antal.
- Rate-limit-koden är kopierad tre gånger (`checkRateLimit` i tre funktioner).

Åtgärd: `_shared/rateLimit.ts` (en implementation), applicerad på de fyra
öppna funktionerna med anon-tak (t.ex. 30 anrop/h/IP) och normalt tak för
inloggade; gäst-drop kapas klientside till 20 filer (i dag `MAX_FILES = 100`).

## Vad som medvetet INTE görs

- Inga serverrader för gäster (ingen anon-DB, inga temporära konton).
- Ingen "personlig demo" som klonar Villa Andersson med gästens namn — fejkad
  personifiering läcker igenom på sekunder.
- Ingen LLM-skriven plan i löptext — hallucinerade priser är värre än inga.
- Ingen e-postfångst före värdet.
- Ingen ny mapp-drop-funktionalitet.

## Mätning

Nytt event `guest_plan_shown` (+ `guest_plan_cta_clicked`). Tratt: plan visad →
konto. Baslinje: 0/36. Mål för första FB-inlägget efter leverans: >10 % av
dem som ser planen skapar konto. Rage-klicken på rumschips (2 av 5 resor) mäts
separat — kan vara en mobil-bugg i `RoomsStep`.

## Backlog-kort

`gast-planen-som-saljartefakt` (P1), `anon-edge-rate-limit-svep` (P2),
`gast-offert-forhandsvisning-proffs` (P3), `wizard-rumschips-rageclick-mobil` (P3).

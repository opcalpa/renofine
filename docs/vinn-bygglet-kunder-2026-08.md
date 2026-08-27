# Att vinna Bygglets kunder — och behålla dem

*Fable-analys 2026-08-27. Underlag: webbresearch om Bygglet/SmartCraft (Q2-rapport
publicerad samma dag), två kodverifieringar av Renofine (kontorsresan, fältresan) med
fil:rad för varje påstående, och databasens nuläge. Ingenting här vilar på vad Renofine
påstås ha. Uppdaterar och ersätter gap-tabellen i minnet från 2026-04-28.*

## Slutsatsen i fyra meningar

1. **Bygglet går inte att slå på funktioner.** Deras app fungerar (4,4/5 på iOS, 316 betyg),
   de har allt kontoret behöver, och varje beröm de får handlar om *människorna*: support,
   utbildning, lyhördhet. Det är deras vallgrav.
2. **Bygglet går att slå på affären.** Andra kontorsplatsen kostar +959 kr/mån ("rena rama
   rånet", 1★), 12 månaders bindning, +10–12 % pris på ett år, bokförings- och löne-
   integration som *betalda* tillägg, ingen ukrainska (offentligt begärt 2024, avvisat),
   ingen inloggningsfri väg för underentreprenörer (229 kr/mån per partner). SmartCrafts
   egna siffror: nettoretention **negativ** — befintliga kunder nedgraderar. Ingen i
   marknaden kör "byt från Bygglet". Dörren står öppen.
3. **Renofine kan i dag KROKA en Bygglet-kund men inte BEHÅLLA en.** Kroken finns och är
   verifierad: röstrapport på två tryck, tio språk, fältfolk utan platser. Men månads-
   skiftet stänger inte: timmar blir aldrig faktura, moms sparas aldrig, ingen fil når
   revisorn (SIE4 finns men är onåbar, PAXml ger en tom fil med grön toast). Den som
   måste behålla Bygglet för *en* sak betalar dubbelt, och den som betalar dubbelt
   stannar hos den som har historiken.
4. **Ordningen är därför: trovärdighet → kontorets månadsskifte → fältets vardag → pilot.**
   Inte tvärtom. Fältet är redan bättre än det behöver vara för en pilot; kontoret är
   det som avgör om de stannar.

## Vem byter, och när

En Bygglet-kund byter inte för att ett annat verktyg är bättre. Hen byter vid en **utlösare**:

| Utlösare | Varför just då | Vad vi måste kunna säga |
|---|---|---|
| **Förnyelsedatum** (12 mån, sen 3 mån) | Enda stunden utan straff | "Kör ditt nästa projekt hos oss parallellt de sista 3 månaderna" |
| **Andra kontorspersonen** behövs | +959 kr/mån på Bas, +1 879 på Total | "Kontorsplatser kostar inte hundralappar per huvud" |
| **En polsk/ukrainsk anställd** | Bygglet: 6 språk, ingen ukrainska, alla externa = betald plats | "Skicka en länk. Klart. Inget konto, ingen plats, hens språk" |
| **Prishöjningsbrevet** | +10–12 % 2025→2026, ny fältlicens Q2 2026 | "Ingen bindning. Månad för månad." |
| **Nedgraderingsimpulsen** | SmartCraft: kunder "mer priskänsliga, nedgraderar" | Fånga dem på väg NER, inte ut |

**Bytet ser aldrig ut som "flytta allt".** Det ser ut som: nästa projekt startas i Renofine,
Bygglet lever kvar tills de pågående stängts. Det betyder att importen som behövs är
*liten*: kundregister + artiklar/prislista + personal. Inte projekthistorik. Och eftersom
Bygglet **inte har någon dokumenterad CSV-export** (kunden ska "själv ta ut sin data",
radering kostar) blir importen i praktiken *klistra in från Excel/skärm* — eller att Carl
gör den åt de första tio firmorna, som Fieldly gör gratis på en vecka.

## Två köpare, två prov

**Kontorspersonen** jämför. Hen har kört Bygglet i åratal, vet exakt vad tidrapport, ÄTA
och faktura är, och bytets arbete landar på *hens* bord. Hen kollar paritet i det hen gör
*varje vecka*. En sak som saknas = hen behåller Bygglet för den saken = dubbelbetalning =
Bygglet vinner vid förnyelsen.

**Fältarbetaren** väljer inte, men kan lägga in veto genom att inte använda. Hens mått är
*hastighet*: är det snabbare att bli klar med dagens admin än i Bygglets app? Vinner vi
fältet men förlorar kontoret sägs vi upp vid förnyelse. Vinner vi kontoret men förlorar
fältet saboteras vi med "grabbarna använder det inte".

Bevisordningen i en pilot: **fältet först** (synligt inom en dag), **kontorets paritet inom
första månadsskiftet**.

## Kontoret — kroken (första kvarten) — verifierad status

| Måste vara sant | Status | Bevis / lucka |
|---|---|---|
| Första skärmen ljuger inte | ❌ **LJUGER** | Onboarding-checklistan lovar "Importera kundregister — CSV" och "Fortnox, Visma eller Bokio — fakturor flödar automatiskt" (`ContractorStart.tsx:169-186`). **Ingen av dem finns.** Det är det FÖRSTA en kontorsperson läser. |
| Snabbvalet i onboardingen fungerar | ❌ bugg | `Projects.tsx:489` saknar guard — proffsens val sväljs, de landar på ContractorStart ändå |
| Kundregister | ⚠️ | Finns, återanvänds över projekt. Men inget org.nr, ingen kundväljare vid projektskapande, och "Hantera kundregister" länkar till `/contractor/clients` som **inte finns** (404) |
| Offert med ROT, PDF, skicka | ✅ | `CreateQuoteV2`, `quotePdfService`, per-rad ROT |
| Kunden ser offerten utan konto | ❌ | RLS kräver `authenticated`; att skicka en offert skickar en *kontoinbjudan*. ÄTA-flödet gör det rätt (token, `/ata/:token`) — offerten gör det fel |
| Artiklar / prislista / mallar | ❌ | Noll träffar på `price_list`/`articles`. En firma som offererar samma 20 jobb kan inte spara ett enda à-pris. Offert kräver dessutom projekt — ingen lead-först |
| Bjud in personal en gång | ❌ | **Ingen firma-entitet finns.** Allt är `project_shares` per projekt: en anställd i en 10-projektsfirma = 10 inbjudningar. Ingen "min personal"-skärm |

## Kontoret — stanna (första månadsskiftet) — verifierad status

| Måste vara sant | Status | Bevis / lucka |
|---|---|---|
| Timmar → faktura | ❌ | `CreateInvoiceV2` har noll referenser till `time_entries`/`purchase_orders`. Registrerad tid är bokföring för sin egen skull |
| Godkänd ÄTA → faktura | ❌ | `ata_status` har tre referenser: skriv, visa, skriv. Inget konsumerar den |
| Moms är verklig | ❌ | Räknas som `subtotal * 0.25` vid rendering, **sparas aldrig** — offert, faktura, inköp. Ingen 12/6/0 %, ingen **omvänd byggmoms** (noll träffar) — som det mesta B2B-byggfakturering kräver |
| Revisorn får en fil | ❌ | SIE4 implementerad (`sieExportService.ts`, riktiga BAS-konton) — enda anroparen `InvoiceListSection` är **död kod**. PAXml nåbar men **trasig**: `profiles.user_id` matchas mot `profiles.id` ⇒ tom fil + grön "klart"-toast. Ingen Fortnox/Visma-kod. Ingen CSV-export av något |
| Kvitton attesteras | ⚠️ | Foto→tolkning→PO fungerar. Momsen läses ut, visas, **kastas vid spar**. Inget attest-steg. `suppliers`-tabellen används aldrig |
| Veckosumma per person | ❌ | Veckogruppering finns, men ingen per-person-summa någonstans; token-arbetares rader visas som "–" |
| Portföljen visar verkliga siffror | ⚠️ | Finns, men vinsten är *estimat* (`useProjectsData.ts:129` läser aldrig `time_entries`) |
| Personalliggare | ⚠️ | Tabellen finns, `/checkin` är routad — **inget länkar dit, inget läser den**. Modulväxlarna `attendance`/`payroll_export` styr inget |

## Fältet — kroken (första dagen) — verifierad status

| Måste vara sant | Status | Bevis / lucka |
|---|---|---|
| Får länken utan att ägaren står bredvid | ⚠️ | Utskick är manuellt (urklipp/`sms:`/`mailto:`/`wa.me`). `send-worker-sms` (46elks, 10 språk) finns och är **död kod** — noll anropare |
| Förstår jobbet på sitt språk | ⚠️ | Tio språk, cachade översättningar av arbeten/rum/objekt, ritning med rumsnamn — starkt. **Men:** `translate-task-content` körs bara vid inbjudan, för inbjudningsspråket. Byter arbetaren flagga till ett annat språk står arbetena kvar på svenska. *(Changelog-inlägget 26/8 "hela sidan byter" överdriver — rätta det.)* |
| Rapporterar snabbare än i Bygglet | ✅ | **Röst: 2 tryck** för "8 timmar, kaklet 70 %, behöver fem säckar fog". Skrivet: 9–11. Kvitto efter, Ångra 3 s. Inget formulär i någon app är så billigt |
| Inget kostar pengar av misstag | ✅ | Timmar/inköp landar ogodkända; frågor besvaras med ett tryck; svarstid mäts |

## Fältet — stanna (vecka två) — verifierad status

| Måste vara sant | Status | Bevis / lucka |
|---|---|---|
| Ser sina egna timmar, rättar gårdagen | ❌ | Noll läsning av `time_entries` i `worker/*`. Datum hårdkodat till i dag. Write-only |
| Fungerar i källaren | ❌ (avsiktligt) | `sw.js`: "Deliberately does NO caching/offline". Utan täckning: vit skärm. Bygglets app håller jobbet i handen |
| Har en ikon, får en påminnelse | ❌ | Install-bannern undertrycks på `/w/` (`App.tsx:85`), `start_url` är en inloggningssida, noll push-infrastruktur |
| Följer med personen mellan jobb | ❌ | En token = ett projekt. Nytt bygge = ny länk, inget följer med |
| **Ägaren på bygget** har samma snabba väg | ❌ | Komposeraren är token-låst. Inloggad ägare: Tid-fliken finns inte i mobilnavet (bara via `?tab=`), dialog med 8–10 tryck. Renaida-röst ~3 tryck är enda genvägen. **Ägaren får ett sämre verktyg än sin egen arbetare** — i en 2–5-mannafirma är ägaren på bygget |
| Byggaren rättar en felläsning i inkorgen | ⚠️ | Godkänn/neka/svara finns. Ingen inline-ändring av antal/timmar; ljudet sparas (`voice_url`) men kan inte spelas upp |

## Support-vallgraven — det Bygglet faktiskt har

Varje beröm Bygglet får: "svarar alltid", "pedagogiska", "lyssnade på vår kritik",
"lösningsorienterade". Gratis onboarding, utbildning och telefonsupport ingår i priset.
En kund som byter *till* oss från det förväntar sig samma. Med noll anställda matchas det så:

1. **Grundarens telefonnummer i appen** för de första 20 firmorna. På det här stadiet är det
   en funktion, inte en kostnad — och det är den enda support Bygglet inte kan erbjuda.
2. **Migrationen görs av Carl**, för hand, för de första tio. Fieldly gör "byt till oss" gratis
   på en vecka — det är marknadens enda bytessida, och den nämner inte Bygglet. Vår kan.
3. **Renaida som första linjen i appen** — mönstret finns redan; frågor om "hur gör jag X"
   ska kunna ställas där hen står.

## Prissättning — CRO-inferens, inte verifierat, ett beslut för Carl

Bygglets sår är kontorsplatserna. Vår modell bör därför vara **spegelvänd**: betala per
kontorsplats, **obegränsat fältfolk** (de har ändå inga konton), **ingen bindning**. En
2-adminfirma betalar Bygglet Bas + admin #2 = **2 438 kr/mån** ex moms plus 139 för
bokföringsfilen. Ett pris tydligt under det, med filen inkluderad, är berättelsen.
"Gratis" är fel signal till ett företag — det läses som "finns ni nästa år?". Gratis
under piloten, sen ett pris; säg det från dag ett.

## Vad vi INTE ska göra

- **Inte jaga paritet** på KMA, EDI, personalliggare-XML, factoring, artikelregister från
  fem grossister. Det är Bygglets hemmaplan och deras kunder köper det som tillägg.
- **Inte tävla i integrationer.** En SIE4-fil revisorn tar emot slår fyra API:er (redan
  beslutat i integrationsstrategin). Fortnox-API är fas två.
- **Inte sälja "AI"** till den här köparen. Sälj "timmarna kommer in av sig själva, på
  vilket språk som helst, utan att du köper platser".
- **Inte klona.** Bygglet är byggt för firmor med en kontorsperson. Vår köpare är
  2–5-mannafirman som inte har någon — och där ägaren står på bygget.

## Ordningen — verklighetsbaserad, med Fable/Opus-delning

### Fas 0 — Trovärdighet (dagar, Opus) — FÖRE allt utskick
Det här är sakerna som gör att en kontorsperson slutar lita på oss inom fem minuter.
- Ta bort (eller bygg) de två falska löftena i `ContractorStart.tsx` (CSV-import, Fortnox).
- Laga swallow-buggen `Projects.tsx:489`, 404-länken till `/contractor/clients`.
- Laga PAXml-buggen (id-mismatch → tom fil). En tom fil med grön toast är värre än ingen knapp.
- **Säkerhetshål:** `ata_approval_tokens` ger `anon` UPDATE på alla rader `USING (true)`
  (`20260428120000:48-58`). Stäng.
- Språkbytet: översätt arbetena on-demand när flaggan byts. Rätta changelog-inlägget.
- Koppla in `send-worker-sms` — död kod som löser "ägaren måste stå bredvid".

### Fas 1 — Kroken (1–2 veckor, Opus; datamodellen är Fable)
- **Firma-entiteten** (`companies` + `company_members`): uppströms allt — personal en gång,
  kundregister ägt av firman, "min personal". *Datamodellbeslutet är Fable-arbete.*
- **Samma komposerare för inloggad ägare.** Röst på två tryck ska gälla den som betalar.
- Arbetaren ser sina timmar och rättar gårdagen.
- Import: klistra in kunder + artiklar från Excel. Inte CSV-magi — en textarea som förstår
  tabbar. Det är vad Bygglet-kunden faktiskt har i handen.

### Fas 2 — Stanna (2–4 veckor, Opus; omvänd byggmoms-reglerna är Fable)
- **Moms sparad överallt** (offert, faktura, inköp) + 12/6/0 % + **omvänd byggmoms**.
  Detta låser upp SIE4, och det är det största enskilda blocket.
- Timmar + material + godkänd ÄTA som **fakturakällor**.
- SIE4 nåbar. Veckosumma per person. Artiklar/prislista + offert utan projekt.
- Offline-skal för `/w/` (visa jobbet utan täckning; köa rapporten).
- Inline-rättning i inkorgen + uppspelning av ljudet som redan sparas.

### Fas 3 — Beviset (pilot, Fable designar, Carl kör)
Tre Bygglet-firmor med förnyelse inom 3 månader. Ett nytt projekt var, parallellt med
Bygglet. Carl gör migrationen och ringer varje vecka. Mät fyra saker:
1. `field_report_sent` per arbetare och dag (använder fältet det?)
2. Dagar från sista timrad till skickad faktura (stänger månadsskiftet?)
3. Tog revisorn emot SIE-filen? (ja/nej — den enda binära frågan)
4. Sade de upp Bygglet vid förnyelsen? (det enda som räknas)

Saknad mätning att lägga till först: `worker_link_opened`, språkbyte, komposerare-avbrott.
I dag mäts bara det som skickades, inte hur många som öppnade och inte skickade.

## Fyra saker Carl behöver veta som ingen bad om

1. Två löften i proffs-onboardingen är **osanna** (CSV-import, Fortnox). Exakt fel publik.
2. Changelog-inlägget om språkbyte **överdriver** — arbetena byter inte språk med flaggan.
3. ÄTA-tokens har ett **RLS-hål** (anon UPDATE på allt).
4. PAXml-exporten säger "klart" och levererar **en tom fil**.

## Beslut som väntar på Carl
1. Prismodell: per kontorsplats + obegränsat fält + ingen bindning (rek.) / annat.
2. Firma-entitet nu (rek. — uppströms allt) / fortsätt per-projekt tills piloten kräver.
3. Pilotens form: 3 firmor, förnyelse inom 3 mån, Carl migrerar (rek.) / bredare utskick.
4. Fas 0 direkt (rek., innan någon Bygglet-kund ser appen) / hoppa till fas 1.

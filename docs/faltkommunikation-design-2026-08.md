# Fältkommunikation — bilden är meddelandet (design 2026-08-26)

Frågan Carl ställde: hur ska önskemål, förfrågningar och rapporter flöda från
BÅDE vanliga användare i appen och externa arbetare, när verkligheten på bygget
är språkbarriärer, korta Google Translate-meddelanden, mobilfoton som säger mer
än tusen halvfel ord, och liten tech-vana? Två vägar ska finnas samtidigt: den
ÖPPNA (dra in en bild till Renaida, få enkla följdfrågor som styr rätt) och den
STRUKTURERADE (knappar och fält som placerar saker rätt direkt).

## Vad som redan finns — och vad datan säger om det

Verifierat i kod + prod 2026-08-26.

**Ägarsidan har redan den öppna vägen.** Renaida tar emot ett foto och frågar
"Vad är det här?" med fem val: Utfört arbete · Önskat material ·
Uppdragsbeskrivning · Kvitto/faktura/offert · Planritning (`Renaida.tsx`).
Kvitto → inköpsorder (D1), röst → router. Det här ÄR mekaniken Carl beskriver,
byggd — för ägaren.

**Arbetarsidan har bara den strukturerade vägen, och den är fel form.**
Arbetaren (`/w/:token`, ingen inloggning, eget språk) kan per arbete: ta foto
(binärt *pågår/klart*), bocka checklista, skicka text/röst som blir en
kommentar (översätts åt ägaren vid läsning via `translate-comments`), och
fråga om ett ritningsobjekt. Tvärs över allt finns EN knapp: "Be om inköp" —
en dialog med **nio fält** (namn, antal, enhet, pris, leverantör, arbete,
beskrivning, datum, betalsätt, kvittofil).

**Datan:** 11 arbetartokens (9 sv, 1 uk, 1 pl), 10 har öppnats. Arbetarfoton:
5. Arbetarmeddelanden: 2 — och **båda hade en bild**. Inköpsförfrågningar:
**0, någonsin.** Nio-fälts-formuläret har aldrig använts en enda gång. De två
meddelanden som skickats bevisar Carls tes i miniatyr: arbetaren skickar en
bild, inte en text.

**Ägarens mottagning:** arbetarens foto landar i kommentarflödet på arbetet
med en vanlig notis. Det finns ingen "från fältet"-lista. 26 av 26
app-kommentarer står som olösta (`is_resolved=false`) — fältet finns men
används inte som signal.

## Diagnosen

Det saknas inte funktioner. Det saknas en **gemensam grammatik**: ett sätt
för en bild + ett tryck att betyda samma sak på båda sidor, i båda vägarna,
oavsett språk. I dag betyder ett foto "pågår eller klart" för arbetaren och
fem andra saker för ägaren, och en köpönskan kräver nio fält på ena sidan
och en moodboard på den andra.

## Grammatiken: fyra avsikter, formulerade som mottagarens skyldighet

Varje meddelande från fältet är **en bild + en avsikt**. Avsikten säger vad
mottagaren ska göra — det är det enda hen behöver veta:

| Avsikt | Ikon | Mottagaren ska | Landar som |
|---|---|---|---|
| **Klart** | ✅ | Inget — det är en rapport | foto `kind=after` på arbetet + framsteg |
| **Behöver** | 🛒 | Godkänna ett köp | `purchase_requests`-rad med bilden, i Inköp |
| **Fråga** | ❓ | Svara / besluta | kommentar `is_resolved=false` + notis som kräver svar |
| **Info** | 💬 | Läsa | kommentar, löst |

Fyra, inte tre: **Fråga** är den som oftast går förlorad i översättning
("det här röret, ok?") och den enda som BLOCKERAR arbetaren. Den får inte
drunkna i Övrigt.

Varför formulerade som skyldighet och inte som innehåll: arbetaren vet vad
hen vill ha av dig, men inte vad Renofine kallar det. "Vad ska jag göra med
den här?" är den fråga en byggare på en stege kan svara på med en tumme.

Språkoberoende genom **ikon + ordet på eget språk** (sju språk finns). Ikonen
är samma på båda sidor, så "🛒" betyder samma sak för en polsk målare och en
svensk projektledare — utan Google Translate.

## Bilden är ett alternativ, inte ett krav (Carls förtydligande 2026-08-26)

Bildkommunikation är ETT sätt att säga vad man vill — vid sidan av att bara
skriva det, i ett specifikt fält eller i en generell chatt. Grammatiken får
därför inte hänga på bilden. Den hänger på **avsikten**:

- **Input** = bild och/eller text och/eller röst. Vilken kombination som
  helst, inklusive bara "Kup 10 pędzli" utan bild.
- **Avsikten** sätts av arbetaren (fyra chips) eller härleds/frågas. Samma
  fyra oavsett om det kom en bild eller en rad text.
- **Följdfrågan "hur många?"** läser antal och produkt ur texten/rösten när
  det finns, ur bilden när det inte finns, och frågar när inget av dem räcker.
- **Ingen tvingad koppling till ett arbete.** Text som inte hör till ett
  arbete blir en projektnivå-kommentar (`comments.project_id` finns). Att
  tvinga fram ett arbete är ett formulär.

Konkret följd för UI:t: de fyra avsikts-chipsen sitter på **komposeraren**
(där text, röst och bild möts), inte bara på kameraknappen. Skriver man en
rad utan att välja chip går den som 💬 Info — och Renaida får föreslå
en annan avsikt om raden uppenbart är en fråga eller ett behov ("?" eller
"kup/köp/need/potrzebuję" → förslag, aldrig tyst omklassning).

## De två vägarna är samma väg

Den öppna vägen är **knappen du inte hittade**. Regeln:

> När input kommer in utan avsikt — bild, text eller röst — frågar Renaida
> EXAKT det fyrvalet som den strukturerade vyn visar som fyra knappar.
> Följdfrågorna är EXAKT de fält det strukturerade flödet skulle bett om —
> och bara de som inte går att härleda.

Så finns det bara en mekanik att lära, en att underhålla, och en att mäta.
Capture → föreslå → bekräfta, samma som allt annat i Renaida.

### Följdfrågeträdet (max djup 2, oftast 0)

```
Input kommer in (bild / text / röst, i valfri kombination)
│
├─ F1 (alltid, om avsikt saknas): "Vad är det här?"
│     [✅ Klart] [🛒 Behöver] [❓ Fråga] [💬 Info]
│
├─ F2 (BARA om det inte går att härleda): "Vilket arbete?"
│     chips = arbetarens tilldelade arbeten (oftast 1–5)
│     HOPPAS ÖVER när: man stod i ett arbetskort · bara ett arbete finns
│
└─ F3 (BARA för Behöver): "Hur många?"
      förifyllt ur bildtext/röst ("Kup 10" → 10), stor +/−, default 1
      Renaida läser bilden → produktnamn (EN modellutropning, rate-limitad)

Sedan EN rad på arbetarens språk: "Behöver: 10 × penslar → Kök"  [Skicka]
```

Ingen fritext krävs någonsin. Fritext (text eller röst) är valfri och
används bara som ledtråd till F3 och som bildtext. Aldrig ett formulär.

### Vad ägaren ser

Inte en chatt. Saken på rätt plats, med bilden, och **ett tryck att svara**:

- "Piotr behöver 10 × penslar (Kök)" + bild → **[Godkänn] [Nej] [Svara]**.
  Godkänn = `purchase_request` → PO, samma invariant som redan finns.
- "Piotr frågar (Badrum)" + bild → **[✓ Ja] [✗ Nej] [Svara]** + röst/text.
  Svaret översätts vid läsning; arbetaren ser ikon + ord.
- "Piotr: klart (Sovrum)" + bild → framsteg uppdaterat, ingen handling.

Och EN lista, **"Från fältet"**: olösta frågor + väntande köp. Byggaren är
flaskhalsen på varje bygge — listan är vad hen ska svara på innan lunch.

## Samma grammatik i alla tre relationerna

Det är styrkan: fyra avsikter täcker inte bara byggare⇄arbetare.

- **Hemägare → byggare:** "❓ är den här sprickan normal?" (bild), "🛒 vill
  ha det här kaklet" (bild → önskan → request i Inköp, samma rad som
  arbetarens köp — [[project_purchase_order_invariant]]).
- **Byggare → hemägare (kundvyn):** "✅ klart" (bild → framsteg i kundvyn),
  "❓ behöver beslut" (ÄTA/val).
- **Ägare → sig själv (Renaida):** dagens fem fotoval finns kvar för det som
  handlar om projektets *innehåll* (kvitto, ritning, uppdragsbeskrivning).
  Utfört arbete = Klart, Önskat material = Behöver. Samma nycklar under huven.

## Vad som medvetet INTE görs

- **Inget nytt kommunikationssystem, ingen chatt.** `comments`, `photos`,
  `purchase_requests` finns och räcker; `is_resolved` finns redan.
- **Ingen text krävs.** Aldrig ett obligatoriskt fritextfält i fält.
- **Inga modellanrop för Klart/Fråga/Info.** Bara Behöver läser bilden
  (produktnamn + antal). Översättning sker vid läsning, cachad.
- **Ingen app, ingen inloggning för arbetaren.** Token-länken är rätt — en
  URL i WhatsApp är den lägsta tröskel som finns.
- **Inte fler än fyra val.** Varje femte val är ett Google Translate-ord till.

## Skivor (för Opus, i ordning)

1. **Grammatiken i data** — `intent` (klart|behöver|fraga|info) på
   `comments`; mappning till `photos.kind` och `purchase_requests`. Liten
   migration, eller ingen om `is_resolved` + `kind` räcker (avgörs vid bygge).
2. **Arbetarvyn: en kameraknapp + fyrvalet** — global "📷" (öppna vägen) +
   fyra knappar per arbetskort (strukturerade). Följdfrågeträdet ovan.
   **Ersätter nio-fälts-dialogen** (0 användningar).
3. **Ägarens "Från fältet"** — lista över olösta frågor + väntande köp med
   ett-trycks-svar. Notis som kräver svar för ❓.
4. **Renaida-fotofrågan på ägarsidan** mappas till samma nycklar (Utfört
   arbete = Klart, Önskat material = Behöver → request-rad, inte bara
   moodboard).
5. **Mätning** — `field_message_sent {intent, has_text, language}`,
   `field_message_answered {intent, seconds_to_answer}`. Tid-till-svar är
   siffran som säger om byggaren faktiskt blev snabbare.

## Beslut — TAGNA av Carl 2026-08-26 (rekommendationerna gäller)

A. **Fyra avsikter**, med Fråga separat.
B. **Hemägarens "Önskat material" = samma request-rad** som arbetarens Behöver.
C. **Modellanrop för Behöver** — ett anrop, rate-limitat. Läser text/röst
   först, bilden när text saknas.
D. **Målaren testar det byggda flödet**, inte en hypotetisk fråga.
E. (Carls tillägg) **Bilden är ett alternativ till text** — grammatiken
   hänger på avsikten, inte på modaliteten. Se avsnittet ovan.

## Beslut, omgång 2 — TAGNA av Carl 2026-08-26 (efter S1+S2)

F. **Knappen heter "Behövs"** (sv) / "Needed" (en). "Behöver" hängde i luften
   som ett verb utan subjekt och läste som oöversatt "Need". Övriga språk är
   hela uttryck ("Potrzebuję", "Потрібно") och rörs inte. Nyckeln `behover`
   i koden är oförändrad. "Inköp" avvisat: förväxlas med att lämna kvitto på
   något man redan köpt.
G. **"Från fältet" är en sektion högst upp på Översikt**, synlig bara när
   något väntar, med notisen som leder dit. Ingen ny flik (13 flikar på
   desktop, 10 ikoner i mobilnavet redan; en tom flik slutar man öppna).
   Beställningar-pulskortet visar redan väntande köp — sektionen är
   fortsättningen på det.
H. **Arbetarmeddelanden är byggarens, dolda för kunden som standard.**
   Fynd: `comments.visible_to_client` är `true` som default och
   `worker-send-message` sätter det aldrig ⇒ en arbetares fråga syns i
   kundens flöde om kunden fått se Arbeten. Fix: arbetarmeddelanden skrivs
   med `visible_to_client=false`; byggaren vidarebefordrar kundens beslut
   (kakelval, ÄTA) med ett tryck — "Fråga kunden". Hemägaren som leder eget
   bygge är ägare och ser förstås allt.

---

## Omgång 3 — "Rapporten från dagen" (Fable-analys 2026-08-26, efter Carls test)

**Carls ståndpunkt (efter att ha testat som Piotr):** i WhatsApp säger en
hantverkare allt i ett andetag — läser instruktionen, lämnar status, anger
timmar, beställer material, ställer en fråga. "Vi låter dom fortsätta göra det
fast på ett mer strukturerat sätt. Vi tvingar dom inte att göra exakt EN i
taget i 3–4 separerade flöden — hur ska dom ens fatta det!?"

Han har rätt, och beslut A (fyra avsikter, en per meddelande) satte
sorteringen FÖRE sägandet. Det ska vara tvärtom.

### Grammatik v2: en rapport = fritt innehåll + valfria tillägg

- **Fritt:** text / röst / foto i valfri blandning. Ett av dem räcker.
- **Tillägg** (bockas i bara när det gäller): ✓ Klart · 📊 Status % ·
  ⏱ Timmar · 🛒 Beställ (produkt + antal).
- **Fråga/Info är aldrig knappar** — härleds ("?"/frågeord ⇒ `fraga`,
  mottagaren skyldig svar; annars `info`).
- **En sändning.** Servern (`worker-send-report`) delar upp i rader:
  `comments` (texten, `intent`=primär), `photos`, `materials`+`purchase_orders`,
  `time_entries`, `tasks.progress/status`. Alla rader bär `report_id`
  (ny tabell `field_reports`: token, task, rå text, ljud-URL, tolkning-JSON).

### Sändning: optimistisk, ingen bekräftelseruta

Efter Skicka: raden "Skickat: fråga · 10 × penslar · 8 h" + "Ändra".
Allt som kostar (inköp, timmar) godkänns av byggaren ändå ⇒ feltolkning
stoppas där. Ett bekräftelsesteg hos arbetaren = de två processerna Carl
inte vill ha.

### Röst = text, samma väg

**Lucka idag:** röst sparas rått som "🎤 <url>"-kommentar. Byggaren får en
ljudfil, ingen text, ingen översättning (`transcribe-audio` kräver
inloggad användare). Ny väg: `worker-send-report` transkriberar server-side
(intern anropsväg för token, rate-limitat per token) och kör texten genom
SAMMA tolk. Renaida = tolken (agentic-strategin: capture→gör→visa).

### Tolken: deterministiskt först, ett modellanrop max

Regex: timmar (`8 h|tim|godz|год|ore`, "2 man × 8 h" ⇒ 16 h + not), procent,
`parseNeed` (antal+produkt), frågetecken. Modell bara när texten bär mer än
regexen fångar, eller vid röst. `_shared/rateLimit` finns.

### Timmar (Carl: "alltid extremt centralt") — saknar ALLT idag

`time_entries.user_id NOT NULL` ⇒ arbetare utan konto har ingen väg.
Förslag: `worker_token_id uuid NULL` + `user_id` nullable + CHECK (exakt en),
`approved=false` för fältet. Per DAG, arbete om härledbart. Byggaren
godkänner i Från fältet som inköp; godkända timmar in i tidrapporten som
befintliga. Attribution = token (person), inte ägarens id.

### Status

Fritt % skriver `tasks.progress`; checklistan består som sanning för VAD.
100 % eller ✓ Klart ⇒ `awaiting_review` (som nu).

### Inkorgen v2: ett kort per rapport

Foto, översatt text, en åtgärdsrad per del som kräver byggaren:
[Godkänn 10 × penslar] [Godkänn 8 h] [Ja · Nej · Svara]. Delar utan åtgärd
(klart, info, %) = fakta i kortet. Kortet försvinner när allt är taget.
Filter: Allt · Frågor · Inköp · Timmar.

### Kvittens

Välkomstkortet får "✓ Förstått" ⇒ `worker_access_tokens.acknowledged_at`.
Byggaren ser "öppnade 07:02 · bekräftade 07:03" i Team. Inte blockerande.

### Gårdagens chips

Klart ⇒ tillägg. Behövs ⇒ Beställ-tillägget. Fråga/Info ⇒ härledda
etiketter, inga knappar. `comments.intent`, `visible_to_client`,
Från fältet-ytan och godkänn-vägarna återanvänds. S1–S3 = grunden.

### Skivor (Opus)

- **S6** `field_reports` + tolk (`lib/fieldReport.ts`, deterministisk +
  modell-fallback) + `worker-send-report` inkl. röst-transkribering +
  `time_entries.worker_token_id`.
- **S7** Komposerare v2: ett fält, mic/kamera, fyra tillägg, optimistisk
  sändning med "Skickat: …"-rad + Ändra.
- **S8** Inkorg v2: kort per rapport, timmar-godkännande, Timmar-filter.
- **S9** Kvittens + mätning (`field_report_sent {parts}`,
  `field_report_answered {seconds}`).

### Beslut som väntar på Carl (se nedan när tagna)
1. Bekräftelse efter (rekommenderat) / före / ingen.
2. Timmar per dag med valfritt arbete (rekommenderat) / per arbete / bara dag.
3. Ett kort per rapport (rekommenderat) / ett per del.
4. Kvittens "Förstått"-knapp (rekommenderat) / första bocken / ingen.

### Beslut omgång 3 — TAGNA av Carl 2026-08-26 (rekommendationerna gäller)

I. **Bekräftelse EFTER sändning** med "Skickat: …"-rad + Ändra. Aldrig en
   ruta före. Pengar godkänns av byggaren.
J. **Timmar per dag, arbete om härledbart.** "2 man 8 h" = 16 h + not.
   `time_entries.worker_token_id`, ogodkända tills byggaren säger ja.
K. **Ett kort per rapport** i Från fältet, en åtgärdsrad per del.
L. **"Förstått"-knapp** på välkomstkortet ⇒ `acknowledged_at`. Blockerar inget.

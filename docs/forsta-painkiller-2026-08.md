# Vår första painkiller — analys

*2026-08-28. Frågan: vad kan Renofines första smärtstillande vara — i appen eller inte —
givet vilka Carl faktiskt kan nå och få att känna igen smärtan i ett samtal?
Underlag: databasen 2026-08-28, `docs/vitamin-eller-smartstillande-2026-08.md`,
Bygglet-analysen, Circura-strategin, de tre proffsen som skapat konto.*

---

## Fem krav på en första painkiller

En smärta är inte en painkiller bara för att den är verklig. Den måste också gå att
**sälja in med ett samtal och bevisa med ett projekt.** Därför fem krav, och en kandidat
som fallerar på något av dem är inte först — hur riktig den än är.

1. **Pengar, inte tid.** "Sparar en timme" är vitamin. "Du fick inte betalt" är smärta.
   Tid glöms; pengar räknas.
2. **Återkommer varje månad.** Engångssmärta byter man inte verktyg för.
3. **Känns igen på EN fråga.** Om smärtan måste förklaras är den inte ond nog.
4. **Beror inte på att någon annan ändrar beteende.** Kräver den att fältfolket börjar
   använda en app har den en tredje part som kan lägga in veto — och den är obevisad.
5. **Går att nå och demonstrera på två minuter** hos människor Carl faktiskt kan ringa.

---

## Kandidaterna mot kraven

| Kandidat | Pengar | Månadsvis | En fråga | Ingen tredje part | Nåbar & demobar | Dom |
|---|---|---|---|---|---|---|
| **Läckaget** — gjort/köpt men aldrig fakturerat | ✅ direkt | ✅ | ✅ | ✅ (ägarens egna) | ✅ byggt sedan i går | **Först** |
| Obetald ÄTA — tillägg utan skriftligt ja | ✅ | ~ (per jobb) | ✅ visceral | ⚠️ kunden måste svara | ✅ token-flöde finns | Andra |
| Kvittokaoset — skokartongen, momsen | ✅ (moms ~20 %) | ✅ | ✅ | ✅ | ✅ | Del av läckaget |
| Timjakten — jaga arbetarnas timmar på fredag | ✅ | ✅ | ✅ | ❌ kräver fältet | ⚠️ 2 rapporter totalt | Tredje, efter fälttestet |
| Språkgapet — omarbete efter missförstånd | ~ svårt att belägga | ⚠️ episodisk | ❌ "Translate funkar" | ❌ | ⚠️ | Inte först |
| Offertkvällen | ⚠️ tid | ✅ | ✅ | ✅ | ✅ | Utbytbar (Word-mallen) |
| Momsdeklarationen / SIE till revisorn | ✅ | ✅ | ⚠️ | ✅ | ❌ köparen är revisorn | Inte först |
| Kundens "hur går det?" | ❌ | ✅ | ✅ | ✅ | ✅ | Vitamin för betalaren |

---

## Svaret: läckaget — det du gjorde och köpte men aldrig fick betalt för

Varje liten firma läcker pengar mellan *gjort* och *fakturerat*. Kvittot från Bauhaus på
vägen till jobbet som aldrig hamnade på kundens faktura. De två extra timmarna på fredagen
som glömdes till måndag. Materialet som köptes "till Anderssons" och bokfördes som kostnad
men aldrig vidarefakturerades med påslag. Ingen enskild post är stor. Summan över en månad
är det — och den är osynlig, för ingen räknar det man glömde.

**Igenkänningsfrågan** — ställ den och håll tyst:
> *"Hur mycket tror du att du gjorde eller köpte förra månaden som aldrig hamnade på en
> faktura?"*

En firmaägare svarar inte "inget". Hen svarar med en paus, sedan en siffra, sedan ett
exempel. Pausen är beviset. Kommer det snabbt "äh, jag har koll" — då är det inte hens
smärta, och det är också ett svar.

### Varför just den, mot kraven
- **Pengar.** En 2–3-mannafirma med 800 kr/tim som missar 2–4 timmar i veckan plus ett
  par kvitton läcker i storleksordningen 10 000–20 000 kr i månaden. Låt *dem* säga
  siffran; den är alltid större än de trodde.
- **Varje månad.** Det är månadsskiftets smärta, inte projektets.
- **En fråga.** Se ovan.
- **Ingen tredje part.** Det är *ägarens egna* kvitton och *ägarens egna* timmar — i en
  2–5-mannafirma står ägaren själv på bygget. Arbetarnas timmar är nästa våg, inte första.
- **Byggt end-to-end sedan 2026-08-27.** Fota kvittot → inköpsorder med moms → "Hämta från
  projektet" i fakturan → raden med påslag. Egna timmar → godkända direkt → fakturarad.
  Röret finns. Det som saknas är att smärtan *syns* (nedan).

### Det ska sägas rakt ut: kvittotolkningen är läckagets *ingång*, inte painkillern
Bygglet tar 3 kr per skannat kvitto och firmor betalar. Men skanningen i sig sparar tid
(vitamin). Det som gör ont är när det skannade kvittot **ändå** inte hamnar på fakturan.
Vår berättelse är inte "vi skannar kvitton" — det gör alla. Den är "**ingenting du köpt
till kundens jobb försvinner mellan kvittot och fakturan**". Det är skillnaden mellan att
konkurrera med Bygglet och att ha något de inte säger.

---

## Vad som finns — och vad som borde finnas för att smärtan ska synas

**Finns (verifierat mot koden):**
- Kvitto → inköpsorder med moms per rad och sats (fas 2, steg 1).
- Egna timmar med två tryck, godkända direkt (fas 1).
- "Hämta från projektet" i fakturaskaparen: godkända timmar, material med påslag, godkänd
  ÄTA — med dubbelfaktureringsspärr i databasen (fas 2, steg 5).
- `BuilderSummaryCards.unbilledTotal` — **men observera: det mäter *offertens rest*
  (kontraktssumma minus fakturerat), inte läckaget.** Läckaget är det som ligger *utanför*
  eller *utöver* offerten. Två olika saker; den vi behöver finns inte.

**Saknas — och detta är en HYPOTES att pröva i samtal, inte ett kort att bygga:**
- Summan syns ingenstans utanför fakturaskaparen. Ingen firmaägare öppnar "Ny faktura" för
  att upptäcka att hen har 4 320 kr ofakturerat — hen måste *veta* det innan hen öppnar.
  Smärtstillande som bara verkar när man redan letar är vitamin i praktiken.
- Ingen knuff i stunden: "Du köpte för 2 340 kr på Bauhaus i tisdags — till Anderssons?
  Ska det på fakturan?" Det är där läckan uppstår, och det är där den stoppas.

Båda är billiga att bygga och **ska inte byggas ännu.** De ska ritas på ett papper och
visas i samtal nummer 3–10. Reagerar folk med "kan den visa det?" är det ett kort.
Reagerar de med en axelryckning var det vår idé, inte deras smärta.

---

## Vilka du kan nå — och vilken kant av smärtan var och en känner

I ordning efter hur nära de är och hur väl smärtan matchar. Varmast först.

### 1. Proffset som gjorde allt på en kväll och försvann *(ring i dag)*
Ett av de tre proffskontona (skapat 6 juli, senast inloggad 6 juli): **1 offert, 3 inköp,
12 arbeten** — på en session. Hen provade exakt offert-till-inköp-kedjan och slutade. Ingen
annan användare har någonsin rört så många delar av just den kedjan. Öppning: *"Du la in tre
inköp och en offert på en kväll i juli och kom sedan inte tillbaka. Jag vill förstå vad du
letade efter — och vad som saknades."* Det ena samtalet är värt mer än tio kalla.

### 2. De två andra proffsen och de åtta hemägarna
De tio övriga externa. Proffsen får läckagefrågan; hemägarna får en kontrollfråga —
*"Fick du en faktura som inte stämde med offerten?"* — för hemägaren är läckagets andra
sida (tilläggen som dyker upp oförklarade). Om hemägarna känner igen *den* smärtan är det
ett argument för ÄTA som painkiller nummer två.

### 3. Byggvaruhusets proffsdisk, sjutiden på morgonen
Det bästa in-situ-testet som finns: **kvittot är bokstavligen i handen.** Frågan är en
enda: *"Hamnar det där kvittot på kundens faktura?"* Fem minuter, inget bokat möte, och
svaret kommer utan filter. Tre morgnar ger tio samtal.

### 4. Bygglets publicerade kundcase
De betalar redan 3 kr per skannat kvitto — de har *erkänt* smärtan med plånboken. Frågan
till dem är nästa steg i kedjan: *"Hur mycket av det ni skannar hamnar faktiskt på
kundfakturan?"* Om svaret är "det håller kontoret koll på" har de en kontorsperson och är
inte vår köpare. Om det blir tyst — då är det vår kund som betalar Bygglet i dag.

### 5. Circura, via Mila — samma smärta, fel första test
Milas ord: *"AI kan skjuta folk till rymden men inte göra min bokföring smidigare."* Det
är läckaget på koncernnivå: 47 dotterbolag vars kvitton når Visma sent, ostrukturerat och
manuellt. **Rätt smärta, rätt positionering ("lagret mellan fältet och Visma") — men
köparen är inte användaren.** Mila sitter på ekonomi; den som läcker står på bygget.
Circura är samtal fem, inte samtal ett: gå dit med tre firmaägares ord i fickan, inte med
en hypotes.

### 6. Facebook-hantverkargrupperna — ställ frågan, inte produkten
Inlägg: *"Ärlig fråga till er som driver eget: hur mycket missade ni att fakturera förra
månaden? Kvitton, extratimmar, material till kundens jobb…"* Inget om Renofine. Tråden
**är** researchen — och varje svar är ett samtal att boka.

### Lägre prioritet
- **LeadMe** — konsultmodell; deras smärta är samordning, inte läckage. Rätt kontakt för
  hemägarsidan, fel för den här painkillern.
- **Egna bekanta** — snabbast att boka, farligast att lita på. Väg lägre.

---

## Vad som INTE är första painkiller, och varför

- **Röstrapporten** — den enda äkta differentieringen, och **helt obevisad** (2 rapporter i
  databasen). Den kräver att fältfolk ändrar beteende, vilket är krav 4:s definition av en
  tredje part. Den blir painkiller nummer tre den dag en främmande hantverkare skickat en
  rapport. Inte före.
- **Språket** — smärtan är riktig men episodisk, och svaret i ett samtal är "Google
  Translate funkar". En painkiller som kunden inte känner igen är en vitamin med bra
  argument.
- **SIE/moms** — byggt, riktigt, och köparen är revisorn. Firmaägaren känner det som
  revisorns faktura, inte som egen smärta.
- **Offerten** — obligatoriskt arbete, men Word-mallen från 2014 fungerar. Hög
  bytesbenägenhet åt båda hållen. Det som binder är historiken, inte offerten.
- **Hela hemägarsidan** — engångssmärta. Renoveringen tar slut, och med den behovet.

---

## Testet — konkret, nästa tio samtal

1. Ställ igenkänningsfrågan i varje samtal, i minut 8–14, **före** produkten.
2. Logga tre saker: sa hen en siffra oombedd? Gav hen ett exempel? Frågade hen "kan den
   visa det?" när pappersskissen "Ofakturerat sedan sist: 4 320 kr" visades?
3. **Stoppregel, nedskriven nu:** om färre än 3 av 10 säger en siffra oombedd är läckaget
   inte painkillern. Då går vi till **obetald ÄTA** (kandidat två) med samma metod — och
   vitamin-dokumentet uppdateras med utfallet.
4. Om ≥5 av 10 säger en siffra: **då** blir "summan som syns" och "knuffen i stunden"
   backlog-kort — med tio citat som skäl, inte en analys.

> Det viktigaste med den här analysen är inte att den pekar på läckaget. Det är att den
> kan ha fel, och att vi vet efter tio samtal.

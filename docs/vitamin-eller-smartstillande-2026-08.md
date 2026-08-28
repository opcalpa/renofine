# Vitamin eller smärtstillande? — en ärlig etikett per flöde

*2026-08-28, på uppdrag ur `docs/anvandarfeedback-thor-2026-08-26.md`.
Testet är Thors: **vad är alternativet till appen, hur lätt byter kunden om den
försvinner i morgon, och hur ont gör det?** Litet svar = vitamin.*

*Bedömningarna nedan är gjorda mot koden och mot databasen, inte mot ambitionen.
Där ett flöde saknar användning står det, för ett obevisat smärtstillande är en
hypotes — inte en egenskap.*

---

## Sammanfattningen först

| Flöde | Etikett | Bevisad användning |
|---|---|---|
| Kvitto- och fakturatolkning | **Smärtstillande** | 75 inköpsordrar, nästan alla Carls |
| Månadsskiftet (moms, timmar→faktura, SIE4) | **Smärtstillande, obevisat** | 0 externa |
| Röstrapport från fältet, tio språk | **Smärtstillande, obevisat** | 2 rapporter totalt |
| Offert med ROT | **Svagt smärtstillande** | 17 offerter, nästan alla Carls |
| "Från fältet" — byggarens inkorg | **Vitamin** (i dag) | 0 externa |
| Gästens plan | **Vitamin, i säljande syfte** | 36 gäster, 0 konton |
| Planritning / canvas | **Vitamin** | — |
| Projekt, rum, uppgifter | **Vitamin** | 12 externa projekt |

**Den obekväma raden:** de tre starkaste smärtstillande flödena är byggda för en
kund vi ännu inte träffat, och de åtta personer vi faktiskt har träffat är
hemägare som fått vitaminer. Vi har alltså byggt rätt sorts sak åt fel sorts
person — eller åt rätt person i fel ordning, vilket är samma problem.

---

## Flöde för flöde

### Kvitto- och fakturatolkning → inköpsorder
**Smärtstillande.** Det starkaste vi har, och det enda med ett externt prisbevis:
Bygglet tar betalt **3 kr per skannat kvitto**, och kunder betalar det. Någon
annan tar alltså redan betalt för exakt den här smärtan, vilket är den bästa
sortens validering som finns utan egna kunder.

Alternativet i dag är en skokartong och en kväll i månaden. Försvann funktionen
skulle en firma märka det direkt vid nästa månadsskifte.

*Förbehåll:* de 75 inköpsordrarna i databasen är i allt väsentligt Carls egna.
Smärtan är belagd i marknaden, inte hos våra användare.

### Månadsskiftet: moms, timmar→faktura, SIE4
**Smärtstillande på papperet — obevisat i verkligheten.** Levererat 2026-08-27
(fas 2 av Bygglet-epicen). Momsen sparas per sats, omvänd byggmoms går att
fakturera, godkända timmar och ÄTA blir fakturarader, SIE-filen når revisorn.

Det är arbete som **måste** göras varje månad, av lag. Det är definitionen av
smärtstillande — men bara för den som redan har timmar och kvitton i systemet.
För en firma som inte lagt in något är det noll värde, och **noll externa har
använt något av det**.

*Ärlig läsning:* det här byggdes före den första kunden. Det var rätt sak att
bygga *om* proffs är valet, och kastade pengar om hemägare är det. Just det
valet är fortfarande öppet, vilket är hela poängen med briefen.

### Röstrapport från fältet, tio språk
**Smärtstillande, obevisat — och den enda äkta differentieringen.** Ingen
konkurrent har inloggningsfri röstrapport på ukrainska. Bygglet har sex språk,
ingen ukrainska, och tar 229 kr/mån per extern part.

Men: **12 arbetarlänkar skapade, 2 fältrapporter i hela databasen, 6 timrader.**
Ingen främmande hantverkare har någonsin skickat en rapport. Det är en
välbyggd hypotes, inte ett bevisat värde.

*Detta är det flöde som mest brådskande behöver ett riktigt test* — och det
kräver en hantverkare, inte en rad kod till.

### Offert med ROT
**Svagt smärtstillande.** Att skriva offerter är obligatoriskt arbete och
ROT-räkningen är lätt att göra fel. Men alternativen är många och gratis:
Bygglet, Fortnox, en Word-mall som fungerat i tio år. Bytesbenägenheten är
alltså **hög i båda riktningarna** — smärtan är verklig, men vår lösning är
utbytbar.

Att en firma skriver sin offert hos oss är inte samma sak som att den stannar.
Det som binder är historiken: kunder, priser, avslutade jobb.

### "Från fältet" — byggarens inkorg
**Vitamin i dag, potentiellt smärtstillande sedan.** Kortet är välbyggt, men det
löser ett problem som uppstår först när fältet faktiskt rapporterar. Med två
rapporter i databasen finns inte problemet ännu.

Ett flöde som förutsätter ett annat obevisat flöde ärver dess osäkerhet — och
ska prioriteras därefter.

### Gästens plan
**Vitamin, men i säljande syfte** — den ska inte lindra smärta, den ska få någon
att skapa konto. Bedöms därför på konvertering, inte på nytta.

Mätningen före ombyggnaden: **36 gäster gjorde hela personifieringen, 0 skapade
konto.** Efter ombyggnaden (2026-08-26) finns ingen mätning ännu. Att den siffran
fortfarande är okänd är i sig ett argument för att sluta bygga och börja mäta.

### Planritning och canvas
**Vitamin.** Det största enskilda bygget i kodbasen, och ingen firma förlorar en
krona om det försvinner i morgon. Det är imponerande, det gör demon vacker, och
det är inte varför någon betalar.

Sagt rakt ut eftersom det är den dyraste raden i den här tabellen.

### Projekt, rum, uppgifter
**Vitamin.** Grundplattan som allt annat står på, men i sig utbytbar mot en
delad anteckning. Tolv externa projekt finns, ett enda konto har loggat in
senaste trettio dagarna.

---

## Vad bedömningen betyder för prioriteringen

1. **Det som är starkast bevisat (kvittotolkning) är också det billigaste att
   sälja in** — smärtan är konkret, alternativet är en skokartong, och en
   konkurrent tar redan betalt per kvitto. Det är den funktion ett första samtal
   ska handla om, inte offerten och absolut inte planritningen.

2. **Det som är mest differentierat (röstrapporten) är helt obevisat.** Den ska
   testas med en riktig hantverkare innan en enda rad till skrivs omkring den.
   Ett test kostar en eftermiddag; att bygga vidare på en obevisad premiss
   kostar månader.

3. **Månadsskiftet är färdigbyggt och väntar på sin första firma.** Det är ett
   argument för att välja proffs — inte för att bygga mer åt dem. Maskineriet
   finns; det som saknas är en människa som stoppar in något i det.

4. **Planritningen ska inte utvecklas vidare** förrän någon betalar för något
   annat. Den är färdig nog för en demo, och demon är inte flaskhalsen.

> **Testet att ta med in i varje samtal:** *"Om Renofine försvann i morgon —
> vad skulle du göra i stället?"* Kommer svaret snabbt och konkret har vi hittat
> en vitamin. Blir det tyst i fyra sekunder har vi hittat något att bygga vidare på.

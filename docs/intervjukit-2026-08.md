# Intervjukit — tio samtal i veckan

*Skapat 2026-08-28 efter rådgivningssamtalet med Thor Olof Philogène
(`docs/anvandarfeedback-thor-2026-08-26.md`). Syftet är att göra det dyraste rådet
— "sluta koda, prata med tio i veckan" — så billigt att utföra att det inte går
att skjuta upp. Allt här går att göra utan att röra kod.*

---

## Utgångsläget, verifierat mot databasen 2026-08-28

Siffrorna ska stå i varje resonemang om prioritering, för de är hela skälet till
att det här dokumentet finns.

| | Antal |
|---|---|
| Konton totalt | 22 |
| **Varav äkta externa** (Carls test- och egna konton borträknade) | **11** |
| Externa som loggat in senaste 30 dagarna | **1** |
| Projekt skapade av externa | 12 |
| Fältrapporter i hela databasen | **2** |
| Timrader i hela databasen | 6 |

**Rollfördelningen bland de 11:** 8 valde hemägare, 3 valde proffs.
4 av hemägarna och 2 av proffsen har loggat in senaste 60 dagarna.

Det finns alltså ingen data som avgör hemägare-mot-proffs. Elva personer är inte
ett urval, det är en anekdotsamling. **Därför avgörs valet i samtal, inte i
PostHog** — och därför är tio samtal i veckan inte en aktivitet vid sidan av
arbetet, det är arbetet.

---

## Manuset — 20 minuter

Regeln som gör hela skillnaden: **du ställer frågan och håller sedan tyst.**
Tystnaden är obekväm i tre sekunder och det är i sekund fyra svaret kommer. Prata
inte om Renofine förrän minut 14, och demonstrera aldrig innan dess. Den som får
en demo slutar berätta och börjar vara artig.

### 0–2 min · Ramen
> "Tack att du tar dig tid. Jag bygger inget åt dig i dag och jag ska inte sälja
> något. Jag försöker förstå hur du jobbar i dag. Får jag anteckna?"

Säg uttryckligen att ärliga negativa svar är det värdefulla. Annars får du
artighet, och artighet är värdelös data.

### 2–8 min · Vardagen, inte produkten
Låt hen berätta konkret om **det senaste riktiga jobbet**, inte om hur det brukar
vara. "Brukar" är en efterhandskonstruktion; "förra veckan" är ett minne.

1. "Ta det senaste jobbet du gjorde klart. Berätta vad som hände från att kunden
   hörde av sig till att du fick betalt."
2. "Var i det där tog det stopp, eller tog längre tid än det borde?"
3. "När satt du senast och gjorde administration på kvällen eller helgen? Vad var det?"

### 8–14 min · De fem frågor som avgör
Det här är kärnan. Fem frågor, och svaren är det som ska loggas ordagrant.

| # | Fråga | Vad du lyssnar efter |
|---|---|---|
| **1. Alternativlösningen** | "Vad använder du i dag för att hålla ihop det här?" | Excel, papper, Bygglet, minnet, sms-tråden. Ett svar som "ingenting" betyder oftast "något jag inte tänker på" — gräv. |
| **2. Bytesbenägenhet** | "Om det verktyget slutade fungera i morgon — vad skulle du göra?" | "Ringa supporten på en gång" = smärtstillande. "Äh, jag skulle nog använda Excel" = vitamin. Ordvalet och tempot i svaret säger mer än innehållet. |
| **3. Vem betalar** | "Vem i firman skulle behöva säga ja till en kostnad på några hundra i månaden?" | Om svaret är "jag" har du hittat både köpare och användare. Om det är någon annan, be om namnet och rollen. |
| **4. Vem beslutar** | "Och vem skulle märka om ni slutade använda det?" | Köparen och den som saknar det är inte alltid samma person. Det är den skillnaden som avgör vad produkten ska vara. |
| **5. Vad gör ont nu** | "Om du fick trolla bort en enda sak ur din vecka — vilken?" | Svaret ska vara oombett konkret. Blir det vagt är smärtan inte tillräckligt stor för att någon betalar för den. |

### 14–18 min · Först nu produkten
Visa **en** sak, den som ligger närmast det hen just klagade på. Inte turen, inte
allt. Säg: "Får jag visa en sak och så säger du vad du tänker?"

Fråga sedan det enda som räknas:
> "Om det här fanns på riktigt i dag — skulle du använda det på nästa jobb? Vad
> skulle hindra dig?"

**Fråga aldrig "skulle du betala för det här?"** Alla säger ja i ett samtal.
Fråga i stället: *"Vad betalar du för i dag som du är nöjd med?"* — plånboken
avslöjas av det som redan lämnat den.

### 18–20 min · Avslutet som ger nästa samtal
1. "Vem mer borde jag prata med?" — varje samtal ska ge minst ett nytt namn.
   Det är så tio i veckan blir hållbart utan kall värvning.
2. "Får jag höra av mig igen om ett par veckor?" — ett ja är ett svagt
   köpsignal och en gratis andra intervju.

---

## Var de tio finns

I prioritetsordning: varmast först. De längst ner kostar mest tid per samtal.

### 1. De elva som redan skapat konto (varmast som finns)
De har frivilligt registrerat sig och kan berätta varför de aldrig kom tillbaka —
det är den mest värdefulla intervjun som finns att göra, för avhoppet är
förklarat av en människa i stället för gissat ur en tratt.

Hämta listan live i stället för att spara den här (personuppgifter hör inte hemma
i ett git-repo):

```sql
select u.email, p.onboarding_user_type, u.created_at::date as skapade_konto,
       u.last_sign_in_at::date as senast_inne,
       (select count(*) from public.projects x where x.owner_id = p.id) as projekt
from auth.users u
left join public.profiles p on p.user_id = u.id
where u.email not like 'carl.palmquist+%'
  and u.email not like '%@renomate.demo'
  and u.email not in ('sthlmrides@gmail.com','calpamusic@gmail.com',
                      'info@calpamusic.com','carl.palmquist@gmail.com')
order by u.created_at desc;
```

Öppningen till en som försvann:
> "Hej! Du provade Renofine i somras och jag såg att du inte kom tillbaka. Jag
> vill inte sälja något — jag vill förstå varför, för det är mer värt för mig än
> en ny användare. Har du 20 minuter?"

### 2. Bygglets egna kundcase
Bygglet publicerar kundcase med firmanamn. Det är en **verifierad lista över
firmor som redan betalar för den här sortens verktyg** — alltså bevisad
betalningsvilja, till skillnad från en Facebook-grupp. Kvalificerande fråga i
första samtalet: *"När förnyas ert Bygglet-avtal?"* Svaret avgör om det är ett
pilotsamtal eller ett kaffe (se `docs/vinn-bygglet-kunder-2026-08.md`).

### 3. Facebook-grupperna
Färdiga texter finns i `.claude/briefs/fb-launch-kit.md` och
`.claude/briefs/fb-post-varianter.md`. All trafik hittills (452 av 813 besökare)
kom från tre FB-inlägg — kanalen fungerar för **trafik**. Den har däremot
levererat noll kvarvarande användare, så använd den för att boka *samtal*, inte
för att jaga signups.

### 4. Fysiskt, där de faktiskt är
Byggvaruhusens proffsdisk vid sjutiden på morgonen. En snickare som väntar på
virke har fem minuter och inget att göra. Fem minuter räcker för fråga 1, 2 och 5
— och för att fråga om ett riktigt samtal senare.

### 5. Din egen omgivning, med reservation
Snabbast att boka och farligast att lita på: de vill att du ska lyckas. Väg deras
svar lägre, och fråga alltid "vem mer borde jag prata med".

---

## Loggmall — en fil per samtal

Spara i `docs/intervjuer/YYYY-MM-DD-fornamn-roll.md`. Skriv den **inom en timme**
efter samtalet; minnet färgas snabbt av vad man hoppades höra.

```markdown
# [Förnamn], [roll] — [datum]

**Hittad via:** [de elva / Bygglet-case / FB / byggvaruhus / bekant]
**Firma:** [antal anställda, inriktning] · **Ort:**
**Längd:** [min] · **Form:** [telefon / video / på plats]

## De fem svaren (ordagrant där det går)
1. **Alternativlösning i dag:**
2. **Om det försvann i morgon:**
3. **Vem betalar:**
4. **Vem märker om det försvinner:**
5. **Vad hen skulle trolla bort:**

## Vad hen sa oombett
> [Citat. Det som kom utan att du frågade väger tyngst — noteras ordagrant.]

## Vitamin eller smärtstillande?
[Din bedömning EFTER samtalet, med skälet. Var ärlig: "vitamin" är ett
lika användbart svar som "smärtstillande", och betydligt vanligare.]

## Vad detta bekräftar eller motbevisar
- Hypotes: [t.ex. "firmaägaren i en 2–5-mannafirma är köparen"]
- Utfall: [bekräftar / motbevisar / oklart] — och varför

## Nästa steg
- [ ] Namn jag fick: 
- [ ] Får höra av mig igen: [ja/nej]
- [ ] Blockerande fynd som stoppar nästa samtal: 
```

---

## Veckorutinen

En sida per vecka, `docs/intervjuer/vecka-YYYY-WW.md`:

1. **Antal samtal.** Målet är tio. Skriv siffran även när den är två — en
   nedskriven tvåa gör nästa vecka ärligare än en obokförd ambition.
2. **Vad som upprepades.** Två personer som säger samma sak oombett är en signal.
   En person som säger något är en anekdot.
3. **Vad som motbevisades.** Den viktigaste raden. En hypotes som överlever tio
   samtal utan att en enda gång ta stryk har troligen aldrig prövats på riktigt.
4. **Rollräkningen:** hur många hemägare, hur många proffs, och åt vilket håll
   svaren lutar.
5. **Beslutet som mognat:** vad vet du nu som du inte visste i måndags?

**Stoppregeln:** efter tjugo samtal ska hemägare-mot-proffs vara avgjort. Är det
inte det ställdes fel frågor, och då är det manuset som ska ändras — inte antalet
samtal.

# Renofine som MCP-server

**Skriven natten 2026-09-02 → 03, kodverifierad mot `main` = `add0c70`.**
Beslutsunderlag, inte en implementationsorder. Alla siffror och filnamn nedan är
lästa ur repot samma natt.

---

## Sammanfattningen först

**Den svåra halvan är redan byggd — men den sitter på fel sida av kabeln.**

Renofine har redan det som brukar vara det dyra i ett MCP-bygge: ett
handlingsspråk. `src/services/agent/types.ts` definierar `ProposalAction` med
sexton handlingstyper (`create_task`, `log_time`, `import_purchase`,
`assign_task`, `set_default_rate`, `open_feature`, …), och hela poängen med det
språket står i filens egen header:

> The `agent-route` edge function PROPOSES these; nothing is applied
> server-side. `applyProposals` maps each accepted proposal to an existing DB
> write path.

Det är exakt den form ett MCP-verktyg vill ha: en agent föreslår, en människa
bekräftar, systemet skriver. Det finns till och med en ångra-stack
(`renaida_undo_stack`) med människoläsbara etiketter.

Problemet: **`applyProposals` är 690 rader som kör i webbläsaren.** Den importeras
av `src/components/Renaida.tsx` och skriver till tolv tabeller. En extern
MCP-klient — Claude Desktop, Cowork, ChatGPT — har ingen webbläsare med Carls
session i. Den kan alltså föreslå men inte verkställa.

Hela planen nedan handlar om den enda meningen.

---

## Vad "Renofine som MCP-server" betyder konkret

En MCP-server som andra AI-klienter ansluter till, med verktyg som:

| verktyg | vad det gör | finns redan? |
|---------|-------------|--------------|
| `search` | fritextsök i hela projektet | **ja** — `global_search(q, per_type)` |
| `get_project` | projekt, rum, uppgifter, budget | delvis — RLS-läsning finns |
| `propose` | naturligt språk → `ProposalAction[]` | **ja** — `agent-route` |
| `apply` | verkställ bekräftade förslag | **nej** — sitter i webbläsaren |
| `undo` | ångra senaste batchen | delvis — stacken finns, logiken är klientsidig |

Poängen är inte att bygga en ny app. Det är att öppna en andra dörr till den
motor som redan finns, så att en hantverkare kan säga "logga fem timmar på
badrummet" till vad som helst som talar MCP — inte bara till Renaida i appen.

---

## Vad som redan bär

### 1. `global_search` är ett färdigt MCP-verktyg

`global_search(q text, per_type int DEFAULT 5)` returnerar
`entity_type, entity_id, project_id, project_name, title, …` över tolv
objekttyper i ETT anrop. Den är `SECURITY INVOKER` och filtrerar via
`my_project_ids`, alltså behörighetskontrollerad i två lager.

Det är det billigaste tänkbara första MCP-verktyget: en `tools/call` som
vidarebefordrar `q` till en RPC. Uppskattning: **en halvdag**, det mesta av den
tiden går åt till servern runt omkring, inte till verktyget.

### 2. `agent-route` har rätt auth-form redan

Rad 39 i `supabase/functions/agent-route/index.ts`:

```ts
Authorization: authHeader,
```

Funktionen vidarebefordrar anroparens egen token till PostgREST. Den agerar
alltså **som användaren**, under RLS — inte med service-nyckel. Det är precis
rätt egenskap för MCP: servern behöver ingen egen behörighetsmodell, den ärver
den som redan finns i databasen.

### 3. Handlingsspråket är redan skrivet för agenter

Sexton actions, alla med kommentarer som förklarar *varför* fältet finns.
`import_purchase` bär till exempel `totalPrinted` — "vad modellen SÅG mot vad den
rapporterade" — och `sourceFileName`, tillagt 2026-09-02 därför att en rad utan
källfil inte kan skilja en felläst bild från en felparad. Den sortens omsorg är
vad som gör ett verktygsschema användbart för en främmande agent.

### 4. Ångra finns som förstklassigt begrepp

`renaida_undo_stack` lagrar `ops jsonb` (serialiserade `UndoOp[]`) plus en
människoläsbar `label`. En agent-API utan ångra är inte försvarbar; här behöver
den inte uppfinnas.

---

## Vad som saknas — och vad det kostar

### Blockeraren: apply måste flytta till servern

`src/services/agent/applyProposals.ts`, 690 rader, skriver till:

```
tasks (16 anrop) · profiles (5) · renaida_undo_stack (3) · time_entries (2)
rooms (2) · purchase_orders (2) · materials (2) · comments (2)
task_file_links (1) · photos (1) · activity_log (1) · storage: project-files (1)
```

Tre vägar, i stigande ordning av arbete och av hur bra resultatet blir:

**A. Låt MCP bara föreslå.** Servern exponerar `search` + `propose`. Förslagen
landar i en kö som Carl (eller kunden) bekräftar i appen. Ingen kodflytt alls.
*Kostnad: liten. Nackdel: agenten kan inte slutföra något — den skriver lappar.*

**B. Flytta `applyProposals` till en edge-funktion.** Samma kod, samma
skrivvägar, men körd i Deno med anroparens token vidarebefordrad precis som
`agent-route` gör. Webbläsaren anropar då samma funktion som MCP-servern gör,
och det finns EN apply-väg i stället för två.
*Kostnad: uppskattningsvis 3–5 dagar. Fällan: filuppladdning
(`attachmentKey` → in-memory registry i `documentCapture.ts`) och
`project-files`-storage måste lösas annorlunda utan en `File`-instans.*

**C. Skriv en separat server-apply.** Snabbare att komma igång, men då finns två
implementationer av samma tolv skrivvägar som ska hållas i synk.
*Rekommenderas inte. Det är så divergens börjar.*

**Rekommendation: B.** Inte främst för MCP:s skull — utan för att en
applikationslogik som bara existerar i webbläsaren ändå är fel ställe för den.
MCP är anledningen att äntligen göra det.

### Auth: hur en främmande klient får en token

Två modeller finns redan i huset:

- **Användar-JWT** — 4 funktioner har `verify_jwt = true`
- **Länk-token** — 15 funktioner har `verify_jwt = false` och validerar en
  token i länken själva (hela `worker-*`-familjen)

**Läs standing-regeln innan något designas här:** `verify_jwt = true` är INGEN
auth-grind — anon-nyckeln är ett giltigt JWT. Grinden är RLS.

För MCP är länk-token-modellen närmast rätt: en användare skapar en
projektbunden nyckel med begränsad livslängd i Renofine, klistrar in den i sin
MCP-klient, och servern växlar den mot en Supabase-session. Det ger något
`worker-*` redan bevisat fungerar, och något en användare kan återkalla.

### Hård förutsättning: RLS-hålet måste stängas först

Se backlog-kortet `profiles-rls-open-to-anon`. `profiles` har
`FOR SELECT USING (true)` utan `TO`-klausul, alltså läsbar för rollen `public`.
Tabellen innehåller e-post, telefon, organisationsnummer och timpris.

**Bygg inte en MCP-server ovanpå det.** En MCP-server är en maskinvänlig dörr —
den gör exakt den sortens uttömmande läsning enkel och snabb. Att öppna den
innan `profiles` är stängd är att bygga en motorväg till ett hål man känner till.

Ordningen är alltså: RLS först, MCP sedan. Inte förhandlingsbart.

---

## Faser

**Fas 0 — stäng `profiles`.** Kräver att de policies som gör inline-subqueries
mot `profiles` skrivs om först (det var de som orsakade 500-orna i mars). Ingen
MCP-kod skrivs i den här fasen.

**Fas 1 — läsbar server.** `search` (via `global_search`) och `get_project`.
Read-only, ingen skrivning, ingen apply. Redan här blir Renofine användbart från
Cowork och Claude Desktop: "vad ligger olöst på Furusundsgatan?"
*Halvdag till två dagar.*

**Fas 2 — `propose`.** Vidarebefordra till `agent-route`, returnera
`ProposalAction[]` som strukturerad output. Agenten kan formulera avsikt; en
människa bekräftar i appen.
*Två till tre dagar.*

**Fas 3 — `apply` + `undo`.** Flytta `applyProposals` serversidan (väg B ovan).
Då — och först då — kan en extern agent slutföra ett arbetsflöde.
*Tre till fem dagar, plus tid för filhanteringen.*

Fas 1 och 2 är värda att göra även om fas 3 aldrig blir av. Fas 3 utan fas 0 ska
inte göras alls.

---

## Vad jag INTE rekommenderar

**Exponera inte de 39 edge-funktionerna som 39 MCP-verktyg.** En agent som möter
39 verktyg väljer sämre än en som möter fem. `ProposalAction`-språket är redan
den abstraktion som ska exponeras — funktionerna är dess implementation.

**Bygg inte MCP med service-nyckeln.** Frestelsen finns eftersom det får allt att
fungera direkt. Men då lämnar man RLS, och varje behörighetsfråga måste
återuppfinnas i servern. `agent-route` visar redan hur man slipper det.

**Vänta med skrivande verktyg tills ångra finns serversidan.** En agent som kan
skriva men inte ångra är en agent man inte vågar använda.

---

## Frågor som behöver Carls svar

1. **Vem är den första MCP-klienten?** Cowork (då räcker fas 1 länge), eller en
   kund som ska koppla in sin egen assistent (då behövs auth-modellen tidigt)?
2. **Väg A, B eller C för apply?** Rekommendationen är B, men den kostar en
   vecka och rör kod som fungerar idag.
3. **Ska MCP vara en produktfunktion eller ett internt verktyg?** Svaret avgör om
   nyckelhanteringen behöver ett UI eller kan vara en rad i en tabell.
4. **Prioritet mot painkiller-strategin.** Enligt `NASTA-UPP.md` är läget elva
   externa konton och noll loggade samtal. MCP flyttar inte den siffran. Det här
   dokumentet är underlag för när frågan blir aktuell — inte ett argument för att
   den är det nu.

---

## Vad det här dokumentet inte är

Jag har läst koden, inte kört en MCP-server mot den. Tidsuppskattningarna är
bedömningar från filstorlek och skrivvägar, inte mätningar. Den enda siffran som
är hård är de 690 raderna i `applyProposals` och de tolv tabellerna den rör.

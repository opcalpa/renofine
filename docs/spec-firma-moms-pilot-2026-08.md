# Tre specar: firma-entiteten, momsmodellen, piloten

*Skrivna 2026-08-27 på Opus, granskade och rättade på Fable samma natt (tre fel, se rubrikerna). Uppströms-besluten ur `vinn-bygglet-kunder-2026-08.md`, skrivna så
att Opus kan bygga utan att växla tillbaka. Momsreglerna är hämtade från Skatteverket
och korsverifierade — se källorna sist.*

---

# 1. Firma-entiteten

## Problemet, exakt

Det finns ingen firma. `profiles` har `company_name`, `org_number` m.fl. som **text på en
person**; `clients.owner_id` pekar på en profil; medlemskap är `project_shares` per projekt.
Följden: en anställd i en 10-projektsfirma kräver 10 inbjudningar, kundregistret ägs av
en privatperson, och det finns ingen "min personal"-skärm. Allt i fas 1 och 2 hänger på
att detta rättas först.

## Modellen

```sql
create table public.companies (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  org_number          text,
  vat_number          text,                       -- SE + org.nr + 01, för fakturan
  -- Säljer VÅR firma byggtjänster mer än tillfälligt? Styr bara INKÖPSSIDAN: om en
  -- leverantör får fakturera oss med omvänd betalningsskyldighet. Se spec 2.
  sells_construction  boolean not null default true,
  default_hourly_rate numeric(10,2),
  created_by_profile_id uuid not null references public.profiles(id),
  created_at          timestamptz not null default now()
);

create table public.company_members (
  company_id uuid not null references public.companies(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  -- owner: fakturering/abonnemang. admin: kontoret. member: anställd/fältfolk.
  role       text not null default 'member' check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  primary key (company_id, profile_id)
);

alter table public.clients   add column if not exists company_id uuid references public.companies(id);
alter table public.projects  add column if not exists company_id uuid references public.companies(id);
```

## RLS — och fällan som måste undvikas

En policy på `companies` som frågar `company_members`, vars policy frågar `companies`,
ger **oändlig rekursion**. Samma mönster som gav problem med profiles/projects tidigare.
Lösningen är husets egen: en `SECURITY DEFINER`-funktion som kringgår RLS, precis som
`my_project_ids()` och `get_user_profile_id()`.

```sql
create or replace function public.my_company_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select company_id from public.company_members
  where profile_id = (select id from public.profiles where user_id = auth.uid() limit 1);
$$;

create or replace function public.user_is_company_admin(_company_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.company_members
    where company_id = _company_id
      and profile_id = (select id from public.profiles where user_id = auth.uid() limit 1)
      and role in ('owner','admin')
  );
$$;
```

Policyer: `companies` SELECT `USING (id in (select public.my_company_ids()))`, UPDATE
`USING (public.user_is_company_admin(id))`. `company_members` SELECT på samma sätt,
INSERT/DELETE bara för admin. `clients` byter från `owner_id = get_user_profile_id()`
till `company_id in (select public.my_company_ids())` **med `owner_id`-villkoret kvar
som OR** tills backfillen är klar.

**Krav på testningen (stående regel):** verifiera mot TABELLEN med två riktiga konton —
en medlem och en utomstående — inte bara mot funktionen. Inlinade checkar ärver
ingenting.

## Migrationsordning (varje steg egen migration, revert-SQL först)

1. Tabeller + funktioner + policyer. Inget läser dem än.
2. **Backfill:** en `companies`-rad per profil som har `company_name` ifylld ELLER
   `onboarding_user_type = 'contractor'`; skaparen blir `owner`. `clients.company_id`
   och `projects.company_id` sätts från ägarens nya firma.
3. Koden börjar läsa `company_id` (med fallback till `owner_id`).
4. **Först när prod verifierats:** ta bort fallbacken. `clients.owner_id` behålls som
   historik — droppa den inte.

## Det som gör "bjud in en gång" sant — saknades i första versionen

Tabellerna ovan ger ingen åtkomst av sig själva. `user_has_project_access()` måste
lära sig firman, annars är en medlem fortfarande utestängd från varje projekt hen inte
har en `project_shares`-rad på. Funktionen är redan `SECURITY DEFINER`, så tillägget
kan inte ge rekursion:

```sql
create or replace function public.user_has_project_access(project_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.project_shares
    where project_shares.project_id = $1
      and shared_with_user_id = (select id from public.profiles where user_id = auth.uid() limit 1)
  )
  or public.user_property_access_on_project($1, 'viewer')
  -- Firmans medlemmar ser firmans projekt. Token-arbetare är INTE medlemmar —
  -- de förblir per projekt, som i dag.
  or exists (
    select 1 from public.projects p
    join public.company_members cm on cm.company_id = p.company_id
    where p.id = $1
      and cm.profile_id = (select id from public.profiles where user_id = auth.uid() limit 1)
  );
$$;
```

Och `projects.company_id` måste **sättas vid skapande** av en medlem (app-kod vid
`createProject`, med `my_company_ids()` som default) — annars föds nya projekt utan
firma och medlemmarna ser dem inte. Backfillen täcker bara det som redan finns.

**Stående regel gäller:** 10 policyer i 7 tabeller inlinar sina checkar och ärver inget
från funktionen. Sveparen i `feedback_rls_test_the_table_not_the_predicate` ska köras
efter ändringen — de inlinade behöver samma OR-gren själva.

## Vad som blir möjligt när den finns

- Bjud in en anställd **en gång** → medlem i alla firmans projekt.
- Kundregister och prislista ägs av firman, inte av Carl-som-privatperson.
- "Min personal"-skärm, och en per-person-veckosumma som betyder något.
- Abonnemanget kan prissättas per kontorsplats (`role in ('owner','admin')`) — vilket
  är hela prisberättelsen mot Bygglet.

---

# 2. Momsmodellen

## Nuläget är ohållbart

Moms räknas som `subtotal * 0.25` **vid rendering** och sparas aldrig — på offert,
faktura OCH inköp. Ingen 12/6/0 %, ingen omvänd byggmoms. Det blockerar SIE4 permanent
(en SIE-verifikation kräver konto + netto + moms per rad) och gör varje B2B-faktura
formellt fel.

## Momssatser (Skatteverket)

Bygg- och anläggningstjänster samt byggmaterial: **25 %**. 12 % och 6 % förekommer inte
i normal byggfakturering men fältet ska ändå kunna sättas — en firma som fakturerar
något udda ska inte blockeras. **0 %** används vid undantag och vid omvänd
betalningsskyldighet.

## Omvänd byggmoms — de TVÅ villkoren

**Båda** måste vara uppfyllda:

1. **Tjänsten:** särskilt angivna byggtjänster, byggstädning eller uthyrning av
   arbetskraft för dessa, utförda i Sverige på fastighet enligt momslagen.
2. **Köparen:** en beskattningsbar person som **inte bara tillfälligt** säljer sådana
   byggtjänster — eller som tillfälligt gör det vidare till någon som inte bara
   tillfälligt gör det (mellanmansregeln).

> Skatteverket, ordagrant: *"Det byggföretag som säljer byggtjänster till andra köpare än
> de ovan nämnda, till exempel till privatpersoner, ska ta ut moms av köparen."*

**Omfattas:** mark- och grundarbeten, bygg- och anläggningsarbeten, bygginstallationer,
slutbehandling av byggnader, uthyrning av maskiner **med** förare, byggstädning
(slutstädning), personaluthyrning för ovanstående.

**Omfattas INTE:** ren varuleverans av byggmaterial, arkitekt- och byggkonsult,
uthyrning av maskiner **utan** förare, löpande städning, plantering/skötsel av grönytor,
fastighetsskötsel med mindre reparationer, avfallshantering.

En kombination av varor och tjänster behandlas som **en enda huvudsaklig tjänst** om
byggtjänsten dominerar.

## Fakturakraven

Vid omvänd betalningsskyldighet:
- **Ingen utgående moms debiteras.**
- Fakturan ska innehålla **köparens momsregistreringsnummer**.
- Fakturan ska innehålla texten **"Omvänd betalningsskyldighet"**.

Redovisning: säljaren i **fält 41** (ingen utgående moms). Köparen i **fält 24**,
beräknar utgående moms i **fält 30**, drar ingående i **fält 48**.

## Datamodell

Köparvillkoret handlar om **kunden**, inte om oss. Därför bor flaggan på `clients`:

```sql
-- Kunden: säljer HEN byggtjänster mer än tillfälligt? Bara då får VI fakturera
-- med omvänd betalningsskyldighet. Default false — en hemägare gör det aldrig,
-- och ett fel åt det hållet är en faktura utan moms som Skatteverket underkänner.
alter table public.clients add column if not exists sells_construction boolean not null default false;
alter table public.clients add column if not exists vat_number text;
```

```sql
-- Rader (quote_items, invoice_items, materials/purchase_orders)
vat_rate   numeric(5,2) not null default 25.00,   -- 25 / 12 / 6 / 0
vat_amount numeric(12,2) not null default 0,      -- SPARAS, härleds aldrig vid rendering

-- Huvud (quotes, invoices)
reverse_charge     boolean not null default false,
buyer_vat_number   text,
vat_note           text        -- "Omvänd betalningsskyldighet" när reverse_charge
```

Fakturahuvudet behöver dessutom **momsunderlag och moms per sats** (25/12/6/0) som
summerade fält — det är vad SIE-verifikationen och momsdeklarationen läser, och att
summera rader vid exporttillfället är att räkna om vid visning fast på ett nytt ställe.

Beloppen ska **beräknas en gång och sparas**, aldrig räknas om vid visning. Samma
princip som planmotorn: moms appliceras en gång, efter roll, och etiketteras alltid.

## Regler koden ska upprätthålla

1. `reverse_charge = true` ⇒ alla rader `vat_rate = 0`, `vat_amount = 0`, och
   `buyer_vat_number` **obligatoriskt** (spärra utskick utan det).
2. `reverse_charge` får bara erbjudas när **kunden** (`clients.sells_construction = true`)
   är en byggtjänstsäljare. Aldrig mot en hemägare. `companies.sells_construction` styr
   bara om *vi* får ta emot sådana leverantörsfakturor.
3. **ROT och omvänd byggmoms utesluter varandra.** ROT är för privatpersoner; omvänd
   byggmoms kräver en byggtjänstsäljande köpare. Kryssas båda: felmeddelande, inte
   tyst prioritering.
4. Bedömningen är **per faktura, inte per rad**. Dominerar byggtjänsten behandlas
   varor + tjänst som *en* huvudsaklig tjänst, och hela fakturan får omvänd
   betalningsskyldighet — materialraderna också. Bara en faktura som **enbart** är
   varuleverans saknar byggtjänst och får aldrig omvänd. Blockera alltså på
   fakturanivå ("inga tjänsterader ⇒ ingen omvänd"), flagga inte enskilda rader —
   första versionen av den här regeln hade fått Opus att bygga fel.
5. Momsen från kvittotolkningen (`process-document-v2` extraherar den redan och
   **kastar den**) ska sparas på inköpsraden. Det är enradsfixen som låser upp SIE4.

## Ordning
`purchase-vat-capture` (spara det vi redan läser ut) → moms på offert/faktura →
omvänd byggmoms → SIE4 nåbar. Steg ett är litet och är den verkliga blockeraren.

---

# 3. Piloten

## Formen

**Tre firmor**, inte trettio. Urval: 2–5 anställda, minst en icke-svensktalande i laget,
**Bygglet-förnyelse inom tre månader**. Den sista är viktigast — utan utlösare byter
ingen.

**Var kandidaterna finns:** Bygglet publicerar sina kundcase med firmanamn — det är en
lista över verifierade Bygglet-användare. Plus FB-grupperna (kortet `fb-grupper-outreach`).
Första kvalificerande frågan i varje samtal: *"När förnyas ert Bygglet-avtal?"* — svaret
avgör om det är en pilot eller ett kaffe.

**Upplägget: parallellkörning, inte migration.** Ett *nytt* projekt hos oss medan Bygglet
lever kvar för pågående jobb. Det tar bort risken ur beslutet, vilket är hela poängen:
en firma som måste flytta allt säger nej.

**Carl gör migrationen för hand** — kunder, prislista, personal. Det är max en kväll per
firma, det är marknadens enda "byt från Bygglet"-erbjudande, och det lär oss vad
importverktyget faktiskt måste klara innan vi bygger det.

**Ditt telefonnummer i appen.** Bygglets enda verkliga vallgrav är människorna: varje
lovord de får handlar om support, inte mjukvara. Med noll anställda matchas det bara
personligen — och det kan de inte kopiera.

## Ordningen inne hos firman

1. **Fältet först, dag ett.** Skicka arbetarlänken till laget. Röst på två tryck är det
   enda vi har som ingen annan har, och det syns direkt.
2. **Kontoret vid första månadsskiftet.** Det är då de upptäcker om vi stänger kedjan.
   Går inte timmar → faktura → fil till revisorn, behåller de Bygglet för den saken och
   betalar dubbelt. Då är de förlorade vid förnyelsen.

## Fyra mått (bara fyra)

| Mått | Varför | Källa |
|---|---|---|
| `field_report_sent` per arbetare och dag | Använder fältet det, eller bara ägaren? | PostHog, finns |
| Dagar från sista timrad till skickad faktura | Stänger månadsskiftet? | DB |
| Tog revisorn emot SIE-filen? | Enda binära frågan | Fråga firman |
| Sade de upp Bygglet vid förnyelsen? | Det enda som räknas | Fråga firman |

**Mätning som saknas och måste läggas till först:** `worker_link_opened`, språkbyte,
komposerare-avbrott. I dag mäts bara det som skickades — inte hur många som öppnade
länken och inte skickade något. Utan det kan vi inte skilja "fungerar inte" från
"provades aldrig".

## Vad som får avbryta piloten

Om ingen av de tre skickar en fältrapport under vecka ett är det inte ett
onboarding-problem — då är premissen fel, och vi ska ta reda på varför innan vi bygger
fas 2. Skriv ner det i förväg så att det inte bortförklaras när det händer.

---

## Källor (Skatteverket, hämtade 2026-08-27)

- [Omvänd betalningsskyldighet inom byggsektorn](https://www.skatteverket.se/foretag/moms/sarskildamomsregler/byggverksamhet/omvandbetalningsskyldighetinombyggsektorn.4.47eb30f51122b1aaad28000545.html) — de två villkoren, köparens roll, privatpersoner
- [Avdragsrätt, fakturering och redovisning](https://www.skatteverket.se/foretag/moms/sarskildamomsregler/byggverksamhet/omvandbetalningsskyldighetinombyggsektorn/avdragsrattfaktureringochredovisning.4.19b9f599116a9e8ef36800022270.html) — fakturatext, momsreg.nr, fält 41/24/30/48
- [Tjänster där du ska använda omvänd betalningsskyldighet](https://www.skatteverket.se/foretag/moms/sarskildamomsregler/byggverksamhet/omvandbetalningsskyldighetinombyggsektorn/tjansterdarduskaanvandaomvandbetalningsskyldighet.4.19b9f599116a9e8ef36800022231.html) — omfattas/omfattas inte

**Rättelse värd att notera:** sidan om tjänster sammanfattades först som att köparen inte
behöver uppfylla något krav. Det är fel, och korsverifierades mot huvudsidan. Köparvillkoret
är hela kruxet — utan det blir varje faktura till en hemägare formellt fel.

-- Omvänd byggmoms (omvänd betalningsskyldighet) på offert och faktura.
--
-- Skatteverket, båda villkoren måste vara uppfyllda:
--   1. Tjänsten är en byggtjänst enligt momslagen, utförd i Sverige.
--   2. KÖPAREN är en beskattningsbar person som inte bara tillfälligt säljer
--      sådana byggtjänster (eller mellanmansregeln).
-- "Det byggföretag som säljer byggtjänster till andra köpare än de ovan nämnda,
--  till exempel till privatpersoner, ska ta ut moms av köparen."
--
-- Villkor 2 handlar om KUNDEN — därför bor flaggan på `clients`
-- (`sells_construction`, redan migrerad 2026-08-27). Den här migrationen lägger
-- till dokumentets egen del och de spärrar som gör att en felaktig faktura inte
-- kan lämna huset.
--
-- REVERT:
--   drop trigger if exists quotes_reverse_charge_guard on public.quotes;
--   drop trigger if exists invoices_reverse_charge_guard on public.invoices;
--   drop trigger if exists quote_items_reverse_charge_guard on public.quote_items;
--   drop trigger if exists invoice_items_reverse_charge_guard on public.invoice_items;
--   drop function if exists public.guard_reverse_charge_document();
--   drop function if exists public.guard_reverse_charge_item();
--   alter table public.quotes   drop column if exists reverse_charge, drop column if exists buyer_vat_number, drop column if exists vat_note;
--   alter table public.invoices drop column if exists reverse_charge, drop column if exists buyer_vat_number, drop column if exists vat_note;

alter table public.quotes
  add column if not exists reverse_charge boolean not null default false,
  add column if not exists buyer_vat_number text,
  add column if not exists vat_note text;

alter table public.invoices
  add column if not exists reverse_charge boolean not null default false,
  add column if not exists buyer_vat_number text,
  add column if not exists vat_note text;

comment on column public.quotes.reverse_charge is
  'Omvänd betalningsskyldighet. Får bara sättas när kunden (clients.sells_construction) säljer byggtjänster mer än tillfälligt. Aldrig mot en privatperson.';
comment on column public.quotes.buyer_vat_number is
  'Köparens momsregistreringsnummer. OBLIGATORISKT på en faktura med omvänd betalningsskyldighet.';
comment on column public.quotes.vat_note is
  'Texten som måste stå på dokumentet, t.ex. "Omvänd betalningsskyldighet".';
comment on column public.invoices.reverse_charge is
  'Omvänd betalningsskyldighet. Kräver köparens momsnummer och utesluter ROT.';
comment on column public.invoices.buyer_vat_number is
  'Köparens momsregistreringsnummer. OBLIGATORISKT vid omvänd betalningsskyldighet.';
comment on column public.invoices.vat_note is
  'Texten som måste stå på dokumentet, t.ex. "Omvänd betalningsskyldighet".';

-- ROT och omvänd byggmoms utesluter varandra: ROT är för privatpersoner, omvänd
-- byggmoms kräver en byggtjänstsäljande köpare. Samma dokument kan inte vara
-- bådadera. Detta ska bli ett FELMEDDELANDE, aldrig en tyst prioritering.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'quotes_rot_xor_reverse_charge') then
    alter table public.quotes add constraint quotes_rot_xor_reverse_charge
      check (not reverse_charge or coalesce(total_rot_deduction, 0) = 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'invoices_rot_xor_reverse_charge') then
    alter table public.invoices add constraint invoices_rot_xor_reverse_charge
      check (not reverse_charge or coalesce(total_rot_deduction, 0) = 0);
  end if;
end $$;

-- Dokumentets grind. Bedömningen är PER DOKUMENT, inte per rad: dominerar
-- byggtjänsten följer materialraderna med. Därför kontrolleras allt här och
-- inget flaggas på enskilda rader.
create or replace function public.guard_reverse_charge_document()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_bad_rows integer;
begin
  if not new.reverse_charge then
    return new;
  end if;

  -- Alla rader ska vara 0 %. Sätt raderna FÖRE huvudet.
  if tg_table_name = 'quotes' then
    select count(*) into v_bad_rows from public.quote_items where quote_id = new.id and vat_rate <> 0;
  else
    select count(*) into v_bad_rows from public.invoice_items where invoice_id = new.id and vat_rate <> 0;
  end if;
  if v_bad_rows > 0 then
    raise exception 'Omvänd betalningsskyldighet kräver 0 %% moms på alla rader (% rader har en annan sats)', v_bad_rows
      using errcode = 'check_violation';
  end if;

  -- Köparens momsnummer är ett formellt fakturakrav. Ett utkast får sakna det;
  -- ingenting som lämnat huset får göra det.
  if coalesce(new.status, 'draft') <> 'draft'
     and coalesce(btrim(new.buyer_vat_number), '') = '' then
    raise exception 'Omvänd betalningsskyldighet kräver köparens momsregistreringsnummer innan dokumentet skickas'
      using errcode = 'check_violation';
  end if;

  -- Texten är också ett formellt krav; sätt den om appen glömt.
  if coalesce(btrim(new.vat_note), '') = '' then
    new.vat_note := 'Omvänd betalningsskyldighet';
  end if;

  return new;
end $$;

drop trigger if exists quotes_reverse_charge_guard on public.quotes;
create trigger quotes_reverse_charge_guard
before insert or update on public.quotes
for each row execute function public.guard_reverse_charge_document();

drop trigger if exists invoices_reverse_charge_guard on public.invoices;
create trigger invoices_reverse_charge_guard
before insert or update on public.invoices
for each row execute function public.guard_reverse_charge_document();

-- Radens grind: en rad kan inte smygas in med moms på ett dokument som redan är
-- omvänt. Utan den räckte det att lägga till en rad efteråt för att fakturan
-- skulle bli formellt fel.
create or replace function public.guard_reverse_charge_item()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reverse boolean;
begin
  if new.vat_rate = 0 then
    return new;
  end if;
  if tg_table_name = 'quote_items' then
    select reverse_charge into v_reverse from public.quotes where id = new.quote_id;
  else
    select reverse_charge into v_reverse from public.invoices where id = new.invoice_id;
  end if;
  if coalesce(v_reverse, false) then
    raise exception 'Dokumentet har omvänd betalningsskyldighet — raden måste ha 0 %% moms'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists quote_items_reverse_charge_guard on public.quote_items;
create trigger quote_items_reverse_charge_guard
before insert or update on public.quote_items
for each row execute function public.guard_reverse_charge_item();

drop trigger if exists invoice_items_reverse_charge_guard on public.invoice_items;
create trigger invoice_items_reverse_charge_guard
before insert or update on public.invoice_items
for each row execute function public.guard_reverse_charge_item();

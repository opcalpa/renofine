-- Moms på offert och faktura — beräknad EN gång och lagrad, aldrig vid rendering.
--
-- Nio ytor räknade `subtotal * 0.25` när dokumentet visades (ViewQuote,
-- ViewQuoteV2, ViewInvoice, ViewInvoiceV2, QuoteDocument, QuoteSummary,
-- InvoicePreview, quotePdfService, invoicePdfService). Det gör varje 12/6/0 %-rad
-- fel, gör omvänd byggmoms omöjlig och blockerar SIE4 — en verifikation kräver
-- netto och moms per sats, inte en gissning vid visning.
--
-- Modellen följer husets egen `total_price`, som redan är en GENERATED-kolumn:
-- radens moms härleds av databasen ur radens pris och sats, och huvudets summor
-- underhålls av en trigger. Då kan ingen skrivväg — varken de nio befintliga
-- eller nästa som skrivs — spara ett dokument utan moms.
--
-- REVERT:
--   drop trigger if exists quote_items_vat_rollup on public.quote_items;
--   drop trigger if exists invoice_items_vat_rollup on public.invoice_items;
--   drop function if exists public.recompute_document_vat();
--   alter table public.quote_items   drop column if exists vat_amount, drop column if exists vat_rate;
--   alter table public.invoice_items drop column if exists vat_amount, drop column if exists vat_rate;
--   alter table public.quotes   drop column if exists vat_total, drop column if exists vat_breakdown;
--   alter table public.invoices drop column if exists vat_total, drop column if exists vat_breakdown;

-- 1. Raderna. Satsen är 25 % som default (bygg- och anläggningstjänster samt
--    byggmaterial, Skatteverket). 12/6 finns för det som är udda, 0 för undantag
--    och omvänd betalningsskyldighet.
alter table public.quote_items
  add column if not exists vat_rate numeric(5,2) not null default 25.00;
alter table public.invoice_items
  add column if not exists vat_rate numeric(5,2) not null default 25.00;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'quote_items_vat_rate_known') then
    alter table public.quote_items add constraint quote_items_vat_rate_known
      check (vat_rate in (0, 6, 12, 25));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'invoice_items_vat_rate_known') then
    alter table public.invoice_items add constraint invoice_items_vat_rate_known
      check (vat_rate in (0, 6, 12, 25));
  end if;
end $$;

-- Radpriset är EXKLUSIVE moms här (till skillnad från ett inköpskvitto, där
-- totalen är brutto). Uttrycket upprepar `total_price`:s egen formel — Postgres
-- tillåter inte att en genererad kolumn läser en annan.
alter table public.quote_items
  add column if not exists vat_amount numeric(12,2)
  generated always as (
    round((quantity * unit_price) * (1 - coalesce(discount_percent, 0) / 100.0) * vat_rate / 100.0, 2)
  ) stored;

alter table public.invoice_items
  add column if not exists vat_amount numeric(12,2)
  generated always as (
    round((quantity * unit_price) * (1 - coalesce(discount_percent, 0) / 100.0) * vat_rate / 100.0, 2)
  ) stored;

comment on column public.quote_items.vat_rate is 'Radens momssats i procent (25/12/6/0).';
comment on column public.quote_items.vat_amount is 'Radens moms i kronor, härledd av databasen ur pris × sats. Kan aldrig drifta från raden.';
comment on column public.invoice_items.vat_rate is 'Radens momssats i procent (25/12/6/0).';
comment on column public.invoice_items.vat_amount is 'Radens moms i kronor, härledd av databasen ur pris × sats.';

-- 2. Huvudet. `vat_breakdown` är underlag och moms PER SATS — det är vad
--    SIE-verifikationen och momsdeklarationen läser. Att summera raderna vid
--    exporttillfället vore att räkna om vid visning, fast på ett nytt ställe.
alter table public.quotes
  add column if not exists vat_total numeric(12,2) not null default 0,
  add column if not exists vat_breakdown jsonb not null default '[]'::jsonb;
alter table public.invoices
  add column if not exists vat_total numeric(12,2) not null default 0,
  add column if not exists vat_breakdown jsonb not null default '[]'::jsonb;

comment on column public.quotes.vat_total is 'Summan av radernas moms. Underhålls av trigger, sätts aldrig av appen.';
comment on column public.quotes.vat_breakdown is 'Underlag och moms per sats: [{"rate":25,"net":941.60,"vat":235.40}]. Vad momsdeklarationen och SIE läser.';
comment on column public.invoices.vat_total is 'Summan av radernas moms. Underhålls av trigger, sätts aldrig av appen.';
comment on column public.invoices.vat_breakdown is 'Underlag och moms per sats: [{"rate":25,"net":941.60,"vat":235.40}].';

-- 3. Rullningen upp till huvudet. SECURITY DEFINER därför att den som får skriva
--    en rad också måste kunna uppdatera dokumentets summor — men funktionen rör
--    ENBART huvudraden som radens främmande nyckel pekar på, inget annat.
create or replace function public.recompute_document_vat()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quote_id   uuid;
  v_invoice_id uuid;
begin
  if tg_table_name = 'quote_items' then
    v_quote_id := coalesce(new.quote_id, old.quote_id);
    update public.quotes q
    set vat_total = coalesce(agg.vat_total, 0),
        vat_breakdown = coalesce(agg.breakdown, '[]'::jsonb)
    from (
      select
        round(sum(vat), 2) as vat_total,
        jsonb_agg(jsonb_build_object('rate', rate, 'net', net, 'vat', vat) order by rate desc) as breakdown
      from (
        select vat_rate as rate,
               round(sum(total_price), 2) as net,
               round(sum(vat_amount), 2) as vat
        from public.quote_items
        where quote_id = v_quote_id
        group by vat_rate
      ) per_rate
    ) agg
    where q.id = v_quote_id;
  else
    v_invoice_id := coalesce(new.invoice_id, old.invoice_id);
    update public.invoices i
    set vat_total = coalesce(agg.vat_total, 0),
        vat_breakdown = coalesce(agg.breakdown, '[]'::jsonb)
    from (
      select
        round(sum(vat), 2) as vat_total,
        jsonb_agg(jsonb_build_object('rate', rate, 'net', net, 'vat', vat) order by rate desc) as breakdown
      from (
        select vat_rate as rate,
               round(sum(total_price), 2) as net,
               round(sum(vat_amount), 2) as vat
        from public.invoice_items
        where invoice_id = v_invoice_id
        group by vat_rate
      ) per_rate
    ) agg
    where i.id = v_invoice_id;
  end if;
  return null;
end $$;

drop trigger if exists quote_items_vat_rollup on public.quote_items;
create trigger quote_items_vat_rollup
after insert or update or delete on public.quote_items
for each row execute function public.recompute_document_vat();

drop trigger if exists invoice_items_vat_rollup on public.invoice_items;
create trigger invoice_items_vat_rollup
after insert or update or delete on public.invoice_items
for each row execute function public.recompute_document_vat();

-- 4. Backfill. Befintliga dokument har visats med 25 % hela tiden, så lagrat och
--    visat blir samma sak — inget belopp ändras för någon som redan fått en offert.
update public.quotes q
set vat_total = coalesce(agg.vat_total, 0),
    vat_breakdown = coalesce(agg.breakdown, '[]'::jsonb)
from (
  select quote_id,
         round(sum(vat), 2) as vat_total,
         jsonb_agg(jsonb_build_object('rate', rate, 'net', net, 'vat', vat) order by rate desc) as breakdown
  from (
    select quote_id, vat_rate as rate,
           round(sum(total_price), 2) as net,
           round(sum(vat_amount), 2) as vat
    from public.quote_items
    group by quote_id, vat_rate
  ) per_rate
  group by quote_id
) agg
where q.id = agg.quote_id;

update public.invoices i
set vat_total = coalesce(agg.vat_total, 0),
    vat_breakdown = coalesce(agg.breakdown, '[]'::jsonb)
from (
  select invoice_id,
         round(sum(vat), 2) as vat_total,
         jsonb_agg(jsonb_build_object('rate', rate, 'net', net, 'vat', vat) order by rate desc) as breakdown
  from (
    select invoice_id, vat_rate as rate,
           round(sum(total_price), 2) as net,
           round(sum(vat_amount), 2) as vat
    from public.invoice_items
    group by invoice_id, vat_rate
  ) per_rate
  group by invoice_id
) agg
where i.id = agg.invoice_id;

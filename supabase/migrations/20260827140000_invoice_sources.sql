-- Timmar, material och godkänd ÄTA som fakturakällor.
--
-- Fram till nu kunde en faktura bara komma från en offert. `CreateInvoiceV2`
-- hade noll referenser till `time_entries` och `purchase_orders`, och
-- `tasks.ata_status` skrevs och visades men konsumerades aldrig: en ÄTA som
-- kunden godkänt kunde inte bli en fakturarad. Det är hela poängen med att
-- registrera timmar i appen, och det var det som saknades.
--
-- Spårningen sitter på FAKTURARADEN, inte på källan. En rad som tas bort
-- frigör då sin källa automatiskt, och en borttagen faktura likaså — utan att
-- någon kod behöver komma ihåg att städa. "Redan fakturerad" är helt enkelt
-- "det finns en fakturarad som pekar hit".
--
-- REVERT:
--   alter table public.invoice_items
--     drop column if exists source_time_entry_id,
--     drop column if exists source_material_id,
--     drop column if exists source_ata_task_id;

alter table public.invoice_items
  add column if not exists source_time_entry_id uuid references public.time_entries(id) on delete set null,
  add column if not exists source_material_id   uuid references public.materials(id) on delete set null,
  add column if not exists source_ata_task_id   uuid references public.tasks(id) on delete set null;

comment on column public.invoice_items.source_time_entry_id is
  'Den godkända timrapport raden fakturerar. Finns den, är timmen fakturerad — därför kan samma timme aldrig hamna på två fakturor.';
comment on column public.invoice_items.source_material_id is
  'Den inköpsrad raden fakturerar vidare till kunden.';
comment on column public.invoice_items.source_ata_task_id is
  'Den godkända ÄTA raden fakturerar. tasks.ata_status = approved var förut en återvändsgränd.';

-- Uppslagen går alltid "har den här källan redan en rad?" — därför index på
-- källorna, inte på fakturan.
create index if not exists invoice_items_source_time_entry_idx
  on public.invoice_items (source_time_entry_id) where source_time_entry_id is not null;
create index if not exists invoice_items_source_material_idx
  on public.invoice_items (source_material_id) where source_material_id is not null;
create index if not exists invoice_items_source_ata_task_idx
  on public.invoice_items (source_ata_task_id) where source_ata_task_id is not null;

-- Samma källa får inte förekomma två gånger, inte ens på samma faktura.
-- Detta är dubbelfaktureringsspärren, och den ska sitta i databasen: en
-- kontroll i appen räcker inte när två flikar är öppna samtidigt.
create unique index if not exists invoice_items_source_time_entry_unique
  on public.invoice_items (source_time_entry_id) where source_time_entry_id is not null;
create unique index if not exists invoice_items_source_material_unique
  on public.invoice_items (source_material_id) where source_material_id is not null;
create unique index if not exists invoice_items_source_ata_task_unique
  on public.invoice_items (source_ata_task_id) where source_ata_task_id is not null;

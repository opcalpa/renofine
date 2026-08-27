-- purchase-vat-capture: momsen som kvittotolkningen redan läser ut ska sparas.
--
-- Fram till nu extraherade process-document-v2 `vat_amount`, visade den i
-- dialogen och kastade den vid spar — ingen tabell hade en momskolumn. Det är
-- ett tapp för proffset (ingående moms är avdragsgill och syntes ingenstans)
-- och det blockerar SIE4 helt: en verifikation kräver netto och moms.
--
-- REVERT (kör detta om migrationen ska backas):
--   alter table public.purchase_orders
--     drop column if exists vat_amount,
--     drop column if exists net_amount,
--     drop column if exists vat_rate;
--   alter table public.materials
--     drop column if exists vat_amount,
--     drop column if exists vat_rate;
--
-- Kolumnerna är NULLABLE med flit. NULL betyder "vet ej" — ett manuellt
-- registrerat inköp och alla rader som fanns före i dag har ingen känd moms,
-- och `not null default 0` hade påstått att de saknar moms. Det är skillnaden
-- mellan ett tomt fält och ett felaktigt underlag i momsdeklarationen.

alter table public.purchase_orders
  add column if not exists vat_amount numeric(12,2),
  add column if not exists net_amount numeric(12,2),
  add column if not exists vat_rate   numeric(5,2);

comment on column public.purchase_orders.vat_amount is
  'Ingående moms som dokumentet visar, i kronor. NULL = okänd, 0 = ingen moms (t.ex. omvänd betalningsskyldighet).';
comment on column public.purchase_orders.net_amount is
  'Momsunderlag = dokumentets bruttosumma minus vat_amount. Räknas på bruttot, före ROT-avdrag — ROT sänker vad kunden betalar, inte underlaget.';
comment on column public.purchase_orders.vat_rate is
  'Satsen i procent (25/12/6/0) när EN sats förklarar hela dokumentet. NULL vid blandade satser eller okänd moms.';

alter table public.materials
  add column if not exists vat_amount numeric(12,2),
  add column if not exists vat_rate   numeric(5,2);

comment on column public.materials.vat_amount is
  'Momsen på radens bruttobelopp (price_total). Sätts bara när dokumentets sats är entydig — en utsmetad moms summerar rätt men ljuger per rad.';
comment on column public.materials.vat_rate is
  'Radens momssats i procent (25/12/6/0). NULL = okänd.';

-- Satserna är begränsade till de Skatteverket känner igen. Ett fritt fält blir
-- förr eller senare 0,25 i stället för 25 och då är hela deklarationen fel.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'purchase_orders_vat_rate_known') then
    alter table public.purchase_orders
      add constraint purchase_orders_vat_rate_known
      check (vat_rate is null or vat_rate in (0, 6, 12, 25));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'materials_vat_rate_known') then
    alter table public.materials
      add constraint materials_vat_rate_known
      check (vat_rate is null or vat_rate in (0, 6, 12, 25));
  end if;
end $$;

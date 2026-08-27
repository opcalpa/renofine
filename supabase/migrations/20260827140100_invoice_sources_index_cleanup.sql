-- Städning direkt efter 20260827140000: de tre vanliga indexen är överflödiga,
-- de unika indexen på samma kolumner betjänar redan uppslagen. Två index på
-- samma kolumn kostar skrivtid utan att ge något.
drop index if exists public.invoice_items_source_time_entry_idx;
drop index if exists public.invoice_items_source_material_idx;
drop index if exists public.invoice_items_source_ata_task_idx;

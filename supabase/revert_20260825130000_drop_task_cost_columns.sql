-- REVERT för 20260825130000_drop_task_cost_columns.sql
-- Återskapar kolumnerna på tasks och läser tillbaka värdena ur task_costs.
-- OBS: detta ÖPPNAR läckan igen (kunden läser hela tasks-raden). Kör bara som
-- nödutgång om något i appen visar sig läsa kolumnerna direkt.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS subcontractor_cost      numeric,
  ADD COLUMN IF NOT EXISTS markup_percent          numeric,
  ADD COLUMN IF NOT EXISTS material_markup_percent numeric,
  ADD COLUMN IF NOT EXISTS labor_cost_percent      numeric;

UPDATE public.tasks t
SET subcontractor_cost      = c.subcontractor_cost,
    markup_percent          = c.markup_percent,
    material_markup_percent = c.material_markup_percent,
    labor_cost_percent      = c.labor_cost_percent
FROM public.task_costs c
WHERE c.task_id = t.id;

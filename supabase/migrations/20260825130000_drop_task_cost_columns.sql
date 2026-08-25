-- ---------------------------------------------------------------------------
-- Steg 2 av kostnadsgränsen: ta bort kolumnerna från tasks.
--
-- KÖR DENNA FÖRST NÄR DEN NYA KODEN ÄR UTE PÅ CLOUDFLARE. Fram till dess läser
-- den live-deployade appen fortfarande t.ex.
--   .select("... subcontractor_cost, markup_percent ...")
-- direkt från tasks, och ett drop ger 400 på de anropen.
--
-- Innan dess är läckan bara HALVT stängd: materials och purchase_orders är
-- stängda för kunder (20260825121000), och task_costs har egen policy — men
-- kostnadskolumnerna ligger kvar på tasks-raden med sina värden kvar, och där
-- är RLS radbaserad. Det är detta drop som stänger det sista.
--
-- Säkerhetskoll före drop: task_costs ska ha minst lika många ifyllda värden
-- som tasks hade. Migrationen avbryter hellre än tappar data.
-- Revert: supabase/revert_20260825130000_drop_task_cost_columns.sql
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_tasks_filled integer;
  v_costs_filled integer;
BEGIN
  SELECT count(*) INTO v_tasks_filled
  FROM public.tasks
  WHERE subcontractor_cost IS NOT NULL OR markup_percent IS NOT NULL
     OR material_markup_percent IS NOT NULL OR labor_cost_percent IS NOT NULL;

  SELECT count(*) INTO v_costs_filled
  FROM public.task_costs
  WHERE subcontractor_cost IS NOT NULL OR markup_percent IS NOT NULL
     OR material_markup_percent IS NOT NULL OR labor_cost_percent IS NOT NULL;

  IF v_costs_filled < v_tasks_filled THEN
    RAISE EXCEPTION
      'Avbryter: task_costs har % ifyllda rader men tasks har %. Kör backfillen igen innan drop.',
      v_costs_filled, v_tasks_filled;
  END IF;
END $$;

-- Sista synk för allt som skrivits till tasks mellan de två migrationerna
INSERT INTO public.task_costs (
  task_id, project_id, subcontractor_cost, markup_percent,
  material_markup_percent, labor_cost_percent
)
SELECT t.id, t.project_id, t.subcontractor_cost, t.markup_percent,
       t.material_markup_percent, t.labor_cost_percent
FROM public.tasks t
WHERE t.project_id IS NOT NULL
  AND (t.subcontractor_cost      IS NOT NULL
    OR t.markup_percent          IS NOT NULL
    OR t.material_markup_percent IS NOT NULL
    OR t.labor_cost_percent      IS NOT NULL)
ON CONFLICT (task_id) DO NOTHING;

ALTER TABLE public.tasks
  DROP COLUMN IF EXISTS subcontractor_cost,
  DROP COLUMN IF EXISTS markup_percent,
  DROP COLUMN IF EXISTS material_markup_percent,
  DROP COLUMN IF EXISTS labor_cost_percent;

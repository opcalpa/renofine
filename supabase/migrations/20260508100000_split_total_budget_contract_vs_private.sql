-- Split projects.total_budget into two distinct concepts:
--
-- 1) projects.contract_value (NEW column on projects)
--    - Auto-synced from SUM(quotes.total_amount) WHERE status='accepted'
--    - Includes original quote + accepted ÄTAor
--    - NULL when no accepted quote exists yet
--    - Visible to everyone with project access (PL, kund, delade användare)
--
-- 2) project_private_budget (NEW table)
--    - Hemägarens privata budget-tak (öronmärkt belopp för projektet)
--    - RLS = user_owns_project() ONLY — PL och delade användare kan ALDRIG läsa det
--    - Manuellt fält, ingen auto-sync
--
-- Existing projects.total_budget is preserved (not dropped here) for backwards compat
-- during UI migration. A follow-up migration will drop it.
--
-- =============================================================================
-- REVERT SQL (uncomment to roll back):
-- =============================================================================
-- DROP TRIGGER IF EXISTS trg_quote_status_project_sync ON public.quotes;
-- CREATE OR REPLACE FUNCTION handle_quote_status_project_sync()
-- RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
-- BEGIN
--   IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
--   IF NEW.status = 'accepted' THEN
--     UPDATE projects SET status = 'active' WHERE id = NEW.project_id;
--   ELSIF NEW.status = 'rejected' THEN
--     IF NOT EXISTS (SELECT 1 FROM quotes WHERE project_id = NEW.project_id AND id != NEW.id AND status IN ('draft','sent','accepted')) THEN
--       UPDATE projects SET status = 'quote_rejected' WHERE id = NEW.project_id;
--     END IF;
--   ELSIF NEW.status = 'sent' THEN UPDATE projects SET status = 'quote_sent' WHERE id = NEW.project_id;
--   ELSIF NEW.status = 'draft' AND OLD.status = 'sent' THEN UPDATE projects SET status = 'quote_created' WHERE id = NEW.project_id;
--   END IF;
--   RETURN NEW;
-- END; $$;
-- CREATE TRIGGER trg_quote_status_project_sync AFTER UPDATE ON public.quotes
--   FOR EACH ROW EXECUTE FUNCTION handle_quote_status_project_sync();
-- DROP TABLE IF EXISTS public.project_private_budget CASCADE;
-- ALTER TABLE public.projects DROP COLUMN IF EXISTS contract_value;
-- =============================================================================

-- 1. Add contract_value column to projects
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS contract_value DECIMAL(12, 2);

COMMENT ON COLUMN public.projects.contract_value IS
  'Auto-synced from SUM(accepted quotes incl. ÄTAor). NULL when no accepted quote. Visible to all with project access.';

-- 2. Create project_private_budget table (owner-only RLS)
CREATE TABLE IF NOT EXISTS public.project_private_budget (
  project_id UUID PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  private_budget_cap DECIMAL(12, 2),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.project_private_budget IS
  'Hemägarens privata budget-tak. RLS = user_owns_project() ENDAST. PL och delade användare ser aldrig detta.';

ALTER TABLE public.project_private_budget ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner can read private budget" ON public.project_private_budget;
CREATE POLICY "Owner can read private budget"
  ON public.project_private_budget FOR SELECT TO authenticated
  USING (user_owns_project(project_id));

DROP POLICY IF EXISTS "Owner can write private budget" ON public.project_private_budget;
CREATE POLICY "Owner can write private budget"
  ON public.project_private_budget FOR ALL TO authenticated
  USING (user_owns_project(project_id))
  WITH CHECK (user_owns_project(project_id));

-- updated_at maintenance
CREATE OR REPLACE FUNCTION public.update_project_private_budget_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_project_private_budget_updated_at ON public.project_private_budget;
CREATE TRIGGER trg_project_private_budget_updated_at
  BEFORE UPDATE ON public.project_private_budget
  FOR EACH ROW
  EXECUTE FUNCTION public.update_project_private_budget_updated_at();

-- 3. Backfill from existing total_budget
-- 3a. Projects WITH at least one accepted quote → contract_value = SUM(accepted quotes)
UPDATE public.projects p
SET contract_value = sub.total
FROM (
  SELECT project_id, COALESCE(SUM(total_amount), 0) AS total
  FROM public.quotes
  WHERE status = 'accepted'
  GROUP BY project_id
) sub
WHERE p.id = sub.project_id;

-- 3b. Projects WITHOUT accepted quote → total_budget (manual entry) becomes private_budget_cap
INSERT INTO public.project_private_budget (project_id, private_budget_cap)
SELECT p.id, p.total_budget
FROM public.projects p
WHERE p.total_budget IS NOT NULL
  AND p.total_budget > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.project_id = p.id AND q.status = 'accepted'
  )
ON CONFLICT (project_id) DO NOTHING;

-- 4. Replace trigger to maintain contract_value (sum of accepted quotes incl. ÄTAor)
CREATE OR REPLACE FUNCTION public.handle_quote_status_project_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id uuid;
  v_sum DECIMAL(12, 2);
  v_has_accepted boolean;
  v_status_changed boolean;
BEGIN
  v_project_id := COALESCE(NEW.project_id, OLD.project_id);

  -- Always recalc contract_value (handles INSERT, UPDATE, DELETE of accepted quotes)
  SELECT COALESCE(SUM(total_amount), 0), COUNT(*) > 0
  INTO v_sum, v_has_accepted
  FROM quotes
  WHERE project_id = v_project_id AND status = 'accepted';

  UPDATE projects
  SET contract_value = CASE WHEN v_has_accepted THEN v_sum ELSE NULL END
  WHERE id = v_project_id;

  -- Status sync — only fire when status actually changed (or on insert with non-draft status)
  v_status_changed := (TG_OP = 'INSERT') OR (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status);

  IF v_status_changed AND TG_OP <> 'DELETE' THEN
    IF NEW.status = 'accepted' THEN
      UPDATE projects SET status = 'active' WHERE id = NEW.project_id;
    ELSIF NEW.status = 'rejected' THEN
      IF NOT EXISTS (
        SELECT 1 FROM quotes
        WHERE project_id = NEW.project_id
          AND id != NEW.id
          AND status IN ('draft', 'sent', 'accepted')
      ) THEN
        UPDATE projects SET status = 'quote_rejected' WHERE id = NEW.project_id;
      END IF;
    ELSIF NEW.status = 'sent' THEN
      UPDATE projects SET status = 'quote_sent' WHERE id = NEW.project_id;
    ELSIF NEW.status = 'draft' AND TG_OP = 'UPDATE' AND OLD.status = 'sent' THEN
      UPDATE projects SET status = 'quote_created' WHERE id = NEW.project_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 5. Recreate trigger to fire on INSERT/UPDATE/DELETE (was UPDATE-only)
DROP TRIGGER IF EXISTS trg_quote_status_project_sync ON public.quotes;
CREATE TRIGGER trg_quote_status_project_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_quote_status_project_sync();

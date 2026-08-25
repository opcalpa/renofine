-- ---------------------------------------------------------------------------
-- REVERT för 20260825120000_task_costs_boundary.sql
-- Kör denna om kostnadsgränsen behöver backas ur.
--
-- ORDNING: kör detta INNAN 20260825130000_drop_task_cost_columns.sql har körts.
-- Har kolumnerna redan dropats måste du först köra revert-filen för DEN
-- migrationen (den återskapar kolumnerna och läser tillbaka från task_costs).
-- ---------------------------------------------------------------------------

-- 1. Läs tillbaka datan till tasks (no-op om kolumnerna fortfarande finns och
--    är i synk, men gör reverten säker även efter en period av dubbelskrivning)
UPDATE public.tasks t
SET subcontractor_cost      = c.subcontractor_cost,
    markup_percent          = c.markup_percent,
    material_markup_percent = c.material_markup_percent,
    labor_cost_percent      = c.labor_cost_percent
FROM public.task_costs c
WHERE c.task_id = t.id;

-- 2. Bort med tabellen
DROP TABLE IF EXISTS public.task_costs;

-- 3. Återställ de hårdnade behörighetsfunktionerna till sin fail-open-form
CREATE OR REPLACE FUNCTION public.user_can_view_purchases(p_project_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM projects
      WHERE id = p_project_id
      AND owner_id = (SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1)
    )
    OR EXISTS (
      SELECT 1 FROM project_shares
      WHERE project_id = p_project_id
      AND shared_with_user_id = (SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1)
      AND (role_type = 'co_owner' OR COALESCE(purchases_access, 'view') != 'none')
    );
$$;

CREATE OR REPLACE FUNCTION public.user_can_view_budget(p_project_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM projects WHERE id = p_project_id
    AND owner_id = (SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1)
  ) OR EXISTS (
    SELECT 1 FROM project_shares
    WHERE project_id = p_project_id
    AND shared_with_user_id = (SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1)
    AND (role_type = 'co_owner' OR COALESCE(budget_access, 'view') != 'none')
  );
$$;

CREATE OR REPLACE FUNCTION public.user_purchases_scope(p_project_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN EXISTS (
        SELECT 1 FROM projects
        WHERE id = p_project_id
        AND owner_id = (SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1)
      ) THEN 'all'
      WHEN EXISTS (
        SELECT 1 FROM project_shares
        WHERE project_id = p_project_id
        AND shared_with_user_id = (SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1)
        AND role_type = 'co_owner'
      ) THEN 'all'
      ELSE (
        SELECT COALESCE(purchases_scope, 'all') FROM project_shares
        WHERE project_id = p_project_id
        AND shared_with_user_id = (SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1)
        LIMIT 1
      )
    END
$$;

DROP FUNCTION IF EXISTS public.user_can_edit_costs(uuid);
DROP FUNCTION IF EXISTS public.user_can_view_costs(uuid);
DROP FUNCTION IF EXISTS public.user_is_client_on_project(uuid);

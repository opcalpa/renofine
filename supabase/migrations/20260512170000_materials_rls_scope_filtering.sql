-- Materials RLS: scope-baserad SELECT-filtrering
--
-- Bakgrund (verifierat 2026-05-12): SELECT-policy
-- "Users can view materials in accessible projects" släppte igenom alla
-- project-medlemmar oavsett purchases_scope. Frontend-filter i
-- PurchaseRequestsTab var enda skyddet → en worker med scope='assigned'
-- kunde via direkt-API (cURL/Postman) läsa andras inköp.
--
-- Fix: ny SECURITY DEFINER-funktion user_purchases_scope() som returnerar
-- 'all' för owners/co-owners eller share-purchases_scope-värde (NULL→'all'
-- för backward-compat). Sen modifierad SELECT-policy som applicerar:
--   - owner / co-owner          → full access
--   - share scope='all'         → full access
--   - share scope='assigned'    → bara egna skapade/tilldelade
--
-- Idempotent.

CREATE OR REPLACE FUNCTION public.user_purchases_scope(p_project_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    CASE
      -- Project owner → full
      WHEN EXISTS (
        SELECT 1 FROM projects
        WHERE id = p_project_id
        AND owner_id = (SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1)
      ) THEN 'all'
      -- Co-owner via project_shares → full
      WHEN EXISTS (
        SELECT 1 FROM project_shares
        WHERE project_id = p_project_id
        AND shared_with_user_id = (SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1)
        AND role_type = 'co_owner'
      ) THEN 'all'
      -- Share-member: returnera deras scope (NULL→'all' för backward-compat
      -- så befintliga shares utan satt scope inte plötsligt förlorar access)
      ELSE (
        SELECT COALESCE(purchases_scope, 'all') FROM project_shares
        WHERE project_id = p_project_id
        AND shared_with_user_id = (SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1)
        LIMIT 1
      )
    END
$$;

COMMENT ON FUNCTION public.user_purchases_scope IS
  'Returnerar purchases-scope för current user i ett projekt. ''all'' för owner/co-owner, share-värdet annars (NULL→''all''). Driver materials RLS scope-filtrering.';

-- Ersätt SELECT-policyn med scope-medveten variant
DROP POLICY IF EXISTS "Users can view materials in accessible projects" ON public.materials;

CREATE POLICY "Users can view materials in accessible projects"
ON public.materials
FOR SELECT
USING (
  is_system_admin()
  OR user_owns_project(project_id)
  OR (
    user_has_project_access(project_id)
    AND (
      user_purchases_scope(project_id) = 'all'
      OR (
        user_purchases_scope(project_id) = 'assigned'
        AND (
          created_by_user_id = get_user_profile_id()
          OR assigned_to_user_id = get_user_profile_id()
        )
      )
    )
  )
  -- Behåll task-baserad backward-compat (gammal mekanism, ej scope-styrd —
  -- riskerar information disclosure för tasks med materials, men eliminerar
  -- regression-risk. Bör fasas ut i Fas 2 efter audit.)
  OR (
    task_id IN (
      SELECT tasks.id FROM tasks
      WHERE user_owns_project(tasks.project_id) OR user_has_project_access(tasks.project_id)
    )
  )
);

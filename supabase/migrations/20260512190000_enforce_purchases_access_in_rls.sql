-- Enforce purchases_access != 'none' in materials SELECT-policy.
--
-- Bakgrund: 20260512180000 tog bort task-clause-läckan ur policy:n men
-- en till läcka kvarstod: en share-medlem med purchases_access='none'
-- ser ändå materials eftersom user_has_project_access(project_id) bara
-- kollar medlemskap, inte specifikt purchases_access. Audit-impersonation
-- bekräftade: sthlmrides (access='none', scope='all') såg alla 11
-- materials på Furusund. Frontend filtrerade — RLS gjorde det inte.
--
-- Fix: en ny SECURITY DEFINER-funktion user_can_view_purchases(project_id)
-- som returnerar true om användaren är owner, co-owner, eller har share
-- med purchases_access != 'none'. Policyn kollar funktionen.
--
-- Verifiering planerad: sthlmrides (access='none') → 0 synliga materials.

CREATE OR REPLACE FUNCTION public.user_can_view_purchases(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    -- Owner
    EXISTS (
      SELECT 1 FROM projects
      WHERE id = p_project_id
      AND owner_id = (SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1)
    )
    -- Eller share-medlem (co-owner eller annan roll) med purchases_access != 'none'
    OR EXISTS (
      SELECT 1 FROM project_shares
      WHERE project_id = p_project_id
      AND shared_with_user_id = (SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1)
      AND (role_type = 'co_owner' OR COALESCE(purchases_access, 'view') != 'none')
    );
$$;

COMMENT ON FUNCTION public.user_can_view_purchases(uuid) IS
  'Returns true if current user has any read access to purchases/materials/POs i projektet. Used by RLS to enforce purchases_access != none.';

-- Uppdatera materials SELECT-policy att också kräva user_can_view_purchases
DROP POLICY IF EXISTS "Users can view materials in accessible projects" ON public.materials;

CREATE POLICY "Users can view materials in accessible projects"
ON public.materials
FOR SELECT
USING (
  is_system_admin()
  OR user_owns_project(project_id)
  OR (
    user_has_project_access(project_id)
    AND user_can_view_purchases(project_id)
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
);

COMMENT ON POLICY "Users can view materials in accessible projects" ON public.materials IS
  'Scope- och access-medveten. Owner/admin → full. Share-medlem → kräver purchases_access != none, sen scope-baserat.';

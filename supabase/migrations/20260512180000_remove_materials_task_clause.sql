-- Remove backward-compat task-clause from materials SELECT-policy.
--
-- Bakgrund: 20260512170000 införde scope-medveten SELECT-policy med en
-- bevarad backward-compat-klausul: `task_id IN (tasks med projekt-access)`.
-- Audit visar att klausulen läcker scope-skydd: en användare med
-- purchases_scope='assigned' ser ändå alla task-kopplade materials
-- skapade av andra. Det förvanskar hela poängen med scope-fältet.
--
-- Verifiering före borttagning (impersonation av sthlmrides):
--   scope='assigned' → ser 5 av Carl's task-materials (LÄCK)
--   scope='all'      → ser 11 (förväntat)
--
-- I nuvarande DB-state finns 0 användare med scope='assigned' OCH
-- purchases_access != 'none'. Inga legitima access-paths går förlorade.
-- (En access='none'-läcka kvarstår — separat fix.)

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
);

COMMENT ON POLICY "Users can view materials in accessible projects" ON public.materials IS
  'Scope-medveten access utan task-clause-läcka. Owner→full, share-medlem→scope-baserat (all eller assigned-only).';

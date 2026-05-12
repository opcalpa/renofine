-- Fix tasks SELECT-policy: enforce tasks_access != 'none' + konsolidera policies.
--
-- Audit-fynd: tasks-tabellen har TVÅ SELECT-policies, ingen kollar tasks_access:
--   1. "Users can view tasks in accessible projects" — owner OR share-medlem
--   2. "tasks_select" — owner OR has_access
--
-- Båda är permissive (OR) så vem som helst med projekt-medlemskap ser ALLA
-- tasks. Test: sthlmrides (tasks_access='none') såg alla 21 tasks på Furusund.
--
-- Detta är samma access-bypass som materials (20260512190000) och PO:s
-- (20260512200000) hade.
--
-- Scope-filter för tasks lämnas till en uppföljning eftersom assignment-
-- arkitekturen är annorlunda (assigned_to_contractor_id mappar mot
-- project_shares-rader). 5 shared users har tasks_scope='assigned' aktivt
-- — de filtreras just nu enbart i frontend.

CREATE OR REPLACE FUNCTION public.user_can_view_tasks(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
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
      AND (role_type = 'co_owner' OR COALESCE(tasks_access, 'view') != 'none')
    );
$$;

COMMENT ON FUNCTION public.user_can_view_tasks(uuid) IS
  'Returns true if current user has any read access to tasks i projektet (tasks_access != none, co-owner eller owner).';

DROP POLICY IF EXISTS "Users can view tasks in accessible projects" ON public.tasks;
DROP POLICY IF EXISTS "tasks_select" ON public.tasks;

CREATE POLICY "Users can view tasks in accessible projects"
ON public.tasks
FOR SELECT
USING (
  is_system_admin()
  OR user_owns_project(project_id)
  OR (
    user_has_project_access(project_id)
    AND user_can_view_tasks(project_id)
  )
);

COMMENT ON POLICY "Users can view tasks in accessible projects" ON public.tasks IS
  'Konsoliderad policy. Owner/admin → full. Share-medlem → kräver tasks_access != none. TODO: scope=assigned filter via separate funktion (5 users aktiverade idag, filtreras bara i frontend).';

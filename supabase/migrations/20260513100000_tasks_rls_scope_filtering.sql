-- Tasks RLS: scope-baserad SELECT-filtrering (#14)
--
-- Bakgrund: project_shares.tasks_scope kan vara 'all' eller 'assigned'.
-- Idag enforceas bara i frontend — RLS-policyn kollar enbart
-- user_can_view_tasks() (binärt tasks_access != 'none').
--
-- 5 demo-users har tasks_scope='assigned' aktivt på public_demo-projektet
-- men ingen är real auth-user (shared_with_user_id IS NULL). Praktisk
-- läcka idag = 0, men gapet är skarpt så fort en real user bjuds in
-- med scope='assigned'.
--
-- Mönster matchar materials (session 17, _170000):
--   user_tasks_scope() → 'all' för owner/co_owner/saknat scope, annars
--   det riktiga värdet.
--   SELECT-policy gatas av (scope='all') OR
--     (scope='assigned' AND (created_by_me OR assigned_to_stakeholder=me))
--
-- assigned_to_stakeholder_id är profile-FK (auth-linkad).
-- assigned_to_contractor_id pekar på addressbook och saknar user-mapping
-- så den lämnas utanför scope-filtret tills vidare.

-- ────────────────────────────────────────────────────────────────────
-- 1. Helper: user_tasks_scope()
-- ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.user_tasks_scope(p_project_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
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
        SELECT COALESCE(tasks_scope, 'all') FROM project_shares
        WHERE project_id = p_project_id
        AND shared_with_user_id = (SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1)
        LIMIT 1
      )
    END
$$;

-- ────────────────────────────────────────────────────────────────────
-- 2. Tasks SELECT-policy med scope-filter
-- ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can view tasks in accessible projects" ON public.tasks;

CREATE POLICY "Users can view tasks in accessible projects"
ON public.tasks FOR SELECT USING (
  is_system_admin()
  OR user_owns_project(project_id)
  OR (
    user_has_project_access(project_id)
    AND user_can_view_tasks(project_id)
    AND (
      user_tasks_scope(project_id) = 'all'
      OR (
        user_tasks_scope(project_id) = 'assigned'
        AND (
          created_by_user_id = get_user_profile_id()
          OR assigned_to_stakeholder_id = get_user_profile_id()
        )
      )
    )
  )
);

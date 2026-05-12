-- Fix RLS-läckor på rooms, milestones, time_entries.
--
-- Audit-fynd (impersonation av sthlmrides på Furusund — alla relevanta
-- access-fält = 'none', förutom customer_view_access='view'):
--   rooms: 5 synliga (space_planner_access='none')
--   milestones: 1 synlig (timeline_access='none')
--   time_entries: 2 synliga (time_tracking_access='none')
--
-- Alla har samma underliggande mönster som materials, PO:s, tasks: policy
-- kollar bara projekt-medlemskap, inte specifikt access-fält.
--
-- Lösning: nya SECURITY DEFINER-funktioner user_can_view_rooms(),
-- user_can_view_timeline(), user_can_view_time_tracking() + uppdaterade
-- policies. Co-owners undantas (ses som owner).
--
-- Lämnar för uppföljning: invoices/quotes/comments (mer komplex
-- creator_id/client_id-logik, separat audit).

-- ────────────────────────────────────────────────────────────────────
-- 1. ROOMS — space_planner_access
-- ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.user_can_view_rooms(p_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM projects WHERE id = p_project_id
    AND owner_id = (SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1)
  ) OR EXISTS (
    SELECT 1 FROM project_shares
    WHERE project_id = p_project_id
    AND shared_with_user_id = (SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1)
    AND (role_type = 'co_owner' OR COALESCE(space_planner_access, 'view') != 'none')
  );
$$;

DROP POLICY IF EXISTS "Users can view rooms in accessible projects" ON public.rooms;

CREATE POLICY "Users can view rooms in accessible projects"
ON public.rooms FOR SELECT USING (
  is_system_admin()
  OR user_owns_project(project_id)
  OR (user_has_project_access(project_id) AND user_can_view_rooms(project_id))
);

-- ────────────────────────────────────────────────────────────────────
-- 2. MILESTONES — timeline_access
-- ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.user_can_view_timeline(p_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM projects WHERE id = p_project_id
    AND owner_id = (SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1)
  ) OR EXISTS (
    SELECT 1 FROM project_shares
    WHERE project_id = p_project_id
    AND shared_with_user_id = (SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1)
    AND (role_type = 'co_owner' OR COALESCE(timeline_access, 'view') != 'none')
  );
$$;

DROP POLICY IF EXISTS "milestones_select" ON public.milestones;

CREATE POLICY "milestones_select"
ON public.milestones FOR SELECT USING (
  is_system_admin()
  OR user_owns_project(project_id)
  OR (user_has_project_access(project_id) AND user_can_view_timeline(project_id))
);

-- ────────────────────────────────────────────────────────────────────
-- 3. TIME_ENTRIES — time_tracking_access
-- ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.user_can_view_time_tracking(p_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM projects WHERE id = p_project_id
    AND owner_id = (SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1)
  ) OR EXISTS (
    SELECT 1 FROM project_shares
    WHERE project_id = p_project_id
    AND shared_with_user_id = (SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1)
    AND (role_type = 'co_owner' OR COALESCE(time_tracking_access, 'view') != 'none')
  );
$$;

DROP POLICY IF EXISTS "time_entries_select" ON public.time_entries;

CREATE POLICY "time_entries_select"
ON public.time_entries FOR SELECT USING (
  is_system_admin()
  OR user_owns_project(project_id)
  OR (user_has_project_access(project_id) AND user_can_view_time_tracking(project_id))
);

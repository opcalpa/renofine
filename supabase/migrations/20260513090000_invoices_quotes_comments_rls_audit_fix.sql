-- Fix RLS-läckor på invoices, quotes, comments.
--
-- Audit-fynd (impersonation av Furusundsgatan 14 — shared user med
-- ALLA access-fält = 'none' förutom customer_view_access='view'):
--   invoices: 1/1 syntetisk synlig (ingen budget_access-koll)
--   quotes:   1/1 syntetisk synlig (Project members can view quotes
--             gick bara på user_has_project_access, binärt medlemskap)
--   comments: 7/7 syntetiska synliga (task-, projekt-, quote-entity-
--             kommentarer alla läckte; ingen entity-baserad gating)
--
-- Pattern matchar session 17 (materials, POs, tasks, rooms, milestones,
-- time_entries): SELECT-policies kollade bara projekt-medlemskap,
-- aldrig specifikt access-fält.
--
-- Beslut (Alt A): gata invoices+quotes via budget_access (inget eget
-- invoices_access/quotes_access-fält finns i schemat idag). Behåll
-- creator_id/client_id som legitima escape hatches.
-- Comments: entity-baserad gating (task → tasks_access, material →
-- purchases_access, quote → budget_access, room → space_planner,
-- project/photo → overview_access). Författaren ser alltid sin egen
-- kommentar.

-- ────────────────────────────────────────────────────────────────────
-- 1. Nya helpers: user_can_view_budget, user_can_view_overview
-- ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.user_can_view_budget(p_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
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

CREATE OR REPLACE FUNCTION public.user_can_view_overview(p_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM projects WHERE id = p_project_id
    AND owner_id = (SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1)
  ) OR EXISTS (
    SELECT 1 FROM project_shares
    WHERE project_id = p_project_id
    AND shared_with_user_id = (SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1)
    AND (role_type = 'co_owner' OR COALESCE(overview_access, 'view') != 'none')
  );
$$;

-- ────────────────────────────────────────────────────────────────────
-- 2. INVOICES — gata via budget_access (behåll creator/client/owner)
-- ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can view invoices for their projects" ON public.invoices;

CREATE POLICY "Users can view invoices for their projects"
ON public.invoices FOR SELECT USING (
  is_system_admin()
  OR creator_id = get_user_profile_id()
  OR client_id = get_user_profile_id()
  OR user_owns_project(project_id)
  OR (user_has_project_access(project_id) AND user_can_view_budget(project_id))
);

-- ────────────────────────────────────────────────────────────────────
-- 3. QUOTES — gata via budget_access (behåll creator/client-policies)
-- ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Project members can view quotes" ON public.quotes;

CREATE POLICY "Project members can view quotes"
ON public.quotes FOR SELECT USING (
  is_system_admin()
  OR user_owns_project(project_id)
  OR (user_has_project_access(project_id) AND user_can_view_budget(project_id))
);

-- Stram även UPDATE för project members
DROP POLICY IF EXISTS "Project members can update quotes" ON public.quotes;

CREATE POLICY "Project members can update quotes"
ON public.quotes FOR UPDATE TO authenticated
USING (
  user_owns_project(project_id)
  OR (user_has_project_access(project_id) AND user_can_view_budget(project_id))
)
WITH CHECK (
  user_owns_project(project_id)
  OR (user_has_project_access(project_id) AND user_can_view_budget(project_id))
);

-- ────────────────────────────────────────────────────────────────────
-- 4. COMMENTS — entity-baserad gating via central helper
-- ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.user_can_view_comment(
  p_project_id uuid,
  p_task_id uuid,
  p_material_id uuid,
  p_entity_type text,
  p_entity_id text
)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uuid_re text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_pid uuid;
BEGIN
  -- Task-attached comment (FK)
  IF p_task_id IS NOT NULL THEN
    SELECT t.project_id INTO v_pid FROM tasks t WHERE t.id = p_task_id;
    IF v_pid IS NULL THEN RETURN FALSE; END IF;
    RETURN user_owns_project(v_pid)
       OR (user_has_project_access(v_pid) AND user_can_view_tasks(v_pid));
  END IF;

  -- Material-attached comment (FK)
  IF p_material_id IS NOT NULL THEN
    SELECT m.project_id INTO v_pid FROM materials m WHERE m.id = p_material_id;
    IF v_pid IS NULL THEN RETURN FALSE; END IF;
    RETURN user_owns_project(v_pid)
       OR (user_has_project_access(v_pid) AND user_can_view_purchases(v_pid));
  END IF;

  -- Entity-typed comments
  IF p_entity_type = 'task' AND p_entity_id ~ v_uuid_re THEN
    SELECT t.project_id INTO v_pid FROM tasks t WHERE t.id = p_entity_id::uuid;
    IF v_pid IS NULL THEN RETURN FALSE; END IF;
    RETURN user_owns_project(v_pid)
       OR (user_has_project_access(v_pid) AND user_can_view_tasks(v_pid));
  END IF;

  IF p_entity_type = 'quote' AND p_entity_id ~ v_uuid_re AND p_project_id IS NOT NULL THEN
    RETURN user_owns_project(p_project_id)
       OR (user_has_project_access(p_project_id) AND user_can_view_budget(p_project_id));
  END IF;

  IF p_entity_type = 'room' AND p_entity_id ~ v_uuid_re THEN
    SELECT r.project_id INTO v_pid FROM rooms r WHERE r.id = p_entity_id::uuid;
    IF v_pid IS NULL THEN RETURN FALSE; END IF;
    RETURN user_owns_project(v_pid)
       OR (user_has_project_access(v_pid) AND user_can_view_rooms(v_pid));
  END IF;

  -- project- och photo-entity-typer: bredast rimliga gating = overview_access
  IF p_entity_type IN ('project', 'photo') AND p_project_id IS NOT NULL THEN
    RETURN user_owns_project(p_project_id)
       OR (user_has_project_access(p_project_id) AND user_can_view_overview(p_project_id));
  END IF;

  -- Projekt-nivå-kommentarer (ingen entity, ingen FK)
  IF p_project_id IS NOT NULL
     AND p_task_id IS NULL
     AND p_material_id IS NULL
     AND p_entity_id IS NULL THEN
    RETURN user_owns_project(p_project_id)
       OR (user_has_project_access(p_project_id) AND user_can_view_overview(p_project_id));
  END IF;

  RETURN FALSE;
END;
$$;

-- Drop läckande SELECT-policies (behåller demo-policy + professional_message-policy)
DROP POLICY IF EXISTS "Users can view comments" ON public.comments;
DROP POLICY IF EXISTS "Users can view project comments" ON public.comments;
DROP POLICY IF EXISTS "quote_comments_select" ON public.comments;

CREATE POLICY "Users can view comments"
ON public.comments FOR SELECT USING (
  is_system_admin()
  OR created_by_user_id = get_user_profile_id()
  OR user_can_view_comment(project_id, task_id, material_id, entity_type, entity_id)
);

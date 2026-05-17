-- Team v2 · L7 — internal comments (visible_to_client)
--
-- Adds comments.visible_to_client (DEFAULT true so existing + new comments
-- stay visible to clients/shared users exactly as today — no prod
-- regression; "internal" is opt-in). A new 6-arg user_can_view_comment
-- overload threads the flag so that, per comment type:
--   owner            → sees all (user_owns_project, unconditional)
--   shared w/ access → only when visible_to_client = true
-- Creator + system admin keep full visibility via the policy's OR-clauses
-- (an author always sees their own internal comment).
--
-- NOT feature-flag gated — RLS cannot read a client flag, so this is the
-- live enforcement (same as L1). Idempotent.
-- Revert: supabase/revert_20260517110000_team_v2_comments_visible_to_client.sql

ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS visible_to_client boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.user_can_view_comment(
  p_project_id uuid,
  p_task_id uuid,
  p_material_id uuid,
  p_entity_type text,
  p_entity_id text,
  p_visible_to_client boolean
)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uuid_re text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_pid uuid;
BEGIN
  IF p_task_id IS NOT NULL THEN
    SELECT t.project_id INTO v_pid FROM tasks t WHERE t.id = p_task_id;
    IF v_pid IS NULL THEN RETURN FALSE; END IF;
    RETURN user_owns_project(v_pid)
       OR (user_has_project_access(v_pid) AND user_can_view_tasks(v_pid) AND p_visible_to_client);
  END IF;

  IF p_material_id IS NOT NULL THEN
    SELECT m.project_id INTO v_pid FROM materials m WHERE m.id = p_material_id;
    IF v_pid IS NULL THEN RETURN FALSE; END IF;
    RETURN user_owns_project(v_pid)
       OR (user_has_project_access(v_pid) AND user_can_view_purchases(v_pid) AND p_visible_to_client);
  END IF;

  IF p_entity_type = 'task' AND p_entity_id ~ v_uuid_re THEN
    SELECT t.project_id INTO v_pid FROM tasks t WHERE t.id = p_entity_id::uuid;
    IF v_pid IS NULL THEN RETURN FALSE; END IF;
    RETURN user_owns_project(v_pid)
       OR (user_has_project_access(v_pid) AND user_can_view_tasks(v_pid) AND p_visible_to_client);
  END IF;

  IF p_entity_type = 'quote' AND p_entity_id ~ v_uuid_re AND p_project_id IS NOT NULL THEN
    RETURN user_owns_project(p_project_id)
       OR (user_has_project_access(p_project_id) AND user_can_view_budget(p_project_id) AND p_visible_to_client);
  END IF;

  IF p_entity_type = 'room' AND p_entity_id ~ v_uuid_re THEN
    SELECT r.project_id INTO v_pid FROM rooms r WHERE r.id = p_entity_id::uuid;
    IF v_pid IS NULL THEN RETURN FALSE; END IF;
    RETURN user_owns_project(v_pid)
       OR (user_has_project_access(v_pid) AND user_can_view_rooms(v_pid) AND p_visible_to_client);
  END IF;

  IF p_entity_type IN ('project', 'photo') AND p_project_id IS NOT NULL THEN
    RETURN user_owns_project(p_project_id)
       OR (user_has_project_access(p_project_id) AND user_can_view_overview(p_project_id) AND p_visible_to_client);
  END IF;

  IF p_project_id IS NOT NULL
     AND p_task_id IS NULL
     AND p_material_id IS NULL
     AND p_entity_id IS NULL THEN
    RETURN user_owns_project(p_project_id)
       OR (user_has_project_access(p_project_id) AND user_can_view_overview(p_project_id) AND p_visible_to_client);
  END IF;

  RETURN FALSE;
END;
$function$;

DROP POLICY IF EXISTS "Users can view comments" ON public.comments;

CREATE POLICY "Users can view comments"
ON public.comments
FOR SELECT
USING (
  is_system_admin()
  OR (created_by_user_id = get_user_profile_id())
  OR user_can_view_comment(project_id, task_id, material_id, entity_type, entity_id, visible_to_client)
);

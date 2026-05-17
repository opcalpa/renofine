-- Revert 20260517110000_team_v2_comments_visible_to_client
-- Restores the pre-L7 comments SELECT policy (5-arg user_can_view_comment),
-- drops the 6-arg overload and the visible_to_client column. Idempotent.

DROP POLICY IF EXISTS "Users can view comments" ON public.comments;

CREATE POLICY "Users can view comments"
ON public.comments
FOR SELECT
USING (
  is_system_admin()
  OR (created_by_user_id = get_user_profile_id())
  OR user_can_view_comment(project_id, task_id, material_id, entity_type, entity_id)
);

DROP FUNCTION IF EXISTS public.user_can_view_comment(uuid, uuid, uuid, text, text, boolean);

ALTER TABLE public.comments DROP COLUMN IF EXISTS visible_to_client;

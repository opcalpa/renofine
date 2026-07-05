-- Fix activity_log INSERT policy: include the OWNER path.
--
-- The round-7 policy (20260705150000) gated inserts on user_has_project_access(),
-- which only checks project_shares — project OWNERS are not in that table, so
-- their Renaida receipt rows still got 42501 (verified via network trace,
-- loop round 8 2026-07-05: POST /rest/v1/activity_log → 403 while the task
-- insert succeeded). Classic both-paths RLS miss: shared users passed, owners never.
--
-- Revert:
--   DROP POLICY "Users can log activity for their projects" ON public.activity_log;
--   CREATE POLICY "Users can log activity for their projects"
--     ON public.activity_log FOR INSERT
--     WITH CHECK (
--       user_has_project_access(project_id)
--       AND actor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
--     );

DROP POLICY IF EXISTS "Users can log activity for their projects" ON public.activity_log;
CREATE POLICY "Users can log activity for their projects"
  ON public.activity_log FOR INSERT
  WITH CHECK (
    (user_owns_project(project_id) OR user_has_project_access(project_id))
    AND actor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

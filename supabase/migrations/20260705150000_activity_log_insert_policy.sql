-- activity_log INSERT policy — the table only ever had SELECT policies, so every
-- client-side insert (Renaida's renaida_* receipt rows, written best-effort by
-- applyProposals since Fas A) was silently rejected by RLS; only the DB triggers'
-- generic rows landed. Found by loop round 7 (2026-07-05): feed showed
-- "Carl skapade rum" (trigger) but never "Renaida skapade rummet" (receipt).
--
-- Revert: DROP POLICY "Users can log activity for their projects" ON public.activity_log;

DROP POLICY IF EXISTS "Users can log activity for their projects" ON public.activity_log;
CREATE POLICY "Users can log activity for their projects"
  ON public.activity_log FOR INSERT
  WITH CHECK (
    user_has_project_access(project_id)
    AND actor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

-- Renaida undo survives reloads: applied proposal batches persist their
-- reversal ops here, so "everything has Undo" holds even after the
-- conversation (component state) is gone. Loop round 15, friction #1:
-- a receipt import could not be reverted after a page load.
--
-- Profile-scoped like renaida_user_memory: you can only ever see/undo the
-- changes Renaida made FOR YOU. Rows are never deleted on undo — undone_at
-- marks them spent (audit trail stays).

CREATE TABLE IF NOT EXISTS public.renaida_undo_stack (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  -- Human-readable summary of what the batch did ("Kvitto från BILTEMA …").
  label       text NOT NULL,
  -- Serialized UndoOp[] exactly as applyProposals produced them (reverse order).
  ops         jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  undone_at   timestamptz
);

-- The only read path: newest un-undone batch for (me, this project).
CREATE INDEX IF NOT EXISTS renaida_undo_stack_lookup_idx
  ON public.renaida_undo_stack (profile_id, project_id, created_at DESC);

ALTER TABLE public.renaida_undo_stack ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS renaida_undo_stack_select ON public.renaida_undo_stack;
CREATE POLICY renaida_undo_stack_select ON public.renaida_undo_stack FOR SELECT
  USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS renaida_undo_stack_insert ON public.renaida_undo_stack;
CREATE POLICY renaida_undo_stack_insert ON public.renaida_undo_stack FOR INSERT
  WITH CHECK (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS renaida_undo_stack_update ON public.renaida_undo_stack;
CREATE POLICY renaida_undo_stack_update ON public.renaida_undo_stack FOR UPDATE
  USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS renaida_undo_stack_delete ON public.renaida_undo_stack;
CREATE POLICY renaida_undo_stack_delete ON public.renaida_undo_stack FOR DELETE
  USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

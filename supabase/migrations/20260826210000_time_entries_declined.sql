-- Saying no to reported hours.
--
-- time_entries has `approved` but no way to record a NO. Without one, declined
-- hours would either sit unapproved in the builder's inbox forever or have to
-- be deleted — and deleting what a worker claimed they worked is the one thing
-- that must leave a trace.
--
-- Revert:
--   ALTER TABLE public.time_entries DROP COLUMN IF EXISTS declined_at;
--   ALTER TABLE public.time_entries DROP COLUMN IF EXISTS declined_by;

ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS declined_at timestamptz,
  ADD COLUMN IF NOT EXISTS declined_by uuid REFERENCES public.profiles(id);

-- What the builder still owes an answer on: reported, not yet judged.
CREATE INDEX IF NOT EXISTS time_entries_awaiting_idx
  ON public.time_entries (project_id)
  WHERE approved = false AND declined_at IS NULL AND worker_token_id IS NOT NULL;

COMMENT ON COLUMN public.time_entries.declined_at IS
  'Set when the builder rejected reported hours. The row is kept — a claim that was made should stay visible.';

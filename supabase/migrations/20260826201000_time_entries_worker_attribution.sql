-- Hours from the field, from someone who has no account.
--
-- time_entries.user_id was NOT NULL and references profiles, so a worker on a
-- token link had no way in at all — and hours are the number the invoice is
-- built from. A worker is identified by their token (the person), never by the
-- project owner's id, which would credit the owner with the worker's day.
--
-- Exactly one attribution must be present. The CHECK is what makes that a
-- guarantee rather than a convention.
--
-- Revert (safe: no rows have worker_token_id until the field starts writing):
--   DELETE FROM public.time_entries WHERE user_id IS NULL;
--   ALTER TABLE public.time_entries DROP CONSTRAINT IF EXISTS time_entries_one_author;
--   ALTER TABLE public.time_entries DROP COLUMN IF EXISTS worker_token_id;
--   ALTER TABLE public.time_entries ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS worker_token_id uuid
    REFERENCES public.worker_access_tokens(id) ON DELETE SET NULL;

ALTER TABLE public.time_entries ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.time_entries DROP CONSTRAINT IF EXISTS time_entries_one_author;
ALTER TABLE public.time_entries
  ADD CONSTRAINT time_entries_one_author
  CHECK (num_nonnulls(user_id, worker_token_id) = 1);

CREATE INDEX IF NOT EXISTS time_entries_worker_token_idx
  ON public.time_entries (worker_token_id) WHERE worker_token_id IS NOT NULL;

-- Hours reported from site arrive UNAPPROVED and wait for the builder, the
-- same way a purchase request does. `approved` already defaults to false.
COMMENT ON COLUMN public.time_entries.worker_token_id IS
  'Set when the hours came from a worker link. Mutually exclusive with user_id.';

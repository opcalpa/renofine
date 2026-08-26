-- "I have read the job."
--
-- The only signal a builder had was last_accessed_at — that the link was
-- opened. Opened is not read, and read is not understood. One tap turns a
-- delivery receipt into a confirmation, which is what matters when the
-- instruction is in a language the reader learned second.
--
-- Revert:
--   ALTER TABLE public.worker_access_tokens DROP COLUMN IF EXISTS acknowledged_at;

ALTER TABLE public.worker_access_tokens
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz;

COMMENT ON COLUMN public.worker_access_tokens.acknowledged_at IS
  'When the worker confirmed they had read the job. Set once, never cleared by a re-open.';

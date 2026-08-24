-- S7 — is this a home you live in, one you have left, or something the app
-- does not know about yet?
--
-- Three states, but a person only ever picks two. NULL is not a choice, it is
-- "not answered", and it has to be the default: the backfill named 46 addresses
-- after their project and a new account creates throwaway ones while poking
-- around. Making them all claim to be homes would be the app asserting
-- something nobody told it.
--
-- Deliberately NOT `archived_at` (which stays reserved and unused): that column
-- is filtered out of every list, and a former home must stay visible — last in
-- the list, but reachable. Selling is precisely when its renovation history
-- becomes the document you need.
--
-- REVERT:
--   ALTER TABLE public.properties DROP COLUMN IF EXISTS residence_status;

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS residence_status text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'properties_residence_status_check'
  ) THEN
    ALTER TABLE public.properties
      ADD CONSTRAINT properties_residence_status_check
      CHECK (residence_status IS NULL OR residence_status IN ('current', 'former'));
  END IF;
END $$;

COMMENT ON COLUMN public.properties.residence_status IS
  'S7: current = lived in (several may be current at once — home plus summer house), former = left/sold but kept as documentation, NULL = not answered yet.';

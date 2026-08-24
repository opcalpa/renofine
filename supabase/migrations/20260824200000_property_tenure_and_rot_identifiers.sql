-- P2 — how the home is held, and the identifiers ROT actually asks for.
--
-- S7 set the rule for adding a type: only when a document says different
-- things depending on it. This is the one that does. Verified against
-- skatteverket.se (2026-08-24):
--
--   • rotavdrag applies to "hens småhus, ägarlägenhet eller bostadsrätt" —
--     the customer must own the home ("Kunden måste äga bostaden under den
--     period som arbetet utförs"). A "hyrd bostad" gives no rotavdrag at all.
--   • småhus      → "Fastighetsbeteckningen" (on the taxeringsbeslut / Mina sidor)
--   • bostadsrätt → "Bostadsrättsföreningens organisationsnummer och
--                    lägenhetsnummer (vanligen fyra siffror)"
--
-- Until now the app only had `property_designation`. A bostadsrätt owner —
-- probably most of the Stockholm users — was shown a field they cannot fill in
-- and no hint that something else applies to them. That is the gap.
--
-- NULL tenure is "not answered", never a guess. Note that this is OWNERSHIP
-- form, not building form: `AIPropertyType` (apartment/villa/townhouse/
-- summerhouse) on the project draft says nothing about it — an ägarlägenhet is
-- an apartment you own outright, and a summer house is normally äganderätt.
-- Do not derive one from the other.
--
-- REVERT:
--   ALTER TABLE public.properties
--     DROP COLUMN IF EXISTS tenure,
--     DROP COLUMN IF EXISTS brf_name,
--     DROP COLUMN IF EXISTS brf_org_number,
--     DROP COLUMN IF EXISTS apartment_number;

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS tenure text,
  ADD COLUMN IF NOT EXISTS brf_name text,
  ADD COLUMN IF NOT EXISTS brf_org_number text,
  ADD COLUMN IF NOT EXISTS apartment_number text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'properties_tenure_check'
  ) THEN
    ALTER TABLE public.properties
      ADD CONSTRAINT properties_tenure_check
      CHECK (tenure IS NULL OR tenure IN ('bostadsratt', 'aganderatt', 'hyresratt'));
  END IF;
END $$;

COMMENT ON COLUMN public.properties.tenure IS
  'P2: how the home is HELD, not what it looks like. bostadsratt | aganderatt (incl. ägarlägenhet) | hyresratt; NULL = not answered. Decides which ROT identifiers apply, and whether ROT applies at all.';
COMMENT ON COLUMN public.properties.brf_name IS
  'P2: the housing association''s name. Convenience for the user; Skatteverket asks for the org number.';
COMMENT ON COLUMN public.properties.brf_org_number IS
  'P2: the bostadsrättsförening''s organisationsnummer — what Skatteverket asks for on bostadsrätt ROT work.';
COMMENT ON COLUMN public.properties.apartment_number IS
  'P2: lägenhetsnummer, usually four digits (Skatteverket: "vanligen fyra siffror"). Stored as text — leading zeros are part of it.';

-- No new functions, so no EXECUTE grants to harden here. RLS on `properties`
-- is unchanged and already covers these columns: the policies gate the ROW.

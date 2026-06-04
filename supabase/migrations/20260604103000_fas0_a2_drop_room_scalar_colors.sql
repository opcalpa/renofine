-- Fas 0 / Migration A2 (contract step) — drop the three scalar room color columns.
-- Applied after the new frontend bundle + redeployed get-worker-data went live, so
-- nothing selects these columns anymore (all reads/writes use the JSONB specs).
-- A1 already backfilled their values into wall_spec.main_color / ceiling_spec.color /
-- joinery_spec.frame_color. The `color` scalar (room identity) is intentionally kept.
--
-- REVERT (data lives in JSONB specs; re-added columns would be empty):
--   ALTER TABLE rooms ADD COLUMN IF NOT EXISTS wall_color TEXT;
--   ALTER TABLE rooms ADD COLUMN IF NOT EXISTS ceiling_color TEXT;
--   ALTER TABLE rooms ADD COLUMN IF NOT EXISTS trim_color TEXT;

ALTER TABLE rooms DROP COLUMN IF EXISTS wall_color;
ALTER TABLE rooms DROP COLUMN IF EXISTS ceiling_color;
ALTER TABLE rooms DROP COLUMN IF EXISTS trim_color;

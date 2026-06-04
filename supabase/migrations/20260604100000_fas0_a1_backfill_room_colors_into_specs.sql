-- Fas 0 / Migration A1 (expand step) — backfill scalar room colors into their JSONB specs.
-- This is the ADDITIVE half of dropping the scalar color columns. It never drops anything,
-- so it is safe to apply before the new frontend bundle is deployed.
-- The DROP half lives in the held file: .claude-tmp/fas0-a2-drop-room-scalar-colors.sql
-- (moved into migrations and pushed only AFTER frontend + get-worker-data are deployed).
--
-- Canonical JSONB homes:
--   wall_color   -> wall_spec.main_color
--   ceiling_color-> ceiling_spec.color
--   trim_color   -> joinery_spec.frame_color   (new field)
--
-- The `color` scalar (room identity / canvas fill) is intentionally KEPT — it is not a
-- surface spec and has no JSONB home.
--
-- REVERT: this migration only fills empty JSONB fields; it does not destroy the scalar
-- columns, so the source data is still intact. To undo, no action is strictly required.

-- wall_color -> wall_spec.main_color (only where the spec field is empty)
UPDATE rooms
SET wall_spec = coalesce(wall_spec, '{}'::jsonb) || jsonb_build_object('main_color', wall_color)
WHERE wall_color IS NOT NULL
  AND wall_color <> ''
  AND coalesce(wall_spec->>'main_color', '') = '';

-- ceiling_color -> ceiling_spec.color (only where the spec field is empty)
UPDATE rooms
SET ceiling_spec = coalesce(ceiling_spec, '{}'::jsonb) || jsonb_build_object('color', ceiling_color)
WHERE ceiling_color IS NOT NULL
  AND ceiling_color <> ''
  AND coalesce(ceiling_spec->>'color', '') = '';

-- trim_color -> joinery_spec.frame_color (new field, only where empty)
UPDATE rooms
SET joinery_spec = coalesce(joinery_spec, '{}'::jsonb) || jsonb_build_object('frame_color', trim_color)
WHERE trim_color IS NOT NULL
  AND trim_color <> ''
  AND coalesce(joinery_spec->>'frame_color', '') = '';

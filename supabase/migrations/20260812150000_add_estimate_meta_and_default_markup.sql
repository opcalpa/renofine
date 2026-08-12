-- E2/E3 (epic renaida-quote-flow): estimate provenance + builder markup defaults.
--
-- tasks.estimate_meta: where a suggested calc came from, so the planning table
-- can show the formula and mark it "own" once the builder edits.
--   { "source": "renaida_calc", "formula": "33.3 m² vägg ÷ 10 m²/h ≈ 3.5 h",
--     "overridden": false }
--
-- profiles.default_markup_percent / default_material_markup_percent: the gap
-- found 2026-08-12 — profiles held default_hourly_rate + estimation_settings
-- but no default markups (markup existed only per task/material).
--
-- Revert:
--   ALTER TABLE tasks DROP COLUMN IF EXISTS estimate_meta;
--   ALTER TABLE profiles DROP COLUMN IF EXISTS default_markup_percent;
--   ALTER TABLE profiles DROP COLUMN IF EXISTS default_material_markup_percent;

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimate_meta JSONB;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS default_markup_percent NUMERIC;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS default_material_markup_percent NUMERIC;

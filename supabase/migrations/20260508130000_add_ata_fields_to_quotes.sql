-- ÄTA V2 — adds reason + time-shift fields to the quotes table.
-- Both nullable; only set when is_ata=true. RLS unchanged (the existing quote
-- policies already cover these new columns).
--
-- Revert (run if rolling back):
--   ALTER TABLE quotes
--     DROP COLUMN IF EXISTS ata_reason,
--     DROP COLUMN IF EXISTS ata_time_shift_days;

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS ata_reason TEXT,
  ADD COLUMN IF NOT EXISTS ata_time_shift_days INTEGER;

COMMENT ON COLUMN quotes.ata_reason IS 'ÄTA: customer-facing reason for the change order. Rendered in the dedicated AtaView with a green border. Only set when is_ata=true.';
COMMENT ON COLUMN quotes.ata_time_shift_days IS 'ÄTA: number of days the change order shifts the project end-date. Positive = delay. Only set when is_ata=true.';

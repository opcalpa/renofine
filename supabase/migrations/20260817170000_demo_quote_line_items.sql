-- Backfill quote line items for the public demo's accepted quote OF-2026-001.
--
-- seed_demo_content creates the quote HEADER (total 134 000, ROT 21 120, after
-- 112 880) but never inserted any quote_items, so the accepted quote rendered
-- as an empty 0 kr document for any visitor who opened it (Carl 2026-08-17).
-- These 12 lines mirror the demo's tasks 1:1 — customer prices ex VAT (sum
-- 134 000) and the same per-task ROT the tasks already carry (sum 21 120) — so
-- the quote view shows a coherent breakdown: Delsumma 134 000 · Moms 25% ·
-- ROT −21 120 · Att betala.
--
-- Idempotent: only inserts when the quote exists and has no items yet.
-- FOLLOW-UP: for full single-source parity, the same INSERT belongs inside
-- seed_demo_content so per-user demos and future rebuilds keep the lines.
DO $$
DECLARE
  v_qid UUID;
  v_pid UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  SELECT id INTO v_qid
  FROM quotes
  WHERE project_id = v_pid AND quote_number = 'OF-2026-001'
  LIMIT 1;

  IF v_qid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM quote_items WHERE quote_id = v_qid) THEN
    INSERT INTO quote_items (quote_id, description, quantity, unit, unit_price, is_rot_eligible, rot_deduction, sort_order) VALUES
      (v_qid, 'Förberedelse och skydd',        1, 'st', 3000,  true, 900,  1),
      (v_qid, 'Rivning och demontering',        1, 'st', 6000,  true, 1650, 2),
      (v_qid, 'Spackling av väggar',            1, 'st', 7000,  true, 2310, 3),
      (v_qid, 'Målning väggar & tak',           1, 'st', 12000, true, 2805, 4),
      (v_qid, 'Tapetsering fondvägg',           1, 'st', 6000,  true, 495,  5),
      (v_qid, 'Tätskikt badrum',                1, 'st', 9000,  true, 1320, 6),
      (v_qid, 'Kakelsättning badrum',           1, 'st', 28000, true, 3300, 7),
      (v_qid, 'Bänkskiva och stänkskydd',       1, 'st', 22000, true, 2970, 8),
      (v_qid, 'Slipning och lackning av golv',  1, 'st', 18000, true, 1980, 9),
      (v_qid, 'Eluttag och belysning',          1, 'st', 12000, true, 660,  10),
      (v_qid, 'Montering av lister',            1, 'st', 7000,  true, 1155, 11),
      (v_qid, 'Slutstädning',                   1, 'st', 4000,  true, 1485, 12);
  END IF;
END $$;

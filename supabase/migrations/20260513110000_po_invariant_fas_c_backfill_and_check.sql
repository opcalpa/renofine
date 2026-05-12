-- PO-invariant Fas C: backfill legacy orphans + skarp CHECK-constraint.
--
-- Bakgrund:
--   Fas 1 (7363b6c, 2026-05-12) eliminerade orphan-skapande från UI-flöden.
--   Verifierat 2026-05-13: 0 orphans skapade efter Fas 1.
--   Men 40 legacy orphans kvarstår (alla skapade feb-april 2026):
--     to_order: 18, submitted: 14, paid: 6, approved: 2
--
-- Plan Fas C:
--   1) Backfill: 13 syntetiska POs (en per project × material.status-grupp),
--      länka alla 40 materials till motsvarande PO.
--      Mapping baseras på empirisk pattern från befintliga POs:
--        to_order  → PO 'pending'
--        submitted → PO 'requested'
--        approved  → PO 'ordered'
--        paid      → PO 'delivered'
--   2) Lägg CHECK constraint (status='planned') = (purchase_order_id IS NULL)
--      Skarp invariant: alla non-planned materials MÅSTE ha PO.
--
-- Reverse: DELETE FROM purchase_orders WHERE notes = 'Backfill...';
--          (Cascade nullifierar materials.purchase_order_id automatiskt om
--           ON DELETE SET NULL — annars manuell UPDATE först).

-- ────────────────────────────────────────────────────────────────────
-- 1. Backfill: skapa POs + länka materials
-- ────────────────────────────────────────────────────────────────────

WITH orphan_groups AS (
  SELECT
    project_id,
    status AS material_status,
    CASE status
      WHEN 'to_order'  THEN 'pending'
      WHEN 'submitted' THEN 'requested'
      WHEN 'approved'  THEN 'ordered'
      WHEN 'paid'      THEN 'delivered'
    END AS po_status,
    SUM(COALESCE(price_total, 0)) AS sum_total,
    MIN(created_at) AS earliest_created
  FROM materials
  WHERE purchase_order_id IS NULL AND status != 'planned'
  GROUP BY project_id, status
),
inserted_pos AS (
  INSERT INTO purchase_orders (project_id, vendor_name, total, status, source, notes, created_at)
  SELECT
    project_id, NULL, sum_total, po_status, 'manual',
    'Backfill: legacy pre-Fas-1 materials (PO-invariant Fas C)',
    earliest_created
  FROM orphan_groups
  RETURNING id, project_id, status AS po_status
)
UPDATE materials m
SET purchase_order_id = ip.id, updated_at = now()
FROM inserted_pos ip
WHERE m.purchase_order_id IS NULL
  AND m.status != 'planned'
  AND m.project_id = ip.project_id
  AND CASE m.status
        WHEN 'to_order'  THEN 'pending'
        WHEN 'submitted' THEN 'requested'
        WHEN 'approved'  THEN 'ordered'
        WHEN 'paid'      THEN 'delivered'
      END = ip.po_status;

-- ────────────────────────────────────────────────────────────────────
-- 2. Skarp PO-invariant CHECK
-- ────────────────────────────────────────────────────────────────────

ALTER TABLE public.materials
  DROP CONSTRAINT IF EXISTS materials_po_invariant_check;

ALTER TABLE public.materials
  ADD CONSTRAINT materials_po_invariant_check
  CHECK ((status = 'planned') = (purchase_order_id IS NULL));

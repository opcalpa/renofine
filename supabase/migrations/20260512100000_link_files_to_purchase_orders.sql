-- Migration: extend task_file_links to support direct links to purchase_orders
--
-- Why: A PO can have multiple attachments (revised quote, photos of damaged
-- goods, follow-up invoice on top of the primary receipt). The primary
-- receipt/quote PDF stays on purchase_orders.receipt_file_path; this column
-- enables N additional attachments per PO via the existing task_file_links
-- table.
--
-- Reverts (manual, in order):
--   DROP VIEW IF EXISTS public.entity_document_counts;
--   ALTER TABLE public.task_file_links
--     DROP CONSTRAINT IF EXISTS chk_entity_link;
--   ALTER TABLE public.task_file_links
--     ADD CONSTRAINT chk_entity_link
--     CHECK (task_id IS NOT NULL OR room_id IS NOT NULL OR material_id IS NOT NULL);
--   DROP INDEX IF EXISTS idx_task_file_links_purchase_order_id;
--   ALTER TABLE public.task_file_links DROP COLUMN IF EXISTS purchase_order_id;

-- 1. Add purchase_order_id column (optional)
ALTER TABLE public.task_file_links
  ADD COLUMN IF NOT EXISTS purchase_order_id UUID
    REFERENCES public.purchase_orders(id) ON DELETE CASCADE;

-- 2. Drop the old constraint that required task_id, room_id, or material_id.
-- It's already missing on remote (legacy migration drift), but DROP IF EXISTS
-- is a safe no-op.
ALTER TABLE public.task_file_links
  DROP CONSTRAINT IF EXISTS chk_entity_link;

-- 3. Re-add constraint including purchase_order_id. NOT VALID so existing
-- orphan rows (pre-existing data drift — rows where all entity refs are NULL)
-- are accepted while new/updated rows must satisfy the rule. We don't VALIDATE
-- separately so as not to require a data cleanup pass right now.
ALTER TABLE public.task_file_links
  ADD CONSTRAINT chk_entity_link
  CHECK (
    task_id IS NOT NULL
    OR room_id IS NOT NULL
    OR material_id IS NOT NULL
    OR purchase_order_id IS NOT NULL
  ) NOT VALID;

-- 4. Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_task_file_links_purchase_order_id
  ON public.task_file_links (purchase_order_id)
  WHERE purchase_order_id IS NOT NULL;

-- 5. Extend entity_document_counts view to include POs
CREATE OR REPLACE VIEW public.entity_document_counts AS
SELECT
  'task' AS entity_type,
  task_id AS entity_id,
  COUNT(*) AS document_count
FROM public.task_file_links
WHERE task_id IS NOT NULL
GROUP BY task_id
UNION ALL
SELECT
  'material' AS entity_type,
  material_id AS entity_id,
  COUNT(*) AS document_count
FROM public.task_file_links
WHERE material_id IS NOT NULL
GROUP BY material_id
UNION ALL
SELECT
  'room' AS entity_type,
  room_id AS entity_id,
  COUNT(*) AS document_count
FROM public.task_file_links
WHERE room_id IS NOT NULL
GROUP BY room_id
UNION ALL
SELECT
  'purchase_order' AS entity_type,
  purchase_order_id AS entity_id,
  COUNT(*) AS document_count
FROM public.task_file_links
WHERE purchase_order_id IS NOT NULL
GROUP BY purchase_order_id;

COMMENT ON COLUMN public.task_file_links.purchase_order_id IS
  'Optional direct link to a purchase_order. Use for additional attachments beyond the primary purchase_orders.receipt_file_path.';

COMMENT ON TABLE public.task_file_links IS
  'Links project files to tasks, rooms, materials, and/or purchase orders. At least one entity reference is required.';

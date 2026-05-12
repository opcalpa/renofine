-- Migration: add invoice-specific fields to purchase_orders so scanned
-- invoices can become first-class POs instead of orphan tasks.
--
-- Motivation: today the QuickReceiptCaptureModal "new + invoice" flow creates
-- a task to track invoice_number / OCR / due_date. This splits the data model
-- (some scans become POs, some become tasks) and means invoices don't show up
-- in Inköp-fliken. Harmonization: ALL scanned documents become POs; tasks
-- continue to exist for their original purpose (work to do).
--
-- Reverts (manual):
--   ALTER TABLE public.purchase_orders DROP COLUMN IF EXISTS invoice_due_date;
--   ALTER TABLE public.purchase_orders DROP COLUMN IF EXISTS ocr_number;
--   ALTER TABLE public.purchase_orders DROP COLUMN IF EXISTS invoice_number;
--   ALTER TABLE public.purchase_orders DROP COLUMN IF EXISTS paid_at;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS invoice_number TEXT,
  ADD COLUMN IF NOT EXISTS ocr_number TEXT,
  ADD COLUMN IF NOT EXISTS invoice_due_date DATE,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- Index for "att betala"-style queries (unpaid invoices by due date)
CREATE INDEX IF NOT EXISTS idx_purchase_orders_unpaid_due
  ON public.purchase_orders (project_id, invoice_due_date)
  WHERE paid_at IS NULL AND invoice_due_date IS NOT NULL;

COMMENT ON COLUMN public.purchase_orders.invoice_number IS
  'Invoice number printed on the document. Populated when source=ai_invoice or for manual invoices.';
COMMENT ON COLUMN public.purchase_orders.ocr_number IS
  'OCR / payment reference. Used for bank transfers when paying the invoice.';
COMMENT ON COLUMN public.purchase_orders.invoice_due_date IS
  'When payment is due. Used for "att betala"-reminders.';
COMMENT ON COLUMN public.purchase_orders.paid_at IS
  'Timestamp the invoice was paid. NULL = still unpaid.';

-- Add 'ai_invoice' to purchase_orders.source CHECK constraint.
--
-- Background: migration 20260512110000_add_invoice_fields_to_purchase_orders.sql
-- introduced the invoice flow (invoice_number, ocr_number, invoice_due_date,
-- paid_at) and the code writes source='ai_invoice' for scanned invoices.
-- However, the original source CHECK from the purchase_orders create migration
-- only allowed ('ai_quote', 'ai_receipt', 'manual'). INSERTs from
-- QuickReceiptCaptureModal + LinkPurchaseDialog (invoice path) silently
-- failed with 23514 once the flow shipped.
--
-- This widens the constraint to include 'ai_invoice'. Idempotent.

ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_source_check;

ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_source_check
  CHECK ((source IS NULL) OR (source = ANY (ARRAY['ai_quote'::text, 'ai_receipt'::text, 'ai_invoice'::text, 'manual'::text])));

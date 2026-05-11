-- Add "ordered" to the materials status CHECK constraint.
-- The unified purchase + budget model (block 1-4) links materials to
-- purchase_orders via materials.purchase_order_id. When a material is
-- attached to a PO, its semantic state is "ordered" (the PO is the
-- ordering event). QuoteReviewDialog + QuickReceiptCaptureModal both
-- write this value when creating materials linked to a new PO, so the
-- constraint needs to accept it.

ALTER TABLE public.materials DROP CONSTRAINT IF EXISTS materials_status_check;
ALTER TABLE public.materials ADD CONSTRAINT materials_status_check
  CHECK (status IN (
    'planned',
    'to_order',
    'ordered',
    'submitted',
    'declined',
    'approved',
    'billed',
    'paid',
    'paused',
    'new',
    'done'
  ));

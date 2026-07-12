-- ROT deduction on purchase orders.
-- Renaida document imports store the order total as NET (what the user pays after
-- the ROT deduction). The utilized deduction is kept here so the budget can show
-- all ROT in its own column; gross is derivable as total + rot_amount.
-- (Carl's decision 2026-07-12.)

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS rot_amount NUMERIC;

COMMENT ON COLUMN public.purchase_orders.rot_amount IS
  'ROT tax deduction applied to this order (SEK). total is NET (gross − rot_amount); gross = total + rot_amount.';

-- Revert:
-- ALTER TABLE public.purchase_orders DROP COLUMN IF EXISTS rot_amount;

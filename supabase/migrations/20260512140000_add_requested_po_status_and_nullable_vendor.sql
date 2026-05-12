-- PO-invariant fas 1: möjliggör request-POs.
--
-- Bakgrund: tre platser i UI:n (BudgetTab "ny rad" + "duplicera",
-- PurchaseRequestsTab "skapa beställning från planerad") skapar idag
-- material UTAN purchase_order_id, vilket bryter mental-modellen
-- "ett material är antingen planerat (ingen PO) eller kopplat till PO".
--
-- Lösning: alla nya material från dessa flöden får sin egen PO med
-- status='requested' (hemägar-/budget-önskemål, ännu inte bekräftat
-- av leverantör). vendor_name kan vara NULL för request-POs.
--
-- Effekt:
--  • Lägger 'requested' i purchase_orders.status CHECK
--  • Tillåter vendor_name=NULL (var NOT NULL)
--
-- DB-invariant CHECK ((status='planned') = (purchase_order_id IS NULL))
-- läggs separat efter prod-verifiering att inga nya orphans skapas.
--
-- Idempotent.

-- 1) Tillåt NULL i vendor_name
ALTER TABLE public.purchase_orders
  ALTER COLUMN vendor_name DROP NOT NULL;

-- 2) Lägg 'requested' i status-CHECK
ALTER TABLE public.purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_status_check;

ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_status_check
  CHECK (status IN ('pending', 'requested', 'ordered', 'delivered', 'cancelled'));

COMMENT ON COLUMN public.purchase_orders.status IS
  'pending | requested | ordered | delivered | cancelled. ''requested'' = budget/hemägar-önskemål utan bekräftad leverantör.';

COMMENT ON COLUMN public.purchase_orders.vendor_name IS
  'Leverantörsnamn. NULL tillåtet för status=''requested'' (ej bekräftad vendor än).';

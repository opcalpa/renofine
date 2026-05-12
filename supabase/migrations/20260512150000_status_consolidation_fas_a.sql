-- Status-konsolidering Fas A
--
-- 1) Rensa dead materials.status-värden ('new', 'done') ur CHECK constraint.
--    Verifierat 2026-05-12: 0 prod-rader använder dessa värden.
--    'new' var default i AddPurchaseLineDialog och MaterialsList (legacy),
--    nu ersatt av 'submitted'. 'done' har aldrig haft semantisk roll på
--    materials (det är ett task-koncept som råkat ärvas).
--
-- 2) Lägg CHECK constraint på tasks.payment_status. Tidigare TEXT utan
--    skydd. Tillåt {not_paid, partially_paid, billed, paid} — 'billed'
--    inkluderat även om prod-data saknar det idag, eftersom kod sätter
--    det via UI (TaskEditDialog).
--
-- Idempotent.

-- 1) Materials: rensa dead-värden ur status-check
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
    'paused'
  ));

COMMENT ON COLUMN public.materials.status IS
  'planned (i budget, ingen PO) | to_order/submitted/ordered/declined/approved/billed/paid/paused (kopplat till PO). Värdena ''new'' och ''done'' borttagna 2026-05-12 (legacy, 0 prod-data).';

-- 2) Tasks: payment_status får CHECK constraint
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_payment_status_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_payment_status_check
  CHECK (payment_status IN ('not_paid', 'partially_paid', 'billed', 'paid'));

COMMENT ON COLUMN public.tasks.payment_status IS
  'not_paid | partially_paid | billed | paid. Default not_paid.';

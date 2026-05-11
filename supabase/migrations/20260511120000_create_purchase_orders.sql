-- Migration: create purchase_orders table + extend materials with purchase_order_id
-- Implements the unified purchase + budget model (see memory: project_unified_purchase_budget_model.md).
--
-- A purchase_order is a batch of material items ordered together from one supplier:
-- 1 vendor, 1 delivery, 1 receipt at the end. Material rows link to the order via
-- purchase_order_id, and (optionally) to a task for budget consumption via task_id.
--
-- Revert:
--   DROP TRIGGER IF EXISTS set_purchase_orders_updated_at ON public.purchase_orders;
--   DROP FUNCTION IF EXISTS public.handle_purchase_orders_updated_at();
--   DROP POLICY IF EXISTS "Users can view purchase_orders in accessible projects" ON public.purchase_orders;
--   DROP POLICY IF EXISTS "Users can add purchase_orders in accessible projects" ON public.purchase_orders;
--   DROP POLICY IF EXISTS "Users can update purchase_orders in accessible projects" ON public.purchase_orders;
--   DROP POLICY IF EXISTS "Users can delete purchase_orders in accessible projects" ON public.purchase_orders;
--   ALTER TABLE public.materials DROP COLUMN IF EXISTS purchase_order_id;
--   DROP TABLE IF EXISTS public.purchase_orders;
--
-- Notes:
-- - materials.task_id is already nullable (verified 2026-05-11) — no NOT NULL drop needed
-- - materials.source_material_id already exists — used for split-row tracking
-- - materials.supplier_id already exists — kept independent from purchase_order's supplier_id

-- ===========================================================================
-- 1. purchase_orders table
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  vendor_name TEXT NOT NULL,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  total NUMERIC(12, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'ordered', 'delivered', 'cancelled')),
  ordered_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  receipt_file_path TEXT,
  receipt_total NUMERIC(12, 2),
  receipt_matched_at TIMESTAMPTZ,
  notes TEXT,
  source TEXT
    CHECK (source IS NULL OR source IN ('ai_quote', 'ai_receipt', 'manual')),
  created_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_project_id
  ON public.purchase_orders(project_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status
  ON public.purchase_orders(status);

COMMENT ON TABLE public.purchase_orders IS
  'Batch of material items ordered together from one supplier. 1 vendor, 1 delivery, 1 receipt. Aggregates materials.cost; matches receipt_total against total when delivered.';
COMMENT ON COLUMN public.purchase_orders.vendor_name IS
  'Always set (from AI extraction or manual entry). supplier_id is optional FK if user picks from their suppliers list.';
COMMENT ON COLUMN public.purchase_orders.source IS
  'How this order was created: ai_quote (from quote PDF), ai_receipt (from receipt photo), manual (ultra-light path).';
COMMENT ON COLUMN public.purchase_orders.receipt_total IS
  'Extracted total from uploaded receipt. Compared against total to detect mismatches.';
COMMENT ON COLUMN public.purchase_orders.receipt_matched_at IS
  'When receipt total matched order total — order automatically flipped to delivered.';

-- ===========================================================================
-- 2. updated_at trigger
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.handle_purchase_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_purchase_orders_updated_at ON public.purchase_orders;
CREATE TRIGGER set_purchase_orders_updated_at
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_purchase_orders_updated_at();

-- ===========================================================================
-- 3. Extend materials with purchase_order_id
-- ===========================================================================

ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS purchase_order_id UUID
    REFERENCES public.purchase_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_materials_purchase_order_id
  ON public.materials(purchase_order_id);

COMMENT ON COLUMN public.materials.purchase_order_id IS
  'Optional link to the purchase_order this material was acquired through. Null = direct material (legacy path or planned material without order).';

-- ===========================================================================
-- 4. RLS — purchase_orders (mirror of materials pattern)
-- ===========================================================================

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view purchase_orders in accessible projects" ON public.purchase_orders;
DROP POLICY IF EXISTS "Users can add purchase_orders in accessible projects" ON public.purchase_orders;
DROP POLICY IF EXISTS "Users can update purchase_orders in accessible projects" ON public.purchase_orders;
DROP POLICY IF EXISTS "Users can delete purchase_orders in accessible projects" ON public.purchase_orders;

CREATE POLICY "Users can view purchase_orders in accessible projects"
ON public.purchase_orders
FOR SELECT
USING (
  project_id IN (
    SELECT projects.id FROM public.projects
    WHERE projects.owner_id = public.get_user_profile_id()
      OR public.user_has_project_access(projects.id)
  )
);

CREATE POLICY "Users can add purchase_orders in accessible projects"
ON public.purchase_orders
FOR INSERT
WITH CHECK (
  project_id IN (
    SELECT projects.id FROM public.projects
    WHERE projects.owner_id = public.get_user_profile_id()
      OR public.user_has_project_access(projects.id)
  )
);

CREATE POLICY "Users can update purchase_orders in accessible projects"
ON public.purchase_orders
FOR UPDATE
USING (
  project_id IN (
    SELECT projects.id FROM public.projects
    WHERE projects.owner_id = public.get_user_profile_id()
      OR public.user_has_project_access(projects.id)
  )
);

CREATE POLICY "Users can delete purchase_orders in accessible projects"
ON public.purchase_orders
FOR DELETE
USING (
  project_id IN (
    SELECT projects.id FROM public.projects
    WHERE projects.owner_id = public.get_user_profile_id()
      OR public.user_has_project_access(projects.id)
  )
);

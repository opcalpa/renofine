-- Public demo: allow anon to view purchase_orders in the public demo project.
--
-- Root cause: the demo anon-SELECT policy sweep (20260215100000) predates the
-- purchase_orders table (20260511120000), so the table never got its policy.
-- Effect in prod: the demo's Inköp tab counted "13 inköp · 6 Betald" in the
-- header but rendered zero orders below — the PO grid/table only mounts when
-- purchase_orders rows are visible, and anon saw [].
--
-- Mirrors the exact pattern used for rooms/tasks/materials et al.

DROP POLICY IF EXISTS "Anyone can view public demo purchase orders" ON public.purchase_orders;
CREATE POLICY "Anyone can view public demo purchase orders" ON public.purchase_orders
FOR SELECT USING (
  is_public_demo_project(project_id)
);

-- Fix purchase_orders SELECT-policy: enforce purchases_access != 'none' + scope-filter.
--
-- Audit-fynd: nuvarande policy är bara `project_id IN (owner or has_access)` —
-- ingen access-check, ingen scope-filter. Test: sthlmrides (access='none')
-- såg alla 3 POs på Furusund inklusive worker-receipt-PO med kvitto-länk.
--
-- Detta är samma klass av läcka som materials hade (fixad i 20260512190000).
-- Policy uppdateras parallellt med samma logik.
--
-- Scope-logik för POs: eftersom purchase_orders inte har created_by/assigned_to
-- direkt, mappas scope='assigned' till "PO har minst en material-rad där
-- användaren är creator eller assignee". EXISTS-subquery undviker
-- N+1-overhead.

DROP POLICY IF EXISTS "Users can view purchase_orders in accessible projects" ON public.purchase_orders;

CREATE POLICY "Users can view purchase_orders in accessible projects"
ON public.purchase_orders
FOR SELECT
USING (
  is_system_admin()
  OR user_owns_project(project_id)
  OR (
    user_has_project_access(project_id)
    AND user_can_view_purchases(project_id)
    AND (
      user_purchases_scope(project_id) = 'all'
      OR (
        user_purchases_scope(project_id) = 'assigned'
        AND EXISTS (
          SELECT 1 FROM materials m
          WHERE m.purchase_order_id = purchase_orders.id
          AND (
            m.created_by_user_id = get_user_profile_id()
            OR m.assigned_to_user_id = get_user_profile_id()
          )
        )
      )
    )
  )
);

COMMENT ON POLICY "Users can view purchase_orders in accessible projects" ON public.purchase_orders IS
  'Scope- och access-medveten. Owner → full. Share-medlem → kräver purchases_access != none. Scope=assigned filtrerar PO:s via material-radernas creator/assignee.';

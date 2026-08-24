-- S4b — the 10 policies that inline their checks instead of calling the central
-- access functions, and therefore did NOT inherit property membership.
--
-- Found by the four-way access test: admin and viewer both returned true from
-- user_has_project_access() yet could not SELECT the project row. The plan's
-- assumption that one OR branch in the two functions cascades everywhere holds
-- for most tables; these are the exceptions.
--
-- Full audit (policies referencing project_shares without going through the
-- functions): projects SELECT + UPDATE, rooms ALL, task_file_links SELECT+ALL,
-- task_dependencies ALL, milestones UPDATE+DELETE, purchase_requests UPDATE x2,
-- invoice_items SELECT. Deliberately NOT changed: access_log (owner-only audit
-- trail by design) and the public-demo profiles policy (unrelated).
--
-- Strictly ADDITIVE: every original expression is preserved verbatim and only
-- gets an extra OR branch. No existing user can lose access.
--
-- REVERT: recreate each policy below without its trailing
--   `OR public.user_property_access_on_project(...)` branch.

-- ── projects ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view projects they own or have access to" ON public.projects;
CREATE POLICY "Users can view projects they own or have access to"
ON public.projects FOR SELECT
USING (
  is_system_admin()
  OR (owner_id = (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()))
  OR (id IN (SELECT project_shares.project_id FROM project_shares
             WHERE project_shares.shared_with_user_id = (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())))
  OR public.user_property_access_on_project(id, 'viewer')
);

DROP POLICY IF EXISTS "Project owners can update their projects" ON public.projects;
CREATE POLICY "Project owners can update their projects"
ON public.projects FOR UPDATE
USING (
  is_system_admin()
  OR (owner_id = (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()))
  OR public.user_property_access_on_project(id, 'admin')
);

-- ── rooms ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can manage rooms in accessible projects" ON public.rooms;
CREATE POLICY "Users can manage rooms in accessible projects"
ON public.rooms FOR ALL
USING (
  is_system_admin()
  OR (project_id IN (
        SELECT projects.id FROM projects
        WHERE (projects.owner_id = (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()))
           OR (projects.id IN (SELECT project_shares.project_id FROM project_shares
                WHERE project_shares.shared_with_user_id = (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())
                  AND project_shares.role = ANY (ARRAY['editor'::text, 'admin'::text, 'client'::text])))))
  OR public.user_property_access_on_project(rooms.project_id, 'admin')
);

-- ── task_file_links ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view task file links in accessible projects" ON public.task_file_links;
CREATE POLICY "Users can view task file links in accessible projects"
ON public.task_file_links FOR SELECT
USING (
  project_id IN (
    SELECT projects.id FROM projects
    WHERE (projects.owner_id = (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()))
       OR (projects.id IN (SELECT project_shares.project_id FROM project_shares
            WHERE project_shares.shared_with_user_id = (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()))))
  OR public.user_property_access_on_project(task_file_links.project_id, 'viewer')
);

DROP POLICY IF EXISTS "Users can manage task file links in accessible projects" ON public.task_file_links;
CREATE POLICY "Users can manage task file links in accessible projects"
ON public.task_file_links FOR ALL
USING (
  project_id IN (
    SELECT projects.id FROM projects
    WHERE (projects.owner_id = (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()))
       OR (projects.id IN (SELECT project_shares.project_id FROM project_shares
            WHERE project_shares.shared_with_user_id = (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()))))
  OR public.user_property_access_on_project(task_file_links.project_id, 'admin')
);

-- ── task_dependencies ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Editors can manage dependencies in accessible projects" ON public.task_dependencies;
CREATE POLICY "Editors can manage dependencies in accessible projects"
ON public.task_dependencies FOR ALL
USING (
  task_id IN (
    SELECT tasks.id FROM tasks
    WHERE tasks.project_id IN (
      SELECT projects.id FROM projects
      WHERE (projects.owner_id = get_user_profile_id())
         OR (projects.id IN (SELECT project_shares.project_id FROM project_shares
              WHERE project_shares.shared_with_user_id = get_user_profile_id()
                AND project_shares.role = ANY (ARRAY['editor'::text, 'admin'::text])))))
  OR EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.id = task_dependencies.task_id
      AND public.user_property_access_on_project(t.project_id, 'admin'))
);

-- ── milestones ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "milestones_update" ON public.milestones;
CREATE POLICY "milestones_update"
ON public.milestones FOR UPDATE
USING (
  EXISTS (SELECT 1 FROM projects WHERE projects.id = milestones.project_id AND projects.owner_id = get_user_profile_id())
  OR EXISTS (SELECT 1 FROM project_shares WHERE project_shares.project_id = milestones.project_id AND project_shares.shared_with_user_id = get_user_profile_id())
  OR public.user_property_access_on_project(milestones.project_id, 'admin')
);

DROP POLICY IF EXISTS "milestones_delete" ON public.milestones;
CREATE POLICY "milestones_delete"
ON public.milestones FOR DELETE
USING (
  EXISTS (SELECT 1 FROM projects WHERE projects.id = milestones.project_id AND projects.owner_id = get_user_profile_id())
  OR EXISTS (SELECT 1 FROM project_shares WHERE project_shares.project_id = milestones.project_id AND project_shares.shared_with_user_id = get_user_profile_id())
  OR public.user_property_access_on_project(milestones.project_id, 'admin')
);

-- ── purchase_requests ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Project owners and admins can update purchase requests" ON public.purchase_requests;
CREATE POLICY "Project owners and admins can update purchase requests"
ON public.purchase_requests FOR UPDATE
USING (
  material_id IN (
    SELECT materials.id FROM materials
    WHERE materials.task_id IN (
      SELECT tasks.id FROM tasks
      WHERE tasks.project_id IN (
        SELECT projects.id FROM projects
        WHERE (projects.owner_id = get_user_profile_id())
           OR (projects.id IN (SELECT project_shares.project_id FROM project_shares
                WHERE project_shares.shared_with_user_id = get_user_profile_id()
                  AND project_shares.role = ANY (ARRAY['admin'::text, 'editor'::text]))))))
  OR EXISTS (
    SELECT 1 FROM materials m JOIN tasks t ON t.id = m.task_id
    WHERE m.id = purchase_requests.material_id
      AND public.user_property_access_on_project(t.project_id, 'admin'))
);

DROP POLICY IF EXISTS "Users can update their own purchase requests" ON public.purchase_requests;
CREATE POLICY "Users can update their own purchase requests"
ON public.purchase_requests FOR UPDATE
USING (
  (requested_by_user_id = get_user_profile_id())
  OR material_id IN (
    SELECT materials.id FROM materials
    WHERE materials.task_id IN (
      SELECT tasks.id FROM tasks
      WHERE tasks.project_id IN (
        SELECT projects.id FROM projects
        WHERE (projects.owner_id = get_user_profile_id())
           OR (projects.id IN (SELECT project_shares.project_id FROM project_shares
                WHERE project_shares.shared_with_user_id = get_user_profile_id()
                  AND project_shares.role = ANY (ARRAY['admin'::text, 'editor'::text]))))))
  OR EXISTS (
    SELECT 1 FROM materials m JOIN tasks t ON t.id = m.task_id
    WHERE m.id = purchase_requests.material_id
      AND public.user_property_access_on_project(t.project_id, 'admin'))
);

-- ── invoice_items ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view invoice items" ON public.invoice_items;
CREATE POLICY "Users can view invoice items"
ON public.invoice_items FOR SELECT
USING (
  invoice_id IN (
    SELECT i.id FROM invoices i
    WHERE (i.creator_id = get_user_profile_id())
       OR (i.project_id IN (SELECT projects.id FROM projects WHERE projects.owner_id = get_user_profile_id()))
       OR (i.project_id IN (SELECT project_shares.project_id FROM project_shares
            WHERE project_shares.shared_with_user_id = get_user_profile_id())))
  OR EXISTS (
    SELECT 1 FROM invoices i2
    WHERE i2.id = invoice_items.invoice_id
      AND i2.project_id IS NOT NULL
      AND public.user_property_access_on_project(i2.project_id, 'viewer'))
);

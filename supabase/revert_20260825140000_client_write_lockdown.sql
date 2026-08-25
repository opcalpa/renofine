-- REVERT för 20260825140000_client_write_lockdown.sql
-- Återställer skrivpolicyerna till formen där role='client' fick skriva.
-- OBS: detta ÖPPNAR write-eskaleringen igen (kunden kan ändra byggarens arbeten).

DROP POLICY IF EXISTS tasks_insert ON public.tasks;
CREATE POLICY tasks_insert ON public.tasks FOR INSERT
WITH CHECK (is_system_admin() OR user_owns_project(project_id) OR (project_id IN (
  SELECT ps.project_id FROM project_shares ps
  WHERE ps.shared_with_user_id = get_user_profile_id()
    AND ps.role = ANY (ARRAY['editor','admin','client']))));

DROP POLICY IF EXISTS tasks_update ON public.tasks;
CREATE POLICY tasks_update ON public.tasks FOR UPDATE
USING (is_system_admin() OR user_owns_project(project_id) OR (project_id IN (
  SELECT ps.project_id FROM project_shares ps
  WHERE ps.shared_with_user_id = get_user_profile_id()
    AND ps.role = ANY (ARRAY['editor','admin','client']))));

DROP POLICY IF EXISTS "Users can manage rooms in accessible projects" ON public.rooms;
CREATE POLICY "Users can manage rooms in accessible projects" ON public.rooms FOR ALL
USING (is_system_admin() OR (project_id IN (
  SELECT projects.id FROM projects
  WHERE projects.owner_id = (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())
     OR projects.id IN (SELECT project_shares.project_id FROM project_shares
                        WHERE project_shares.shared_with_user_id = (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())
                          AND project_shares.role = ANY (ARRAY['editor','admin','client']))))
  OR user_property_access_on_project(project_id, 'admin'));

DROP POLICY IF EXISTS external_quotes_insert ON public.external_quotes;
CREATE POLICY external_quotes_insert ON public.external_quotes FOR INSERT
WITH CHECK (is_system_admin() OR user_owns_project(project_id) OR (project_id IN (
  SELECT ps.project_id FROM project_shares ps
  WHERE ps.shared_with_user_id = get_user_profile_id()
    AND ps.role = ANY (ARRAY['editor','admin','client']))));

DROP POLICY IF EXISTS external_quotes_update ON public.external_quotes;
CREATE POLICY external_quotes_update ON public.external_quotes FOR UPDATE
USING (is_system_admin() OR user_owns_project(project_id) OR (project_id IN (
  SELECT ps.project_id FROM project_shares ps
  WHERE ps.shared_with_user_id = get_user_profile_id()
    AND ps.role = ANY (ARRAY['editor','admin','client']))));

DROP POLICY IF EXISTS eqa_insert ON public.external_quote_assignments;
CREATE POLICY eqa_insert ON public.external_quote_assignments FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM external_quotes eq
  WHERE eq.id = external_quote_assignments.external_quote_id
    AND (is_system_admin() OR user_owns_project(eq.project_id) OR (eq.project_id IN (
      SELECT ps.project_id FROM project_shares ps
      WHERE ps.shared_with_user_id = get_user_profile_id()
        AND ps.role = ANY (ARRAY['editor','admin','client']))))));

DROP POLICY IF EXISTS eqa_update ON public.external_quote_assignments;
CREATE POLICY eqa_update ON public.external_quote_assignments FOR UPDATE
USING (EXISTS (SELECT 1 FROM external_quotes eq
  WHERE eq.id = external_quote_assignments.external_quote_id
    AND (is_system_admin() OR user_owns_project(eq.project_id) OR (eq.project_id IN (
      SELECT ps.project_id FROM project_shares ps
      WHERE ps.shared_with_user_id = get_user_profile_id()
        AND ps.role = ANY (ARRAY['editor','admin','client']))))));

-- REVERT för 20260825121000_materials_client_exclusion.sql
-- Återställer materials-ALL-policyn till sin form före kund-uteslutningen.
DROP POLICY IF EXISTS "Editors can manage materials in accessible projects" ON public.materials;

CREATE POLICY "Editors can manage materials in accessible projects"
ON public.materials FOR ALL
USING (
  is_system_admin()
  OR (task_id IN (
        SELECT tasks.id FROM tasks
        WHERE tasks.project_id IN (
          SELECT projects.id FROM projects
          WHERE projects.owner_id = get_user_profile_id()
             OR projects.id IN (
                  SELECT project_shares.project_id FROM project_shares
                  WHERE project_shares.shared_with_user_id = get_user_profile_id()
                    AND project_shares.role = ANY (ARRAY['editor','admin','client'])
                )
        )
      ))
  OR (project_id IS NOT NULL AND (
        user_owns_project(project_id)
        OR project_id IN (
             SELECT project_shares.project_id FROM project_shares
             WHERE project_shares.shared_with_user_id = get_user_profile_id()
               AND project_shares.role = ANY (ARRAY['editor','admin','client'])
           )
      ))
);

-- ---------------------------------------------------------------------------
-- materials: stäng den inlinade ALL-policyn för inbjudna KUNDER
--
-- Läxan i ren form ([[feedback_rls_test_the_table_not_the_predicate]]):
-- i 20260825120000 hårdnade jag user_can_view_purchases() och trodde att
-- inköpen var stängda. Kunden läste materials ändå — för att den här policyn
-- INLINAR sin egen check (`project_shares.role = ANY('editor','admin','client')`)
-- och därför inte ärver ett dugg av funktionen. Verifierat mot TABELLEN, inte
-- mot predikatet: 5 materialrader läsbara efter "fixen".
--
-- OBS: policyn nycklar på `role`, inte `role_type`. role='client' matchar även
-- planning_contributor, som är en helt annan sak och ska behålla sin åtkomst.
-- Därför utesluter vi på role_type via user_is_client_on_project().
--
-- Detta är en ALL-policy, så den styr både läsning OCH skrivning. Kunden
-- förlorar båda — avsiktligt: priser, leverantörer och materialpåslag är
-- byggarens affär.
-- Revert: supabase/revert_20260825121000_materials_client_exclusion.sql
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Editors can manage materials in accessible projects" ON public.materials;

CREATE POLICY "Editors can manage materials in accessible projects"
ON public.materials FOR ALL
USING (
  is_system_admin()
  OR (
    -- Kund-spärren gäller projektet raden hör till, oavsett om kopplingen går
    -- via project_id direkt eller via arbetet.
    NOT user_is_client_on_project(
      COALESCE(project_id, (SELECT t.project_id FROM tasks t WHERE t.id = materials.task_id))
    )
    AND (
      (task_id IN (
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
    )
  )
);

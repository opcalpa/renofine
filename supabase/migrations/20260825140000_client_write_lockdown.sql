-- ---------------------------------------------------------------------------
-- Den inbjudna KUNDEN ska inte kunna skriva i byggarens projekt
--
-- BAKGRUND (bevisat 2026-08-25, kort: tasks-update-slapper-in-kunden):
-- `tasks_update` släppte in `role = ANY('editor','admin','client')`. Som den
-- levande client-delningen gick `update tasks set budget = budget` igenom på
-- 11 av 11 rader (kört i en transaktion som rullades tillbaka). Samma mönster
-- fanns i tasks_insert, rooms (ALL — alltså även radera), external_quotes och
-- external_quote_assignments.
--
-- VARFÖR 'client' STOD DÄR: det är INTE kunden man ville släppa in, utan
-- MEDPLANERAREN. En planning_contributor får `role = 'client'` men
-- `role_type = 'planning_contributor'`, och är enligt
-- InviteCustomerPlanningDialog uttryckligen tänkt att "edit tasks & rooms,
-- nothing else". Plockar man bort strängen ur arrayen tystar man alltså
-- medplanerarens hela funktion. Därför utesluter vi på role_type via
-- user_is_client_on_project() och lämnar arrayen orörd.
--
-- `tasks_delete` rörs inte — den utesluter redan 'client' och var alltså
-- medvetet skriven. Det här är samma avsikt, applicerad på resten.
--
-- KOLLAT FÖRE ÄNDRING: varje offert i databasen har client_id = NULL, alltså
-- har ingen kund någonsin accepterat en offert. Acceptvägen
-- (ViewQuote.handleAccept -> createTasksFromQuote) skriver till tasks som den
-- som accepterar, så DEN dagen en byggare sätter client_id och kunden
-- accepterar behövs en serversidig materialisering. Se backlog-kortet
-- klient-accept-behover-serversida. Idag bryts ingenting.
-- Revert: supabase/revert_20260825140000_client_write_lockdown.sql
-- ---------------------------------------------------------------------------

-- ── tasks ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS tasks_insert ON public.tasks;
CREATE POLICY tasks_insert ON public.tasks FOR INSERT
WITH CHECK (
  is_system_admin()
  OR user_owns_project(project_id)
  OR (
    NOT user_is_client_on_project(project_id)
    AND project_id IN (
      SELECT ps.project_id FROM project_shares ps
      WHERE ps.shared_with_user_id = get_user_profile_id()
        AND ps.role = ANY (ARRAY['editor','admin','client'])
    )
  )
);

DROP POLICY IF EXISTS tasks_update ON public.tasks;
CREATE POLICY tasks_update ON public.tasks FOR UPDATE
USING (
  is_system_admin()
  OR user_owns_project(project_id)
  OR (
    NOT user_is_client_on_project(project_id)
    AND project_id IN (
      SELECT ps.project_id FROM project_shares ps
      WHERE ps.shared_with_user_id = get_user_profile_id()
        AND ps.role = ANY (ARRAY['editor','admin','client'])
    )
  )
);

-- ── rooms ──────────────────────────────────────────────────────────────────
-- SELECT ligger i en EGEN policy ("Users can view rooms in accessible
-- projects"), så kunden fortsätter SE rummen. Det här är bara skrivrätten.
DROP POLICY IF EXISTS "Users can manage rooms in accessible projects" ON public.rooms;
CREATE POLICY "Users can manage rooms in accessible projects" ON public.rooms FOR ALL
USING (
  is_system_admin()
  OR (
    NOT user_is_client_on_project(project_id)
    AND project_id IN (
      SELECT projects.id FROM projects
      WHERE projects.owner_id = (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())
         OR projects.id IN (
              SELECT project_shares.project_id FROM project_shares
              WHERE project_shares.shared_with_user_id = (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())
                AND project_shares.role = ANY (ARRAY['editor','admin','client'])
            )
    )
  )
  OR user_property_access_on_project(project_id, 'admin')
);

-- ── external_quotes + assignments ──────────────────────────────────────────
-- Byggarens insamlade konkurrentofferter. En kund har inget där att göra.
DROP POLICY IF EXISTS external_quotes_insert ON public.external_quotes;
CREATE POLICY external_quotes_insert ON public.external_quotes FOR INSERT
WITH CHECK (
  is_system_admin()
  OR user_owns_project(project_id)
  OR (
    NOT user_is_client_on_project(project_id)
    AND project_id IN (
      SELECT ps.project_id FROM project_shares ps
      WHERE ps.shared_with_user_id = get_user_profile_id()
        AND ps.role = ANY (ARRAY['editor','admin','client'])
    )
  )
);

DROP POLICY IF EXISTS external_quotes_update ON public.external_quotes;
CREATE POLICY external_quotes_update ON public.external_quotes FOR UPDATE
USING (
  is_system_admin()
  OR user_owns_project(project_id)
  OR (
    NOT user_is_client_on_project(project_id)
    AND project_id IN (
      SELECT ps.project_id FROM project_shares ps
      WHERE ps.shared_with_user_id = get_user_profile_id()
        AND ps.role = ANY (ARRAY['editor','admin','client'])
    )
  )
);

DROP POLICY IF EXISTS eqa_insert ON public.external_quote_assignments;
CREATE POLICY eqa_insert ON public.external_quote_assignments FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM external_quotes eq
    WHERE eq.id = external_quote_assignments.external_quote_id
      AND (
        is_system_admin()
        OR user_owns_project(eq.project_id)
        OR (
          NOT user_is_client_on_project(eq.project_id)
          AND eq.project_id IN (
            SELECT ps.project_id FROM project_shares ps
            WHERE ps.shared_with_user_id = get_user_profile_id()
              AND ps.role = ANY (ARRAY['editor','admin','client'])
          )
        )
      )
  )
);

DROP POLICY IF EXISTS eqa_update ON public.external_quote_assignments;
CREATE POLICY eqa_update ON public.external_quote_assignments FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM external_quotes eq
    WHERE eq.id = external_quote_assignments.external_quote_id
      AND (
        is_system_admin()
        OR user_owns_project(eq.project_id)
        OR (
          NOT user_is_client_on_project(eq.project_id)
          AND eq.project_id IN (
            SELECT ps.project_id FROM project_shares ps
            WHERE ps.shared_with_user_id = get_user_profile_id()
              AND ps.role = ANY (ARRAY['editor','admin','client'])
          )
        )
      )
  )
);

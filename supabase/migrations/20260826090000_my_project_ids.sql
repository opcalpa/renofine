-- ---------------------------------------------------------------------------
-- my_project_ids(): projekten användaren når SOM SIG SJÄLV — utan admin-bypass
--
-- BAKGRUND (Carls fynd 2026-08-26): mapp-släppets projektväljare visade 25
-- projekt, varav 22 tillhörde andra — inklusive riktiga externa användare.
-- Ingen läcka mot vanliga konton: `projects`-policyn börjar med
-- `is_system_admin() OR …`, och Carls huvudkonto ÄR systemadmin. Ett
-- icke-admin-konto ser bara sina egna (verifierat: 3 mot 25).
--
-- Men rotorsaken är strukturell: "admin ser allt" beviljas i RLS och ogörs
-- ad hoc i EN komponent (Projects.tsx, med en Admin-knapp). Varje annan yta
-- som listar projekt ärver därför admin-vyn — mapp-släppet, pipeline-väljaren
-- och den globala sökningen gjorde det.
--
-- Att lägga in samma filtrering i tre komponenter till hade varit disciplin,
-- inte en gräns; nästa väljare hade ärvt problemet igen. Regeln bor därför
-- HÄR, och väljarna frågar efter den.
--
-- Admin-vyn försvinner inte — den blir opt-in. Den som medvetet vill se allt
-- (Projects.tsx:s Admin-knapp) frågar inte den här funktionen.
--
-- Risken det stänger: filer kunde ändå inte skrivas till ett främmande projekt
-- (user_can_manage_project_files saknar admin-grenen), men tasks_insert och
-- rooms HAR is_system_admin() — ett felklick i mapp-släppet hade skapat rum och
-- arbeten i en främlings projekt medan filerna nekades.
-- Revert: supabase/revert_20260826090000_my_project_ids.sql
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.my_project_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id
  FROM projects p
  WHERE p.owner_id = get_user_profile_id()
  UNION
  SELECT ps.project_id
  FROM project_shares ps
  WHERE ps.shared_with_user_id = get_user_profile_id()
  UNION
  -- Bostaden binder ihop projekt över tid (epic "Adresser", S4): den som når
  -- adressen når dess projekt, och det är en helt annan sak än admin-bypassen.
  SELECT p.id
  FROM projects p
  WHERE user_property_access_on_project(p.id, 'viewer');
$$;

COMMENT ON FUNCTION public.my_project_ids IS
  'Projekt användaren når som sig själv: äger, är delad med, eller når via adressen. UTAN admin-bypass — projektväljare ska fråga den här, inte lita på projects-policyn.';

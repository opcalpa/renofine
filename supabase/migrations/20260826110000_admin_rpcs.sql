-- ---------------------------------------------------------------------------
-- Admin-rapporterna: explicita RPC:er i stället för ambient synlighet
--
-- BAKGRUND (Carls fråga 2026-08-26): syftet med is_system_admin var från
-- början "ett snabbt sätt att se hur många användare och projekt som finns".
-- Men flaggan beviljar synlighet i VARJE RLS-fråga — det var den som fyllde
-- projektväljarna med andras projekt (kort:
-- admin-vy-lackte-in-i-projektvaeljare).
--
-- Rapportbehovet löses här i stället: två funktioner som SJÄLVA kontrollerar
-- admin-rättigheten och returnerar exakt det översikten behöver. Flaggans
-- praktiska räckvidd blir en sida (/admin) i stället för varje lista i appen.
--
-- Medvetet INTE här: att sätta andras lösenord (kräver service-role och hör
-- inte hemma i klienten). Att UTLÖSA ett återställningsmejl kan läggas till
-- senare som edge-funktion om behovet uppstår.
-- Revert: supabase/revert_20260826110000_admin_rpcs.sql
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_platform_stats()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_system_admin() THEN
    RAISE EXCEPTION 'Admin only' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'users_total',        (SELECT count(*) FROM profiles),
    'users_homeowners',   (SELECT count(*) FROM profiles WHERE onboarding_user_type = 'homeowner'),
    'users_contractors',  (SELECT count(*) FROM profiles WHERE onboarding_user_type = 'contractor'),
    'users_last_7d',      (SELECT count(*) FROM profiles WHERE created_at > now() - interval '7 days'),
    'users_last_30d',     (SELECT count(*) FROM profiles WHERE created_at > now() - interval '30 days'),
    'projects_total',     (SELECT count(*) FROM projects WHERE deleted_at IS NULL),
    'projects_active',    (SELECT count(*) FROM projects WHERE deleted_at IS NULL AND status = 'active'),
    'projects_last_30d',  (SELECT count(*) FROM projects WHERE deleted_at IS NULL AND created_at > now() - interval '30 days'),
    'photos_total',       (SELECT count(*) FROM photos),
    'tasks_total',        (SELECT count(*) FROM tasks),
    'quotes_total',       (SELECT count(*) FROM quotes)
  );
END $$;

COMMENT ON FUNCTION public.admin_platform_stats IS
  'Plattformsöversikt för /admin. Kontrollerar is_system_admin() själv — kasta hellre än läcka.';

CREATE OR REPLACE FUNCTION public.admin_user_list()
RETURNS TABLE (
  profile_id uuid,
  email text,
  name text,
  user_type text,
  created_at timestamptz,
  project_count bigint,
  last_project_activity timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_system_admin() THEN
    RAISE EXCEPTION 'Admin only' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    pr.id,
    pr.email,
    pr.name,
    pr.onboarding_user_type,
    pr.created_at,
    count(p.id),
    max(p.updated_at)
  FROM profiles pr
  LEFT JOIN projects p ON p.owner_id = pr.id AND p.deleted_at IS NULL
  GROUP BY pr.id, pr.email, pr.name, pr.onboarding_user_type, pr.created_at
  ORDER BY pr.created_at DESC;
END $$;

COMMENT ON FUNCTION public.admin_user_list IS
  'Kontolistan för /admin: e-post, roll, antal projekt, senaste aktivitet. Admin-kollad i funktionen.';

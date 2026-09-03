-- Steg 1 av 4: bryt rekursionen INNAN profiles stramas at.
--
-- Policyn "Anyone can view public demo team profiles" gjorde en inline-subquery
-- mot project_shares, och `is_public_demo_project` ar SECURITY INVOKER och laser
-- projects under anroparens RLS. Projects-policyn gor i sin tur en inline-
-- subquery mot profiles => cykel.
--
-- Fragan funktionen svarar pa — "tillhor den har profilen det publika
-- demo-teamet?" — beror inte pa vem som fragar, sa svaret ska inte gora det
-- heller. SECURITY DEFINER bryter cykeln.
--
-- Additiv: sa lange `USING (true)` ligger kvar andras ingenting for nagon.
--
-- REVERT:
--   DROP POLICY IF EXISTS "Anyone can view public demo team profiles" ON public.profiles;
--   CREATE POLICY "Anyone can view public demo team profiles" ON public.profiles
--     FOR SELECT USING (id IN (SELECT ps.shared_with_user_id FROM project_shares ps
--                              WHERE is_public_demo_project(ps.project_id)));
--   DROP FUNCTION IF EXISTS public.is_public_demo_team_profile(uuid);

CREATE OR REPLACE FUNCTION public.is_public_demo_team_profile(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM project_shares ps
    JOIN projects p ON p.id = ps.project_id
    WHERE ps.shared_with_user_id = p_profile_id
      AND p.project_type = 'public_demo'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_public_demo_team_profile(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "Anyone can view public demo team profiles" ON public.profiles;

CREATE POLICY "Anyone can view public demo team profiles"
  ON public.profiles FOR SELECT
  USING (public.is_public_demo_team_profile(id));

-- S4 — property membership grants project access.
--
-- THE MOST SENSITIVE MIGRATION IN THIS EPIC. `user_has_project_access` alone is
-- referenced by 58 migration files; a mistake here leaks or locks everything at
-- once. Nothing else ships in this migration, and the four-way access test runs
-- before it is pushed.
--
-- Approach: extend the two central SECURITY DEFINER functions with ONE new OR
-- branch each, so household access cascades to every table without touching a
-- single policy. This is exactly how co_owner was added in 20260326110000.
--
-- Roles (see the property epic role matrix):
--   property owner  -> owner-level on every project at that address
--   admin member    -> owner-level (household adults are equals)
--   viewer member   -> read-only (the trusted builder case)
--
-- REVERT (restores the pre-S4 definitions verbatim):
--   CREATE OR REPLACE FUNCTION public.user_has_project_access(project_id uuid)
--   RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
--   AS $$ SELECT EXISTS (SELECT 1 FROM public.project_shares
--     WHERE project_shares.project_id = $1
--     AND shared_with_user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)); $$;
--
--   CREATE OR REPLACE FUNCTION public.user_owns_project(project_id uuid)
--   RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
--   AS $$ SELECT EXISTS (SELECT 1 FROM public.projects WHERE id = project_id
--     AND owner_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1))
--   OR EXISTS (SELECT 1 FROM public.project_shares WHERE project_shares.project_id = $1
--     AND shared_with_user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
--     AND role_type = 'co_owner'); $$;
--
--   DROP FUNCTION IF EXISTS public.accept_property_invitation(uuid);
--   DROP FUNCTION IF EXISTS public.user_property_access_on_project(uuid, text);

-- ── The single new predicate ──────────────────────────────────────────────
-- SECURITY DEFINER, so it reads projects/properties/property_members without
-- re-entering RLS. That keeps the policy graph acyclic.

CREATE OR REPLACE FUNCTION public.user_property_access_on_project(
  p_project_id uuid,
  p_min_role text DEFAULT 'viewer'
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- The address's owner reaches every project on it, including ones an admin
  -- created (those projects carry the ADMIN's owner_id, not the owner's).
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    JOIN public.properties pr ON pr.id = p.property_id
    WHERE p.id = p_project_id
      AND pr.owner_id = public.get_user_profile_id()
  )
  OR EXISTS (
    SELECT 1
    FROM public.projects p
    JOIN public.property_members pm ON pm.property_id = p.property_id
    WHERE p.id = p_project_id
      AND pm.member_profile_id = public.get_user_profile_id()
      AND pm.accepted_at IS NOT NULL
      AND (p_min_role = 'viewer' OR pm.role = 'admin')
  );
$$;

-- ── Read access ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.user_has_project_access(project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_shares
    WHERE project_shares.project_id = $1
    AND shared_with_user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
  )
  -- S4: anyone with any accepted membership on the project's address.
  OR public.user_property_access_on_project($1, 'viewer');
$$;

-- ── Owner-level access ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.user_owns_project(project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    -- Original owner check
    SELECT 1 FROM public.projects
    WHERE id = project_id
    AND owner_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
  )
  OR EXISTS (
    -- Co-owner check via project_shares (20260326110000)
    SELECT 1 FROM public.project_shares
    WHERE project_shares.project_id = $1
    AND shared_with_user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    AND role_type = 'co_owner'
  )
  -- S4: the address's owner, and household admins. Viewers are excluded.
  OR public.user_property_access_on_project($1, 'admin');
$$;

-- ── Accepting an invitation ───────────────────────────────────────────────
-- An invitee cannot SELECT the row that invites them (no membership yet), so
-- acceptance has to run as definer.

CREATE OR REPLACE FUNCTION public.accept_property_invitation(p_token uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_email text;
  v_row public.property_members%ROWTYPE;
BEGIN
  v_profile_id := public.get_user_profile_id();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_row FROM public.property_members
  WHERE invitation_token = p_token
  LIMIT 1;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;

  IF v_row.expires_at IS NOT NULL AND v_row.expires_at < now() THEN
    RAISE EXCEPTION 'Invitation expired';
  END IF;

  -- An address holds a household's full renovation and cost history, so a
  -- forwarded invite link must not be enough. When the invite named an email,
  -- only that person may accept it.
  IF v_row.invited_email IS NOT NULL AND btrim(v_row.invited_email) <> '' THEN
    SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
    IF v_email IS NULL OR lower(btrim(v_email)) <> lower(btrim(v_row.invited_email)) THEN
      RAISE EXCEPTION 'This invitation was issued to a different email address';
    END IF;
  END IF;

  IF v_row.accepted_at IS NOT NULL AND v_row.member_profile_id IS DISTINCT FROM v_profile_id THEN
    RAISE EXCEPTION 'Invitation already used';
  END IF;

  -- Already a member (re-invited, or two invites for the same person): drop the
  -- pending row rather than violating the unique constraint.
  IF EXISTS (
    SELECT 1 FROM public.property_members
    WHERE property_id = v_row.property_id
      AND member_profile_id = v_profile_id
      AND id <> v_row.id
  ) THEN
    DELETE FROM public.property_members WHERE id = v_row.id;
    RETURN v_row.property_id;
  END IF;

  UPDATE public.property_members
  SET member_profile_id = v_profile_id,
      accepted_at = COALESCE(accepted_at, now())
  WHERE id = v_row.id;

  RETURN v_row.property_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_property_invitation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_property_invitation(uuid) TO authenticated;

COMMENT ON FUNCTION public.user_property_access_on_project(uuid, text) IS
  'S4: does the current user reach this project through its address? owner/admin => admin level, any accepted member => viewer level.';

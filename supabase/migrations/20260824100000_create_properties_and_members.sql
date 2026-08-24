-- S1a — Property entity ("Adresser"): one home holds many projects over time.
--
-- ADDITIVE ONLY. Nothing existing changes behaviour: projects.property_id is
-- nullable, no existing policy or function is touched. The access-function
-- extensions that make property membership grant project access live in a
-- LATER migration (S4) and are deliberately not part of this one.
--
-- REVERT:
--   DROP TRIGGER IF EXISTS trg_properties_guard_owner ON public.properties;
--   DROP FUNCTION IF EXISTS public.properties_guard_owner_change();
--   ALTER TABLE public.projects DROP COLUMN IF EXISTS property_id;
--   DROP TABLE IF EXISTS public.property_members;
--   DROP TABLE IF EXISTS public.properties;
--   DROP FUNCTION IF EXISTS public.user_can_manage_property(uuid);
--   DROP FUNCTION IF EXISTS public.user_is_property_member(uuid, text);
--   DROP FUNCTION IF EXISTS public.user_owns_property(uuid);
--   DROP FUNCTION IF EXISTS public.property_owner_profile_id(uuid);

-- ── Tables ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Display only. Never a uniqueness carrier: two homes may share a name.
  name text NOT NULL,
  address text,
  postal_code text,
  city text,
  country text,
  property_designation text,
  -- Reserved for a future "sold / archived" state. No UI in v1, but the model
  -- must not make it impossible.
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.property_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  -- NULL until an invited person accepts (they may not have an account yet).
  member_profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  invited_email text,
  -- admin  = full rights over the CONTENT (see, edit, create, invite, remove)
  -- viewer = read-only insight across every project on the address
  role text NOT NULL CHECK (role IN ('admin', 'viewer')),
  invitation_token uuid NOT NULL DEFAULT gen_random_uuid(),
  invited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  expires_at timestamptz,
  CONSTRAINT property_members_unique_member UNIQUE (property_id, member_profile_id)
);

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_property_id ON public.projects(property_id);
CREATE INDEX IF NOT EXISTS idx_properties_owner_id ON public.properties(owner_id);
CREATE INDEX IF NOT EXISTS idx_property_members_member ON public.property_members(member_profile_id);
CREATE INDEX IF NOT EXISTS idx_property_members_token ON public.property_members(invitation_token);

-- ── Access helpers ────────────────────────────────────────────────────────
-- All SECURITY DEFINER so they read their tables without RLS. This is what
-- keeps the policy graph acyclic: a policy on property_members may consult
-- properties (and vice versa) only through these, never through a bare
-- subquery that would re-enter RLS.

CREATE OR REPLACE FUNCTION public.property_owner_profile_id(p_property_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT owner_id FROM public.properties WHERE id = p_property_id;
$$;

CREATE OR REPLACE FUNCTION public.user_owns_property(p_property_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.property_owner_profile_id(p_property_id) = public.get_user_profile_id();
$$;

-- p_min_role 'viewer' matches any accepted member; 'admin' matches admins only.
CREATE OR REPLACE FUNCTION public.user_is_property_member(
  p_property_id uuid,
  p_min_role text DEFAULT 'viewer'
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.property_members
    WHERE property_id = p_property_id
      AND member_profile_id = public.get_user_profile_id()
      AND accepted_at IS NOT NULL
      AND (p_min_role = 'viewer' OR role = 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.user_can_manage_property(p_property_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_owns_property(p_property_id)
      OR public.user_is_property_member(p_property_id, 'admin');
$$;

-- ── Ownership guard ───────────────────────────────────────────────────────
-- An admin has full rights over the content but must never be able to take
-- the address away from its owner. Enforced in the database, not just the UI.

CREATE OR REPLACE FUNCTION public.properties_guard_owner_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id
     AND OLD.owner_id IS DISTINCT FROM public.get_user_profile_id() THEN
    RAISE EXCEPTION 'Only the property owner can transfer ownership';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_properties_guard_owner ON public.properties;
CREATE TRIGGER trg_properties_guard_owner
  BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.properties_guard_owner_change();

-- ── RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view properties" ON public.properties;
CREATE POLICY "Members can view properties"
ON public.properties FOR SELECT
USING (
  public.user_owns_property(id)
  OR public.user_is_property_member(id)
);

DROP POLICY IF EXISTS "Users create their own properties" ON public.properties;
CREATE POLICY "Users create their own properties"
ON public.properties FOR INSERT
WITH CHECK (owner_id = public.get_user_profile_id());

DROP POLICY IF EXISTS "Owner and admins update properties" ON public.properties;
CREATE POLICY "Owner and admins update properties"
ON public.properties FOR UPDATE
USING (public.user_can_manage_property(id))
WITH CHECK (public.user_can_manage_property(id));

-- Deleting an address dissolves the shared history for everyone: owner only.
DROP POLICY IF EXISTS "Only owner deletes properties" ON public.properties;
CREATE POLICY "Only owner deletes properties"
ON public.properties FOR DELETE
USING (public.user_owns_property(id));

DROP POLICY IF EXISTS "View property members" ON public.property_members;
CREATE POLICY "View property members"
ON public.property_members FOR SELECT
USING (
  public.user_can_manage_property(property_id)
  OR member_profile_id = public.get_user_profile_id()
);

DROP POLICY IF EXISTS "Owner and admins invite members" ON public.property_members;
CREATE POLICY "Owner and admins invite members"
ON public.property_members FOR INSERT
WITH CHECK (public.user_can_manage_property(property_id));

-- Admins may manage every member row EXCEPT the owner's own.
DROP POLICY IF EXISTS "Owner and admins update members" ON public.property_members;
CREATE POLICY "Owner and admins update members"
ON public.property_members FOR UPDATE
USING (
  public.user_owns_property(property_id)
  OR (
    public.user_is_property_member(property_id, 'admin')
    AND member_profile_id IS DISTINCT FROM public.property_owner_profile_id(property_id)
  )
);

DROP POLICY IF EXISTS "Owner and admins remove members" ON public.property_members;
CREATE POLICY "Owner and admins remove members"
ON public.property_members FOR DELETE
USING (
  public.user_owns_property(property_id)
  OR (
    public.user_is_property_member(property_id, 'admin')
    AND member_profile_id IS DISTINCT FROM public.property_owner_profile_id(property_id)
  )
);

-- NOTE (S4): accepting an invitation sets member_profile_id + accepted_at on a
-- row the invitee cannot yet see. That needs a SECURITY DEFINER RPC
-- (accept_property_invitation(token)), added with the sharing UI — deliberately
-- not here, so this migration grants no new access to anyone.

COMMENT ON TABLE public.properties IS
  'A home/address that can hold several projects over time. Renovation history, ROT basis and sale documentation roll up here.';
COMMENT ON TABLE public.property_members IS
  'Household sharing. admin = full rights over content (incl. inviting); viewer = read-only insight across all projects on the address. Owner-exclusive actions: delete property, remove/demote owner, merge, transfer.';

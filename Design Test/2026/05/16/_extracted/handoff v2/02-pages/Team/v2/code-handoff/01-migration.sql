-- ===========================================================================
-- Renofine v2.2.0 — Team v2 schema migration
-- ===========================================================================
-- Run in Supabase SQL Editor. Idempotent (uses IF NOT EXISTS where possible).
-- Backfills existing projects so nothing breaks.
-- ---------------------------------------------------------------------------

-- 1. projects: tracks_economy + tracks_rot + owner_user_type
-- ---------------------------------------------------------------------------
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS tracks_economy boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS tracks_rot     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS owner_user_type text;

COMMENT ON COLUMN public.projects.tracks_economy IS
  'When false, budget tab hidden and Mode Full not selectable. For projects where finance is tracked outside the app.';
COMMENT ON COLUMN public.projects.tracks_rot IS
  'When true, ROT fields appear on quotes/invoices and Skatteverket export available. Default false — opt-in per project.';
COMMENT ON COLUMN public.projects.owner_user_type IS
  'Cached from profile owner at project creation. Drives markup-model toggle: homeowner projects have no markup concept.';

-- Backfill owner_user_type for existing projects
UPDATE public.projects p
SET owner_user_type = pr.onboarding_user_type
FROM public.profiles pr
WHERE p.owner_id = pr.id AND p.owner_user_type IS NULL;

-- Backfill tracks_economy = false for projects owned by homeowner accounts (they may not want it)
-- Note: leaves contractor-owned projects at default true
UPDATE public.projects
SET tracks_economy = false
WHERE owner_user_type = 'homeowner' AND tracks_economy = true
  AND id NOT IN (SELECT project_id FROM public.quotes WHERE status IN ('accepted', 'sent'));


-- 2. project_shares: expires_at + new role_type values
-- ---------------------------------------------------------------------------
ALTER TABLE public.project_shares
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

COMMENT ON COLUMN public.project_shares.expires_at IS
  'When set, share auto-expires at this time. Used for time-bounded specialist/auditor invitations.';

-- New role_type values (extend existing column — it''s text so no enum change needed)
-- Old: client, planning_contributor, collaborator, rfq_builder, co_owner
-- New also: pm_hired (anlitad PM), specialist (deprecated — merged into member via F2)
-- Note: keep old values for backward compat. UI maps everything onto 6 visible personas.

-- Backfill: existing collaborator → member (UE-medlem semantically)
-- (Skip if you want to do this manually — depends on production state)
-- UPDATE public.project_shares SET role_type = 'member' WHERE role_type = 'collaborator';


-- 3. materials: paid_by (för hemägar-projekt utan markup)
-- ---------------------------------------------------------------------------
ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS paid_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.materials.paid_by IS
  'Who actually paid. Useful in homeowner-projects where homeowner pays UE-purchases directly. NULL = unspecified.';

CREATE INDEX IF NOT EXISTS idx_materials_paid_by ON public.materials(paid_by);


-- 4. access_log: ny tabell för audit
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  worker_token_id uuid REFERENCES public.worker_access_tokens(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN (
    'view', 'open', 'download', 'edit', 'create',
    'denied', 'login', 'invite', 'settings_change'
  )),
  target text,
  target_type text,
  metadata jsonb,
  denied boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Either profile_id or worker_token_id must be set
  CONSTRAINT access_log_actor_check
    CHECK (profile_id IS NOT NULL OR worker_token_id IS NOT NULL)
);

COMMENT ON TABLE public.access_log IS
  'Audit trail of who has viewed/edited what in each project. Used for security audit and Team-tab "last active" column.';

CREATE INDEX IF NOT EXISTS idx_access_log_project_created
  ON public.access_log(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_log_profile
  ON public.access_log(profile_id, project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_log_denied
  ON public.access_log(project_id, denied, created_at DESC) WHERE denied = true;

-- Enable RLS — only project owners and co_owners can see the log
ALTER TABLE public.access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project owners can view audit log"
  ON public.access_log FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM public.projects
      WHERE owner_id = get_user_profile_id()
    )
    OR project_id IN (
      SELECT project_id FROM public.project_shares
      WHERE shared_with_user_id = get_user_profile_id()
      AND role_type = 'co_owner'
    )
  );

CREATE POLICY "System can insert audit log"
  ON public.access_log FOR INSERT
  WITH CHECK (true);  -- inserts happen via SECURITY DEFINER RPCs or triggers


-- 5. get_project_overview RPC — field-masked data per viewer
-- ---------------------------------------------------------------------------
-- This is a skeleton showing the pattern. The real implementation should be
-- comprehensive — covering all aggregates Overview tab needs.
--
-- Pattern: take p_project_id, derive viewer mode from share, return jsonb
-- with sensitive fields nulled per mode.

CREATE OR REPLACE FUNCTION public.derive_viewer_mode(p_project_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_share project_shares;
  v_project projects;
  v_profile_id uuid;
BEGIN
  v_profile_id := get_user_profile_id();
  IF v_profile_id IS NULL THEN RETURN 'none'; END IF;

  SELECT * INTO v_project FROM projects WHERE id = p_project_id;
  IF v_project IS NULL THEN RETURN 'none'; END IF;

  -- Owner always sees full
  IF v_project.owner_id = v_profile_id THEN RETURN 'full'; END IF;

  -- Get share
  SELECT * INTO v_share FROM project_shares
  WHERE project_id = p_project_id AND shared_with_user_id = v_profile_id;
  IF v_share IS NULL THEN RETURN 'none'; END IF;

  -- Expired share?
  IF v_share.expires_at IS NOT NULL AND v_share.expires_at < now() THEN
    RETURN 'none';
  END IF;

  -- Co-owner and pm_hired always full
  IF v_share.role_type IN ('co_owner', 'pm_hired') THEN RETURN 'full'; END IF;

  -- Client → klientvy (handled in app, returns 'client' here)
  IF v_share.role_type = 'client' THEN RETURN 'client'; END IF;

  -- Derive from budget_access (which is how mode persists)
  IF v_share.budget_access = 'edit' THEN RETURN 'full'; END IF;
  IF v_share.budget_access = 'view' THEN RETURN 'own'; END IF;
  RETURN 'none';
END $$;

COMMENT ON FUNCTION public.derive_viewer_mode IS
  'Returns the viewer''s economic mode for a given project: full | own | client | none. Used by all field-masking queries.';

-- Skeleton for the data RPC — expand per page (overview / tasks / materials)
CREATE OR REPLACE FUNCTION public.get_project_overview(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode text;
  v_project projects;
  v_result jsonb;
BEGIN
  v_mode := derive_viewer_mode(p_project_id);
  IF v_mode = 'none' AND NOT user_has_project_access(p_project_id) THEN
    RAISE EXCEPTION 'No access';
  END IF;

  SELECT * INTO v_project FROM projects WHERE id = p_project_id;

  v_result := jsonb_build_object(
    'project', jsonb_build_object(
      'id', v_project.id,
      'name', v_project.name,
      'address', v_project.address,
      'status', v_project.status,
      'tracks_economy', v_project.tracks_economy,
      'tracks_rot', v_project.tracks_rot,
      -- Money fields nulled per mode
      'total_budget', CASE WHEN v_mode = 'full' THEN v_project.total_budget ELSE NULL END,
      'spent_amount', CASE WHEN v_mode = 'full' THEN v_project.spent_amount ELSE NULL END,
      'contract_value', CASE WHEN v_mode IN ('full', 'client') THEN v_project.contract_value ELSE NULL END
    ),
    'viewer_mode', v_mode
  );

  -- Log the view
  INSERT INTO access_log (project_id, profile_id, action, target_type)
  VALUES (p_project_id, get_user_profile_id(), 'view', 'overview');

  RETURN v_result;
END $$;

-- ===========================================================================
-- Migration verification
-- ===========================================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '================================================';
  RAISE NOTICE '✅ Team v2 migration complete';
  RAISE NOTICE '================================================';
  RAISE NOTICE '  - projects.tracks_economy + tracks_rot + owner_user_type added';
  RAISE NOTICE '  - project_shares.expires_at added';
  RAISE NOTICE '  - materials.paid_by added';
  RAISE NOTICE '  - access_log table created with RLS';
  RAISE NOTICE '  - derive_viewer_mode() + get_project_overview() RPCs created';
  RAISE NOTICE '';
  RAISE NOTICE 'Next: regenerate TypeScript types via Supabase CLI';
  RAISE NOTICE 'Next: implement personaToAccess.ts to replace packageToAccess.ts';
  RAISE NOTICE '';
END $$;

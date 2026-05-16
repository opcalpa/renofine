-- ===========================================================================
-- Renofine v2.2.0 — Team v2 foundation (Spår A1)
-- ===========================================================================
-- Additive-only schema for the Team/Invite v2 refactor.
-- Idempotent (IF NOT EXISTS). Backfills existing rows so nothing breaks.
--
-- NOTE: the field-masking RPCs (derive_viewer_mode / get_project_overview /
-- get_project_tasks / get_project_materials / get_project_as_persona) from the
-- handoff are DELIBERATELY NOT included here. They are SECURITY DEFINER and
-- must be written comprehensively + verified in Spår B. Shipping half-written
-- definer functions to prod is a security footgun. This migration is schema
-- only — nothing reads these columns until Spår B wires the service layer.
-- Revert: supabase/revert_20260516120000_team_v2_foundation.sql
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
  'When true, ROT fields appear on quotes/invoices and Skatteverket export available. Per-project opt-in.';
COMMENT ON COLUMN public.projects.owner_user_type IS
  'Cached from profile owner at project creation. Drives markup-model toggle: homeowner projects have no markup concept.';

-- Backfill owner_user_type from the owning profile
UPDATE public.projects p
SET owner_user_type = pr.onboarding_user_type
FROM public.profiles pr
WHERE p.owner_id = pr.id AND p.owner_user_type IS NULL;

-- Backfill tracks_economy = false for homeowner-owned projects that have no
-- accepted/sent quotes (they likely track finance outside the app).
UPDATE public.projects
SET tracks_economy = false
WHERE owner_user_type = 'homeowner' AND tracks_economy = true
  AND id NOT IN (SELECT project_id FROM public.quotes WHERE status IN ('accepted', 'sent'));

-- SMART ROT backfill (replaces the spec's blanket DEFAULT false):
-- keep ROT enabled for any project that already has ROT in use, so existing
-- ROT users don't silently lose ROT UI. Everything else stays false (opt-in).
UPDATE public.projects p
SET tracks_rot = true
WHERE tracks_rot = false
  AND (
       EXISTS (SELECT 1 FROM public.project_rot_persons rp WHERE rp.project_id = p.id)
    OR EXISTS (SELECT 1 FROM public.quotes q   WHERE q.project_id = p.id AND COALESCE(q.total_rot_deduction, 0) > 0)
    OR EXISTS (SELECT 1 FROM public.invoices i WHERE i.project_id = p.id AND COALESCE(i.total_rot_deduction, 0) > 0)
    OR EXISTS (SELECT 1 FROM public.tasks t    WHERE t.project_id = p.id AND (t.rot_eligible IS TRUE OR COALESCE(t.rot_amount, 0) > 0))
  );


-- 2. project_shares: expires_at (time-bounded specialist/auditor invitations)
-- ---------------------------------------------------------------------------
ALTER TABLE public.project_shares
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

COMMENT ON COLUMN public.project_shares.expires_at IS
  'When set, share auto-expires at this time. Used for time-bounded specialist/auditor invitations.';
-- role_type is already text; new values (pm_hired, member, etc.) need no DDL.


-- 3. materials: paid_by (homeowner projects where homeowner pays UE purchases)
-- ---------------------------------------------------------------------------
ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS paid_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.materials.paid_by IS
  'Who actually paid. Useful in homeowner-projects where homeowner pays UE-purchases directly. NULL = unspecified.';

CREATE INDEX IF NOT EXISTS idx_materials_paid_by ON public.materials(paid_by);


-- 4. access_log: audit trail (drives "last active" + audit-log sub-tab)
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

ALTER TABLE public.access_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Project owners can view audit log" ON public.access_log;
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

DROP POLICY IF EXISTS "System can insert audit log" ON public.access_log;
CREATE POLICY "System can insert audit log"
  ON public.access_log FOR INSERT
  WITH CHECK (true);  -- inserts happen via SECURITY DEFINER RPCs (Spår B)


-- ===========================================================================
DO $$
BEGIN
  RAISE NOTICE 'Team v2 foundation (Spår A1) applied — schema only, RPCs deferred to Spår B.';
END $$;

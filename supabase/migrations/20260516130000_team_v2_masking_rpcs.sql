-- ===========================================================================
-- Renofine v2.2.0 — Team v2 field-masking RPCs (Spår B1)
-- ===========================================================================
-- Additive: 1 internal helper + 5 SECURITY DEFINER RPCs. Nothing calls these
-- until the service layer is wired (Spår B2), so this migration is inert in
-- prod and verifiable in isolation via direct SQL as different roles.
-- Revert: supabase/revert_20260516130000_team_v2_masking_rpcs.sql
--
-- Economy modes (mirrors personaToAccess / detectPersonaMode):
--   full   — owner / budget_access=edit            → everything visible
--   own    — budget_access=view OR purchases≥create → own money only
--   client — role_type=client                       → contract_value only
--   none   — everything economy hidden
-- ---------------------------------------------------------------------------

-- ── derive_viewer_mode ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.derive_viewer_mode(p_project_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile uuid;
  v_owner   uuid;
  v_share   project_shares;
BEGIN
  v_profile := get_user_profile_id();
  IF v_profile IS NULL THEN RETURN 'none'; END IF;

  SELECT owner_id INTO v_owner FROM projects WHERE id = p_project_id;
  IF v_owner IS NULL THEN RETURN 'none'; END IF;
  IF v_owner = v_profile THEN RETURN 'full'; END IF;

  SELECT * INTO v_share FROM project_shares
  WHERE project_id = p_project_id AND shared_with_user_id = v_profile
  LIMIT 1;
  IF v_share.id IS NULL THEN RETURN 'none'; END IF;

  -- Expired time-bounded share → no economic access.
  IF v_share.expires_at IS NOT NULL AND v_share.expires_at < now() THEN
    RETURN 'none';
  END IF;

  IF v_share.role_type = 'client' THEN RETURN 'client'; END IF;
  IF v_share.budget_access = 'edit' THEN RETURN 'full'; END IF;
  IF v_share.budget_access = 'view' THEN RETURN 'own'; END IF;
  IF v_share.purchases_access IN ('create', 'edit') THEN RETURN 'own'; END IF;
  RETURN 'none';
END $$;

COMMENT ON FUNCTION public.derive_viewer_mode IS
  'Economic mode for the calling user on a project: full | own | client | none.';

-- ── _project_data_masked (internal, read-only) ──────────────────────────────
-- Builds the full field-masked overview payload for a given mode + viewer.
-- p_viewer is the profile whose "own" rows stay priced in own-mode; pass NULL
-- (e.g. preview) to mask all prices in own-mode.
CREATE OR REPLACE FUNCTION public._project_data_masked(
  p_project_id uuid,
  p_mode       text,
  p_viewer     uuid
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project projects;
  v_full    boolean := (p_mode = 'full');
  v_money   boolean := (p_mode IN ('full', 'client'));  -- contract_value tier
  v_result  jsonb;
BEGIN
  SELECT * INTO v_project FROM projects WHERE id = p_project_id;
  IF v_project.id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  v_result := jsonb_build_object(
    'project', jsonb_build_object(
      'id', v_project.id,
      'name', v_project.name,
      'address', v_project.address,
      'status', v_project.status,
      'tracks_economy', v_project.tracks_economy,
      'tracks_rot', v_project.tracks_rot,
      'total_budget',   CASE WHEN v_full  THEN v_project.total_budget   END,
      'spent_amount',   CASE WHEN v_full  THEN v_project.spent_amount   END,
      'contract_value', CASE WHEN v_money THEN v_project.contract_value END
    ),
    'viewer_mode', p_mode,
    'tasks', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', t.id,
        'title', t.title,
        'status', t.status,
        'progress', COALESCE(t.progress, 0),
        'start_date', t.start_date,
        'finish_date', t.finish_date,
        'room_id', t.room_id,
        'cost_centers', to_jsonb(t.cost_centers),
        'budget',         CASE WHEN v_full THEN t.budget         END,
        'payment_status', CASE WHEN v_full THEN t.payment_status END,
        'paid_amount',    CASE WHEN v_full THEN t.paid_amount    END
      ))
      FROM tasks t WHERE t.project_id = p_project_id
    ), '[]'::jsonb),
    'materials', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', m.id,
        'name', m.name,
        'quantity', m.quantity,
        'unit', m.unit,
        'status', m.status,
        'room_id', m.room_id,
        'created_by_user_id', m.created_by_user_id,
        'exclude_from_budget', m.exclude_from_budget,
        -- full: all prices. own: only the viewer's own rows. else: none.
        'price_per_unit', CASE WHEN v_full OR (p_mode='own' AND p_viewer IS NOT NULL AND m.created_by_user_id = p_viewer) THEN m.price_per_unit END,
        'price_total',    CASE WHEN v_full OR (p_mode='own' AND p_viewer IS NOT NULL AND m.created_by_user_id = p_viewer) THEN m.price_total END,
        'vendor_name',    CASE WHEN v_full OR (p_mode='own' AND p_viewer IS NOT NULL AND m.created_by_user_id = p_viewer) THEN m.vendor_name END,
        'vendor_link',    CASE WHEN v_full OR (p_mode='own' AND p_viewer IS NOT NULL AND m.created_by_user_id = p_viewer) THEN m.vendor_link END,
        'paid_by',        CASE WHEN v_full THEN m.paid_by END
      ))
      FROM materials m WHERE m.project_id = p_project_id
    ), '[]'::jsonb)
  );

  RETURN v_result;
END $$;

COMMENT ON FUNCTION public._project_data_masked IS
  'Internal: field-masked project payload for a given economy mode. Use the public get_project_* wrappers.';

-- ── get_project_overview ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_project_overview(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode    text;
  v_profile uuid;
  v_result  jsonb;
BEGIN
  v_profile := get_user_profile_id();
  v_mode := derive_viewer_mode(p_project_id);

  IF v_mode = 'none' AND NOT user_has_project_access(p_project_id) THEN
    RAISE EXCEPTION 'No access to project %', p_project_id
      USING ERRCODE = '42501';
  END IF;

  v_result := _project_data_masked(p_project_id, v_mode, v_profile);

  IF v_profile IS NOT NULL THEN
    INSERT INTO access_log (project_id, profile_id, action, target_type)
    VALUES (p_project_id, v_profile, 'view', 'overview');
  END IF;

  RETURN v_result;
END $$;

COMMENT ON FUNCTION public.get_project_overview IS
  'Field-masked project overview for the calling user. Logs a view to access_log.';

-- ── get_project_tasks ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_project_tasks(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode    text;
  v_profile uuid;
BEGIN
  v_profile := get_user_profile_id();
  v_mode := derive_viewer_mode(p_project_id);
  IF v_mode = 'none' AND NOT user_has_project_access(p_project_id) THEN
    RAISE EXCEPTION 'No access to project %', p_project_id USING ERRCODE = '42501';
  END IF;
  RETURN _project_data_masked(p_project_id, v_mode, v_profile) -> 'tasks';
END $$;

-- ── get_project_materials ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_project_materials(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode    text;
  v_profile uuid;
BEGIN
  v_profile := get_user_profile_id();
  v_mode := derive_viewer_mode(p_project_id);
  IF v_mode = 'none' AND NOT user_has_project_access(p_project_id) THEN
    RAISE EXCEPTION 'No access to project %', p_project_id USING ERRCODE = '42501';
  END IF;
  RETURN _project_data_masked(p_project_id, v_mode, v_profile) -> 'materials';
END $$;

-- ── get_project_as_persona (preview — owner only) ───────────────────────────
CREATE OR REPLACE FUNCTION public.get_project_as_persona(
  p_project_id uuid,
  p_persona    text,
  p_mode       text
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_effective_mode text;
BEGIN
  -- Preview is owner-only (co_owner support can be added later).
  IF NOT user_owns_project(p_project_id) THEN
    RAISE EXCEPTION 'Only the project owner can preview as persona'
      USING ERRCODE = '42501';
  END IF;

  v_effective_mode := CASE
    WHEN p_persona = 'client' THEN 'client'
    WHEN p_mode IN ('none', 'own', 'full') THEN p_mode
    ELSE 'none'
  END;

  -- p_viewer NULL → own-mode masks all prices (preview has no "self").
  RETURN _project_data_masked(p_project_id, v_effective_mode, NULL);
END $$;

COMMENT ON FUNCTION public.get_project_as_persona IS
  'Owner-only: project payload masked as if seen by the given persona+mode (InvitePreviewOverlay).';

-- ===========================================================================
DO $$
BEGIN
  RAISE NOTICE 'Team v2 masking RPCs (Spår B1) applied — additive, no callers yet.';
END $$;

-- Team v2 · L3 — add link/scalar fields to masked materials payload
--
-- Additive only: adds task_id, purchase_order_id, created_at to each
-- materials object in _project_data_masked. These are non-sensitive link
-- fields (no price/vendor data) and are returned unmasked for every mode,
-- so MaterialsList (a per-task view) can client-filter masked results.
-- Nothing else changes. Idempotent (CREATE OR REPLACE).
-- Revert: supabase/revert_20260517100000_team_v2_masking_materials_links.sql

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
        -- additive link/scalar fields (non-sensitive, unmasked):
        'task_id', m.task_id,
        'purchase_order_id', m.purchase_order_id,
        'created_at', m.created_at,
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
  'Internal: field-masked project payload for a given economy mode. Use the public get_project_* wrappers. (+ materials link fields for per-task views)';

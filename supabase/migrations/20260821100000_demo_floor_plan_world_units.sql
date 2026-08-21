-- SP2 fix: plan shapes must be in WORLD UNITS, not mm.
--
-- v2/v1 editors persist coordinates in "world units" (canvas px at zoom 1,
-- 1 unit = 1/pixelsPerMm mm; default 0.1 → 1 unit = 10 mm — see
-- editor/core/units.ts). The legacy room polygons were seeded in raw mm
-- (5000 for 5 m), i.e. 10× the world scale — invisible while rooms sat alone
-- on the canvas, but the first migration copied them verbatim and added
-- mm-scale walls → measurement labels read "64 000 mm" for a 6.4 m wall.
--
-- This replaces seed_demo_floor_plan so all plan-scoped shapes are ÷10:
-- rooms via a jsonb transform of the legacy polygons, walls/doors as
-- world-unit literals. thicknessMM/heightMM stay in real mm (semantic mm
-- fields, converted via mmToWorld at render). Legacy rows stay untouched.
-- Idempotent — re-runs clear plan shapes first; backfills the public demo.

CREATE OR REPLACE FUNCTION seed_demo_floor_plan(p_project_id UUID, p_language TEXT DEFAULT 'sv')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan_id UUID;
  v_is_en BOOLEAN := (p_language = 'en');
  v_wall_name TEXT;
  v_inner_name TEXT;
BEGIN
  v_wall_name  := CASE WHEN v_is_en THEN 'Exterior wall' ELSE 'Yttervägg' END;
  v_inner_name := CASE WHEN v_is_en THEN 'Interior wall' ELSE 'Innervägg' END;

  SELECT id INTO v_plan_id FROM floor_map_plans
  WHERE project_id = p_project_id
  ORDER BY is_default DESC, created_at ASC
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    INSERT INTO floor_map_plans (project_id, name, is_default)
    VALUES (p_project_id, CASE WHEN v_is_en THEN 'Floor plan' ELSE 'Planritning' END, true)
    RETURNING id INTO v_plan_id;
  ELSE
    UPDATE floor_map_plans
    SET name = CASE WHEN v_is_en THEN 'Floor plan' ELSE 'Planritning' END,
        is_default = true
    WHERE id = v_plan_id;
  END IF;

  DELETE FROM floor_map_shapes WHERE project_id = p_project_id AND plan_id = v_plan_id;

  -- Plan-scoped room copies, polygons transformed mm → world units (÷10).
  INSERT INTO floor_map_shapes (id, project_id, room_id, plan_id, shape_type, shape_data)
  SELECT gen_random_uuid(), s.project_id, s.room_id, v_plan_id, s.shape_type,
    s.shape_data || jsonb_build_object(
      'points', t.scaled,
      'coordinates', t.scaled)
  FROM floor_map_shapes s
  CROSS JOIN LATERAL (
    SELECT jsonb_agg(
             jsonb_build_object(
               'x', ((e->>'x')::numeric / 10)::int,
               'y', ((e->>'y')::numeric / 10)::int)
             ORDER BY ord) AS scaled
    FROM jsonb_array_elements(s.shape_data->'points') WITH ORDINALITY AS a(e, ord)
  ) t
  WHERE s.project_id = p_project_id AND s.plan_id IS NULL AND s.shape_type = 'room';

  -- Walls (world units; 1 unit = 10 mm → 630 = 6.3 m)
  INSERT INTO floor_map_shapes (id, project_id, plan_id, shape_type, shape_data)
  SELECT gen_random_uuid(), p_project_id, v_plan_id, 'wall', jsonb_build_object(
    'coordinates', jsonb_build_object('x1', w.x1, 'y1', w.y1, 'x2', w.x2, 'y2', w.y2),
    'points',      jsonb_build_object('x1', w.x1, 'y1', w.y1, 'x2', w.x2, 'y2', w.y2),
    'strokeColor', '#2d3748', 'thicknessMM', 200, 'heightMM', 2400,
    'name', CASE WHEN w.ext THEN v_wall_name ELSE v_inner_name END)
  FROM (VALUES
    -- Exterior envelope (clockwise from top-left)
    ( -10,  -10,  630,  -10, true),   -- north (kök + badrum)
    ( 630,  -10,  630,  240, true),   -- east upper (badrum)
    ( 630,  240,  830,  240, true),   -- sovrum north
    ( 830,  240,  830,  660, true),   -- east (sovrum)
    ( 830,  660,  510,  660, true),   -- sovrum south
    ( 510,  660,  510,  760, true),   -- east lower (vardagsrum)
    ( 510,  760,  -10,  760, true),   -- south (vardagsrum)
    ( -10,  760,  -10,  -10, true),   -- west
    -- Interior partitions (centered in the polygon gaps)
    ( 410,  -10,  410,  210, false),  -- kök | badrum
    ( -10,  210,  630,  210, false),  -- kök/badrum | hall
    ( -10,  340,  510,  340, false),  -- hall | vardagsrum
    ( 510,  210,  510,  660, false)   -- hall/vardagsrum | sovrum
  ) AS w(x1, y1, x2, y2, ext);

  -- Doors (library symbols; world-unit placement on wall centerlines)
  INSERT INTO floor_map_shapes (id, project_id, plan_id, shape_type, shape_data)
  SELECT gen_random_uuid(), p_project_id, v_plan_id, 'freehand', jsonb_build_object(
    'coordinates', jsonb_build_array(
      jsonb_build_object('x', d.x, 'y', d.y),
      jsonb_build_object('x', d.x + 1, 'y', d.y + 1)),
    'points', jsonb_build_array(
      jsonb_build_object('x', d.x, 'y', d.y),
      jsonb_build_object('x', d.x + 1, 'y', d.y + 1)),
    'strokeColor', '#000000',
    'name', CASE WHEN v_is_en THEN d.name_en ELSE d.name_sv END,
    'symbolType', d.symbol,
    'metadata', jsonb_build_object(
      'isLibrarySymbol', true, 'symbolType', d.symbol,
      'placementX', d.x, 'placementY', d.y, 'scale', 1, 'rotation', d.rot))
  FROM (VALUES
    ( -10, 275,  90, 'door_swing_right', 'Entrédörr',       'Entry door'),
    ( 120, 210,   0, 'door_swing_left',  'Dörr kök',        'Kitchen door'),
    ( 470, 210,   0, 'door_swing_left',  'Dörr badrum',     'Bathroom door'),
    ( 250, 340,   0, 'door_swing_left',  'Dörr vardagsrum', 'Living room door'),
    ( 510, 290, 270, 'door_swing_right', 'Dörr sovrum',     'Bedroom door')
  ) AS d(x, y, rot, symbol, name_sv, name_en);
END;
$$;

-- Re-backfill the public demo at the correct scale.
SELECT seed_demo_floor_plan('00000000-0000-0000-0000-000000000001', 'sv');

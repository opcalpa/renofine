-- SP2 fix 2: rooms in canonical {points:[...]} format + doors as v2 openings.
--
-- Two findings from live verification of the previous migrations:
-- (1) BOTH editors' room renderers read `coordinates.points` (an OBJECT with a
--     points array) — the seed stored a raw array, so seeded room shapes have
--     never rendered on any canvas. Plan copies now wrap the scaled polygon in
--     jsonb_build_object('points', ...). Legacy rows stay untouched.
-- (2) v2 renders doors as native `opening` shapes (parentWallId +
--     positionOnWall + openingKind + metadata.widthMM) via OpeningsLayer —
--     library-symbol doors are invisible in v2 (the demo's default editor).
--     Door-bearing walls get explicit UUIDs so openings can reference them.

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
  -- Door-bearing walls need known ids for the openings' parentWallId.
  v_wall_west UUID := gen_random_uuid();   -- exterior west (entry door)
  v_wall_hall UUID := gen_random_uuid();   -- kök/badrum | hall
  v_wall_livi UUID := gen_random_uuid();   -- hall | vardagsrum
  v_wall_sovr UUID := gen_random_uuid();   -- hall/vardagsrum | sovrum
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

  -- Plan-scoped room copies: polygons ÷10 (mm → world units), wrapped in the
  -- canonical {points:[...]} coordinate object both editors' room marks read.
  INSERT INTO floor_map_shapes (id, project_id, room_id, plan_id, shape_type, shape_data)
  SELECT gen_random_uuid(), s.project_id, s.room_id, v_plan_id, s.shape_type,
    s.shape_data || jsonb_build_object(
      'points', jsonb_build_object('points', t.scaled),
      'coordinates', jsonb_build_object('points', t.scaled))
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

  -- Walls (world units, 1 unit = 10 mm). Door-bearing walls use fixed ids.
  INSERT INTO floor_map_shapes (id, project_id, plan_id, shape_type, shape_data)
  SELECT w.id, p_project_id, v_plan_id, 'wall', jsonb_build_object(
    'coordinates', jsonb_build_object('x1', w.x1, 'y1', w.y1, 'x2', w.x2, 'y2', w.y2),
    'points',      jsonb_build_object('x1', w.x1, 'y1', w.y1, 'x2', w.x2, 'y2', w.y2),
    'strokeColor', '#2d3748', 'thicknessMM', 200, 'heightMM', 2400,
    'name', CASE WHEN w.ext THEN v_wall_name ELSE v_inner_name END)
  FROM (VALUES
    -- Exterior envelope (clockwise from top-left)
    (gen_random_uuid(), -10,  -10,  630,  -10, true),   -- north (kök + badrum)
    (gen_random_uuid(),  630,  -10,  630,  240, true),  -- east upper (badrum)
    (gen_random_uuid(),  630,  240,  830,  240, true),  -- sovrum north
    (gen_random_uuid(),  830,  240,  830,  660, true),  -- east (sovrum)
    (gen_random_uuid(),  830,  660,  510,  660, true),  -- sovrum south
    (gen_random_uuid(),  510,  660,  510,  760, true),  -- east lower (vardagsrum)
    (gen_random_uuid(),  510,  760,  -10,  760, true),  -- south (vardagsrum)
    (v_wall_west,        -10,  760,  -10,  -10, true),  -- west (entry door)
    -- Interior partitions (centered in the polygon gaps)
    (gen_random_uuid(),  410,  -10,  410,  210, false), -- kök | badrum
    (v_wall_hall,        -10,  210,  630,  210, false), -- kök/badrum | hall
    (v_wall_livi,        -10,  340,  510,  340, false), -- hall | vardagsrum
    (v_wall_sovr,        510,  210,  510,  660, false)  -- hall/vardagsrum | sovrum
  ) AS w(id, x1, y1, x2, y2, ext);

  -- Doors as v2-native openings (rendered cut + swing by OpeningsLayer;
  -- position = 0..1 along the wall from its start point, width in real mm).
  INSERT INTO floor_map_shapes (id, project_id, plan_id, shape_type, shape_data)
  SELECT gen_random_uuid(), p_project_id, v_plan_id, 'opening', jsonb_build_object(
    'coordinates', '{}'::jsonb,
    'points', '{}'::jsonb,
    'openingKind', 'door',
    'positionOnWall', d.t,
    'openingDirection', d.dir,
    'parentWallId', d.wall_id,
    'name', CASE WHEN v_is_en THEN d.name_en ELSE d.name_sv END,
    'metadata', jsonb_build_object('widthMM', 900))
  FROM (VALUES
    (v_wall_west, 0.63,  'left',  'Entrédörr',       'Entry door'),
    (v_wall_hall, 0.203, 'left',  'Dörr kök',        'Kitchen door'),
    (v_wall_hall, 0.75,  'right', 'Dörr badrum',     'Bathroom door'),
    (v_wall_livi, 0.5,   'left',  'Dörr vardagsrum', 'Living room door'),
    (v_wall_sovr, 0.178, 'right', 'Dörr sovrum',     'Bedroom door')
  ) AS d(wall_id, t, dir, name_sv, name_en);
END;
$$;

-- Re-backfill the public demo with rendering room fills + real door openings.
SELECT seed_demo_floor_plan('00000000-0000-0000-0000-000000000001', 'sv');

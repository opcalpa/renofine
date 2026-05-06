-- Enrich demo project materials with varied statuses, price_total,
-- and material_estimate on tasks so the Purchases page looks populated.
-- Idempotent: uses the seed function's project lookup.

CREATE OR REPLACE FUNCTION enrich_demo_materials()
RETURNS void AS $$
DECLARE
  v_proj RECORD;
  v_mat RECORD;
  v_idx int;
  v_statuses text[] := ARRAY['done', 'done', 'done', 'ordered', 'ordered', 'delivered', 'to_order', 'to_order', 'new', 'new', 'new', 'new'];
BEGIN
  -- Loop over all personal demo projects
  FOR v_proj IN
    SELECT id FROM projects WHERE project_type = 'demo_project'
  LOOP
    v_idx := 0;
    FOR v_mat IN
      SELECT id, quantity, cost
      FROM materials
      WHERE project_id = v_proj.id
      ORDER BY created_at
    LOOP
      v_idx := v_idx + 1;
      UPDATE materials SET
        price_total = v_mat.quantity * v_mat.cost,
        status = v_statuses[LEAST(v_idx, array_length(v_statuses, 1))]
      WHERE id = v_mat.id;
    END LOOP;

    -- Set material_estimate on tasks (sum of linked materials' price_total)
    UPDATE tasks t SET
      material_estimate = sub.total
    FROM (
      SELECT task_id, SUM(price_total) AS total
      FROM materials
      WHERE project_id = v_proj.id AND task_id IS NOT NULL
      GROUP BY task_id
    ) sub
    WHERE t.id = sub.task_id AND t.project_id = v_proj.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

SELECT enrich_demo_materials();
DROP FUNCTION enrich_demo_materials();

-- Also patch the seed_demo_project_for_user function to set price_total + material_estimate
-- on newly created demo projects going forward
CREATE OR REPLACE FUNCTION public.seed_demo_project_for_user(p_owner_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_project_id UUID;
  v_room_ids UUID[];
  v_task_ids UUID[];
  v_today DATE := CURRENT_DATE;
  v_mat_statuses text[] := ARRAY['done', 'done', 'done', 'ordered', 'ordered', 'delivered', 'to_order', 'to_order', 'new', 'new', 'new', 'new'];
  v_mat_idx int := 0;
  v_mat_id UUID;
BEGIN
  -- Check if demo project already exists for this user
  SELECT id INTO v_project_id
  FROM projects
  WHERE owner_id = p_owner_id AND project_type = 'demo_project'
  LIMIT 1;

  IF v_project_id IS NOT NULL THEN
    -- Refresh existing demo project dates
    UPDATE tasks SET
      start_date = v_today + (start_date - (SELECT MIN(start_date) FROM tasks WHERE project_id = v_project_id AND start_date IS NOT NULL)) - 21,
      finish_date = v_today + (finish_date - (SELECT MIN(start_date) FROM tasks WHERE project_id = v_project_id AND start_date IS NOT NULL)) - 21
    WHERE project_id = v_project_id AND start_date IS NOT NULL;

    RETURN v_project_id;
  END IF;

  -- Create demo project
  INSERT INTO projects (id, name, description, owner_id, project_type, status, total_budget, address, city, postal_code, country, start_date, finish_goal_date)
  VALUES (
    gen_random_uuid(),
    'Renovering Vasastan 3:a',
    'Ytskiktsrenovering av 3:a i Vasastan. Spackling, målning, tapetsering, golvslipning, nytt kök-stänkskydd och badrumskakel.',
    p_owner_id, 'demo_project', 'active', 134000,
    'Odengatan 45', 'Stockholm', '113 51', 'SE',
    v_today - 21, v_today + 20
  )
  RETURNING id INTO v_project_id;

  -- Create rooms
  INSERT INTO rooms (id, project_id, name, status, area_sqm, ceiling_height_mm, color)
  VALUES
    (gen_random_uuid(), v_project_id, 'Vardagsrum', 'to_be_renovated', 18, 2600, '#60A5FA'),
    (gen_random_uuid(), v_project_id, 'Sovrum', 'to_be_renovated', 12, 2600, '#A78BFA'),
    (gen_random_uuid(), v_project_id, 'Kök', 'to_be_renovated', 8, 2600, '#34D399'),
    (gen_random_uuid(), v_project_id, 'Badrum', 'to_be_renovated', 4, 2600, '#38BDF8'),
    (gen_random_uuid(), v_project_id, 'Hall', 'to_be_renovated', 6, 2600, '#FBBF24');

  SELECT array_agg(id ORDER BY name) INTO v_room_ids FROM rooms WHERE project_id = v_project_id;
  -- Order: Badrum[1], Hall[2], Kök[3], Sovrum[4], Vardagsrum[5]

  -- Create tasks with dates relative to today
  INSERT INTO tasks (id, project_id, room_id, title, status, priority, cost_center, budget, start_date, finish_date, created_by_user_id)
  VALUES
    (gen_random_uuid(), v_project_id, NULL,          'Förberedelser och skyddsarbete', 'done',  'high',   'preparation', 3000,  v_today-21, v_today-19, p_owner_id),
    (gen_random_uuid(), v_project_id, v_room_ids[5], 'Spackling av väggar',           'done',  'high',   'walls',       8000,  v_today-19, v_today-16, p_owner_id),
    (gen_random_uuid(), v_project_id, v_room_ids[5], 'Målning väggar & tak',          'done',  'medium', 'painting',    12000, v_today-16, v_today-13, p_owner_id),
    (gen_random_uuid(), v_project_id, v_room_ids[4], 'Tapetsering sovrum',            'doing', 'medium', 'walls',       6000,  v_today-5,  v_today-3,  p_owner_id),
    (gen_random_uuid(), v_project_id, v_room_ids[5], 'Slipning och lackning golv',    'to_do', 'high',   'flooring',    18000, v_today+2,  v_today+6,  p_owner_id),
    (gen_random_uuid(), v_project_id, v_room_ids[3], 'Kök bänkskiva & stänkskydd',    'to_do', 'medium', 'kitchen',     25000, v_today+7,  v_today+10, p_owner_id),
    (gen_random_uuid(), v_project_id, v_room_ids[1], 'Kakling badrum',                'to_do', 'high',   'bathroom',    35000, v_today+10, v_today+15, p_owner_id),
    (gen_random_uuid(), v_project_id, NULL,          'Montering av lister',           'to_do', 'low',    'finishing',   8000,  v_today+16, v_today+18, p_owner_id),
    (gen_random_uuid(), v_project_id, v_room_ids[3], 'Elinstallation kök',            'to_do', 'medium', 'electrical',  15000, v_today+5,  v_today+7,  p_owner_id),
    (gen_random_uuid(), v_project_id, NULL,          'Slutstädning',                  'to_do', 'low',    'other',       4000,  v_today+19, v_today+20, p_owner_id);

  SELECT array_agg(id ORDER BY start_date, title) INTO v_task_ids FROM tasks WHERE project_id = v_project_id;

  -- Create materials with price_total and varied statuses
  INSERT INTO materials (id, project_id, room_id, task_id, name, quantity, unit, cost, price_total, vendor_name, status, created_by_user_id)
  VALUES
    (gen_random_uuid(), v_project_id, v_room_ids[5], v_task_ids[2],  'Spackel fin (Gyproc)',        5,  'st',     350,  1750,  'Byggmax',      'done',      p_owner_id),
    (gen_random_uuid(), v_project_id, v_room_ids[5], v_task_ids[3],  'Väggfärg Beckers Scotte 7',   25, 'liter',  85,   2125,  'Colorama',     'done',      p_owner_id),
    (gen_random_uuid(), v_project_id, v_room_ids[5], v_task_ids[3],  'Takfärg Beckers Takfärg',     10, 'liter',  95,   950,   'Colorama',     'done',      p_owner_id),
    (gen_random_uuid(), v_project_id, v_room_ids[4], v_task_ids[4],  'Tapet Boråstapeter Linen',    6,  'rullar', 890,  5340,  'Boråstapeter', 'ordered',   p_owner_id),
    (gen_random_uuid(), v_project_id, v_room_ids[5], v_task_ids[5],  'Golvlack Bona Traffic HD',    5,  'liter',  520,  2600,  'Bona',         'ordered',   p_owner_id),
    (gen_random_uuid(), v_project_id, v_room_ids[3], v_task_ids[6],  'Bänkskiva IKEA Ekbacken',     1,  'st',     8500, 8500,  'IKEA',         'delivered', p_owner_id),
    (gen_random_uuid(), v_project_id, v_room_ids[3], v_task_ids[6],  'Kakel stänkskydd vit 10x20',  2,  'kvm',    650,  1300,  'Kakel Direkt', 'to_order',  p_owner_id),
    (gen_random_uuid(), v_project_id, v_room_ids[1], v_task_ids[7],  'Kakel vägg vit blank 20x25',  12, 'kvm',    490,  5880,  'Bauhaus',      'to_order',  p_owner_id),
    (gen_random_uuid(), v_project_id, v_room_ids[1], v_task_ids[7],  'Fogmassa grå',                8,  'kg',     65,   520,   'Bauhaus',      'new',       p_owner_id),
    (gen_random_uuid(), v_project_id, NULL,          v_task_ids[8],  'Golvlist vitmålad 12x56mm',   45, 'meter',  89,   4005,  'Byggmax',      'new',       p_owner_id),
    (gen_random_uuid(), v_project_id, v_room_ids[5], v_task_ids[8],  'Taklist klassisk 45mm',       25, 'meter',  125,  3125,  'Byggmax',      'new',       p_owner_id),
    (gen_random_uuid(), v_project_id, v_room_ids[3], v_task_ids[9],  'LED-spots inbyggnad 6W',      6,  'st',     299,  1794,  'Elgiganten',   'new',       p_owner_id);

  -- Set material_estimate on tasks
  UPDATE tasks t SET material_estimate = sub.total
  FROM (
    SELECT task_id, SUM(price_total) AS total
    FROM materials WHERE project_id = v_project_id AND task_id IS NOT NULL
    GROUP BY task_id
  ) sub
  WHERE t.id = sub.task_id AND t.project_id = v_project_id;

  RETURN v_project_id;
END;
$fn$;

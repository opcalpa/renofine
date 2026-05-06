-- Add "planned" material budget posts to demo projects so the
-- Inköp page shows the budget summary boxes above the table.
-- "planned" materials act as budget categories that purchases are tracked against.

DO $$
DECLARE
  v_proj RECORD;
BEGIN
  FOR v_proj IN
    SELECT id, owner_id FROM projects WHERE project_type = 'demo_project'
  LOOP
    -- Skip if planned materials already exist for this demo project
    IF EXISTS (SELECT 1 FROM materials WHERE project_id = v_proj.id AND status = 'planned' LIMIT 1) THEN
      CONTINUE;
    END IF;

    INSERT INTO materials (id, project_id, room_id, task_id, name, quantity, unit, cost, price_total, vendor_name, status, created_by_user_id)
    VALUES
      -- Färg & spackel budget
      (gen_random_uuid(), v_proj.id, NULL, NULL, 'Färg & spackel', 1, 'st', 5000, 5000, NULL, 'planned', v_proj.owner_id),
      -- Golv budget
      (gen_random_uuid(), v_proj.id, NULL, NULL, 'Golvmaterial', 1, 'st', 3000, 3000, NULL, 'planned', v_proj.owner_id),
      -- Kakel & klinker budget
      (gen_random_uuid(), v_proj.id, NULL, NULL, 'Kakel & klinker', 1, 'st', 12000, 12000, NULL, 'planned', v_proj.owner_id),
      -- Kök budget
      (gen_random_uuid(), v_proj.id, NULL, NULL, 'Köksmaterial', 1, 'st', 10000, 10000, NULL, 'planned', v_proj.owner_id),
      -- Lister & detaljer budget
      (gen_random_uuid(), v_proj.id, NULL, NULL, 'Lister & detaljer', 1, 'st', 7500, 7500, NULL, 'planned', v_proj.owner_id),
      -- El & belysning budget
      (gen_random_uuid(), v_proj.id, NULL, NULL, 'El & belysning', 1, 'st', 2000, 2000, NULL, 'planned', v_proj.owner_id);
  END LOOP;
END;
$$;

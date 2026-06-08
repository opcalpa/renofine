-- Demo overhaul, part 1: reality-anchored purchases + work (tasks).
--
-- Rewrites seed_demo_project_for_user() with a richer, more believable dataset
-- for the per-user demo ("Demo: Renovering Vasastan 3:a" / "Demo: 3-room
-- Apartment Renovation"). No schema changes — only the seed function body.
--
-- Changes vs 20260601120000:
--   * Tasks: 10 → 12. Adds "Rivning & demontering" and "Tätskikt badrum"
--     (tätskikt before tiling = realistic + educational). Budgets still sum to
--     134 000. Logical room links maximised.
--   * Purchase orders: 2 → 3, modelling a real purchasing flow
--     (Colorama paint/prep = delivered+paid w/ receipt_total; Boråstapeter
--     wallpaper = ordered; Kakelspecialisten bathroom = ordered).
--   * Materials: 12 → 21, real Swedish vendors, corrected prices, vendor_link
--     on key branded products. PO-invariant kept (non-'planned' → has a PO).
--   * Rooms now also set rooms.color (matches floor-map fillColor).
--
-- Images (photos table) are added in a follow-up migration once curated.
--
-- REVERT: re-apply 20260601120000_demo_project_naming.sql (restores the prior
-- 2-arg function body). This migration only does CREATE OR REPLACE FUNCTION, so
-- re-running the prior file fully reverts it. No data is destroyed here; new
-- per-user demos seeded after this point get the new content, existing demos
-- keep theirs (the function refreshes dates only for already-seeded users).
--
-- Idempotent: CREATE OR REPLACE re-runs cleanly.

CREATE OR REPLACE FUNCTION seed_demo_project_for_user(p_owner_id UUID, p_language TEXT DEFAULT 'sv')
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_project_id UUID;
  v_room_ids UUID[] := ARRAY[]::UUID[];
  v_task_ids UUID[] := ARRAY[]::UUID[];
  v_room_id UUID;
  v_task_id UUID;
  v_today DATE := CURRENT_DATE;
  v_is_en BOOLEAN := (p_language = 'en');
  v_po_paint UUID;      -- Colorama: paint + prep (delivered, paid)
  v_po_wallpaper UUID;  -- Boråstapeter: wallpaper (ordered)
  v_po_tiles UUID;      -- Kakelspecialisten: bathroom tiles + tätskikt (ordered)
  v_min_start DATE;
BEGIN
  -- If the user already has a demo project, refresh its task dates so the
  -- timeline always shows relevant example data, then return.
  SELECT id INTO v_project_id
  FROM projects
  WHERE owner_id = p_owner_id AND project_type = 'demo_project'
  LIMIT 1;

  IF v_project_id IS NOT NULL THEN
    SELECT MIN(start_date) INTO v_min_start
    FROM tasks WHERE project_id = v_project_id AND start_date IS NOT NULL;

    IF v_min_start IS NOT NULL THEN
      UPDATE tasks SET
        start_date = v_today + (start_date - v_min_start) - 21,
        finish_date = v_today + (finish_date - v_min_start) - 21
      WHERE project_id = v_project_id AND start_date IS NOT NULL;
    END IF;

    RETURN v_project_id;
  END IF;

  v_project_id := gen_random_uuid();

  INSERT INTO projects (id, name, description, owner_id, status, project_type, total_budget, address, city, postal_code, country)
  VALUES (
    v_project_id,
    CASE WHEN v_is_en THEN 'Demo: 3-room Apartment Renovation' ELSE 'Demo: Renovering Vasastan 3:a' END,
    CASE WHEN v_is_en THEN 'A demo project showcasing Renofine features. Surface renovation of a 3-room apartment in Stockholm.' ELSE 'Ytskiktsrenovering av 3-rumslägenhet i Vasastan, Stockholm. Ca 52 kvm.' END,
    p_owner_id,
    'active',
    'demo_project',
    134000,
    'Odengatan 45',
    'Stockholm',
    '113 51',
    'SE'
  );

  -- ─── Rooms (5) ────────────────────────────────────────────────────────────
  -- Living room
  v_room_id := gen_random_uuid();
  v_room_ids := array_append(v_room_ids, v_room_id);
  INSERT INTO rooms (id, project_id, name, description, status, ceiling_height_mm, color)
  VALUES (v_room_id, v_project_id,
    CASE WHEN v_is_en THEN 'Living Room' ELSE 'Vardagsrum' END,
    CASE WHEN v_is_en THEN 'Large living room with parquet flooring' ELSE 'Stort vardagsrum med parkettgolv' END,
    'to_be_renovated', 2600, '#60A5FA');

  INSERT INTO floor_map_shapes (id, project_id, room_id, shape_type, shape_data)
  VALUES (gen_random_uuid(), v_project_id, v_room_id, 'room',
    jsonb_build_object(
      'points', '[{"x":0,"y":3500},{"x":5000,"y":3500},{"x":5000,"y":7500},{"x":0,"y":7500}]'::jsonb,
      'coordinates', '[{"x":0,"y":3500},{"x":5000,"y":3500},{"x":5000,"y":7500},{"x":0,"y":7500}]'::jsonb,
      'fillColor', '#60A5FA', 'strokeColor', '#60A5FA',
      'name', CASE WHEN v_is_en THEN 'Living Room' ELSE 'Vardagsrum' END
    ));

  -- Bedroom
  v_room_id := gen_random_uuid();
  v_room_ids := array_append(v_room_ids, v_room_id);
  INSERT INTO rooms (id, project_id, name, description, status, ceiling_height_mm, color)
  VALUES (v_room_id, v_project_id,
    CASE WHEN v_is_en THEN 'Bedroom' ELSE 'Sovrum' END,
    CASE WHEN v_is_en THEN 'Bedroom with patterned feature wall' ELSE 'Sovrum med mönstrad fondvägg' END,
    'to_be_renovated', 2600, '#A78BFA');

  INSERT INTO floor_map_shapes (id, project_id, room_id, shape_type, shape_data)
  VALUES (gen_random_uuid(), v_project_id, v_room_id, 'room',
    jsonb_build_object(
      'points', '[{"x":5200,"y":2500},{"x":8200,"y":2500},{"x":8200,"y":6500},{"x":5200,"y":6500}]'::jsonb,
      'coordinates', '[{"x":5200,"y":2500},{"x":8200,"y":2500},{"x":8200,"y":6500},{"x":5200,"y":6500}]'::jsonb,
      'fillColor', '#A78BFA', 'strokeColor', '#A78BFA',
      'name', CASE WHEN v_is_en THEN 'Bedroom' ELSE 'Sovrum' END
    ));

  -- Kitchen
  v_room_id := gen_random_uuid();
  v_room_ids := array_append(v_room_ids, v_room_id);
  INSERT INTO rooms (id, project_id, name, description, status, ceiling_height_mm, color)
  VALUES (v_room_id, v_project_id,
    CASE WHEN v_is_en THEN 'Kitchen' ELSE 'Kök' END,
    CASE WHEN v_is_en THEN 'Kitchen with new countertop and backsplash' ELSE 'Kök med ny bänkskiva och stänkskydd' END,
    'to_be_renovated', 2600, '#34D399');

  INSERT INTO floor_map_shapes (id, project_id, room_id, shape_type, shape_data)
  VALUES (gen_random_uuid(), v_project_id, v_room_id, 'room',
    jsonb_build_object(
      'points', '[{"x":0,"y":0},{"x":4000,"y":0},{"x":4000,"y":2000},{"x":0,"y":2000}]'::jsonb,
      'coordinates', '[{"x":0,"y":0},{"x":4000,"y":0},{"x":4000,"y":2000},{"x":0,"y":2000}]'::jsonb,
      'fillColor', '#34D399', 'strokeColor', '#34D399',
      'name', CASE WHEN v_is_en THEN 'Kitchen' ELSE 'Kök' END
    ));

  -- Bathroom
  v_room_id := gen_random_uuid();
  v_room_ids := array_append(v_room_ids, v_room_id);
  INSERT INTO rooms (id, project_id, name, description, status, ceiling_height_mm, color)
  VALUES (v_room_id, v_project_id,
    CASE WHEN v_is_en THEN 'Bathroom' ELSE 'Badrum' END,
    CASE WHEN v_is_en THEN 'Bathroom retiled with new waterproofing' ELSE 'Badrum med nytt kakel och tätskikt' END,
    'to_be_renovated', 2600, '#38BDF8');

  INSERT INTO floor_map_shapes (id, project_id, room_id, shape_type, shape_data)
  VALUES (gen_random_uuid(), v_project_id, v_room_id, 'room',
    jsonb_build_object(
      'points', '[{"x":4200,"y":0},{"x":6200,"y":0},{"x":6200,"y":2000},{"x":4200,"y":2000}]'::jsonb,
      'coordinates', '[{"x":4200,"y":0},{"x":6200,"y":0},{"x":6200,"y":2000},{"x":4200,"y":2000}]'::jsonb,
      'fillColor', '#38BDF8', 'strokeColor', '#38BDF8',
      'name', CASE WHEN v_is_en THEN 'Bathroom' ELSE 'Badrum' END
    ));

  -- Hallway
  v_room_id := gen_random_uuid();
  v_room_ids := array_append(v_room_ids, v_room_id);
  INSERT INTO rooms (id, project_id, name, description, status, ceiling_height_mm, color)
  VALUES (v_room_id, v_project_id,
    CASE WHEN v_is_en THEN 'Hallway' ELSE 'Hall' END,
    CASE WHEN v_is_en THEN 'Entry hallway' ELSE 'Entréhall' END,
    'to_be_renovated', 2600, '#FBBF24');

  INSERT INTO floor_map_shapes (id, project_id, room_id, shape_type, shape_data)
  VALUES (gen_random_uuid(), v_project_id, v_room_id, 'room',
    jsonb_build_object(
      'points', '[{"x":0,"y":2200},{"x":5000,"y":2200},{"x":5000,"y":3300},{"x":0,"y":3300}]'::jsonb,
      'coordinates', '[{"x":0,"y":2200},{"x":5000,"y":2200},{"x":5000,"y":3300},{"x":0,"y":3300}]'::jsonb,
      'fillColor', '#FBBF24', 'strokeColor', '#FBBF24',
      'name', CASE WHEN v_is_en THEN 'Hallway' ELSE 'Hall' END
    ));

  -- ─── Tasks (12, budgets sum to 134 000) ───────────────────────────────────
  -- 1. Preparation (whole apartment, completed)
  v_task_id := gen_random_uuid();
  v_task_ids := array_append(v_task_ids, v_task_id);
  INSERT INTO tasks (id, project_id, room_id, title, description, status, priority, cost_center, budget, start_date, finish_date, created_by_user_id)
  VALUES (v_task_id, v_project_id, NULL,
    CASE WHEN v_is_en THEN 'Preparation and protection' ELSE 'Förberedelse och skydd' END,
    CASE WHEN v_is_en THEN 'Cover floors, move furniture, tape windows and trim.' ELSE 'Täck golv, flytta möbler, tejpa fönster och lister.' END,
    'completed', 'high', 'preparation', 3000, v_today - 21, v_today - 20, p_owner_id);

  -- 2. Demolition (bathroom + kitchen, completed)
  v_task_id := gen_random_uuid();
  v_task_ids := array_append(v_task_ids, v_task_id);
  INSERT INTO tasks (id, project_id, room_id, title, description, status, priority, cost_center, budget, start_date, finish_date, created_by_user_id)
  VALUES (v_task_id, v_project_id, NULL,
    CASE WHEN v_is_en THEN 'Demolition and strip-out' ELSE 'Rivning och demontering' END,
    CASE WHEN v_is_en THEN 'Remove old tiles in the bathroom and the old kitchen countertop.' ELSE 'Bila bort gammalt kakel i badrummet och riv ut gammal köksbänk.' END,
    'completed', 'high', 'preparation', 6000, v_today - 20, v_today - 18, p_owner_id);

  -- 3. Wall spackling (living room, completed)
  v_task_id := gen_random_uuid();
  v_task_ids := array_append(v_task_ids, v_task_id);
  INSERT INTO tasks (id, project_id, room_id, title, description, status, priority, cost_center, budget, start_date, finish_date, created_by_user_id)
  VALUES (v_task_id, v_project_id, v_room_ids[1],
    CASE WHEN v_is_en THEN 'Wall spackling' ELSE 'Spackling av väggar' END,
    CASE WHEN v_is_en THEN 'Fill cracks and imperfections in the living room.' ELSE 'Spackla sprickor och ojämnheter i vardagsrummet.' END,
    'completed', 'high', 'walls', 7000, v_today - 18, v_today - 15, p_owner_id);

  -- 4. Painting (living room, completed)
  v_task_id := gen_random_uuid();
  v_task_ids := array_append(v_task_ids, v_task_id);
  INSERT INTO tasks (id, project_id, room_id, title, description, status, priority, cost_center, budget, start_date, finish_date, created_by_user_id)
  VALUES (v_task_id, v_project_id, v_room_ids[1],
    CASE WHEN v_is_en THEN 'Wall & ceiling painting' ELSE 'Målning väggar & tak' END,
    CASE WHEN v_is_en THEN 'Paint walls and ceiling in the living room. Colour: NCS S 0502-Y.' ELSE 'Måla väggar och tak i vardagsrummet. Kulör: NCS S 0502-Y.' END,
    'completed', 'medium', 'painting', 12000, v_today - 15, v_today - 12, p_owner_id);

  -- 5. Feature wall wallpapering (bedroom, in progress)
  v_task_id := gen_random_uuid();
  v_task_ids := array_append(v_task_ids, v_task_id);
  INSERT INTO tasks (id, project_id, room_id, title, description, status, priority, cost_center, budget, start_date, finish_date, created_by_user_id)
  VALUES (v_task_id, v_project_id, v_room_ids[2],
    CASE WHEN v_is_en THEN 'Feature wall wallpapering' ELSE 'Tapetsering fondvägg' END,
    CASE WHEN v_is_en THEN 'Wallpaper the feature wall in the bedroom with patterned wallpaper.' ELSE 'Tapetsera fondvägg i sovrummet med mönstrad tapet.' END,
    'in_progress', 'medium', 'walls', 6000, v_today - 4, v_today + 1, p_owner_id);

  -- 6. Bathroom waterproofing (to do)
  v_task_id := gen_random_uuid();
  v_task_ids := array_append(v_task_ids, v_task_id);
  INSERT INTO tasks (id, project_id, room_id, title, description, status, priority, cost_center, budget, start_date, finish_date, created_by_user_id)
  VALUES (v_task_id, v_project_id, v_room_ids[4],
    CASE WHEN v_is_en THEN 'Bathroom waterproofing' ELSE 'Tätskikt badrum' END,
    CASE WHEN v_is_en THEN 'Apply approved waterproofing system before tiling (GVK).' ELSE 'Applicera godkänt tätskiktssystem före kakelsättning (GVK).' END,
    'to_do', 'high', 'bathroom', 9000, v_today + 2, v_today + 4, p_owner_id);

  -- 7. Bathroom tiling (to do)
  v_task_id := gen_random_uuid();
  v_task_ids := array_append(v_task_ids, v_task_id);
  INSERT INTO tasks (id, project_id, room_id, title, description, status, priority, cost_center, budget, start_date, finish_date, created_by_user_id)
  VALUES (v_task_id, v_project_id, v_room_ids[4],
    CASE WHEN v_is_en THEN 'Bathroom tiling' ELSE 'Kakelsättning badrum' END,
    CASE WHEN v_is_en THEN 'Set wall tiles and floor tiles in the bathroom.' ELSE 'Sätt kakel på väggar och klinker på golv i badrummet.' END,
    'to_do', 'high', 'bathroom', 28000, v_today + 4, v_today + 9, p_owner_id);

  -- 8. Kitchen countertop & backsplash (to do)
  v_task_id := gen_random_uuid();
  v_task_ids := array_append(v_task_ids, v_task_id);
  INSERT INTO tasks (id, project_id, room_id, title, description, status, priority, cost_center, budget, start_date, finish_date, created_by_user_id)
  VALUES (v_task_id, v_project_id, v_room_ids[3],
    CASE WHEN v_is_en THEN 'Countertop and backsplash' ELSE 'Bänkskiva och stänkskydd' END,
    CASE WHEN v_is_en THEN 'Install new countertop and tile backsplash in the kitchen.' ELSE 'Montera ny bänkskiva och kakel som stänkskydd i köket.' END,
    'to_do', 'medium', 'kitchen', 22000, v_today + 7, v_today + 10, p_owner_id);

  -- 9. Floor sanding & lacquering (living room + hall, to do)
  v_task_id := gen_random_uuid();
  v_task_ids := array_append(v_task_ids, v_task_id);
  INSERT INTO tasks (id, project_id, room_id, title, description, status, priority, cost_center, budget, start_date, finish_date, created_by_user_id)
  VALUES (v_task_id, v_project_id, v_room_ids[1],
    CASE WHEN v_is_en THEN 'Floor sanding and lacquering' ELSE 'Slipning och lackning av golv' END,
    CASE WHEN v_is_en THEN 'Sand and lacquer the parquet floor in the living room and hallway.' ELSE 'Slipa och lacka parkettgolvet i vardagsrum och hall.' END,
    'to_do', 'high', 'flooring', 18000, v_today + 10, v_today + 14, p_owner_id);

  -- 10. Outlets and lighting (kitchen, to do)
  v_task_id := gen_random_uuid();
  v_task_ids := array_append(v_task_ids, v_task_id);
  INSERT INTO tasks (id, project_id, room_id, title, description, status, priority, cost_center, budget, start_date, finish_date, created_by_user_id)
  VALUES (v_task_id, v_project_id, v_room_ids[3],
    CASE WHEN v_is_en THEN 'Outlets and lighting' ELSE 'Eluttag och belysning' END,
    CASE WHEN v_is_en THEN 'Install new outlets and recessed LED spotlights in the kitchen.' ELSE 'Installera nya eluttag och infällda LED-spots i köket.' END,
    'to_do', 'medium', 'electrical', 12000, v_today + 5, v_today + 7, p_owner_id);

  -- 11. Trim and moldings (whole apartment, to do)
  v_task_id := gen_random_uuid();
  v_task_ids := array_append(v_task_ids, v_task_id);
  INSERT INTO tasks (id, project_id, room_id, title, description, status, priority, cost_center, budget, start_date, finish_date, created_by_user_id)
  VALUES (v_task_id, v_project_id, NULL,
    CASE WHEN v_is_en THEN 'Install trim and moldings' ELSE 'Montering av lister' END,
    CASE WHEN v_is_en THEN 'Install floor and ceiling trim throughout the apartment.' ELSE 'Montera golv- och taklister i hela lägenheten.' END,
    'to_do', 'low', 'finishing', 7000, v_today + 15, v_today + 17, p_owner_id);

  -- 12. Final cleaning (whole apartment, to do)
  v_task_id := gen_random_uuid();
  v_task_ids := array_append(v_task_ids, v_task_id);
  INSERT INTO tasks (id, project_id, room_id, title, description, status, priority, cost_center, budget, start_date, finish_date, created_by_user_id)
  VALUES (v_task_id, v_project_id, NULL,
    CASE WHEN v_is_en THEN 'Final cleaning' ELSE 'Slutstädning' END,
    CASE WHEN v_is_en THEN 'Professional cleaning after the renovation.' ELSE 'Professionell flyttstädning efter renoveringen.' END,
    'to_do', 'low', 'other', 4000, v_today + 18, v_today + 19, p_owner_id);

  -- ─── Purchase orders (3) — PO-invariant: non-'planned' materials reference a PO
  -- PO A — Colorama: paint + prep. Delivered and paid.
  INSERT INTO purchase_orders (id, project_id, vendor_name, total, status, source, ordered_at, delivered_at, paid_at, receipt_total, notes, created_by_user_id)
  VALUES (gen_random_uuid(), v_project_id, 'Colorama Odenplan', 4403, 'delivered', 'manual',
    v_today - 22, v_today - 18, v_today - 17, 4403,
    CASE WHEN v_is_en THEN 'Paint, filler and prep materials.' ELSE 'Färg, spackel och förberedelsematerial.' END,
    p_owner_id)
  RETURNING id INTO v_po_paint;

  -- PO B — Boråstapeter: wallpaper. Ordered, not yet delivered.
  INSERT INTO purchase_orders (id, project_id, vendor_name, total, status, source, ordered_at, notes, created_by_user_id)
  VALUES (gen_random_uuid(), v_project_id, 'Boråstapeter', 3934, 'ordered', 'manual',
    v_today - 3,
    CASE WHEN v_is_en THEN 'Feature wall wallpaper + paste.' ELSE 'Tapet till fondvägg + lim.' END,
    p_owner_id)
  RETURNING id INTO v_po_wallpaper;

  -- PO C — Kakelspecialisten: bathroom tiles + waterproofing. Ordered.
  INSERT INTO purchase_orders (id, project_id, vendor_name, total, status, source, ordered_at, notes, created_by_user_id)
  VALUES (gen_random_uuid(), v_project_id, 'Kakelspecialisten Stockholm', 8415, 'ordered', 'manual',
    v_today - 1,
    CASE WHEN v_is_en THEN 'Bathroom tiles, waterproofing, adhesive and grout.' ELSE 'Badrumskakel, tätskikt, fix och fog.' END,
    p_owner_id)
  RETURNING id INTO v_po_tiles;

  -- ─── Materials (21) ───────────────────────────────────────────────────────
  -- PO A items (paid)
  INSERT INTO materials (id, project_id, room_id, task_id, name, quantity, unit, price_per_unit, vendor_name, vendor_link, status, purchase_order_id, created_by_user_id)
  VALUES
    (gen_random_uuid(), v_project_id, v_room_ids[1], v_task_ids[3],
      CASE WHEN v_is_en THEN 'Lightweight filler Gyproc ProMix 3.5L' ELSE 'Lättviktsspackel Gyproc ProMix 3,5L' END,
      3, CASE WHEN v_is_en THEN 'pcs' ELSE 'st' END, 189, 'Colorama', 'https://www.gyproc.se', 'paid', v_po_paint, p_owner_id),
    (gen_random_uuid(), v_project_id, v_room_ids[1], v_task_ids[4],
      CASE WHEN v_is_en THEN 'Wall paint Beckers Scotte 7 (10L)' ELSE 'Väggfärg Beckers Scotte 7 (10L)' END,
      2, CASE WHEN v_is_en THEN 'cans' ELSE 'hink' END, 1095, 'Colorama', 'https://www.beckers.se/produkter/scotte', 'paid', v_po_paint, p_owner_id),
    (gen_random_uuid(), v_project_id, v_room_ids[1], v_task_ids[4],
      CASE WHEN v_is_en THEN 'Ceiling paint Beckers Allround (10L)' ELSE 'Takfärg Beckers Allround Tak (10L)' END,
      1, CASE WHEN v_is_en THEN 'can' ELSE 'hink' END, 749, 'Colorama', NULL, 'paid', v_po_paint, p_owner_id),
    (gen_random_uuid(), v_project_id, v_room_ids[1], v_task_ids[4],
      CASE WHEN v_is_en THEN 'Primer Beckers Grund (3L)' ELSE 'Grundfärg Beckers Grund (3L)' END,
      1, CASE WHEN v_is_en THEN 'can' ELSE 'burk' END, 349, 'Colorama', NULL, 'paid', v_po_paint, p_owner_id),
    (gen_random_uuid(), v_project_id, NULL, v_task_ids[1],
      CASE WHEN v_is_en THEN 'Masking tape + cover plastic (set)' ELSE 'Maskeringstejp + täckplast (sats)' END,
      1, CASE WHEN v_is_en THEN 'set' ELSE 'sats' END, 249, 'Colorama', NULL, 'paid', v_po_paint, p_owner_id),
    (gen_random_uuid(), v_project_id, v_room_ids[1], v_task_ids[4],
      CASE WHEN v_is_en THEN 'Roller + brush kit' ELSE 'Roller- och penselsats' END,
      1, CASE WHEN v_is_en THEN 'set' ELSE 'sats' END, 299, 'Colorama', NULL, 'paid', v_po_paint, p_owner_id),

  -- PO B items (wallpaper, ordered → status 'approved')
    (gen_random_uuid(), v_project_id, v_room_ids[2], v_task_ids[5],
      CASE WHEN v_is_en THEN 'Wallpaper Boråstapeter Pure Linen' ELSE 'Tapet Boråstapeter Pure Linen' END,
      5, CASE WHEN v_is_en THEN 'rolls' ELSE 'rullar' END, 749, 'Boråstapeter', 'https://www.borastapeter.se', 'approved', v_po_wallpaper, p_owner_id),
    (gen_random_uuid(), v_project_id, v_room_ids[2], v_task_ids[5],
      CASE WHEN v_is_en THEN 'Wallpaper paste Mataki (5kg)' ELSE 'Tapetlim Mataki (5kg)' END,
      1, CASE WHEN v_is_en THEN 'pcs' ELSE 'st' END, 189, 'Boråstapeter', NULL, 'approved', v_po_wallpaper, p_owner_id),

  -- PO C items (bathroom, ordered → status 'approved')
    (gen_random_uuid(), v_project_id, v_room_ids[4], v_task_ids[7],
      CASE WHEN v_is_en THEN 'Wall tile white gloss 20x40' ELSE 'Kakel vägg vit blank 20x40' END,
      14, CASE WHEN v_is_en THEN 'sqm' ELSE 'kvm' END, 299, 'Kakelspecialisten', 'https://www.kakelspecialisten.se', 'approved', v_po_tiles, p_owner_id),
    (gen_random_uuid(), v_project_id, v_room_ids[4], v_task_ids[7],
      CASE WHEN v_is_en THEN 'Floor tile grey 30x30' ELSE 'Klinker golv grå 30x30' END,
      5, CASE WHEN v_is_en THEN 'sqm' ELSE 'kvm' END, 349, 'Kakelspecialisten', NULL, 'approved', v_po_tiles, p_owner_id),
    (gen_random_uuid(), v_project_id, v_room_ids[4], v_task_ids[6],
      CASE WHEN v_is_en THEN 'Waterproofing kit Weber Tec' ELSE 'Tätskiktssystem Weber Tec (sats)' END,
      1, CASE WHEN v_is_en THEN 'kit' ELSE 'sats' END, 1290, 'Kakelspecialisten', 'https://www.se.weber', 'approved', v_po_tiles, p_owner_id),
    (gen_random_uuid(), v_project_id, v_room_ids[4], v_task_ids[7],
      CASE WHEN v_is_en THEN 'Tile adhesive Weber Fix' ELSE 'Fästmassa Weber Fix' END,
      4, CASE WHEN v_is_en THEN 'bags' ELSE 'säck' END, 219, 'Kakelspecialisten', NULL, 'approved', v_po_tiles, p_owner_id),
    (gen_random_uuid(), v_project_id, v_room_ids[4], v_task_ids[7],
      CASE WHEN v_is_en THEN 'Grout grey Weber' ELSE 'Fogmassa grå Weber' END,
      2, CASE WHEN v_is_en THEN 'pcs' ELSE 'st' END, 159, 'Kakelspecialisten', NULL, 'approved', v_po_tiles, p_owner_id),

  -- Planned items (no PO yet → status 'planned')
    (gen_random_uuid(), v_project_id, v_room_ids[3], v_task_ids[8],
      CASE WHEN v_is_en THEN 'Countertop laminate oak IKEA Ekbacken' ELSE 'Bänkskiva laminat ek IKEA Ekbacken' END,
      1, CASE WHEN v_is_en THEN 'pcs' ELSE 'st' END, 1795, 'IKEA', 'https://www.ikea.com/se/sv/', 'planned', NULL, p_owner_id),
    (gen_random_uuid(), v_project_id, v_room_ids[3], v_task_ids[8],
      CASE WHEN v_is_en THEN 'Backsplash tile white 7.5x30' ELSE 'Stänkskydd kakel vit 7,5x30' END,
      3, CASE WHEN v_is_en THEN 'sqm' ELSE 'kvm' END, 399, 'Bauhaus', 'https://www.bauhaus.se', 'planned', NULL, p_owner_id),
    (gen_random_uuid(), v_project_id, v_room_ids[1], v_task_ids[9],
      CASE WHEN v_is_en THEN 'Floor lacquer Bona Mega ONE (5L)' ELSE 'Golvlack Bona Mega ONE (5L)' END,
      2, CASE WHEN v_is_en THEN 'cans' ELSE 'burk' END, 949, 'Golvpoolen', 'https://www.bona.com', 'planned', NULL, p_owner_id),
    (gen_random_uuid(), v_project_id, v_room_ids[1], v_task_ids[9],
      CASE WHEN v_is_en THEN 'Sanding discs (set)' ELSE 'Sliprondeller (sats)' END,
      1, CASE WHEN v_is_en THEN 'set' ELSE 'sats' END, 449, 'Golvpoolen', NULL, 'planned', NULL, p_owner_id),
    (gen_random_uuid(), v_project_id, v_room_ids[3], v_task_ids[10],
      CASE WHEN v_is_en THEN 'Recessed LED spots Hide-a-lite 6W' ELSE 'LED-spots infällda Hide-a-lite 6W' END,
      6, CASE WHEN v_is_en THEN 'pcs' ELSE 'st' END, 249, 'Elgiganten', 'https://www.elgiganten.se', 'planned', NULL, p_owner_id),
    (gen_random_uuid(), v_project_id, v_room_ids[3], v_task_ids[10],
      CASE WHEN v_is_en THEN 'Outlets & switches Schneider Exxact (set)' ELSE 'Eluttag & strömbrytare Schneider Exxact (sats)' END,
      1, CASE WHEN v_is_en THEN 'set' ELSE 'sats' END, 690, 'Elgiganten', NULL, 'planned', NULL, p_owner_id),
    (gen_random_uuid(), v_project_id, NULL, v_task_ids[11],
      CASE WHEN v_is_en THEN 'Floor trim white-painted 12x56mm' ELSE 'Golvlist vitmålad 12x56mm' END,
      45, CASE WHEN v_is_en THEN 'meters' ELSE 'meter' END, 39, 'Byggmax', 'https://www.byggmax.se', 'planned', NULL, p_owner_id),
    (gen_random_uuid(), v_project_id, NULL, v_task_ids[11],
      CASE WHEN v_is_en THEN 'Ceiling trim classic 45mm' ELSE 'Taklist klassisk 45mm' END,
      25, CASE WHEN v_is_en THEN 'meters' ELSE 'meter' END, 59, 'Byggmax', NULL, 'planned', NULL, p_owner_id);

  -- Line total so budget/purchase summaries display amounts (not 0 kr).
  UPDATE materials SET price_total = quantity * price_per_unit
  WHERE project_id = v_project_id;

  RETURN v_project_id;
END;
$$;

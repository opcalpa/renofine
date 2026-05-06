-- Fix public demo project dates to match current task date range.
-- Also update task dates to be relative to today, like personal demos do.

DO $$
DECLARE
  v_demo_id UUID := '00000000-0000-0000-0000-000000000001';
  v_today DATE := CURRENT_DATE;
  v_min_start DATE;
  v_offset INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM projects WHERE id = v_demo_id) THEN
    RETURN;
  END IF;

  -- Find earliest task start date
  SELECT MIN(start_date) INTO v_min_start
  FROM tasks WHERE project_id = v_demo_id AND start_date IS NOT NULL;

  IF v_min_start IS NULL THEN
    RETURN;
  END IF;

  -- Calculate offset to shift tasks so earliest starts 21 days before today
  v_offset := (v_today - 21) - v_min_start;

  -- Shift all task dates
  UPDATE tasks SET
    start_date = start_date + v_offset,
    finish_date = finish_date + v_offset
  WHERE project_id = v_demo_id AND start_date IS NOT NULL;

  -- Update project dates to match task span
  UPDATE projects SET
    start_date = v_today - 21,
    finish_goal_date = v_today + 20
  WHERE id = v_demo_id;
END;
$$;

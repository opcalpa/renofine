-- Fas 0 / Migration B — link floor_map_shapes to a task.
-- An electrical fixture (or any placed shape) can be the single source for a task's
-- install/control status. Additive and safe.
--
-- REVERT:
--   DROP INDEX IF EXISTS idx_floor_map_shapes_task_id;
--   ALTER TABLE floor_map_shapes DROP COLUMN IF EXISTS task_id;

ALTER TABLE floor_map_shapes
  ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_floor_map_shapes_task_id
  ON floor_map_shapes(task_id);

COMMENT ON COLUMN floor_map_shapes.task_id IS
  'Optional task this placed shape drives (e.g. an electrical fixture used as a control checklist). ON DELETE SET NULL.';

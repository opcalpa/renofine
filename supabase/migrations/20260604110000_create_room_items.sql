-- E1 — Generic room_items table.
-- A room's list of things to acquire/install. One record per item, category-driven,
-- with an OPTIONAL visual representation on the drawing (point or surface). The list and
-- the canvas are two views of the SAME record (like rooms <-> floor_map_shapes), so an item
-- can be logged without drawing and later "mapped" onto the plan/elevation, or vice versa.
-- Electrical is the first category; paint/flooring/plumbing/ventilation/appliance follow.
-- See memory: project_room_item_model.
--
-- Additive only (no existing data touched). Backfill of placed electrical shapes +
-- electrical_spec lists comes with E2/E3 when there is a consuming UI to verify against.
--
-- REVERT:
--   DROP TABLE IF EXISTS public.room_items CASCADE;

CREATE TABLE IF NOT EXISTS public.room_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
  -- Category drives behaviour, default symbol and which detail fields apply.
  category TEXT NOT NULL,            -- 'electrical' | 'paint' | 'flooring' | 'plumbing' | 'ventilation' | 'appliance' | ...
  subtype TEXT,                      -- e.g. 'double_outlet', 'ceiling_lamp', a color code, 'herringbone_parquet'
  title TEXT NOT NULL,               -- display title, e.g. "Dubbeluttag"
  detail JSONB NOT NULL DEFAULT '{}',-- category-specific: product_link, color_code, treatment, model, notes, quantity, ...
  install_status TEXT NOT NULL DEFAULT 'planned',  -- 'planned' | 'installed' (control checklist)
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  purchase_order_item_id UUID,       -- linked in E6 (purchase-order model); no FK yet to avoid coupling
  -- Visual representation linkage. 'none' = list-only (not drawn yet).
  representation_kind TEXT NOT NULL DEFAULT 'none',  -- 'none' | 'point' | 'surface'
  floor_map_shape_id UUID REFERENCES public.floor_map_shapes(id) ON DELETE SET NULL,
  series TEXT,                       -- optional category default (e.g. electrical series)
  sort_order INTEGER,                -- optional ordering within a room's list
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.room_items ENABLE ROW LEVEL SECURITY;

-- RLS mirrors floor_map_shapes: project owner or project access can read; owner or manager can write.
DROP POLICY IF EXISTS "Users can view room items in accessible projects" ON public.room_items;
CREATE POLICY "Users can view room items in accessible projects"
ON public.room_items
FOR SELECT
USING (
  project_id IN (
    SELECT id FROM projects
    WHERE owner_id = get_user_profile_id()
    OR user_has_project_access(id)
  )
);

DROP POLICY IF EXISTS "Users can manage room items in accessible projects" ON public.room_items;
CREATE POLICY "Users can manage room items in accessible projects"
ON public.room_items
FOR ALL
USING (
  project_id IN (
    SELECT id FROM projects
    WHERE owner_id = get_user_profile_id()
    OR user_can_manage_project(id)
  )
);

CREATE INDEX IF NOT EXISTS idx_room_items_project_id ON public.room_items(project_id);
CREATE INDEX IF NOT EXISTS idx_room_items_room_id ON public.room_items(room_id);
CREATE INDEX IF NOT EXISTS idx_room_items_category ON public.room_items(category);
CREATE INDEX IF NOT EXISTS idx_room_items_shape ON public.room_items(floor_map_shape_id);
CREATE INDEX IF NOT EXISTS idx_room_items_task ON public.room_items(task_id);

DROP TRIGGER IF EXISTS update_room_items_updated_at ON public.room_items;
CREATE TRIGGER update_room_items_updated_at
BEFORE UPDATE ON public.room_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.room_items IS
  'Generic per-room list of items to acquire/install (electrical, paint, flooring, ...). Optional visual representation via floor_map_shape_id (point) or surface. See memory project_room_item_model.';

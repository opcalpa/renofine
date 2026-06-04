-- Cache translated room-item free-text (custom title + notes) for worker views.
-- Mirrors task_translations / room_translations: pre-translated at invite time so
-- the worker instruction view can read in O(1) without an AI call per load.
-- Only free-text needs this — electrical titles resolve via objects.electrical.* i18n
-- on the client, and product names/codes are never translated.
--
-- Revert:
--   DROP TABLE IF EXISTS public.room_item_translations;

CREATE TABLE IF NOT EXISTS public.room_item_translations (
  room_item_id UUID NOT NULL REFERENCES public.room_items(id) ON DELETE CASCADE,
  language TEXT NOT NULL,
  title TEXT,
  notes TEXT,
  translated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (room_item_id, language)
);

CREATE INDEX IF NOT EXISTS idx_room_item_translations_item ON public.room_item_translations(room_item_id);

ALTER TABLE public.room_item_translations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_can_read_room_item_translations" ON public.room_item_translations;
CREATE POLICY "users_can_read_room_item_translations"
  ON public.room_item_translations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.room_items ri
      WHERE ri.id = room_item_translations.room_item_id
      AND (
        user_owns_project(ri.project_id)
        OR user_has_project_access(ri.project_id)
      )
    )
  );
-- Service role handles inserts/updates via edge functions.

-- Cache translated room content for worker views.
-- Mirrors task_translations: pre-translated at invite time so the worker
-- view can read in O(1) without hitting an AI API on each load.
--
-- Revert:
--   DROP TABLE IF EXISTS public.room_translations;

CREATE TABLE IF NOT EXISTS public.room_translations (
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  language TEXT NOT NULL,
  name TEXT,
  description TEXT,
  translated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (room_id, language)
);

CREATE INDEX IF NOT EXISTS idx_room_translations_room ON public.room_translations(room_id);

ALTER TABLE public.room_translations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_can_read_room_translations"
  ON public.room_translations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rooms r
      WHERE r.id = room_translations.room_id
      AND (
        user_owns_project(r.project_id)
        OR user_has_project_access(r.project_id)
      )
    )
  );
-- Service role handles inserts/updates via edge functions.

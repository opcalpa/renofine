-- "Rapporten från dagen" — one message from site, several parts.
--
-- A tradesperson says everything in one breath ("8 timmar, kaklet 70 %,
-- behöver mer fog, kommer sent imorgon"). Forcing that into one intent per
-- message made them sort before speaking. This table holds the report as it
-- arrived; the rows it produced (comment, material, time entry) point back at
-- it so the builder sees ONE card with one action per part.
--
-- Revert:
--   ALTER TABLE public.time_entries DROP COLUMN IF EXISTS report_id;
--   ALTER TABLE public.materials    DROP COLUMN IF EXISTS report_id;
--   ALTER TABLE public.comments     DROP COLUMN IF EXISTS report_id;
--   DROP TABLE IF EXISTS public.field_reports;

CREATE TABLE IF NOT EXISTS public.field_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  worker_token_id uuid REFERENCES public.worker_access_tokens(id) ON DELETE SET NULL,
  task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  -- Exactly what was said, before anything was read into it. Kept so a
  -- misreading can always be traced back to the words.
  raw_text text,
  voice_url text,
  -- What the parser made of it: {parts:[…], source:'regex'|'model'}. Readable
  -- on purpose — an agent must be able to explain its own decision.
  parsed jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS field_reports_project_idx
  ON public.field_reports (project_id, created_at DESC);

ALTER TABLE public.field_reports ENABLE ROW LEVEL SECURITY;

-- Same shape as every other project-scoped table: the check is inlined rather
-- than inherited, because an inlined policy inherits nothing.
DROP POLICY IF EXISTS "field_reports_select" ON public.field_reports;
CREATE POLICY "field_reports_select" ON public.field_reports
  FOR SELECT USING (
    is_system_admin()
    OR user_owns_project(project_id)
    OR user_has_project_access(project_id)
  );

DROP POLICY IF EXISTS "field_reports_delete" ON public.field_reports;
CREATE POLICY "field_reports_delete" ON public.field_reports
  FOR DELETE USING (user_owns_project(project_id));

-- The rows a report produced. Nullable everywhere: everything that exists
-- today was created without a report and must stay valid.
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS report_id uuid REFERENCES public.field_reports(id) ON DELETE SET NULL;
ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS report_id uuid REFERENCES public.field_reports(id) ON DELETE SET NULL;
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS report_id uuid REFERENCES public.field_reports(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS comments_report_idx ON public.comments (report_id) WHERE report_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS materials_report_idx ON public.materials (report_id) WHERE report_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS time_entries_report_idx ON public.time_entries (report_id) WHERE report_id IS NOT NULL;

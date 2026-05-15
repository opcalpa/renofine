-- Worker invite instruction images: per-task images with descriptions
-- attached to a worker_access_token. Each image is either a reference
-- to an existing photo (photo_id) or an uploaded URL (uploaded_url).
--
-- Used by the InviteWizard worker-flow to send richer instructions
-- to the worker than just task descriptions/checklists.

CREATE TABLE IF NOT EXISTS public.worker_invite_instruction_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_token_id uuid NOT NULL REFERENCES public.worker_access_tokens(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  photo_id uuid REFERENCES public.photos(id) ON DELETE SET NULL,
  uploaded_url text,
  description text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT instruction_image_has_source CHECK (
    photo_id IS NOT NULL OR uploaded_url IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_worker_invite_instr_images_token
  ON public.worker_invite_instruction_images(worker_token_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_worker_invite_instr_images_task
  ON public.worker_invite_instruction_images(task_id);

ALTER TABLE public.worker_invite_instruction_images ENABLE ROW LEVEL SECURITY;

-- SELECT: anyone with project access can see the instruction images.
-- Worker-vyn använder edge function med service role och bypassar RLS.
DROP POLICY IF EXISTS "Project members read instruction images"
  ON public.worker_invite_instruction_images;
CREATE POLICY "Project members read instruction images"
  ON public.worker_invite_instruction_images
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.worker_access_tokens wat
      WHERE wat.id = worker_invite_instruction_images.worker_token_id
        AND public.user_has_project_access(wat.project_id)
    )
  );

-- INSERT/UPDATE/DELETE: project owner only.
DROP POLICY IF EXISTS "Project owners manage instruction images"
  ON public.worker_invite_instruction_images;
CREATE POLICY "Project owners manage instruction images"
  ON public.worker_invite_instruction_images
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.worker_access_tokens wat
      WHERE wat.id = worker_invite_instruction_images.worker_token_id
        AND public.user_owns_project(wat.project_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.worker_access_tokens wat
      WHERE wat.id = worker_invite_instruction_images.worker_token_id
        AND public.user_owns_project(wat.project_id)
    )
  );

-- Worker "Фото завершення" upload now signals a review handoff.
-- 1. Extend tasks_status_check to allow the new 'awaiting_review' state.
-- 2. Add tasks.requires_completion_photo so the inviter can mark which
--    tasks must carry photo evidence before they may transition past
--    in_progress.

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_status_check;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_status_check
  CHECK (
    status = ANY (
      ARRAY[
        'planned'::text,
        'to_do'::text,
        'waiting'::text,
        'in_progress'::text,
        'awaiting_review'::text,
        'completed'::text,
        'cancelled'::text
      ]
    )
  );

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS requires_completion_photo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tasks.requires_completion_photo IS
  'When true, the assigned worker must upload at least one "Фото завершення" (worker_completed) photo before the PM accepts the task as completed. Set per-task by the inviter in the Worker invite wizard.';

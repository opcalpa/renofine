-- A report must be retractable for ten seconds.
--
-- Sending should feel like a text message: thoughtless to send, cheap to undo.
-- Undoing means putting the work back exactly where it stood, so the report
-- has to remember what it changed. Without this the status is a guess.

alter table public.field_reports
  add column if not exists task_prev_status text,
  add column if not exists task_prev_progress numeric,
  add column if not exists retracted_at timestamptz;

comment on column public.field_reports.task_prev_status is
  'Task status before this report moved it. Null when the report moved nothing.';
comment on column public.field_reports.task_prev_progress is
  'Task progress before this report changed it. Null when unchanged.';
comment on column public.field_reports.retracted_at is
  'Set when the worker took the report back. The row stays: what was said and
   then withdrawn is worth keeping, and it keeps the id from being reused.';

-- The inbox must never show a withdrawn report.
create index if not exists field_reports_live_idx
  on public.field_reports (project_id, created_at desc)
  where retracted_at is null;

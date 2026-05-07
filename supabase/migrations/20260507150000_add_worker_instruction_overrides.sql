-- Worker instruction overrides: per-task description and checklist customization
CREATE TABLE IF NOT EXISTS worker_instruction_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_token_id UUID NOT NULL REFERENCES worker_access_tokens(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  description_override TEXT,
  checklist_override JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (worker_token_id, task_id)
);

-- Welcome message for workers
ALTER TABLE worker_access_tokens
  ADD COLUMN IF NOT EXISTS welcome_message TEXT;

-- RLS
ALTER TABLE worker_instruction_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can manage overrides"
  ON worker_instruction_overrides
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM worker_access_tokens wat
      WHERE wat.id = worker_instruction_overrides.worker_token_id
      AND user_owns_project(wat.project_id)
    )
  );

CREATE POLICY "Shared users can read overrides"
  ON worker_instruction_overrides
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM worker_access_tokens wat
      WHERE wat.id = worker_instruction_overrides.worker_token_id
      AND user_has_project_access(wat.project_id)
    )
  );

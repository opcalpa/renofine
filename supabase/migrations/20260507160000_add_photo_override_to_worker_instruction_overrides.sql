-- Add photo_override column to worker_instruction_overrides
-- Stores array of photo IDs to include in worker instructions (null = all photos)
-- Same pattern as checklist_override

ALTER TABLE worker_instruction_overrides
ADD COLUMN IF NOT EXISTS photo_override JSONB;

COMMENT ON COLUMN worker_instruction_overrides.photo_override IS
  'Array of photo IDs to include for this worker+task. NULL means include all resolved before-photos.';

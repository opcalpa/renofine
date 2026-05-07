-- Add worker_email column to worker_access_tokens
ALTER TABLE worker_access_tokens
  ADD COLUMN IF NOT EXISTS worker_email text;

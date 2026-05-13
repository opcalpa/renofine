-- Prevent duplicate pending invitations to the same email per project.
-- Belt-and-suspenders: frontend already checks before insert, but this DB
-- constraint guarantees the invariant even if a future code path bypasses
-- the check or two requests race.
--
-- Cleanup existing duplicates first: keep the newest pending row per
-- (project_id, lower(invited_email)) and mark older ones as 'cancelled'
-- so the partial unique index can be created without errors.

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY project_id, lower(invited_email)
      ORDER BY created_at DESC
    ) AS rn
  FROM project_invitations
  WHERE status = 'pending'
)
UPDATE project_invitations
SET status = 'cancelled'
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS project_invitations_unique_pending_email
  ON project_invitations (project_id, lower(invited_email))
  WHERE status = 'pending';

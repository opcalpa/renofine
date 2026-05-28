-- Fixes a race condition in seed_demo_project_for_user where two parallel
-- calls (React 18 StrictMode dev double-mount, fast tab-switching, or
-- duplicate navigations) both passed the SELECT-existence check and both
-- INSERT:ed a demo project for the same owner.
--
-- As of 2026-05-28 two affected owners on prod, both with pristine dupes
-- (no user activity beyond seed-time inserts). Keep the oldest row per
-- owner; cascade-delete the newer via existing FK ON DELETE CASCADE.
--
-- Revert:
--   DROP INDEX IF EXISTS public.projects_demo_one_per_owner_idx;
--   (Deleted demo rows self-heal — OwnerStart re-seeds on next visit.)

-- 1. Delete duplicate demo_project rows, keeping the oldest per owner.
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY owner_id ORDER BY created_at) AS rn
  FROM projects
  WHERE project_type = 'demo_project'
    AND deleted_at IS NULL
)
DELETE FROM projects
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 2. Enforce one active demo_project per owner at the DB level.
-- Soft-deleted rows are excluded so re-seeding after deletion remains possible.
CREATE UNIQUE INDEX IF NOT EXISTS projects_demo_one_per_owner_idx
ON projects (owner_id)
WHERE project_type = 'demo_project' AND deleted_at IS NULL;

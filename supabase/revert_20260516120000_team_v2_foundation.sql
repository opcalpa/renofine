-- ===========================================================================
-- REVERT for 20260516120000_team_v2_foundation.sql
-- ===========================================================================
-- Run this to undo the Team v2 foundation migration (Spår A1).
-- Additive-only migration → revert simply drops what was added.
-- Idempotent: safe to run even if some objects are already gone.
-- WARNING: dropping the columns discards backfilled values
--          (tracks_economy / tracks_rot / owner_user_type) and the audit log.
-- ---------------------------------------------------------------------------

-- 4. access_log table (+ its policies and indexes drop with the table)
DROP POLICY IF EXISTS "Project owners can view audit log" ON public.access_log;
DROP POLICY IF EXISTS "System can insert audit log" ON public.access_log;
DROP TABLE IF EXISTS public.access_log;

-- 3. materials.paid_by
DROP INDEX IF EXISTS public.idx_materials_paid_by;
ALTER TABLE public.materials DROP COLUMN IF EXISTS paid_by;

-- 2. project_shares.expires_at
ALTER TABLE public.project_shares DROP COLUMN IF EXISTS expires_at;

-- 1. projects toggles
ALTER TABLE public.projects DROP COLUMN IF EXISTS tracks_economy;
ALTER TABLE public.projects DROP COLUMN IF EXISTS tracks_rot;
ALTER TABLE public.projects DROP COLUMN IF EXISTS owner_user_type;

DO $$ BEGIN RAISE NOTICE 'Team v2 foundation reverted.'; END $$;

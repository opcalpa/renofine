-- ===========================================================================
-- REVERT for 20260516130000_team_v2_masking_rpcs.sql
-- ===========================================================================
-- Additive functions only — revert drops them. No data loss (no tables/cols).
-- Idempotent.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_project_as_persona(uuid, text, text);
DROP FUNCTION IF EXISTS public.get_project_materials(uuid);
DROP FUNCTION IF EXISTS public.get_project_tasks(uuid);
DROP FUNCTION IF EXISTS public.get_project_overview(uuid);
DROP FUNCTION IF EXISTS public.derive_viewer_mode(uuid);
DROP FUNCTION IF EXISTS public._project_data_masked(uuid, text, uuid);

DO $$ BEGIN RAISE NOTICE 'Team v2 masking RPCs reverted.'; END $$;

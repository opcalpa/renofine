-- S1c-fix — the previous revoke did not bite.
--
-- 20260824100200 revoked EXECUTE from `anon` / `authenticated`, but Postgres
-- grants EXECUTE on new functions to PUBLIC by default. The ACL still read
-- `{=X/postgres,...}` — that leading empty grantee IS PUBLIC — so anon kept the
-- privilege by inheritance. Revoking a role-level grant never removes a
-- PUBLIC one.
--
-- Fix: revoke from PUBLIC, then grant back explicitly to exactly the roles that
-- need it.
--   * property_owner_profile_id  → `authenticated` only. RLS policy expressions
--     are evaluated as the calling role, and the property_members policies use
--     this function, so authenticated MUST keep EXECUTE.
--   * properties_guard_owner_change → nobody. Postgres does not check the
--     triggering user's EXECUTE privilege when firing a trigger, so the guard
--     keeps working while the function stops being reachable over
--     /rest/v1/rpc. Verified after apply with an UPDATE as `authenticated`.
--
-- service_role keeps EXECUTE on both (explicit grants, untouched).
--
-- REVERT:
--   GRANT EXECUTE ON FUNCTION public.property_owner_profile_id(uuid) TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.properties_guard_owner_change() TO PUBLIC;

REVOKE EXECUTE ON FUNCTION public.property_owner_profile_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.property_owner_profile_id(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.properties_guard_owner_change() FROM PUBLIC;

-- S1c — Tighten EXECUTE grants on the two property functions that have no
-- business being callable over /rest/v1/rpc.
--
-- Context: Supabase's advisor flags every SECURITY DEFINER function as
-- RPC-reachable (48 pre-existing ones in this project share the warning). Most
-- of ours are harmless — user_owns_property / user_is_property_member /
-- user_can_manage_property all resolve through get_user_profile_id(), which is
-- NULL for anon, so they return false. Those MUST keep EXECUTE for
-- `authenticated`: RLS policy expressions are evaluated as the calling role, so
-- revoking would break the policies that use them.
--
-- Two are different:
--   1. properties_guard_owner_change() is a TRIGGER function. Nothing should be
--      able to call it directly, ever.
--   2. property_owner_profile_id() returns a profile id for any property id.
--      anon has no legitimate read on properties, so it should not be able to
--      enumerate owner ids. `authenticated` keeps it — the property_members
--      policies depend on it.
--
-- REVERT:
--   GRANT EXECUTE ON FUNCTION public.properties_guard_owner_change() TO anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public.property_owner_profile_id(uuid) TO anon;

REVOKE EXECUTE ON FUNCTION public.properties_guard_owner_change() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.property_owner_profile_id(uuid) FROM anon;

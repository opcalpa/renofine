-- Third variant of the same grant trap (s79 lesson, next chapter).
--
-- 20260824100300 revoked EXECUTE from PUBLIC and grant back explicitly — which
-- is right for a function created with default privileges pointing at PUBLIC.
-- But Supabase ALSO ships `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT
-- EXECUTE ON FUNCTIONS TO anon, authenticated, service_role`, so every new
-- function is born with an EXPLICIT anon grant that no REVOKE ... FROM PUBLIC
-- touches. Verified: after 20260824110000,
-- has_function_privilege('anon', 'merge_properties(uuid,uuid)', 'EXECUTE') was
-- still true, and its ACL held a bare `anon=X/postgres`.
--
-- Neither function can do anything for an anonymous caller (both start by
-- resolving the profile and raise otherwise), so this closes reachability, not
-- an exploit. Reachable-but-always-failing RPCs are still attack surface and
-- log noise.
--
-- REVERT:
--   GRANT EXECUTE ON FUNCTION public.merge_properties(uuid, uuid) TO anon;
--   GRANT EXECUTE ON FUNCTION public.accept_property_invitation(uuid) TO anon;

REVOKE EXECUTE ON FUNCTION public.merge_properties(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.accept_property_invitation(uuid) FROM anon;

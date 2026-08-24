-- Close the `project-files` bucket.
--
-- While `public = true`, Supabase serves
-- `/storage/v1/object/public/project-files/<path>` with no authentication at
-- all — the RLS policies on storage.objects only gate the authenticated API.
-- An anonymous curl against a freshly uploaded file returned 200 and the whole
-- file: every receipt, invoice, quote, drawing and photo any user had stored.
--
-- The app no longer builds public URLs for this bucket; it mints short-lived
-- signed URLs instead (src/lib/fileUrl.ts for the client,
-- supabase/functions/_shared/fileUrl.ts for edge functions, which sign on
-- behalf of callers who have no session of their own — a worker with an invite
-- token). Signing goes through the same RLS policies, so access is unchanged
-- for everyone who is allowed in.
--
-- The demo stays reachable: `Anyone can view public demo files` grants anon
-- SELECT on the demo project's prefix, which is what createSignedUrl checks.
--
-- REVERT (re-opens the hole — only to restore service in an emergency):
--   update storage.buckets set public = true where id = 'project-files';

update storage.buckets
   set public = false
 where id = 'project-files';

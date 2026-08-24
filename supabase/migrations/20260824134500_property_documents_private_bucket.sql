-- P3 correction — the home's papers get their OWN, PRIVATE bucket.
--
-- WHY, and it is not a detail: `project-files` is a PUBLIC bucket
-- (storage.buckets.public = true). The RLS policies on storage.objects gate the
-- authenticated API and listing, but a public bucket also serves
-- /storage/v1/object/public/{bucket}/{path} with NO authentication at all.
-- Verified 2026-08-24: an anonymous curl against a file uploaded seconds
-- earlier returned 200 and the bytes.
--
-- For receipts and floor plans that is a pre-existing exposure to fix on its
-- own terms (27 call sites use getPublicUrl and would all have to move to
-- signed URLs — its own piece of work, tracked separately). For a köpekontrakt
-- it is disqualifying: the document carries the SELLER's personal number, and
-- that person never agreed to anything with this app. So the home's papers
-- never go in there.
--
-- `property-documents` is private. Nothing in the app can produce a public URL
-- for it — `propertyDocumentService` only ever mints short-lived signed URLs —
-- and no existing code touches this bucket, so the change carries no blast
-- radius beyond P3.
--
-- The four policies added to `project-files` for the `properties/` prefix in
-- 20260824130000 are dropped: leaving them would keep a second, public-backed
-- door open to the same kind of file.
--
-- REVERT:
--   DELETE FROM storage.objects WHERE bucket_id = 'property-documents';
--   DELETE FROM storage.buckets WHERE id = 'property-documents';
--   (and re-create the four project-files policies from 20260824130000)

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('property-documents', 'property-documents', false, 26214400)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 26214400;

-- ── Close the public-backed door ──────────────────────────────────────────

DROP POLICY IF EXISTS "Household can upload property files" ON storage.objects;
DROP POLICY IF EXISTS "Household can read property files" ON storage.objects;
DROP POLICY IF EXISTS "Household can update property files" ON storage.objects;
DROP POLICY IF EXISTS "Household can delete property files" ON storage.objects;

-- ── Same rules, private bucket ────────────────────────────────────────────
-- Read/update/delete resolve through the row (`property_documents`), never by
-- parsing the path — so a merge that deletes the source address cannot strand
-- the files. Upload is path-based because it is the one moment the row and the
-- file are both being created.

CREATE POLICY "Household can upload home papers"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'property-documents'
  AND public.user_can_manage_property(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Household can read home papers"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'property-documents'
  AND public.user_can_access_property_file(name)
);

CREATE POLICY "Household can update home papers"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'property-documents'
  AND public.user_can_access_property_file(name)
);

CREATE POLICY "Household can delete home papers"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'property-documents'
  AND public.user_can_access_property_file(name)
);

COMMENT ON FUNCTION public.user_can_access_property_file(text) IS
  'P3: does the caller manage the address this stored file belongs to? Resolves through property_documents.storage_path so the answer survives a merge.';

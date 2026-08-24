-- P3 — Bostadens papper: the documents that belong to the HOME, not to a job.
--
-- Köpekontrakt, besiktningsprotokoll, frågelista, energideklaration. Until now
-- a file could only live under `projects/{id}/`, so a purchase agreement had to
-- be filed under a renovation — where it is buried when the next renovation
-- comes, and deleted when that project is.
--
-- TWO DESIGN DECISIONS WORTH THE WORDS:
--
-- 1. THE ROW IS THE TRUTH, THE PATH IS OPAQUE. Read access is decided by
--    looking up `property_documents.storage_path`, never by parsing the path
--    the way `user_can_view_project_files` does. Reason: `merge_properties`
--    (S5) deletes the source address, and every file stored under
--    `properties/{source_id}/…` would become permanently unreachable if the
--    policy read the id out of the path. The merge re-points the ROWS instead
--    (see bottom of this file), and the files follow.
--
-- 2. OWNER AND HOUSEHOLD ADMINS ONLY — NEVER THE VIEWER. The insyn role (S4) is
--    the trusted builder: they see the customer's view of the PROJECTS. A
--    purchase agreement carries the seller's personal number and the price
--    paid; it is not project material, and no project-level cascade may reach
--    it. That is why access hangs off `user_can_manage_property` alone.
--
-- REVERT:
--   DROP POLICY IF EXISTS "Household can read property files" ON storage.objects;
--   DROP POLICY IF EXISTS "Household can upload property files" ON storage.objects;
--   DROP POLICY IF EXISTS "Household can update property files" ON storage.objects;
--   DROP POLICY IF EXISTS "Household can delete property files" ON storage.objects;
--   DROP FUNCTION IF EXISTS public.user_can_access_property_file(text);
--   DROP TABLE IF EXISTS public.property_documents;
--   -- and re-apply merge_properties from 20260824113000

-- ── Table ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.property_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  -- Written once at upload and never rewritten: after a merge it still names
  -- the address the file was uploaded to, which is history, not a pointer.
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text,
  file_size bigint,
  category text NOT NULL DEFAULT 'other' CHECK (category IN (
    'purchase_agreement',   -- köpekontrakt / överlåtelseavtal / upplåtelseavtal / köpebrev
    'settlement',           -- likvidavräkning
    'deposit_agreement',    -- handpenning / deposition
    'listing',              -- objektsbeskrivning
    'seller_questionnaire', -- frågelista
    'inspection',           -- besiktningsprotokoll
    'energy_declaration',
    'tax_assessment',       -- taxeringsbeslut
    'association',          -- stadgar / årsredovisning (BRF)
    'insurance',
    'title_deed',           -- lagfart / pantbrev
    'other'
  )),
  document_date date,
  -- P5 will fill this. Personal numbers are never stored here — see the plan.
  extracted jsonb,
  extraction_status text NOT NULL DEFAULT 'none'
    CHECK (extraction_status IN ('none', 'pending', 'done', 'failed')),
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_property_documents_property
  ON public.property_documents(property_id);
CREATE INDEX IF NOT EXISTS idx_property_documents_path
  ON public.property_documents(storage_path);

-- ── Table RLS ─────────────────────────────────────────────────────────────

ALTER TABLE public.property_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Household reads property documents" ON public.property_documents;
CREATE POLICY "Household reads property documents"
ON public.property_documents FOR SELECT
USING (public.user_can_manage_property(property_id));

DROP POLICY IF EXISTS "Household adds property documents" ON public.property_documents;
CREATE POLICY "Household adds property documents"
ON public.property_documents FOR INSERT
WITH CHECK (public.user_can_manage_property(property_id));

-- Re-tagging, renaming and re-dating are the correction path: a guessed
-- category must always be fixable afterwards, so UPDATE is as open as INSERT.
DROP POLICY IF EXISTS "Household corrects property documents" ON public.property_documents;
CREATE POLICY "Household corrects property documents"
ON public.property_documents FOR UPDATE
USING (public.user_can_manage_property(property_id))
WITH CHECK (public.user_can_manage_property(property_id));

DROP POLICY IF EXISTS "Household removes property documents" ON public.property_documents;
CREATE POLICY "Household removes property documents"
ON public.property_documents FOR DELETE
USING (public.user_can_manage_property(property_id));

-- ── Storage access ────────────────────────────────────────────────────────
-- SECURITY DEFINER so the lookup reads the table without re-entering RLS —
-- same shape as `user_can_view_project_files`, and it keeps the policy graph
-- acyclic.

CREATE OR REPLACE FUNCTION public.user_can_access_property_file(file_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.property_documents d
    WHERE d.storage_path = file_path
      AND public.user_can_manage_property(d.property_id)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.user_can_access_property_file(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_can_access_property_file(text) FROM anon;
-- Storage policy expressions are evaluated as the calling role.
GRANT EXECUTE ON FUNCTION public.user_can_access_property_file(text) TO authenticated;

-- Additive: PostgreSQL ORs permissive policies together, and the existing
-- project policies already return FALSE for any prefix other than `projects/`.

DROP POLICY IF EXISTS "Household can upload property files" ON storage.objects;
CREATE POLICY "Household can upload property files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'project-files'
  AND (storage.foldername(name))[1] = 'properties'
  AND public.user_can_manage_property(((storage.foldername(name))[2])::uuid)
);

DROP POLICY IF EXISTS "Household can read property files" ON storage.objects;
CREATE POLICY "Household can read property files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'project-files'
  AND (storage.foldername(name))[1] = 'properties'
  AND public.user_can_access_property_file(name)
);

DROP POLICY IF EXISTS "Household can update property files" ON storage.objects;
CREATE POLICY "Household can update property files"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'project-files'
  AND (storage.foldername(name))[1] = 'properties'
  AND public.user_can_access_property_file(name)
);

DROP POLICY IF EXISTS "Household can delete property files" ON storage.objects;
CREATE POLICY "Household can delete property files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'project-files'
  AND (storage.foldername(name))[1] = 'properties'
  AND public.user_can_access_property_file(name)
);

-- ── Merge keeps the papers ────────────────────────────────────────────────
-- Without this the ON DELETE CASCADE would take every document with the source
-- address, and the files behind them would be unreachable forever. Identical
-- to 20260824113000 apart from the one re-point below.

CREATE OR REPLACE FUNCTION public.merge_properties(p_source_id uuid, p_target_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_source public.properties%ROWTYPE;
  v_target public.properties%ROWTYPE;
  v_owns_target boolean;
  v_moved integer;
BEGIN
  v_profile_id := public.get_user_profile_id();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_source_id IS NULL OR p_target_id IS NULL OR p_source_id = p_target_id THEN
    RAISE EXCEPTION 'Two different addresses are required';
  END IF;

  SELECT * INTO v_source FROM public.properties WHERE id = p_source_id;
  SELECT * INTO v_target FROM public.properties WHERE id = p_target_id;

  IF v_source.id IS NULL OR v_target.id IS NULL THEN
    RAISE EXCEPTION 'Address not found';
  END IF;

  IF v_source.owner_id <> v_profile_id THEN
    RAISE EXCEPTION 'Only the owner of an address can merge it away';
  END IF;

  IF NOT public.user_can_manage_property(p_target_id) THEN
    RAISE EXCEPTION 'You cannot move renovations into that address';
  END IF;

  v_owns_target := v_target.owner_id = v_profile_id;

  UPDATE public.properties SET
    address              = COALESCE(address, v_source.address),
    postal_code          = COALESCE(postal_code, v_source.postal_code),
    city                 = COALESCE(city, v_source.city),
    country              = COALESCE(country, v_source.country),
    property_designation = COALESCE(property_designation, v_source.property_designation)
  WHERE id = p_target_id;

  UPDATE public.projects SET property_id = p_target_id WHERE property_id = p_source_id;
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  -- The home's papers follow the home. `storage_path` is left untouched: it
  -- records where the file was put, and the row is what grants access to it.
  UPDATE public.property_documents SET property_id = p_target_id
  WHERE property_id = p_source_id;

  IF v_owns_target THEN
    UPDATE public.property_members m
    SET property_id = p_target_id
    WHERE m.property_id = p_source_id
      AND m.member_profile_id IS DISTINCT FROM v_profile_id
      AND NOT EXISTS (
        SELECT 1 FROM public.property_members t
        WHERE t.property_id = p_target_id
          AND (
            (m.member_profile_id IS NOT NULL AND t.member_profile_id = m.member_profile_id)
            OR (
              m.member_profile_id IS NULL
              AND m.invited_email IS NOT NULL
              AND t.invited_email IS NOT NULL
              AND lower(btrim(t.invited_email)) = lower(btrim(m.invited_email))
            )
          )
      );
  END IF;

  DELETE FROM public.properties WHERE id = p_source_id;

  RETURN v_moved;
END;
$$;

COMMENT ON TABLE public.property_documents IS
  'P3: the home''s own papers (purchase, inspection, association). Owner + household admins only — never the viewer role.';

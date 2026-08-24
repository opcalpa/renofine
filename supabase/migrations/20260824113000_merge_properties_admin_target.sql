-- S5 correction — split the permission the way the two actions actually differ.
--
-- 20260824110000 required ownership of BOTH addresses. That locked out the very
-- case the epic calls its most dangerous bug (plan §11.3): Carl owns "Storgatan
-- 5" with two renovations, his partner owns a second "Storgatan 5" row with a
-- third. Once she is an admin on his, SHE is the one who can see both — and she
-- was the one the old rule refused.
--
-- The two halves of a merge are not the same act:
--   * deleting an address dissolves a shared history  → OWNER only (unchanged,
--     and the same line the DELETE policy draws)
--   * moving projects INTO an address is ordinary content work → owner OR admin
--
-- So: the caller must OWN the source (it is the one that disappears) and be
-- able to MANAGE the target. Members only follow when the caller owns the
-- target too — an admin must not be able to walk their own address's members
-- into someone else's, even though they could invite people there directly.
--
-- REVERT: re-apply the body from 20260824110000 (owner of both).

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

  -- Keep whatever the surviving address is missing. Merging an address-less
  -- backfill row ("Kitchen!") into a real one must not throw away the street
  -- address, and neither must the reverse.
  UPDATE public.properties SET
    address              = COALESCE(address, v_source.address),
    postal_code          = COALESCE(postal_code, v_source.postal_code),
    city                 = COALESCE(city, v_source.city),
    country              = COALESCE(country, v_source.country),
    property_designation = COALESCE(property_designation, v_source.property_designation)
  WHERE id = p_target_id;

  -- Soft-deleted projects move too: they can be restored, and when they are
  -- they belong to the same home as their siblings.
  UPDATE public.projects SET property_id = p_target_id WHERE property_id = p_source_id;
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  IF v_owns_target THEN
    -- Members follow, minus anyone the target already knows and minus the owner
    -- (who is never a member row of their own address). Rows left behind go
    -- with the source through ON DELETE CASCADE.
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

COMMENT ON FUNCTION public.merge_properties(uuid, uuid) IS
  'S5: fold one address into another (projects, plus members when the caller owns both). Owner of the source + manage rights on the target. Returns the number of projects moved.';

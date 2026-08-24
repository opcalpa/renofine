-- S5 — merging two addresses that are the same home.
--
-- Why this is an RPC and not three client updates: the merge has to move
-- projects AND members and then delete the emptied address as ONE unit. Half a
-- merge leaves a home whose cost history is split across two addresses — the
-- exact failure this epic exists to prevent, only now invisible.
--
-- Ownership: the caller must own BOTH addresses. An admin has full rights over
-- the CONTENT of an address but never over its existence (same line the delete
-- policy draws), and merging across accounts is deliberately impossible —
-- nothing here reads a property the caller cannot already see.
--
-- Not revertible by SQL: the source address is gone afterwards. Undo is
-- re-assigning the projects to a new address from project settings, which is
-- why the UI never merges without an explicit confirmation.
--
-- REVERT:
--   DROP FUNCTION IF EXISTS public.merge_properties(uuid, uuid);

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

  IF v_source.owner_id <> v_profile_id OR v_target.owner_id <> v_profile_id THEN
    RAISE EXCEPTION 'Only the owner of both addresses can merge them';
  END IF;

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

  -- Members follow, minus anyone the target already knows and minus the owner
  -- (who is never a member row of their own address). Rows left behind go with
  -- the source through ON DELETE CASCADE.
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

  DELETE FROM public.properties WHERE id = p_source_id;

  RETURN v_moved;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.merge_properties(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_properties(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.merge_properties(uuid, uuid) IS
  'S5: fold one address into another (projects + members), owner of both only. Returns the number of projects moved.';

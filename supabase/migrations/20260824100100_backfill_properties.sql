-- S1b — Backfill: give every real project a property.
--
-- Runs SEPARATELY from the schema migration on purpose: schema changes are
-- reversible and boring, data migrations are neither. Idempotent — the
-- `property_id IS NULL` guard makes a re-run a no-op.
--
-- Rules (decided 2026-08-24):
--   * Demo projects are EXCLUDED. public_demo is RLS-readable by everyone, so a
--     property on it would surface in every user's address list.
--   * Soft-deleted projects are INCLUDED. They can be restored and must keep
--     their address when they are.
--   * Only EXACT normalised address matches are grouped automatically, and only
--     within one owner. Near-matches ("Storg. 5" vs "Storgatan 5") are left
--     alone — those become merge SUGGESTIONS in S5. A wrong grouping lies with
--     numbers on the address summary, so precision beats recall here.
--   * Address-less projects get their own property named after the project.
--     Sparse data is accepted; the minimum is a name.
--
-- REVERT:
--   UPDATE public.projects SET property_id = NULL;
--   DELETE FROM public.properties;   -- property_members cascades

DO $$
DECLARE
  grp RECORD;
  v_property_id uuid;
  v_grouped int := 0;
  v_single int := 0;
BEGIN
  -- 1) Projects that carry an address → one property per (owner, address).
  FOR grp IN
    SELECT
      p.owner_id,
      lower(btrim(p.address)) || '|' || coalesce(btrim(p.postal_code), '') AS addr_key,
      min(p.address) AS addr,
      (array_agg(p.postal_code ORDER BY p.created_at) FILTER (WHERE p.postal_code IS NOT NULL))[1] AS postal_code,
      (array_agg(p.city ORDER BY p.created_at) FILTER (WHERE p.city IS NOT NULL))[1] AS city,
      (array_agg(p.country ORDER BY p.created_at) FILTER (WHERE p.country IS NOT NULL))[1] AS country,
      (array_agg(p.property_designation ORDER BY p.created_at) FILTER (WHERE p.property_designation IS NOT NULL))[1] AS property_designation
    FROM public.projects p
    WHERE p.property_id IS NULL
      AND (p.project_type IS NULL OR p.project_type NOT IN ('demo_project', 'public_demo'))
      AND p.address IS NOT NULL
      AND btrim(p.address) <> ''
    GROUP BY p.owner_id, addr_key
  LOOP
    INSERT INTO public.properties (owner_id, name, address, postal_code, city, country, property_designation)
    VALUES (grp.owner_id, grp.addr, grp.addr, grp.postal_code, grp.city, grp.country, grp.property_designation)
    RETURNING id INTO v_property_id;

    UPDATE public.projects p
    SET property_id = v_property_id
    WHERE p.property_id IS NULL
      AND p.owner_id = grp.owner_id
      AND (p.project_type IS NULL OR p.project_type NOT IN ('demo_project', 'public_demo'))
      AND p.address IS NOT NULL
      AND lower(btrim(p.address)) || '|' || coalesce(btrim(p.postal_code), '') = grp.addr_key;

    v_grouped := v_grouped + 1;
  END LOOP;

  -- 2) Whatever is still unlinked has no usable address → one property each,
  --    named after the project so the address list is never nameless.
  FOR grp IN
    SELECT p.id, p.owner_id, p.name, p.country
    FROM public.projects p
    WHERE p.property_id IS NULL
      AND (p.project_type IS NULL OR p.project_type NOT IN ('demo_project', 'public_demo'))
  LOOP
    INSERT INTO public.properties (owner_id, name, country)
    VALUES (grp.owner_id, grp.name, grp.country)
    RETURNING id INTO v_property_id;

    UPDATE public.projects SET property_id = v_property_id WHERE id = grp.id;

    v_single := v_single + 1;
  END LOOP;

  RAISE NOTICE 'Property backfill: % address groups, % address-less projects', v_grouped, v_single;
END $$;

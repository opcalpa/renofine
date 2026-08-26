-- ---------------------------------------------------------------------------
-- photos.kind: VAD bilden visar, skilt från VARIFRÅN den kom
--
-- BAKGRUND (Carls designrunda 2026-08-26): `photos.source` gjorde två jobb.
-- upload/pinterest är proveniens; before/worker_progress/worker_completed är
-- innehåll. "Inspiration" fanns inte alls — den var definierad som frånvaro
-- (allt som inte är före/under/efter), så kvittobilder utan source och
-- dokumentationsfoton föll in i inspirationsvyn.
--
-- Dessutom skrevs samma begrepp "pågående" som TRE strängar av tre kodvägar:
-- during (hemägarflödet), worker_progress (arbetarflödet) och progress
-- (Renaidas capture). Läsarna kände bara igen de två första.
--
-- Nu: kind = before | during | after | inspiration | purchase (innehåll),
--      source = upload | pinterest | worker | renaida | ... (proveniens).
-- purchase är en DESTINATION, inte ett skede — kvitton och produktbilder ska
-- aldrig ligga i rummets bildflöde.
--
-- Triggern är bryggan: klienter som redan är deployade skriver utan kind, och
-- då härleds den ur source vid INSERT. Ingen rad får någonsin NULL, så läsarna
-- slipper fallback-logik för evigt.
-- Revert: supabase/revert_20260826100000_photo_kind.sql
-- ---------------------------------------------------------------------------

ALTER TABLE public.photos ADD COLUMN IF NOT EXISTS kind text;

COMMENT ON COLUMN public.photos.kind IS
  'Vad bilden visar: before|during|after|inspiration|purchase. Skilt från source (proveniens). purchase = kvitto/produkt/dokument — visas i Inköp, aldrig i rummets bildflöde.';

-- ── Härledningen, delad av backfill och trigger ────────────────────────────
CREATE OR REPLACE FUNCTION public.photos_derive_kind()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.kind IS NULL THEN
    NEW.kind := CASE
      WHEN NEW.source = 'before' THEN 'before'
      WHEN NEW.source IN ('during', 'worker_progress', 'progress', 'worker') THEN 'during'
      WHEN NEW.source IN ('after', 'worker_completed') THEN 'after'
      WHEN NEW.linked_to_type = 'material' THEN 'purchase'
      ELSE 'inspiration'
    END;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS photos_default_kind ON public.photos;
CREATE TRIGGER photos_default_kind
BEFORE INSERT ON public.photos
FOR EACH ROW EXECUTE FUNCTION public.photos_derive_kind();

-- ── Backfill (samma regler som triggern) ───────────────────────────────────
UPDATE public.photos SET kind = CASE
  WHEN source = 'before' THEN 'before'
  WHEN source IN ('during', 'worker_progress', 'progress', 'worker') THEN 'during'
  WHEN source IN ('after', 'worker_completed') THEN 'after'
  WHEN linked_to_type = 'material' THEN 'purchase'
  ELSE 'inspiration'
END
WHERE kind IS NULL;

-- ── source blir ren proveniens ─────────────────────────────────────────────
-- Fasinformationen bor nu i kind; arbetarens och Renaidas identitet behålls.
UPDATE public.photos SET source = 'worker'
WHERE source IN ('worker_progress', 'worker_completed');
UPDATE public.photos SET source = 'renaida' WHERE source = 'progress';

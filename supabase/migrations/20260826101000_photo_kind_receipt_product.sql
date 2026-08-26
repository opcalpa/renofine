-- ---------------------------------------------------------------------------
-- kind: 'purchase' delas i 'receipt' och 'product'
--
-- EntityPhotoGallery (arbets-/materialgalleriet) har redan exakt den
-- distinktionen som klassificeringsval — kvitto 🧾 respektive produkt 📦 — och
-- Carls fältfall kräver den: målaren fotar penslarna och skriver "Kup 10".
-- Det är en PRODUKTBILD med köpönskan, inte ett kvitto. Ett grovt 'purchase'
-- hade slagit ihop dem igen och tvingat fram en ny uppdelning senare.
--
-- Inköps-FAMILJEN (receipt + product) är fortsatt det som hålls borta från
-- rummets bildflöde.
-- Revert: supabase/revert_20260826101000_photo_kind_receipt_product.sql
-- ---------------------------------------------------------------------------

-- Materialbilder från första backfillen är produktbilder.
UPDATE public.photos SET kind = 'product' WHERE kind = 'purchase';

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
      -- Gamla klienter kan klassificera genom att skriva dessa i source.
      WHEN NEW.source = 'receipt' THEN 'receipt'
      WHEN NEW.source = 'product' THEN 'product'
      WHEN NEW.linked_to_type = 'material' THEN 'product'
      ELSE 'inspiration'
    END;
  END IF;
  RETURN NEW;
END $$;

COMMENT ON COLUMN public.photos.kind IS
  'Vad bilden visar: before|during|after|inspiration|receipt|product. Skilt från source (proveniens). receipt/product = inköpsfamiljen — visas i Inköp, aldrig i rummets bildflöde.';

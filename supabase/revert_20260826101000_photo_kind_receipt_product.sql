-- REVERT för 20260826101000_photo_kind_receipt_product.sql
UPDATE public.photos SET kind='purchase' WHERE kind IN ('receipt','product');
CREATE OR REPLACE FUNCTION public.photos_derive_kind()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind IS NULL THEN
    NEW.kind := CASE
      WHEN NEW.source = 'before' THEN 'before'
      WHEN NEW.source IN ('during','worker_progress','progress','worker') THEN 'during'
      WHEN NEW.source IN ('after','worker_completed') THEN 'after'
      WHEN NEW.linked_to_type = 'material' THEN 'purchase'
      ELSE 'inspiration'
    END;
  END IF;
  RETURN NEW;
END $$;

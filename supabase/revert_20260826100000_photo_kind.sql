-- REVERT för 20260826100000_photo_kind.sql
DROP TRIGGER IF EXISTS photos_default_kind ON public.photos;
DROP FUNCTION IF EXISTS public.photos_derive_kind();
ALTER TABLE public.photos DROP COLUMN IF EXISTS kind;
-- source-normaliseringen (worker_progress -> worker osv.) återställs INTE
-- automatiskt — fasinformationen är då flyttad till kind som droppas ovan.
-- Behövs full återställning: läs kind FÖRE drop och skriv tillbaka
-- worker_progress/worker_completed utifrån den.

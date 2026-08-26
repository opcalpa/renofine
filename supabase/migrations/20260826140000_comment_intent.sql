-- Fältkommunikation S1: vad avsändaren VILL, som en kolumn.
--
-- Ett meddelande från fältet bär en avsikt, och avsikten är formulerad som
-- mottagarens skyldighet: klart (inget att göra) · behover (godkänn ett köp) ·
-- fraga (svara) · info (läs). Utan den kan mottagaren inte skilja en rapport
-- från en blockerande fråga, och en fråga som drunknar i flödet stoppar en
-- människa på ett bygge.
--
-- 'behover' finns i listan trots att ett köp materialiseras som
-- purchase_order + material: den följekommentar som bär bilden och texten ska
-- kunna säga vad den handlade om, annars går spåret förlorat mellan tabellerna.
--
-- NULL = okänd avsikt (allt som skrevs före i dag). Ingen backfill: att gissa
-- avsikten på 29 gamla kommentarer vore att uppfinna data.
--
-- Revert: supabase/revert_20260826140000_comment_intent.sql

ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS intent text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'comments_intent_check'
  ) THEN
    ALTER TABLE public.comments
      ADD CONSTRAINT comments_intent_check
      CHECK (intent IS NULL OR intent IN ('klart', 'behover', 'fraga', 'info'));
  END IF;
END $$;

COMMENT ON COLUMN public.comments.intent IS
  'Vad avsandaren vill att mottagaren gor: klart (inget) | behover (godkann kop) '
  '| fraga (svara) | info (las). NULL = okand (skrivet fore 2026-08-26).';

-- "Från fältet"-listan frågar exakt en sak: vad väntar på mig i det här
-- projektet? Partiellt index så det bara indexerar de rader som kan stå där.
CREATE INDEX IF NOT EXISTS comments_open_questions_idx
  ON public.comments (project_id, created_at DESC)
  WHERE intent = 'fraga' AND is_resolved = false;

-- Steg 2 av 4: stang den anonyma laskanalen mot profiles, nu utan rekursion.
--
-- Inloggade far exakt samma atkomst som forut: `USING (true)`, bara scopad
-- TO authenticated. Det ar avgorande — ~35 policies i 22 tabeller gor
-- `SELECT profiles.id FROM profiles WHERE user_id = auth.uid()` inline, och de
-- utvarderas som authenticated. Att strama at vad en INLOGGAD ser ar det som
-- gav 500-orna i mars; det gor den har inte.
--
-- Verifierat direkt efter: alla anonyma vagar 200 pa under 0,7 s, och profiles
-- gick fran 23 rader till 5.
--
-- REVERT:
--   DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
--   DROP POLICY IF EXISTS "Anonymous visitors can view listed professionals" ON public.profiles;
--   CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

CREATE POLICY "Authenticated users can view profiles"
  ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Anonymous visitors can view listed professionals"
  ON public.profiles FOR SELECT TO anon USING (is_professional = true);

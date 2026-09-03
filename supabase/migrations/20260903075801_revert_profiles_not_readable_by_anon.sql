-- AKUT ATERSTALLNING av 20260903075548 — drift fore sakerhet.
-- Anonyma anrop mot projects gav HTTP 500; det publika demot och gasttratten
-- lag nere. Efter den har korningen svarade allt 200 igen pa under 0,3 s.
-- Lackan var da tillbaka, och stangdes ordentligt i 075858 → 080253.

DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Anonymous visitors can view listed professionals" ON public.profiles;

CREATE POLICY "Users can view all profiles"
  ON public.profiles FOR SELECT USING (true);

-- FORSTA FORSOKET — GICK SONDER, ATERSTALLD 2 MIN SENARE AV 20260903075801.
-- Ligger kvar for att den faktiskt applicerades mot produktionen; historiken
-- ska visa vad som hande, inte vad som var tankt.
--
-- `20260311210000_simplify_profiles_rls.sql` satte SELECT USING (true) utan
-- TO-klausul, dvs. rollen `public`, som inkluderar `anon`. Bevisat med ett
-- anonymt anrop: 23 rader, riktiga e-postadresser.
--
-- Varfor det small: sa lange `USING (true)` fanns kortslot den hela OR-kedjan
-- och den andra anon-policyn ("Anyone can view public demo team profiles")
-- utvarderades aldrig. Utan den blev den plotsligt het — och den gor en
-- subquery mot project_shares via `is_public_demo_project`, som ar
-- SECURITY INVOKER och laser projects under anroparens RLS, vars policy i sin
-- tur gor en inline-subquery mot profiles. Rekursion.
-- Foljd: anonyma anrop mot projects gav HTTP 500 efter 8,5 s. Gasttratten och
-- det publika demot lag nere tills aterstallningen.
--
-- Laxan: att ta bort en `USING (true)`-policy andrar inte bara VEM som slapps in,
-- den aktiverar ocksa alla andra policies pa tabellen som dittills aldrig
-- behovde utvarderas. Bryt rekursionen FORST (se 20260903075858).

DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

CREATE POLICY "Authenticated users can view profiles"
  ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Anonymous visitors can view listed professionals"
  ON public.profiles FOR SELECT TO anon USING (is_professional = true);

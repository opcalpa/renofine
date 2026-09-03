-- profiles: stang den anonyma laskanalen.
--
-- `20260311210000_simplify_profiles_rls.sql` satte
--     CREATE POLICY "Users can view all profiles" ... FOR SELECT USING (true);
-- utan TO-klausul. Da galler policyn rollen `public`, som inkluderar `anon`.
-- Anon-nyckeln ligger i klientbundlen och ar per definition offentlig.
--
-- BEVISAT 2026-09-03 med ett anonymt anrop mot produktionen: 23 rader kom
-- tillbaka, med riktiga e-postadresser. Hotfixen fran mars motiverade sig med
-- "Safe for beta: all users are invited/known, no public signup" — den premissen
-- galler inte langre.
--
-- ANDRINGEN AR AVSIKTLIGT SMAL. Inloggade anvandare far exakt samma atkomst som
-- idag (`USING (true)`, bara scopad `TO authenticated`). Det ar viktigt: ~35
-- policies i 22 tabeller gor `SELECT profiles.id FROM profiles WHERE user_id =
-- auth.uid()` inline, och de utvarderas som `authenticated`. Att i stallet
-- STRAMA at vad en inloggad ser ar precis det som gav 500-orna i mars.
--
-- Anon behaller tva saker:
--   1. Demo-teamets profiler (befintlig policy, orord).
--   2. De proffs som listar sig i /find-pros — den sidan ar publik och laser
--      profiles direkt.
--
-- KVAR EFTER DEN HAR MIGRATIONEN: de listade proffsen ar fortfarande lasbara
-- med fler kolumner an katalogen visar (e-post, telefon, org.nr). Att smalna av
-- det kraver en vy plus en kodandring i FindProfessionals — eget kort.
--
-- REVERT (en sats):
--   DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
--   DROP POLICY IF EXISTS "Anonymous visitors can view listed professionals" ON public.profiles;
--   CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

CREATE POLICY "Authenticated users can view profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- /find-pros ar en publik route som listar proffs. Utan den har policyn blir
-- katalogen tom for utloggade besokare.
CREATE POLICY "Anonymous visitors can view listed professionals"
  ON public.profiles
  FOR SELECT
  TO anon
  USING (is_professional = true);

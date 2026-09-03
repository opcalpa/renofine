-- Steg 3 av 4: ta bort aven den anonyma proffs-lasningen.
--
-- Policyn lades till for att inte tomma /find-pros. Vid narmare granskning gatar
-- den sidan sig SJALV: FindProfessionals.tsx rad 60-63 gor
-- `if (!authLoading && !user) navigate("/auth")`. Routen saknar RequireAuth, men
-- ingen utloggad besokare nar nagonsin fragan. Policyn behovdes aldrig.
--
-- Genomsokt alla anonymt nabara vagar: Index, About, Contact, Terms, Privacy,
-- Tips (gatar med `if (!user) return null`), EmbedRenaida och
-- landningskomponenterna laser inte profiles alls.
--
-- Efter den har: 1 rad i stallet for 5 — agarens egen, via demo-teamet.
--
-- REVERT:
--   CREATE POLICY "Anonymous visitors can view listed professionals"
--     ON public.profiles FOR SELECT TO anon USING (is_professional = true);

DROP POLICY IF EXISTS "Anonymous visitors can view listed professionals" ON public.profiles;

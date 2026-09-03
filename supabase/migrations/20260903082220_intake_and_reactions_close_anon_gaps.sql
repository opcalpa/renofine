-- Tva hal av samma sort som profiles-lackan, hittade vid en systematisk svep
-- efter samma monster (alla SELECT/ALL-policies som slapper in rollen public
-- eller anon). Det har ar DELMITIGERINGEN som gar att gora utan kodandring;
-- hela fixen kraver token-uppslag bakom service role — se
-- 20260827090000_ata_tokens_close_anon.sql for det etablerade monstret, och
-- notera att den migrationen medvetet applicerades EFTER att frontenden var
-- live, eftersom den gamla bundlen last tabellen direkt.

-- ── 1. customer_intake_requests ────────────────────────────────────────────
-- Policyn heter "Public can view by token" men kollade ALDRIG nagon token:
--     ... OR (status = ANY (ARRAY['pending','submitted']))
-- Anon kunde lista varje pagaende intake med kundnamn, e-post OCH sjalva token.
-- Token ar nyckeln, inte bara data — det ar allvarligare an profiles-lackan.
-- UPDATE-policyn var lika oppen: USING (status = 'pending'), dvs. vem som helst
-- kunde skriva om en kunds intake-svar.
--
-- Bada exponerade raderna gick ut 2026-03-20. Utgangskontrollen stanger darfor
-- hela dagens faktiska exponering utan att rora en enda levande lank
-- (kontrollerat innan: 0 levande, 2 utgangna).
--
-- KVAR: en LEVANDE intake gar fortfarande att lista utan token.
-- Se kortet `token-tables-can-be-enumerated-without-the-token`.
--
-- REVERT:
--   DROP POLICY IF EXISTS "Public can view by token" ON public.customer_intake_requests;
--   CREATE POLICY "Public can view by token" ON public.customer_intake_requests FOR SELECT
--     USING (((auth.uid() IS NOT NULL) AND (creator_id = get_user_profile_id()))
--            OR (status = ANY (ARRAY['pending'::text,'submitted'::text])));
--   DROP POLICY IF EXISTS "Public can submit intake requests" ON public.customer_intake_requests;
--   CREATE POLICY "Public can submit intake requests" ON public.customer_intake_requests FOR UPDATE
--     USING (status = 'pending'::text);

DROP POLICY IF EXISTS "Public can view by token" ON public.customer_intake_requests;

CREATE POLICY "Public can view by token"
  ON public.customer_intake_requests
  FOR SELECT
  USING (
    ((auth.uid() IS NOT NULL) AND (creator_id = get_user_profile_id()))
    OR (
      status = ANY (ARRAY['pending'::text, 'submitted'::text])
      AND expires_at IS NOT NULL
      AND expires_at > now()
    )
  );

DROP POLICY IF EXISTS "Public can submit intake requests" ON public.customer_intake_requests;

CREATE POLICY "Public can submit intake requests"
  ON public.customer_intake_requests
  FOR UPDATE
  USING (
    status = 'pending'::text
    AND expires_at IS NOT NULL
    AND expires_at > now()
  );

-- ── 2. comment_reactions ───────────────────────────────────────────────────
-- Sista tabellen med ett naket USING (true) pa SELECT. Policyn heter "on
-- accessible comments" men slappte in allt, ocksa anon. Reaktioner ar en
-- inloggad funktion (INSERT-policyn heter "Authenticated users can add
-- reactions"), sa anon har inget dar att gora.
--
-- Medvetet INTE en subquery mot comments: den tabellens policy refererar
-- profiles, och dagens lardom (se 20260903075548) ar att sadana kedjor blir
-- rekursiva sa fort ett `USING (true)` forsvinner. Tabellen ar dessutom tom,
-- sa ingen ser nagon skillnad. Att verkligen scopa till lasbara kommentarer
-- ar ett eget kort.
--
-- REVERT:
--   DROP POLICY IF EXISTS "Users can view reactions on accessible comments" ON public.comment_reactions;
--   CREATE POLICY "Users can view reactions on accessible comments"
--     ON public.comment_reactions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can view reactions on accessible comments" ON public.comment_reactions;

CREATE POLICY "Users can view reactions on accessible comments"
  ON public.comment_reactions
  FOR SELECT
  TO authenticated
  USING (true);

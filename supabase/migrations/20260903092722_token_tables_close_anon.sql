-- Steg 2 av 2: dra anon-policyerna nu nar frontenden ar live.
--
-- Verifierat innan: https://renofine.com/invitation?token=... anropar
-- `rpc/get_invitation_by_token` och fragar INTE project_invitations direkt.
-- Verifierat ocksa att noll levande lankar fanns i bada tabellerna, sa
-- ingenting var i omlopp som kunde brytas. Det ar samma ordning som
-- ata_tokens_close_anon (20260827090000) foreskriver.
--
-- ── project_invitations ────────────────────────────────────────────────────
-- "Anyone can view invitation by token" (TO anon) kollade bara att token INTE
-- var null:
--     (token IS NOT NULL) AND ((expires_at IS NULL) OR (expires_at > now()))
-- Ingen jamforelse med nagon token. Varje levande inbjudan var listbar med
-- invited_email, invited_phone, namn — och sjalva token, som ar nyckeln till
-- projektet. Uppslaget gar nu via get_invitation_by_token.
--
-- ── customer_intake_requests ───────────────────────────────────────────────
-- "Public can view by token" hade samma brist. Hela policyn kan dras: dess
-- forsta gren (skaparens egen atkomst) tacks redan av "Creators can manage own
-- intake requests" (FOR ALL, creator_id = get_user_profile_id()).
--
-- "Public can submit intake requests" (UPDATE, USING (status = 'pending'))
-- lat vem som helst skriva om en kunds svar. Inlamningen gar nu via
-- submit_intake_request_by_token, som ar SECURITY DEFINER och kraver token.
-- Anon behover alltsa ingen UPDATE-policy alls.
--
-- Efterat, anonymt: bada tabellerna ger [], funktionerna svarar null pa en
-- pahittad token, och demots vagar ar oroda.
--
-- REVERT:
--   CREATE POLICY "Anyone can view invitation by token" ON public.project_invitations
--     FOR SELECT TO anon
--     USING ((token IS NOT NULL) AND ((expires_at IS NULL) OR (expires_at > now())));
--   CREATE POLICY "Public can view by token" ON public.customer_intake_requests
--     FOR SELECT USING (((auth.uid() IS NOT NULL) AND (creator_id = get_user_profile_id()))
--       OR (status = ANY (ARRAY['pending'::text,'submitted'::text])
--           AND expires_at IS NOT NULL AND expires_at > now()));
--   CREATE POLICY "Public can submit intake requests" ON public.customer_intake_requests
--     FOR UPDATE USING (status = 'pending'::text
--       AND expires_at IS NOT NULL AND expires_at > now());

DROP POLICY IF EXISTS "Anyone can view invitation by token" ON public.project_invitations;

DROP POLICY IF EXISTS "Public can view by token" ON public.customer_intake_requests;

DROP POLICY IF EXISTS "Public can submit intake requests" ON public.customer_intake_requests;

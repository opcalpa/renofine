-- Steg 1 av 2: token-uppslag bakom SECURITY DEFINER.
--
-- Klienten filtrerade pa token medan RLS slappte igenom ALLA rader. RLS ar
-- radbaserad och kan inte se att fragan hade ett `.eq("token", ...)`. Vem som
-- helst kunde darfor lista varje levande inbjudan och intake — med e-post,
-- telefon och sjalva token.
--
-- Funktionerna nedan tar token som ARGUMENT och returnerar hogst en rad, sa
-- anon-policyerna kan dras i steg 2. Samma ide som ata_tokens_close_anon
-- (20260827090000), men som RPC i stallet for edge function: ingen kallstart,
-- och regeln bor bredvid datan.
--
-- FOTNOT VARD ATT MINNAS: `get_intake_request_by_token` FANNS redan, korrekt
-- skriven och SECURITY DEFINER, sedan 20260211100000. Klienten anvande den bara
-- aldrig — den fragade tabellen direkt. Dorren var byggd, ingen gick igenom den.
-- Den ersatts har med en variant som ocksa ger med skaparens uppgifter, som
-- sidan behover och inte langre kan hamta sjalv (profiles ar stangd for anon
-- sedan 20260903080253). Kontrollerat i src/ och supabase/functions/ att
-- ingenting anropade den gamla.
--
-- Additiv: ingenting anropar de nya forran frontenden ar deployad.
--
-- REVERT:
--   DROP FUNCTION IF EXISTS public.get_invitation_by_token(text);
--   DROP FUNCTION IF EXISTS public.get_intake_request_by_token(text);
--   DROP FUNCTION IF EXISTS public.submit_intake_request_by_token(text, jsonb);
--   (aterskapa den gamla get_intake_request_by_token ur 20260211100000 vid behov)

DROP FUNCTION IF EXISTS public.get_intake_request_by_token(text);

-- ── Inbjudan ───────────────────────────────────────────────────────────────
-- Statusen filtreras INTE bort: sidan har egna meddelanden for "redan
-- accepterad" och "avbojd". Utgangna slapps daremot inte igenom, precis som
-- policyn gjorde.
CREATE OR REPLACE FUNCTION public.get_invitation_by_token(p_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(i)
         || jsonb_build_object(
              'project', (SELECT jsonb_build_object('id', p.id, 'name', p.name)
                          FROM projects p WHERE p.id = i.project_id),
              'inviter', (SELECT jsonb_build_object('name', pr.name, 'email', pr.email)
                          FROM profiles pr WHERE pr.id = i.invited_by_user_id)
            )
  FROM project_invitations i
  WHERE i.token IS NOT NULL
    AND i.token = p_token
    AND (i.expires_at IS NULL OR i.expires_at > now())
  LIMIT 1;
$$;

-- ── Intake, lasning ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_intake_request_by_token(p_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(r)
         || jsonb_build_object(
              'creator', (SELECT jsonb_build_object(
                                   'id', pr.id, 'name', pr.name,
                                   'company_name', pr.company_name,
                                   'avatar_url', pr.avatar_url,
                                   'email', pr.email)
                          FROM profiles pr WHERE pr.id = r.creator_id)
            )
  FROM customer_intake_requests r
  WHERE r.token IS NOT NULL
    AND r.token = p_token
    AND r.status = 'pending'
    AND (r.expires_at IS NULL OR r.expires_at > now())
  LIMIT 1;
$$;

-- ── Intake, inlamning ──────────────────────────────────────────────────────
-- Bara de falt kunden ska kunna satta. Status, token, creator_id och expires_at
-- ar med flit inte skrivbara harifran.
CREATE OR REPLACE FUNCTION public.submit_intake_request_by_token(
  p_token text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row customer_intake_requests;
BEGIN
  UPDATE customer_intake_requests
  SET status               = 'submitted',
      customer_name        = p_payload->>'customer_name',
      customer_email       = p_payload->>'customer_email',
      customer_phone       = NULLIF(p_payload->>'customer_phone', ''),
      property_address     = p_payload->>'property_address',
      property_postal_code = NULLIF(p_payload->>'property_postal_code', ''),
      property_city        = NULLIF(p_payload->>'property_city', ''),
      property_type        = NULLIF(p_payload->>'property_type', ''),
      project_description  = NULLIF(p_payload->>'project_description', ''),
      desired_start_date   = NULLIF(p_payload->>'desired_start_date', '')::date,
      rooms_data           = COALESCE(p_payload->'rooms_data', '[]'::jsonb),
      images               = COALESCE(p_payload->'images', '[]'::jsonb),
      submitted_at         = now()
  WHERE token IS NOT NULL
    AND token = p_token
    AND status = 'pending'
    AND (expires_at IS NULL OR expires_at > now())
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;

REVOKE ALL ON FUNCTION public.get_invitation_by_token(text) FROM public;
REVOKE ALL ON FUNCTION public.get_intake_request_by_token(text) FROM public;
REVOKE ALL ON FUNCTION public.submit_intake_request_by_token(text, jsonb) FROM public;

GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_intake_request_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_intake_request_by_token(text, jsonb) TO anon, authenticated;

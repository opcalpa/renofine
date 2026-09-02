-- global_search(q): hela projektet sökbart, i ETT anrop.
--
-- BAKGRUND (Carl 2026-09-02): den globala sökningen frågade fem tabeller på i
-- princip ett fält var, i fem parallella anrop per tangenttryck. Arbetens
-- beskrivningar, rumsobjekt, kommentarer, teammedlemmar, arbetare, offerter,
-- fakturor och fältrapporter var osynliga — och att lägga varje ny tabell som
-- ännu ett klientanrop skalar inte: femton nätverksrundor per tangenttryck.
--
-- VÄGVAL, medvetet: detta är en UNION-funktion över de levande tabellerna, inte
-- en trigger-underhållen indextabell. En denormaliserad indextabell driftar
-- tyst — varje ny kolumn måste komma ihåg sin trigger, och felmoden är en
-- sökning som ser hel ut men saknar saker, exakt det fel som just rättades i
-- klienten. Vid nuvarande datamängder är seq scans över armarna billigare än
-- driftrisken. OM latens dyker upp: lägg pg_trgm GIN-index per kolumn, byt inte
-- arkitektur.
--
-- SÄKERHET, två oberoende lager (läxan från feedback_rls_test_the_table…):
--   1. Varje arm scopas hårt till my_project_ids() — användarens räckvidd UTAN
--      admin-bypass och utan public_demo (funktionen når inte demon eftersom
--      demon inte ägs/delas). Det är grinden.
--   2. SECURITY INVOKER: varje arms RLS gäller ovanpå. Om en roll inte får se
--      t.ex. worker_access_tokens faller den armen tyst bort för den rollen.
--      Det är bältet. Anonym anropare: get_user_profile_id() → NULL →
--      my_project_ids() tom → noll rader. Fail closed.
--
-- INTE MED, med flit:
--   * Projektfiler — de bor i storage utan metadatatabell; task_file_links är
--     en delmängd och en sökning som tyst hittar en delmängd är värre än ingen.
--     Backlog: global-sok-hittar-filer.
--   * property_documents — scopas på property_id, inte project_id; egen grind
--     krävs. Läggs till när bostadssök efterfrågas.
--   * time_entries/photos — text finns men efterfrågas inte än; en ny arm är
--     ~8 rader här när den behövs.
--
-- REVERT:
--   DROP FUNCTION IF EXISTS public.global_search(text, int);

CREATE OR REPLACE FUNCTION public.global_search(q text, per_type int DEFAULT 5)
RETURNS TABLE (
  entity_type text,
  entity_id uuid,
  project_id uuid,
  project_name text,
  title text,
  snippet text,
  meta jsonb
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
WITH
  scope AS (SELECT pid FROM my_project_ids() AS pid),
  -- ILIKE-mönstret måste neutralisera \ % _ i söktermen, annars blir "100%"
  -- ett jokertecken i stället för en sökning.
  input AS (
    SELECT
      '%' || replace(replace(replace(trim(q), '\', '\\'), '%', '\%'), '_', '\_') || '%' AS pat,
      -- Sifferform för beloppsmatchning: "2 948" och "2948" ska båda träffa
      -- totalen 2948. Tom sträng = ingen beloppssökning.
      regexp_replace(q, '\D', '', 'g') AS digits,
      least(greatest(per_type, 1), 10) AS cap
  ),

  t AS (
    SELECT 'task'::text AS entity_type, t.id, t.project_id,
           t.title, left(coalesce(t.description, ''), 120) AS snippet,
           '{}'::jsonb AS meta, t.updated_at,
           (t.title ILIKE (SELECT pat FROM input)) AS title_hit
    FROM tasks t, input
    WHERE t.project_id IN (SELECT pid FROM scope)
      AND (t.title ILIKE input.pat OR t.description ILIKE input.pat
           OR t.internal_notes ILIKE input.pat
           OR t.invoice_number ILIKE input.pat OR t.ocr_number ILIKE input.pat)
    ORDER BY title_hit DESC, t.updated_at DESC
    LIMIT (SELECT cap FROM input)
  ),
  m AS (
    SELECT 'material', m.id, m.project_id,
           m.name, left(coalesce(m.description, m.vendor_name, ''), 120),
           '{}'::jsonb, m.updated_at,
           (m.name ILIKE (SELECT pat FROM input))
    FROM materials m, input
    WHERE m.project_id IN (SELECT pid FROM scope)
      AND (m.name ILIKE input.pat OR m.description ILIKE input.pat
           OR m.vendor_name ILIKE input.pat)
    ORDER BY 8 DESC, m.updated_at DESC
    LIMIT (SELECT cap FROM input)
  ),
  po AS (
    SELECT 'purchaseOrder', po.id, po.project_id,
           po.vendor_name, coalesce('#' || nullif(po.invoice_number, ''), left(coalesce(po.notes,''),120)),
           jsonb_build_object('total', po.total), po.updated_at,
           (po.vendor_name ILIKE (SELECT pat FROM input))
    FROM purchase_orders po, input
    WHERE po.project_id IN (SELECT pid FROM scope)
      AND (po.vendor_name ILIKE input.pat OR po.invoice_number ILIKE input.pat
           OR po.ocr_number ILIKE input.pat OR po.notes ILIKE input.pat
           OR (input.digits <> '' AND po.total IS NOT NULL
               AND replace(po.total::text, '.', '') LIKE '%' || input.digits || '%'))
    ORDER BY 8 DESC, po.updated_at DESC
    LIMIT (SELECT cap FROM input)
  ),
  r AS (
    SELECT 'room', r.id, r.project_id,
           r.name, left(coalesce(r.description, r.notes, r.material, ''), 120),
           '{}'::jsonb, r.updated_at,
           (r.name ILIKE (SELECT pat FROM input))
    FROM rooms r, input
    WHERE r.project_id IN (SELECT pid FROM scope)
      AND (r.name ILIKE input.pat OR r.description ILIKE input.pat
           OR r.notes ILIKE input.pat OR r.material ILIKE input.pat)
    ORDER BY 8 DESC, r.updated_at DESC
    LIMIT (SELECT cap FROM input)
  ),
  ri AS (
    SELECT 'roomItem', ri.id, ri.project_id,
           ri.title, left(concat_ws(' · ', ri.category, ri.subtype, ri.series), 120),
           '{}'::jsonb, ri.updated_at,
           (ri.title ILIKE (SELECT pat FROM input))
    FROM room_items ri, input
    WHERE ri.project_id IN (SELECT pid FROM scope)
      AND (ri.title ILIKE input.pat OR ri.category ILIKE input.pat
           OR ri.subtype ILIKE input.pat OR ri.series ILIKE input.pat)
    ORDER BY 8 DESC, ri.updated_at DESC
    LIMIT (SELECT cap FROM input)
  ),
  c AS (
    SELECT 'comment', c.id, c.project_id,
           left(c.content, 80), c.author_display_name,
           jsonb_build_object('task_id', c.task_id), c.updated_at,
           false
    FROM comments c, input
    WHERE c.project_id IN (SELECT pid FROM scope)
      AND (c.content ILIKE input.pat OR c.author_display_name ILIKE input.pat)
    ORDER BY c.updated_at DESC
    LIMIT (SELECT cap FROM input)
  ),
  fr AS (
    SELECT 'fieldReport', fr.id, fr.project_id,
           left(coalesce(fr.raw_text, ''), 80), NULL::text,
           jsonb_build_object('task_id', fr.task_id), fr.created_at,
           false
    FROM field_reports fr, input
    WHERE fr.project_id IN (SELECT pid FROM scope)
      AND fr.raw_text ILIKE input.pat
    ORDER BY fr.created_at DESC
    LIMIT (SELECT cap FROM input)
  ),
  -- Teammedlemmar: project_shares bär display_name/display_email själv —
  -- ingen join mot profiles, vars RLS är ett känt minfält.
  tm AS (
    SELECT 'member', ps.id, ps.project_id,
           coalesce(nullif(ps.display_name, ''), ps.display_email),
           concat_ws(' · ', nullif(ps.role_type, ''), nullif(ps.company, ''), nullif(ps.display_email, '')),
           '{}'::jsonb, ps.created_at,
           (ps.display_name ILIKE (SELECT pat FROM input))
    FROM project_shares ps, input
    WHERE ps.project_id IN (SELECT pid FROM scope)
      AND (ps.display_name ILIKE input.pat OR ps.display_email ILIKE input.pat
           OR ps.company ILIKE input.pat OR ps.role_type ILIKE input.pat)
    ORDER BY 8 DESC, ps.created_at DESC
    LIMIT (SELECT cap FROM input)
  ),
  w AS (
    SELECT 'worker', w.id, w.project_id,
           w.worker_name,
           concat_ws(' · ', nullif(w.worker_phone, ''), nullif(w.worker_email, '')),
           '{}'::jsonb, w.created_at,
           (w.worker_name ILIKE (SELECT pat FROM input))
    FROM worker_access_tokens w, input
    WHERE w.project_id IN (SELECT pid FROM scope)
      AND (w.worker_name ILIKE input.pat OR w.worker_email ILIKE input.pat
           OR w.worker_phone ILIKE input.pat)
    ORDER BY 8 DESC, w.created_at DESC
    LIMIT (SELECT cap FROM input)
  ),
  qu AS (
    SELECT 'quote', qu.id, qu.project_id,
           coalesce(nullif(qu.title, ''), '#' || qu.quote_number),
           left(coalesce(qu.description, ''), 120),
           '{}'::jsonb, qu.updated_at,
           (qu.title ILIKE (SELECT pat FROM input))
    FROM quotes qu, input
    WHERE qu.project_id IN (SELECT pid FROM scope)
      AND (qu.title ILIKE input.pat OR qu.quote_number ILIKE input.pat
           OR qu.description ILIKE input.pat)
    ORDER BY 8 DESC, qu.updated_at DESC
    LIMIT (SELECT cap FROM input)
  ),
  inv AS (
    SELECT 'invoice', i.id, i.project_id,
           coalesce(nullif(i.title, ''), '#' || i.invoice_number),
           left(coalesce(i.description, ''), 120),
           '{}'::jsonb, i.updated_at,
           (i.title ILIKE (SELECT pat FROM input))
    FROM invoices i, input
    WHERE i.project_id IN (SELECT pid FROM scope)
      AND (i.title ILIKE input.pat OR i.invoice_number ILIKE input.pat
           OR i.ocr_reference ILIKE input.pat OR i.description ILIKE input.pat)
    ORDER BY 8 DESC, i.updated_at DESC
    LIMIT (SELECT cap FROM input)
  ),
  pr AS (
    SELECT 'project', p.id, p.id AS project_id,
           p.name, left(coalesce(p.description, ''), 120),
           '{}'::jsonb, p.updated_at,
           (p.name ILIKE (SELECT pat FROM input))
    FROM projects p, input
    WHERE p.id IN (SELECT pid FROM scope)
      AND (p.name ILIKE input.pat OR p.description ILIKE input.pat)
    ORDER BY 8 DESC, p.updated_at DESC
    LIMIT 3
  ),

  allt AS (
    SELECT * FROM t UNION ALL SELECT * FROM m UNION ALL SELECT * FROM po
    UNION ALL SELECT * FROM r UNION ALL SELECT * FROM ri UNION ALL SELECT * FROM c
    UNION ALL SELECT * FROM fr UNION ALL SELECT * FROM tm UNION ALL SELECT * FROM w
    UNION ALL SELECT * FROM qu UNION ALL SELECT * FROM inv UNION ALL SELECT * FROM pr
  )
SELECT a.entity_type, a.id, a.project_id, p.name, a.title, nullif(a.snippet, ''), a.meta
FROM allt a
LEFT JOIN projects p ON p.id = a.project_id
WHERE length(trim(q)) >= 2;
$$;

COMMENT ON FUNCTION public.global_search IS
  'Cmd+K-sökningen: tolv armar över levande tabeller, scopade till my_project_ids() (grinden) under anroparens RLS (bältet). Ett anrop per tangenttryck i stället för ett per tabell. Ny objekttyp = ny arm här, ingen annanstans.';

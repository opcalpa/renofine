-- ---------------------------------------------------------------------------
-- task_costs: byggarens kostnadsbas och påslag får en EGEN gräns
--
-- BAKGRUND (bevisat 2026-08-25, se BACKLOG-kortet user-type-kundvy-persona-kontrakt):
-- RLS är RADbaserad. Passerar en läsare tasks-policyn kommer HELA raden med,
-- inklusive subcontractor_cost och markup_percent. En inbjuden kund läste
-- alltså byggarens inköpspris och påslag. Kolumnmaskeringen fanns bara i
-- SECURITY DEFINER-RPC:erna, som är en annan läsväg som nästan ingen använder
-- (5 komponenter, mot 165 direkta from("tasks")-anrop).
--
-- Fixen är strukturell i stället för disciplinär: flytta de hemliga kolumnerna
-- till en egen tabell med egen policy. Då blir select("*") på tasks säkert AV
-- KONSTRUKTION, och de 165 läsställena slutar läcka utan att röras.
--
-- Denna migration är ADDITIV — tasks-kolumnerna ligger kvar tills koden är
-- utrullad. Droppet sker i 20260825130000_drop_task_cost_columns.sql.
-- Revert: supabase/revert_20260825120000_task_costs_boundary.sql
-- ---------------------------------------------------------------------------

-- ── 1. Hjälpfunktioner ─────────────────────────────────────────────────────
-- OBS: nyckla ALLTID på role_type, aldrig på role. En planning_contributor har
-- role = 'client' men är inte en kund.

CREATE OR REPLACE FUNCTION public.user_is_client_on_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_shares
    WHERE project_id = p_project_id
      AND shared_with_user_id = get_user_profile_id()
      AND role_type = 'client'
  );
$$;

COMMENT ON FUNCTION public.user_is_client_on_project IS
  'True om den anropande användaren är INBJUDEN KUND på projektet. Nyckar på role_type (planning_contributor har role=client men är ingen kund).';

-- Fail-CLOSED till skillnad från user_can_view_budget: saknat värde = NEJ.
CREATE OR REPLACE FUNCTION public.user_can_view_costs(p_project_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    is_system_admin()
    OR EXISTS (
      SELECT 1 FROM projects
      WHERE id = p_project_id AND owner_id = get_user_profile_id()
    )
    OR EXISTS (
      SELECT 1 FROM project_shares
      WHERE project_id = p_project_id
        AND shared_with_user_id = get_user_profile_id()
        AND role_type IS DISTINCT FROM 'client'
        AND (role_type = 'co_owner' OR budget_access IN ('view', 'edit'))
    );
$$;

COMMENT ON FUNCTION public.user_can_view_costs IS
  'Får se byggarens kostnadsbas/påslag. Fail-closed: NULL budget_access = nej. Kunder aldrig.';

CREATE OR REPLACE FUNCTION public.user_can_edit_costs(p_project_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    is_system_admin()
    OR EXISTS (
      SELECT 1 FROM projects
      WHERE id = p_project_id AND owner_id = get_user_profile_id()
    )
    OR EXISTS (
      SELECT 1 FROM project_shares
      WHERE project_id = p_project_id
        AND shared_with_user_id = get_user_profile_id()
        AND role_type IS DISTINCT FROM 'client'
        AND (role_type = 'co_owner' OR budget_access = 'edit')
    );
$$;

COMMENT ON FUNCTION public.user_can_edit_costs IS
  'Får ändra byggarens kostnadsbas/påslag. Fail-closed. Kunder aldrig.';

-- ── 2. Tabellen ────────────────────────────────────────────────────────────
-- project_id ligger denormaliserat så policyn slipper joina tasks (undviker
-- både en extra policy-utvärdering och risk för cirkulära beroenden).

CREATE TABLE IF NOT EXISTS public.task_costs (
  task_id                 uuid PRIMARY KEY REFERENCES public.tasks(id)    ON DELETE CASCADE,
  project_id              uuid NOT NULL     REFERENCES public.projects(id) ON DELETE CASCADE,
  subcontractor_cost      numeric,
  markup_percent          numeric,
  material_markup_percent numeric,
  labor_cost_percent      numeric,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.task_costs IS
  'Byggarens kostnadsbas och påslag per arbete. EGEN tabell just för att RLS är radbaserad: dessa fält får aldrig följa med en tasks-rad ut till en kund.';

CREATE INDEX IF NOT EXISTS task_costs_project_id_idx ON public.task_costs (project_id);

-- ── 3. Backfill ────────────────────────────────────────────────────────────
INSERT INTO public.task_costs (
  task_id, project_id, subcontractor_cost, markup_percent,
  material_markup_percent, labor_cost_percent
)
SELECT t.id, t.project_id, t.subcontractor_cost, t.markup_percent,
       t.material_markup_percent, t.labor_cost_percent
FROM public.tasks t
WHERE t.project_id IS NOT NULL
  AND (t.subcontractor_cost      IS NOT NULL
    OR t.markup_percent          IS NOT NULL
    OR t.material_markup_percent IS NOT NULL
    OR t.labor_cost_percent      IS NOT NULL)
ON CONFLICT (task_id) DO NOTHING;

-- ── 4. RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE public.task_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cost viewers can read task costs"   ON public.task_costs;
DROP POLICY IF EXISTS "Cost editors can write task costs"  ON public.task_costs;

CREATE POLICY "Cost viewers can read task costs"
ON public.task_costs FOR SELECT
USING (user_can_view_costs(project_id));

CREATE POLICY "Cost editors can write task costs"
ON public.task_costs FOR ALL
USING (user_can_edit_costs(project_id))
WITH CHECK (user_can_edit_costs(project_id));

-- updated_at
CREATE OR REPLACE FUNCTION public.touch_task_costs_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS task_costs_touch_updated_at ON public.task_costs;
CREATE TRIGGER task_costs_touch_updated_at
BEFORE UPDATE ON public.task_costs
FOR EACH ROW EXECUTE FUNCTION public.touch_task_costs_updated_at();

-- ── 5. Hårdna de fail-open-funktionerna ────────────────────────────────────
-- COALESCE(purchases_access, 'view') != 'none' betydde att NULL = JA. Noll rader
-- har NULL idag (verifierat), så detta är rent defensivt — men det är en laddad
-- pistol för nästa delning som skapas utan värden.
-- Samtidigt: en inbjuden KUND får aldrig inköpsdata (priser, leverantörer,
-- materialpåslag), oavsett vad delningsraden säger.

CREATE OR REPLACE FUNCTION public.user_can_view_purchases(p_project_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    is_system_admin()
    OR EXISTS (
      SELECT 1 FROM projects
      WHERE id = p_project_id AND owner_id = get_user_profile_id()
    )
    OR EXISTS (
      SELECT 1 FROM project_shares
      WHERE project_id = p_project_id
        AND shared_with_user_id = get_user_profile_id()
        AND role_type IS DISTINCT FROM 'client'
        AND (role_type = 'co_owner' OR purchases_access IN ('view', 'create', 'edit'))
    );
$$;

CREATE OR REPLACE FUNCTION public.user_can_view_budget(p_project_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    is_system_admin()
    OR EXISTS (
      SELECT 1 FROM projects
      WHERE id = p_project_id AND owner_id = get_user_profile_id()
    )
    OR EXISTS (
      SELECT 1 FROM project_shares
      WHERE project_id = p_project_id
        AND shared_with_user_id = get_user_profile_id()
        AND (role_type = 'co_owner' OR budget_access IN ('view', 'edit'))
    );
$$;

-- OBS: budget_access lämnas MEDVETET öppen för kunder här. Kundens
-- budgetvy (CustomerBudgetSection) läser bara kundvända kolumner på
-- quotes/invoices — total_amount, total_after_rot — alltså det kunden själv
-- ska betala. Att stänga den skulle tömma kundens egen ekonomisida.
-- Hemligheterna ligger i task_costs och i inköpen, och de är stängda ovan.

CREATE OR REPLACE FUNCTION public.user_purchases_scope(p_project_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN EXISTS (
        SELECT 1 FROM projects
        WHERE id = p_project_id AND owner_id = get_user_profile_id()
      ) THEN 'all'
      WHEN EXISTS (
        SELECT 1 FROM project_shares
        WHERE project_id = p_project_id
          AND shared_with_user_id = get_user_profile_id()
          AND role_type = 'co_owner'
      ) THEN 'all'
      ELSE COALESCE((
        SELECT purchases_scope FROM project_shares
        WHERE project_id = p_project_id
          AND shared_with_user_id = get_user_profile_id()
        LIMIT 1
      ), 'assigned')   -- fail-closed: saknat scope = bara egna rader
    END
$$;

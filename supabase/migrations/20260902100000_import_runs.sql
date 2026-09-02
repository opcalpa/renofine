-- "Importer" — en importomgång blir en post som överlever webbläsaren.
--
-- VARFÖR (Carl, 2026-09-02): han släppte 56 kvitton, granskade en stund, och
-- hittade sedan inte tillbaka. Läsningen levde på exakt två ställen: en
-- Zustand-variabel utan `persist` (dör vid omladdning) och en IndexedDB-journal
-- med `keyPath: 'projectId'` — ETT projekt = EN sparad import, överskriven av
-- nästa släpp, bunden till den webbläsarprofil den gjordes i, och raderad av
-- "Avbryt". Servern visste ingenting: det fanns ingen tabell som ens kunde säga
-- att en import hade hänt.
--
-- En läsning av hundra kvitton är riktiga pengar i modellanrop. Det hör inte
-- hemma i ett lager som en storage-rensning tar utan förvarning. Därför bor
-- omgången här, och journalen får vara det den är bra på — en snabb lokal
-- kopia med kvittobilderna i.
--
-- `session` är hela ImportSession som jsonb. Avsiktligt läsbar: en agent ska
-- kunna förklara vad en omgång föreslog utan att appen kör.
--
-- OBS om bilderna: kvittofoton laddas upp först när importen GODKÄNNS
-- (importPurchaseOrder äger uppladdningen). En omgång som öppnas på en annan
-- dator har därför sin granskning intakt men saknar kvittobilderna. Appen säger
-- det rakt ut i stället för att låtsas. Att flytta upp bilderna tidigare är ett
-- eget beslut, inte något den här tabellen ska föregripa.
--
-- REVERT:
--   DROP TABLE IF EXISTS public.import_runs;

CREATE TABLE IF NOT EXISTS public.import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- reviewing = läst, inte besvarad. applied = genomförd. discarded = kastad.
  -- Kastade rader blir kvar: "vad hände med de där 56 kvittona" är en fråga
  -- som ska gå att besvara även när svaret är "du kastade dem".
  status text NOT NULL DEFAULT 'reviewing'
    CHECK (status IN ('reviewing', 'applied', 'discarded')),

  -- Rubriksiffrorna. Egna kolumner så listan renderas utan att packa upp
  -- sessionen — hundra rader jsonb för att rita en lista är slöseri.
  files_read integer NOT NULL DEFAULT 0,
  proposal_count integer NOT NULL DEFAULT 0,
  flagged_count integer NOT NULL DEFAULT 0,
  purchase_count integer NOT NULL DEFAULT 0,
  applied_count integer,

  -- Mappen släppet lade sina filer i ("Import 2026-09-02"), så en omgång går
  -- att hitta i Filer också.
  folder_label text,

  session jsonb NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

-- Uppslaget är alltid "projektets omgångar, nyast först".
CREATE INDEX IF NOT EXISTS import_runs_project_idx
  ON public.import_runs (project_id, created_at DESC);

-- Och "finns det något obesvarat här?" — den frågan ställs vid varje
-- projektladdning och ska inte läsa hela tabellen.
CREATE INDEX IF NOT EXISTS import_runs_open_idx
  ON public.import_runs (project_id, updated_at DESC)
  WHERE status = 'reviewing';

ALTER TABLE public.import_runs ENABLE ROW LEVEL SECURITY;

-- Samma form som varje annan projekt-scopad tabell: checken inlinas i stället
-- för att ärvas, eftersom en inlinad policy ärver ingenting.
DROP POLICY IF EXISTS "import_runs_select" ON public.import_runs;
CREATE POLICY "import_runs_select" ON public.import_runs
  FOR SELECT USING (
    is_system_admin()
    OR user_owns_project(project_id)
    OR user_has_project_access(project_id)
  );

DROP POLICY IF EXISTS "import_runs_insert" ON public.import_runs;
CREATE POLICY "import_runs_insert" ON public.import_runs
  FOR INSERT WITH CHECK (
    user_owns_project(project_id)
    OR user_has_project_access(project_id)
  );

DROP POLICY IF EXISTS "import_runs_update" ON public.import_runs;
CREATE POLICY "import_runs_update" ON public.import_runs
  FOR UPDATE USING (
    user_owns_project(project_id)
    OR user_has_project_access(project_id)
  );

-- Radering är ägarens beslut. Att kasta en import är `status = 'discarded'`,
-- inte en DELETE — spåret är hela poängen med tabellen.
DROP POLICY IF EXISTS "import_runs_delete" ON public.import_runs;
CREATE POLICY "import_runs_delete" ON public.import_runs
  FOR DELETE USING (user_owns_project(project_id));

COMMENT ON TABLE public.import_runs IS
  'En mappimport som omgång: vad som lästes, vad som föreslogs, och om den besvarades. Överlever webbläsare och enhet — journalen i IndexedDB gör det inte.';
COMMENT ON COLUMN public.import_runs.session IS
  'Hela ImportSession som jsonb (rejected som array). Källan granskningsvyn öppnas ur.';
COMMENT ON COLUMN public.import_runs.flagged_count IS
  'Rader som behövde en mänsklig blick vid läsningen — listans viktigaste siffra.';

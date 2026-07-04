-- Renaida learning substrate: a per-user fact/preference store.
-- Every Renaida interaction can write here; the agent-route context-provider
-- injects relevant rows into the routing prompt so matching gets more personal
-- and seamless over time. See project_renaida_wow_engine.md (Fas 1).
--
-- User-owned (profile-scoped) table — follows the inspection_templates RLS
-- pattern: rows belong to a profile, access gated via profiles↔auth.uid().
-- project_id NULL = a global fact about the user (spans all their projects).

CREATE TABLE IF NOT EXISTS public.renaida_user_memory (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id    uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  -- kind: what sort of thing Renaida learned.
  --   'correction'  — router picked wrong; user re-picked (phrase → intended work)
  --   'phrase_map'  — a phrase the user uses maps to a known entity ("köket" → room)
  --   'vendor'      — preferred supplier for a material/category
  --   'preference'  — a UI/behaviour preference (e.g. ex-moms figures)
  --   'pattern'     — an observed recurring habit
  kind          text NOT NULL CHECK (kind IN ('correction','phrase_map','vendor','preference','pattern')),
  key           text NOT NULL,
  value         text NOT NULL,
  -- Strengthened each time the same fact is observed again; lets the injector
  -- prioritise well-established facts and lets us decay/prune weak ones later.
  evidence_count integer NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Read path: the edge fn fetches a user's memories for a project (+ their globals).
CREATE INDEX IF NOT EXISTS renaida_user_memory_profile_project_idx
  ON public.renaida_user_memory (profile_id, project_id);

-- Dedup key for the read-modify-write upsert in the client service. project_id
-- NULLs collapse to the zero-uuid so a global fact is unique per (kind,key).
CREATE UNIQUE INDEX IF NOT EXISTS renaida_user_memory_unique_fact_idx
  ON public.renaida_user_memory
  (profile_id, COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid), kind, key);

ALTER TABLE public.renaida_user_memory ENABLE ROW LEVEL SECURITY;

-- Profile-scoped access (same shape as inspection_templates). A user only ever
-- sees/writes their own memory rows.
DROP POLICY IF EXISTS renaida_user_memory_select ON public.renaida_user_memory;
CREATE POLICY renaida_user_memory_select ON public.renaida_user_memory FOR SELECT
  USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS renaida_user_memory_insert ON public.renaida_user_memory;
CREATE POLICY renaida_user_memory_insert ON public.renaida_user_memory FOR INSERT
  WITH CHECK (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS renaida_user_memory_update ON public.renaida_user_memory;
CREATE POLICY renaida_user_memory_update ON public.renaida_user_memory FOR UPDATE
  USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS renaida_user_memory_delete ON public.renaida_user_memory;
CREATE POLICY renaida_user_memory_delete ON public.renaida_user_memory FOR DELETE
  USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

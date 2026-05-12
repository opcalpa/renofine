-- Worker purchase input (Steg 1: request-only)
--
-- Workers via /w/:token (worker_access_tokens) ska kunna föreslå inköp.
-- Varje förslag blir submitted-material kopplad till en requested-PO.
-- Projektägaren kan sen godkänna/avböja i PurchasesTableView.
--
-- Två behörigheter på token-nivå:
--   can_create_purchases (default true) — får skapa request-flow
--   can_log_receipts     (default false) — Steg 2: får logga köpta saker direkt
--
-- materials får submitted_by_worker_token_id för att spåra avsändare
-- (workers har ingen profile.id, så created_by_user_id räcker inte).
--
-- Idempotent.

-- 1) Worker-token behörigheter
ALTER TABLE public.worker_access_tokens
  ADD COLUMN IF NOT EXISTS can_create_purchases BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.worker_access_tokens
  ADD COLUMN IF NOT EXISTS can_log_receipts BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.worker_access_tokens.can_create_purchases IS
  'Worker kan skapa request-PO (submitted material). Default true.';

COMMENT ON COLUMN public.worker_access_tokens.can_log_receipts IS
  'Worker kan logga utförda köp (skapar paid/billed material direkt). Default false — kräver ägarens opt-in. Steg 2.';

-- 2) Materials spårar worker-källa
ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS submitted_by_worker_token_id UUID
  REFERENCES public.worker_access_tokens(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_materials_submitted_by_worker_token
  ON public.materials(submitted_by_worker_token_id)
  WHERE submitted_by_worker_token_id IS NOT NULL;

COMMENT ON COLUMN public.materials.submitted_by_worker_token_id IS
  'Worker-token som föreslog inköpet via /w/:token. NULL för icke-worker-input. Driver Submitted-by-display.';

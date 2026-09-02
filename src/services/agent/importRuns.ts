/**
 * Import runs — an import you can find again, from any browser.
 *
 * WHY (Carl, 2026-09-02): he dropped 56 receipts on prod, reviewed part of the
 * batch, went to look at something else, and could not find his way back. The
 * reading existed in exactly two places, and neither is a place a person can
 * navigate to:
 *
 *   1. `useRenaidaStore.importSession` — a plain Zustand field with no
 *      `persist`. Gone on reload.
 *   2. The IndexedDB journal — keyed `projectId`, so ONE saved import per
 *      project, overwritten by the next drop, bound to the browser profile it
 *      was made in, and deleted by "Avbryt".
 *
 * The server knew nothing at all. A reading of a hundred receipts is real money
 * in model calls, and it lived only where a storage sweep could take it.
 *
 * This module makes the RUN the durable thing. The journal stays — it is good
 * at what it is for (a fast local copy that still holds the receipt blobs) —
 * but it is no longer the only copy, and it is no longer the only door.
 *
 * WHAT DOES NOT SURVIVE, AND IS SAID OUT LOUD: receipt photos are uploaded when
 * an import is APPLIED (`importPurchaseOrder` owns that upload). Documents and
 * filed files are archived at drop time and carry a `storagePath`, so they
 * preview anywhere; a receipt that has become a purchase proposal does not.
 * Open a run on a second machine and the review is intact but those images are
 * missing — `receiptImagesAreLocal()` is how the UI knows to say so rather than
 * showing an empty frame.
 */

import { supabase } from '@/integrations/supabase/client';
import type { ImportSession } from './importSession';
import { buildPurchaseRows } from '@/components/project/import-review/purchaseRowModel';
import { peekAttachment } from './documentCapture';

export type ImportRunStatus = 'reviewing' | 'applied' | 'discarded';

/** One row of the history list. The session is fetched only when opened. */
export interface ImportRunSummary {
  id: string;
  projectId: string;
  status: ImportRunStatus;
  filesRead: number;
  proposalCount: number;
  flaggedCount: number;
  purchaseCount: number;
  appliedCount: number | null;
  folderLabel: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

/** `rejected` is a Set, and a Set is not JSON. */
type StoredSession = Omit<ImportSession, 'rejected'> & { rejected: string[] };

function toStored(session: ImportSession): StoredSession {
  return { ...session, rejected: [...session.rejected] };
}

function fromStored(stored: StoredSession): ImportSession {
  return { ...stored, rejected: new Set(stored.rejected ?? []) };
}

interface RunRow {
  id: string;
  project_id: string;
  status: ImportRunStatus;
  files_read: number;
  proposal_count: number;
  flagged_count: number;
  purchase_count: number;
  applied_count: number | null;
  folder_label: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

function toSummary(row: RunRow): ImportRunSummary {
  return {
    id: row.id,
    projectId: row.project_id,
    status: row.status,
    filesRead: row.files_read,
    proposalCount: row.proposal_count,
    flaggedCount: row.flagged_count,
    purchaseCount: row.purchase_count,
    appliedCount: row.applied_count,
    folderLabel: row.folder_label,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at,
  };
}

/**
 * The headline numbers, derived from the session rather than passed in.
 *
 * Deriving beats trusting a caller: the list and the review must never disagree
 * about how many rows need a look, and they only can't if there is one place
 * that decides.
 */
function headlineCounts(session: ImportSession) {
  const rows = buildPurchaseRows(session);
  return {
    files_read: session.outcome.filesRead ?? session.files.length,
    proposal_count: session.proposals.length,
    purchase_count: rows.length,
    flagged_count: rows.filter((r) => r.needsLook).length,
  };
}

/**
 * Write the run, creating it the first time and updating it after that.
 *
 * Never throws. An import must not fail because the history could not be
 * written — the person still has the review in front of them, and the journal
 * still has the blobs. The caller is told so it can be honest about the gap.
 */
export async function saveImportRun(
  session: ImportSession,
  opts: { folderLabel?: string; status?: ImportRunStatus; appliedCount?: number } = {},
): Promise<boolean> {
  if (!session.runId) return false;
  try {
    const { data: profileId } = await supabase.rpc('get_user_profile_id');
    const status = opts.status ?? 'reviewing';
    const row = {
      id: session.runId,
      project_id: session.projectId,
      created_by_profile_id: (profileId as string | null) ?? null,
      status,
      ...headlineCounts(session),
      applied_count: opts.appliedCount ?? null,
      folder_label: opts.folderLabel ?? null,
      session: toStored(session) as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
      finished_at: status === 'reviewing' ? null : new Date().toISOString(),
    };
    const { error } = await supabase.from('import_runs').upsert(row, { onConflict: 'id' });
    if (error) {
      console.error('importRuns: save failed', error);
      return false;
    }
    return true;
  } catch (e) {
    console.error('importRuns: save failed', e);
    return false;
  }
}

/**
 * Close a run without rewriting its session.
 *
 * Used by apply and discard, where the session is already whatever it was and
 * only the verdict changes. `folder_label` and the counts stay as they were —
 * the history should show what the reading FOUND, not what survived it.
 */
export async function finishImportRun(
  runId: string,
  status: Exclude<ImportRunStatus, 'reviewing'>,
  appliedCount?: number,
): Promise<void> {
  try {
    const { error } = await supabase
      .from('import_runs')
      .update({
        status,
        applied_count: appliedCount ?? null,
        updated_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
      })
      .eq('id', runId);
    if (error) console.error('importRuns: finish failed', error);
  } catch (e) {
    console.error('importRuns: finish failed', e);
  }
}

/** The project's runs, newest first. Summaries only — sessions are heavy. */
export async function listImportRuns(projectId: string): Promise<ImportRunSummary[]> {
  const { data, error } = await supabase
    .from('import_runs')
    .select(
      'id, project_id, status, files_read, proposal_count, flagged_count, purchase_count, applied_count, folder_label, created_at, updated_at, finished_at',
    )
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('importRuns: list failed', error);
    return [];
  }
  return ((data ?? []) as RunRow[]).map(toSummary);
}

/** The newest run still waiting for an answer, if there is one. */
export async function openImportRun(projectId: string): Promise<ImportRunSummary | null> {
  const { data, error } = await supabase
    .from('import_runs')
    .select(
      'id, project_id, status, files_read, proposal_count, flagged_count, purchase_count, applied_count, folder_label, created_at, updated_at, finished_at',
    )
    .eq('project_id', projectId)
    .eq('status', 'reviewing')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('importRuns: open lookup failed', error);
    return null;
  }
  return data ? toSummary(data as RunRow) : null;
}

/** The full session behind one run, ready to hand to the review page. */
export async function loadImportRun(runId: string): Promise<ImportSession | null> {
  const { data, error } = await supabase
    .from('import_runs')
    .select('session')
    .eq('id', runId)
    .maybeSingle();
  if (error) {
    console.error('importRuns: load failed', error);
    return null;
  }
  const stored = (data as { session?: StoredSession } | null)?.session;
  return stored ? fromStored(stored) : null;
}

/**
 * Are this session's receipt images actually here?
 *
 * A run reopened in the browser that read it has its blobs in the attachment
 * registry. Reopened anywhere else it does not, and the review must say the
 * images are missing instead of rendering an empty preview and letting the
 * person accept rows they think they checked.
 */
export function receiptImagesAreLocal(session: ImportSession): boolean {
  let expected = 0;
  let present = 0;
  for (const p of session.proposals) {
    if (p.action.type !== 'import_purchase' || !p.action.attachmentKey) continue;
    expected += 1;
    if (peekAttachment(p.action.attachmentKey)) present += 1;
  }
  return expected === 0 || present > 0;
}

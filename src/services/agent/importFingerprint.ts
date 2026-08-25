import { supabase } from '@/integrations/supabase/client';
import { CATEGORY_FOLDERS } from '../smartUploadService';
import { fileFingerprint, originalNameFromStored, purchaseKeys, taskKey } from '@/lib/importKeys';

/**
 * Fetch what a project already holds, so a re-dropped folder can be recognised
 * BEFORE anything is read.
 *
 * Re-dropping is the normal case: you add three files and drop the whole folder
 * again. That used to re-read all 100 files (200–300 model calls) and then
 * create a second copy of everything they described. A skipped file costs
 * nothing at all — the only saving that removes a call instead of making it
 * cheaper.
 *
 * The keys themselves live in `@/lib/importKeys` (pure, no client).
 */

/** Fingerprints of every file already filed in a project. */
export async function loadImportedFingerprints(projectId: string): Promise<Set<string>> {
  const base = `projects/${projectId}`;
  // The category folders plus the project root, which is where uncategorised
  // files land. The ingest only ever writes into these, so no recursion.
  const folders = Array.from(new Set(Object.values(CATEGORY_FOLDERS)));

  const listings = await Promise.all(
    folders.map(async (folder) => {
      const { data, error } = await supabase.storage
        .from('project-files')
        .list(`${base}${folder}`, { limit: 1000 });
      if (error || !data) return [];
      return data;
    })
  );

  const prints = new Set<string>();
  for (const entries of listings) {
    for (const entry of entries) {
      if (!entry.name || entry.name === '.emptyFolderPlaceholder') continue;
      const size = (entry.metadata as { size?: number } | null)?.size;
      if (typeof size !== 'number') continue;
      prints.add(fileFingerprint(originalNameFromStored(entry.name), size));
    }
  }
  return prints;
}

/** Purchase keys already present in the project. */
export async function loadPurchaseKeys(projectId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select('vendor_name, invoice_number, total, invoice_date')
    .eq('project_id', projectId);
  if (error || !data) return new Set();

  const keys = new Set<string>();
  for (const row of data as Array<{
    vendor_name: string | null;
    invoice_number: string | null;
    total: number | null;
    invoice_date: string | null;
  }>) {
    for (const key of purchaseKeys({
      vendorName: row.vendor_name,
      invoiceNumber: row.invoice_number,
      total: row.total,
      date: row.invoice_date,
    })) {
      keys.add(key);
    }
  }
  return keys;
}

/** Task keys (title + room) already present in the project. */
export async function loadTaskKeys(projectId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('tasks')
    .select('title, room_id')
    .eq('project_id', projectId);
  if (error || !data) return new Set();

  const keys = new Set<string>();
  for (const row of data as Array<{ title: string | null; room_id: string | null }>) {
    if (row.title) keys.add(taskKey(row.title, row.room_id));
  }
  return keys;
}

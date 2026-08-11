/**
 * Renaida folder ingest (Fas C) — the network + routing side of "drop a whole
 * project folder and watch it become a draft".
 *
 * Each file is routed by type:
 *   • photos            → OCR'd and parsed TOGETHER (one cheap pass, coarse
 *                         'photo' provenance) — a beginner's pile of snaps.
 *   • documents (PDF/…) → text-extracted, classified, and — when they carry
 *                         work scope (quote/spec/contract) — parsed on their
 *                         own so their rooms/tasks keep that file's provenance.
 *   • text files        → read directly and parsed (own file provenance).
 *   • receipts/invoices → only COUNTED here; they belong to the post-creation
 *                         purchase flow (D1), not the birth draft.
 *   • floor plans       → only counted (open in the planner after creation).
 *
 * The deterministic fold into the draft is the pure mergeParseIntoDraft in
 * renaidaProjectFlow, so this file only owns the network + routing.
 */

import { supabase } from '@/integrations/supabase/client';
import { compressImage } from '@/lib/compressImage';
import type { AIParsedResult } from '@/components/project/overview/planning-wizard/types';
import { parseProjectDescription } from './renaidaProjectIntake';
import { captureDocument } from './agent/documentCapture';
import type { ImportPurchaseAction } from './agent/importPurchaseOrder';
import { mergeParseIntoDraft, type ProjectDraft, type ProvenanceKind } from './renaidaProjectFlow';

/** A renovation folder, not a photo-library dump — bound the LLM cost. */
const MAX_FILES = 40;
/** How many files extract/classify/parse in parallel (rate-limit friendly). */
const CONCURRENCY = 5;

const isImage = (f: File) =>
  (f.type || '').startsWith('image/') || /\.(jpe?g|png|heic|heif|webp|gif|bmp|tiff?)$/i.test(f.name);
const isPdf = (f: File) =>
  (f.type || '').toLowerCase().includes('pdf') || /\.pdf$/i.test(f.name);
const isTextLike = (f: File) =>
  (f.type || '').startsWith('text/') || /\.(txt|md|markdown|csv|rtf)$/i.test(f.name);
const isDoc = (f: File) =>
  /\.(docx?|odt)$/i.test(f.name) ||
  (f.type || '').includes('word') ||
  (f.type || '').includes('officedocument');

function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.slice(result.indexOf(',') + 1)); // strip data:...;base64,
    };
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

/** OCR / text-extract one image or document. Returns '' on any failure. */
async function extractText(file: File): Promise<string> {
  try {
    const img = (file.type || '').startsWith('image/') || isImage(file);
    const prepared = img ? await compressImage(file, { maxDimension: 1600 }) : file;
    const base64 = await fileToBase64(prepared);
    const { data, error } = await supabase.functions.invoke('extract-document-text', {
      body: {
        fileBase64: base64,
        mimeType: (prepared as Blob).type || file.type || (img ? 'image/jpeg' : 'application/pdf'),
        fileName: file.name,
      },
    });
    if (error) return '';
    return ((data as { text?: string } | null)?.text ?? '').trim();
  } catch {
    return '';
  }
}

interface ClassifyResult {
  type: string;
  invoice_amount: number | null;
}

/** Classify already-extracted text (base64-free legacy path — no storage). */
async function classifyText(text: string, fileName: string): Promise<ClassifyResult | null> {
  try {
    const { data, error } = await supabase.functions.invoke('classify-document', {
      body: { text, fileName },
    });
    if (error || !data) return null;
    return data as ClassifyResult;
  } catch {
    return null;
  }
}

/** True when the parse produced something worth folding into the draft. */
const usable = (p: AIParsedResult | null): p is AIParsedResult =>
  !!p && (p.rooms.length > 0 || p.globalWorkTypes.length > 0);

/** A single file's contribution, before the deterministic fold. */
type Contribution =
  | { kind: 'scope'; parsed: AIParsedResult; sourceKind: ProvenanceKind; fileName?: string }
  | { kind: 'receipt'; amount: number | null }
  | { kind: 'purchase'; action: ImportPurchaseAction }
  | { kind: 'floorplan' }
  | { kind: 'ignored' }
  | { kind: 'unreadable' };

/** A document (PDF/DOCX): extract → classify → route by type. */
async function processDocument(
  file: File,
  language: string,
  collectPurchases: boolean
): Promise<Contribution> {
  const text = await extractText(file);
  if (!text) return { kind: 'unreadable' };
  const cls = await classifyText(text, file.name);
  const type = cls?.type ?? 'other';
  if (type === 'receipt' || type === 'invoice') {
    // Inc 3: a logged-in birth fully extracts the receipt → a real PO at
    // creation. Guests can't own POs, so they just get the count (inc 1).
    if (collectPurchases) {
      try {
        const captured = await captureDocument(file);
        if (captured.kind === 'receipt' || captured.kind === 'invoice') {
          return { kind: 'purchase', action: captured.action };
        }
      } catch {
        /* fall through to a plain count */
      }
    }
    return { kind: 'receipt', amount: cls?.invoice_amount ?? null };
  }
  if (type === 'floor_plan') return { kind: 'floorplan' };
  if (type === 'product_image') return { kind: 'ignored' };
  const parsed = await parseProjectDescription(text, language);
  return usable(parsed)
    ? { kind: 'scope', parsed, sourceKind: 'document', fileName: file.name }
    : { kind: 'unreadable' };
}

/** A plain text/markdown file: read → parse as a project description. */
async function processTextFile(file: File, language: string): Promise<Contribution> {
  let text = '';
  try {
    text = (await file.text()).trim();
  } catch {
    text = '';
  }
  if (!text) return { kind: 'unreadable' };
  const parsed = await parseProjectDescription(text, language);
  return usable(parsed)
    ? { kind: 'scope', parsed, sourceKind: 'document', fileName: file.name }
    : { kind: 'unreadable' };
}

/** All photos in the drop: OCR each, parse the combined text once. */
async function processPhotos(files: File[], language: string): Promise<Contribution | null> {
  if (files.length === 0) return null;
  const texts = await Promise.all(files.map(extractText));
  const combined = texts.filter(Boolean).join('\n\n');
  if (!combined) return { kind: 'unreadable' };
  const parsed = await parseProjectDescription(combined, language);
  // Combined parse → coarse 'photo' provenance (no single originating file).
  return usable(parsed) ? { kind: 'scope', parsed, sourceKind: 'photo' } : { kind: 'unreadable' };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

export interface IngestOutcome {
  /** The draft with every scope contribution folded in (provenance-stamped). */
  draft: ProjectDraft;
  /** How many files were dropped (before the MAX_FILES cap). */
  filesSeen: number;
  roomsAdded: number;
  tasksAdded: number;
  /** All receipts/invoices seen (whether counted or fully extracted). */
  receiptCount: number;
  /** Fully-extracted receipts/invoices to turn into POs at creation (inc 3). */
  pendingPurchases: ImportPurchaseAction[];
  floorplanCount: number;
  ignoredCount: number;
  unreadableCount: number;
  /** True when the drop exceeded MAX_FILES and the tail was skipped. */
  truncated: boolean;
}

/**
 * Ingest a dropped project folder into an existing draft. Network calls run in
 * parallel (bounded); the fold into the draft is deterministic and pure.
 * `collectPurchases` fully extracts receipts into pending POs (logged-in birth);
 * guests leave it off and receipts are only counted.
 */
export async function ingestProjectFolder(
  allFiles: File[],
  startDraft: ProjectDraft,
  language: string,
  opts?: { collectPurchases?: boolean }
): Promise<IngestOutcome> {
  const collectPurchases = opts?.collectPurchases ?? false;
  const files = allFiles.slice(0, MAX_FILES);
  const truncated = allFiles.length > files.length;

  const photos = files.filter(isImage);
  const rest = files.filter((f) => !isImage(f));
  const pdfs = rest.filter(isPdf);
  const docs = rest.filter((f) => !isPdf(f) && isDoc(f));
  const texts = rest.filter((f) => !isPdf(f) && !isDoc(f) && isTextLike(f));
  const ignoredUpfront = rest.filter((f) => !isPdf(f) && !isDoc(f) && !isTextLike(f));

  // Phase 1 — extract/classify/parse (network-bound, independent, bounded).
  const thunks: Array<() => Promise<Contribution | null>> = [
    () => processPhotos(photos, language),
    ...pdfs.map((f) => () => processDocument(f, language, collectPurchases)),
    ...docs.map((f) => () => processDocument(f, language, collectPurchases)),
    ...texts.map((f) => () => processTextFile(f, language)),
  ];
  const settled = (await mapLimit(thunks, CONCURRENCY, (t) => t())).filter(
    (c): c is Contribution => c != null
  );

  // Phase 2 — deterministic fold into the draft.
  const roomsBefore = startDraft.rooms.length;
  const tasksBefore = startDraft.tasks.length;
  let draft = startDraft;
  let receiptCount = 0;
  let floorplanCount = 0;
  let ignoredCount = ignoredUpfront.length;
  let unreadableCount = 0;
  const pendingPurchases: ImportPurchaseAction[] = [];

  for (const c of settled) {
    switch (c.kind) {
      case 'scope':
        draft = mergeParseIntoDraft(c.parsed, draft, { sourceKind: c.sourceKind, fileName: c.fileName });
        break;
      case 'receipt':
        receiptCount++;
        break;
      case 'purchase':
        receiptCount++;
        pendingPurchases.push(c.action);
        break;
      case 'floorplan':
        floorplanCount++;
        break;
      case 'ignored':
        ignoredCount++;
        break;
      case 'unreadable':
        unreadableCount++;
        break;
    }
  }

  return {
    draft,
    filesSeen: allFiles.length,
    roomsAdded: draft.rooms.length - roomsBefore,
    tasksAdded: draft.tasks.length - tasksBefore,
    receiptCount,
    pendingPurchases,
    floorplanCount,
    ignoredCount,
    unreadableCount,
    truncated,
  };
}

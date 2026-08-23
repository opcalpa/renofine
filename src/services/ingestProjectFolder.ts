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
import { captureDocument, extractQuoteLines } from './agent/documentCapture';
import type { ImportPurchaseAction } from './agent/importPurchaseOrder';
import { classifyDocument, type DocumentType } from './smartUploadService';
import { rasterizePdfFirstPage } from '@/lib/pdfRaster';
import { analyzeFloorPlanFile, type AIConversionResult } from './aiVisionService';
import {
  mergeParseIntoDraft,
  mergeQuoteLinesIntoDraft,
  type ProjectDraft,
  type ProvenanceKind,
  type QuoteLine,
} from './renaidaProjectFlow';

/**
 * A renovation folder, not a photo-library dump — bound the LLM cost. A whole
 * year's renovation blows past 40, so the cap is 100 and the UI confirms
 * anything over CONFIRM_ABOVE before spending the calls.
 */
const MAX_FILES = 100;
/** Above this many files the caller asks before starting (cost guard). */
export const CONFIRM_ABOVE = 40;
/** Files larger than this are skipped outright (and said out loud). */
const MAX_FILE_BYTES = 20 * 1024 * 1024;
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

const DOCUMENT_TYPES: readonly DocumentType[] = [
  'quote', 'invoice', 'receipt', 'floor_plan',
  'contract', 'specification', 'product_image', 'other',
];

/** The classifier returns a bare string — narrow it before it becomes a path. */
function asDocumentType(raw: string | undefined): DocumentType {
  return DOCUMENT_TYPES.includes(raw as DocumentType) ? (raw as DocumentType) : 'other';
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

/** A floor-plan image analyzed at drop time; shapes materialize at birth. */
export interface PendingSketch {
  fileName: string;
  result: AIConversionResult;
}

/**
 * Skiva 2: one original to file into the project's archive after ingest, with
 * the category the classifier already decided. Extraction and archiving are
 * separate promises to the user — reading a receipt must not consume the file.
 */
export interface ArchiveEntry {
  file: File;
  category: DocumentType;
}

/** A single file's contribution, before the deterministic fold. */
type ContributionKind =
  | { kind: 'scope'; parsed: AIParsedResult; sourceKind: ProvenanceKind; fileName?: string }
  | { kind: 'quoteLines'; lines: QuoteLine[]; fileName?: string }
  | { kind: 'receipt'; amount: number | null }
  | { kind: 'purchase'; action: ImportPurchaseAction }
  | { kind: 'sketch'; sketch: PendingSketch; parsed: AIParsedResult | null }
  | { kind: 'floorplan' }
  | { kind: 'ignored' }
  | { kind: 'unreadable' };

/**
 * `archive` is set by the single-file processors (the classifier knows the
 * category there). Photo buckets are archived by the caller, and fully
 * extracted purchases carry NO archive — importPurchaseOrder already uploads
 * the document as the order's receipt_file_path, and double-filing it would
 * show the same receipt twice.
 */
type Contribution = ContributionKind & {
  archive?: ArchiveEntry;
  /** Pages of a multi-page drawing PDF that were NOT read (never silent). */
  extraPages?: number;
};

/**
 * Fas D: a floor-plan IMAGE → process-floorplan (walls/doors/rooms in mm with
 * an assumed rough scale). Room names fold into the draft right away; the
 * geometry becomes a sketch in the planner at project birth.
 */
async function processFloorPlanImage(file: File): Promise<Contribution> {
  try {
    // Shared dims/ratio/analysis helper — single source with the live-panel
    // floor-plan capture (SP1) in aiVisionService.
    const result = await analyzeFloorPlanFile(file);
    const roomNames = (result.rooms ?? [])
      .map((r) => (r.name ?? '').trim())
      .filter((n) => n && !/^room$/i.test(n));
    const hasGeometry =
      (result.walls?.length ?? 0) > 0 || (result.rooms?.length ?? 0) > 0;
    if (!hasGeometry) return { kind: 'unreadable' };
    // Synthetic parse: the sketch's room names become draft rooms (floorplan
    // provenance). No work types — the gap/scope steps cover those.
    const parsed: AIParsedResult | null = roomNames.length
      ? {
          propertyType: null,
          floors: null,
          totalAreaSqm: null,
          rooms: roomNames.map((name) => ({ nameKey: name, name, suggestedWorkTypes: [] })),
          otherSpaces: [],
          globalWorkTypes: [],
          summary: '',
        }
      : null;
    return {
      kind: 'sketch',
      sketch: { fileName: file.name, result },
      parsed,
      archive: { file, category: 'floor_plan' },
    };
  } catch {
    return { kind: 'unreadable' };
  }
}

/** A document (PDF/DOCX): extract → classify → route by type. */
async function processDocument(
  file: File,
  language: string,
  collectPurchases: boolean,
  isContractor: boolean
): Promise<Contribution> {
  const text = await extractText(file);
  if (!text) return { kind: 'unreadable', archive: { file, category: 'other' } };
  const cls = await classifyText(text, file.name);
  const type = asDocumentType(cls?.type);
  const archive: ArchiveEntry = { file, category: type };
  if (type === 'receipt' || type === 'invoice') {
    // Inc 3: a logged-in birth fully extracts the receipt → a real PO at
    // creation. Guests can't own POs, so they just get the count (inc 1).
    if (collectPurchases) {
      try {
        const captured = await captureDocument(file);
        if (captured.kind === 'receipt' || captured.kind === 'invoice') {
          // No archive stamp: the order owns this file (receipt_file_path).
          return { kind: 'purchase', action: captured.action };
        }
      } catch {
        /* fall through to a plain count */
      }
    }
    return { kind: 'receipt', amount: cls?.invoice_amount ?? null, archive };
  }
  if (type === 'floor_plan') {
    // Skiva 5: a drawing is a drawing whether it arrives as a photo or a PDF.
    // Rasterize page 1 and run the SAME analysis a photographed plan gets.
    if (isPdf(file)) {
      const raster = await rasterizePdfFirstPage(file);
      if (raster) {
        const analyzed = await processFloorPlanImage(raster.file);
        if (analyzed.kind === 'sketch') {
          return {
            ...analyzed,
            // Keep the ORIGINAL pdf in the archive, not the rendered png.
            archive,
            extraPages: raster.pageCount > 1 ? raster.pageCount - 1 : 0,
          };
        }
      }
    }
    return { kind: 'floorplan', archive };
  }
  if (type === 'product_image') return { kind: 'ignored', archive };
  // K4: a contractor's OWN quote → priced line items so the post-birth quote
  // offer (K1) prefills their ACTUAL prices instead of a re-estimate. Homeowners
  // and price-less quotes fall through to the plain scope parse below.
  if (type === 'quote' && isContractor) {
    const lines = await extractQuoteLines(file);
    if (lines.length > 0) return { kind: 'quoteLines', lines, fileName: file.name, archive };
  }
  const parsed = await parseProjectDescription(text, language);
  return usable(parsed)
    ? { kind: 'scope', parsed, sourceKind: 'document', fileName: file.name, archive }
    : { kind: 'unreadable', archive };
}

/** A plain text/markdown file: read → parse as a project description. */
async function processTextFile(file: File, language: string): Promise<Contribution> {
  let text = '';
  try {
    text = (await file.text()).trim();
  } catch {
    text = '';
  }
  const archive: ArchiveEntry = { file, category: 'other' };
  if (!text) return { kind: 'unreadable', archive };
  const parsed = await parseProjectDescription(text, language);
  return usable(parsed)
    ? { kind: 'scope', parsed, sourceKind: 'document', fileName: file.name, archive }
    : { kind: 'unreadable', archive };
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
  /** How many files were dropped (before any cap). */
  filesSeen: number;
  /** How many were actually read (after the size + MAX_FILES filters). */
  filesRead: number;
  roomsAdded: number;
  tasksAdded: number;
  /** All receipts/invoices seen (whether counted or fully extracted). */
  receiptCount: number;
  /** Fully-extracted receipts/invoices to turn into POs at creation (inc 3). */
  pendingPurchases: ImportPurchaseAction[];
  /** Analyzed floor-plan images → sketches in the planner at creation (Fas D). */
  pendingSketches: PendingSketch[];
  /** Floor plans seen but NOT analyzable (e.g. PDF drawings) — counted only. */
  floorplanCount: number;
  ignoredCount: number;
  unreadableCount: number;
  /** True when the drop exceeded MAX_FILES and the tail was skipped. */
  truncated: boolean;
  /** How many files were skipped for being over the size limit. */
  oversizedCount: number;
  /** Unread pages of multi-page drawing PDFs (we read page 1). */
  skippedPlanPages: number;
  /**
   * Skiva 2: every original to file into the project's archive, with the
   * category it was classified as. Excludes fully extracted purchases (the
   * order already owns that file). Best-effort at the call site.
   */
  archiveFiles: ArchiveEntry[];
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
  opts?: {
    collectPurchases?: boolean;
    isContractor?: boolean;
    /** Called as each file finishes — the drop can take minutes. */
    onProgress?: (done: number, total: number) => void;
  }
): Promise<IngestOutcome> {
  const collectPurchases = opts?.collectPurchases ?? false;
  const isContractor = opts?.isContractor ?? false;
  const onProgress = opts?.onProgress;
  // Oversized files never reach the LLM — a 30 MB scan is cost, not signal.
  const sized = allFiles.filter((f) => f.size <= MAX_FILE_BYTES);
  const oversizedCount = allFiles.length - sized.length;
  const files = sized.slice(0, MAX_FILES);
  const truncated = sized.length > files.length;

  const photos = files.filter(isImage);
  const rest = files.filter((f) => !isImage(f));
  const pdfs = rest.filter(isPdf);
  const docs = rest.filter((f) => !isPdf(f) && isDoc(f));
  const texts = rest.filter((f) => !isPdf(f) && !isDoc(f) && isTextLike(f));
  const ignoredUpfront = rest.filter((f) => !isPdf(f) && !isDoc(f) && !isTextLike(f));

  // Phase 0 (Fas D) — cheap low-res classification of images so floor-plan
  // photos route to process-floorplan instead of being OCR-mangled as text.
  // Costs one mini-vision call per photo; fail-open to the OCR bucket.
  let planImages: File[] = [];
  let ocrImages: File[] = photos;
  if (photos.length > 0) {
    const kinds = await mapLimit(photos, CONCURRENCY, async (f) => {
      try {
        return (await classifyDocument(f)).type;
      } catch {
        return 'other';
      }
    });
    planImages = photos.filter((_, i) => kinds[i] === 'floor_plan');
    ocrImages = photos.filter((_, i) => kinds[i] !== 'floor_plan');
  }

  // Phase 1 — extract/classify/parse (network-bound, independent, bounded).
  const thunks: Array<() => Promise<Contribution | null>> = [
    () => processPhotos(ocrImages, language),
    ...planImages.map((f) => () => processFloorPlanImage(f)),
    ...pdfs.map((f) => () => processDocument(f, language, collectPurchases, isContractor)),
    ...docs.map((f) => () => processDocument(f, language, collectPurchases, isContractor)),
    ...texts.map((f) => () => processTextFile(f, language)),
  ];
  // Progress counts the classify pass too — it is real waiting for the user.
  const progressTotal = thunks.length + photos.length;
  let progressDone = photos.length;
  onProgress?.(progressDone, progressTotal);
  const settled = (
    await mapLimit(thunks, CONCURRENCY, async (t) => {
      const r = await t();
      onProgress?.(++progressDone, progressTotal);
      return r;
    })
  ).filter((c): c is Contribution => c != null);

  // Phase 2 — deterministic fold into the draft.
  const roomsBefore = startDraft.rooms.length;
  const tasksBefore = startDraft.tasks.length;
  let draft = startDraft;
  let receiptCount = 0;
  let floorplanCount = 0;
  let ignoredCount = ignoredUpfront.length;
  let unreadableCount = 0;
  const pendingPurchases: ImportPurchaseAction[] = [];
  const pendingSketches: PendingSketch[] = [];
  // Photos are archived by bucket (their category is known without a classify
  // round-trip); documents carry their own stamp on the contribution.
  const archiveFiles: ArchiveEntry[] = [
    ...ocrImages.map((file) => ({ file, category: 'product_image' as DocumentType })),
    ...ignoredUpfront.map((file) => ({ file, category: 'other' as DocumentType })),
  ];

  let skippedPlanPages = 0;
  for (const c of settled) {
    if (c.archive) archiveFiles.push(c.archive);
    if (c.extraPages) skippedPlanPages += c.extraPages;
    switch (c.kind) {
      case 'scope':
        draft = mergeParseIntoDraft(c.parsed, draft, { sourceKind: c.sourceKind, fileName: c.fileName });
        break;
      case 'quoteLines':
        draft = mergeQuoteLinesIntoDraft(c.lines, draft, { fileName: c.fileName });
        break;
      case 'receipt':
        receiptCount++;
        break;
      case 'purchase':
        receiptCount++;
        pendingPurchases.push(c.action);
        break;
      case 'sketch':
        pendingSketches.push(c.sketch);
        if (c.parsed) {
          draft = mergeParseIntoDraft(c.parsed, draft, {
            sourceKind: 'floorplan',
            fileName: c.sketch.fileName,
          });
        }
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
    filesRead: files.length,
    roomsAdded: draft.rooms.length - roomsBefore,
    tasksAdded: draft.tasks.length - tasksBefore,
    receiptCount,
    pendingPurchases,
    pendingSketches,
    floorplanCount,
    ignoredCount,
    unreadableCount,
    truncated,
    oversizedCount,
    skippedPlanPages,
    archiveFiles,
  };
}

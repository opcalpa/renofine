/**
 * Renaida folder ingest (Fas C) — the network + routing side of "drop a whole
 * project folder and watch it become a draft".
 *
 * Each file is routed by type:
 *   • photos            → OCR'd and parsed TOGETHER (one cheap pass, coarse
 *                         'photo' provenance) — a beginner's pile of snaps.
 *   • documents (PDF/…) → text-extracted, then classified AND read for work
 *                         scope in ONE call (quote/spec/contract only), so
 *                         their rooms/tasks keep that file's provenance.
 *   • text files        → read directly and parsed (own file provenance).
 *   • receipts/invoices → fully extracted via the same captureDocument path
 *                         the camera uses (when the caller collects purchases;
 *                         guests just get the count). Photographed AND PDF —
 *                         a receipt is a receipt whichever way it arrives.
 *   • floor plans       → only counted (open in the planner after creation).
 *
 * The deterministic fold into the draft is the pure mergeParseIntoDraft in
 * renaidaProjectFlow, so this file only owns the network + routing.
 *
 * INERT BY DEFAULT (P4).
 * Unrelated documents are the normal case, not an edge case — a renovation
 * folder holds a holiday photo, a CV, a bank statement, and the person dropping
 * it does not sort first. So: a file this engine does not recognise WITH
 * CONFIDENCE is stored and never acted on. It adds no room, no task, no
 * purchase, no date, no status — it lands in the project's files as `other` and
 * says so out loud. 'other' is an honest answer here, not a failure, and the
 * summary always names what went unread rather than quietly dropping it.
 *
 * Only document classes that actually carry work scope (quote, contract,
 * specification) are parsed into the draft. Everything else is filed.
 * The home's own papers — köpekontrakt, besiktningsprotokoll — are recognised
 * locally and kept out of the project entirely (see `propertyDocuments`).
 */

import { supabase } from '@/integrations/supabase/client';
import { compressImage } from '@/lib/compressImage';
import type { AIParsedResult } from '@/components/project/overview/planning-wizard/types';
import { parseProjectDescription } from './renaidaProjectIntake';
import { captureDocument, extractQuoteLines } from './agent/documentCapture';
import type { ImportPurchaseAction } from './agent/importPurchaseOrder';
import {
  classifyDocument,
  ClassifyError,
  type DocumentType,
  type DocumentPropertyAddress,
  type AddressSource,
} from './smartUploadService';
import { parseAddress } from '@/lib/addressMatch';
import {
  guessCategory,
  wasRecognised,
  type PropertyDocumentCategory,
} from './propertyDocumentService';
import { extractPdfTextLocally, rasterizePdfFirstPage } from '@/lib/pdfRaster';
import { analyzeFloorPlanFile, type AIConversionResult } from './aiVisionService';
import {
  mergeParseIntoDraft,
  mergeQuoteLinesIntoDraft,
  type ProjectDraft,
  type ProvenanceKind,
  type QuoteLine,
} from './renaidaProjectFlow';
import { fileFingerprint } from '@/lib/importKeys';
import {
  makeModelCallLog,
  noteModelCall,
  type ModelCallLog,
} from '@/lib/modelCalls';

/**
 * A renovation folder, not a photo-library dump — bound the LLM cost. A whole
 * year's renovation blows past 40, so the cap is 100 and the UI confirms
 * anything over CONFIRM_ABOVE before spending the calls.
 */
const MAX_FILES = 100;
/**
 * Guests get a tighter cap. Not a product limit — an abuse one: a guest drop
 * reaches classify/extract on the publishable anon key, and the server-side
 * anon tier is sized for exactly this many files (see
 * supabase/functions/_shared/rateLimit.ts). A drop that would blow through the
 * limit halfway is worse than one that says up front what it will read.
 */
const MAX_FILES_GUEST = 20;
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

/**
 * OCR / text-extract one image or document. Returns '' on any failure.
 *
 * Exported as `extractFileText` so the home-papers drop reads a document the
 * exact same way this pipeline does — one extraction engine, not two that
 * drift.
 */
export async function extractFileText(file: File): Promise<string> {
  return extractText(file);
}

async function extractText(file: File, calls?: ModelCallLog): Promise<string> {
  try {
    // A PDF with a text layer needs no model at all. Most quotes and invoices
    // have one, so this removes roughly a third of the calls in a document
    // folder — and it is faster than the round trip it replaces.
    if (isPdf(file)) {
      const local = await extractPdfTextLocally(file);
      if (local) return local;
    }
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
    noteModelCall(calls, 'extract-document-text');
    if (error) return '';
    return ((data as { text?: string } | null)?.text ?? '').trim();
  } catch {
    return '';
  }
}

interface ClassifyResult {
  type: string;
  invoice_amount: number | null;
  property_address?: DocumentPropertyAddress | null;
  address_source?: AddressSource | null;
  /**
   * The work scope, when the same call was asked for it. Null for every class
   * that may not shape a project — the server decides that, not this file.
   */
  scope?: AIParsedResult | null;
  /** The document was longer than the reader could take — it read the start. */
  text_truncated?: boolean;
}

/**
 * P1: an address one document said the home has. Never applied — the birth
 * flow turns the best one into a QUESTION ("Jag såg Storgatan 5 i
 * Köpekontrakt.pdf — stämmer det?"). `fileName` is the provenance shown
 * beside it, so the person can judge the source and not just the answer.
 */
export interface AddressCandidate {
  street: string;
  postalCode: string | null;
  city: string | null;
  source: AddressSource;
  fileName: string;
  /** Higher wins. Set from the source × document type table in rankAddress. */
  rank: number;
}

const DOCUMENT_TYPES: readonly DocumentType[] = [
  'quote', 'invoice', 'receipt', 'floor_plan',
  'contract', 'specification', 'product_image', 'other',
];

/** The classifier returns a bare string — narrow it before it becomes a path. */
function asDocumentType(raw: string | undefined): DocumentType {
  return DOCUMENT_TYPES.includes(raw as DocumentType) ? (raw as DocumentType) : 'other';
}

/**
 * Classify already-extracted text (base64-free legacy path — no storage).
 *
 * `scopeLanguage` asks the SAME call to also read out the work scope. Both
 * questions are about the same text — "what is this?" and "what does it say?" —
 * and asking them separately meant every quote, contract and specification in a
 * dropped folder paid for two round trips over identical input. The server only
 * answers the second question for classes that may carry scope, so an unplaced
 * document still comes back with nothing to act on.
 */
async function classifyText(
  text: string,
  fileName: string,
  scopeLanguage?: string,
  calls?: ModelCallLog
): Promise<ClassifyResult | null> {
  try {
    const { data, error } = await supabase.functions.invoke('classify-document', {
      body: { text, fileName, ...(scopeLanguage ? { scope: { language: scopeLanguage } } : {}) },
    });
    noteModelCall(calls, 'classify-document');
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

/**
 * A file that reads as one of the HOME's papers rather than the renovation's:
 * a köpekontrakt, a besiktningsprotokoll, a frågelista. Recognised locally
 * (file name, then the opening of its text — no model), and deliberately kept
 * out of the project: it must add nothing to the draft, and it is filed once,
 * never in two places.
 */
export interface PropertyDocCandidate {
  file: File;
  category: PropertyDocumentCategory;
}

/**
 * Document classes that may shape the project.
 *
 * Anything outside this set is filed and left alone — the difference between
 * "the app read my quote" and "the app invented three rooms out of my CV".
 */
const SCOPE_BEARING: ReadonlySet<DocumentType> = new Set<DocumentType>([
  'quote',
  'contract',
  'specification',
]);

/** A single file's contribution, before the deterministic fold. */
type ContributionKind =
  | { kind: 'scope'; parsed: AIParsedResult; sourceKind: ProvenanceKind; fileName?: string }
  | { kind: 'quoteLines'; lines: QuoteLine[]; fileName?: string }
  | { kind: 'receipt'; amount: number | null }
  | { kind: 'purchase'; action: ImportPurchaseAction }
  | { kind: 'sketch'; sketch: PendingSketch; parsed: AIParsedResult | null }
  | { kind: 'floorplan' }
  | { kind: 'propertyDoc'; candidate: PropertyDocCandidate }
  /** Read fine, recognised as nothing. Stored, never acted on. */
  | { kind: 'notUnderstood' }
  | { kind: 'ignored' }
  | { kind: 'unreadable' };

/**
 * `archive` is set by the single-file processors (the classifier knows the
 * category there). Photo buckets are archived by the caller, and fully
 * extracted purchases carry NO archive — importPurchaseOrder already uploads
 * the document as the order's receipt_file_path, and double-filing it would
 * show the same receipt twice.
 */
export type Contribution = ContributionKind & {
  archive?: ArchiveEntry;
  /** Pages of a multi-page drawing PDF that were NOT read (never silent). */
  extraPages?: number;
  /**
   * The document was too long to read whole, so its rooms and tasks describe
   * the beginning of it. Carried up so the summary can say so — a missing room
   * must never be indistinguishable from a room that was not there.
   */
  truncatedText?: boolean;
  /** P1: what this one document said the home's address is, if anything. */
  address?: AddressCandidate;
};

/**
 * How far to trust an address, by where it came from (plan §1.1).
 *
 *   köpekontrakt / objektsbeskrivning / besiktning → the OBJECT's address: 3
 *   quote / contract / spec with an "Objekt:" field → the work site:        2
 *   invoice with such a field                        → the work site:        2
 *   receipt                                          → never (enforced twice:
 *                                                      here and in the edge fn)
 */
function rankAddress(type: DocumentType, source: AddressSource): number {
  if (type === 'receipt') return 0;
  if (source === 'property_document') return 3;
  return 2;
}

function toCandidate(
  cls: ClassifyResult | null,
  type: DocumentType,
  fileName: string
): AddressCandidate | undefined {
  const addr = cls?.property_address;
  const source = cls?.address_source;
  if (!addr?.street || !source) return undefined;
  const rank = rankAddress(type, source);
  if (rank === 0) return undefined;
  return {
    street: addr.street,
    postalCode: addr.postal_code ?? null,
    city: addr.city ?? null,
    source,
    fileName,
    rank,
  };
}

/**
 * Pick the address to ASK about. Highest rank wins; among equals, the street
 * most documents agree on; among those, the first seen. The loser candidates
 * are not discarded silently — the caller gets the count so the question can
 * say "två dokument säger olika".
 */
export function chooseSuggestedAddress(
  candidates: AddressCandidate[]
): { best: AddressCandidate; agreeing: number; disagreeing: number } | null {
  if (candidates.length === 0) return null;
  const top = Math.max(...candidates.map((c) => c.rank));
  const contenders = candidates.filter((c) => c.rank === top);
  const votes = new Map<string, AddressCandidate[]>();
  for (const c of contenders) {
    const key = parseAddress(c.street).normalized;
    votes.set(key, [...(votes.get(key) ?? []), c]);
  }
  let bestGroup: AddressCandidate[] = [];
  for (const group of votes.values()) {
    if (group.length > bestGroup.length) bestGroup = group;
  }
  // Prefer the member of the winning group that knows the most (postal/city).
  const best = [...bestGroup].sort(
    (a, b) => Number(!!b.postalCode) + Number(!!b.city) - (Number(!!a.postalCode) + Number(!!a.city))
  )[0];
  const agreeingKey = parseAddress(best.street).normalized;
  const disagreeing = candidates.filter((c) => parseAddress(c.street).normalized !== agreeingKey).length;
  return { best, agreeing: bestGroup.length, disagreeing };
}

/**
 * Fas D: a floor-plan IMAGE → process-floorplan (walls/doors/rooms in mm with
 * an assumed rough scale). Room names fold into the draft right away; the
 * geometry becomes a sketch in the planner at project birth.
 */
async function processFloorPlanImage(file: File, calls?: ModelCallLog): Promise<Contribution> {
  try {
    // Shared dims/ratio/analysis helper — single source with the live-panel
    // floor-plan capture (SP1) in aiVisionService.
    const result = await analyzeFloorPlanFile(file);
    noteModelCall(calls, 'process-floorplan');
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
  isContractor: boolean,
  suggestAddress: boolean,
  calls?: ModelCallLog
): Promise<Contribution> {
  const text = await extractText(file, calls);
  if (!text) return { kind: 'unreadable', archive: { file, category: 'other' } };

  // The home's own papers leave the project pipeline here, before a single
  // model call: a köpekontrakt has nothing to say about a renovation, and
  // running it through the scope parser is how the seller's kitchen becomes
  // one of your rooms. Local check, and it saves the classify round-trip.
  const homePaper = guessCategory(file.name, text);
  if (wasRecognised(homePaper)) {
    // P1: at a project's BIRTH the address is still unknown, and a köpekontrakt
    // is the one document that states it with authority — worth the one call
    // it costs. Into an existing project the address is known, so the promise
    // of "no model call" holds there.
    const address = suggestAddress
      ? toCandidate(await classifyText(text, file.name, undefined, calls), 'contract', file.name)
      : undefined;
    // No `archive` stamp — a document belongs in one place, and this one's
    // place is the address (or the project's files, if the caller keeps it).
    return { kind: 'propertyDoc', candidate: { file, category: homePaper }, address };
  }

  // ONE call for both questions: what is this document, and what work does it
  // describe. The scope comes back only for classes that may carry it.
  const cls = await classifyText(text, file.name, language, calls);
  const type = asDocumentType(cls?.type);
  const archive: ArchiveEntry = { file, category: type };
  const address = suggestAddress ? toCandidate(cls, type, file.name) : undefined;
  if (type === 'receipt' || type === 'invoice') {
    // Inc 3: a logged-in birth fully extracts the receipt → a real PO at
    // creation. Guests can't own POs, so they just get the count (inc 1).
    if (collectPurchases) {
      try {
        const captured = await captureDocument(file);
        noteModelCall(calls, 'process-document-v2');
        if (captured.kind === 'receipt' || captured.kind === 'invoice') {
          // No archive stamp: the order owns this file (receipt_file_path).
          return { kind: 'purchase', action: captured.action, address };
        }
      } catch {
        /* fall through to a plain count */
      }
    }
    return { kind: 'receipt', amount: cls?.invoice_amount ?? null, archive, address };
  }
  if (type === 'floor_plan') {
    // Skiva 5: a drawing is a drawing whether it arrives as a photo or a PDF.
    // Rasterize page 1 and run the SAME analysis a photographed plan gets.
    if (isPdf(file)) {
      const raster = await rasterizePdfFirstPage(file);
      if (raster) {
        const analyzed = await processFloorPlanImage(raster.file, calls);
        if (analyzed.kind === 'sketch') {
          return {
            ...analyzed,
            // Keep the ORIGINAL pdf in the archive, not the rendered png.
            archive,
            extraPages: raster.pageCount > 1 ? raster.pageCount - 1 : 0,
            address,
          };
        }
      }
    }
    return { kind: 'floorplan', archive, address };
  }
  if (type === 'product_image') return { kind: 'ignored', archive, address };
  // Inert by default: everything the classifier could not place — the CV, the
  // bank statement, the manual for a fridge — is stored and left alone. It used
  // to be handed to the scope parser, which is a machine whose whole job is to
  // find rooms and work in whatever text you give it.
  if (!SCOPE_BEARING.has(type)) return { kind: 'notUnderstood', archive, address };
  // K4: a contractor's OWN quote → priced line items so the post-birth quote
  // offer (K1) prefills their ACTUAL prices instead of a re-estimate. Homeowners
  // and price-less quotes fall through to the plain scope parse below.
  if (type === 'quote' && isContractor) {
    const lines = await extractQuoteLines(file);
    noteModelCall(calls, 'process-document-v2');
    if (lines.length > 0) return { kind: 'quoteLines', lines, fileName: file.name, archive, address };
  }
  // The scope already came back with the classification. A scope-bearing
  // document that yielded nothing is "I did not understand this" — exactly what
  // an empty parse meant before, and one call cheaper to find out.
  const parsed = cls?.scope ?? null;
  const truncatedText = cls?.text_truncated || undefined;
  return usable(parsed)
    ? {
        kind: 'scope',
        parsed,
        sourceKind: 'document',
        fileName: file.name,
        archive,
        address,
        truncatedText,
      }
    : { kind: 'notUnderstood', archive, address, truncatedText };
}

/** A plain text/markdown file: read → parse as a project description. */
async function processTextFile(
  file: File,
  language: string,
  calls?: ModelCallLog
): Promise<Contribution> {
  let text = '';
  try {
    text = (await file.text()).trim();
  } catch {
    text = '';
  }
  const archive: ArchiveEntry = { file, category: 'other' };
  if (!text) return { kind: 'unreadable', archive };
  const homePaper = guessCategory(file.name, text);
  if (wasRecognised(homePaper)) {
    return { kind: 'propertyDoc', candidate: { file, category: homePaper } };
  }
  // A text file is something a person wrote or exported on purpose, so it is
  // still parsed — but a parse that finds nothing is "I did not understand
  // this", not "I could not read it".
  const parsed = await parseProjectDescription(text, language);
  noteModelCall(calls, 'parse-renovation-description');
  return usable(parsed)
    ? { kind: 'scope', parsed, sourceKind: 'document', fileName: file.name, archive }
    : { kind: 'notUnderstood', archive };
}

/** All photos in the drop: OCR each, parse the combined text once. */
async function processPhotos(
  files: File[],
  language: string,
  calls?: ModelCallLog
): Promise<Contribution | null> {
  if (files.length === 0) return null;
  const texts = await Promise.all(files.map((f) => extractText(f, calls)));
  const combined = texts.filter(Boolean).join('\n\n');
  if (!combined) return { kind: 'unreadable' };
  const parsed = await parseProjectDescription(combined, language);
  noteModelCall(calls, 'parse-renovation-description');
  // Combined parse → coarse 'photo' provenance (no single originating file).
  return usable(parsed) ? { kind: 'scope', parsed, sourceKind: 'photo' } : { kind: 'unreadable' };
}

/**
 * A photographed receipt/invoice: the same capture path the camera (D1) and
 * the PDF document route use. On success the order owns the file
 * (receipt_file_path via importPurchaseOrder), so no archive stamp — archiving
 * it too would show the same receipt twice. When capture fails, or the caller
 * does not collect purchases (guests), the photo is counted and filed under
 * its OWN category (/Kvitton, /Fakturor) — never as a product image.
 */
async function processReceiptPhoto(
  file: File,
  type: DocumentType,
  collectPurchases: boolean,
  calls?: ModelCallLog
): Promise<Contribution> {
  const archive: ArchiveEntry = { file, category: type };
  if (collectPurchases) {
    try {
      const captured = await captureDocument(file);
      noteModelCall(calls, 'process-document-v2');
      if (captured.kind === 'receipt' || captured.kind === 'invoice') {
        return { kind: 'purchase', action: captured.action };
      }
    } catch {
      /* fall through to a plain count */
    }
  }
  return { kind: 'receipt', amount: null, archive };
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

/**
 * What the reader is doing right now. A 100-file folder spends real minutes
 * here, and the phases cost very different amounts of time — leaving any of
 * them silent is what made the drop look frozen.
 */
export type IngestPhase =
  /** Cheap vision pass that sorts photos (floor plan? quote? neither?). */
  | 'classify'
  /** Extract + parse each document. The long one. */
  | 'read'
  /** Uploading the originals into Files. Runs AFTER the reading. */
  | 'archive';

export interface IngestProgress {
  phase: IngestPhase;
  done: number;
  total: number;
  /** The file being handled, when the phase works one at a time. */
  fileName?: string;
}

export interface IngestOutcome {
  /** The draft with every scope contribution folded in (provenance-stamped). */
  draft: ProjectDraft;
  /** How many files were dropped (before any cap). */
  filesSeen: number;
  /** How many were actually read (after the size + MAX_FILES filters). */
  filesRead: number;
  /**
   * Photos whose classification call failed outright — throttled upstream or
   * an outage, NOT "we looked and found nothing". Surfaced so the summary can
   * offer a retry instead of reporting a temporary failure as a conclusion.
   */
  classifyFailures: number;
  /**
   * The AI account ran out of credits mid-drop. Distinct from throttling on
   * purpose: it shares HTTP 429 but nothing else, and "try again in a moment"
   * is advice that cannot work.
   */
  quotaExhausted: boolean;
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
  /**
   * Files that were read fine and recognised as nothing (P4). They are filed
   * as `other` and touch nothing in the project — the count exists so the
   * summary can say so instead of leaving the person to notice.
   */
  notUnderstoodCount: number;
  /** Photos filed without being interpreted (no confident document class). */
  photosFiledCount: number;
  /**
   * Files that read as the HOME's papers, not the renovation's. Never folded
   * into the draft; the caller decides where they land (the address, or the
   * project's files with a note that they can be moved).
   */
  propertyDocuments: PropertyDocCandidate[];
  /**
   * Files recognised as already imported and skipped without being read.
   * Named so the review page can say which, instead of a silent difference.
   */
  alreadyImportedNames: string[];
  /** True when the drop exceeded MAX_FILES and the tail was skipped. */
  truncated: boolean;
  /** How many files were skipped for being over the size limit. */
  oversizedCount: number;
  /** Unread pages of multi-page drawing PDFs (we read page 1). */
  skippedPlanPages: number;
  /**
   * Documents so long that only the beginning was read for work scope. Named
   * rather than silent: rooms missing because a file was cut off must not look
   * like rooms the file never mentioned.
   */
  truncatedDocCount: number;
  /**
   * Skiva 2: every original to file into the project's archive, with the
   * category it was classified as. Excludes fully extracted purchases (the
   * order already owns that file). Best-effort at the call site.
   */
  archiveFiles: ArchiveEntry[];
  /**
   * P1: the address the documents suggest the home has — a QUESTION for the
   * birth flow, never an answer. Null unless `suggestAddress` was on and at
   * least one document named an object address.
   */
  suggestedAddress: AddressCandidate | null;
  /** How many documents named a DIFFERENT street than the suggestion. */
  addressDisagreement: number;
  /**
   * What this drop actually cost in model calls. The saving from skipping a
   * file already imported shows up here as an absence — which is the only
   * honest way to see it.
   */
  modelCalls: ModelCallLog;
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
    onProgress?: (progress: IngestProgress) => void;
    /**
     * P1: collect object addresses from the documents (birth flow only — an
     * existing project already knows where it is). Costs one classify call for
     * each home paper that would otherwise be filed without a model call.
     */
    suggestAddress?: boolean;
    /**
     * Fingerprints (name + byte size) of files this project already holds.
     * Matching files are dropped BEFORE any model call — re-dropping a folder
     * to add three files should cost three files, not a hundred.
     */
    alreadyImported?: Set<string>;
    /** Guests are capped harder — see MAX_FILES_GUEST. */
    isGuest?: boolean;
    /**
     * Fired the moment one file's reading lands, so the caller can journal it
     * (see `importJournal`). A drop takes minutes and the tab can die inside
     * that window; without this, every call paid for before the crash is lost.
     * Only fired for per-file work — the combined photo pass covers a batch.
     */
    onFileRead?: (fileName: string, contribution: Contribution) => void;
    /**
     * Results recovered from an interrupted run, keyed by file name. Their
     * files are skipped (no model call) and their contributions folded in as
     * if they had just been read — this is what makes re-dropping the same
     * folder a RESUME rather than a re-read.
     */
    resumeContributions?: Map<string, Contribution>;
  }
): Promise<IngestOutcome> {
  const calls = makeModelCallLog();
  const collectPurchases = opts?.collectPurchases ?? false;
  const isContractor = opts?.isContractor ?? false;
  const suggestAddress = opts?.suggestAddress ?? false;
  const onProgress = opts?.onProgress;
  // Oversized files never reach the LLM — a 30 MB scan is cost, not signal.
  const sized = allFiles.filter((f) => f.size <= MAX_FILE_BYTES);
  const oversizedCount = allFiles.length - sized.length;
  const fileCap = opts?.isGuest ? MAX_FILES_GUEST : MAX_FILES;
  const capped = sized.slice(0, fileCap);
  const truncated = sized.length > capped.length;

  // Skip what the project already has. This is the single biggest saving in
  // the whole pipeline: a skipped file costs nothing at all, where every other
  // optimisation only makes a call cheaper.
  const alreadyImported = opts?.alreadyImported;
  const skipped: File[] = [];
  const afterImportSkip = alreadyImported
    ? capped.filter((f) => {
        if (!alreadyImported.has(fileFingerprint(f.name, f.size))) return true;
        skipped.push(f);
        return false;
      })
    : capped;

  // Resume: a file whose result is already in the journal is not read again,
  // but its File IS needed — the archive entry carries it, and the original
  // handle died with the page that read it. Re-attaching from this drop is why
  // the resume is a comparison against the same folder rather than a promise
  // that the browser cannot keep.
  const resume = opts?.resumeContributions;
  const resumed: Contribution[] = [];
  const files = resume?.size
    ? afterImportSkip.filter((f) => {
        const c = resume.get(f.name);
        if (!c) return true;
        resumed.push(c.archive ? { ...c, archive: { ...c.archive, file: f } } : c);
        return false;
      })
    : afterImportSkip;

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
  // Photos whose class says they carry readable scope (a photographed quote).
  let ocrImages: File[] = [];
  // Photographed receipts/invoices: Carl's 112-receipt drop (2026-09-01)
  // proved these are the NORMAL case for a folder of phone photos, and filing
  // them as product images threw the whole point of the drop away. They take
  // the same captureDocument path a PDF receipt does.
  let receiptImages: File[] = [];
  const receiptKinds = new Map<File, DocumentType>();
  // The rest of the pile — room snaps, the holiday album. Filed, never
  // interpreted: OCR over a photo the classifier could not place is exactly
  // the noise that turns into invented rooms.
  let inertImages: File[] = photos;
  /** Photos whose classification call FAILED (throttling, outage) — not a verdict. */
  let classifyFailures = 0;
  /** The AI account is empty. Retrying cannot help; only topping up can. */
  let quotaExhausted = false;
  if (photos.length > 0) {
    let classified = 0;
    onProgress?.({ phase: 'classify', done: 0, total: photos.length });
    const kinds = await mapLimit(photos, CONCURRENCY, async (f) => {
      try {
        const kind = asDocumentType((await classifyDocument(f)).type);
        noteModelCall(calls, 'classify-document');
        return kind;
      } catch (e) {
        // Falling open to 'other' is right — a photo we could not place must
        // not be guessed at. But it is NOT the same as a photo we read and
        // found nothing in, and conflating the two is how Carl's 112 receipts
        // (2026-09-01) came back as "100 bilder sparade utan att tolkas" when
        // the real story was that OpenAI had throttled every single call.
        classifyFailures += 1;
        if (e instanceof ClassifyError && e.code === 'quota_exhausted') quotaExhausted = true;
        console.error('classify failed for', f.name, e);
        return 'other' as DocumentType;
      } finally {
        classified += 1;
        onProgress?.({ phase: 'classify', done: classified, total: photos.length, fileName: f.name });
      }
    });
    planImages = photos.filter((_, i) => kinds[i] === 'floor_plan');
    ocrImages = photos.filter((_, i) => SCOPE_BEARING.has(kinds[i]));
    receiptImages = photos.filter((_, i) => kinds[i] === 'receipt' || kinds[i] === 'invoice');
    receiptImages.forEach((f) => receiptKinds.set(f, kinds[photos.indexOf(f)]));
    inertImages = photos.filter(
      (_, i) =>
        kinds[i] !== 'floor_plan' &&
        kinds[i] !== 'receipt' &&
        kinds[i] !== 'invoice' &&
        !SCOPE_BEARING.has(kinds[i])
    );
  }

  // Phase 1 — extract/classify/parse (network-bound, independent, bounded).
  // Each unit carries the file it speaks for, so a landed result can be
  // journaled under a name the next drop can compare against. The combined
  // photo pass speaks for a batch, so it carries no name and is not journaled.
  const thunks: Array<{ name?: string; run: () => Promise<Contribution | null> }> = [
    { run: () => processPhotos(ocrImages, language, calls) },
    ...receiptImages.map((f) => ({
      name: f.name,
      run: () => processReceiptPhoto(f, receiptKinds.get(f) ?? 'receipt', collectPurchases, calls),
    })),
    ...planImages.map((f) => ({ name: f.name, run: () => processFloorPlanImage(f, calls) })),
    ...pdfs.map((f) => ({
      name: f.name,
      run: () => processDocument(f, language, collectPurchases, isContractor, suggestAddress, calls),
    })),
    ...docs.map((f) => ({
      name: f.name,
      run: () => processDocument(f, language, collectPurchases, isContractor, suggestAddress, calls),
    })),
    ...texts.map((f) => ({ name: f.name, run: () => processTextFile(f, language, calls) })),
  ];
  // Progress is counted in FILES, not thunks — "fil 3 av 12" has to match the
  // folder the user dropped. The photo thunk covers a whole batch, so it
  // contributes all of its images at once when it lands.
  const weights = [
    ocrImages.length, // the combined photo pass
    ...receiptImages.map(() => 1),
    ...planImages.map(() => 1),
    ...pdfs.map(() => 1),
    ...docs.map(() => 1),
    ...texts.map(() => 1),
  ];
  // Resumed files count as done from the start — "62 av 112" has to mean what
  // the person sees, and they are not going to be read again.
  const progressTotal = files.length + resumed.length;
  let progressDone = ignoredUpfront.length + inertImages.length + resumed.length;
  onProgress?.({ phase: 'read', done: progressDone, total: progressTotal });
  const fresh = (
    await mapLimit(thunks.map((t, i) => ({ t, i })), CONCURRENCY, async ({ t, i }) => {
      const r = await t.run();
      // Journal BEFORE reporting progress: the write is what makes this file's
      // model call survive the tab, and progress is only cosmetic.
      if (r && t.name) opts?.onFileRead?.(t.name, r);
      progressDone = Math.min(progressTotal, progressDone + weights[i]);
      onProgress?.({ phase: 'read', done: progressDone, total: progressTotal });
      return r;
    })
  ).filter((c): c is Contribution => c != null);
  // Recovered results fold exactly like fresh ones — same shapes, same order
  // of operations, so a resumed import cannot differ from an uninterrupted one.
  const settled = [...resumed, ...fresh];

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
    ...inertImages.map((file) => ({ file, category: 'product_image' as DocumentType })),
    ...ignoredUpfront.map((file) => ({ file, category: 'other' as DocumentType })),
  ];
  let notUnderstoodCount = 0;
  const propertyDocuments: PropertyDocCandidate[] = [];
  const addressCandidates: AddressCandidate[] = [];

  let skippedPlanPages = 0;
  let truncatedDocCount = 0;
  for (const c of settled) {
    if (c.archive) archiveFiles.push(c.archive);
    if (c.extraPages) skippedPlanPages += c.extraPages;
    if (c.truncatedText) truncatedDocCount += 1;
    if (c.address) addressCandidates.push(c.address);
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
      case 'propertyDoc':
        propertyDocuments.push(c.candidate);
        break;
      case 'notUnderstood':
        notUnderstoodCount++;
        break;
      case 'ignored':
        ignoredCount++;
        break;
      case 'unreadable':
        unreadableCount++;
        break;
    }
  }

  const chosen = chooseSuggestedAddress(addressCandidates);

  return {
    draft,
    filesSeen: allFiles.length,
    // Resumed files WERE read — just not in this run. Counting them keeps the
    // summary honest about how much of the folder the project actually holds.
    filesRead: files.length + resumed.length,
    classifyFailures,
    quotaExhausted,
    alreadyImportedNames: skipped.map((f) => f.name),
    roomsAdded: draft.rooms.length - roomsBefore,
    tasksAdded: draft.tasks.length - tasksBefore,
    receiptCount,
    pendingPurchases,
    pendingSketches,
    floorplanCount,
    ignoredCount,
    unreadableCount,
    notUnderstoodCount,
    photosFiledCount: inertImages.length,
    propertyDocuments,
    suggestedAddress: chosen?.best ?? null,
    addressDisagreement: chosen?.disagreeing ?? 0,
    truncated,
    oversizedCount,
    skippedPlanPages,
    truncatedDocCount,
    archiveFiles,
    modelCalls: calls,
  };
}

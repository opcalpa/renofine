import { supabase } from "@/integrations/supabase/client";
import type { DocumentSignals } from "./documentTypeRanking";
import { getFileUrl } from "@/lib/fileUrl";
import { pathInFolder } from "@/lib/projectFolders";

export { folderOfPath, importFolderName } from "@/lib/projectFolders";

// --- Classification types ---

export type DocumentType =
  // Ekonomi — driver siffror i appen
  | "quote"
  | "invoice"
  | "receipt"
  | "ata"
  | "delivery_note"
  // Juridik & ansvar — kostar mest när de saknas
  | "contract"
  | "inspection_report"
  | "certificate"
  | "permit"
  // Teknik
  | "floor_plan"
  | "specification"
  // Routing, inte vokabulär — aldrig i en väljare
  | "product_image"
  | "other";

/**
 * The one place the document vocabulary is defined. Decided 2026-09-04,
 * written up in docs/dokumenttyper-2026-09.md — change that first.
 *
 * Two principles decide what belongs here:
 *  1. A type is what the PAPER IS, not what the app does with it. That is why
 *     `product_image` is marked internal: it is routing.
 *  2. A wrongly-guessed specific type is worse than "other". A receipt filed
 *     as "Avtal" is a paper you stop looking for; one in Övrigt says honestly
 *     that we do not know.
 *
 * Ranked by what it COSTS when the paper is missing, not by how often it turns
 * up — `certificate` (våtrumsintyg) is rare and the most expensive of all to
 * lack when a flat is sold.
 *
 * Machine-readable on purpose (agent-readable architecture): the picker, the
 * folders, the classifier's enum and the i18n keys all derive from this array,
 * so a new type is one entry rather than four edits that can drift apart.
 */
export const DOCUMENT_TYPE_CATALOG: ReadonlyArray<{
  value: DocumentType;
  /** Which heading it sits under in a picker. `null` = never shown to a person. */
  group: "economy" | "legal" | "technical" | "fallback" | null;
  labelKey: string;
  /** Swedish fallback, so a missing key never renders a raw key. */
  fallback: string;
  folder: string;
  /** May carry a work scope the reader is allowed to extract tasks from. */
  scopeBearing?: true;
}> = [
  { value: "quote", group: "economy", labelKey: "smartUpload.types.quote", fallback: "Offert", folder: "/Offerter", scopeBearing: true },
  { value: "invoice", group: "economy", labelKey: "smartUpload.types.invoice", fallback: "Faktura", folder: "/Fakturor" },
  { value: "receipt", group: "economy", labelKey: "smartUpload.types.receipt", fallback: "Kvitto", folder: "/Kvitton" },
  { value: "ata", group: "economy", labelKey: "smartUpload.types.ata", fallback: "ÄTA", folder: "/ÄTA", scopeBearing: true },
  { value: "delivery_note", group: "economy", labelKey: "smartUpload.types.deliveryNote", fallback: "Följesedel", folder: "/Följesedlar" },
  { value: "contract", group: "legal", labelKey: "smartUpload.types.contract", fallback: "Avtal", folder: "/Kontrakt", scopeBearing: true },
  { value: "inspection_report", group: "legal", labelKey: "smartUpload.types.inspectionReport", fallback: "Besiktningsprotokoll", folder: "/Besiktning" },
  { value: "certificate", group: "legal", labelKey: "smartUpload.types.certificate", fallback: "Intyg & egenkontroller", folder: "/Intyg" },
  { value: "permit", group: "legal", labelKey: "smartUpload.types.permit", fallback: "Tillstånd & beslut", folder: "/Tillstånd" },
  { value: "floor_plan", group: "technical", labelKey: "smartUpload.types.floorPlan", fallback: "Ritning", folder: "/Ritningar" },
  { value: "specification", group: "technical", labelKey: "smartUpload.types.specification", fallback: "Specifikation", folder: "/Specifikationer", scopeBearing: true },
  { value: "product_image", group: null, labelKey: "smartUpload.types.productImage", fallback: "Produktbild", folder: "/Bilder" },
  { value: "other", group: "fallback", labelKey: "smartUpload.types.other", fallback: "Övrigt", folder: "" },
];

/** Every valid value — for narrowing a string the classifier returned. */
export const DOCUMENT_TYPES: ReadonlyArray<DocumentType> = DOCUMENT_TYPE_CATALOG.map((d) => d.value);

/** The classifier returns a bare string; never let one become a folder path. */
export function asDocumentType(raw: string | undefined): DocumentType {
  return DOCUMENT_TYPES.includes(raw as DocumentType) ? (raw as DocumentType) : "other";
}

/** Types a person may choose, in picker order, grouped. */
export const PICKABLE_DOCUMENT_TYPES = DOCUMENT_TYPE_CATALOG.filter((d) => d.group !== null);

/** Types whose text may be mined for rooms and tasks. */
export const SCOPE_BEARING_TYPES: ReadonlySet<DocumentType> = new Set(
  DOCUMENT_TYPE_CATALOG.filter((d) => d.scopeBearing).map((d) => d.value),
);

/** Label for a type, with the Swedish fallback built in. */
export function documentTypeFallback(type: DocumentType): string {
  return DOCUMENT_TYPE_CATALOG.find((d) => d.value === type)?.fallback ?? type;
}

/**
 * Below this, a classification is a guess rather than a reading.
 *
 * SECONDARY net, and measured to be nearly inert: across all 47 classifications
 * in Carl's 2026-09-03 batch the server returned confidence **0.95 every single
 * time** — a habit, not a belief. A floor on that number would have been a
 * placebo. It is kept only because a MISSING confidence defaults to 0.5 on the
 * server, and that case should demote.
 *
 * The real gate is `type_evidence` below. Same lesson as the receipt angles: a
 * model can answer "what did you see?" far better than "how sure are you?".
 */
export const TYPE_CONFIDENCE_FLOOR = 0.7;

/** A classification after the floor is applied, and whether it was demoted. */
export interface SettledType {
  type: DocumentType;
  /** The type the model actually named — kept so the picker can pre-select it. */
  suggested: DocumentType;
  /** True when we filed it as Övrigt because the reading could not be backed up. */
  needsTypeReview: boolean;
}

/**
 * Decide the type we will actually FILE it under.
 *
 * A specific type has to be backed by words the model says it read in the
 * document — a heading, a form name, a labelled field. A type it cannot point
 * at is a guess, and a wrong specific type is worse than Övrigt: it is a paper
 * the person stops looking for, while Övrigt says honestly that we do not know
 * and can be corrected in one click.
 *
 * Checkable, unlike self-reported confidence: the evidence is a string that can
 * be looked for in the document. That is the whole reason it replaced the
 * number (which measured constant at 0.95).
 *
 * `product_image` and `other` are exempt — they are already the humble answers,
 * and demoting them costs the person a question they cannot usefully answer.
 * `product_image` in particular is decided from the image, not from text there
 * is any evidence to quote.
 */
export function settleDocumentType(
  raw: string | undefined,
  confidence: number | undefined,
  typeEvidence?: string | null,
  /**
   * The document's text, when we have it. Then the quotation is CHECKED rather
   * than believed — the gate's weak point, proven on a real paper: a Beijer
   * följesedel came back as `invoice` justified with "Faktura", a word that
   * appears nowhere on it (2026-09-04). A photo has no text here, so this is
   * only available on the text/PDF path; that is a smaller gate, not none.
   */
  documentText?: string,
): SettledType {
  const suggested = asDocumentType(raw);
  const demotable = suggested !== "other" && suggested !== "product_image";
  if (!demotable) return { type: suggested, suggested, needsTypeReview: false };

  const unbacked = typeof typeEvidence === "string" && !typeEvidence.trim();
  const missingEvidence = typeEvidence === null || unbacked;
  const weak = typeof confidence === "number" && confidence < TYPE_CONFIDENCE_FLOOR;

  // `undefined` means the caller does not carry the field yet (an older cached
  // reading, the legacy path). Absence of the field is not evidence of a guess,
  // so it must not demote — only an explicit null does.
  // A quotation we can look for and cannot find is a fabrication, and it is
  // the ONLY case where we know the reading is wrong rather than merely unsure.
  const fabricated =
    !!documentText &&
    typeof typeEvidence === "string" &&
    !!typeEvidence.trim() &&
    !documentText.toLowerCase().includes(typeEvidence.trim().toLowerCase());

  return missingEvidence || weak || fabricated
    ? { type: "other", suggested, needsTypeReview: true }
    : { type: suggested, suggested, needsTypeReview: false };
}

export type SuggestedAction =
  | "extract_tasks"
  | "extract_purchase"
  | "import_to_canvas"
  | "store_only";

/**
 * P1: the address of the HOME a document is about — never the sender's.
 * `source` says how much to trust it: a köpekontrakt names the object; a
 * quote names the work site; a receipt names nothing (the store's address is
 * not the home's).
 */
export interface DocumentPropertyAddress {
  street: string;
  postal_code: string | null;
  city: string | null;
}
export type AddressSource = 'property_document' | 'site_field';

export interface ClassificationResult {
  type: DocumentType;
  confidence: number;
  /**
   * The words in the document that justify the type — a heading, a form name,
   * a labelled field. `null` when the model could not point at anything, which
   * is what demotes the reading to Övrigt. Checkable, which self-reported
   * confidence is not (measured constant at 0.95 across 47 files).
   */
  type_evidence?: string | null;
  /** What the classifier reports SEEING — the app ranks the money family from it. */
  signals?: DocumentSignals | null;
  summary: string;
  vendor_name: string | null;
  invoice_date: string | null;
  invoice_amount: number | null;
  suggested_action: SuggestedAction;
  property_address?: DocumentPropertyAddress | null;
  address_source?: AddressSource | null;
}

// --- Quote extraction types ---

export interface ExtractedTask {
  title: string;
  description: string | null;
  category: string;
  roomName: string | null;
  confidence: number;
  sourceText: string;
  estimatedCost: number | null;
  laborCost: number | null;
  materialCost: number | null;
  startDate: string | null;
  endDate: string | null;
  isMaterialBudget: boolean;
  parentTaskName: string | null;
  rotEligible: boolean;
  rotAmount: number | null;
  isIncludingVat: boolean;
}

export interface ExtractedRoom {
  name: string;
  estimatedAreaSqm: number | null;
  description: string | null;
  confidence: number;
  sourceText: string;
}

export interface QuoteMetadata {
  vendorName: string | null;
  totalAmount: number | null;
  vatAmount: number | null;
  validUntil: string | null;
  paymentTerms: string | null;
  quoteDate: string | null;
  quoteNumber: string | null;
  isIncludingVat: boolean;
  totalRotAmount: number | null;
  quoteSource: 'building_supplier' | 'contractor' | 'mixed' | null;
}

export interface DocumentExtractionResult {
  rooms: ExtractedRoom[];
  tasks: ExtractedTask[];
  documentSummary: string;
  quoteMetadata: QuoteMetadata | null;
}

// --- Helpers ---

/**
 * The file's real media type, falling back to its extension.
 *
 * A drag-and-drop from Finder does not always set `File.type` — it came back
 * empty for 4 of Carl's 112 receipts (2026-09-01), and an empty type is sent
 * as `application/octet-stream`, which Storage rejects outright and the
 * classifier cannot read. The extension is the only thing left to go on, and
 * it is right far more often than "unknown" is useful.
 */
export function resolvedMimeType(file: File): string {
  if (file.type && file.type !== "application/octet-stream") return file.type;
  const ext = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  const byExt: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
    webp: "image/webp", heic: "image/heic", heif: "image/heif", avif: "image/avif",
    bmp: "image/bmp", tif: "image/tiff", tiff: "image/tiff",
    pdf: "application/pdf", txt: "text/plain", csv: "text/csv",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  return (ext && byExt[ext]) || "application/octet-stream";
}

function isImageFile(file: File): boolean {
  return resolvedMimeType(file).startsWith("image/");
}

function isDocumentFile(file: File): boolean {
  const docTypes = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "text/plain",
  ];
  return docTypes.includes(file.type);
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip data URL prefix
      const base64 = result.split(",")[1] || result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function compressImage(file: File, maxSize = 1600, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas context failed"));
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      resolve(dataUrl.split(",")[1]);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

// --- API calls ---

/**
 * Classify a document to determine its type and suggested action.
 * Fast call (~1-2s) using GPT-4o-mini with low detail.
 */
/**
 * A failed classification, carrying WHY when the server could name it.
 * `quota_exhausted` is the one the person can act on — everything else is
 * ours to retry or live with.
 */
export class ClassifyError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "ClassifyError";
  }
}

export async function classifyDocument(file: File): Promise<ClassificationResult> {
  let body: Record<string, string>;

  if (isImageFile(file)) {
    const base64 = await compressImage(file, 800, 0.7); // Low res for classification
    body = { image: base64, fileName: file.name };
  } else if (isDocumentFile(file)) {
    // For documents, extract text first via process-document's text extraction
    // but for classification we just send the filename + first chunk
    const base64 = await fileToBase64(file);
    body = { text: atob(base64).substring(0, 5000), fileName: file.name };
  } else {
    // Unknown file type — classify by name only
    body = { text: "", fileName: file.name };
  }

  const { data, error } = await supabase.functions.invoke<ClassificationResult>(
    "classify-document",
    { body }
  );

  if (error) {
    // The function answers a non-2xx with a BODY that names the reason, and
    // supabase-js throws before anyone reads it. Carl's drop (2026-09-01) was
    // diagnosed from the edge logs for exactly this reason: the console said
    // "non-2xx" a hundred times while the body said "no credits remaining".
    let code: string | undefined;
    try {
      const body = await (error as { context?: Response }).context?.json();
      code = body?.error_code;
      console.error("Classification error:", body?.error ?? error.message, code ?? "");
    } catch {
      console.error("Classification error:", error);
    }
    throw new ClassifyError(error.message || "Failed to classify document", code);
  }

  return data || { type: "other", confidence: 0, summary: "", vendor_name: null, suggested_action: "store_only" };
}

/**
 * Extract structured data from a document in quote mode.
 * Extracts tasks with pricing, rooms, and quote metadata.
 */
export async function extractQuoteData(
  fileUrl: string,
  fileType: string,
  fileName: string
): Promise<DocumentExtractionResult> {
  const { data, error } = await supabase.functions.invoke<DocumentExtractionResult>(
    "process-document",
    {
      body: { fileUrl, fileType, fileName, mode: "quote" },
    }
  );

  if (error) {
    console.error("Quote extraction error:", error);
    throw new Error(error.message || "Failed to extract quote data");
  }

  return data || { rooms: [], tasks: [], documentSummary: "", quoteMetadata: null };
}

/**
 * Extract structured data from a document in scope mode (existing behavior).
 * Extracts rooms and tasks without pricing.
 */
export async function extractScopeData(
  fileUrl: string,
  fileType: string,
  fileName: string
): Promise<DocumentExtractionResult> {
  const { data, error } = await supabase.functions.invoke<DocumentExtractionResult>(
    "process-document",
    {
      body: { fileUrl, fileType, fileName, mode: "scope" },
    }
  );

  if (error) {
    console.error("Scope extraction error:", error);
    throw new Error(error.message || "Failed to extract document data");
  }

  return data || { rooms: [], tasks: [], documentSummary: "", quoteMetadata: null };
}

/**
 * Upload a file to project storage and return the public URL.
 */
export async function uploadToProjectStorage(
  file: File,
  projectId: string,
  subfolder = "uploads"
): Promise<{ path: string; url: string | null }> {
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `projects/${projectId}/${subfolder}/${timestamp}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("project-files")
    .upload(path, file);

  if (uploadError) {
    throw new Error(`Upload failed: ${uploadError.message}`);
  }

  return { path, url: await getFileUrl(path) };
}

// --- Category filing (one engine for every "sort this into Files" path) ---

/**
 * Where each classified document type is filed in a project's file tree.
 * Single source of truth — the batch upload dialog AND Renaida's folder ingest
 * both file through here, so a document always lands in the same place.
 */
/** Derived from the catalog, so a new type cannot forget to get a folder. */
export const CATEGORY_FOLDERS: Record<DocumentType, string> = Object.fromEntries(
  DOCUMENT_TYPE_CATALOG.map((d) => [d.value, d.folder]),
) as Record<DocumentType, string>;

/** Storage keeps no empty directories — a placeholder makes the folder appear. */
export async function ensureFolder(projectId: string, folder: string): Promise<void> {
  if (!folder) return;
  await supabase.storage
    .from("project-files")
    .upload(`projects/${projectId}${folder}/.emptyFolderPlaceholder`, new Blob([""]), {
      upsert: true,
    });
}

export async function ensureCategoryFolder(
  projectId: string,
  category: DocumentType
): Promise<void> {
  await ensureFolder(projectId, CATEGORY_FOLDERS[category]);
}

/**
 * Move one archived file to another folder, keeping its stored name.
 * Returns the new path, or null when the move failed — a failed move must
 * leave the file where it was rather than lose it.
 */
export async function moveToFolder(
  projectId: string,
  path: string,
  folder: string
): Promise<string | null> {
  const target = pathInFolder(projectId, path, folder);
  if (target === path) return path;
  const { error } = await supabase.storage.from("project-files").move(path, target);
  if (error) {
    console.error("moveToFolder failed", error);
    return null;
  }
  return target;
}

/**
 * File one document into its category folder. Returns the storage path, or
 * null when the upload failed (callers treat archiving as best-effort — a
 * failed file must never sink the surrounding operation).
 */
export async function uploadToCategoryFolder(
  projectId: string,
  file: File,
  category: DocumentType,
  fallbackFolder = ""
): Promise<string | null> {
  const targetFolder = CATEGORY_FOLDERS[category] || fallbackFolder;
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `projects/${projectId}${targetFolder}/${timestamp}-${safeName}`;

  // contentType explicitly: Storage rejects `application/octet-stream`, which
  // is what an empty `File.type` becomes — a file the person can see in Finder
  // would otherwise be refused for having no type rather than no content.
  const { error } = await supabase.storage
    .from("project-files")
    .upload(path, file, { contentType: resolvedMimeType(file) });
  if (error) {
    console.error("uploadToCategoryFolder failed", error);
    return null;
  }
  return path;
}

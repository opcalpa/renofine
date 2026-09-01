import { supabase } from "@/integrations/supabase/client";
import { getFileUrl } from "@/lib/fileUrl";
import { pathInFolder } from "@/lib/projectFolders";

export { folderOfPath, importFolderName } from "@/lib/projectFolders";

// --- Classification types ---

export type DocumentType =
  | "quote"
  | "invoice"
  | "receipt"
  | "floor_plan"
  | "contract"
  | "specification"
  | "product_image"
  | "other";

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
export const CATEGORY_FOLDERS: Record<DocumentType, string> = {
  quote: "/Offerter",
  invoice: "/Fakturor",
  receipt: "/Kvitton",
  floor_plan: "/Ritningar",
  contract: "/Kontrakt",
  specification: "/Specifikationer",
  product_image: "/Bilder",
  other: "",
};

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

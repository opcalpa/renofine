import { supabase } from "@/integrations/supabase/client";

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

export interface ClassificationResult {
  type: DocumentType;
  confidence: number;
  summary: string;
  vendor_name: string | null;
  invoice_date: string | null;
  invoice_amount: number | null;
  suggested_action: SuggestedAction;
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

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
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
    console.error("Classification error:", error);
    throw new Error(error.message || "Failed to classify document");
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
): Promise<{ path: string; publicUrl: string }> {
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `projects/${projectId}/${subfolder}/${timestamp}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("project-files")
    .upload(path, file);

  if (uploadError) {
    throw new Error(`Upload failed: ${uploadError.message}`);
  }

  const { data: urlData } = supabase.storage
    .from("project-files")
    .getPublicUrl(path);

  return { path, publicUrl: urlData.publicUrl };
}

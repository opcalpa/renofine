import { supabase } from "@/integrations/supabase/client";
import { formatLocalDate } from "@/lib/dateUtils";
import { readDocumentUpright } from "./documentRead";

export interface DocumentLineItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface DocumentAnalysisResult {
  document_type: "receipt" | "invoice";
  vendor_name: string;
  total_amount: number;
  vat_amount: number | null;
  purchase_date: string | null;
  due_date: string | null;
  invoice_number: string | null;
  ocr_number: string | null;
  line_items: DocumentLineItem[];
  rot_amount: number | null;
  rot_personnummer: string | null;
  confidence: number;
}

// Legacy alias for backwards compatibility
export type ReceiptLineItem = DocumentLineItem;
export type ReceiptAnalysisResult = DocumentAnalysisResult;

interface UnifiedExtractionResult {
  document_type?: "receipt" | "invoice" | "quote" | "scope" | "other";
  /** Degrees clockwise the image must turn before its text can be read. */
  image_rotation?: number;
  receiptData?: {
    vendor_name: string | null;
    total_amount: number | null;
    vat_amount: number | null;
    purchase_date: string | null;
    due_date: string | null;
    invoice_number: string | null;
    ocr_number: string | null;
    line_items: DocumentLineItem[];
    rot_amount: number | null;
    rot_personnummer: string | null;
    confidence: number;
  } | null;
}

/**
 * Analyzes a document (receipt or invoice) using AI vision to extract structured data.
 *
 * Routes through process-document-v2 with mode_hint='receipt'. The v2 endpoint
 * returns a union schema (rooms/tasks/quoteMetadata/receiptData); we adapter-map
 * the receipt slice back to the legacy DocumentAnalysisResult shape so existing
 * call sites keep working.
 *
 * @param imageBase64 Base64-encoded image data (without the data:image prefix)
 * @param mimeType Optional image mime type (defaults to image/jpeg)
 */
export async function analyzeDocument(
  imageBase64: string,
  mimeType: string = "image/jpeg",
): Promise<DocumentAnalysisResult> {
  const { data, error } = await supabase.functions.invoke<UnifiedExtractionResult>(
    "process-document-v2",
    {
      body: {
        imageBase64,
        mimeType,
        mode_hint: "receipt",
      },
    }
  );

  if (error) {
    console.error("Document analysis error:", error);
    throw new Error(error.message || "Failed to analyze document");
  }

  if (!data || !data.receiptData) {
    throw new Error("No receipt data returned from document analysis");
  }

  return toAnalysisResult(data);
}

/**
 * The same read, but from the FILE — which is what a photographed receipt needs.
 *
 * A phone photo of a receipt on a table is usually rotated, and the model never
 * sees image metadata, so reading the bytes as they arrive produces a confident
 * invention rather than an error (measured on Carl's pile, 2026-09-03). Only a
 * caller holding the File can turn it and ask again, so base64-only callers
 * cannot be fixed in place — they have to hand over the file.
 *
 * Returns the upright image alongside the reading: archive THAT, so what the
 * person opens later is the same picture the model read.
 */
export async function analyzeDocumentFile(
  file: File,
): Promise<{ result: DocumentAnalysisResult; uprightFile: File }> {
  const { data, sent } = await readDocumentUpright<UnifiedExtractionResult>(file);
  if (!data || !data.receiptData) {
    throw new Error("No receipt data returned from document analysis");
  }
  return { result: toAnalysisResult(data), uprightFile: sent };
}

function toAnalysisResult(data: UnifiedExtractionResult): DocumentAnalysisResult {
  const r = data.receiptData!;
  return {
    document_type: data.document_type === "invoice" ? "invoice" : "receipt",
    vendor_name: r.vendor_name || "",
    total_amount: r.total_amount ?? 0,
    vat_amount: r.vat_amount,
    purchase_date: r.purchase_date,
    due_date: r.due_date,
    invoice_number: r.invoice_number,
    ocr_number: r.ocr_number,
    line_items: r.line_items,
    rot_amount: r.rot_amount,
    rot_personnummer: r.rot_personnummer,
    confidence: r.confidence,
  };
}

/**
 * Legacy function for backwards compatibility.
 * @deprecated Use analyzeDocument instead
 */
export const analyzeReceipt = analyzeDocument;

/**
 * Sanitizes a vendor name for use in filenames.
 * Replaces Swedish characters and invalid chars with underscores.
 */
function sanitizeForFilename(name: string, maxLength = 30): string {
  return name
    .trim()
    .replace(/å/gi, "a")
    .replace(/ä/gi, "a")
    .replace(/ö/gi, "o")
    .replace(/[^a-zA-Z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .substring(0, maxLength) || "Okand";
}

/**
 * Generates a smart filename for a document based on extracted data.
 * Format for receipts: "Kvitto_{vendor}_{datum}_{belopp}kr.jpg"
 * Format for invoices: "Faktura_{vendor}_{fakturanr}_{belopp}kr.jpg"
 * Sanitized for Supabase Storage (no spaces, ASCII-safe)
 */
export function generateDocumentFilename(
  documentType: "receipt" | "invoice",
  vendorName: string,
  purchaseDate: string | null,
  totalAmount: number,
  invoiceNumber?: string | null
): string {
  const sanitizedVendor = sanitizeForFilename(vendorName);
  const date = purchaseDate || formatLocalDate(new Date());
  const amount = Math.round(totalAmount);

  if (documentType === "invoice") {
    const invoiceNum = invoiceNumber ? sanitizeForFilename(invoiceNumber, 20) : date;
    return `Faktura_${sanitizedVendor}_${invoiceNum}_${amount}kr.jpg`;
  }

  return `Kvitto_${sanitizedVendor}_${date}_${amount}kr.jpg`;
}

/**
 * Legacy function for backwards compatibility.
 * @deprecated Use generateDocumentFilename instead
 */
export function generateReceiptFilename(
  vendorName: string,
  purchaseDate: string | null,
  totalAmount: number
): string {
  return generateDocumentFilename("receipt", vendorName, purchaseDate, totalAmount);
}

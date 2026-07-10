/**
 * Agentic layer — document capture (Renaida D1).
 *
 * Renaida does NOT re-implement extraction: she conducts the existing
 * process-document-v2 endpoint (the union receipt/invoice/quote/scope brain)
 * and turns its output into the same proposal envelope as voice/text capture.
 * See .claude memory project_renaida_document_flows.
 */
import { supabase } from "@/integrations/supabase/client";
import type { ProposalAction } from "./types";

interface UnifiedReceiptSlice {
  vendor_name: string | null;
  total_amount: number | null;
  vat_amount: number | null;
  purchase_date: string | null;
  due_date: string | null;
  invoice_number: string | null;
  ocr_number: string | null;
  line_items: { description: string; quantity: number; unit_price: number; total: number }[];
  rot_amount: number | null;
  rot_personnummer: string | null;
  confidence: number;
}

interface UnifiedExtractionResult {
  document_type?: "receipt" | "invoice" | "quote" | "scope" | "other";
  receiptData?: UnifiedReceiptSlice | null;
}

export type DocumentCaptureResult =
  | { kind: "receipt" | "invoice"; action: Extract<ProposalAction, { type: "import_purchase" }>; confidence: number }
  /** Heavy documents get a prefilled handoff to their dedicated review dialog (D2). */
  | { kind: "quote" | "scope" }
  | { kind: "unreadable" };

/**
 * File objects can't live inside a serializable proposal action, so the image
 * travels beside it: registered here at capture time, collected at apply time.
 * Session-scoped in-memory map — proposals are component state, never persisted.
 */
const attachmentRegistry = new Map<string, File>();

export function takeAttachment(key: string | undefined): File | undefined {
  if (!key) return undefined;
  const file = attachmentRegistry.get(key);
  attachmentRegistry.delete(key);
  return file;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1)); // strip data:...;base64,
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

/**
 * Analyze a photographed/uploaded document and shape it as an import_purchase
 * action. The AI decides the document type itself — a quote dropped here is
 * routed to its proper review surface instead of being mangled into an order.
 */
export async function captureDocument(file: File): Promise<DocumentCaptureResult> {
  const base64 = await fileToBase64(file);
  const isPdf =
    (file.type || "").toLowerCase().includes("pdf") ||
    file.name.toLowerCase().endsWith(".pdf");
  const { data, error } = await supabase.functions.invoke<UnifiedExtractionResult>(
    "process-document-v2",
    {
      body: isPdf
        ? { fileBase64: base64, mimeType: file.type || "application/pdf", fileName: file.name, mode_hint: "receipt" }
        : { imageBase64: base64, mimeType: file.type || "image/jpeg", mode_hint: "receipt" },
    },
  );
  if (error) throw new Error(error.message || "Document analysis failed");

  const type = data?.document_type;
  if (type === "quote" || type === "scope") return { kind: type };
  if (type === "other") return { kind: "unreadable" };

  const r = data?.receiptData;
  if (!r || (!r.vendor_name && !r.total_amount)) return { kind: "unreadable" };
  // Hallucination guard (loop-varv 14, A8): a "receipt" without a positive total
  // is not a purchase — refuse honestly instead of proposing a 0 kr order.
  if (!r.total_amount || r.total_amount <= 0) return { kind: "unreadable" };

  const documentType = type === "invoice" ? "invoice" : "receipt";
  const attachmentKey = crypto.randomUUID();
  attachmentRegistry.set(attachmentKey, file);

  return {
    kind: documentType,
    confidence: typeof r.confidence === "number" ? r.confidence : 0.8,
    action: {
      type: "import_purchase",
      documentType,
      vendorName: r.vendor_name || "Okänd leverantör",
      total: r.total_amount ?? 0,
      vatAmount: r.vat_amount,
      documentDate: r.purchase_date,
      dueDate: r.due_date,
      invoiceNumber: r.invoice_number,
      ocrNumber: r.ocr_number,
      rotAmount: r.rot_amount,
      lineItems: (r.line_items ?? []).map((li) => ({
        description: li.description,
        quantity: li.quantity || 1,
        unitPrice: li.unit_price ?? null,
        total: li.total ?? null,
      })),
      attachmentKey,
    },
  };
}

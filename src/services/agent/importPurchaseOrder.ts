/**
 * importPurchaseOrder — the ONE write that turns an extracted receipt/invoice
 * into a first-class purchase order (Carl's PO invariant, 2026-07-09): 1 PO
 * (status=delivered) + N material rows, plus the document file + photo link.
 *
 * Extracted verbatim from applyProposals' `import_purchase` case so the live
 * Renaida document flow AND Renaida-led project birth (folder ingest, Fas C
 * inc 3) share ONE implementation and can never drift. Loop-varv semantics
 * (unique filename suffix, ROT net/gross, PO-invariant cleanup) are preserved.
 */
import { supabase } from "@/integrations/supabase/client";
import { generateDocumentFilename } from "@/services/receiptAnalysisService";
import { registerAttachment, takeAttachment } from "./documentCapture";
import { resolvedMimeType } from "@/services/smartUploadService";
import { purchaseVatFields, lineVat } from "@/lib/vat";
import type { ProposalAction } from "./types";

export type ImportPurchaseAction = Extract<ProposalAction, { type: "import_purchase" }>;

export interface ImportPurchaseResult {
  purchaseOrderId: string;
  materialIds: string[];
  /**
   * Where the document actually landed — `null` when there was no file OR when
   * the upload did not go through.
   *
   * It used to be set from the path we INTENDED to write, before the upload,
   * and returned no matter what happened: `uploadError` took no branch at all,
   * so a failed upload left the cost in the budget, `receipt_file_path`
   * pointing at an object that does not exist, and nothing anywhere saying so
   * (2026-09-04).
   */
  filePath: string | null;
}

/**
 * The `project-files` bucket's hard ceiling, verified against prod.
 *
 * Storage rejects anything above it, and this path never checked — so a
 * >10 MB invoice PDF was the named, ordinary way to hit the silent branch.
 */
const PROJECT_FILES_MAX_BYTES = 10 * 1024 * 1024;

export async function importPurchaseOrder(
  projectId: string,
  profileId: string,
  action: ImportPurchaseAction,
): Promise<ImportPurchaseResult> {
  const isInvoice = action.documentType === "invoice";
  const dateStr = action.documentDate ?? new Date().toISOString().slice(0, 10);
  const file = takeAttachment(action.attachmentKey);
  // Unique suffix: the same receipt scanned twice yields the same
  // vendor+date+amount name — without it the second upload overwrites the
  // first order's file, and undoing one import would delete the other's
  // attachment (path-keyed cleanup).
  const isPdf = !!file && ((file.type || "").includes("pdf") || file.name.toLowerCase().endsWith(".pdf"));
  const filename = generateDocumentFilename(
    action.documentType, action.vendorName, dateStr, action.total, action.invoiceNumber,
  ).replace(/\.jpg$/, `_${crypto.randomUUID().slice(0, 8)}.${isPdf ? "pdf" : "jpg"}`);
  const storagePath = file
    ? `projects/${projectId}/${isInvoice ? "Fakturor" : "Kvitton"}/${filename}`
    : null;

  // ROT semantics (Carl 2026-07-12): ROT lowers what the user actually pays,
  // so the order total = NET (gross − ROT deduction). We store the deduction
  // separately so the budget can surface all utilized ROT in its own column;
  // gross is derivable as total + rot_amount. Material line rows stay at their
  // truthful gross line values (the receipt/invoice prints gross lines).
  const grossTotal = action.total;
  const rotAmount = action.rotAmount ?? 0;
  const netTotal = Math.max(0, grossTotal - rotAmount);

  // Momsen räknas på dokumentets bruttosumma, inte på `total` — ROT sänker vad
  // kunden betalar men rör inte momsunderlaget. Utan detta läste vi ut momsen
  // (action.vatAmount) och kastade den vid spar.
  const vatFields = purchaseVatFields(grossTotal, action.vatAmount);

  const { data: po, error: poError } = await supabase
    .from("purchase_orders")
    .insert({
      project_id: projectId,
      vendor_name: action.vendorName,
      total: netTotal,
      ...vatFields,
      rot_amount: rotAmount || null,
      status: "delivered",
      source: isInvoice ? "ai_invoice" : "ai_receipt",
      delivered_at: dateStr,
      ordered_at: dateStr,
      invoice_number: isInvoice ? action.invoiceNumber ?? null : null,
      ocr_number: isInvoice ? action.ocrNumber ?? null : null,
      invoice_due_date: isInvoice ? action.dueDate ?? null : null,
      receipt_file_path: storagePath,
      notes: action.userNote?.trim() || null,
      created_by_user_id: profileId,
    })
    .select("id")
    .single();
  if (poError || !po) throw new Error(poError?.message ?? "Kunde inte skapa inköpsorder");

  // renaida-material-receipt-match: a line matched to a planned material carries
  // source_material_id (consumes that planned budget line, same as the manual
  // QuickReceiptCapture applyBudget path) + inherits its task/room. An unmatched
  // line is a normal budget row, unless the user booked the order as ÄTA/extra
  // (exclude_from_budget=true — how the budget separates ÄTA, BudgetDashboard).
  const bookAsAta = !!action.bookAsAta;
  const lineRows = action.lineItems.length
    ? action.lineItems.map((li) => ({
        name: li.description,
        quantity: li.quantity || 1,
        price_per_unit: li.unitPrice,
        price_total: li.total,
        paid_amount: isInvoice ? 0 : li.total ?? 0,
        source_material_id: li.sourceMaterialId ?? null,
        task_id: li.taskId ?? null,
        // D3: capture-time room note takes precedence; otherwise inherit the
        // matched planned material's room.
        room_id: action.roomId ?? li.roomId ?? null,
        exclude_from_budget: li.sourceMaterialId ? false : bookAsAta,
      }))
    : [{
        name: `${isInvoice ? "Faktura" : "Kvitto"} - ${action.vendorName}`,
        quantity: 1,
        price_per_unit: action.total,
        price_total: action.total,
        paid_amount: isInvoice ? 0 : action.total,
        source_material_id: action.sourceMaterialId ?? null,
        task_id: action.taskId ?? null,
        room_id: action.roomId ?? null,
        exclude_from_budget: action.sourceMaterialId ? false : bookAsAta,
      }];
  const matRows = lineRows.map((row) => ({
    ...row,
    ...lineVat(row.price_total, vatFields.vat_rate),
    project_id: projectId,
    purchase_order_id: po.id,
    vendor_name: action.vendorName,
    unit: "st",
    status: isInvoice ? "billed" : "paid",
    created_by_user_id: profileId,
  }));

  const { data: createdMats, error: matError } = await supabase
    .from("materials").insert(matRows).select("id");
  if (matError) {
    // Don't leave a half-imported order behind — the PO invariant says
    // an order without its lines is a lie in the purchase list.
    await supabase.from("purchase_orders").delete().eq("id", po.id);
    throw new Error(matError.message);
  }
  const materialIds = (createdMats ?? []).map((m) => m.id);

  // Upload the document image + link it, same shape as the manual scan flow.
  let uploadedPath: string | null = null;
  if (file && storagePath) {
    // contentType explicitly: Storage rejects `application/octet-stream`, which
    // is what an empty `File.type` becomes — and this file already knows the
    // type can be missing (the isPdf line above guards for it).
    const tooBig = file.size > PROJECT_FILES_MAX_BYTES;
    const { error: uploadError } = tooBig
      ? { error: new Error(`file is ${Math.round(file.size / 1024 / 1024)} MB, over the 10 MB limit`) }
      : await supabase.storage
          .from("project-files")
          .upload(storagePath, file, { upsert: true, contentType: resolvedMimeType(file) });
    if (uploadError) {
      // Never silent. The order and its lines are already written, so the cost
      // is in the budget either way — what must not happen is the paper going
      // missing without a word. Put the bytes back so the retry has something
      // to upload; `takeAttachment` consumed them at the top of this function.
      console.error("receipt upload failed", filename, uploadError);
      if (action.attachmentKey) registerAttachment(action.attachmentKey, file);
      // The order was written with the path we MEANT to use. Leaving it there
      // is the worst of both: an order that claims to have a receipt, and an
      // "öppna underlaget" that fails whenever someone finally checks a number.
      await supabase
        .from("purchase_orders")
        .update({ receipt_file_path: null })
        .eq("id", po.id);
    } else {
      uploadedPath = storagePath;
    }
    if (!uploadError && materialIds[0]) {
      void supabase.from("task_file_links").insert({
        project_id: projectId,
        file_path: storagePath,
        file_name: filename,
        file_type: action.documentType,
        file_size: file.size,
        mime_type: file.type,
        linked_by_user_id: profileId,
        material_id: materialIds[0],
      }).then(() => {}, () => {});
      // Photo gallery is images-only — a PDF invoice still gets its
      // task_file_links row above, which is what the Files surfaces read.
      if (!isPdf) {
        void supabase.from("photos").insert({
          linked_to_type: "material",
          linked_to_id: materialIds[0],
          url: storagePath,
          caption: filename,
          uploaded_by_user_id: profileId,
          kind: "receipt",
          source: "renaida",
        }).then(() => {}, () => {});
      }
    }
  }

  // Merged pages: the same document's further sheets, uploaded beside the first
  // and hung on the ORDER (task_file_links.purchase_order_id) — which is what
  // PurchaseOrderDetailSheet lists. Awaited, not fire-and-forget: a page that
  // silently failed to upload is a lost receipt, and the person merged it here
  // precisely because they wanted to keep it (Carl, 2026-09-03).
  for (const [i, page] of (action.extraPages ?? []).entries()) {
    const pageFile = takeAttachment(page.attachmentKey);
    if (!pageFile) continue;
    const pageName = `${filename.replace(/\.[^.]+$/, "")} - sida ${i + 2}${
      pageFile.name.match(/\.[^.]+$/)?.[0] ?? ""
    }`;
    const pagePath = `projects/${projectId}/${isInvoice ? "Fakturor" : "Kvitton"}/${pageName}`;
    const { error: pageErr } = await supabase.storage
      .from("project-files")
      .upload(pagePath, pageFile, { upsert: true });
    if (pageErr) {
      console.error("extra page upload failed", page.fileName, pageErr);
      if (page.attachmentKey) registerAttachment(page.attachmentKey, pageFile);
      continue;
    }
    await supabase.from("task_file_links").insert({
      project_id: projectId,
      purchase_order_id: po.id,
      file_path: pagePath,
      file_name: pageName,
      file_type: action.documentType,
      file_size: pageFile.size,
      mime_type: pageFile.type,
      linked_by_user_id: profileId,
    });
  }

  void supabase.from("activity_log").insert({
    project_id: projectId,
    actor_id: profileId,
    action: "renaida_purchase_import",
    entity_type: "purchase_order",
    entity_id: po.id,
    entity_name: action.vendorName,
    changes: { documentType: action.documentType, total: action.total, lines: action.lineItems.length },
  }).then(() => {}, () => {});

  return { purchaseOrderId: po.id, materialIds, filePath: uploadedPath };
}

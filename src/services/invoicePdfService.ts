/**
 * PDF generation for invoices — extracted from ViewInvoice.tsx so both v1 and v2
 * pages can reuse it without duplication. Mirrors quotePdfService structurally,
 * adds invoice-specific blocks: invoice_number / due_date metadata, payment
 * details (bankgiro / account / OCR), and the BETALD watermark.
 */

import { updateInvoiceStatus } from "./invoiceService";

export interface InvoicePdfInvoice {
  id: string;
  title: string;
  status: string;
  created_at: string;
  free_text: string | null;
  invoice_number: string | null;
  due_date: string | null;
  bankgiro: string | null;
  bank_account_number: string | null;
  ocr_reference: string | null;
}

export interface InvoicePdfItem {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  rot_deduction: number;
  comment: string | null;
}

export interface InvoicePdfCreator {
  name: string;
  company_name: string | null;
  org_number: string | null;
  company_address: string | null;
  company_postal_code: string | null;
  company_city: string | null;
  email: string | null;
  phone: string | null;
  company_website: string | null;
  company_logo_url: string | null;
  bankgiro: string | null;
  bank_account_number: string | null;
}

export interface DownloadInvoicePdfParams {
  invoice: InvoicePdfInvoice;
  items: InvoicePdfItem[];
  creator: InvoicePdfCreator | null;
  projectName: string;
  clientName: string | null;
  t: (key: string, fallbackOrParams?: unknown, params?: unknown) => string;
  /** Called after the PDF saves with the new status if a draft was finalized. */
  onDraftFinalized?: () => void;
}

export async function downloadInvoicePdf({
  invoice,
  items,
  creator,
  projectName,
  clientName,
  t,
  onDraftFinalized,
}: DownloadInvoicePdfParams): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const contentLimit = 255;
  let y = 20;

  const subtotal = items.reduce((s, i) => s + (i.total_price ?? 0), 0);
  const vat = Math.round(subtotal * 0.25 * 100) / 100;
  const totalRot = items.reduce((s, i) => s + (i.rot_deduction ?? 0), 0);
  const totalToPay = subtotal + vat - totalRot;

  const drawFooter = () => {
    if (!creator) return;
    const footerY = 275;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.line(15, footerY - 3, 195, footerY - 3);

    const leftParts: string[] = [];
    if (creator.company_name) leftParts.push(creator.company_name);
    if (creator.org_number) leftParts.push(`Org.nr: ${creator.org_number}`);
    if (creator.company_address) leftParts.push(creator.company_address);
    if (creator.company_postal_code || creator.company_city) {
      leftParts.push([creator.company_postal_code, creator.company_city].filter(Boolean).join(" "));
    }
    doc.text(leftParts.join("  |  "), 15, footerY);

    const rightParts: string[] = [];
    if (creator.company_website) rightParts.push(creator.company_website);
    if (creator.phone) rightParts.push(creator.phone);
    if (creator.email) rightParts.push(creator.email);
    doc.text(rightParts.join("  |  "), 195, footerY, { align: "right" });
  };

  const newPageIfNeeded = (needed: number) => {
    if (y + needed > contentLimit) {
      drawFooter();
      doc.addPage();
      y = 20;
    }
  };

  // Header — logo + company name
  if (creator?.company_logo_url) {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject();
        img.src = creator.company_logo_url!;
      });
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext("2d")?.drawImage(img, 0, 0);
      const dataUrl = canvas.toDataURL("image/png");

      const ratio = img.width / img.height;
      const logoH = 12;
      const logoW = logoH * ratio;
      doc.addImage(dataUrl, "PNG", 15, y, logoW, logoH);
      y += logoH + 3;
    } catch {
      // Logo load failed — continue without it
    }
  }

  doc.setFontSize(12);
  doc.text(creator?.company_name || creator?.name || "Renofine", 15, y);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(new Date(invoice.created_at).toLocaleDateString("sv-SE"), 195, y, { align: "right" });
  y += 5;
  if (creator?.org_number) {
    doc.setFontSize(8);
    doc.text(`Org.nr: ${creator.org_number}`, 15, y);
    y += 4;
  }
  if (creator?.company_address || creator?.company_city) {
    doc.setFontSize(8);
    doc.text(
      [creator.company_address, [creator.company_postal_code, creator.company_city].filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(", "),
      15,
      y
    );
    y += 4;
  }
  y += 6;

  // Title — FAKTURA + metadata
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text(t("invoices.invoiceLabel", "Faktura").toUpperCase(), 15, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  if (projectName) {
    doc.text(`${t("invoices.projectLabel", "Projekt")}: ${projectName}`, 15, y);
    y += 5;
  }
  if (clientName) {
    doc.text(`${t("invoices.recipient", "Mottagare")}: ${clientName}`, 15, y);
    y += 5;
  }
  if (invoice.invoice_number) {
    doc.text(`${t("invoices.invoiceNumberLabel", "Fakturanr")}: ${invoice.invoice_number}`, 15, y);
    y += 5;
  }
  if (invoice.due_date) {
    doc.text(
      `${t("invoices.dueDate")}: ${new Date(invoice.due_date).toLocaleDateString("sv-SE")}`,
      15,
      y
    );
    y += 5;
  }
  y += 6;

  // Free text
  if (invoice.free_text) {
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(invoice.free_text, 180);
    newPageIfNeeded(lines.length * 4 + 4);
    doc.text(lines, 15, y);
    y += lines.length * 4 + 4;
  }

  // Table header
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(t("quotes.description"), 15, y);
  doc.text(t("quotes.quantity"), 105, y, { align: "right" });
  doc.text(t("quotes.unitPrice"), 135, y, { align: "right" });
  doc.text(t("quotes.totalAmount"), 195, y, { align: "right" });
  y += 2;
  doc.line(15, y, 195, y);
  y += 5;
  doc.setFont("helvetica", "normal");

  for (const item of items) {
    const lineHeight = item.comment ? 10 : 6;
    newPageIfNeeded(lineHeight);
    doc.text(item.description || "—", 15, y, { maxWidth: 80 });
    doc.text(`${item.quantity} ${item.unit}`, 105, y, { align: "right" });
    doc.text(`${item.unit_price.toLocaleString()} kr`, 135, y, { align: "right" });
    doc.text(`${item.total_price.toLocaleString()} kr`, 195, y, { align: "right" });
    y += 6;
    if (item.comment) {
      doc.setFontSize(7);
      doc.setTextColor(130, 130, 130);
      doc.text(item.comment, 15, y, { maxWidth: 80 });
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(9);
      y += 4;
    }
  }

  // Summary
  newPageIfNeeded(40);
  y += 4;
  doc.line(15, y, 195, y);
  y += 6;
  doc.text(t("quotes.subtotal"), 15, y);
  doc.text(`${subtotal.toLocaleString()} kr`, 195, y, { align: "right" });
  y += 5;
  doc.text(t("quotes.vat"), 15, y);
  doc.text(`${vat.toLocaleString()} kr`, 195, y, { align: "right" });
  y += 5;
  if (totalRot > 0) {
    doc.text(t("quotes.rotDeduction"), 15, y);
    doc.text(`-${totalRot.toLocaleString()} kr`, 195, y, { align: "right" });
    y += 5;
  }
  doc.setFont("helvetica", "bold");
  doc.text(t("quotes.totalToPay"), 15, y);
  doc.text(`${totalToPay.toLocaleString()} kr`, 195, y, { align: "right" });
  y += 8;

  // Payment details (invoice-specific) — bankgiro / OCR / account
  const bankgiroVal = invoice.bankgiro || creator?.bankgiro;
  const accountVal = invoice.bank_account_number || creator?.bank_account_number;
  if (bankgiroVal || accountVal || invoice.ocr_reference) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    newPageIfNeeded(25);
    doc.line(15, y, 195, y);
    y += 5;
    doc.setFont("helvetica", "bold");
    doc.text(t("invoices.paymentDetails"), 15, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    if (bankgiroVal) {
      doc.text(`${t("invoices.bankgiro")}: ${bankgiroVal}`, 15, y);
      y += 5;
    }
    if (accountVal) {
      doc.text(`${t("invoices.bankAccountNumber")}: ${accountVal}`, 15, y);
      y += 5;
    }
    if (invoice.ocr_reference) {
      doc.text(`${t("invoices.ocrReference")}: ${invoice.ocr_reference}`, 15, y);
      y += 5;
    }
  }

  // BETALD watermark — diagonal stamp when paid
  if (invoice.status === "paid") {
    doc.setFontSize(60);
    doc.setTextColor(0, 180, 0);
    doc.setFont("helvetica", "bold");
    doc.text("BETALD", 105, 160, { align: "center", angle: 45 });
    doc.setTextColor(0, 0, 0);
  }

  drawFooter();
  doc.save(`${(invoice.invoice_number || invoice.title).replace(/[^a-zåäö0-9]/gi, "_")}.pdf`);

  // Auto-finalize draft → sent on PDF download (same pattern as quotes)
  if (invoice.status === "draft") {
    const result = await updateInvoiceStatus(invoice.id, "sent");
    if (result) onDraftFinalized?.();
  }
}

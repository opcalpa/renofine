/**
 * PDF generation for quotes — extracted from ViewQuote.tsx so both v1 and v2
 * pages can reuse it without duplication. Uses jsPDF (loaded dynamically to keep
 * the main bundle small) and renders header → body → footer with sidebreak handling.
 */

import { updateQuoteStatus } from "./quoteService";

export interface QuotePdfQuote {
  id: string;
  title: string;
  status: string;
  created_at: string;
  free_text: string | null;
  quote_number?: string | null;
}

export interface QuotePdfItem {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  rot_deduction: number;
  comment: string | null;
  discount_percent: number | null;
}

export interface QuotePdfCreator {
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
}

export interface DownloadQuotePdfParams {
  quote: QuotePdfQuote;
  items: QuotePdfItem[];
  creator: QuotePdfCreator | null;
  projectName: string;
  clientName: string | null;
  t: (key: string, fallbackOrParams?: unknown, params?: unknown) => string;
  /** Called after the PDF saves with the new status if a draft was finalized. */
  onDraftFinalized?: () => void;
}

export async function downloadQuotePdf({
  quote,
  items,
  creator,
  projectName,
  clientName,
  t,
  onDraftFinalized,
}: DownloadQuotePdfParams): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pw = 190;
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

  doc.setFontSize(16);
  doc.text(creator?.company_name || creator?.name || "Renofine", 15, y);
  y += 8;
  doc.setFontSize(10);
  doc.text(new Date(quote.created_at).toLocaleDateString("sv-SE"), 15, y);
  y += 10;

  // Title
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(t("quotes.quoteLabel", "Offert").toUpperCase(), 15, y);
  y += 6;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  if (projectName) {
    doc.text(`${t("quotes.projectLabel", "Projekt")}: ${projectName}`, 15, y);
    y += 5;
  }
  if (clientName) {
    doc.text(`${t("quotes.recipient", "Mottagare")}: ${clientName}`, 15, y);
    y += 5;
  }
  if (quote.quote_number) {
    doc.text(`${t("quotes.quoteNumberLabel", "Offertnr")}: ${quote.quote_number}`, 15, y);
    y += 5;
  }
  y += 3;

  // Free text
  if (quote.free_text) {
    doc.setFontSize(9);
    const ftLines = doc.splitTextToSize(quote.free_text, pw);
    newPageIfNeeded(ftLines.length * 4 + 4);
    doc.text(ftLines, 15, y);
    y += ftLines.length * 4 + 4;
  }

  y += 2;

  // Table header
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(t("quotes.description"), 15, y);
  doc.text(t("quotes.quantity"), 105, y, { align: "right" });
  doc.text(t("quotes.unitPrice"), 135, y, { align: "right" });
  doc.text(t("quotes.discount", "Discount"), 160, y, { align: "right" });
  doc.text(t("quotes.totalAmount"), 195, y, { align: "right" });
  y += 2;
  doc.line(15, y, 195, y);
  y += 5;
  doc.setFont("helvetica", "normal");

  for (const item of items) {
    const discount = item.discount_percent ?? 0;
    const lineHeight = item.comment ? 10 : 6;
    newPageIfNeeded(lineHeight);

    doc.text(item.description || "—", 15, y, { maxWidth: 80 });
    doc.text(`${item.quantity} ${item.unit}`, 105, y, { align: "right" });
    doc.text(`${item.unit_price.toLocaleString()} kr`, 135, y, { align: "right" });
    doc.text(discount > 0 ? `${discount}%` : "—", 160, y, { align: "right" });
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
  newPageIfNeeded(30);
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

  drawFooter();
  doc.save(`${quote.title.replace(/[^a-zåäö0-9]/gi, "_")}.pdf`);

  // Auto-finalize draft → sent on PDF download
  if (quote.status === "draft") {
    const result = await updateQuoteStatus(quote.id, "sent");
    if (result) onDraftFinalized?.();
  }
}

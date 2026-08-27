import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { draftVat, vatLabel } from "@/lib/vat";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { Eye } from "lucide-react";
import type { QuoteItem } from "@/components/quotes/QuoteItemRow";

interface CompanyInfo {
  name?: string;
  logoUrl?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  phone?: string;
  email?: string;
  website?: string;
  orgNumber?: string;
  bankgiro?: string;
  bankAccountNumber?: string;
}

interface InvoicePreviewProps {
  open: boolean;
  onClose: () => void;
  projectName: string;
  items: QuoteItem[];
  freeText?: string;
  company?: CompanyInfo;
  clientName?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string;
  bankgiro?: string;
  bankAccountNumber?: string;
  ocrReference?: string;
  onSend?: () => void;
  /** @deprecated use company prop */
  companyName?: string;
  /** @deprecated use company prop */
  companyLogoUrl?: string;
}

export function InvoicePreview({
  open,
  onClose,
  projectName,
  items,
  freeText,
  company,
  clientName,
  invoiceNumber,
  invoiceDate,
  dueDate,
  bankgiro,
  bankAccountNumber,
  ocrReference,
  onSend,
  companyName,
  companyLogoUrl,
}: InvoicePreviewProps) {
  const { t } = useTranslation();

  const netOf = (i: (typeof items)[number]) =>
    i.quantity * i.unitPrice * (1 - (i.discountPercent ?? 0) / 100);
  const subtotal = items.reduce((sum, i) => sum + netOf(i), 0);
  // Varje rad bär sin sats — 25 % är default, inte en inbyggd sanning.
  const vat = draftVat(items.map((i) => ({ net: netOf(i), vatRate: i.vatRate })));
  const vatRowLabel = (base: string) => vatLabel(base, items.map((i) => i.vatRate));
  const rotEligibleTotal = items
    .filter((i) => i.isRotEligible)
    .reduce((sum, i) => sum + i.quantity * i.unitPrice * (1 - (i.discountPercent ?? 0) / 100), 0);
  const rotDeduction = rotEligibleTotal * 1.25 * 0.3; // 30% of inc moms (Skatteverket)
  const totalToPay = subtotal + vat - rotDeduction;

  const fmt = (n: number) =>
    n.toLocaleString("sv-SE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const dateStr = invoiceDate
    ? new Date(invoiceDate).toLocaleDateString("sv-SE")
    : new Date().toLocaleDateString("sv-SE");

  // Merge legacy props with company object
  const co = {
    name: company?.name || companyName,
    logoUrl: company?.logoUrl || companyLogoUrl,
    address: company?.address,
    postalCode: company?.postalCode,
    city: company?.city,
    phone: company?.phone,
    email: company?.email,
    website: company?.website,
    orgNumber: company?.orgNumber,
    bankgiro: company?.bankgiro || bankgiro,
    bankAccountNumber: company?.bankAccountNumber || bankAccountNumber,
  };

  const hasAnyDiscount = items.some((i) => (i.discountPercent ?? 0) > 0);
  const hasFooter = co.name || co.orgNumber || co.email || co.phone;
  const effectiveBankgiro = bankgiro || co.bankgiro;
  const effectiveAccountNumber = bankAccountNumber || co.bankAccountNumber;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="md:max-w-[960px] md:w-[92vw] md:max-h-[94vh] p-0 overflow-hidden flex flex-col">
        <DialogTitle className="sr-only">{t("invoices.preview", "Invoice preview")}</DialogTitle>
        {/* Header bar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30 flex-shrink-0">
          <Eye className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{t("invoices.preview")}</span>
          <span className="text-xs text-muted-foreground ml-auto">
            {t("invoices.previewHint", "This is how the invoice looks to the customer")}
          </span>
        </div>

        {/* Scrollable A4-style document */}
        <div className="flex-1 overflow-y-auto bg-neutral-100 dark:bg-neutral-900 p-3 sm:p-6 md:p-10">
          <div className="bg-white dark:bg-card shadow-xl rounded mx-auto max-w-[210mm] min-h-[280mm] relative flex flex-col" style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}>
            {/* Page content with proper A4 margins */}
            <div className="px-10 sm:px-14 md:px-16 py-10 sm:py-12 md:py-14 flex-1 flex flex-col text-[13px] leading-relaxed text-foreground">
              {/* Document header */}
              <div className="flex justify-between items-start mb-10">
                <div className="flex items-center gap-4">
                  {co.logoUrl && (
                    <img
                      src={co.logoUrl}
                      alt=""
                      className="h-14 w-auto max-w-[180px] object-contain"
                    />
                  )}
                  <div>
                    {co.name && <h2 className="text-lg font-semibold tracking-tight">{co.name}</h2>}
                    {co.orgNumber && (
                      <p className="text-xs text-muted-foreground mt-0.5">Org.nr: {co.orgNumber}</p>
                    )}
                    {(co.address || co.city) && (
                      <p className="text-xs text-muted-foreground">
                        {[co.address, [co.postalCode, co.city].filter(Boolean).join(" ")]
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right text-sm text-muted-foreground">
                  <p>{dateStr}</p>
                </div>
              </div>

              {/* Structured document title */}
              <div className="mb-8">
                <h1 className="text-2xl font-bold tracking-tight uppercase">
                  {t("invoices.invoiceLabel", "Faktura")}
                </h1>
                {projectName && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {t("invoices.projectLabel", "Projekt")}: {projectName}
                  </p>
                )}
                {clientName && (
                  <p className="text-sm text-muted-foreground">
                    {t("invoices.recipient", "Mottagare")}: {clientName}
                  </p>
                )}
                {invoiceNumber && (
                  <p className="text-sm text-muted-foreground">
                    {t("invoices.invoiceNumberLabel", "Fakturanr")}: {invoiceNumber}
                  </p>
                )}
                {dueDate && (
                  <p className="text-sm text-muted-foreground">
                    {t("invoices.dueDate")}: {new Date(dueDate).toLocaleDateString("sv-SE")}
                  </p>
                )}
              </div>

              {/* Free text introduction */}
              {freeText && (
                <div className="whitespace-pre-wrap text-muted-foreground mb-8 text-[13px] leading-relaxed">
                  {freeText}
                </div>
              )}

              {/* Items table */}
              <table className="w-full mb-8 border-collapse">
                <thead>
                  <tr className="border-b-2 border-foreground/20">
                    <th className="text-left py-2.5 pr-4 font-semibold text-[12px] uppercase tracking-wide text-muted-foreground">{t("quotes.description")}</th>
                    <th className="text-right py-2.5 px-3 font-semibold text-[12px] uppercase tracking-wide text-muted-foreground whitespace-nowrap">{t("quotes.quantity")}</th>
                    <th className="text-right py-2.5 px-3 font-semibold text-[12px] uppercase tracking-wide text-muted-foreground whitespace-nowrap">{t("quotes.unitPrice")} <span className="normal-case tracking-normal font-normal">({t("budget.exVat", "ex moms")})</span></th>
                    {hasAnyDiscount && (
                      <th className="text-right py-2.5 px-3 font-semibold text-[12px] uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                        {t("quotes.discount", "Discount")}
                      </th>
                    )}
                    <th className="text-right py-2.5 pl-3 font-semibold text-[12px] uppercase tracking-wide text-muted-foreground whitespace-nowrap">{t("quotes.totalAmount")} <span className="normal-case tracking-normal font-normal">({t("budget.exVat", "ex moms")})</span></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const discount = item.discountPercent ?? 0;
                    const lineTotal =
                      item.quantity * item.unitPrice * (1 - discount / 100);
                    return (
                      <tr key={item.id} className="border-b border-foreground/8">
                        <td className="py-2.5 pr-4">
                          {item.description || "\u2014"}
                          {item.isRotEligible && (
                            <span className="text-[11px] text-muted-foreground ml-1.5">(ROT)</span>
                          )}
                          {item.comment && (
                            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                              {item.comment}
                            </p>
                          )}
                        </td>
                        <td className="text-right py-2.5 px-3 whitespace-nowrap tabular-nums">
                          {item.quantity} {item.unit}
                        </td>
                        <td className="text-right py-2.5 px-3 whitespace-nowrap tabular-nums">{fmt(item.unitPrice)} kr</td>
                        {hasAnyDiscount && (
                          <td className="text-right py-2.5 px-3 whitespace-nowrap tabular-nums">
                            {discount > 0 ? `${discount}%` : "\u2014"}
                          </td>
                        )}
                        <td className="text-right py-2.5 pl-3 whitespace-nowrap tabular-nums font-medium">{fmt(lineTotal)} kr</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Summary -- right-aligned */}
              <div className="ml-auto w-72 space-y-1.5 text-[13px] mb-10">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("quotes.subtotal")} ({t("budget.exVat", "ex moms")})</span>
                  <span className="tabular-nums">{fmt(subtotal)} kr</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{vatRowLabel(t("quotes.vat"))}</span>
                  <span className="tabular-nums">{fmt(vat)} kr</span>
                </div>
                {rotDeduction > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>{t("quotes.rotDeduction")}</span>
                    <span className="tabular-nums">-{fmt(rotDeduction)} kr</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base border-t-2 border-foreground/20 pt-2.5 mt-2">
                  <span>{t("quotes.totalToPay")} ({t("budget.incVat", "ink. moms")})</span>
                  <span className="tabular-nums">{fmt(totalToPay)} kr</span>
                </div>
              </div>

              {/* Payment details */}
              {(effectiveBankgiro || effectiveAccountNumber || ocrReference) && (
                <div className="border rounded-lg p-5 bg-muted/20 mb-10 text-[13px]">
                  <p className="font-semibold text-sm mb-2">{t("invoices.paymentDetails")}</p>
                  {effectiveBankgiro && (
                    <p className="text-muted-foreground">
                      {t("invoices.bankgiro")}: <span className="text-foreground font-medium">{effectiveBankgiro}</span>
                    </p>
                  )}
                  {effectiveAccountNumber && (
                    <p className="text-muted-foreground">
                      {t("invoices.bankAccountNumber")}: <span className="text-foreground font-medium">{effectiveAccountNumber}</span>
                    </p>
                  )}
                  {ocrReference && (
                    <p className="text-muted-foreground">
                      {t("invoices.ocrReference")}: <span className="text-foreground font-medium">{ocrReference}</span>
                    </p>
                  )}
                </div>
              )}

              {/* Footer -- pushed to bottom */}
              {hasFooter && (
                <div className="mt-auto pt-10">
                  <div className="border-t pt-4 text-[11px] text-muted-foreground flex justify-between gap-6">
                    <div className="space-y-0.5">
                      {co.name && <p className="font-medium">{co.name}</p>}
                      {co.orgNumber && <p>Org.nr: {co.orgNumber}</p>}
                      {effectiveBankgiro && <p>Bankgiro: {effectiveBankgiro}</p>}
                      {(co.address || co.city) && (
                        <p>
                          {[co.address, [co.postalCode, co.city].filter(Boolean).join(" ")]
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                      )}
                    </div>
                    <div className="space-y-0.5 text-right">
                      {co.website && <p>{co.website}</p>}
                      {co.phone && <p>{co.phone}</p>}
                      {co.email && <p>{co.email}</p>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sticky action footer */}
        {onSend && (
          <div className="flex-shrink-0 border-t bg-background px-4 py-3">
            <Button className="w-full min-h-[48px]" onClick={onSend}>
              {t("invoices.sendToClient")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

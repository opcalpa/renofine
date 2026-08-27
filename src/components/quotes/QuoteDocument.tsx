import { useTranslation } from "react-i18next";
import { draftVat, vatLabel } from "@/lib/vat";
import type { QuoteItem } from "./QuoteItemRow";

export interface QuoteCompanyInfo {
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
}

interface QuoteDocumentProps {
  projectName: string;
  objectDescription?: string;
  items: QuoteItem[];
  freeText?: string;
  company?: QuoteCompanyInfo;
  clientName?: string;
  quoteNumber?: string | null;
  quoteDate?: string;
  compactMode?: boolean;
}

export function QuoteDocument({
  projectName,
  objectDescription,
  items,
  freeText,
  company,
  clientName,
  quoteNumber,
  quoteDate,
  compactMode = false,
}: QuoteDocumentProps) {
  const { t } = useTranslation();

  const lineItems = items.filter((i) => !i.sectionHeader);
  const hasAnyRoom = lineItems.some((i) => i.roomName);
  const netOf = (i: (typeof lineItems)[number]) =>
    i.quantity * i.unitPrice * (1 - (i.discountPercent ?? 0) / 100);
  const subtotal = lineItems.reduce((sum, i) => sum + netOf(i), 0);
  // Varje rad bär sin sats — 25 % är default, inte en inbyggd sanning.
  const vat = draftVat(lineItems.map((i) => ({ net: netOf(i), vatRate: i.vatRate })));
  const vatRowLabel = (base: string) => vatLabel(base, lineItems.map((i) => i.vatRate));
  const rotEligibleTotal = lineItems
    .filter((i) => i.isRotEligible)
    .reduce((sum, i) => sum + i.quantity * i.unitPrice * (1 - (i.discountPercent ?? 0) / 100), 0);
  const rotDeduction = rotEligibleTotal * 1.25 * 0.3; // 30% of inc moms (Skatteverket)
  const totalToPay = subtotal + vat - rotDeduction;

  const fmt = (n: number) =>
    n.toLocaleString("sv-SE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const dateStr = quoteDate
    ? new Date(quoteDate).toLocaleDateString("sv-SE")
    : new Date().toLocaleDateString("sv-SE");

  const co = company ?? {};
  const hasAnyDiscount = items.some((i) => (i.discountPercent ?? 0) > 0);
  const hasFooter = co.name || co.orgNumber || co.email || co.phone;

  return (
    <div
      className="bg-white dark:bg-card shadow-xl rounded mx-auto max-w-[210mm] min-h-[280mm] relative flex flex-col"
      style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}
    >
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

        {/* Title block */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight uppercase">
            {t("quotes.quoteLabel", "Offert")}
          </h1>
          {projectName && (
            <p className="text-sm text-muted-foreground mt-1">
              {t("quotes.projectLabel", "Projekt")}: {projectName}
            </p>
          )}
          {objectDescription && (
            <p className="text-sm text-muted-foreground">
              {t("quotes.objectLabel", "Objekt")}: {objectDescription}
            </p>
          )}
          {clientName && (
            <p className="text-sm text-muted-foreground">
              {t("quotes.recipient", "Mottagare")}: {clientName}
            </p>
          )}
          {quoteNumber && (
            <p className="text-sm text-muted-foreground">
              {t("quotes.quoteNumberLabel", "Offertnr")}: {quoteNumber}
            </p>
          )}
        </div>

        {/* Free text */}
        {freeText && (
          <div className="whitespace-pre-wrap text-muted-foreground mb-8 text-[13px] leading-relaxed">
            {freeText}
          </div>
        )}

        {/* Items table */}
        <table className="w-full mb-8 border-collapse">
          <thead>
            <tr className="border-b-2 border-foreground/20">
              <th className={`text-left pr-4 font-semibold text-[12px] uppercase tracking-wide text-muted-foreground ${compactMode ? "py-1.5" : "py-2.5"}`}>{t("quotes.description")}</th>
              {hasAnyRoom && (
                <th className={`text-left px-3 font-semibold text-[12px] uppercase tracking-wide text-muted-foreground whitespace-nowrap ${compactMode ? "py-1.5" : "py-2.5"}`}>{t("tasks.room", "Rum")}</th>
              )}
              <th className={`text-right px-3 font-semibold text-[12px] uppercase tracking-wide text-muted-foreground whitespace-nowrap ${compactMode ? "py-1.5" : "py-2.5"}`}>{t("quotes.quantity")}</th>
              <th className={`text-right px-3 font-semibold text-[12px] uppercase tracking-wide text-muted-foreground whitespace-nowrap ${compactMode ? "py-1.5" : "py-2.5"}`}>{t("quotes.unitPrice")} <span className="normal-case tracking-normal font-normal">({t("budget.exVat", "ex moms")})</span></th>
              {hasAnyDiscount && (
                <th className={`text-right px-3 font-semibold text-[12px] uppercase tracking-wide text-muted-foreground whitespace-nowrap ${compactMode ? "py-1.5" : "py-2.5"}`}>
                  {t("quotes.discount", "Discount")}
                </th>
              )}
              <th className={`text-right pl-3 font-semibold text-[12px] uppercase tracking-wide text-muted-foreground whitespace-nowrap ${compactMode ? "py-1.5" : "py-2.5"}`}>{t("quotes.totalAmount")} <span className="normal-case tracking-normal font-normal">({t("budget.exVat", "ex moms")})</span></th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((item) => {
              const discount = item.discountPercent ?? 0;
              const lineTotal = item.quantity * item.unitPrice * (1 - discount / 100);
              const cellPy = compactMode ? "py-1" : "py-2.5";
              return (
                <tr key={item.id} className="border-b border-foreground/8">
                  <td className={`pr-4 ${cellPy}`}>
                    {item.description || "—"}
                    {item.isRotEligible && (
                      <span className="text-[11px] text-muted-foreground ml-1.5">(ROT)</span>
                    )}
                    {item.comment && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                        {item.comment}
                      </p>
                    )}
                  </td>
                  {hasAnyRoom && (
                    <td className={`text-left px-3 whitespace-nowrap text-[13px] text-muted-foreground ${cellPy}`}>
                      {item.roomName || ""}
                    </td>
                  )}
                  <td className={`text-right px-3 whitespace-nowrap tabular-nums ${cellPy}`}>
                    {item.quantity} {item.unit}
                  </td>
                  <td className={`text-right px-3 whitespace-nowrap tabular-nums ${cellPy}`}>{fmt(item.unitPrice)} kr</td>
                  {hasAnyDiscount && (
                    <td className={`text-right px-3 whitespace-nowrap tabular-nums ${cellPy}`}>
                      {discount > 0 ? `${discount}%` : "—"}
                    </td>
                  )}
                  <td className={`text-right pl-3 whitespace-nowrap tabular-nums font-medium ${cellPy}`}>{fmt(lineTotal)} kr</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Summary */}
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

        {/* Footer */}
        {hasFooter && (
          <div className="mt-auto pt-10">
            <div className="border-t pt-4 text-[11px] text-muted-foreground flex justify-between gap-6">
              <div className="space-y-0.5">
                {co.name && <p className="font-medium">{co.name}</p>}
                {co.orgNumber && <p>Org.nr: {co.orgNumber}</p>}
                {co.bankgiro && <p>Bankgiro: {co.bankgiro}</p>}
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
  );
}

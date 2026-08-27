import { useTranslation } from "react-i18next";
import type { QuoteItem } from "./QuoteItemRow";
import { draftVat, vatLabel } from "@/lib/vat";

interface QuoteSummaryProps {
  items: QuoteItem[];
}

export function QuoteSummary({ items }: QuoteSummaryProps) {
  const { t } = useTranslation();

  const lineItems = items.filter((i) => !i.sectionHeader);
  const netOf = (i: QuoteItem) => i.quantity * i.unitPrice * (1 - (i.discountPercent ?? 0) / 100);
  const subtotal = lineItems.reduce((sum, i) => sum + netOf(i), 0);
  // Varje rad bär sin sats, så en 0 %-rad blir rätt redan i utkastet.
  const vat = draftVat(lineItems.map((i) => ({ net: netOf(i), vatRate: i.vatRate })));
  const vatRowLabel = (base: string) => vatLabel(base, lineItems.map((i) => i.vatRate));
  const rotEligibleTotal = lineItems
    .filter((i) => i.isRotEligible)
    .reduce((sum, i) => sum + i.quantity * i.unitPrice * (1 - (i.discountPercent ?? 0) / 100), 0);
  const rotDeduction = rotEligibleTotal * 1.25 * 0.3; // 30% of inc moms (Skatteverket)
  const totalToPay = subtotal + vat - rotDeduction;

  const fmt = (n: number) => n.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="sticky bottom-0 rounded-lg border bg-card p-4 space-y-1 shadow-lg">
      <div className="flex justify-between text-sm">
        <span>{t("quotes.subtotal")} ({t("budget.exVat", "ex moms")})</span>
        <span>{fmt(subtotal)} kr</span>
      </div>
      <div className="flex justify-between text-sm">
        <span>{vatRowLabel(t("quotes.vat"))}</span>
        <span>{fmt(vat)} kr</span>
      </div>
      {rotDeduction > 0 && (
        <div className="flex justify-between text-sm text-green-600">
          <span>{t("quotes.rotDeduction")}</span>
          <span>-{fmt(rotDeduction)} kr</span>
        </div>
      )}
      <div className="flex justify-between font-semibold text-base pt-2 border-t">
        <span>{t("quotes.totalToPay")} ({t("budget.incVat", "ink. moms")})</span>
        <span>{fmt(totalToPay)} kr</span>
      </div>
    </div>
  );
}

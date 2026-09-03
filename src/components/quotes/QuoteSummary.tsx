import { useTranslation } from "react-i18next";
import type { QuoteItem } from "./QuoteItemRow";
import { draftVat, vatLabel } from "@/lib/vat";
import { capRot, rotFromLaborNet, DEFAULT_ROT_CAPACITY, type RotCapacity } from "@/lib/rot";

interface QuoteSummaryProps {
  items: QuoteItem[];
  /** Projektets ROT-utrymme. Utelämnad = en person på årets tak — hellre för
   *  lågt avdrag än ett slutpris kunden inte kan få. */
  rotCapacity?: RotCapacity;
}

export function QuoteSummary({ items, rotCapacity = DEFAULT_ROT_CAPACITY }: QuoteSummaryProps) {
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
  // 30 % av arbetskostnaden ink moms, MED årstaket — se lib/rot.ts.
  const rot = capRot(rotFromLaborNet(rotEligibleTotal), rotCapacity);
  const totalToPay = subtotal + vat - rot.deduction;

  // Samma avrundning som QuoteDocument: sammanfattningen ska visa exakt det
  // belopp kunden får på pappret, inte ett öre ifrån.
  const fmt = (n: number) => n.toLocaleString("sv-SE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

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
      {rot.deduction > 0 && (
        <>
          <div className="flex justify-between text-sm text-green-600">
            <span>{t("quotes.rotDeduction")}</span>
            <span>-{fmt(rot.deduction)} kr</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {rot.isCapped
              ? t("quotes.rotCappedNote", {
                  limit: fmt(rot.totalLimit),
                  count: rot.personCount,
                  defaultValue:
                    "Cap reached: max {{limit}} kr for {{count}} person(s) this year.",
                })
              : t("quotes.rotCapNote", {
                  limit: fmt(rot.totalLimit),
                  count: rot.personCount,
                  defaultValue:
                    "Based on {{limit}} kr of ROT allowance for {{count}} person(s).",
                })}
          </p>
        </>
      )}
      <div className="flex justify-between font-semibold text-base pt-2 border-t">
        <span>{t("quotes.totalToPay")} ({t("budget.incVat", "ink. moms")})</span>
        <span>{fmt(totalToPay)} kr</span>
      </div>
    </div>
  );
}

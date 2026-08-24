/**
 * The printable spend panel: totals, ROT basis, per vendor, per room.
 *
 * Rendered identically for one project (the completed-project summary) and for
 * a whole address (the roll-up across every renovation on it) — same engine,
 * same layout, so the numbers read the same wherever you meet them.
 */

import { useTranslation } from 'react-i18next';
import { Printer, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/currency';
import type { SpendRollup, NamedTotal } from '@/lib/spendRollup';

interface Props {
  rollup: SpendRollup;
  currency?: string | null;
  /** Homeowners see amounts incl. VAT, pros ex VAT — the label always says which. */
  isHomeowner: boolean;
  showTaxDeduction?: boolean;
  title: string;
  icon?: React.ReactNode;
  /** Extra note under the header (the address page explains its ROT caveat). */
  note?: string;
}

export function SpendSummaryPanel({
  rollup,
  currency,
  isHomeowner,
  showTaxDeduction,
  title,
  icon,
  note,
}: Props) {
  const { t } = useTranslation();

  const vatLabel = isHomeowner
    ? t('common.inclVat', 'inkl. moms')
    : t('common.exclVat', 'exkl. moms');

  const nameOr = (row: NamedTotal, fallback: string) => row.name ?? fallback;

  return (
    <section className="rounded-xl border bg-card print:border-0" data-print-section>
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-sm font-semibold">{title}</h2>
          <span className="text-xs text-muted-foreground">({vatLabel})</span>
        </div>
        <Button variant="outline" size="sm" className="print:hidden" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-1.5" />
          {t('overview.completed.print', 'Skriv ut')}
        </Button>
      </header>

      {note && (
        <p className="border-b px-4 py-2 text-xs text-muted-foreground">{note}</p>
      )}

      <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-4">
        {[
          { label: t('purchases.totalPurchased', 'Totalt inköpt'), value: rollup.totals.spentTotal },
          { label: t('purchases.paid', 'Betalt'), value: rollup.totals.paidTotal },
          { label: t('purchases.ordered', 'Beställt'), value: rollup.totals.committedTotal },
          ...(showTaxDeduction
            ? [{ label: t('overview.completed.rot', 'ROT-underlag'), value: rollup.rotTotal }]
            : []),
        ].map((cell) => (
          <div key={cell.label} className="bg-card px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{cell.label}</div>
            <div className="mt-0.5 text-lg font-semibold tabular-nums">
              {formatCurrency(cell.value, currency)}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 border-t px-4 py-4 md:grid-cols-2">
        <div>
          <div className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">
            {t('overview.completed.byVendor', 'Per leverantör')}
          </div>
          <ul className="space-y-1 text-sm">
            {rollup.byVendor.map((v) => (
              <li key={v.name ?? '__none__'} className="flex items-center justify-between gap-3">
                <span className="truncate">
                  {nameOr(v, t('overview.completed.unknownVendor', 'Okänd leverantör'))}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {formatCurrency(v.total, currency)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {rollup.byRoom.length > 0 && (
          <div>
            <div className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">
              {t('overview.completed.byRoom', 'Per rum')}
            </div>
            <ul className="space-y-1 text-sm">
              {rollup.byRoom.map((r) => (
                <li key={r.name ?? '__none__'} className="flex items-center justify-between gap-3">
                  <span className="truncate">
                    {nameOr(r, t('overview.completed.unassigned', 'Ej rumsatt'))}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatCurrency(r.total, currency)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <footer className="flex items-center gap-1.5 border-t px-4 py-2.5 text-xs text-muted-foreground">
        <Paperclip className="h-3.5 w-3.5 shrink-0" />
        {t('overview.completed.receipts', '{{withReceipt}} av {{total}} inköp har underlag sparat.', {
          withReceipt: rollup.withReceiptCount,
          total: rollup.poCount,
        })}
      </footer>
    </section>
  );
}

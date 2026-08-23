/**
 * Completed-project summary (Skiva 3).
 *
 * A finished renovation still has to answer three questions: what did it cost,
 * what can be deducted, and where is the paperwork. This is the retro project's
 * whole reason to exist — the sale, the tax return, the "what did we pay for
 * the bathroom" argument two years later. Printable, because that is how these
 * numbers actually get used.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Printer, ReceiptText, Paperclip } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/currency';
import { computePurchaseTotals, type PurchaseOrderLike } from '@/lib/purchaseTotals';

interface SummaryPO extends PurchaseOrderLike {
  vendor_name: string | null;
  receipt_file_path: string | null;
  rot_amount?: number | null;
}

interface Props {
  projectId: string;
  currency?: string | null;
  /** Homeowners see amounts incl. VAT, pros ex VAT — the label always says which. */
  isHomeowner: boolean;
  /** ROT/RUT only where the market has it. */
  showTaxDeduction?: boolean;
}

interface RoomSpend {
  roomName: string;
  total: number;
}

export function CompletedProjectSummary({ projectId, currency, isHomeowner, showTaxDeduction }: Props) {
  const { t } = useTranslation();
  const [pos, setPos] = useState<SummaryPO[] | null>(null);
  const [rotTotal, setRotTotal] = useState(0);
  const [roomSpend, setRoomSpend] = useState<RoomSpend[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [poRes, matRes, linkRes] = await Promise.all([
        supabase
          .from('purchase_orders')
          .select('id, vendor_name, total, status, paid_at, receipt_file_path, rot_amount')
          .eq('project_id', projectId),
        supabase
          .from('materials')
          .select('price_total, rot_amount, room_id, rooms(name)')
          .eq('project_id', projectId),
        supabase
          .from('task_file_links')
          .select('rot_amount, task_id, material_id')
          .eq('project_id', projectId),
      ]);
      if (cancelled) return;

      const orders = (poRes.data ?? []) as SummaryPO[];
      setPos(orders);

      // ROT comes from three places that never overlap: the orders themselves,
      // planned materials, and standalone file links (an invoice attached to
      // neither a task nor a material). Mirrors HomeownerYearlyAnalysis.
      const materials = (matRes.data ?? []) as Array<{
        price_total: number | null;
        rot_amount: number | null;
        room_id: string | null;
        rooms: { name: string } | null;
      }>;
      const links = (linkRes.data ?? []) as Array<{
        rot_amount: number | null;
        task_id: string | null;
        material_id: string | null;
      }>;
      const rot =
        orders.reduce((s, po) => s + (po.rot_amount || 0), 0) +
        materials.reduce((s, m) => s + (m.rot_amount || 0), 0) +
        links
          .filter((fl) => !fl.task_id && !fl.material_id)
          .reduce((s, fl) => s + (fl.rot_amount || 0), 0);
      setRotTotal(rot);

      const byRoom = new Map<string, number>();
      for (const m of materials) {
        if (!m.price_total) continue;
        const name = m.rooms?.name ?? t('overview.completed.unassigned', 'Ej rumsatt');
        byRoom.set(name, (byRoom.get(name) ?? 0) + m.price_total);
      }
      setRoomSpend(
        Array.from(byRoom, ([roomName, total]) => ({ roomName, total })).sort((a, b) => b.total - a.total)
      );
    })();
    return () => { cancelled = true; };
  }, [projectId, t]);

  const totals = useMemo(() => computePurchaseTotals(pos ?? []), [pos]);

  const byVendor = useMemo(() => {
    const map = new Map<string, number>();
    for (const po of pos ?? []) {
      const name = po.vendor_name?.trim() || t('overview.completed.unknownVendor', 'Okänd leverantör');
      map.set(name, (map.get(name) ?? 0) + (po.total || 0));
    }
    return Array.from(map, ([vendor, total]) => ({ vendor, total })).sort((a, b) => b.total - a.total);
  }, [pos, t]);

  const withReceipt = (pos ?? []).filter((po) => po.receipt_file_path).length;

  // Nothing bought → nothing to sum up. Don't show an empty ceremony.
  if (!pos || pos.length === 0) return null;

  const vatLabel = isHomeowner
    ? t('common.inclVat', 'inkl. moms')
    : t('common.exclVat', 'exkl. moms');

  return (
    <section className="rounded-xl border bg-card print:border-0" data-print-section>
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <ReceiptText className="h-4 w-4 text-primary shrink-0" />
          <h2 className="text-sm font-semibold">
            {t('overview.completed.title', 'Sammanställning')}
          </h2>
          <span className="text-xs text-muted-foreground">({vatLabel})</span>
        </div>
        <Button variant="outline" size="sm" className="print:hidden" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-1.5" />
          {t('overview.completed.print', 'Skriv ut')}
        </Button>
      </header>

      <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-4">
        {[
          { label: t('purchases.totalPurchased', 'Totalt inköpt'), value: totals.spentTotal },
          { label: t('purchases.paid', 'Betalt'), value: totals.paidTotal },
          { label: t('purchases.ordered', 'Beställt'), value: totals.committedTotal },
          ...(showTaxDeduction
            ? [{ label: t('overview.completed.rot', 'ROT-underlag'), value: rotTotal }]
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
            {byVendor.map((v) => (
              <li key={v.vendor} className="flex items-center justify-between gap-3">
                <span className="truncate">{v.vendor}</span>
                <span className="tabular-nums text-muted-foreground">{formatCurrency(v.total, currency)}</span>
              </li>
            ))}
          </ul>
        </div>

        {roomSpend.length > 0 && (
          <div>
            <div className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">
              {t('overview.completed.byRoom', 'Per rum')}
            </div>
            <ul className="space-y-1 text-sm">
              {roomSpend.map((r) => (
                <li key={r.roomName} className="flex items-center justify-between gap-3">
                  <span className="truncate">{r.roomName}</span>
                  <span className="tabular-nums text-muted-foreground">{formatCurrency(r.total, currency)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <footer className="flex items-center gap-1.5 border-t px-4 py-2.5 text-xs text-muted-foreground">
        <Paperclip className="h-3.5 w-3.5 shrink-0" />
        {t('overview.completed.receipts', '{{withReceipt}} av {{total}} inköp har underlag sparat.', {
          withReceipt,
          total: pos.length,
        })}
      </footer>
    </section>
  );
}

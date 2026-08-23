/**
 * Purchase spend buckets — one engine.
 *
 * "Beställt / Betalt / Totalt inköpt" is cash reality derived from real
 * purchase orders, independent of whether a line was ever budgeted. The
 * purchases tab renders it live; the completed-project summary (Skiva 3)
 * renders the same numbers for the archive. Both read this so a project can't
 * report two different totals depending on which screen you're on.
 */

/** The PO fields the buckets need — structurally typed so callers can pass more. */
export interface PurchaseOrderLike {
  id: string;
  total: number | null;
  status: string;
  /** Optional: some callers type it as an optional column. */
  paid_at?: string | null;
}

/** Committed-but-unpaid states (incl. delivered-on-invoice-terms). */
const COMMITTED_STATUSES = ['ordered', 'delivered', 'pending'];

export interface PurchaseTotals<T extends PurchaseOrderLike> {
  /** Paid in cash. */
  paidTotal: number;
  /** Committed but not yet paid. */
  committedTotal: number;
  /** paid + committed — everything the project has actually bought. */
  spentTotal: number;
  paidPOs: T[];
  orderedPOs: T[];
}

export function computePurchaseTotals<T extends PurchaseOrderLike>(
  purchaseOrders: T[]
): PurchaseTotals<T> {
  const paidPOs = purchaseOrders.filter((po) => po.paid_at);
  const orderedPOs = purchaseOrders.filter(
    (po) => !po.paid_at && COMMITTED_STATUSES.includes(po.status)
  );
  const sum = (pos: T[]) => pos.reduce((s, po) => s + (po.total || 0), 0);
  const paidTotal = sum(paidPOs);
  const committedTotal = sum(orderedPOs);

  return {
    paidTotal,
    committedTotal,
    spentTotal: paidTotal + committedTotal,
    paidPOs,
    orderedPOs,
  };
}

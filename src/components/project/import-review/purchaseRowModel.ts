/**
 * What one purchase row IS, derived once and used by every surface that draws
 * it (desktop list, mobile sheet, bulk actions, filters).
 *
 * The review page used to compute "does this need a look?" inline while
 * rendering, which meant the filter chips, the tab dot, the group headers and
 * the bulk menu each had their own idea of the same question. One derivation,
 * one answer.
 */

import type { AgentProposal, ProposalAction } from '@/services/agent/types';
import type { ImportSession } from '@/services/agent/importSession';
import { purchaseProposals } from '@/services/agent/importSession';

type PurchaseAction = Extract<ProposalAction, { type: 'import_purchase' }>;

export interface PurchaseRow {
  proposal: AgentProposal;
  action: PurchaseAction;
  id: string;
  vendor: string;
  total: number;
  date: string | null;
  lineCount: number;
  invoiceNumber: string | null;
  /** VAT as read from the document — shown apart, never folded into the total. */
  vatAmount: number | null;
  dueDate: string | null;
  roomId: string | null;
  /** Line amounts don't add up to the header total — check it against the image. */
  sumMismatch: number | null;
  /** Already booked in the project (same vendor + invoice no, or vendor+date+amount). */
  duplicateOfExisting: boolean;
  /**
   * Probably the SAME receipt photographed twice inside this drop — the A4
   * with stapled receipts, shot flat and then lifted (Carl, 2026-09-01).
   * Holds the other row's source file so the flag can name it.
   */
  pairOf: string | null;
  kept: boolean;
  /** Warning or duplicate — the rows that earn "Behöver din blick". */
  needsLook: boolean;
}

/** Line amounts vs. the header total; null when they agree or can't be judged. */
function lineSumMismatch(action: PurchaseAction): number | null {
  if (action.lineItems.length <= 1) return null;
  const sum = action.lineItems.reduce((s, li) => s + (li.total ?? 0), 0);
  if (sum <= 0) return null;
  return Math.abs(sum - action.total) > 1 ? sum : null;
}

/** Same vendor and same amount inside one drop — almost always one receipt twice. */
function pairKey(action: PurchaseAction): string {
  return `${action.vendorName.trim().toLowerCase()}|${Math.round(action.total * 100)}`;
}

export function buildPurchaseRows(session: ImportSession): PurchaseRow[] {
  const proposals = purchaseProposals(session);

  // In-batch duplicates: group by vendor+amount, and only the SECOND and later
  // members are flagged — the first is the one to keep, so the flag points at
  // what to remove rather than accusing both.
  const byKey = new Map<string, AgentProposal[]>();
  for (const p of proposals) {
    if (p.action.type !== 'import_purchase') continue;
    const key = pairKey(p.action);
    byKey.set(key, [...(byKey.get(key) ?? []), p]);
  }
  const pairs = new Map<string, string>();
  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    const first = group[0];
    for (const later of group.slice(1)) {
      pairs.set(later.id, first.sourceFile ?? first.id);
    }
  }

  return proposals.flatMap((proposal) => {
    if (proposal.action.type !== 'import_purchase') return [];
    const action = proposal.action;
    const mismatch = lineSumMismatch(action);
    const pairOf = pairs.get(proposal.id) ?? null;
    return [
      {
        proposal,
        action,
        id: proposal.id,
        vendor: action.vendorName,
        total: action.total,
        date: action.documentDate ?? null,
        lineCount: action.lineItems.length,
        invoiceNumber: action.invoiceNumber ?? null,
        vatAmount: action.vatAmount ?? null,
        dueDate: action.dueDate ?? null,
        roomId: action.roomId ?? null,
        sumMismatch: mismatch,
        duplicateOfExisting: !!proposal.duplicateOfExisting,
        pairOf,
        kept: !session.rejected.has(proposal.id),
        needsLook: mismatch !== null || !!proposal.duplicateOfExisting || pairOf !== null,
      },
    ];
  });
}

export type PurchaseFilter = 'all' | 'needsLook' | 'noRoom' | 'dropped';

export function filterRows(
  rows: PurchaseRow[],
  filter: PurchaseFilter,
  query: string
): PurchaseRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (filter === 'needsLook' && !row.needsLook) return false;
    if (filter === 'noRoom' && row.roomId) return false;
    if (filter === 'dropped' && row.kept) return false;
    if (!q) return true;
    return (
      row.vendor.toLowerCase().includes(q) ||
      (row.proposal.sourceFile ?? '').toLowerCase().includes(q) ||
      (row.invoiceNumber ?? '').toLowerCase().includes(q)
    );
  });
}

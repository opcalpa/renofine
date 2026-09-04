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
import { verifyReceipt, type ReceiptIssue } from '@/lib/verifyReceipt';
import type { DocumentType } from '@/services/smartUploadService';

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
  /** A room this batch will CREATE — set when roomId is still null. */
  roomName: string | null;
  /** The file this reading came from — makes a mispairing visible at a glance. */
  sourceFile: string | null;
  /** Line amounts don't add up to the header total — check it against the image. */
  sumMismatch: number | null;
  /**
   * Everything the arithmetic could not reconcile, recomputed on every edit so
   * a value you just corrected stops being flagged the moment you correct it.
   */
  issues: ReceiptIssue[];
  /** True when a field the row cannot do without is missing or contradictory. */
  blocking: boolean;
  /** Already booked in the project (same vendor + invoice no, or vendor+date+amount). */
  duplicateOfExisting: boolean;
  /**
   * Probably the SAME receipt photographed twice inside this drop — the A4
   * with stapled receipts, shot flat and then lifted (Carl, 2026-09-01).
   * Holds the other row's source file so the flag can name it.
   */
  pairOf: string | null;
  /** The proposal id of that partner — jump to it, or merge with it. */
  pairOfId: string | null;
  /**
   * True on the row that SURVIVES a merge. Both members of a pair carry the
   * flag now: deciding whether two readings are one receipt means looking at
   * both, and only flagging the second left its partner sitting silently in
   * "Ser bra ut", pages away from the row asking about it (Carl, 2026-09-03).
   */
  pairPrimary: boolean;
  /** Shared by both members, so the list can seat them next to each other. */
  pairKey: string | null;
  kept: boolean;
  /**
   * Not a purchase after all — the FILE is kept, filed under this type.
   *
   * The row stays in the list saying so. "Ta inte med" throws the document
   * away with the reading; this throws only the reading away, which is what a
   * misread följesedel actually needs (Carl, 2026-09-03).
   */
  savedAsDocument: DocumentType | null;
  /** The person has looked at the warning and accepted the row as it stands. */
  acknowledged: boolean;
  /** How many underlag this order will own: the original plus merged pages. */
  pageCount: number;
  /**
   * Booked OUTSIDE the accepted budget — an ÄTA.
   *
   * Not a document type: the paper is an ordinary invoice or receipt and
   * usually says nothing about ÄTA at all. This is the RELATIONSHIP between
   * the cost and the accepted quote (Carl, 2026-09-04), and it rides the
   * action's existing `bookAsAta` into `materials.exclude_from_budget`, which
   * is what the budget already splits on.
   */
  bookAsAta: boolean;
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
  // A row merged into another is no longer its own row — it is a page of the
  // one that survived. Leaving it in the list as an "excluded" row would say
  // the person threw a receipt away, when they did the opposite.
  const mergedAway = new Set(Object.keys(session.merged ?? {}));

  const byKey = new Map<string, AgentProposal[]>();
  for (const p of proposals) {
    if (p.action.type !== 'import_purchase') continue;
    // A page that has already been folded in is not a duplicate any more, and
    // leaving it in the grouping keeps the flag lit on a pair that no longer
    // exists — the person resolved it and the row still nags.
    if (mergedAway.has(p.id)) continue;
    const key = pairKey(p.action);
    byKey.set(key, [...(byKey.get(key) ?? []), p]);
  }
  const pairs = new Map<string, string>();
  const pairIds = new Map<string, string>();
  const pairKeys = new Map<string, string>();
  const primaries = new Set<string>();
  for (const [key, group] of byKey.entries()) {
    if (group.length < 2) continue;
    const first = group[0];
    primaries.add(first.id);
    // The survivor points at the first of its duplicates; every duplicate
    // points back at the survivor. Both directions exist so either row can
    // open the other.
    pairs.set(first.id, group[1].sourceFile ?? group[1].id);
    pairIds.set(first.id, group[1].id);
    pairKeys.set(first.id, key);
    for (const later of group.slice(1)) {
      pairs.set(later.id, first.sourceFile ?? first.id);
      pairIds.set(later.id, first.id);
      pairKeys.set(later.id, key);
    }
  }

  return proposals.flatMap((proposal) => {
    if (proposal.action.type !== 'import_purchase') return [];
    if (mergedAway.has(proposal.id)) return [];
    const action = proposal.action;
    const mismatch = lineSumMismatch(action);
    const pairOf = pairs.get(proposal.id) ?? null;
    const savedAsDocument = session.savedAsDocument?.[proposal.id] ?? null;
    const acknowledged = !!session.acknowledged?.has(proposal.id);
    const issues = verifyReceipt({
      vendor_name: action.vendorName || null,
      total_amount: action.total,
      vat_amount: action.vatAmount ?? null,
      purchase_date: action.documentDate ?? null,
      invoice_number: action.invoiceNumber ?? null,
      document_type: action.documentType,
      line_items: action.lineItems.map((li) => ({ total: li.total })),
      confidence: action.readConfidence ?? null,
      total_printed: action.totalPrinted ?? null,
    });
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
        roomName: action.roomName ?? null,
        sourceFile: action.sourceFileName ?? proposal.sourceFile ?? null,
        sumMismatch: mismatch,
        issues,
        blocking: issues.some((i) => i.level === 'blocking'),
        bookAsAta: !!action.bookAsAta,
        duplicateOfExisting: !!proposal.duplicateOfExisting,
        pairOf,
        pairOfId: pairIds.get(proposal.id) ?? null,
        pairPrimary: primaries.has(proposal.id),
        pairKey: pairKeys.get(proposal.id) ?? null,
        kept: !session.rejected.has(proposal.id),
        savedAsDocument,
        acknowledged,
        pageCount: 1 + (action.extraPages?.length ?? 0),
        // Acknowledged rows leave the queue. The flag stays visible on the row
        // itself — the person said "I looked", not "pretend it never happened".
        // A row filed as a document is a decided row: its warning was about a
        // purchase that is no longer being made.
        needsLook:
          !acknowledged &&
          !savedAsDocument &&
          (issues.length > 0 || !!proposal.duplicateOfExisting || pairOf !== null),
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
    if (filter === 'noRoom' && (row.roomId || row.roomName)) return false;
    // "Urbockade" means thrown away. A row saved as a document was kept — as
    // a paper rather than as a cost — and listing it here would say otherwise.
    if (filter === 'dropped' && (row.kept || row.savedAsDocument)) return false;
    if (!q) return true;
    return (
      row.vendor.toLowerCase().includes(q) ||
      (row.proposal.sourceFile ?? '').toLowerCase().includes(q) ||
      (row.invoiceNumber ?? '').toLowerCase().includes(q)
    );
  });
}

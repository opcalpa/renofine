/**
 * Spend roll-up — one engine for "what did this cost".
 *
 * Takes one or many projects and returns the same numbers either way, so a
 * project's own summary and its address's roll-up can never disagree about
 * what was spent. Extracted from CompletedProjectSummary (Skiva 3) when the
 * address page needed the same figures across several projects.
 *
 * Returns raw names (null where unknown) rather than translated labels — the
 * caller owns the wording.
 */

import { supabase } from '@/integrations/supabase/client';
import { computePurchaseTotals, type PurchaseTotals, type PurchaseOrderLike } from '@/lib/purchaseTotals';

export interface RollupPO extends PurchaseOrderLike {
  project_id: string;
  vendor_name: string | null;
  receipt_file_path: string | null;
  rot_amount?: number | null;
}

export interface NamedTotal {
  /** null = no vendor / no room recorded. */
  name: string | null;
  total: number;
}

export interface SpendRollup {
  totals: PurchaseTotals<RollupPO>;
  /**
   * ROT basis. Comes from three sources that never overlap: the orders
   * themselves, planned materials, and standalone file links (an invoice
   * attached to neither a task nor a material). Mirrors HomeownerYearlyAnalysis.
   */
  rotTotal: number;
  byVendor: NamedTotal[];
  byRoom: NamedTotal[];
  /** Spend per project — the address page lists renovations, not just a total. */
  byProject: Map<string, number>;
  poCount: number;
  withReceiptCount: number;
}

export const EMPTY_ROLLUP: SpendRollup = {
  totals: { paidTotal: 0, committedTotal: 0, spentTotal: 0, paidPOs: [], orderedPOs: [] },
  rotTotal: 0,
  byVendor: [],
  byRoom: [],
  byProject: new Map(),
  poCount: 0,
  withReceiptCount: 0,
};

function sortDesc(map: Map<string | null, number>): NamedTotal[] {
  return Array.from(map, ([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
}

/**
 * Fetch and aggregate spend across the given projects.
 *
 * Never throws: a failed sub-query degrades that part of the roll-up to zero
 * rather than blanking the whole page.
 */
export async function fetchSpendRollup(projectIds: string[]): Promise<SpendRollup> {
  if (projectIds.length === 0) return EMPTY_ROLLUP;

  const [poRes, matRes, linkRes] = await Promise.all([
    supabase
      .from('purchase_orders')
      .select('id, project_id, vendor_name, total, status, paid_at, receipt_file_path, rot_amount')
      .in('project_id', projectIds),
    supabase
      .from('materials')
      .select('project_id, price_total, rot_amount, room_id, rooms(name)')
      .in('project_id', projectIds),
    supabase
      .from('task_file_links')
      .select('project_id, rot_amount, task_id, material_id')
      .in('project_id', projectIds),
  ]);

  if (poRes.error) console.error('fetchSpendRollup: purchase_orders failed:', poRes.error);
  if (matRes.error) console.error('fetchSpendRollup: materials failed:', matRes.error);
  if (linkRes.error) console.error('fetchSpendRollup: task_file_links failed:', linkRes.error);

  const orders = (poRes.data ?? []) as RollupPO[];
  const materials = (matRes.data ?? []) as Array<{
    project_id: string;
    price_total: number | null;
    rot_amount: number | null;
    room_id: string | null;
    rooms: { name: string } | null;
  }>;
  const links = (linkRes.data ?? []) as Array<{
    project_id: string;
    rot_amount: number | null;
    task_id: string | null;
    material_id: string | null;
  }>;

  const rotTotal =
    orders.reduce((s, po) => s + (po.rot_amount || 0), 0) +
    materials.reduce((s, m) => s + (m.rot_amount || 0), 0) +
    links
      .filter((fl) => !fl.task_id && !fl.material_id)
      .reduce((s, fl) => s + (fl.rot_amount || 0), 0);

  const vendorMap = new Map<string | null, number>();
  const projectMap = new Map<string, number>();
  for (const po of orders) {
    const vendor = po.vendor_name?.trim() || null;
    vendorMap.set(vendor, (vendorMap.get(vendor) ?? 0) + (po.total || 0));
    projectMap.set(po.project_id, (projectMap.get(po.project_id) ?? 0) + (po.total || 0));
  }

  const roomMap = new Map<string | null, number>();
  for (const m of materials) {
    if (!m.price_total) continue;
    roomMap.set(m.rooms?.name ?? null, (roomMap.get(m.rooms?.name ?? null) ?? 0) + m.price_total);
  }

  return {
    totals: computePurchaseTotals(orders),
    rotTotal,
    byVendor: sortDesc(vendorMap),
    byRoom: sortDesc(roomMap),
    byProject: projectMap,
    poCount: orders.length,
    withReceiptCount: orders.filter((po) => po.receipt_file_path).length,
  };
}

export interface POMaterial {
  id: string;
  name: string;
  description?: string | null;
  quantity: number;
  unit: string;
  price_per_unit: number | null;
  price_total: number | null;
  ordered_amount: number | null;
  paid_amount: number | null;
  vendor_name: string | null;
  vendor_link: string | null;
  status: string;
  exclude_from_budget: boolean;
  created_at: string;
  task_id: string | null;
  room_id: string | null;
  created_by_user_id: string | null;
  assigned_to_user_id: string | null;
  source_material_id?: string | null;
  purchase_order_id?: string | null;
  submitted_by_worker_token_id?: string | null;
  task?: { title: string } | null;
  room?: { name: string } | null;
}

export interface PO {
  id: string;
  vendor_name: string | null;
  total: number;
  status: string;
  ordered_at: string | null;
  delivered_at: string | null;
  receipt_total: number | null;
  receipt_matched_at: string | null;
  receipt_file_path: string | null;
  source: string | null;
  notes: string | null;
  created_at: string;
  invoice_number?: string | null;
  ocr_number?: string | null;
  invoice_due_date?: string | null;
  paid_at?: string | null;
}

export interface POStatusStyle {
  /** soft pill background */
  bg: string;
  /** pill foreground */
  fg: string;
  /** tinted card cover background (visible status anchor) */
  coverBg: string;
  /** strong top-edge accent stripe */
  stripe: string;
  key: string;
}

export const PO_STATUS_STYLES: Record<string, POStatusStyle> = {
  // Levererad — green (positive completion)
  delivered: {
    bg: "var(--rf-green)",
    fg: "#FFFFFF",
    coverBg: "var(--rf-green-soft)",
    stripe: "var(--rf-green)",
    key: "purchaseOrderStatus.delivered",
  },
  // Beställd — amber (in flight)
  ordered: {
    bg: "var(--rf-amber)",
    fg: "#3D2F14",
    coverBg: "var(--rf-amber-soft)",
    stripe: "var(--rf-amber)",
    key: "purchaseOrderStatus.ordered",
  },
  // Avbruten — clay/warn (negative)
  cancelled: {
    bg: "var(--rf-warn)",
    fg: "#FFFFFF",
    coverBg: "var(--rf-warn-soft)",
    stripe: "var(--rf-warn)",
    key: "purchaseOrderStatus.cancelled",
  },
  // Väntar — sand/neutral (pre-flight)
  pending: {
    bg: "var(--rf-sand)",
    fg: "var(--rf-sand-fg)",
    coverBg: "var(--rf-surface-2)",
    stripe: "var(--rf-sand-fg)",
    key: "purchaseOrderStatus.pending",
  },
  // Önskemål — stone/neutral (budget-/hemägar-request, ej bekräftad vendor)
  requested: {
    bg: "var(--rf-stone)",
    fg: "var(--rf-stone-fg)",
    coverBg: "var(--rf-surface-2)",
    stripe: "var(--rf-stone-fg)",
    key: "purchaseOrderStatus.requested",
  },
  // Fallback / draft
  draft: {
    bg: "var(--rf-stone)",
    fg: "var(--rf-stone-fg)",
    coverBg: "var(--rf-surface-2)",
    stripe: "var(--rf-fg-subtle)",
    key: "purchaseOrderStatus.draft",
  },
};

export function getPOStatusStyle(status: string): POStatusStyle {
  return PO_STATUS_STYLES[status] ?? PO_STATUS_STYLES.pending;
}

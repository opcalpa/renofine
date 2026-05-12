export type PurchaseColumnKey =
  // Core (always visible)
  | "name"
  | "status"
  | "actions"
  // Extra (user-toggleable)
  | "quantity"
  | "pricePerUnit"
  | "priceTotal"
  | "paidAmount"
  | "remaining"
  | "vendor"
  | "room"
  | "task"
  | "assignedTo"
  | "createdBy"
  | "createdAt"
  | "attachment"
  | "fileCategory"
  | "paidDate";

export interface PurchaseColumnDef {
  key: PurchaseColumnKey;
  label: string;
  align?: "left" | "right";
  width?: string;
  extra?: boolean;
  editType?: "numeric" | "select" | "none";
  dbField?: string;
}

export const CORE_COLUMN_KEYS: PurchaseColumnKey[] = [
  "name",
  "status",
  "actions",
];

export const EXTRA_COLUMN_KEYS: PurchaseColumnKey[] = [
  "quantity",
  "pricePerUnit",
  "priceTotal",
  "paidAmount",
  "remaining",
  "vendor",
  "room",
  "task",
  "assignedTo",
  "createdBy",
  "createdAt",
  "attachment",
  "fileCategory",
  "paidDate",
];

export const DEFAULT_VISIBLE_EXTRAS: PurchaseColumnKey[] = [
  "priceTotal",
  "vendor",
  "room",
  "task",
  "createdBy",
];

export const KANBAN_STATUS_ORDER = [
  "submitted",
  "approved",
  "billed",
  "paid",
  "paused",
  "declined",
] as const;

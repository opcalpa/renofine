// Shared budget types. Extracted from BudgetTab.tsx during the role-separation
// refactor. Both OwnerBudgetTab and ContractorBudgetTab consume these.

export interface BudgetRow {
  id: string;
  name: string;
  type: "task" | "material" | "purchase";
  budget: number;
  paid: number;
  estimatedCost: number;
  isEstimated: boolean;
  taskCostType?: string | null;
  room?: string;
  roomId?: string;
  assignee?: string;
  assigneeId?: string;
  costCenter?: string;
  startDate?: string;
  finishDate?: string;
  hasAttachment: boolean;
  attachmentCount: number;
  isUnlinked?: boolean;
  taskId?: string;
  materialBudget: number;
  materialConsumed: number;
  status?: string;
  // Budget post fields (material budgets)
  isBudgetPost?: boolean;
  sourceMaterialId?: string;
  parentBudgetPostId?: string;
  consumedTotal?: number;
  isAta?: boolean;
  // Task-specific
  estimatedHours?: number;
  hourlyRate?: number;
  subcontractorCost?: number;
  markupPercent?: number;
  materialMarkupPercent?: number;
  laborCostPercent?: number;
  paymentStatus?: string;
  // Material-specific
  quantity?: number;
  pricePerUnit?: number;
  orderedAmount?: number;
  vendor?: string;
  // Supplier
  supplierId?: string;
  supplierName?: string;
  // ROT
  rotAmount?: number;
  // Evidence status
  evidenceStatus?: "verified" | "registered" | "missing" | "na";
  // Phase: most-specific value tier per row (Block 5 unified purchase+budget)
  phase?: "budget" | "ordered" | "actual";
  // Purchase-order grouping (lets the table collapse same-PO orphan lines under one header)
  purchaseOrderId?: string;
}

export type ColumnKey =
  | "name" | "type" | "status" | "phase"
  | "budget" | "consumed" | "paid" | "remaining" | "margin" | "supplier"
  | "matBudget" | "matConsumed" | "matRemaining"
  | "room" | "assignee" | "costCenter" | "startDate" | "finishDate"
  | "attachment" | "evidence"
  | "estimatedHours" | "hourlyRate" | "subcontractorCost" | "paymentStatus"
  | "quantity" | "pricePerUnit" | "orderedAmount" | "vendor"
  | "rotAmount";

export interface ColumnDef {
  key: ColumnKey;
  label: string;
  align?: "left" | "right";
  extra?: boolean;
}

export type GroupByOption = "none" | "room" | "costCenter" | "status";

// DisplayRow extends BudgetRow with rendering hints (parent-child, section headers,
// expansion counts). Used by useBudgetTree memo to flatten the task→material→purchase
// hierarchy into a single render-ready row list.
export type DisplayRow = BudgetRow & {
  isChild?: boolean;
  isPurchaseChild?: boolean;
  childCount?: number;
  purchaseCount?: number;
  isSectionHeader?: boolean;
  isPoHeader?: boolean;
  // Set on synthetic group-header rows so the toolbar's collapse-toggle knows
  // which group it controls.
  _groupKey?: string;
};

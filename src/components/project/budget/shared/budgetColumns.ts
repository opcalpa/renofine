// Static column allowlists. ALL_COLUMNS itself stays inside BudgetTab.tsx because
// it depends on i18n's `t()` — but the role-filtering sets are pure data and live
// here so both shells (and tests) can reference them without circular deps.

import type { ColumnKey } from "./types";

export const EXTRA_COLUMN_KEYS: ColumnKey[] = [
  "room", "assignee", "costCenter", "startDate", "finishDate", "attachment", "evidence",
  // Task-specific extras
  "estimatedHours", "hourlyRate", "subcontractorCost", "paymentStatus",
  // Material-specific extras
  "quantity", "pricePerUnit", "orderedAmount", "vendor",
  // ROT
  "rotAmount",
];

// Columns invisible to homeowners. Mostly internal cost-breakdown / margin / labor.
export const HOMEOWNER_HIDDEN_COLUMNS = new Set<ColumnKey>([
  "margin", "matBudget", "matConsumed", "matRemaining",
  "assignee", "costCenter",
  // Builder-internal task cost details
  "estimatedHours", "hourlyRate", "subcontractorCost", "paymentStatus",
]);

// Columns the homeowner CAN see but which appear under the "extra columns" toggle
// rather than by default — keeps the homeowner view focused on price + room.
export const HOMEOWNER_EXTRA_KEYS: ColumnKey[] = [
  "room", "startDate", "finishDate", "attachment", "evidence",
  "paid", "remaining",
  "quantity", "pricePerUnit", "orderedAmount", "vendor",
];

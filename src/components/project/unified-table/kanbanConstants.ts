import type { KanbanGroupBy, KanbanGroupByConfig } from "./types";

export const KANBAN_GROUP_BY_OPTIONS: KanbanGroupByConfig[] = [
  {
    key: "status",
    labelKey: "unifiedTable.groupByStatus",
    appliesTo: "task",
    dbField: "status",
  },
  {
    key: "materialStatus",
    labelKey: "unifiedTable.groupByMaterialStatus",
    appliesTo: "material",
    dbField: "status",
  },
  {
    key: "priority",
    labelKey: "unifiedTable.groupByPriority",
    appliesTo: "task",
    dbField: "priority",
  },
  {
    key: "assignee",
    labelKey: "unifiedTable.groupByAssignee",
    appliesTo: "task",
    dbField: "assigned_to_stakeholder_id",
  },
  {
    key: "room",
    labelKey: "unifiedTable.groupByRoom",
    appliesTo: "both",
    dbField: "room_id",
  },
  {
    key: "costCenter",
    labelKey: "unifiedTable.groupByCostCenter",
    appliesTo: "both",
    dbField: "cost_center",
  },
  {
    key: "paymentStatus",
    labelKey: "unifiedTable.groupByPaymentStatus",
    appliesTo: "task",
    dbField: "payment_status",
  },
];

export const TASK_STATUS_ORDER = [
  "planned",
  "to_do",
  "in_progress",
  "waiting",
  "completed",
  "cancelled",
];

// Material lifecycle: budget → request → order → leverans → ekonomi
// Värden synkade med materials_status_check (migration 20260512150000).
export const MATERIAL_STATUS_ORDER = [
  "planned",
  "submitted",
  "to_order",
  "ordered",
  "approved",
  "declined",
  "billed",
  "paid",
  "paused",
];

export const PRIORITY_ORDER = ["high", "medium", "low"];

export const PAYMENT_STATUS_ORDER = [
  "not_paid",
  "billed",
  "partially_paid",
  "paid",
];

export function getColumnOrder(groupBy: KanbanGroupBy): string[] {
  switch (groupBy) {
    case "status":
      return TASK_STATUS_ORDER;
    case "materialStatus":
      return MATERIAL_STATUS_ORDER;
    case "priority":
      return PRIORITY_ORDER;
    case "paymentStatus":
      return PAYMENT_STATUS_ORDER;
    default:
      return [];
  }
}

export function getGroupByConfig(
  groupBy: KanbanGroupBy
): KanbanGroupByConfig | undefined {
  return KANBAN_GROUP_BY_OPTIONS.find((o) => o.key === groupBy);
}

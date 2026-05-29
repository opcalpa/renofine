import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { KanbanColumn, KanbanGroupBy, RowType, UnifiedRow } from "./types";
import { getColumnOrder, getGroupByConfig } from "./kanbanConstants";
import { getCostCenterLabel } from "@/lib/costCenters";

interface Room {
  id: string;
  name: string;
}

interface Stakeholder {
  id: string;
  name: string;
}

interface UseKanbanGroupingProps {
  rows: UnifiedRow[];
  groupBy: KanbanGroupBy;
  activeRowTypes: Set<RowType>;
  searchQuery: string;
  rooms: Room[];
  stakeholders: Stakeholder[];
}

interface UseKanbanGroupingResult {
  columns: KanbanColumn[];
  effectiveRowTypes: Set<RowType>;
  autoFiltered: boolean;
}

const statusKey = (s: string) => {
  const map: Record<string, string> = {
    to_do: "toDo",
    in_progress: "inProgress",
    on_hold: "onHold",
    awaiting_review: "awaitingReview",
    new_construction: "newConstruction",
    to_be_renovated: "toBeRenovated",
    not_paid: "notPaid",
    partially_paid: "partiallyPaid",
  };
  return map[s] || s;
};

function getRowGroupKey(row: UnifiedRow, groupBy: KanbanGroupBy): string {
  switch (groupBy) {
    case "status":
      return row.taskStatus ?? "to_do";
    case "materialStatus":
      return row.status ?? "submitted";
    case "priority":
      return row.priority ?? "medium";
    case "assignee":
      return row.assigneeId ?? "__unassigned__";
    case "room":
      return row.roomId ?? "__unassigned__";
    case "costCenter":
      return row.costCenter ?? "__unassigned__";
    case "paymentStatus":
      return row.paymentStatus ?? "not_paid";
  }
}

export function useKanbanGrouping({
  rows,
  groupBy,
  activeRowTypes,
  searchQuery,
  rooms,
  stakeholders,
}: UseKanbanGroupingProps): UseKanbanGroupingResult {
  const { t } = useTranslation();

  return useMemo(() => {
    const config = getGroupByConfig(groupBy);
    const unassignedLabel = t("unifiedTable.unassigned", "Unassigned");

    // Determine effective row types (auto-filter if field is type-specific)
    let effectiveRowTypes: Set<RowType>;
    let autoFiltered = false;

    if (config && config.appliesTo !== "both") {
      effectiveRowTypes = new Set([config.appliesTo]);
      autoFiltered = activeRowTypes.size > 1 || !activeRowTypes.has(config.appliesTo);
    } else {
      effectiveRowTypes = activeRowTypes;
    }

    // Filter rows
    const lowerQuery = searchQuery.toLowerCase();
    const filtered = rows.filter((row) => {
      if (!effectiveRowTypes.has(row.rowType)) return false;
      if (lowerQuery && !row.name.toLowerCase().includes(lowerQuery)) return false;
      return true;
    });

    // Build groups
    const groups = new Map<string, UnifiedRow[]>();
    for (const row of filtered) {
      const key = getRowGroupKey(row, groupBy);
      const list = groups.get(key);
      if (list) {
        list.push(row);
      } else {
        groups.set(key, [row]);
      }
    }

    // Build label resolver
    const roomMap = new Map(rooms.map((r) => [r.id, r.name]));
    const stakeholderMap = new Map(stakeholders.map((s) => [s.id, s.name]));

    const resolveLabel = (key: string): string => {
      if (key === "__unassigned__") return unassignedLabel;
      switch (groupBy) {
        case "status":
          return t(`statuses.${statusKey(key)}`, key);
        case "materialStatus":
          return t(`statuses.${statusKey(key)}`, key);
        case "priority":
          return t(`statuses.${statusKey(key)}`, key);
        case "assignee":
          return stakeholderMap.get(key) ?? unassignedLabel;
        case "room":
          return roomMap.get(key) ?? unassignedLabel;
        case "costCenter":
          return getCostCenterLabel(key) ?? key;
        case "paymentStatus":
          return t(`statuses.${statusKey(key)}`, key);
      }
    };

    // Get predefined column order
    const predefinedOrder = getColumnOrder(groupBy);
    const columns: KanbanColumn[] = [];

    if (predefinedOrder.length > 0) {
      // Add predefined columns in order (include empty ones)
      for (const colId of predefinedOrder) {
        columns.push({
          id: colId,
          label: resolveLabel(colId),
          rows: groups.get(colId) ?? [],
        });
        groups.delete(colId);
      }
      // Add any remaining dynamic keys
      for (const [key, rowList] of groups) {
        columns.push({
          id: key,
          label: resolveLabel(key),
          rows: rowList,
        });
      }
    } else {
      // Dynamic grouping (room, assignee, costCenter) — sorted alphabetically
      const dynamicKeys: string[] = [];
      // Collect all known IDs from rooms/stakeholders for empty columns
      if (groupBy === "room") {
        for (const r of rooms) {
          if (!groups.has(r.id)) groups.set(r.id, []);
          dynamicKeys.push(r.id);
        }
      } else if (groupBy === "assignee") {
        for (const s of stakeholders) {
          if (!groups.has(s.id)) groups.set(s.id, []);
          dynamicKeys.push(s.id);
        }
      }

      // Sort keys, but keep __unassigned__ last
      const allKeys = Array.from(groups.keys()).sort((a, b) => {
        if (a === "__unassigned__") return 1;
        if (b === "__unassigned__") return -1;
        return resolveLabel(a).localeCompare(resolveLabel(b));
      });

      for (const key of allKeys) {
        columns.push({
          id: key,
          label: resolveLabel(key),
          rows: groups.get(key) ?? [],
        });
      }
    }

    return { columns, effectiveRowTypes, autoFiltered };
  }, [rows, groupBy, activeRowTypes, searchQuery, rooms, stakeholders, t]);
}

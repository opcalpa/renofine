// Filter / sort / totals hook. Owns the local filter state (search, type,
// statuses, advanced filters) and derives mainRows / ataRows / filtered /
// totals from useBudgetData's rows. Sort key/dir come in from
// useBudgetTablePrefs so the persisted sort applies the same way for both
// roles.
//
// The sort branch is large but intentionally lives here — it's keyed on
// ColumnKey values that only this hook reads in combination with row data.

import { useMemo, useState } from "react";
import type { BudgetRow, ColumnKey } from "./types";
import { getEffectiveCost } from "./budgetCalc";

export type FilterType = "all" | "task" | "material" | "purchase";
export type FilterAttachment = "all" | "has" | "missing";

export interface BudgetTotals {
  budget: number;
  paid: number;
  cost: number;
  consumed: number;
  matBudget: number;
  matConsumed: number;
}

export interface UseBudgetFiltersResult {
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  filterType: FilterType;
  setFilterType: React.Dispatch<React.SetStateAction<FilterType>>;
  filterRoom: string;
  setFilterRoom: React.Dispatch<React.SetStateAction<string>>;
  filterAssignee: string;
  setFilterAssignee: React.Dispatch<React.SetStateAction<string>>;
  filterCostCenter: string;
  setFilterCostCenter: React.Dispatch<React.SetStateAction<string>>;
  filterStartDate: string;
  setFilterStartDate: React.Dispatch<React.SetStateAction<string>>;
  filterFinishDate: string;
  setFilterFinishDate: React.Dispatch<React.SetStateAction<string>>;
  filterAttachment: FilterAttachment;
  setFilterAttachment: React.Dispatch<React.SetStateAction<FilterAttachment>>;
  filterStatuses: Set<string>;
  setFilterStatuses: React.Dispatch<React.SetStateAction<Set<string>>>;
  hasAdvancedFilter: boolean;
  mainRows: BudgetRow[];
  ataRows: BudgetRow[];
  filtered: BudgetRow[];
  totals: BudgetTotals;
  distinctRooms: { id: string; name: string }[];
  distinctAssignees: { id: string; name: string }[];
  distinctCostCenters: string[];
  distinctStatuses: { task: string[]; material: string[] };
}

export function useBudgetFilters(
  rows: BudgetRow[],
  sortKey: ColumnKey | null,
  sortDir: "asc" | "desc",
  isBuilder: boolean,
): UseBudgetFiltersResult {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [filterRoom, setFilterRoom] = useState("all");
  const [filterAssignee, setFilterAssignee] = useState("all");
  const [filterCostCenter, setFilterCostCenter] = useState("all");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterFinishDate, setFilterFinishDate] = useState("");
  const [filterAttachment, setFilterAttachment] = useState<FilterAttachment>("all");
  const [filterStatuses, setFilterStatuses] = useState<Set<string>>(new Set());

  const distinctRooms = useMemo(() => {
    const set = new Map<string, string>();
    for (const r of rows) {
      if (r.roomId && r.room) set.set(r.roomId, r.room);
    }
    return Array.from(set, ([id, name]) => ({ id, name }));
  }, [rows]);

  const distinctAssignees = useMemo(() => {
    const set = new Map<string, string>();
    for (const r of rows) {
      if (r.assigneeId && r.assignee) set.set(r.assigneeId, r.assignee);
    }
    return Array.from(set, ([id, name]) => ({ id, name }));
  }, [rows]);

  const distinctCostCenters = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.costCenter) set.add(r.costCenter);
    }
    return Array.from(set);
  }, [rows]);

  const distinctStatuses = useMemo(() => {
    const taskStatuses = new Set<string>();
    const materialStatuses = new Set<string>();
    for (const r of rows) {
      if (r.type === "task" && r.status) taskStatuses.add(r.status);
      if (r.type === "material" && r.status) materialStatuses.add(r.status);
    }
    return {
      task: Array.from(taskStatuses),
      material: Array.from(materialStatuses),
    };
  }, [rows]);

  const hasAdvancedFilter =
    filterRoom !== "all" ||
    filterAssignee !== "all" ||
    filterCostCenter !== "all" ||
    filterStartDate !== "" ||
    filterFinishDate !== "" ||
    filterAttachment !== "all";

  const mainRows = useMemo(() => rows.filter((r) => !r.isAta), [rows]);
  const ataRows = useMemo(() => rows.filter((r) => r.isAta), [rows]);

  const filtered = useMemo(() => {
    const result = mainRows.filter((r) => {
      if (filterType !== "all" && r.type !== filterType) return false;
      if (filterStatuses.size > 0 && (!r.status || !filterStatuses.has(r.status))) return false;
      if (searchQuery && !r.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (filterRoom !== "all" && r.roomId !== filterRoom) return false;
      if (filterAssignee !== "all" && r.assigneeId !== filterAssignee) return false;
      if (filterCostCenter !== "all" && r.costCenter !== filterCostCenter) return false;
      if (filterStartDate && (!r.startDate || r.startDate < filterStartDate)) return false;
      if (filterFinishDate && (!r.finishDate || r.finishDate > filterFinishDate)) return false;
      if (filterAttachment === "has" && !r.hasAttachment) return false;
      if (filterAttachment === "missing" && r.hasAttachment) return false;
      return true;
    });

    if (sortKey) {
      result.sort((a, b) => {
        let av: string | number;
        let bv: string | number;
        if (sortKey === "paid") {
          av = getEffectiveCost(a);
          bv = getEffectiveCost(b);
        } else if (sortKey === "consumed") {
          av = a.consumedTotal ?? 0;
          bv = b.consumedTotal ?? 0;
        } else if (sortKey === "remaining") {
          if (isBuilder) {
            av = a.budget - getEffectiveCost(a);
            bv = b.budget - getEffectiveCost(b);
          } else {
            const aq = a.type === "task" ? a.budget : a.estimatedCost;
            const bq = b.type === "task" ? b.budget : b.estimatedCost;
            av = aq - a.paid;
            bv = bq - b.paid;
          }
        } else if (sortKey === "margin") {
          av = a.budget > 0 ? (a.budget - getEffectiveCost(a)) / a.budget : 0;
          bv = b.budget > 0 ? (b.budget - getEffectiveCost(b)) / b.budget : 0;
        } else if (sortKey === "matBudget") {
          av = a.materialBudget; bv = b.materialBudget;
        } else if (sortKey === "matConsumed") {
          av = a.materialConsumed; bv = b.materialConsumed;
        } else if (sortKey === "matRemaining") {
          av = a.materialBudget - a.materialConsumed;
          bv = b.materialBudget - b.materialConsumed;
        } else if (sortKey === "room") {
          av = a.room || "";
          bv = b.room || "";
        } else if (sortKey === "assignee") {
          av = a.assignee || "";
          bv = b.assignee || "";
        } else if (sortKey === "costCenter") {
          av = a.costCenter || "";
          bv = b.costCenter || "";
        } else if (sortKey === "startDate") {
          av = a.startDate || "";
          bv = b.startDate || "";
        } else if (sortKey === "finishDate") {
          av = a.finishDate || "";
          bv = b.finishDate || "";
        } else if (sortKey === "status") {
          av = a.status || "";
          bv = b.status || "";
        } else if (sortKey === "phase") {
          const rank: Record<string, number> = { budget: 0, ordered: 1, actual: 2 };
          av = rank[a.phase ?? "budget"] ?? 0;
          bv = rank[b.phase ?? "budget"] ?? 0;
        } else if (sortKey === "estimatedHours") {
          av = a.estimatedHours ?? 0;
          bv = b.estimatedHours ?? 0;
        } else if (sortKey === "hourlyRate") {
          av = a.hourlyRate ?? 0;
          bv = b.hourlyRate ?? 0;
        } else if (sortKey === "subcontractorCost") {
          av = a.subcontractorCost ?? 0;
          bv = b.subcontractorCost ?? 0;
        } else if (sortKey === "paymentStatus") {
          av = a.paymentStatus || "";
          bv = b.paymentStatus || "";
        } else if (sortKey === "quantity") {
          av = a.quantity ?? 0;
          bv = b.quantity ?? 0;
        } else if (sortKey === "pricePerUnit") {
          av = a.pricePerUnit ?? 0;
          bv = b.pricePerUnit ?? 0;
        } else if (sortKey === "orderedAmount") {
          av = a.orderedAmount ?? 0;
          bv = b.orderedAmount ?? 0;
        } else if (sortKey === "supplier") {
          av = a.supplierName || "";
          bv = b.supplierName || "";
        } else if (sortKey === "vendor") {
          av = a.vendor || "";
          bv = b.vendor || "";
        } else if (sortKey === "rotAmount") {
          av = a.rotAmount ?? 0;
          bv = b.rotAmount ?? 0;
        } else {
          av = (a as unknown as Record<string, string | number>)[sortKey];
          bv = (b as unknown as Record<string, string | number>)[sortKey];
        }
        let cmp: number;
        if (typeof av === "number" && typeof bv === "number") {
          cmp = av - bv;
        } else {
          cmp = String(av).localeCompare(String(bv));
        }
        return sortDir === "asc" ? cmp : -cmp;
      });
    }

    return result;
  }, [
    mainRows,
    filterType,
    filterStatuses,
    searchQuery,
    filterRoom,
    filterAssignee,
    filterCostCenter,
    filterStartDate,
    filterFinishDate,
    filterAttachment,
    sortKey,
    sortDir,
    isBuilder,
  ]);

  const totals = useMemo<BudgetTotals>(
    () =>
      filtered.reduce(
        (acc, r) => {
          // Purchase rows are already reflected via consumedTotal on their budget post — skip
          if (r.type === "purchase") return acc;
          return {
            budget: acc.budget + r.budget,
            paid: acc.paid + r.paid,
            cost: acc.cost + getEffectiveCost(r),
            consumed: acc.consumed + (r.consumedTotal ?? 0),
            matBudget: acc.matBudget + (r.type === "task" ? r.materialBudget : 0),
            matConsumed: acc.matConsumed + (r.type === "task" ? r.materialConsumed : 0),
          };
        },
        { budget: 0, paid: 0, cost: 0, consumed: 0, matBudget: 0, matConsumed: 0 },
      ),
    [filtered],
  );

  return {
    searchQuery,
    setSearchQuery,
    filterType,
    setFilterType,
    filterRoom,
    setFilterRoom,
    filterAssignee,
    setFilterAssignee,
    filterCostCenter,
    setFilterCostCenter,
    filterStartDate,
    setFilterStartDate,
    filterFinishDate,
    setFilterFinishDate,
    filterAttachment,
    setFilterAttachment,
    filterStatuses,
    setFilterStatuses,
    hasAdvancedFilter,
    mainRows,
    ataRows,
    filtered,
    totals,
    distinctRooms,
    distinctAssignees,
    distinctCostCenters,
    distinctStatuses,
  };
}

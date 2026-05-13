// Tree-hierarchy hook. Owns the 5 expansion states (per-task / per-budget-post
// / per-PO / unlinked-section / ÄTA-section) and the displayRows memo that
// flattens tasks → material budget posts → purchases into a single render-ready
// row list. Grouping (room/costCenter/status) is applied as the last step.
//
// Inputs are deliberately narrow: filtered + ataRows come from useBudgetFilters,
// purchaseOrderInfo from useBudgetData, groupBy + collapsedGroups stay in the
// component because the toolbar owns them.

import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BudgetRow, DisplayRow, GroupByOption } from "./types";
import type { PurchaseOrderInfo } from "./useBudgetData";

export interface UseBudgetTreeArgs {
  filtered: BudgetRow[];
  ataRows: BudgetRow[];
  purchaseOrderInfo: Map<string, PurchaseOrderInfo>;
  groupBy: GroupByOption;
  collapsedGroups: Set<string>;
}

export interface UseBudgetTreeResult {
  displayRows: DisplayRow[];
  expandedTasks: Set<string>;
  toggleTaskExpand: (id: string) => void;
  expandedBudgetPosts: Set<string>;
  toggleBudgetPostExpand: (id: string) => void;
  expandedPurchaseOrders: Set<string>;
  togglePurchaseOrderExpand: (id: string) => void;
  unlinkedExpanded: boolean;
  setUnlinkedExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  ataExpanded: boolean;
  setAtaExpanded: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useBudgetTree({
  filtered,
  ataRows,
  purchaseOrderInfo,
  groupBy,
  collapsedGroups,
}: UseBudgetTreeArgs): UseBudgetTreeResult {
  const { t } = useTranslation();

  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const toggleTaskExpand = useCallback((taskId: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      return next;
    });
  }, []);

  const [expandedBudgetPosts, setExpandedBudgetPosts] = useState<Set<string>>(new Set());
  const toggleBudgetPostExpand = useCallback((budgetPostId: string) => {
    setExpandedBudgetPosts((prev) => {
      const next = new Set(prev);
      if (next.has(budgetPostId)) next.delete(budgetPostId); else next.add(budgetPostId);
      return next;
    });
  }, []);

  const [expandedPurchaseOrders, setExpandedPurchaseOrders] = useState<Set<string>>(new Set());
  const togglePurchaseOrderExpand = useCallback((poId: string) => {
    setExpandedPurchaseOrders((prev) => {
      const next = new Set(prev);
      if (next.has(poId)) next.delete(poId); else next.add(poId);
      return next;
    });
  }, []);

  const [unlinkedExpanded, setUnlinkedExpanded] = useState(false);
  const [ataExpanded, setAtaExpanded] = useState(true);

  const displayRows = useMemo<DisplayRow[]>(() => {
    // Separate rows by type
    const taskRows: BudgetRow[] = [];
    const materialBudgetPosts: BudgetRow[] = [];
    const purchaseRows: BudgetRow[] = [];

    for (const row of filtered) {
      if (row.type === "task") taskRows.push(row);
      else if (row.type === "material" && row.isBudgetPost) materialBudgetPosts.push(row);
      else if (row.type === "purchase") purchaseRows.push(row);
      else if (row.type === "material") materialBudgetPosts.push(row); // legacy non-budgetpost materials
    }

    // Build maps for hierarchy
    const budgetPostsByTask = new Map<string, BudgetRow[]>();
    const standaloneBudgetPosts: BudgetRow[] = [];
    for (const bp of materialBudgetPosts) {
      if (bp.taskId) {
        const parentInList = taskRows.some((tt) => tt.id === bp.taskId);
        if (parentInList) {
          if (!budgetPostsByTask.has(bp.taskId)) budgetPostsByTask.set(bp.taskId, []);
          budgetPostsByTask.get(bp.taskId)!.push(bp);
          continue;
        }
      }
      standaloneBudgetPosts.push(bp);
    }

    const purchasesByBudgetPost = new Map<string, BudgetRow[]>();
    const orphanPurchases: BudgetRow[] = [];
    for (const p of purchaseRows) {
      if (p.parentBudgetPostId) {
        if (!purchasesByBudgetPost.has(p.parentBudgetPostId)) purchasesByBudgetPost.set(p.parentBudgetPostId, []);
        purchasesByBudgetPost.get(p.parentBudgetPostId)!.push(p);
      } else {
        orphanPurchases.push(p);
      }
    }

    const result: DisplayRow[] = [];

    // Helper: add a budget post + its purchases
    const addBudgetPostWithPurchases = (bp: BudgetRow, isChild: boolean) => {
      const purchases = purchasesByBudgetPost.get(bp.id) || [];
      result.push({ ...bp, isChild, purchaseCount: purchases.length });
      if (expandedBudgetPosts.has(bp.id)) {
        for (const p of purchases) {
          result.push({ ...p, isChild: true, isPurchaseChild: true });
        }
      }
    };

    // 1. Task rows with their material budget posts
    for (const task of taskRows) {
      const budgetPosts = budgetPostsByTask.get(task.id) || [];
      result.push({ ...task, childCount: budgetPosts.length });
      if (expandedTasks.has(task.id)) {
        for (const bp of budgetPosts) {
          addBudgetPostWithPurchases(bp, true);
        }
      }
    }

    // 2. Standalone material budget posts section
    if (standaloneBudgetPosts.length > 0) {
      const standaloneTotal = standaloneBudgetPosts.reduce((sum, bp) => sum + bp.budget, 0);
      result.push({
        id: "__standalone_bp_header__",
        name: t("budget.standaloneBudgetPosts", "Fristående materialbudgetar"),
        type: "material",
        budget: standaloneTotal,
        paid: 0,
        estimatedCost: standaloneTotal,
        isEstimated: false,
        materialBudget: 0,
        materialConsumed: 0,
        childCount: standaloneBudgetPosts.length,
        isSectionHeader: true,
        hasAttachment: false,
        attachmentCount: 0,
      } as DisplayRow);
      if (unlinkedExpanded) {
        for (const bp of standaloneBudgetPosts) {
          addBudgetPostWithPurchases(bp, true);
        }
      }
    }

    // 3. Orphan purchases — group by purchase_order (≥2 lines from same PO collapse under one header)
    const orphansByPo = new Map<string, BudgetRow[]>();
    const orphansWithoutPo: BudgetRow[] = [];
    for (const p of orphanPurchases) {
      if (p.purchaseOrderId) {
        if (!orphansByPo.has(p.purchaseOrderId)) orphansByPo.set(p.purchaseOrderId, []);
        orphansByPo.get(p.purchaseOrderId)!.push(p);
      } else {
        orphansWithoutPo.push(p);
      }
    }
    for (const [poId, lines] of orphansByPo) {
      if (lines.length < 2) {
        // Singleton: render flat like before
        for (const p of lines) result.push(p);
        continue;
      }
      const info = purchaseOrderInfo.get(poId);
      const linesTotal = lines.reduce((sum, l) => sum + l.estimatedCost, 0);
      const linesPaid = lines.reduce((sum, l) => sum + (l.paid ?? 0), 0);
      const headerPhase: "budget" | "ordered" | "actual" =
        info?.status === "delivered" ? "actual"
        : info?.status === "ordered" ? "ordered"
        : "budget";
      result.push({
        id: `__po_header_${poId}__`,
        name: info?.vendor ?? t("budget.purchaseOrder", "Inköpsorder"),
        type: "purchase",
        budget: 0,
        paid: linesPaid,
        estimatedCost: info?.total ?? linesTotal,
        isEstimated: linesPaid <= 0,
        materialBudget: 0,
        materialConsumed: 0,
        childCount: lines.length,
        isPoHeader: true,
        phase: headerPhase,
        purchaseOrderId: poId,
        status: info?.status,
        vendor: info?.vendor,
        hasAttachment: false,
        attachmentCount: 0,
      } as DisplayRow);
      if (expandedPurchaseOrders.has(poId)) {
        for (const p of lines) {
          result.push({ ...p, isChild: true, isPurchaseChild: true });
        }
      }
    }
    for (const p of orphansWithoutPo) result.push(p);

    // 4. ÄTA section — change orders shown in their own block
    if (ataRows.length > 0) {
      const ataTasksFiltered = ataRows.filter((r) => r.type === "task");
      const ataBudgetPosts = ataRows.filter((r) => r.type === "material" && r.isBudgetPost);
      const ataPurchasesFiltered = ataRows.filter((r) => r.type === "purchase");

      const ataBpByTask = new Map<string, BudgetRow[]>();
      const ataStandaloneBp: BudgetRow[] = [];
      for (const bp of ataBudgetPosts) {
        if (bp.taskId && ataTasksFiltered.some((tt) => tt.id === bp.taskId)) {
          if (!ataBpByTask.has(bp.taskId)) ataBpByTask.set(bp.taskId, []);
          ataBpByTask.get(bp.taskId)!.push(bp);
        } else {
          ataStandaloneBp.push(bp);
        }
      }

      const ataPurchasesByBp = new Map<string, BudgetRow[]>();
      const ataOrphanPurchases: BudgetRow[] = [];
      for (const p of ataPurchasesFiltered) {
        if (p.parentBudgetPostId) {
          if (!ataPurchasesByBp.has(p.parentBudgetPostId)) ataPurchasesByBp.set(p.parentBudgetPostId, []);
          ataPurchasesByBp.get(p.parentBudgetPostId)!.push(p);
        } else {
          ataOrphanPurchases.push(p);
        }
      }

      const ataTotal = ataRows.reduce((sum, r) => {
        if (r.type === "purchase") return sum;
        return sum + r.budget;
      }, 0);

      result.push({
        id: "__ata_header__",
        name: t("budget.ataSection", "Tillägg"),
        type: "task",
        budget: ataTotal,
        paid: 0,
        estimatedCost: 0,
        isEstimated: false,
        materialBudget: 0,
        materialConsumed: 0,
        childCount: ataTasksFiltered.length + ataStandaloneBp.length + ataOrphanPurchases.length,
        isSectionHeader: true,
        hasAttachment: false,
        attachmentCount: 0,
      } as DisplayRow);

      if (ataExpanded) {
        // Add ÄTA tasks with their budget posts
        for (const task of ataTasksFiltered) {
          const bps = ataBpByTask.get(task.id) || [];
          result.push({ ...task, childCount: bps.length });
          if (expandedTasks.has(task.id)) {
            for (const bp of bps) {
              const purchases = ataPurchasesByBp.get(bp.id) || [];
              result.push({ ...bp, isChild: true, purchaseCount: purchases.length });
              if (expandedBudgetPosts.has(bp.id)) {
                for (const p of purchases) {
                  result.push({ ...p, isChild: true, isPurchaseChild: true });
                }
              }
            }
          }
        }
        // Standalone ÄTA budget posts
        for (const bp of ataStandaloneBp) {
          const purchases = ataPurchasesByBp.get(bp.id) || [];
          result.push({ ...bp, purchaseCount: purchases.length });
          if (expandedBudgetPosts.has(bp.id)) {
            for (const p of purchases) {
              result.push({ ...p, isChild: true, isPurchaseChild: true });
            }
          }
        }
        // Orphan ÄTA purchases — same PO-grouping as main section
        const ataOrphansByPo = new Map<string, BudgetRow[]>();
        const ataOrphansWithoutPo: BudgetRow[] = [];
        for (const p of ataOrphanPurchases) {
          if (p.purchaseOrderId) {
            if (!ataOrphansByPo.has(p.purchaseOrderId)) ataOrphansByPo.set(p.purchaseOrderId, []);
            ataOrphansByPo.get(p.purchaseOrderId)!.push(p);
          } else {
            ataOrphansWithoutPo.push(p);
          }
        }
        for (const [poId, lines] of ataOrphansByPo) {
          if (lines.length < 2) {
            for (const p of lines) result.push({ ...p, isChild: true });
            continue;
          }
          const info = purchaseOrderInfo.get(poId);
          const linesTotal = lines.reduce((sum, l) => sum + l.estimatedCost, 0);
          const linesPaid = lines.reduce((sum, l) => sum + (l.paid ?? 0), 0);
          const headerPhase: "budget" | "ordered" | "actual" =
            info?.status === "delivered" ? "actual"
            : info?.status === "ordered" ? "ordered"
            : "budget";
          result.push({
            id: `__ata_po_header_${poId}__`,
            name: info?.vendor ?? t("budget.purchaseOrder", "Inköpsorder"),
            type: "purchase",
            budget: 0,
            paid: linesPaid,
            estimatedCost: info?.total ?? linesTotal,
            isEstimated: linesPaid <= 0,
            materialBudget: 0,
            materialConsumed: 0,
            childCount: lines.length,
            isPoHeader: true,
            phase: headerPhase,
            purchaseOrderId: poId,
            status: info?.status,
            vendor: info?.vendor,
            isAta: true,
            hasAttachment: false,
            attachmentCount: 0,
          } as DisplayRow);
          if (expandedPurchaseOrders.has(poId)) {
            for (const p of lines) {
              result.push({ ...p, isChild: true, isPurchaseChild: true });
            }
          }
        }
        for (const p of ataOrphansWithoutPo) result.push({ ...p, isChild: true });
      }
    }

    // Apply grouping if active
    if (groupBy === "none") return result;

    const getGroupKey = (row: BudgetRow): string => {
      switch (groupBy) {
        case "room": return row.roomId || "__no_room__";
        case "costCenter": return row.costCenter || "__no_cc__";
        case "status": return row.status || "__no_status__";
        default: return "__ungrouped__";
      }
    };

    const getGroupLabel = (key: string): string => {
      if (key === "__no_room__") return t("budget.noRoom", "No room");
      if (key === "__no_cc__") return t("budget.noCostCenter", "No cost center");
      if (key === "__no_status__") return t("budget.noStatus", "No status");
      switch (groupBy) {
        case "room": {
          const row = result.find((r) => !r.isSectionHeader && r.roomId === key);
          return row?.room || key;
        }
        case "costCenter": {
          const ccLabels: Record<string, string> = {
            demolition: t("costCenters.demolition", "Demolition"),
            electrical: t("costCenters.electrical", "Electrical"),
            plumbing: t("costCenters.plumbing", "Plumbing"),
            tiling: t("costCenters.tiling", "Tiling"),
            carpentry: t("costCenters.carpentry", "Carpentry"),
            painting: t("costCenters.painting", "Painting"),
            flooring: t("costCenters.flooring", "Flooring"),
            kitchen: t("costCenters.kitchen", "Kitchen"),
            bathroom: t("costCenters.bathroom", "Bathroom"),
            other: t("costCenters.other", "Other"),
          };
          return ccLabels[key] || key;
        }
        case "status": {
          return t(`statuses.${key}`, t(`materialStatuses.${key}`, key));
        }
        default: return key;
      }
    };

    // Group rows (skip section headers and children — they'll follow their parents)
    const groups = new Map<string, DisplayRow[]>();
    const groupOrder: string[] = [];
    for (const row of result) {
      if (row.isSectionHeader || row.isChild || row.isPurchaseChild) continue;
      const key = getGroupKey(row);
      if (!groups.has(key)) {
        groups.set(key, []);
        groupOrder.push(key);
      }
      groups.get(key)!.push(row);
      // Also add children (budget posts under tasks, purchases under budget posts)
      if (row.type === "task" && expandedTasks.has(row.id)) {
        const children = result.filter((r) => r.isChild && r.taskId === row.id && !r.isPurchaseChild);
        for (const child of children) {
          groups.get(key)!.push(child);
          // And purchases under that budget post
          if (child.isBudgetPost && expandedBudgetPosts.has(child.id)) {
            const purchases = result.filter((r) => r.isPurchaseChild && r.parentBudgetPostId === child.id);
            groups.get(key)!.push(...purchases);
          }
        }
      }
    }
    // Section rows (standalone budget posts, orphan purchases)
    const sectionRows = result.filter((r) => r.isSectionHeader || (r.isChild && (r.isUnlinked || r.type === "purchase")));

    const grouped: DisplayRow[] = [];
    for (const key of groupOrder) {
      const groupRows = groups.get(key)!;
      const topRows = groupRows.filter((r) => !r.isChild && !r.isPurchaseChild);
      const groupBudget = topRows.reduce((s, r) => s + r.budget, 0);
      const groupPaid = topRows.reduce((s, r) => s + r.paid, 0);
      grouped.push({
        id: `__group_${key}__`,
        name: getGroupLabel(key),
        type: "task",
        budget: groupBudget,
        paid: groupPaid,
        estimatedCost: 0,
        isEstimated: false,
        materialBudget: 0,
        materialConsumed: 0,
        childCount: topRows.length,
        isSectionHeader: true,
        hasAttachment: false,
        attachmentCount: 0,
        _groupKey: key,
      } as DisplayRow);
      if (!collapsedGroups.has(key)) {
        grouped.push(...groupRows);
      }
    }
    // Append standalone/orphan sections at the end
    grouped.push(...sectionRows);

    return grouped;
  }, [
    filtered,
    ataRows,
    expandedTasks,
    expandedBudgetPosts,
    expandedPurchaseOrders,
    purchaseOrderInfo,
    unlinkedExpanded,
    ataExpanded,
    groupBy,
    collapsedGroups,
    t,
  ]);

  return {
    displayRows,
    expandedTasks,
    toggleTaskExpand,
    expandedBudgetPosts,
    toggleBudgetPostExpand,
    expandedPurchaseOrders,
    togglePurchaseOrderExpand,
    unlinkedExpanded,
    setUnlinkedExpanded,
    ataExpanded,
    setAtaExpanded,
  };
}

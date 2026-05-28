// Pure-function cell renderers extracted from BudgetTab.tsx. Each renderer
// takes a column def and a context object; the caller builds the context once
// per render and passes it to each call. Keeping these as plain functions
// (not React components) means the parent's render decides when to re-run —
// React.memo isn't useful here since cells render in a tight loop.
//
// Owner and Contractor shells will both call into these once the budget split
// is done; for now BudgetTab is the only caller.

import type { ReactNode, Dispatch, SetStateAction } from "react";
import type { TFunction } from "i18next";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, Hammer, Handshake, ShoppingCart } from "lucide-react";
import { AttachmentIndicator } from "@/components/shared/AttachmentIndicator";
import { FilePreviewPopover } from "@/components/shared/FilePreviewPopover";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { getStatusBadgeColor } from "@/lib/statusColors";
import { getEvidenceColor } from "@/lib/evidenceStatus";
import type { BudgetRow, ColumnDef, DisplayRow } from "./types";
import type { BudgetTotals } from "./useBudgetFilters";
import { getEffectiveCost } from "./budgetCalc";

/** Maps snake_case status values to camelCase i18n keys */
export function budgetStatusKey(s: string): string {
  const map: Record<string, string> = {
    to_do: "toDo",
    in_progress: "inProgress",
    on_hold: "onHold",
  };
  return map[s] || s;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("sv-SE");
}

export interface CellContext {
  // Editing state
  editingCell: { rowId: string; col: string } | null;
  setEditingCell: Dispatch<SetStateAction<{ rowId: string; col: string } | null>>;
  editValue: string;
  setEditValue: Dispatch<SetStateAction<string>>;
  // Tree state
  expandedPurchaseOrders: Set<string>;
  // Callbacks
  openDetail: (row: BudgetRow) => void;
  handleCellSave: (row: BudgetRow, col: string, value: string) => void;
  handleStatusSave: (row: BudgetRow, newStatus: string) => void;
  handleSupplierSave: (row: BudgetRow, name: string) => void;
  toggleTaskExpand: (id: string) => void;
  toggleBudgetPostExpand: (id: string) => void;
  togglePurchaseOrderExpand: (id: string) => void;
  // Data
  suppliers: { id: string; name: string }[];
  allRooms: { id: string; name: string }[];
  distinctCostCenters: string[];
  // Context
  isBuilder: boolean;
  currency?: string | null;
  projectId: string;
  t: TFunction;
}

export function renderCell(col: ColumnDef, row: DisplayRow, ctx: CellContext): ReactNode {
  const {
    editingCell, setEditingCell, editValue, setEditValue,
    expandedPurchaseOrders,
    openDetail, handleCellSave, handleStatusSave, handleSupplierSave,
    toggleTaskExpand, toggleBudgetPostExpand, togglePurchaseOrderExpand,
    suppliers, allRooms, distinctCostCenters,
    isBuilder, currency, projectId, t,
  } = ctx;

  const isPurchase = row.type === "purchase" || row.isPurchaseChild;
  const isMaterialBudgetPost = row.type === "material" && row.isBudgetPost;
  switch (col.key) {
    case "name": {
      // PO header: chevron + ShoppingCart + vendor + count badge (no openDetail button)
      if (row.isPoHeader && row.purchaseOrderId) {
        const isExpanded = expandedPurchaseOrders.has(row.purchaseOrderId);
        return (
          <span className="inline-flex items-center gap-1.5">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 hover:bg-muted px-1 -mx-1 rounded transition-colors"
              onClick={(e) => { e.stopPropagation(); togglePurchaseOrderExpand(row.purchaseOrderId!); }}
              title={isExpanded ? t('budget.collapse', 'Kollapsa') : t('budget.expand', 'Expandera')}
            >
              <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
              <ShoppingCart className="h-3.5 w-3.5 text-slate-500" />
              <span className="font-medium text-slate-700">{row.name}</span>
            </button>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {row.childCount} {t('budget.lineItems', 'rader')}
            </Badge>
            {row.isAta && (
              <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0 text-orange-600 border-orange-300">{t('budget.addition', 'Tillägg')}</Badge>
            )}
          </span>
        );
      }
      // Indent: purchase children get deepest indent, budget posts under task get medium indent
      const indentClass = isPurchase && row.isChild
        ? " pl-10"
        : (isMaterialBudgetPost && row.isChild)
          ? " pl-6"
          : "";
      return (
        <span className={`inline-flex items-center gap-1${indentClass}`}>
          {isPurchase && row.isChild && (
            <span className="text-muted-foreground text-xs mr-0.5">↳</span>
          )}
          {isMaterialBudgetPost && row.isChild && !isPurchase && (
            <span className="text-muted-foreground text-xs mr-0.5">└</span>
          )}
          <button
            className={cn(
              "font-medium text-left hover:underline cursor-pointer",
              isPurchase ? "text-muted-foreground" : "text-primary"
            )}
            onClick={(e) => {
              e.stopPropagation();
              openDetail(row);
            }}
          >
            {row.name}
          </button>
          {row.isAta && (
            <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0 text-orange-600 border-orange-300">{t('budget.addition', 'Tillägg')}</Badge>
          )}
          {row.type === "task" && (row.childCount ?? 0) > 0 && (
            <button
              className="ml-1.5 inline-flex items-center gap-0.5 text-blue-500 hover:text-blue-700 transition-colors rounded px-1 py-0.5 hover:bg-blue-50"
              onClick={(e) => {
                e.stopPropagation();
                toggleTaskExpand(row.id);
              }}
            >
              <ShoppingCart className="h-3 w-3" />
              <span className="text-xs">{row.childCount}</span>
            </button>
          )}
          {isMaterialBudgetPost && (row.purchaseCount ?? 0) > 0 && (
            <button
              className="ml-1.5 inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors rounded px-1 py-0.5 hover:bg-muted"
              onClick={(e) => {
                e.stopPropagation();
                toggleBudgetPostExpand(row.id);
              }}
            >
              <span className="text-xs">↳ {row.purchaseCount}</span>
            </button>
          )}
          {row.type === "purchase" && !row.parentBudgetPostId && !row.isSectionHeader && !row.isPoHeader && (
            <span className="ml-1.5 text-amber-500" title={t("budget.orphanWarning", "Ej kopplat till budgetpost")}>
              &#9888;
            </span>
          )}
        </span>
      );
    }
    case "type": {
      if (isPurchase) {
        return (
          <Badge variant="outline" className="gap-1 text-gray-500">
            <ShoppingCart className="h-3 w-3 text-gray-400" />
            {t('budget.purchase', 'Inköp')}
          </Badge>
        );
      }
      if (isMaterialBudgetPost) {
        return (
          <Badge variant="outline" className="gap-1 text-gray-500">
            <ShoppingCart className="h-3 w-3 text-gray-400" />
            {t('budget.materialBudget', 'Materialbudget')}
          </Badge>
        );
      }
      if (row.type === "material") {
        return (
          <Badge variant="outline" className="gap-1 text-gray-500">
            <ShoppingCart className="h-3 w-3 text-gray-400" />
            {t('budget.material')}
          </Badge>
        );
      }
      const isSubcontractor = isBuilder && (row.taskCostType === "subcontractor" || (!row.taskCostType && (row.subcontractorCost ?? 0) > 0));
      const hasOwnLabor = row.taskCostType === "own_labor" || (!row.taskCostType && (row.estimatedHours ?? 0) > 0);
      return (
        <Badge variant="outline" className="gap-1 text-gray-500">
          {isSubcontractor ? <Handshake className="h-3 w-3 text-gray-400" /> : <Hammer className="h-3 w-3 text-gray-400" />}
          {isSubcontractor && !hasOwnLabor
            ? t('budget.subcontractor', 'UE')
            : t('budget.task')}
        </Badge>
      );
    }
    case "status": {
      if (row.isPoHeader) {
        if (!row.status) return null;
        const label = t(`materialStatuses.${row.status}`, row.status);
        return <Badge className={cn("border", getStatusBadgeColor(row.status))}>{label}</Badge>;
      }
      if (row.id.startsWith("__")) return null;
      const isEditingStatus = editingCell?.rowId === row.id && editingCell?.col === "status";
      const statusLabel = row.status
        ? (row.type === "task"
          ? t(`statuses.${budgetStatusKey(row.status)}`, row.status)
          : t(`materialStatuses.${row.status}`, row.status))
        : "—";

      if (isEditingStatus) {
        const options = row.type === "task"
          ? ["planned", "to_do", "in_progress", "waiting", "completed", "cancelled"]
          : ["planned", "submitted", "approved", "billed", "paid", "paused"];
        return (
          <Select
            value={row.status || ""}
            onValueChange={(v) => handleStatusSave(row, v)}
            open
            onOpenChange={(open) => { if (!open) setEditingCell(null); }}
          >
            <SelectTrigger className="h-7 w-32 text-xs" onClick={(e) => e.stopPropagation()}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((s) => (
                <SelectItem key={s} value={s}>
                  {row.type === "task" ? t(`statuses.${budgetStatusKey(s)}`, s) : t(`materialStatuses.${s}`, s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      }

      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setEditingCell({ rowId: row.id, col: "status" });
          }}
        >
          {row.status
            ? <Badge className={cn("border cursor-pointer hover:opacity-80", getStatusBadgeColor(row.status))}>{statusLabel}</Badge>
            : <span className="text-muted-foreground cursor-pointer hover:text-foreground">{"–"}</span>}
        </button>
      );
    }
    case "phase": {
      if (row.id.startsWith("__") && !row.isPoHeader) return null;
      const phase = row.phase;
      if (!phase) return <span className="text-muted-foreground/30">{"–"}</span>;
      const phaseConfig = {
        budget:  { label: t('budget.phaseBudget',  'Budgeterat'), cls: "bg-slate-100 text-slate-600 border-slate-200" },
        ordered: { label: t('budget.phaseOrdered', 'Beställt'),   cls: "bg-blue-100 text-blue-700 border-blue-200" },
        actual:  { label: t('budget.phaseActual',  'Verkligt'),   cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
      }[phase];
      return <Badge variant="outline" className={cn("border", phaseConfig.cls)}>{phaseConfig.label}</Badge>;
    }
    case "consumed": {
      if (!isMaterialBudgetPost) return <span className="text-muted-foreground/30">{"–"}</span>;
      const consumed = row.consumedTotal ?? 0;
      return consumed > 0
        ? <span>{formatCurrency(consumed, currency)}</span>
        : <span className="text-muted-foreground/30">{"–"}</span>;
    }
    case "budget": {
      if (isPurchase) return <span className="text-muted-foreground/30">{"–"}</span>;
      if (row.type === "material" && !row.isBudgetPost) return <span className="text-muted-foreground/30">{"–"}</span>;
      if (row.id.startsWith("__")) return <span>{formatCurrency(row.budget, currency)}</span>;
      if (!isBuilder) return <span>{formatCurrency(row.budget, currency)}</span>;
      const isEditing = editingCell?.rowId === row.id && editingCell?.col === col.key;
      if (isEditing) {
        return (
          <Input
            type="number"
            className="w-24 h-7 text-right"
            autoFocus
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCellSave(row, col.key, editValue);
              if (e.key === "Escape") setEditingCell(null);
            }}
            onBlur={() => handleCellSave(row, col.key, editValue)}
            onClick={(e) => e.stopPropagation()}
          />
        );
      }
      return (
        <button
          className="hover:bg-muted px-1 rounded cursor-text"
          onClick={(e) => {
            e.stopPropagation();
            setEditingCell({ rowId: row.id, col: col.key });
            setEditValue(String(row.budget));
          }}
        >
          {formatCurrency(row.budget, currency)}
        </button>
      );
    }
    case "paid": {
      if (row.isPoHeader) {
        const amount = isBuilder ? getEffectiveCost(row) : row.paid;
        const isEstimated = isBuilder && row.isEstimated;
        const estimatedTitle = t("budget.estimatedCostExplain", "Beräknad kostnad — verkligt belopp inte registrerat ännu");
        return (
          <span
            className={isEstimated ? "text-muted-foreground italic" : ""}
            title={isEstimated && amount > 0 ? estimatedTitle : undefined}
          >
            {formatCurrency(amount, currency)}
            {isEstimated && amount > 0 && <span className="ml-0.5">*</span>}
          </span>
        );
      }
      if (row.id.startsWith("__")) return <span className="text-muted-foreground/30">{"–"}</span>;
      const displayAmount = isBuilder ? getEffectiveCost(row) : row.paid;
      const isEditingPaid = editingCell?.rowId === row.id && editingCell?.col === col.key;
      if (isEditingPaid) {
        return (
          <Input
            type="number"
            className="w-24 h-7 text-right"
            autoFocus
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCellSave(row, col.key, editValue);
              if (e.key === "Escape") setEditingCell(null);
            }}
            onBlur={() => handleCellSave(row, col.key, editValue)}
            onClick={(e) => e.stopPropagation()}
          />
        );
      }
      return (
        <button
          className="hover:bg-muted px-1 rounded cursor-text"
          onClick={(e) => {
            e.stopPropagation();
            setEditingCell({ rowId: row.id, col: col.key });
            setEditValue(row.paid > 0 ? String(row.paid) : "");
          }}
        >
          <span
            className={isBuilder && row.isEstimated ? "text-muted-foreground italic" : ""}
            title={isBuilder && row.isEstimated && displayAmount > 0
              ? t("budget.estimatedCostExplain", "Beräknad kostnad — verkligt belopp inte registrerat ännu")
              : undefined}
          >
            {formatCurrency(displayAmount, currency)}
            {isBuilder && row.isEstimated && displayAmount > 0 && <span className="ml-0.5">*</span>}
          </span>
        </button>
      );
    }
    case "remaining": {
      if (isPurchase) return <span className="text-muted-foreground/30">{"–"}</span>;
      if (isMaterialBudgetPost) {
        const consumed = row.consumedTotal ?? 0;
        const remaining = row.budget - consumed;
        const pctLeft = row.budget > 0 ? remaining / row.budget : 0;
        let matColorClass = "text-green-600";
        if (pctLeft <= 0) matColorClass = "text-destructive";
        else if (pctLeft <= 0.2) matColorClass = "text-amber-500";
        return <span className={matColorClass}>{formatCurrency(remaining, currency)}</span>;
      }
      if (isBuilder) {
        if (row.type === "material") return <span className="text-muted-foreground/30">{"–"}</span>;
        const result = row.budget - getEffectiveCost(row);
        return (
          <span className={result < 0 ? "text-destructive" : result > 0 ? "text-green-600" : ""}>
            {formatCurrency(result, currency)}
          </span>
        );
      }
      const quoted = row.type === "task" ? row.budget : row.estimatedCost;
      if (quoted <= 0) return <span className="text-muted-foreground/30">{"–"}</span>;
      const outstanding = quoted - row.paid;
      return (
        <span className={outstanding < 0 ? "text-destructive" : outstanding > 0 ? "text-amber-600" : "text-green-600"}>
          {formatCurrency(outstanding, currency)}
        </span>
      );
    }
    case "margin": {
      if (row.type !== "task") return <span className="text-muted-foreground/30">{"–"}</span>;
      const effectiveCost = getEffectiveCost(row);
      const result = row.budget - effectiveCost;
      const marginPct = row.budget > 0 ? Math.round((result / row.budget) * 100) : 0;
      const plannedMarkup = row.markupPercent;
      let colorClass = "text-muted-foreground";
      if (marginPct < 0) colorClass = "text-destructive";
      else if (marginPct === 0) colorClass = "text-muted-foreground";
      else if (marginPct < 15) colorClass = "text-amber-500";
      else if (marginPct >= 30) colorClass = "text-green-600";
      return (
        <div className="text-right">
          <span className={colorClass}>{marginPct}%</span>
          {plannedMarkup != null && plannedMarkup > 0 && marginPct !== plannedMarkup && (
            <span className="block text-[10px] text-muted-foreground">
              {t("budget.planned", "Plan")}: {plannedMarkup}%
            </span>
          )}
        </div>
      );
    }
    case "matBudget":
      if (row.type !== "task") return <span className="text-muted-foreground/30">{"–"}</span>;
      return row.materialBudget > 0
        ? <span>{formatCurrency(row.materialBudget, currency)}</span>
        : <span className="text-muted-foreground/30">{"–"}</span>;
    case "matConsumed":
      if (row.type !== "task") return <span className="text-muted-foreground/30">{"–"}</span>;
      return row.materialConsumed > 0
        ? <span>{formatCurrency(row.materialConsumed, currency)}</span>
        : <span className="text-muted-foreground/30">{"–"}</span>;
    case "matRemaining": {
      if (row.type !== "task" || row.materialBudget <= 0)
        return <span className="text-muted-foreground/30">{"–"}</span>;
      const matRemaining = row.materialBudget - row.materialConsumed;
      const pctLeft = row.materialBudget > 0 ? matRemaining / row.materialBudget : 0;
      let matColorClass = "text-green-600";
      if (pctLeft <= 0) matColorClass = "text-destructive";
      else if (pctLeft <= 0.2) matColorClass = "text-amber-500";
      return <span className={matColorClass}>{formatCurrency(matRemaining, currency)}</span>;
    }
    case "room": {
      if (row.id.startsWith("__") || row.type === "purchase") return <span>{row.room || "–"}</span>;
      const isEditingRoom = editingCell?.rowId === row.id && editingCell?.col === "room";
      if (isEditingRoom) {
        return (
          <Select value={row.roomId || "none"} onValueChange={(v) => handleCellSave(row, "room", v)}
            open onOpenChange={(open) => { if (!open) setEditingCell(null); }}>
            <SelectTrigger className="h-7 w-32 text-xs" onClick={(e) => e.stopPropagation()}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{"–"}</SelectItem>
              {allRooms.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
            </SelectContent>
          </Select>
        );
      }
      return (
        <button className="hover:bg-muted px-1 rounded cursor-text"
          onClick={(e) => { e.stopPropagation(); setEditingCell({ rowId: row.id, col: "room" }); }}>
          {row.room || <span className="text-muted-foreground/30">{"–"}</span>}
        </button>
      );
    }
    case "assignee":
      return <span>{row.assignee || "–"}</span>;
    case "costCenter": {
      if (row.id.startsWith("__") || row.type !== "task") return <span>{row.costCenter || "–"}</span>;
      const isEditingCC = editingCell?.rowId === row.id && editingCell?.col === "costCenter";
      if (isEditingCC) {
        return (
          <Select value={row.costCenter || "none"} onValueChange={(v) => handleCellSave(row, "costCenter", v)}
            open onOpenChange={(open) => { if (!open) setEditingCell(null); }}>
            <SelectTrigger className="h-7 w-32 text-xs" onClick={(e) => e.stopPropagation()}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{"–"}</SelectItem>
              {distinctCostCenters.map(cc => <SelectItem key={cc} value={cc}>{cc}</SelectItem>)}
            </SelectContent>
          </Select>
        );
      }
      return (
        <button className="hover:bg-muted px-1 rounded cursor-text"
          onClick={(e) => { e.stopPropagation(); setEditingCell({ rowId: row.id, col: "costCenter" }); }}>
          {row.costCenter || <span className="text-muted-foreground/30">{"–"}</span>}
        </button>
      );
    }
    case "startDate":
      return <span>{formatDate(row.startDate)}</span>;
    case "finishDate":
      return <span>{formatDate(row.finishDate)}</span>;
    case "attachment":
      if (!row.hasAttachment) return null;
      return (
        <FilePreviewPopover
          projectId={projectId}
          taskId={row.type === "task" ? row.id : undefined}
          materialId={(row.type === "material" || row.type === "purchase") ? row.id : undefined}
        >
          <button type="button" className="cursor-pointer">
            <AttachmentIndicator hasAttachment={row.hasAttachment} count={row.attachmentCount} />
          </button>
        </FilePreviewPopover>
      );
    case "evidence": {
      const es = row.evidenceStatus;
      if (!es || es === "na") return null;
      const dotColor = getEvidenceColor(es);
      const label = t(`evidence.${es}`);
      const dot = <span className={`inline-block h-2.5 w-2.5 rounded-full ${dotColor}`} title={label} />;
      if (row.hasAttachment) {
        return (
          <FilePreviewPopover
            projectId={projectId}
            taskId={row.type === "task" ? row.id : undefined}
            materialId={row.type === "material" ? row.id : undefined}
          >
            <button type="button" className="cursor-pointer">{dot}</button>
          </FilePreviewPopover>
        );
      }
      return dot;
    }
    case "estimatedHours":
    case "hourlyRate":
    case "subcontractorCost":
    case "rotAmount": {
      if (row.type !== "task" || row.id.startsWith("__")) return <span className="text-muted-foreground/30">{"–"}</span>;
      const numFieldMap: Record<string, number | undefined> = {
        estimatedHours: row.estimatedHours,
        hourlyRate: row.hourlyRate,
        subcontractorCost: row.subcontractorCost,
        rotAmount: row.rotAmount,
      };
      const numVal = numFieldMap[col.key];
      const isCurr = col.key !== "estimatedHours";
      const isEditingNum = editingCell?.rowId === row.id && editingCell?.col === col.key;
      if (isEditingNum) {
        return (
          <Input type="number" className="w-24 h-7 text-right text-xs" autoFocus
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCellSave(row, col.key, editValue); if (e.key === "Escape") setEditingCell(null); }}
            onBlur={() => handleCellSave(row, col.key, editValue)}
            onClick={(e) => e.stopPropagation()} />
        );
      }
      return (
        <button className="hover:bg-muted px-1 rounded cursor-text"
          onClick={(e) => { e.stopPropagation(); setEditingCell({ rowId: row.id, col: col.key }); setEditValue(numVal != null ? String(numVal) : ""); }}>
          {numVal != null ? (isCurr ? formatCurrency(numVal, currency) : String(numVal)) : <span className="text-muted-foreground/30">{"–"}</span>}
        </button>
      );
    }
    case "paymentStatus": {
      if (row.type !== "task" || row.id.startsWith("__")) return <span className="text-muted-foreground/30">{"–"}</span>;
      const isEditingPmt = editingCell?.rowId === row.id && editingCell?.col === "paymentStatus";
      if (isEditingPmt) {
        return (
          <Select value={row.paymentStatus || "not_paid"} onValueChange={(v) => handleCellSave(row, "paymentStatus", v)}
            open onOpenChange={(open) => { if (!open) setEditingCell(null); }}>
            <SelectTrigger className="h-7 w-32 text-xs" onClick={(e) => e.stopPropagation()}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="not_paid">{t("paymentStatuses.notPaid", "Ej betalt")}</SelectItem>
              <SelectItem value="paid">{t("paymentStatuses.paid", "Betalt")}</SelectItem>
              <SelectItem value="partially_paid">{t("paymentStatuses.partiallyPaid", "Delbetalt")}</SelectItem>
            </SelectContent>
          </Select>
        );
      }
      const pmtKey = budgetStatusKey(row.paymentStatus || "not_paid");
      const pmtColor = row.paymentStatus === "paid" ? "bg-green-100 text-green-700"
        : row.paymentStatus === "partially_paid" ? "bg-amber-100 text-amber-700"
        : "bg-gray-100 text-gray-700";
      return (
        <button type="button" onClick={(e) => { e.stopPropagation(); setEditingCell({ rowId: row.id, col: "paymentStatus" }); }}>
          <Badge className={cn(pmtColor, "cursor-pointer hover:opacity-80")}>{t(`paymentStatuses.${pmtKey}`, row.paymentStatus || "not_paid")}</Badge>
        </button>
      );
    }
    case "quantity":
    case "pricePerUnit":
    case "orderedAmount": {
      if ((col.key === "quantity" || col.key === "pricePerUnit") && row.type !== "material" && row.type !== "purchase") return <span className="text-muted-foreground/30">{"–"}</span>;
      if (row.id.startsWith("__")) return <span className="text-muted-foreground/30">{"–"}</span>;
      const matFieldMap: Record<string, number | undefined> = {
        quantity: row.quantity, pricePerUnit: row.pricePerUnit, orderedAmount: row.orderedAmount,
      };
      const matVal = matFieldMap[col.key];
      const isMatCurr = col.key !== "quantity";
      const isEditingMat = editingCell?.rowId === row.id && editingCell?.col === col.key;
      if (isEditingMat) {
        return (
          <Input type="number" className="w-24 h-7 text-right text-xs" autoFocus
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCellSave(row, col.key, editValue); if (e.key === "Escape") setEditingCell(null); }}
            onBlur={() => handleCellSave(row, col.key, editValue)}
            onClick={(e) => e.stopPropagation()} />
        );
      }
      return (
        <button className="hover:bg-muted px-1 rounded cursor-text"
          onClick={(e) => { e.stopPropagation(); setEditingCell({ rowId: row.id, col: col.key }); setEditValue(matVal != null ? String(matVal) : ""); }}>
          {matVal != null ? (isMatCurr ? formatCurrency(matVal, currency) : String(matVal)) : <span className="text-muted-foreground/30">{"–"}</span>}
        </button>
      );
    }
    case "supplier": {
      if (row.isPoHeader) {
        return row.vendor
          ? <span className="text-xs text-muted-foreground">{row.vendor}</span>
          : <span className="text-muted-foreground/30">{"–"}</span>;
      }
      if (row.type !== "task" || row.id.startsWith("__")) return <span className="text-muted-foreground/30">{"–"}</span>;
      const isEditingSupplier = editingCell?.rowId === row.id && editingCell?.col === "supplier";
      if (isEditingSupplier) {
        const filtered = editValue.trim()
          ? suppliers.filter(s => s.name.toLowerCase().includes(editValue.trim().toLowerCase()))
          : suppliers;
        return (
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <Input
              type="text"
              className="w-36 h-7 text-xs"
              autoFocus
              placeholder={t('budget.supplierPlaceholder', 'Skriv leverantörsnamn...')}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSupplierSave(row, editValue);
                if (e.key === "Escape") setEditingCell(null);
              }}
              onBlur={() => { setTimeout(() => handleSupplierSave(row, editValue), 150); }}
            />
            {filtered.length > 0 && editValue.trim() && (
              <div className="absolute top-8 left-0 z-30 w-48 bg-popover border rounded-md shadow-md max-h-32 overflow-y-auto">
                {filtered.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    className="w-full text-left px-2 py-1.5 text-xs hover:bg-muted truncate"
                    onMouseDown={(e) => { e.preventDefault(); handleSupplierSave(row, s.name); }}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      }
      return (
        <button
          type="button"
          className="hover:bg-muted px-1 rounded cursor-text"
          onClick={(e) => {
            e.stopPropagation();
            setEditingCell({ rowId: row.id, col: "supplier" });
            setEditValue(row.supplierName || "");
          }}
        >
          {row.supplierName || <span className="text-muted-foreground/30">{"–"}</span>}
        </button>
      );
    }
    case "vendor":
      if (row.type !== "material") return <span className="text-muted-foreground/30">{"–"}</span>;
      return <span>{row.vendor || "–"}</span>;
    default:
      return null;
  }
}

export interface FooterCellContext {
  totals: BudgetTotals;
  filtered: BudgetRow[];
  rows: BudgetRow[];
  isBuilder: boolean;
  currency?: string | null;
  t: TFunction;
}

export function renderFooterCell(col: ColumnDef, ctx: FooterCellContext): ReactNode {
  const { totals, filtered, rows, isBuilder, currency, t } = ctx;
  switch (col.key) {
    case "name":
      return <span className="font-bold">{t('budget.totals')}</span>;
    case "budget":
      return <span className="font-bold">{formatCurrency(totals.budget, currency)}</span>;
    case "consumed":
      return totals.consumed > 0
        ? <span className="font-bold">{formatCurrency(totals.consumed, currency)}</span>
        : null;
    case "paid":
      return <span className="font-bold">{formatCurrency(isBuilder ? totals.cost : totals.paid, currency)}</span>;
    case "remaining": {
      if (isBuilder) {
        const totalResult = totals.budget - totals.cost;
        return (
          <span className={`font-bold ${totalResult < 0 ? "text-destructive" : totalResult > 0 ? "text-green-600" : ""}`}>
            {formatCurrency(totalResult, currency)}
          </span>
        );
      }
      const totalOutstanding = filtered.reduce((sum, r) => {
        if (r.type === "purchase") return sum;
        const quoted = r.budget > 0 ? r.budget : r.estimatedCost;
        return sum + (quoted > 0 ? quoted - r.paid : 0);
      }, 0);
      return (
        <span className={`font-bold ${totalOutstanding < 0 ? "text-destructive" : totalOutstanding > 0 ? "text-amber-600" : "text-green-600"}`}>
          {formatCurrency(totalOutstanding, currency)}
        </span>
      );
    }
    case "margin": {
      const totalResult = totals.budget - totals.cost;
      const totalMargin = totals.budget > 0 ? Math.round((totalResult / totals.budget) * 100) : 0;
      let colorClass = "";
      if (totalMargin < 0) colorClass = "text-destructive";
      else if (totalMargin === 0) colorClass = "text-muted-foreground";
      else if (totalMargin < 15) colorClass = "text-amber-500";
      else if (totalMargin >= 30) colorClass = "text-green-600";
      return <span className={`font-bold ${colorClass}`}>{totalMargin}%</span>;
    }
    case "matBudget":
      return <span className="font-bold">{formatCurrency(totals.matBudget, currency)}</span>;
    case "matConsumed":
      return <span className="font-bold">{formatCurrency(totals.matConsumed, currency)}</span>;
    case "matRemaining": {
      const totalMatRemaining = totals.matBudget - totals.matConsumed;
      const matPctLeft = totals.matBudget > 0 ? totalMatRemaining / totals.matBudget : 0;
      let matFooterColor = "text-green-600";
      if (matPctLeft <= 0) matFooterColor = "text-destructive";
      else if (matPctLeft <= 0.2) matFooterColor = "text-amber-500";
      return <span className={`font-bold ${totals.matBudget > 0 ? matFooterColor : ""}`}>{formatCurrency(totalMatRemaining, currency)}</span>;
    }
    case "rotAmount": {
      const totalRot = rows.filter(r => r.type === "task").reduce((sum, r) => sum + (r.rotAmount ?? 0), 0);
      return totalRot > 0 ? <span className="font-bold text-green-700">{formatCurrency(totalRot, currency)}</span> : null;
    }
    default:
      return null;
  }
}

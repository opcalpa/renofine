import { Fragment, useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/currency";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";


import { AttachmentIndicator } from "@/components/shared/AttachmentIndicator";
import { GripVertical, ArrowUp, ArrowDown, ArrowUpDown, ShoppingCart } from "lucide-react";
import type { RowType, UnifiedRow, UnifiedColumnKey, UnifiedColumnDef } from "./types";
import { TASK_DB_FIELD_MAP, MATERIAL_DB_FIELD_MAP } from "./columns";

interface UnifiedTableBodyProps {
  rows: UnifiedRow[];
  activeRowTypes: Set<RowType>;
  searchQuery: string;
  visibleColumns: UnifiedColumnDef[];
  sortKey: UnifiedColumnKey | null;
  sortDir: "asc" | "desc";
  handleSort: (key: UnifiedColumnKey) => void;
  handleDragStart: (idx: number) => void;
  handleDragOver: (e: React.DragEvent, idx: number) => void;
  handleDrop: () => void;
  compactRows: boolean;
  currency?: string | null;
  isReadOnly?: boolean;
  onRowClick: (row: UnifiedRow) => void;
  onDataChanged: () => void;
  rooms: { id: string; name: string }[];
  stakeholders: { id: string; name: string }[];
}

interface TableGroup {
  parent: UnifiedRow;
  children: UnifiedRow[];
  aggregated: { budget: number; ordered: number; paid: number };
}

const TASK_PAYMENT_STATUSES = [
  { value: "not_paid", labelKey: "paymentStatuses.notPaid" },
  { value: "billed", labelKey: "materialStatuses.billed" },
  { value: "partially_paid", labelKey: "paymentStatuses.partiallyPaid" },
  { value: "paid", labelKey: "materialStatuses.paid" },
];

const MATERIAL_STATUSES = [
  { value: "submitted", labelKey: "materialStatuses.submitted" },
  { value: "declined", labelKey: "materialStatuses.declined" },
  { value: "approved", labelKey: "materialStatuses.approved" },
  { value: "billed", labelKey: "materialStatuses.billed" },
  { value: "paid", labelKey: "materialStatuses.paid" },
  { value: "paused", labelKey: "materialStatuses.paused" },
];

const PRIORITIES = [
  { value: "low", labelKey: "tasks.lowPriority" },
  { value: "medium", labelKey: "tasks.mediumPriority" },
  { value: "high", labelKey: "tasks.highPriority" },
];

export function UnifiedTableBody({
  rows,
  activeRowTypes,
  searchQuery,
  visibleColumns,
  sortKey,
  sortDir,
  handleSort,
  handleDragStart,
  handleDragOver,
  handleDrop,
  compactRows,
  currency,
  isReadOnly,
  onRowClick,
  onDataChanged,
  rooms,
  stakeholders,
}: UnifiedTableBodyProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [editingCell, setEditingCell] = useState<{
    rowId: string;
    col: UnifiedColumnKey;
  } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  const toggleExpand = useCallback((taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);

  // Sort comparator reused for group sorting
  const compareFn = useCallback(
    (a: UnifiedRow, b: UnifiedRow): number => {
      if (!sortKey) return 0;
      let av: string | number;
      let bv: string | number;

      switch (sortKey) {
        case "remaining":
          av = a.budget - a.paid;
          bv = b.budget - b.paid;
          break;
        case "room":
          av = a.room || "";
          bv = b.room || "";
          break;
        case "assignee":
          av = a.assignee || "";
          bv = b.assignee || "";
          break;
        case "costCenter":
          av = a.costCenter || "";
          bv = b.costCenter || "";
          break;
        case "rowType":
          av = a.rowType;
          bv = b.rowType;
          break;
        default: {
          const aVal = a[sortKey as keyof UnifiedRow];
          const bVal = b[sortKey as keyof UnifiedRow];
          av = typeof aVal === "number" ? aVal : String(aVal ?? "");
          bv = typeof bVal === "number" ? bVal : String(bVal ?? "");
        }
      }

      let cmp: number;
      if (typeof av === "number" && typeof bv === "number") {
        cmp = av - bv;
      } else {
        cmp = String(av).localeCompare(String(bv));
      }
      return sortDir === "asc" ? cmp : -cmp;
    },
    [sortKey, sortDir]
  );

  // Build hierarchical groups from flat rows
  const { groups, autoExpandedIds } = useMemo(() => {
    const showTasks = activeRowTypes.has("task");
    const showMaterials = activeRowTypes.has("material");
    const q = searchQuery.toLowerCase();

    const tasks = rows.filter((r) => r.rowType === "task");
    const linkedMaterials = rows.filter((r) => r.rowType === "material" && r.taskId);
    const standaloneMaterials = rows.filter((r) => r.rowType === "material" && !r.taskId);

    // Map linked materials by taskId
    const materialsByTask = new Map<string, UnifiedRow[]>();
    for (const m of linkedMaterials) {
      const list = materialsByTask.get(m.taskId!) || [];
      list.push(m);
      materialsByTask.set(m.taskId!, list);
    }

    const result: TableGroup[] = [];
    const autoExp = new Set<string>();

    if (showTasks) {
      for (const task of tasks) {
        const children = showMaterials ? (materialsByTask.get(task.id) || []) : [];
        const childOrdered = children.reduce((s, c) => s + c.ordered, 0);
        const childPaid = children.reduce((s, c) => s + c.paid, 0);

        // Search: include group if parent or any child matches
        const parentMatches = !q || task.name.toLowerCase().includes(q);
        const matchingChildren = q
          ? children.filter((c) => c.name.toLowerCase().includes(q))
          : children;

        if (!parentMatches && matchingChildren.length === 0) continue;

        // Auto-expand when a child matches search
        if (q && matchingChildren.length > 0) {
          autoExp.add(task.id);
        }

        result.push({
          parent: task,
          children: q ? matchingChildren : children,
          aggregated: {
            budget: task.budget,
            ordered: task.ordered + childOrdered,
            paid: task.paid + childPaid,
          },
        });
      }
    }

    // Standalone materials as top-level groups
    if (showMaterials) {
      for (const mat of standaloneMaterials) {
        if (q && !mat.name.toLowerCase().includes(q)) continue;
        result.push({
          parent: mat,
          children: [],
          aggregated: { budget: mat.budget, ordered: mat.ordered, paid: mat.paid },
        });
      }
    }

    // Tasks OFF + materials ON → show linked materials as standalone too
    if (!showTasks && showMaterials) {
      for (const mat of linkedMaterials) {
        if (q && !mat.name.toLowerCase().includes(q)) continue;
        result.push({
          parent: mat,
          children: [],
          aggregated: { budget: mat.budget, ordered: mat.ordered, paid: mat.paid },
        });
      }
    }

    if (sortKey) {
      result.sort((a, b) => compareFn(a.parent, b.parent));
    }

    return { groups: result, autoExpandedIds: autoExp };
  }, [rows, activeRowTypes, searchQuery, sortKey, sortDir, compareFn]);

  // Totals from top-level groups only — prevents double counting
  const totals = useMemo(() => {
    return groups.reduce(
      (acc, g) => ({
        budget: acc.budget + g.aggregated.budget,
        ordered: acc.ordered + g.aggregated.ordered,
        paid: acc.paid + g.aggregated.paid,
        estimatedHours: acc.estimatedHours + (g.parent.estimatedHours ?? 0),
        subcontractorCost: acc.subcontractorCost + (g.parent.subcontractorCost ?? 0),
        materialEstimate: acc.materialEstimate + (g.parent.materialEstimate ?? 0),
      }),
      { budget: 0, ordered: 0, paid: 0, estimatedHours: 0, subcontractorCost: 0, materialEstimate: 0 }
    );
  }, [groups]);

  // Inline save
  const handleCellSave = async (
    row: UnifiedRow,
    col: UnifiedColumnKey,
    value: string
  ) => {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      setEditingCell(null);
      return;
    }

    try {
      const dbFieldMap = row.rowType === "task" ? TASK_DB_FIELD_MAP : MATERIAL_DB_FIELD_MAP;
      const dbField = dbFieldMap[col];
      if (!dbField) {
        setEditingCell(null);
        return;
      }

      const tableName = row.rowType === "task" ? "tasks" : "materials";
      const { error } = await supabase
        .from(tableName)
        .update({ [dbField]: numValue })
        .eq("id", row.id);
      if (error) throw error;

      setEditingCell(null);
      onDataChanged();
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : t("unifiedTable.failedToUpdateField");
      toast({ title: t("common.error"), description: msg, variant: "destructive" });
    }
  };

  const handleStatusChange = async (row: UnifiedRow, newStatus: string) => {
    try {
      if (row.rowType === "task") {
        const { error } = await supabase
          .from("tasks")
          .update({ payment_status: newStatus })
          .eq("id", row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("materials")
          .update({ status: newStatus })
          .eq("id", row.id);
        if (error) throw error;
      }
      onDataChanged();
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : t("unifiedTable.failedToUpdateField");
      toast({ title: t("common.error"), description: msg, variant: "destructive" });
    }
  };

  const handleSelectChange = async (
    row: UnifiedRow,
    col: UnifiedColumnKey,
    value: string
  ) => {
    try {
      const dbFieldMap = row.rowType === "task" ? TASK_DB_FIELD_MAP : MATERIAL_DB_FIELD_MAP;
      const dbField = dbFieldMap[col];
      if (!dbField) return;

      const tableName = row.rowType === "task" ? "tasks" : "materials";
      const dbValue = value === "__none__" ? null : value;
      const { error } = await supabase
        .from(tableName)
        .update({ [dbField]: dbValue })
        .eq("id", row.id);
      if (error) throw error;
      onDataChanged();
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : t("unifiedTable.failedToUpdateField");
      toast({ title: t("common.error"), description: msg, variant: "destructive" });
    }
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "\u2014";
    return new Date(dateStr).toLocaleDateString("sv-SE");
  };

  const isApplicable = (col: UnifiedColumnDef, row: UnifiedRow): boolean => {
    return col.appliesTo === "both" || col.appliesTo === row.rowType;
  };

  // Cell renderer
  const renderCell = (col: UnifiedColumnDef, row: UnifiedRow) => {
    if (!isApplicable(col, row)) {
      return <span className="text-muted-foreground">{"\u2014"}</span>;
    }

    switch (col.key) {
      case "name":
        return (
          <span className="inline-flex items-center">
            <button
              className="font-medium text-left hover:underline text-primary cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onRowClick(row);
              }}
            >
              {row.name}
            </button>
            {row.isUnlinked && (
              <span className="ml-1.5 text-amber-500" title={t("budget.unlinkedWarning", "Unlinked material")}>
                &#9888;
              </span>
            )}
          </span>
        );

      case "rowType":
        return (
          <Badge variant={row.rowType === "task" ? "default" : "secondary"}>
            {row.rowType === "task" ? t("unifiedTable.showTasks") : t("unifiedTable.showMaterials")}
          </Badge>
        );

      case "status": {
        if (isReadOnly) {
          const statuses = row.rowType === "task" ? TASK_PAYMENT_STATUSES : MATERIAL_STATUSES;
          const current = statuses.find((s) => s.value === row.status);
          return <span className="text-sm">{current ? t(current.labelKey) : row.status}</span>;
        }
        const statuses = row.rowType === "task" ? TASK_PAYMENT_STATUSES : MATERIAL_STATUSES;
        return (
          <Select
            value={row.status}
            onValueChange={(v) => handleStatusChange(row, v)}
          >
            <SelectTrigger className="w-[150px]" onClick={(e) => e.stopPropagation()}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statuses.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {t(s.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      }

      case "priority": {
        if (isReadOnly) {
          const p = PRIORITIES.find((pr) => pr.value === row.priority);
          return <span className="text-sm">{p ? t(p.labelKey) : row.priority || "\u2014"}</span>;
        }
        return (
          <Select
            value={row.priority || "medium"}
            onValueChange={(v) => handleSelectChange(row, "priority", v)}
          >
            <SelectTrigger className="w-[100px]" onClick={(e) => e.stopPropagation()}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITIES.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {t(p.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      }

      case "budget":
      case "ordered":
      case "paid":
      case "estimatedHours":
      case "hourlyRate":
      case "subcontractorCost":
      case "materialEstimate":
      case "markupPercent": {
        const rawValue = row[col.key as keyof UnifiedRow] as number | null | undefined;
        const isEditing = editingCell?.rowId === row.id && editingCell?.col === col.key;
        const isCurrency = ["budget", "ordered", "paid", "subcontractorCost", "materialEstimate"].includes(col.key);

        if (isEditing && !isReadOnly) {
          return (
            <Input
              type="number"
              className="w-24 h-7 text-right text-xs"
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

        if (isReadOnly) {
          return (
            <span className="text-sm">
              {isCurrency
                ? formatCurrency(rawValue ?? 0, currency)
                : rawValue != null
                  ? String(rawValue)
                  : "\u2014"}
            </span>
          );
        }

        if (rawValue == null && !["budget", "ordered", "paid"].includes(col.key)) {
          return (
            <button
              className="text-muted-foreground text-xs hover:bg-muted px-1 rounded cursor-text"
              onClick={(e) => {
                e.stopPropagation();
                setEditingCell({ rowId: row.id, col: col.key });
                setEditValue("");
              }}
            >
              -
            </button>
          );
        }

        return (
          <button
            className="hover:bg-muted px-1 rounded cursor-text text-sm"
            onClick={(e) => {
              e.stopPropagation();
              setEditingCell({ rowId: row.id, col: col.key });
              setEditValue(String(rawValue ?? 0));
            }}
          >
            {isCurrency ? formatCurrency(rawValue ?? 0, currency) : String(rawValue ?? 0)}
          </button>
        );
      }

      case "remaining": {
        const remaining = row.budget - row.paid;
        return (
          <span className={remaining < 0 ? "text-destructive" : ""}>
            {formatCurrency(remaining, currency)}
          </span>
        );
      }

      case "room": {
        if (isReadOnly) {
          return <span className="text-sm">{row.room || "\u2014"}</span>;
        }
        return (
          <Select
            value={row.roomId || "__none__"}
            onValueChange={(v) => handleSelectChange(row, "room", v)}
          >
            <SelectTrigger className="w-[120px]" onClick={(e) => e.stopPropagation()}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{"\u2014"}</SelectItem>
              {rooms.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      }

      case "assignee": {
        if (isReadOnly) {
          return <span className="text-sm">{row.assignee || "\u2014"}</span>;
        }
        return (
          <Select
            value={row.assigneeId || "__none__"}
            onValueChange={(v) => handleSelectChange(row, "assignee", v)}
          >
            <SelectTrigger className="w-[140px]" onClick={(e) => e.stopPropagation()}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{"\u2014"}</SelectItem>
              {stakeholders.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      }

      case "costCenter":
        return <span className="text-sm">{row.costCenter || "\u2014"}</span>;

      case "startDate":
        return <span className="text-sm">{formatDate(row.startDate)}</span>;

      case "finishDate":
        return <span className="text-sm">{formatDate(row.finishDate)}</span>;

      case "dueDate":
        return <span className="text-sm">{formatDate(row.dueDate)}</span>;

      case "progress":
        return (
          <span className="text-sm">
            {row.progress != null ? `${row.progress}%` : "\u2014"}
          </span>
        );

      case "paymentStatus": {
        const status = TASK_PAYMENT_STATUSES.find((s) => s.value === row.paymentStatus);
        return <span className="text-sm">{status ? t(status.labelKey) : row.paymentStatus || "\u2014"}</span>;
      }

      case "vendorName":
        return <span className="text-sm">{row.vendorName || "\u2014"}</span>;

      case "quantity":
        return (
          <span className="text-sm">
            {row.quantity != null ? `${row.quantity} ${row.unit || ""}`.trim() : "\u2014"}
          </span>
        );

      case "attachment":
        return (
          <AttachmentIndicator
            hasAttachment={row.hasAttachment}
            count={row.attachmentCount}
          />
        );

      case "actions":
        return null;

      default:
        return null;
    }
  };

  const NON_SUMMABLE_NUMERIC: Set<UnifiedColumnKey> = new Set(["hourlyRate", "markupPercent", "quantity", "progress"]);

  const renderSummaryCell = (col: UnifiedColumnDef) => {
    switch (col.key) {
      case "name":
        return (
          <span className="font-medium">
            {t("unifiedTable.summaryRowLabel", { count: groups.length })}
          </span>
        );
      case "budget":
        return <span>{formatCurrency(totals.budget, currency)}</span>;
      case "ordered":
        return <span>{formatCurrency(totals.ordered, currency)}</span>;
      case "paid":
        return <span>{formatCurrency(totals.paid, currency)}</span>;
      case "subcontractorCost":
        return <span>{formatCurrency(totals.subcontractorCost, currency)}</span>;
      case "materialEstimate":
        return <span>{formatCurrency(totals.materialEstimate, currency)}</span>;
      case "estimatedHours":
        return <span>{totals.estimatedHours}</span>;
      case "remaining": {
        const totalRemaining = totals.budget - totals.paid;
        return (
          <span className={totalRemaining < 0 ? "text-destructive" : ""}>
            {formatCurrency(totalRemaining, currency)}
          </span>
        );
      }
      default:
        if (NON_SUMMABLE_NUMERIC.has(col.key)) {
          return <span className="text-muted-foreground">{"\u2014"}</span>;
        }
        return null;
    }
  };

  /** Render aggregated value for a parent row's ordered/paid/remaining cells */
  const renderAggregatedCell = (col: UnifiedColumnDef, group: TableGroup) => {
    if (col.key === "ordered") {
      return <span className="text-sm">{formatCurrency(group.aggregated.ordered, currency)}</span>;
    }
    if (col.key === "paid") {
      return <span className="text-sm">{formatCurrency(group.aggregated.paid, currency)}</span>;
    }
    if (col.key === "remaining") {
      const remaining = group.aggregated.budget - group.aggregated.paid;
      return (
        <span className={`text-sm ${remaining < 0 ? "text-destructive" : ""}`}>
          {formatCurrency(remaining, currency)}
        </span>
      );
    }
    return renderCell(col, group.parent);
  };

  /** Render a name cell for a parent row with chevron + count badge */
  const renderParentName = (col: UnifiedColumnDef, group: TableGroup, isExpanded: boolean) => {
    const hasChildren = group.children.length > 0;
    return (
      <span className="inline-flex items-center gap-1">
        {renderCell(col, group.parent)}
        {hasChildren && (
          <button
            className="ml-1.5 inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors rounded px-1 py-0.5 hover:bg-muted"
            onClick={(e) => toggleExpand(group.parent.id, e)}
          >
            <ShoppingCart className="h-3 w-3" />
            <span className="text-xs">{group.children.length}</span>
          </button>
        )}
      </span>
    );
  };

  return (
    <div className="rounded-lg border bg-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted border-b">
            {visibleColumns.map((col, idx) => (
              <th
                key={col.key}
                className={`px-3 py-2.5 kicker ${col.align === "right" ? "text-right" : "text-left"} select-none${compactRows ? " py-1 text-xs h-8" : ""}`}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={handleDrop}
              >
                <span className="inline-flex items-center gap-1">
                  <GripVertical className="h-3 w-3 text-muted-foreground/50 cursor-grab active:cursor-grabbing" />
                  <button
                    className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                    onClick={() => handleSort(col.key)}
                  >
                    {col.label}
                    {sortKey === col.key ? (
                      sortDir === "asc" ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 text-muted-foreground/40" />
                    )}
                  </button>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.length === 0 ? (
            <tr>
              <td
                colSpan={visibleColumns.length}
                className="text-center px-3 py-8 text-muted-foreground"
              >
                {t("unifiedTable.noRows")}
              </td>
            </tr>
          ) : (
            <>
              {/* Summary row */}
              <tr className="bg-muted/50 font-medium border-b-2">
                {visibleColumns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-3 py-2.5 ${col.align === "right" ? "text-right" : ""}${compactRows ? " py-0.5 px-2 text-xs" : ""}`}
                  >
                    {renderSummaryCell(col)}
                  </td>
                ))}
              </tr>

              {/* Group rows */}
              {groups.map((group) => {
                const hasChildren = group.children.length > 0;
                const isExpanded = hasChildren && (expandedTasks.has(group.parent.id) || autoExpandedIds.has(group.parent.id));
                const isAggregatedCol = (key: string) => hasChildren && ["ordered", "paid", "remaining"].includes(key);

                return (
                  <Fragment key={`${group.parent.rowType}-${group.parent.id}`}>
                    {/* Parent row */}
                    <tr
                      className={`cursor-pointer border-b last:border-b-0 transition-colors ${
                        group.parent.status === "paid"
                          ? "bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/50"
                          : "hover:bg-muted/30"
                      }${compactRows ? " h-8" : ""}`}
                      onClick={() => onRowClick(group.parent)}
                    >
                      {visibleColumns.map((col) => (
                        <td
                          key={col.key}
                          className={`px-3 py-2.5 ${col.align === "right" ? "text-right" : ""}${compactRows ? " py-0.5 px-2 text-xs" : ""}`}
                        >
                          {col.key === "name"
                            ? renderParentName(col, group, isExpanded)
                            : isAggregatedCol(col.key)
                              ? renderAggregatedCell(col, group)
                              : renderCell(col, group.parent)}
                        </td>
                      ))}
                    </tr>

                    {/* Child rows (expanded sub-rows) */}
                    {isExpanded && group.children.map((child) => (
                      <tr
                        key={`child-${child.id}`}
                        className={`cursor-pointer border-b last:border-b-0 bg-muted/20 hover:bg-muted/40 transition-colors${compactRows ? " h-8" : ""}`}
                        onClick={() => onRowClick(child)}
                      >
                        {visibleColumns.map((col) => (
                          <td
                            key={col.key}
                            className={`px-3 py-2.5 ${col.align === "right" ? "text-right" : ""}${compactRows ? " py-0.5 px-2 text-xs" : ""}${col.key === "name" ? " pl-10" : ""}`}
                          >
                            {col.key === "name" ? (
                              <span className="inline-flex items-center text-sm text-muted-foreground">
                                <span className="mr-1.5">└</span>
                                {renderCell(col, child)}
                              </span>
                            ) : (
                              renderCell(col, child)
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}

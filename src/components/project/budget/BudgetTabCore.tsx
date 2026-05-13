import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/currency";
import { createRequestPurchase } from "@/lib/createRequestPurchase";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowUp, ArrowDown, ArrowUpDown, Columns3, Plus, Layers, Copy, ChevronDown, ChevronRight, FileText, Trash2, Minimize2, Wallet } from "lucide-react";
import { AttachmentIndicator } from "@/components/shared/AttachmentIndicator";
import { FilePreviewPopover } from "@/components/shared/FilePreviewPopover";
import { getStatusBadgeColor } from "@/lib/statusColors";
import { computeEvidenceStatus, getEvidenceColor } from "@/lib/evidenceStatus";
import { BudgetChartsSection } from "../BudgetChartsSection";
import { BuilderSummaryCards } from "./BuilderSummaryCards";
import { HomeownerBudgetView } from "./HomeownerBudgetView";
import { HomeownerAnalysisSection } from "./HomeownerAnalysisSection";
import { RotSummaryCard } from "../overview/RotSummaryCard";
import { useTaxDeductionVisible } from "@/hooks/useTaxDeduction";
import { TaskEditDialog } from "../TaskEditDialog";
import { MaterialEditDialog } from "../MaterialEditDialog";
import { NewPurchaseFromBudgetDialog } from "../NewPurchaseFromBudgetDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { BudgetRow, ColumnKey, ColumnDef, GroupByOption, DisplayRow } from "./shared/types";
import {
  EXTRA_COLUMN_KEYS,
  HOMEOWNER_HIDDEN_COLUMNS,
  HOMEOWNER_EXTRA_KEYS,
} from "./shared/budgetColumns";
import {
  computeTaskEstimatedCost,
  computeTaskLaborCost,
  computeMaterialBudget,
  getEffectiveCost,
} from "./shared/budgetCalc";
import { useBudgetData } from "./shared/useBudgetData";
import { useBudgetTablePrefs } from "./shared/useBudgetTablePrefs";
import { useBudgetFilters } from "./shared/useBudgetFilters";
import { useBudgetTree } from "./shared/useBudgetTree";
import { renderCell, renderFooterCell } from "./shared/cellRenderers";
import { BudgetToolbar } from "./shared/BudgetToolbar";
import { ReadOnlyBudgetView } from "./ReadOnlyBudgetView";

// Status badge colors for combined status column
// Status badge colors now come from shared getStatusBadgeColor()

export interface BudgetTabProps {
  projectId: string;
  currency?: string | null;
  /** Callback for "Skapa faktura" — set by ContractorBudgetTab to open its InvoiceMethodDialog. Omitted by OwnerBudgetTab. */
  onCreateInvoice?: () => void;
  isReadOnly?: boolean;
  userType?: string | null;
  country?: string | null;
}

// Types, helpers and prefs extracted to ./budget/shared/* during the role-
// separation refactor. See plan in the unified budget split memo.

// --- Component ---

export const BudgetTabCore = ({ projectId, currency, isReadOnly, userType, country, onCreateInvoice }: BudgetTabProps) => {
  const isBuilder = userType !== "homeowner";
  const { t } = useTranslation();
  const { showTaxDeduction } = useTaxDeductionVisible(country);
  const { toast } = useToast();

  // All data fetching + row construction lives in this hook so both Owner and
  // Contractor shells can consume it without duplicating the 460-line fetch.
  const {
    rows,
    extraTotal,
    projectBudget,
    loading,
    defaultLaborCostPercent,
    currentProfileId,
    suppliers,
    purchaseOrderInfo,
    allRooms,
    refetch: fetchData,
  } = useBudgetData(projectId);

  // UI-only toolbar state (kept here, not in the data hook)
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Escape key exits fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") setIsFullscreen(false); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isFullscreen]);

  // Grouping
  const [groupBy, setGroupBy] = useState<GroupByOption>(() =>
    (localStorage.getItem(`budget-groupby-${projectId}`) as GroupByOption) || "none"
  );
  const handleGroupByChange = (v: GroupByOption) => {
    setGroupBy(v);
    localStorage.setItem(`budget-groupby-${projectId}`, v);
  };
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const toggleGroupCollapse = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Collapsible columns — visibleExtras + columns/sort/compact come from
  // useBudgetTablePrefs below. ALL_COLUMNS is built first so we can pass it in.

  // Translated column/status definitions
  const ALL_COLUMNS: ColumnDef[] = useMemo(() => [
    { key: "name", label: t('budget.name') },
    { key: "type", label: t('budget.type') },
    { key: "status", label: t('budget.status', 'Status') },
    { key: "phase", label: t('budget.phase', 'Fas') },
    { key: "budget", label: isBuilder ? t('budget.customerPrice') : t('homeownerBudget.quoted', 'Offert'), align: "right" },
    { key: "consumed", label: t('budget.consumed', 'Förbrukat'), align: "right" },
    { key: "matBudget", label: t('budget.matBudget'), align: "right", extra: true },
    { key: "matConsumed", label: t('budget.matConsumed'), align: "right", extra: true },
    { key: "matRemaining", label: t('budget.matRemaining'), align: "right", extra: true },
    { key: "supplier", label: t('budget.supplier', 'Leverantör') },
    { key: "paid", label: isBuilder ? t('budget.cost') : t('homeownerBudget.paid', 'Betalat'), align: "right" },
    { key: "remaining", label: isBuilder ? t('budget.result') : t('homeownerBudget.outstanding', 'Kvarstående'), align: "right" },
    { key: "margin", label: t('budget.margin'), align: "right" },
    { key: "room", label: t('budget.room'), extra: true },
    { key: "assignee", label: t('budget.assignee'), extra: true },
    { key: "costCenter", label: t('budget.costCenter'), extra: true },
    { key: "startDate", label: t('common.startDate'), extra: true },
    { key: "finishDate", label: t('common.finishDate'), extra: true },
    { key: "attachment", label: t('budget.attachments', 'Bilagor'), extra: true },
    { key: "evidence", label: t('evidence.column', 'Underlag'), extra: true },
    // Task-specific extras
    { key: "estimatedHours", label: t('budget.estimatedHours', 'Est. hours'), align: "right", extra: true },
    { key: "hourlyRate", label: t('budget.hourlyRate', 'Hourly rate'), align: "right", extra: true },
    { key: "subcontractorCost", label: t('budget.subcontractorCost', 'Subcontractor'), align: "right", extra: true },
    { key: "paymentStatus", label: t('budget.paymentStatus', 'Payment'), extra: true },
    // Material-specific extras
    { key: "quantity", label: t('budget.quantity', 'Quantity'), align: "right", extra: true },
    { key: "pricePerUnit", label: t('budget.pricePerUnit', 'Price/unit'), align: "right", extra: true },
    { key: "orderedAmount", label: t('budget.orderedAmount', 'Ordered'), align: "right", extra: true },
    // ROT
    { key: "rotAmount", label: t('files.rotAmount', 'ROT-avdrag'), align: "right", extra: true },
  ], [t, isBuilder]);

  // For homeowners, filter out builder-only columns and remap certain core columns as extra
  const homeownerExtraSet = useMemo(() => new Set(HOMEOWNER_EXTRA_KEYS), []);
  const effectiveColumns = useMemo(() => {
    if (isBuilder) return ALL_COLUMNS;
    return ALL_COLUMNS
      .filter((col) => !HOMEOWNER_HIDDEN_COLUMNS.has(col.key))
      .map((col) => homeownerExtraSet.has(col.key) ? { ...col, extra: true } : col);
  }, [ALL_COLUMNS, isBuilder, homeownerExtraSet]);

  const effectiveExtraKeys = isBuilder ? EXTRA_COLUMN_KEYS : HOMEOWNER_EXTRA_KEYS;

  // Column order + visible extras + sort + compact — all persisted, all in one
  // hook so the persist-effect's dep list stays correct across role-shells.
  const {
    columns,
    setColumns,
    visibleExtras,
    setVisibleExtras,
    sortKey,
    setSortKey,
    sortDir,
    setSortDir,
    compactRows,
    setCompactRows,
    dragCol,
    dragOverCol,
  } = useBudgetTablePrefs(projectId, ALL_COLUMNS);

  // Filter state + filtered/sorted rows + totals + distinct lists. Sort key/dir
  // come from useBudgetTablePrefs above so the persisted sort applies the same
  // way for both roles.
  const {
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
    ataRows,
    filtered,
    totals,
    distinctRooms,
    distinctAssignees,
    distinctCostCenters,
    distinctStatuses,
  } = useBudgetFilters(rows, sortKey, sortDir, isBuilder);

  // Inline editing
  const [editingCell, setEditingCell] = useState<{ rowId: string; col: string } | null>(null);
  const [editValue, setEditValue] = useState("");

  // Edit dialogs
  const [editTaskId, setEditTaskId] = useState<string | null>(null);
  const [editMaterialId, setEditMaterialId] = useState<string | null>(null);

  // +Inköp from budget post
  const [purchaseFromBudgetPost, setPurchaseFromBudgetPost] = useState<BudgetRow | null>(null);
  // currentProfileId now comes from useBudgetData hook above

  // Column header context menu
  const [colContextMenu, setColContextMenu] = useState<{ x: number; y: number; colKey: ColumnKey } | null>(null);
  const handleColContextMenu = useCallback((e: React.MouseEvent, colKey: ColumnKey) => {
    e.preventDefault();
    e.stopPropagation();
    setColContextMenu({ x: e.clientX, y: e.clientY, colKey });
  }, []);
  // Close on click outside — delay to avoid catching the same event
  useEffect(() => {
    if (!colContextMenu) return;
    const close = () => setColContextMenu(null);
    const timer = setTimeout(() => {
      window.addEventListener("click", close);
      window.addEventListener("contextmenu", close);
    }, 10);
    return () => { clearTimeout(timer); window.removeEventListener("click", close); window.removeEventListener("contextmenu", close); };
  }, [colContextMenu]);

  // suppliers/purchaseOrderInfo/allRooms now come from useBudgetData hook above
  // compactRows now comes from useBudgetTablePrefs hook above

  // Tree expansion state (task/budget-post/PO/unlinked/ÄTA) and displayRows
  // memo now live in useBudgetTree hook below.

  // Inline add row
  const [isAddingRow, setIsAddingRow] = useState(false);
  const [newRowType, setNewRowType] = useState<"task" | "material">("task");
  const [newRowName, setNewRowName] = useState("");
  const [newRowBudget, setNewRowBudget] = useState("");
  const [newRowRoomId, setNewRowRoomId] = useState("");
  const [addingRowLoading, setAddingRowLoading] = useState(false);
  // allRooms now comes from useBudgetData hook above
  const newRowNameRef = useRef<HTMLInputElement>(null);

  // Auto-persist of table prefs now lives in useBudgetTablePrefs hook above

  // Visible columns (filter out hidden extras)
  const visibleColumns = useMemo(
    () => {
      // Apply user column order but filter through effective columns for role
      const effectiveKeys = new Set(effectiveColumns.map((c) => c.key));
      return columns
        .filter((col) => effectiveKeys.has(col.key))
        .filter((col) => !col.extra || visibleExtras.has(col.key));
    },
    [columns, visibleExtras, effectiveColumns]
  );

  const toggleExtraColumn = (key: ColumnKey) => {
    setVisibleExtras((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Data fetching extracted to useBudgetData hook above.


  // Focus name input when adding row
  useEffect(() => {
    if (isAddingRow && newRowNameRef.current) {
      newRowNameRef.current.focus();
    }
  }, [isAddingRow]);

  // Inline add row handlers
  const handleStartAddRow = () => {
    setIsAddingRow(true);
    setNewRowType("task");
    setNewRowName("");
    setNewRowBudget("");
    setNewRowRoomId("");
  };

  const handleCancelAddRow = () => {
    setIsAddingRow(false);
    setNewRowName("");
    setNewRowBudget("");
    setNewRowRoomId("");
  };

  const handleSaveNewRow = async () => {
    if (!newRowName.trim()) {
      toast({ title: t('common.error'), description: t('budget.nameRequired'), variant: "destructive" });
      return;
    }

    const budgetValue = parseFloat(newRowBudget) || 0;
    setAddingRowLoading(true);

    try {
      // Get current user's profile for created_by_user_id
      const { data: { user } } = await supabase.auth.getUser();
      let profileId: string | null = null;
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", user.id)
          .single();
        profileId = profile?.id || null;
      }

      if (newRowType === "task") {
        const { error } = await supabase.from("tasks").insert({
          project_id: projectId,
          title: newRowName.trim(),
          budget: budgetValue,
          room_id: newRowRoomId || null,
          status: "to_do",
          priority: "medium",
          payment_status: "not_paid",
          created_by_user_id: profileId,
        });
        if (error) throw error;
      } else {
        if (!profileId) throw new Error("Missing profile");
        await createRequestPurchase({
          projectId,
          createdByUserId: profileId,
          material: {
            name: newRowName.trim(),
            price_total: budgetValue,
            room_id: newRowRoomId || null,
            quantity: 1,
            unit: "st",
            exclude_from_budget: false,
          },
        });
      }

      toast({ title: t('common.success'), description: t('budget.rowAdded') });
      handleCancelAddRow();
      await fetchData();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('budget.failedToAddRow');
      toast({ title: t('common.error'), description: msg, variant: "destructive" });
    } finally {
      setAddingRowLoading(false);
    }
  };

  const handleNewRowKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !addingRowLoading) {
      e.preventDefault();
      handleSaveNewRow();
    } else if (e.key === "Escape") {
      handleCancelAddRow();
    }
  };

  // --- Row actions: Duplicate & Delete ---

  const handleDuplicateRow = async (row: BudgetRow) => {
    try {
      // Get current user's profile
      const { data: { user } } = await supabase.auth.getUser();
      let profileId: string | null = null;
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", user.id)
          .single();
        profileId = profile?.id || null;
      }

      if (row.type === "task") {
        // Fetch full task data to duplicate
        const { data: task, error: fetchError } = await supabase
          .from("tasks")
          .select("title, budget, room_id, status, priority, payment_status, cost_center, description")
          .eq("id", row.id)
          .single();
        if (fetchError) throw fetchError;

        const { error } = await supabase.from("tasks").insert({
          project_id: projectId,
          title: `${task.title} (${t('budget.copy')})`,
          budget: task.budget,
          room_id: task.room_id,
          status: task.status,
          priority: task.priority,
          payment_status: "not_paid",
          cost_center: task.cost_center,
          description: task.description,
          created_by_user_id: profileId,
        });
        if (error) throw error;
      } else {
        // Fetch full material data to duplicate
        const { data: material, error: fetchError } = await supabase
          .from("materials")
          .select("name, price_total, room_id, status, quantity, unit, vendor_name, vendor_link, description, exclude_from_budget")
          .eq("id", row.id)
          .single();
        if (fetchError) throw fetchError;

        if (!profileId) throw new Error("Missing profile");
        await createRequestPurchase({
          projectId,
          createdByUserId: profileId,
          material: {
            name: `${material.name} (${t('budget.copy')})`,
            price_total: material.price_total,
            room_id: material.room_id,
            quantity: material.quantity,
            unit: material.unit,
            vendor_name: material.vendor_name,
            vendor_link: material.vendor_link,
            description: material.description,
            exclude_from_budget: material.exclude_from_budget,
          },
        });
      }

      toast({ title: t('common.success'), description: t('budget.rowDuplicated') });
      await fetchData();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('budget.failedToDuplicate');
      toast({ title: t('common.error'), description: msg, variant: "destructive" });
    }
  };

  // Deletion is gated through AlertDialog — native window.confirm is too easy
  // to dismiss reflexively on a row that may represent significant budget.
  const [rowToDelete, setRowToDelete] = useState<BudgetRow | null>(null);
  const [deletingRow, setDeletingRow] = useState(false);

  const handleDeleteRow = (row: BudgetRow) => {
    setRowToDelete(row);
  };

  const confirmDeleteRow = async () => {
    if (!rowToDelete) return;
    setDeletingRow(true);
    try {
      if (rowToDelete.type === "task") {
        const { error } = await supabase.from("tasks").delete().eq("id", rowToDelete.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("materials").delete().eq("id", rowToDelete.id);
        if (error) throw error;
      }

      toast({ title: t('common.success'), description: t('budget.rowDeleted') });
      await fetchData();
      setRowToDelete(null);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('budget.failedToDelete');
      toast({ title: t('common.error'), description: msg, variant: "destructive" });
    } finally {
      setDeletingRow(false);
    }
  };

  // Distinct filter options (distinctRooms/Assignees/CostCenters/Statuses) now
  // come from useBudgetFilters hook above.

  // --- Inline cell save ---

  const TASK_FIELD_MAP: Record<string, string> = {
    budget: "budget", paid: "paid_amount",
    estimatedHours: "estimated_hours", hourlyRate: "hourly_rate",
    subcontractorCost: "subcontractor_cost", rotAmount: "rot_amount",
    room: "room_id", costCenter: "cost_center", paymentStatus: "payment_status",
  };
  const MATERIAL_FIELD_MAP: Record<string, string> = {
    budget: "price_total", paid: "paid_amount",
    quantity: "quantity", pricePerUnit: "price_per_unit",
    orderedAmount: "ordered_amount",
    room: "room_id",
  };

  const handleCellSave = async (row: BudgetRow, col: string, value: string) => {
    setEditingCell(null);
    if (row.id.startsWith("__")) return;

    // String fields (room, costCenter, paymentStatus)
    const isStringField = ["room", "costCenter", "paymentStatus"].includes(col);
    if (isStringField) {
      const dbField = row.type === "task" ? TASK_FIELD_MAP[col] : MATERIAL_FIELD_MAP[col];
      if (!dbField) return;
      const table = row.type === "task" ? "tasks" : "materials";
      const saveValue = value === "none" || value === "" ? null : value;
      try {
        const { error } = await supabase.from(table).update({ [dbField]: saveValue }).eq("id", row.id);
        if (error) throw error;
        await fetchData();
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : t('budget.failedToUpdateValue');
        toast({ title: t('common.error'), description: msg, variant: "destructive" });
      }
      return;
    }

    // Numeric fields
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return;

    try {
      const dbField = row.type === "task" ? TASK_FIELD_MAP[col] : MATERIAL_FIELD_MAP[col];
      if (!dbField) return;
      const table = row.type === "task" ? "tasks" : "materials";
      const { error } = await supabase.from(table).update({ [dbField]: numValue }).eq("id", row.id);
      if (error) throw error;
      await fetchData();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('budget.failedToUpdateValue');
      toast({ title: t('common.error'), description: msg, variant: "destructive" });
    }
  };

  const handleStatusSave = async (row: BudgetRow, newStatus: string) => {
    try {
      if (row.type === "task") {
        const { error } = await supabase.from("tasks").update({ status: newStatus }).eq("id", row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("materials").update({ status: newStatus }).eq("id", row.id);
        if (error) throw error;
      }
      setEditingCell(null);
      await fetchData();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('budget.failedToUpdateStatus');
      toast({ title: t('common.error'), description: msg, variant: "destructive" });
    }
  };

  const handleSupplierSave = async (row: BudgetRow, supplierName: string) => {
    if (!currentProfileId || row.type !== "task") { setEditingCell(null); return; }
    const trimmed = supplierName.trim();
    if (!trimmed) {
      // Clear supplier
      try {
        const { error } = await supabase.from("tasks").update({ supplier_id: null }).eq("id", row.id);
        if (error) throw error;
        setEditingCell(null);
        await fetchData();
      } catch { setEditingCell(null); }
      return;
    }
    try {
      // Find existing or create new supplier
      let supplierId: string;
      const existing = suppliers.find(s => s.name.toLowerCase() === trimmed.toLowerCase());
      if (existing) {
        supplierId = existing.id;
      } else {
        const { data, error } = await supabase
          .from("suppliers")
          .insert({ profile_id: currentProfileId, name: trimmed })
          .select("id")
          .single();
        if (error) throw error;
        supplierId = data.id;
      }
      const { error } = await supabase.from("tasks").update({ supplier_id: supplierId }).eq("id", row.id);
      if (error) throw error;
      setEditingCell(null);
      await fetchData();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('budget.failedToUpdateValue');
      toast({ title: t('common.error'), description: msg, variant: "destructive" });
    }
  };

  // --- Column drag reorder ---

  const [draggingColIdx, setDraggingColIdx] = useState<number | null>(null);
  const [dragOverColIdx, setDragOverColIdx] = useState<number | null>(null);

  const handleDragStart = (idx: number) => {
    dragCol.current = idx;
    setDraggingColIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    dragOverCol.current = idx;
    setDragOverColIdx(idx);
  };

  const handleDragEnd = () => {
    setDraggingColIdx(null);
    setDragOverColIdx(null);
  };

  const handleDrop = () => {
    if (dragCol.current === null || dragOverCol.current === null) return;
    if (dragCol.current === dragOverCol.current) return;

    const reordered = [...columns];
    const [moved] = reordered.splice(dragCol.current, 1);
    reordered.splice(dragOverCol.current, 0, moved);
    setColumns(reordered);

    dragCol.current = null;
    dragOverCol.current = null;
    setDraggingColIdx(null);
    setDragOverColIdx(null);
  };

  // --- Open edit dialog ---

  const openDetail = (row: BudgetRow) => {
    // Synthetic budget posts don't have a real material ID
    if (row.id.startsWith("__")) return;
    if (row.type === "task") {
      setEditTaskId(row.id);
    } else {
      setEditMaterialId(row.id);
    }
  };

  // --- Sorting ---

  const handleSort = (key: ColumnKey) => {
    if (sortKey === key) {
      if (sortDir === "asc") {
        setSortDir("desc");
      } else {
        setSortKey(null);
        setSortDir("asc");
      }
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  // hasAdvancedFilter / mainRows / ataRows / filtered / totals now come from
  // useBudgetFilters hook above.

  // Tree-hierarchy: 5 expansion states + displayRows memo. Grouping
  // (groupBy + collapsedGroups) is passed in because the toolbar owns them.
  const {
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
  } = useBudgetTree({ filtered, ataRows, purchaseOrderInfo, groupBy, collapsedGroups });


  const clearAllFilters = () => {
    setSearchQuery("");
    setFilterType("all");
    setFilterRoom("all");
    setFilterAssignee("all");
    setFilterCostCenter("all");
    setFilterStartDate("");
    setFilterFinishDate("");
    setFilterAttachment("all");
    setFilterStatuses(new Set());
  };

  // renderCell + renderFooterCell now live in budget/shared/cellRenderers.tsx.
  // Build the context objects once per render so every cell call shares them.
  const cellCtx = {
    editingCell, setEditingCell, editValue, setEditValue,
    expandedPurchaseOrders,
    openDetail, handleCellSave, handleStatusSave, handleSupplierSave,
    toggleTaskExpand, toggleBudgetPostExpand, togglePurchaseOrderExpand,
    suppliers, allRooms, distinctCostCenters,
    isBuilder, currency, projectId, t,
  };
  const footerCtx = { totals, filtered, rows, isBuilder, currency, t };

  // --- Loading state ---

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Simplified read-only view for clients/viewers
  if (isReadOnly) {
    return (
      <ReadOnlyBudgetView
        rows={rows}
        totals={totals}
        projectBudget={projectBudget}
        extraTotal={extraTotal}
        currency={currency}
      />
    );
  }

  return (
    <div className={isFullscreen ? "fixed inset-0 z-50 bg-background overflow-auto p-4 pt-2" : ""}>
      {/* Fullscreen close bar */}
      {isFullscreen && (
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-display text-xl font-normal tracking-tight">{t('budget.title')}</h2>
          <Button variant="ghost" size="sm" onClick={() => setIsFullscreen(false)}>
            <Minimize2 className="h-4 w-4 mr-1.5" />
            {t('budget.exitFullscreen', 'Exit fullscreen')}
          </Button>
        </div>
      )}
      {!isFullscreen && (
        isBuilder ? (
          <>
            <div className="flex items-center gap-2.5 mb-6">
              <Wallet className="h-5 w-5 text-primary shrink-0" />
              <h2 className="font-display text-xl font-normal tracking-tight">{t('budget.title')}</h2>
            </div>
            <div className="mb-6">
              <BuilderSummaryCards projectId={projectId} currency={currency} onCreateInvoice={onCreateInvoice} />
            </div>
          </>
        ) : (
          <div className="mb-6">
            <HomeownerBudgetView projectId={projectId} currency={currency} />
          </div>
        )
      )}

      <BudgetToolbar
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        searchExpanded={searchExpanded}
        setSearchExpanded={setSearchExpanded}
        filterType={filterType}
        setFilterType={setFilterType}
        filterStatuses={filterStatuses}
        setFilterStatuses={setFilterStatuses}
        filterRoom={filterRoom}
        setFilterRoom={setFilterRoom}
        filterAssignee={filterAssignee}
        setFilterAssignee={setFilterAssignee}
        filterCostCenter={filterCostCenter}
        setFilterCostCenter={setFilterCostCenter}
        filterStartDate={filterStartDate}
        setFilterStartDate={setFilterStartDate}
        filterFinishDate={filterFinishDate}
        setFilterFinishDate={setFilterFinishDate}
        filterAttachment={filterAttachment}
        setFilterAttachment={setFilterAttachment}
        hasAdvancedFilter={hasAdvancedFilter}
        distinctRooms={distinctRooms}
        distinctAssignees={distinctAssignees}
        distinctCostCenters={distinctCostCenters}
        distinctStatuses={distinctStatuses}
        showAdvancedFilters={showAdvancedFilters}
        setShowAdvancedFilters={setShowAdvancedFilters}
        compactRows={compactRows}
        setCompactRows={setCompactRows}
        isFullscreen={isFullscreen}
        setIsFullscreen={setIsFullscreen}
        groupBy={groupBy}
        onGroupByChange={handleGroupByChange}
        effectiveExtraKeys={effectiveExtraKeys}
        allColumns={ALL_COLUMNS}
        visibleExtras={visibleExtras}
        onToggleExtraColumn={toggleExtraColumn}
        filtered={filtered}
        onClearAllFilters={clearAllFilters}
      />

      {/* Table Section */}
      <div className="mt-6 mb-2 flex items-center justify-between">
        <span className="text-xs text-muted-foreground md:hidden flex items-center gap-1">
          ← {t('budget.swipeToSeeMore', 'Svep för mer')} →
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground/60 mb-1 text-right">
        <span className="mr-3">* = {t('budget.estimatedCostLegend', 'Beräknad kostnad')}</span>
        {isBuilder ? t('budget.exMomsNote', 'All amounts ex. VAT') : t('budget.incMomsNote', 'All amounts inc. VAT')}
      </p>
      <div className={cn("border rounded-lg overflow-auto bg-card", isFullscreen ? "max-h-[calc(100vh-8rem)] mx-0 px-0" : "max-h-[calc(100vh-20rem)] -mx-3 px-3 md:mx-0 md:px-0")}>
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-20 bg-card">
            <tr className="bg-muted border-b">
              {visibleColumns.map((col, idx) => {
                const isDragging = draggingColIdx === idx;
                const isDropTarget = dragOverColIdx === idx && draggingColIdx !== null && draggingColIdx !== idx;
                return (
                <th
                  key={col.key}
                  className={cn(
                    "kicker px-3 py-2.5",
                    col.align === "right" ? "text-right" : "",
                    "select-none transition-colors",
                    compactRows ? "py-1 text-xs h-8" : "",
                    idx === 0 ? "sticky left-0 z-20 bg-card after:content-[''] after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-border" : "",
                    isDragging && "opacity-50",
                    isDropTarget && "bg-primary/10 border-l-2 border-l-primary",
                  )}
                  draggable={idx !== 0}
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDrop={handleDrop}
                  onDragEnd={(e) => {
                    // If dropped outside table area, hide the column
                    const table = (e.target as HTMLElement).closest("table");
                    if (table && col.extra) {
                      const rect = table.getBoundingClientRect();
                      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
                        toggleExtraColumn(col.key);
                      }
                    }
                    handleDragEnd();
                  }}
                  onContextMenu={(e) => handleColContextMenu(e, col.key)}
                >
                  <div className="inline-flex items-center gap-1">
                    <button
                      className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                      onClick={() => handleSort(col.key)}
                    >
                      {col.label}
                      {sortKey === col.key && (
                        sortDir === "asc" ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />
                      )}
                    </button>
                  </div>
                </th>
                );
              })}
              {/* Actions column header (builder only) */}
              {isBuilder && (
                <th className={`kicker px-3 py-2.5 w-20${compactRows ? " py-1 text-xs h-8" : ""}`} />
              )}
            </tr>
          </thead>
          <tbody>
            {displayRows.length === 0 && !isAddingRow ? (
              <tr className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                <td colSpan={visibleColumns.length + (isBuilder ? 1 : 0)} className="px-3 py-2.5 text-center py-8 text-muted-foreground">
                  {t('budget.noBudgetItems')}
                </td>
              </tr>
            ) : (
              displayRows.map((row) => {
                const rowMeta = row as unknown as { isSectionHeader?: boolean; childCount?: number; _groupKey?: string };

                // Standalone material budgets section header
                if (rowMeta.isSectionHeader && row.id === "__standalone_bp_header__") return (
                  <tr
                    key="standalone-bp-header"
                    className={`border-b last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer hover:bg-muted/50 bg-blue-50/50 border-t-2 border-blue-200${compactRows ? " h-8" : ""}`}
                    onClick={() => setUnlinkedExpanded(!unlinkedExpanded)}
                  >
                    <td colSpan={visibleColumns.length + (isBuilder ? 1 : 0)} className="px-3 py-2.5 py-2">
                      <div className="flex items-center gap-2">
                        <ChevronDown className={`h-4 w-4 text-blue-500 transition-transform ${unlinkedExpanded ? "" : "-rotate-90"}`} />
                        <ShoppingCart className="h-4 w-4 text-blue-500" />
                        <span className="text-sm font-medium text-blue-700">{row.name}</span>
                        <Badge variant="secondary" className="text-xs">{rowMeta.childCount}</Badge>
                        <span className="text-xs text-muted-foreground ml-auto">{formatCurrency(row.budget, currency)}</span>
                      </div>
                    </td>
                  </tr>
                );

                // Tillägg section header
                if (rowMeta.isSectionHeader && row.id === "__ata_header__") return (
                  <tr
                    key="ata-header"
                    className={`border-b last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer hover:bg-muted/50 bg-orange-50/60 border-t-2 border-orange-300${compactRows ? " h-8" : ""}`}
                    onClick={() => setAtaExpanded(!ataExpanded)}
                  >
                    <td colSpan={visibleColumns.length + (isBuilder ? 1 : 0)} className="px-3 py-2.5 py-2">
                      <div className="flex items-center gap-2">
                        <ChevronDown className={`h-4 w-4 text-orange-500 transition-transform ${ataExpanded ? "" : "-rotate-90"}`} />
                        <Badge variant="outline" className="text-xs text-orange-700 border-orange-300 bg-orange-100">{t('budget.addition', 'Tillägg')}</Badge>
                        <span className="text-sm font-medium text-orange-800">{row.name}</span>
                        <Badge variant="secondary" className="text-xs">{rowMeta.childCount}</Badge>
                        {row.budget > 0 && (
                          <span className="text-xs text-muted-foreground ml-auto tabular-nums">
                            {formatCurrency(row.budget, currency)}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );

                // Group header (from groupBy)
                if (rowMeta.isSectionHeader && rowMeta._groupKey != null) return (
                  <tr
                    key={row.id}
                    className={`border-b last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer hover:bg-muted/50 bg-primary/5 border-t-2 border-primary/20${compactRows ? " h-8" : ""}`}
                    onClick={() => toggleGroupCollapse(rowMeta._groupKey!)}
                  >
                    <td colSpan={visibleColumns.length + (isBuilder ? 1 : 0)} className="px-3 py-2.5 py-2">
                      <div className="flex items-center gap-2">
                        <ChevronDown className={`h-4 w-4 text-primary transition-transform ${collapsedGroups.has(rowMeta._groupKey!) ? "-rotate-90" : ""}`} />
                        <span className="text-sm font-semibold">{row.name}</span>
                        <Badge variant="secondary" className="text-xs">{rowMeta.childCount}</Badge>
                        {row.budget > 0 && (
                          <span className="text-xs text-muted-foreground ml-auto tabular-nums">
                            {t("dashboard.budget")}: {formatCurrency(row.budget, currency)}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );

                // Regular row
                const isPurchaseRow = row.type === "purchase" || (row as DisplayRow).isPurchaseChild;
                const isBudgetPostRow = row.type === "material" && row.isBudgetPost;
                const isPoHeaderRow = (row as DisplayRow).isPoHeader === true;
                const rowBg = isPoHeaderRow
                  ? "bg-slate-50/60 border-t-2 border-slate-200"
                  : isPurchaseRow
                    ? "bg-muted/20"
                    : isBudgetPostRow && row.isChild
                      ? "bg-blue-50/30"
                      : row.isChild
                        ? "bg-muted/30"
                        : "";
                return (
                <tr
                  key={`${row.type}-${row.id}`}
                  id={`budget-row-${row.id}`}
                  className={`border-b last:border-b-0 hover:bg-muted/30 transition-colors hover:bg-muted/50${compactRows ? " h-8" : ""} ${rowBg} transition-all`}
                >
                  {visibleColumns.map((col, colIdx) => (
                    <td
                      key={col.key}
                      className={`px-3 py-2.5 ${col.align === "right" ? "text-right" : ""}${compactRows ? " py-0.5 px-2 text-xs" : " text-sm"}${row.isChild && compactRows ? " text-[11px]" : ""}${colIdx === 0 ? ` sticky left-0 z-10 ${rowBg || "bg-card"} after:content-[''] after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-border` : ""}`}
                    >
                      {renderCell(col, row, cellCtx)}
                    </td>
                  ))}
                  {/* Row Actions (builder only) */}
                  {isBuilder && (
                    <td className={`px-3 py-2.5 ${compactRows ? "py-0.5 px-1" : "px-2"}`} onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-0.5">
                        {/* +Inköp button for material budget posts */}
                        {isBudgetPostRow && !row.id.startsWith("__") && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`${compactRows ? "h-6 w-6" : "h-8 w-8"} text-blue-600 hover:text-blue-700`}
                            onClick={() => setPurchaseFromBudgetPost(row)}
                            title={t('budget.addPurchase', 'Lägg till inköp')}
                          >
                            <Plus className={compactRows ? "h-3 w-3" : "h-4 w-4"} />
                          </Button>
                        )}
                        {!(row as DisplayRow).isPoHeader && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className={compactRows ? "h-6 w-6" : "h-8 w-8"}
                              onClick={() => handleDuplicateRow(row)}
                              title={t('budget.duplicate')}
                            >
                              <Copy className={compactRows ? "h-3 w-3" : "h-4 w-4"} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className={`${compactRows ? "h-6 w-6" : "h-8 w-8"} text-muted-foreground hover:text-destructive`}
                              onClick={() => handleDeleteRow(row)}
                              title={t('budget.deleteRow')}
                            >
                              <Trash2 className={compactRows ? "h-3 w-3" : "h-4 w-4"} />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
                );
              })
            )}

            {/* Inline Add Row (builder only) */}
            {isBuilder && (
              isAddingRow ? (
                <tr className={`border-b last:border-b-0 hover:bg-muted/30 transition-colors bg-primary/5 border-primary/20${compactRows ? " h-8" : ""}`}>
                  {visibleColumns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-3 py-2.5 ${col.align === "right" ? "text-right" : ""}${compactRows ? " py-0.5 px-2 text-xs" : " py-1"}`}
                    >
                      {col.key === "name" ? (
                        <Input
                          ref={newRowNameRef}
                          type="text"
                          placeholder={t('budget.enterName')}
                          className={`${compactRows ? "h-6 text-xs" : "h-8"} w-full min-w-[120px]`}
                          value={newRowName}
                          onChange={(e) => setNewRowName(e.target.value)}
                          onKeyDown={handleNewRowKeyDown}
                          disabled={addingRowLoading}
                        />
                      ) : col.key === "type" ? (
                        <Select
                          value={newRowType}
                          onValueChange={(v) => setNewRowType(v as "task" | "material")}
                          disabled={addingRowLoading}
                        >
                          <SelectTrigger className={`${compactRows ? "h-6 text-xs" : "h-8"} w-[100px]`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="task">{t('budget.task')}</SelectItem>
                            <SelectItem value="material">{t('budget.material')}</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : col.key === "budget" ? (
                        <Input
                          type="number"
                          placeholder="0"
                          className={`${compactRows ? "h-6 text-xs" : "h-8"} w-24 text-right`}
                          value={newRowBudget}
                          onChange={(e) => setNewRowBudget(e.target.value)}
                          onKeyDown={handleNewRowKeyDown}
                          disabled={addingRowLoading}
                        />
                      ) : col.key === "room" ? (
                        <Select
                          value={newRowRoomId || "none"}
                          onValueChange={(v) => setNewRowRoomId(v === "none" ? "" : v)}
                          disabled={addingRowLoading}
                        >
                          <SelectTrigger className={`${compactRows ? "h-6 text-xs" : "h-8"} w-[120px]`}>
                            <SelectValue placeholder={t('budget.selectRoom')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">{t('budget.noRoom')}</SelectItem>
                            {allRooms.map((room) => (
                              <SelectItem key={room.id} value={room.id}>
                                {room.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : null}
                    </td>
                  ))}
                  {/* Save/Cancel buttons in actions column */}
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        className={compactRows ? "h-6 text-xs px-2" : "h-8"}
                        onClick={handleSaveNewRow}
                        disabled={addingRowLoading || !newRowName.trim()}
                      >
                        {addingRowLoading ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          t('common.save')
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className={compactRows ? "h-6 text-xs px-2" : "h-8"}
                        onClick={handleCancelAddRow}
                        disabled={addingRowLoading}
                      >
                        {t('common.cancel')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr
                  className={`border-b last:border-b-0 hover:bg-muted/30 transition-colors hover:bg-muted/50 cursor-pointer${compactRows ? " h-8" : ""}`}
                  onClick={handleStartAddRow}
                >
                  <td
                    colSpan={visibleColumns.length + 1}
                    className={`px-3 py-2.5 text-muted-foreground${compactRows ? " py-0.5 px-2 text-xs" : ""}`}
                  >
                    <span className="inline-flex items-center gap-1.5 text-sm">
                      <Plus className="h-4 w-4" />
                      {t('budget.addRow')}
                    </span>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
      {/* Summary row — pinned below the scroll area, always visible */}
      {filtered.length > 0 && (
        <div className="border border-t-2 border-border rounded-b-lg -mt-[1px] -mx-3 px-3 md:mx-0 md:px-0 bg-muted/50 overflow-x-auto">
          <table className="w-full text-sm">
            <tfoot className="border-t-0">
              <tr className="bg-muted border-b">
                {visibleColumns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-3 py-2.5 ${col.align === "right" ? "text-right" : ""}${compactRows ? " py-0.5 px-2 text-xs" : ""}`}
                  >
                    {renderFooterCell(col, footerCtx)}
                  </td>
                ))}
                {isBuilder && <td className="px-3 py-2.5" />}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Budget Charts Section (builder only) */}
      {isBuilder && <BudgetChartsSection rows={rows} currency={currency} />}

      {/* Yearly analysis section (homeowner only) */}
      {!isBuilder && (
        <div className="mt-6">
          <HomeownerAnalysisSection projectId={projectId} currency={currency} />
        </div>
      )}

      {/* ROT section — hidden for builders (ROT is the customer's deduction, not the builder's) */}

      {/* Column context menu */}
      {colContextMenu && (
        <div
          className="fixed z-50 min-w-[160px] bg-popover border rounded-md shadow-md py-1 text-sm"
          style={{ left: colContextMenu.x, top: colContextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Sort options */}
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2"
            onClick={() => {
              setSortKey(colContextMenu.colKey);
              setSortDir("asc");
              setColContextMenu(null);
            }}
          >
            <ArrowUp className="h-3.5 w-3.5" />
            {t("budget.sortAsc", "Sortera stigande")}
          </button>
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2"
            onClick={() => {
              setSortKey(colContextMenu.colKey);
              setSortDir("desc");
              setColContextMenu(null);
            }}
          >
            <ArrowDown className="h-3.5 w-3.5" />
            {t("budget.sortDesc", "Sortera fallande")}
          </button>
          {/* Clear sort */}
          {sortKey === colContextMenu.colKey && (
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2 text-muted-foreground"
              onClick={() => {
                setSortKey(null);
                setColContextMenu(null);
              }}
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              {t("budget.clearSort", "Ta bort sortering")}
            </button>
          )}
          {/* Separator */}
          <div className="border-t my-1" />
          {/* Hide column — only for extra columns, never for core (name) */}
          {colContextMenu.colKey !== "name" && effectiveColumns.find(c => c.key === colContextMenu.colKey)?.extra && (
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2"
              onClick={() => {
                toggleExtraColumn(colContextMenu.colKey);
                setColContextMenu(null);
              }}
            >
              <Columns3 className="h-3.5 w-3.5" />
              {t("budget.hideColumn", "Dölj kolumn")}
            </button>
          )}
          {/* Reset column order */}
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2 text-muted-foreground"
            onClick={() => {
              setColumns(ALL_COLUMNS);
              setColContextMenu(null);
            }}
          >
            <Layers className="h-3.5 w-3.5" />
            {t("budget.resetColumns", "Återställ kolumnordning")}
          </button>
        </div>
      )}

      {/* Task Edit Dialog */}
      <TaskEditDialog
        taskId={editTaskId}
        projectId={projectId}
        open={editTaskId !== null}
        onOpenChange={(open) => !open && setEditTaskId(null)}
        onSaved={fetchData}
        currency={currency}
      />

      {/* Material Edit Dialog */}
      <MaterialEditDialog
        materialId={editMaterialId}
        projectId={projectId}
        open={editMaterialId !== null}
        onOpenChange={(open) => !open && setEditMaterialId(null)}
        onSaved={fetchData}
        currency={currency}
      />

      {/* InvoiceMethodDialog rendered by ContractorBudgetTab shell — see commit 9 */}

      {/* +Inköp from budget post dialog */}
      <NewPurchaseFromBudgetDialog
        open={purchaseFromBudgetPost !== null}
        onOpenChange={(open) => { if (!open) setPurchaseFromBudgetPost(null); }}
        planned={purchaseFromBudgetPost ? {
          id: purchaseFromBudgetPost.id,
          name: purchaseFromBudgetPost.name,
          price_total: purchaseFromBudgetPost.budget,
          task_id: purchaseFromBudgetPost.taskId ?? null,
          room_id: purchaseFromBudgetPost.roomId ?? null,
          quantity: purchaseFromBudgetPost.quantity ?? 0,
          unit: "",
          price_per_unit: purchaseFromBudgetPost.pricePerUnit ?? null,
        } : null}
        projectId={projectId}
        currentProfileId={currentProfileId}
        currency={currency}
        usedAmount={purchaseFromBudgetPost?.consumedTotal ?? 0}
        onCreated={() => {
          setPurchaseFromBudgetPost(null);
          fetchData();
        }}
      />

      <AlertDialog open={rowToDelete !== null} onOpenChange={(open) => { if (!open && !deletingRow) setRowToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('budget.confirmDeleteTitle', 'Ta bort raden?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {rowToDelete && t('budget.confirmDelete', { name: rowToDelete.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingRow}>{t('common.cancel', 'Avbryt')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteRow}
              disabled={deletingRow}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingRow ? <Loader2 className="h-4 w-4 animate-spin" /> : t('common.delete', 'Ta bort')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default BudgetTabCore;

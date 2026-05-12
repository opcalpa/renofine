import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { SupplierAutocomplete } from "@/components/shared/SupplierAutocomplete";
import { MultiRoomSelect } from "@/components/shared/MultiRoomSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import { AttachmentIndicator } from "@/components/shared/AttachmentIndicator";
import { FilePreviewPopover } from "@/components/shared/FilePreviewPopover";
import { getStatusBadgeColor } from "@/lib/statusColors";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarColor } from "@/lib/avatarColor";
import {
  Pencil,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Columns3,
  Rows3,
  Layers,
  ChevronDown,
  Trash2,
  ExternalLink,
  Package,
  CheckCircle,
  XCircle,
  CreditCard,
} from "lucide-react";
import { usePurchasesTableView, type PurchasesTableViewState } from "./usePurchasesTableView";
import { PurchaseColumnKey, PurchaseColumnDef, EXTRA_COLUMN_KEYS } from "./purchasesTypes";
import { ColumnToggle } from "@/components/shared/ColumnToggle";
import { PaidDateConfirm } from "./PaidDateConfirm";

interface Material {
  id: string;
  name: string;
  description?: string | null;
  quantity: number;
  unit: string;
  price_per_unit: number | null;
  price_total: number | null;
  ordered_amount: number | null;
  paid_amount: number | null;
  vendor_name: string | null;
  vendor_link: string | null;
  supplier_id: string | null;
  status: string;
  exclude_from_budget: boolean;
  created_at: string;
  task_id: string | null;
  room_id: string | null;
  room_ids: string[] | null;
  created_by_user_id: string | null;
  assigned_to_user_id: string | null;
  creator?: { name: string; avatar_url?: string | null; isWorker?: boolean } | null;
  assigned_to?: { name: string } | null;
  task?: { title: string } | null;
  room?: { name: string } | null;
  hasAttachment?: boolean;
  attachmentCount?: number;
}

export interface PurchasesTableViewProps {
  materials: Material[];
  projectId: string;
  rooms: { id: string; name: string }[];
  tasks: { id: string; title: string }[];
  teamMembers: { id: string; name: string }[];
  currency?: string | null;
  isReadOnly?: boolean;
  onMaterialClick: (material: Material) => void;
  onMaterialUpdated: () => void;
  canEditMaterial: (material: Material) => boolean;
  getStatusColor: (status: string) => string;
  tableViewState?: PurchasesTableViewState;
  hideToolbar?: boolean;
}

const SORT_FIELD_MAP: Record<PurchaseColumnKey, string | null> = {
  name: "name",
  status: "status",
  quantity: "quantity",
  pricePerUnit: "price_per_unit",
  priceTotal: "price_total",
  paidAmount: "paid_amount",
  remaining: null,
  vendor: "vendor_name",
  room: "room_id",
  task: "task_id",
  assignedTo: "assigned_to_user_id",
  createdBy: "created_by_user_id",
  createdAt: "created_at",
  attachment: null,
  actions: null,
  paidDate: "paid_date",
};

const DB_FIELD_MAP: Record<PurchaseColumnKey, string> = {
  name: "name",
  status: "status",
  quantity: "quantity",
  pricePerUnit: "price_per_unit",
  priceTotal: "price_total",
  paidAmount: "paid_amount",
  remaining: "",
  vendor: "vendor_name",
  room: "room_id",
  task: "task_id",
  assignedTo: "assigned_to_user_id",
  createdBy: "",
  createdAt: "",
  attachment: "",
  actions: "",
  paidDate: "paid_date",
};

export function PurchasesTableView({
  materials,
  projectId,
  rooms,
  tasks,
  teamMembers,
  currency,
  isReadOnly,
  onMaterialClick,
  onMaterialUpdated,
  canEditMaterial,
  getStatusColor,
  tableViewState: externalState,
  hideToolbar,
}: PurchasesTableViewProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const internalState = usePurchasesTableView(projectId);
  const {
    ALL_COLUMNS,
    visibleColumns,
    visibleExtras,
    toggleExtraColumn,
    sortKey,
    sortDir,
    handleSort,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
    dragColIdx,
    dragOverIdx,
    compactRows,
    setCompactRows,
    groupBy,
    handleGroupByChange,
    collapsedGroups,
    toggleGroupCollapse,
  } = externalState || internalState;

  // Supplier autocomplete state
  const [purchaseSuppliers, setPurchaseSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [purchaseProfileId, setPurchaseProfileId] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: prof } = await supabase.from("profiles").select("id").eq("user_id", user.id).single();
      if (!prof) return;
      setPurchaseProfileId(prof.id);
      const { data: suppData } = await supabase.from("suppliers").select("id, name").eq("profile_id", prof.id).order("name");
      setPurchaseSuppliers(suppData || []);
    })();
  }, []);

  // Inline editing state
  const [editingCell, setEditingCell] = useState<{
    rowId: string;
    col: PurchaseColumnKey;
  } | null>(null);
  const [editValue, setEditValue] = useState("");

  // Paid date confirmation
  const [paidConfirm, setPaidConfirm] = useState<{ materialId: string; materialName: string } | null>(null);

  // Sort materials
  const sortedMaterials = [...materials].sort((a, b) => {
    if (!sortKey) return 0;
    const field = SORT_FIELD_MAP[sortKey];
    if (!field) return 0;

    const aValue = (a as Record<string, unknown>)[field];
    const bValue = (b as Record<string, unknown>)[field];

    if (aValue === null || aValue === undefined)
      return sortDir === "asc" ? 1 : -1;
    if (bValue === null || bValue === undefined)
      return sortDir === "asc" ? -1 : 1;

    const aComp = typeof aValue === "string" ? aValue.toLowerCase() : aValue;
    const bComp = typeof bValue === "string" ? bValue.toLowerCase() : bValue;

    if (aComp < bComp) return sortDir === "asc" ? -1 : 1;
    if (aComp > bComp) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  // Inline cell save
  const handleCellSave = useCallback(
    async (materialId: string, colKey: PurchaseColumnKey, value: unknown) => {
      const dbField = DB_FIELD_MAP[colKey];
      if (!dbField) return;

      const { error } = await supabase
        .from("materials")
        .update({ [dbField]: value })
        .eq("id", materialId);

      if (error) {
        toast({
          title: t("common.error"),
          description: t("purchasesTable.failedToUpdateField"),
          variant: "destructive",
        });
      } else {
        onMaterialUpdated();
      }
      setEditingCell(null);
    },
    [onMaterialUpdated, t, toast]
  );

  const handleNumericSave = useCallback(
    (materialId: string, colKey: PurchaseColumnKey) => {
      const numValue = editValue === "" ? null : parseFloat(editValue);
      if (editValue !== "" && isNaN(numValue as number)) {
        setEditingCell(null);
        return;
      }
      handleCellSave(materialId, colKey, numValue);
    },
    [editValue, handleCellSave]
  );

  const getSortIcon = (key: PurchaseColumnKey) => {
    if (sortKey !== key) return null;
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3 ml-1 text-primary" />
    ) : (
      <ArrowDown className="h-3 w-3 ml-1 text-primary" />
    );
  };

  const statusOptions = [
    { value: "submitted", labelKey: "materialStatuses.submitted" },
    { value: "approved", labelKey: "materialStatuses.approved" },
    { value: "billed", labelKey: "materialStatuses.billed" },
    { value: "paid", labelKey: "materialStatuses.paid" },
    { value: "paused", labelKey: "materialStatuses.paused" },
    { value: "declined", labelKey: "materialStatuses.declined" },
  ];

  const renderCell = (col: PurchaseColumnDef, material: Material) => {
    const isEditing =
      editingCell?.rowId === material.id && editingCell?.col === col.key;

    switch (col.key) {
      case "name":
        return (
          <span className="flex items-center gap-1.5 font-medium">
            {material.name}
            {material.exclude_from_budget && (
              <Badge variant="outline" className="text-[10px] px-1 py-0 text-orange-600 border-orange-300 shrink-0">
                ÄTA
              </Badge>
            )}
          </span>
        );

      case "status":
        if (isReadOnly) {
          return (
            <Badge className={cn("text-xs border", getStatusBadgeColor(material.status))}>
              {t(`materialStatuses.${material.status}`, material.status)}
            </Badge>
          );
        }
        return (
          <Select
            value={material.status || "submitted"}
            onValueChange={(v) => {
              if (v === "paid" && material.status !== "paid") {
                setPaidConfirm({ materialId: material.id, materialName: material.name });
              } else {
                handleCellSave(material.id, "status", v);
              }
            }}
          >
            <SelectTrigger
              className={cn("h-8 w-[120px] text-xs border", getStatusBadgeColor(material.status))}
              onClick={(e) => e.stopPropagation()}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {t(opt.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case "quantity":
        return (
          <span className="text-sm">
            {material.quantity} {material.unit}
          </span>
        );

      case "remaining": {
        const total = material.price_total;
        const paid = material.paid_amount;
        if (total == null) {
          return <span className="text-muted-foreground text-xs">-</span>;
        }
        const rem = total - (paid || 0);
        return (
          <span className={cn("text-sm", rem < 0 && "text-destructive")}>
            {formatCurrency(rem, currency, { decimals: 2 })}
          </span>
        );
      }

      case "pricePerUnit":
      case "priceTotal":
      case "paidAmount": {
        const fieldMap: Record<string, keyof Material> = {
          pricePerUnit: "price_per_unit",
          priceTotal: "price_total",
          paidAmount: "paid_amount",
        };
        const val = material[fieldMap[col.key]] as number | null;
        const isBold = col.key === "priceTotal";

        if (isReadOnly || !canEditMaterial(material)) {
          return val != null ? (
            <span className={cn("text-sm", isBold && "font-semibold")}>
              {formatCurrency(val, currency, { decimals: 2 })}
            </span>
          ) : (
            <span className="text-muted-foreground text-xs">-</span>
          );
        }

        if (isEditing) {
          return (
            <Input
              autoFocus
              type="number"
              step="0.01"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={() => handleNumericSave(material.id, col.key)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleNumericSave(material.id, col.key);
                if (e.key === "Escape") setEditingCell(null);
              }}
              className="h-8 w-[100px] text-xs"
              onClick={(e) => e.stopPropagation()}
            />
          );
        }

        return (
          <span
            className={cn(
              "text-sm cursor-pointer hover:underline",
              isBold && "font-semibold"
            )}
            onClick={(e) => {
              e.stopPropagation();
              setEditingCell({ rowId: material.id, col: col.key });
              setEditValue(val?.toString() || "");
            }}
          >
            {val != null ? formatCurrency(val, currency, { decimals: 2 }) : "-"}
          </span>
        );
      }

      case "vendor": {
        const supplierName = purchaseSuppliers.find(s => s.id === material.supplier_id)?.name || material.vendor_name || "";
        const isEditingVendor = editingCell?.rowId === material.id && editingCell?.col === "vendor";
        if (isReadOnly) {
          if (!supplierName) return <span className="text-muted-foreground text-xs">-</span>;
          return material.vendor_link ? (
            <a href={material.vendor_link} target="_blank" rel="noopener noreferrer"
              className="text-primary hover:underline flex items-center gap-1 text-sm"
              onClick={(e) => e.stopPropagation()}>
              {supplierName}
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : <span className="text-sm">{supplierName}</span>;
        }
        if (isEditingVendor) {
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <SupplierAutocomplete
                profileId={purchaseProfileId}
                suppliers={purchaseSuppliers}
                value={supplierName}
                compact
                onChange={async (suppId, name) => {
                  const { error } = await supabase.from("materials").update({
                    supplier_id: suppId,
                    vendor_name: name || null,
                  }).eq("id", material.id);
                  if (!error) { setEditingCell(null); onMaterialUpdated?.(); }
                }}
                onCreated={async () => {
                  if (!purchaseProfileId) return;
                  const { data } = await supabase.from("suppliers").select("id, name").eq("profile_id", purchaseProfileId).order("name");
                  setPurchaseSuppliers(data || []);
                }}
              />
            </div>
          );
        }
        return (
          <button
            className="text-sm hover:bg-muted px-1 rounded cursor-text"
            onClick={(e) => {
              e.stopPropagation();
              setEditingCell({ rowId: material.id, col: "vendor" });
              setEditValue(supplierName);
            }}
          >
            {supplierName ? (
              material.vendor_link ? (
                <span className="flex items-center gap-1 text-primary">
                  {supplierName}
                  <ExternalLink className="h-3 w-3" />
                </span>
              ) : supplierName
            ) : <span className="text-muted-foreground text-xs">-</span>}
          </button>
        );
      }

      case "paidDate": {
        const dateStr = (material as Record<string, unknown>).paid_date as string | null;
        return dateStr ? (
          <span className="text-sm tabular-nums">{new Date(dateStr).toLocaleDateString("sv-SE")}</span>
        ) : (
          <span className="text-muted-foreground text-xs">-</span>
        );
      }

      case "room": {
        const roomIds = material.room_ids?.length ? material.room_ids : (material.room_id ? [material.room_id] : []);
        if (isReadOnly) {
          const names = roomIds.map((id) => rooms.find((r) => r.id === id)?.name).filter(Boolean);
          return names.length > 0 ? (
            <span className="text-sm truncate">{names.join(", ")}</span>
          ) : (
            <span className="text-muted-foreground text-xs">-</span>
          );
        }
        return (
          <MultiRoomSelect
            rooms={rooms}
            selectedIds={roomIds}
            onChange={async (ids) => {
              const { error } = await supabase
                .from("materials")
                .update({ room_ids: ids, room_id: ids[0] || null })
                .eq("id", material.id);
              if (error) {
                toast({ title: t("common.error"), variant: "destructive" });
              } else {
                onMaterialUpdated();
              }
            }}
            compact
          />
        );
      }

      case "task": {
        const taskTitle = material.task?.title;
        if (isReadOnly) {
          return taskTitle ? (
            <span className="text-sm">{taskTitle}</span>
          ) : (
            <span className="text-muted-foreground text-xs">-</span>
          );
        }
        return (
          <Select
            value={material.task_id || "none"}
            onValueChange={(v) =>
              handleCellSave(material.id, "task", v === "none" ? null : v)
            }
          >
            <SelectTrigger
              className="h-8 w-[140px] text-xs"
              onClick={(e) => e.stopPropagation()}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("purchasesTable.noTask")}</SelectItem>
              {tasks.map((tk) => (
                <SelectItem key={tk.id} value={tk.id}>
                  {tk.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      }

      case "assignedTo": {
        const assigneeName = material.assigned_to?.name;
        if (isReadOnly) {
          return assigneeName ? (
            <span className="text-sm">{assigneeName}</span>
          ) : (
            <span className="text-muted-foreground text-xs">-</span>
          );
        }
        return (
          <Select
            value={material.assigned_to_user_id || "none"}
            onValueChange={(v) =>
              handleCellSave(material.id, "assignedTo", v === "none" ? null : v)
            }
          >
            <SelectTrigger
              className="h-8 w-[130px] text-xs"
              onClick={(e) => e.stopPropagation()}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("common.unassigned")}</SelectItem>
              {teamMembers.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      }

      case "createdBy": {
        const name = material.creator?.name;
        if (!name) return <span className="text-sm text-muted-foreground/40">–</span>;
        const isWorker = !!material.creator?.isWorker;
        const initials = name.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
        const tooltip = isWorker ? `${name} ${t("worker.workerSuffix", "(arbetare)")}` : name;
        return (
          <div className="flex items-center gap-1.5" title={tooltip}>
            <Avatar className="h-5 w-5 shrink-0">
              {material.creator?.avatar_url && (
                <AvatarImage src={material.creator.avatar_url} alt={name} />
              )}
              <AvatarFallback className={cn("text-[9px] text-white", getAvatarColor(name))}>
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="truncate text-xs">{name}</span>
            {isWorker && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 leading-tight">
                {t("worker.tag", "Arbetare")}
              </Badge>
            )}
          </div>
        );
      }

      case "createdAt":
        return (
          <span className="text-sm">
            {new Date(material.created_at).toLocaleDateString()}
          </span>
        );

      case "attachment":
        if (!material.hasAttachment) return null;
        return (
          <FilePreviewPopover
            projectId={projectId}
            materialId={material.id}
          >
            <button type="button" className="cursor-pointer">
              <AttachmentIndicator
                hasAttachment={material.hasAttachment || false}
                count={material.attachmentCount}
              />
            </button>
          </FilePreviewPopover>
        );

      case "fileCategory": {
        const cats = (material as Record<string, unknown>).fileCategories as string[] | undefined;
        if (!cats || cats.length === 0) return <span className="text-muted-foreground/40">–</span>;
        const catLabels: Record<string, string> = { invoice: "Faktura", receipt: "Kvitto", quote: "Offert", contract: "Kontrakt", other: "Övrigt" };
        return (
          <span className="inline-flex flex-wrap gap-1">
            {cats.map(c => <Badge key={c} variant="outline" className="text-[10px] px-1 py-0">{catLabels[c] || c}</Badge>)}
          </span>
        );
      }

      case "actions":
        return canEditMaterial(material) ? (
          <div className="flex items-center gap-0.5">
            {material.status === "submitted" && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-green-700 hover:text-green-800 hover:bg-green-50"
                  title={t("purchases.approve", "Godkänn")}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCellSave(material.id, "status", "approved");
                  }}
                >
                  <CheckCircle className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-red-700 hover:text-red-800 hover:bg-red-50"
                  title={t("purchases.decline", "Avböj")}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCellSave(material.id, "status", "declined");
                  }}
                >
                  <XCircle className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
            {(material.status === "approved" || material.status === "billed") && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-blue-700 hover:text-blue-800 hover:bg-blue-50"
                title={t("purchases.markPaid", "Markera betald")}
                onClick={(e) => {
                  e.stopPropagation();
                  setPaidConfirm({ materialId: material.id, materialName: material.name });
                }}
              >
                <CreditCard className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={(e) => {
                e.stopPropagation();
                onMaterialClick(material);
              }}
            >
              <Pencil className="h-3 w-3" />
            </Button>
          </div>
        ) : null;

      default:
        return null;
    }
  };

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      {!hideToolbar && <div className="flex items-center gap-2 flex-wrap">
        {/* Columns toggle */}
        <ColumnToggle
          columns={EXTRA_COLUMN_KEYS}
          labels={Object.fromEntries(ALL_COLUMNS.map(c => [c.key, c.label])) as Record<string, string>}
          visible={visibleExtras}
          onChange={(vis) => {
            for (const key of EXTRA_COLUMN_KEYS) {
              if (vis.has(key) !== visibleExtras.has(key)) toggleExtraColumn(key);
            }
          }}
          align="start"
          trigger={
            <Button variant="outline" size="icon" className="h-8 w-8" title={t("purchasesTable.columns")}>
              <Columns3 className="h-4 w-4" />
            </Button>
          }
        />

        {/* Compact toggle */}
        <Button
          variant={compactRows ? "default" : "outline"}
          size="icon"
          className="h-8 w-8"
          onClick={() => setCompactRows(!compactRows)}
          title={t("purchasesTable.compactRows")}
        >
          <Rows3 className="h-4 w-4" />
        </Button>

        {/* Group by */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant={groupBy !== "none" ? "default" : "outline"}
              size="icon"
              className="h-8 w-8"
              title={t("budget.groupBy")}
            >
              <Layers className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48" align="end">
            <div className="space-y-1">
              <p className="text-sm font-medium mb-2">{t("budget.groupBy")}</p>
              {(["none", "room", "status", "vendor"] as const).map((opt) => (
                <label
                  key={opt}
                  className={cn("flex items-center gap-2 text-sm cursor-pointer rounded-md px-2 py-1.5 hover:bg-accent", groupBy === opt && "bg-accent font-medium")}
                  onClick={() => handleGroupByChange(opt)}
                >
                  {opt === "none" && t("budget.groupNone")}
                  {opt === "room" && t("budget.groupByRoom")}
                  {opt === "status" && t("budget.groupByStatus")}
                  {opt === "vendor" && t("budget.groupByVendor", "Group by vendor")}
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>

      </div>}

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-x-auto">
          <div className="overflow-auto max-h-[calc(100vh-20rem)]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-20 bg-card">
                <tr className="bg-muted border-b">
                  {visibleColumns.map((col, idx) => (
                    <th
                      key={col.key}
                      className={cn(
                        "kicker px-3 py-2.5",
                        col.width || "",
                        col.align === "right" ? "text-right" : "",
                        "select-none",
                        compactRows && "py-1 text-xs h-8",
                        dragColIdx === idx && "opacity-40",
                        dragOverIdx === idx && dragColIdx !== null && dragColIdx !== idx && "border-l-2 border-primary",
                        /* no sticky — avoids visible seam between first and second column */
                      )}
                      draggable
                      onDragStart={() => handleDragStart(idx)}
                      onDragOver={(e) => handleDragOver(e, idx)}
                      onDrop={handleDrop}
                      onDragEnd={handleDragEnd}
                    >
                      {col.key !== "actions" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSort(col.key)}
                          className="h-8 px-2"
                        >
                          {col.label}
                          {getSortIcon(col.key)}
                        </Button>
                      ) : (
                        <span className="text-xs">{col.label}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedMaterials.length === 0 ? (
                  <tr>
                    <td
                      colSpan={visibleColumns.length}
                      className="px-3 py-12"
                    >
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Package className="h-10 w-10 opacity-30" />
                        <p className="text-sm font-medium">{t("purchasesTable.noMaterials")}</p>
                        <p className="text-xs">{t("purchasesTable.noMaterialsHint", "Track materials and purchases for this project")}</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  (() => {
                    const renderMaterialRow = (material: typeof sortedMaterials[0]) => (
                      <tr
                        key={material.id}
                        className="hover:bg-muted/30 transition-colors cursor-pointer border-b last:border-b-0"
                        onClick={() => onMaterialClick(material)}
                      >
                        {visibleColumns.map((col, colIdx) => (
                          <td
                            key={col.key}
                            className={cn(
                              "px-3 py-2.5",
                              col.align === "right" ? "text-right" : "",
                              compactRows && "py-1 text-xs",
                              dragOverIdx === colIdx && dragColIdx !== null && dragColIdx !== colIdx && "border-l-2 border-primary",
                              /* no sticky — matches header */
                            )}
                          >
                            {renderCell(col, material)}
                          </td>
                        ))}
                      </tr>
                    );

                    if (groupBy === "none") return sortedMaterials.map(renderMaterialRow);

                    const getGroupKey = (m: typeof sortedMaterials[0]): string => {
                      switch (groupBy) {
                        case "room": return m.room_id || "__none__";
                        case "status": return m.status || "__none__";
                        case "vendor": return m.vendor_name || "__none__";
                        default: return "__all__";
                      }
                    };
                    const getGroupLabel = (key: string): string => {
                      if (key === "__none__") return groupBy === "room" ? t("budget.noRoom") : groupBy === "vendor" ? t("budget.noVendor", "No vendor") : t("budget.noStatus");
                      if (groupBy === "room") return rooms.find((r) => r.id === key)?.name || key;
                      if (groupBy === "status") return t(`materialStatuses.${key}`, key);
                      return key; // vendor name as-is
                    };

                    const groups = new Map<string, typeof sortedMaterials>();
                    const groupOrder: string[] = [];
                    for (const m of sortedMaterials) {
                      const keys = groupBy === "room"
                        ? (m.room_ids?.length ? m.room_ids : (m.room_id ? [m.room_id] : ["__none__"]))
                        : [getGroupKey(m)];
                      for (const key of keys) {
                        if (!groups.has(key)) { groups.set(key, []); groupOrder.push(key); }
                        groups.get(key)!.push(m);
                      }
                    }

                    return groupOrder.flatMap((key) => {
                      const groupItems = groups.get(key)!;
                      const header = (
                        <tr
                          key={`group-${key}`}
                          className="cursor-pointer hover:bg-muted/30 transition-colors bg-primary/5 border-t-2 border-primary/20 border-b last:border-b-0"
                          onClick={() => toggleGroupCollapse(key)}
                        >
                          <td colSpan={visibleColumns.length} className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <ChevronDown className={cn("h-4 w-4 text-primary transition-transform", collapsedGroups.has(key) && "-rotate-90")} />
                              <span className="text-sm font-semibold">{getGroupLabel(key)}</span>
                              <Badge variant="secondary" className="text-xs">{groupItems.length}</Badge>
                            </div>
                          </td>
                        </tr>
                      );
                      if (collapsedGroups.has(key)) return [header];
                      return [header, ...groupItems.map(renderMaterialRow)];
                    });
                  })()
                )}
              </tbody>
            </table>
          </div>
      </div>

      <PaidDateConfirm
        open={!!paidConfirm}
        materialName={paidConfirm?.materialName || ""}
        onConfirm={async (paidDate) => {
          if (!paidConfirm) return;
          const { error } = await supabase
            .from("materials")
            .update({ status: "paid", paid_date: paidDate })
            .eq("id", paidConfirm.materialId);
          if (error) {
            toast({ title: t("common.error"), description: error.message, variant: "destructive" });
          } else {
            onMaterialUpdated();
          }
          setPaidConfirm(null);
        }}
        onCancel={() => setPaidConfirm(null)}
      />
    </div>
  );
}

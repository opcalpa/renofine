import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Loader2, Search, ArrowUp, ArrowDown, ArrowUpDown, SlidersHorizontal, Columns3, Plus, Rows3, Layers, Paperclip, Copy, ChevronDown, ChevronRight, FileText, ShoppingCart, Trash2, Hammer, Handshake, MoreVertical, Maximize2, Minimize2, Wallet } from "lucide-react";
import { AttachmentIndicator } from "@/components/shared/AttachmentIndicator";
import { FilePreviewPopover } from "@/components/shared/FilePreviewPopover";
import { getStatusBadgeColor } from "@/lib/statusColors";
import { computeEvidenceStatus, getEvidenceColor } from "@/lib/evidenceStatus";
import { BudgetChartsSection } from "./BudgetChartsSection";
import { BuilderSummaryCards } from "./budget/BuilderSummaryCards";
import { HomeownerBudgetView } from "./budget/HomeownerBudgetView";
import { HomeownerAnalysisSection } from "./budget/HomeownerAnalysisSection";
import { InvoiceMethodDialog } from "@/components/invoices/InvoiceMethodDialog";
import { RotSummaryCard } from "./overview/RotSummaryCard";
import { useTaxDeductionVisible } from "@/hooks/useTaxDeduction";
import { TaskEditDialog } from "./TaskEditDialog";
import { MaterialEditDialog } from "./MaterialEditDialog";
import { NewPurchaseFromBudgetDialog } from "./NewPurchaseFromBudgetDialog";
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
import { Checkbox } from "@/components/ui/checkbox";
import { ColumnToggle } from "@/components/shared/ColumnToggle";
import { Progress } from "@/components/ui/progress";

// --- Types ---

interface BudgetRow {
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

type ColumnKey = "name" | "type" | "status" | "phase" | "budget" | "consumed" | "paid" | "remaining" | "margin" | "supplier" | "matBudget" | "matConsumed" | "matRemaining" | "room" | "assignee" | "costCenter" | "startDate" | "finishDate" | "attachment" | "evidence" | "estimatedHours" | "hourlyRate" | "subcontractorCost" | "paymentStatus" | "quantity" | "pricePerUnit" | "orderedAmount" | "vendor" | "rotAmount";

interface ColumnDef {
  key: ColumnKey;
  label: string;
  align?: "left" | "right";
  extra?: boolean;
}

const EXTRA_COLUMN_KEYS: ColumnKey[] = [
  "room", "assignee", "costCenter", "startDate", "finishDate", "attachment", "evidence",
  // Task-specific extras
  "estimatedHours", "hourlyRate", "subcontractorCost", "paymentStatus",
  // Material-specific extras
  "quantity", "pricePerUnit", "orderedAmount", "vendor",
  // ROT
  "rotAmount",
];
const HOMEOWNER_HIDDEN_COLUMNS = new Set<ColumnKey>([
  "margin", "matBudget", "matConsumed", "matRemaining",
  "assignee", "costCenter",
  // Builder-internal task cost details
  "estimatedHours", "hourlyRate", "subcontractorCost", "paymentStatus",
]);
const HOMEOWNER_EXTRA_KEYS: ColumnKey[] = [
  "room", "startDate", "finishDate", "attachment", "evidence",
  "paid", "remaining",
  "quantity", "pricePerUnit", "orderedAmount", "vendor",
];

// Status badge colors for combined status column
// Status badge colors now come from shared getStatusBadgeColor()

const budgetStatusKey = (s: string) => {
  const map: Record<string, string> = {
    to_do: "toDo",
    in_progress: "inProgress",
    on_hold: "onHold",
  };
  return map[s] || s;
};

interface BudgetTabProps {
  projectId: string;
  currency?: string | null;
  isReadOnly?: boolean;
  userType?: string | null;
  country?: string | null;
}

// --- Auto-persist table prefs ---

interface BudgetTablePrefs {
  columnOrder: ColumnKey[];
  visibleExtras: ColumnKey[];
  sortKey: ColumnKey | null;
  sortDir: "asc" | "desc";
  compactRows?: boolean;
}

const BUDGET_PREFS_KEY = (projectId: string) => `budget-table-prefs-${projectId}`;

function loadBudgetPrefs(projectId: string): BudgetTablePrefs | null {
  try {
    const raw = localStorage.getItem(BUDGET_PREFS_KEY(projectId));
    if (!raw) return null;
    return JSON.parse(raw) as BudgetTablePrefs;
  } catch {
    return null;
  }
}

function persistBudgetPrefs(projectId: string, prefs: BudgetTablePrefs) {
  const key = BUDGET_PREFS_KEY(projectId);
  localStorage.setItem(key, JSON.stringify(prefs));
  import("@/hooks/usePersistedPreference").then(({ scheduleServerSync }) => scheduleServerSync(key, prefs));
}

// --- Cost helpers ---

function computeTaskEstimatedCost(
  task: {
    estimated_hours?: number | null;
    hourly_rate?: number | null;
    labor_cost_percent?: number | null;
    subcontractor_cost?: number | null;
    material_estimate?: number | null;
  },
  defaultLaborCostPercent: number,
  plannedMaterialCost?: number
): number {
  const laborTotal = (task.estimated_hours || 0) * (task.hourly_rate || 0);
  const laborCost = laborTotal * ((task.labor_cost_percent ?? defaultLaborCostPercent) / 100);
  const ueCost = task.subcontractor_cost || 0;
  // Planned materials (from materials table) take priority; fall back to flat estimate for
  // tasks that predate the migration or were saved without creating materials rows.
  const materialCost = (plannedMaterialCost != null && plannedMaterialCost > 0)
    ? plannedMaterialCost
    : (task.material_estimate || 0);
  return laborCost + ueCost + materialCost;
}

/** Labor-only estimated cost for P&L view where materials are separate rows */
function computeTaskLaborCost(
  task: {
    estimated_hours?: number | null;
    hourly_rate?: number | null;
    labor_cost_percent?: number | null;
    subcontractor_cost?: number | null;
  },
  defaultLaborCostPercent: number,
): number {
  const laborTotal = (task.estimated_hours || 0) * (task.hourly_rate || 0);
  const laborCost = laborTotal * ((task.labor_cost_percent ?? defaultLaborCostPercent) / 100);
  const ueCost = task.subcontractor_cost || 0;
  return laborCost + ueCost;
}

const getEffectiveCost = (row: BudgetRow) => row.paid > 0 ? row.paid : row.estimatedCost;

function computeMaterialBudget(
  task: { material_estimate?: number | null },
  plannedMaterialCost?: number
): number {
  // Planned materials (from materials table) take priority; fall back to flat estimate.
  if (plannedMaterialCost != null && plannedMaterialCost > 0) return plannedMaterialCost;
  return task.material_estimate || 0;
}

// --- Component ---

const BudgetTab = ({ projectId, currency, isReadOnly, userType, country }: BudgetTabProps) => {
  const isBuilder = userType !== "homeowner";
  const { t } = useTranslation();
  const { showTaxDeduction } = useTaxDeductionVisible(country);
  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [extraTotal, setExtraTotal] = useState(0);
  const [projectBudget, setProjectBudget] = useState(0);
  const [loading, setLoading] = useState(true);
  const [defaultLaborCostPercent, setDefaultLaborCostPercent] = useState(50);
  const { toast } = useToast();

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Escape key exits fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") setIsFullscreen(false); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isFullscreen]);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [filterType, setFilterType] = useState<"all" | "task" | "material" | "purchase">("all");

  // Grouping
  type GroupByOption = "none" | "room" | "costCenter" | "status";
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

  // Advanced filters
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [filterRoom, setFilterRoom] = useState("all");
  const [filterAssignee, setFilterAssignee] = useState("all");
  const [filterCostCenter, setFilterCostCenter] = useState("all");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterFinishDate, setFilterFinishDate] = useState("");
  const [filterAttachment, setFilterAttachment] = useState<"all" | "has" | "missing">("all");
  const [filterStatuses, setFilterStatuses] = useState<Set<string>>(new Set());

  // Collapsible columns
  const budgetPrefs = useRef(loadBudgetPrefs(projectId));
  const [visibleExtras, setVisibleExtras] = useState<Set<ColumnKey>>(
    () => budgetPrefs.current?.visibleExtras
      ? new Set(budgetPrefs.current.visibleExtras)
      : new Set()
  );

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

  // Column order (drag reorder)
  const [columns, setColumns] = useState<ColumnDef[]>(() => {
    if (budgetPrefs.current?.columnOrder) {
      const ordered = budgetPrefs.current.columnOrder
        .map((key) => ALL_COLUMNS.find((c) => c.key === key))
        .filter((c): c is ColumnDef => c !== undefined);
      for (const col of ALL_COLUMNS) {
        if (!ordered.some((c) => c.key === col.key)) ordered.push(col);
      }
      return ordered;
    }
    return ALL_COLUMNS;
  });
  const dragCol = useRef<number | null>(null);
  const dragOverCol = useRef<number | null>(null);

  // Keep columns in sync when ALL_COLUMNS changes (language switch)
  useEffect(() => {
    setColumns((prev) => {
      const keyOrder = prev.map((c) => c.key);
      const updated = keyOrder
        .map((key) => ALL_COLUMNS.find((c) => c.key === key))
        .filter((c): c is ColumnDef => c !== undefined);
      for (const col of ALL_COLUMNS) {
        if (!updated.some((c) => c.key === col.key)) {
          updated.push(col);
        }
      }
      return updated;
    });
  }, [ALL_COLUMNS]);

  // Sorting
  const [sortKey, setSortKey] = useState<ColumnKey | null>(
    () => budgetPrefs.current?.sortKey ?? null
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">(
    () => budgetPrefs.current?.sortDir ?? "asc"
  );

  // Inline editing
  const [editingCell, setEditingCell] = useState<{ rowId: string; col: string } | null>(null);
  const [editValue, setEditValue] = useState("");

  // Edit dialogs
  const [editTaskId, setEditTaskId] = useState<string | null>(null);
  const [editMaterialId, setEditMaterialId] = useState<string | null>(null);
  const [invoiceMethodOpen, setInvoiceMethodOpen] = useState(false);

  // +Inköp from budget post
  const [purchaseFromBudgetPost, setPurchaseFromBudgetPost] = useState<BudgetRow | null>(null);
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(null);

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

  // Supplier registry
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);

  const [compactRows, setCompactRows] = useState(
    () => budgetPrefs.current?.compactRows ?? true
  );

  // Task → material budget post grouping
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const toggleTaskExpand = useCallback((taskId: string) => {
    setExpandedTasks(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);

  // Material budget post → purchase grouping
  const [expandedBudgetPosts, setExpandedBudgetPosts] = useState<Set<string>>(new Set());
  const toggleBudgetPostExpand = useCallback((budgetPostId: string) => {
    setExpandedBudgetPosts(prev => {
      const next = new Set(prev);
      if (next.has(budgetPostId)) next.delete(budgetPostId);
      else next.add(budgetPostId);
      return next;
    });
  }, []);

  // Purchase-order → orphan-line grouping (collapses same-PO unallocated material rows under one header)
  const [purchaseOrderInfo, setPurchaseOrderInfo] = useState<Map<string, { status: string; vendor: string; total: number }>>(new Map());
  const [expandedPurchaseOrders, setExpandedPurchaseOrders] = useState<Set<string>>(new Set());
  const togglePurchaseOrderExpand = useCallback((poId: string) => {
    setExpandedPurchaseOrders(prev => {
      const next = new Set(prev);
      if (next.has(poId)) next.delete(poId);
      else next.add(poId);
      return next;
    });
  }, []);

  // Inline add row
  const [isAddingRow, setIsAddingRow] = useState(false);
  const [newRowType, setNewRowType] = useState<"task" | "material">("task");
  const [newRowName, setNewRowName] = useState("");
  const [newRowBudget, setNewRowBudget] = useState("");
  const [newRowRoomId, setNewRowRoomId] = useState("");
  const [addingRowLoading, setAddingRowLoading] = useState(false);
  const [allRooms, setAllRooms] = useState<{ id: string; name: string }[]>([]);
  const newRowNameRef = useRef<HTMLInputElement>(null);

  // Auto-persist table prefs
  useEffect(() => {
    persistBudgetPrefs(projectId, {
      columnOrder: columns.map((c) => c.key),
      visibleExtras: Array.from(visibleExtras),
      sortKey,
      sortDir,
      compactRows,
    });
  }, [columns, visibleExtras, sortKey, sortDir, compactRows, projectId]);

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

  // --- Data fetching ---

  const fetchData = useCallback(async () => {
    try {
      // Fetch profile defaults for labor cost percent + suppliers
      let fetchedProfileId: string | null = null;
      const fetchedSuppliers: { id: string; name: string }[] = [];
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, default_labor_cost_percent")
          .eq("user_id", user.id)
          .single();
        if (profile) {
          if (profile.default_labor_cost_percent != null) {
            setDefaultLaborCostPercent(profile.default_labor_cost_percent);
          }
          setCurrentProfileId(profile.id);
          fetchedProfileId = profile.id;
          // Fetch suppliers for this profile
          const { data: suppData } = await supabase
            .from("suppliers")
            .select("id, name")
            .eq("profile_id", profile.id)
            .order("name");
          if (suppData) {
            fetchedSuppliers.push(...suppData);
            setSuppliers(suppData);
          }
        }
      }

      const [tasksRes, materialsRes, extraRes, projectRes, taskDocsRes, materialDocsRes, purchaseOrdersRes] = await Promise.all([
        supabase
          .from("tasks")
          .select("id, title, status, budget, ordered_amount, payment_status, paid_amount, room_id, cost_center, start_date, finish_date, is_ata, estimated_hours, hourly_rate, labor_cost_percent, subcontractor_cost, markup_percent, material_estimate, material_markup_percent, task_cost_type, rot_amount, supplier_id")
          .eq("project_id", projectId),
        supabase
          .from("materials")
          .select("id, name, price_total, quantity, price_per_unit, ordered_amount, paid_amount, status, room_id, task_id, vendor_name, source_material_id, purchase_order_id")
          .eq("project_id", projectId)
          .eq("exclude_from_budget", false),
        supabase
          .from("materials")
          .select("id, name, price_total, quantity, price_per_unit, ordered_amount, paid_amount, status, room_id, task_id, vendor_name, source_material_id, purchase_order_id")
          .eq("project_id", projectId)
          .eq("exclude_from_budget", true),
        supabase
          .from("projects")
          .select("contract_value")
          .eq("id", projectId)
          .single(),
        supabase
          .from("task_file_links")
          .select("task_id, file_type")
          .eq("project_id", projectId)
          .not("task_id", "is", null),
        supabase
          .from("task_file_links")
          .select("material_id, file_type")
          .eq("project_id", projectId)
          .not("material_id", "is", null),
        supabase
          .from("purchase_orders")
          .select("id, status, vendor_name, total")
          .eq("project_id", projectId),
      ]);

      if (tasksRes.error) throw tasksRes.error;
      if (materialsRes.error) throw materialsRes.error;
      if (extraRes.error) throw extraRes.error;

      setProjectBudget(projectRes.data?.contract_value ?? 0);

      // Build ÄTA rows from both tasks (is_ata) and materials (exclude_from_budget)
      const ataTasks = (tasksRes.data || []).filter((t) => t.is_ata);
      const ataMaterials = extraRes.data || [];
      const materialAtaTotal = ataMaterials.reduce((sum, m) => sum + (m.price_total || 0), 0);
      const taskAtaTotal = ataTasks.reduce((sum, t) => sum + (t.budget || 0), 0);
      setExtraTotal(materialAtaTotal + taskAtaTotal);

      // Build document count maps + qualifying file maps (invoice/receipt)
      const taskDocCounts = new Map<string, number>();
      const taskHasInvoice = new Map<string, boolean>();
      if (!taskDocsRes.error) {
        (taskDocsRes.data || []).forEach((d: { task_id: string | null; file_type?: string }) => {
          if (d.task_id) {
            taskDocCounts.set(d.task_id, (taskDocCounts.get(d.task_id) || 0) + 1);
            if (d.file_type === "invoice" || d.file_type === "receipt") {
              taskHasInvoice.set(d.task_id, true);
            }
          }
        });
      }

      const materialDocCounts = new Map<string, number>();
      const materialHasInvoice = new Map<string, boolean>();
      if (!materialDocsRes.error) {
        (materialDocsRes.data || []).forEach((d: { material_id: string | null; file_type?: string }) => {
          if (d.material_id) {
            materialDocCounts.set(d.material_id, (materialDocCounts.get(d.material_id) || 0) + 1);
            if (d.file_type === "invoice" || d.file_type === "receipt") {
              materialHasInvoice.set(d.material_id, true);
            }
          }
        });
      }

      // Collect unique room_ids and contractor_ids to resolve names
      const roomIds = new Set<string>();

      for (const t of tasksRes.data || []) {
        if (t.room_id) roomIds.add(t.room_id);
      }
      for (const m of materialsRes.data || []) {
        if (m.room_id) roomIds.add(m.room_id);
      }

      const roomMap = new Map<string, string>();

      if (roomIds.size > 0) {
        const { data: rooms } = await supabase
          .from("rooms")
          .select("id, name")
          .in("id", Array.from(roomIds));
        for (const r of rooms || []) {
          roomMap.set(r.id, r.name);
        }
      }

      // Build supplier name map
      const supplierMap = new Map<string, string>();
      for (const s of fetchedSuppliers) {
        supplierMap.set(s.id, s.name);
      }

      // Build PO info map: purchase_order_id → { status, vendor_name, total }
      const poInfoMap = new Map<string, { status: string; vendor: string; total: number }>();
      const poStatusMap = new Map<string, string>();
      if (!purchaseOrdersRes.error) {
        for (const po of purchaseOrdersRes.data || []) {
          poStatusMap.set(po.id, po.status);
          poInfoMap.set(po.id, {
            status: po.status,
            vendor: po.vendor_name,
            total: po.total ?? 0,
          });
        }
      }
      setPurchaseOrderInfo(poInfoMap);

      // Phase helper for purchase/material rows
      const derivePurchasePhase = (m: { paid_amount?: number | null; status?: string | null; purchase_order_id?: string | null }): "budget" | "ordered" | "actual" => {
        const poStatus = m.purchase_order_id ? poStatusMap.get(m.purchase_order_id) : undefined;
        if ((m.paid_amount ?? 0) > 0) return "actual";
        if (poStatus === "delivered") return "actual";
        if (m.status === "delivered" || m.status === "paid" || m.status === "billed") return "actual";
        if (poStatus === "ordered") return "ordered";
        if (m.status === "ordered" || m.status === "approved" || m.status === "submitted" || m.status === "to_order") return "ordered";
        return "budget";
      };

      // --- P&L row construction ---
      // Split materials into budget posts (planned) vs purchases (actual)
      const allMaterials = materialsRes.data || [];
      const plannedMaterials = allMaterials.filter(m => m.status === "planned");
      const purchaseMaterials = allMaterials.filter(m => m.status !== "planned");

      // Build consumed-by-source map: source_material_id → sum of purchase costs
      const consumedBySourceId = new Map<string, number>();
      for (const m of purchaseMaterials) {
        if (m.source_material_id) {
          const cost = m.price_total ?? (((m.quantity || 0) * (m.price_per_unit || 0)) || 0);
          consumedBySourceId.set(m.source_material_id, (consumedBySourceId.get(m.source_material_id) || 0) + cost);
        }
      }

      // Track which tasks have planned materials (for synthetic budget post fallback)
      const tasksWithPlannedMaterials = new Set(plannedMaterials.filter(m => m.task_id).map(m => m.task_id));

      // Keep legacy materialPlannedMap for computeTaskEstimatedCost (used in evidence calc)
      const materialPlannedMap = new Map<string, number>();
      for (const m of plannedMaterials) {
        if (m.task_id) {
          const cost = m.price_total ?? (((m.quantity || 0) * (m.price_per_unit || 0)) || 0);
          materialPlannedMap.set(m.task_id, (materialPlannedMap.get(m.task_id) || 0) + cost);
        }
      }

      // 1. Task rows (work budget posts) — labor cost only, materials are separate rows
      const taskRows: BudgetRow[] = (tasksRes.data || []).filter((t) => !t.is_ata).map((t) => {
        const attachmentCount = taskDocCounts.get(t.id) || 0;
        const laborCost = computeTaskLaborCost(t, defaultLaborCostPercent);
        const fullEstCost = computeTaskEstimatedCost(t, defaultLaborCostPercent, materialPlannedMap.get(t.id));
        const taskPhase: "budget" | "ordered" | "actual" =
          (t.paid_amount ?? 0) > 0 ? "actual"
          : (t.ordered_amount ?? 0) > 0 ? "ordered"
          : "budget";
        return {
          id: t.id,
          name: t.title,
          type: "task" as const,
          budget: t.budget ?? 0,
          paid: t.paid_amount ?? 0,
          estimatedCost: laborCost,
          isEstimated: (t.paid_amount ?? 0) <= 0,
          taskCostType: (t as Record<string, unknown>).task_cost_type as string | null ?? null,
          room: t.room_id ? roomMap.get(t.room_id) : undefined,
          roomId: t.room_id ?? undefined,
          assignee: undefined,
          assigneeId: undefined,
          costCenter: t.cost_center ?? undefined,
          startDate: t.start_date ?? undefined,
          finishDate: t.finish_date ?? undefined,
          hasAttachment: attachmentCount > 0,
          attachmentCount,
          materialBudget: computeMaterialBudget(t, materialPlannedMap.get(t.id)),
          materialConsumed: 0,
          status: t.status ?? undefined,
          estimatedHours: t.estimated_hours ?? undefined,
          hourlyRate: t.hourly_rate ?? undefined,
          subcontractorCost: t.subcontractor_cost ?? undefined,
          markupPercent: t.markup_percent ?? undefined,
          materialMarkupPercent: t.material_markup_percent ?? undefined,
          laborCostPercent: t.labor_cost_percent ?? undefined,
          paymentStatus: t.payment_status ?? undefined,
          orderedAmount: t.ordered_amount ?? undefined,
          supplierId: (t as Record<string, unknown>).supplier_id as string ?? undefined,
          supplierName: (t as Record<string, unknown>).supplier_id ? supplierMap.get((t as Record<string, unknown>).supplier_id as string) : undefined,
          rotAmount: (t as Record<string, unknown>).rot_amount as number ?? undefined,
          evidenceStatus: computeEvidenceStatus({
            rowType: "task",
            status: t.status,
            budget: t.budget ?? 0,
            paid: t.paid_amount ?? 0,
            cost: fullEstCost,
            hasQualifyingFile: taskHasInvoice.get(t.id) ?? false,
            fileCount: attachmentCount,
          }),
          phase: taskPhase,
        };
      });

      // 2. Material budget post rows (planned materials as own rows)
      const materialBudgetRows: BudgetRow[] = plannedMaterials.map((m) => {
        const attachmentCount = materialDocCounts.get(m.id) || 0;
        const budgetAmount = m.price_total ?? (((m.quantity || 0) * (m.price_per_unit || 0)) || 0);
        const consumed = consumedBySourceId.get(m.id) || 0;
        return {
          id: m.id,
          name: m.name,
          type: "material" as const,
          isBudgetPost: true,
          budget: budgetAmount,
          paid: m.paid_amount ?? 0,
          estimatedCost: budgetAmount,
          isEstimated: true,
          room: m.room_id ? roomMap.get(m.room_id) : undefined,
          roomId: m.room_id ?? undefined,
          hasAttachment: attachmentCount > 0,
          attachmentCount,
          isUnlinked: !m.task_id,
          taskId: m.task_id ?? undefined,
          materialBudget: budgetAmount,
          materialConsumed: consumed,
          consumedTotal: consumed,
          status: m.status ?? undefined,
          quantity: m.quantity ?? undefined,
          pricePerUnit: m.price_per_unit ?? undefined,
          orderedAmount: m.ordered_amount ?? undefined,
          vendor: m.vendor_name ?? undefined,
          evidenceStatus: computeEvidenceStatus({
            rowType: "material",
            status: m.status,
            budget: budgetAmount,
            paid: m.paid_amount ?? 0,
            cost: budgetAmount,
            hasQualifyingFile: materialHasInvoice.get(m.id) ?? false,
            fileCount: attachmentCount,
          }),
          phase: "budget",
        };
      });

      // 3. Synthetic material budget posts for tasks with material_estimate but no planned rows
      const syntheticBudgetRows: BudgetRow[] = [];
      for (const t of tasksRes.data || []) {
        if (t.is_ata) continue;
        if (tasksWithPlannedMaterials.has(t.id)) continue;
        const matEst = t.material_estimate || 0;
        if (matEst <= 0) continue;
        syntheticBudgetRows.push({
          id: `__synthetic_mat_${t.id}`,
          name: `${t.title} — materialbudget`,
          type: "material" as const,
          isBudgetPost: true,
          budget: matEst,
          paid: 0,
          estimatedCost: matEst,
          isEstimated: true,
          room: t.room_id ? roomMap.get(t.room_id) : undefined,
          roomId: t.room_id ?? undefined,
          hasAttachment: false,
          attachmentCount: 0,
          isUnlinked: false,
          taskId: t.id,
          materialBudget: matEst,
          materialConsumed: 0,
          consumedTotal: 0,
          status: "planned",
          phase: "budget",
        });
      }

      // 4. Purchase rows (actual orders/invoices that consume budget posts)
      const purchaseRows: BudgetRow[] = purchaseMaterials.map((m) => {
        const attachmentCount = materialDocCounts.get(m.id) || 0;
        const purchaseTotal = m.price_total ?? (((m.quantity || 0) * (m.price_per_unit || 0)) || 0);
        return {
          id: m.id,
          name: m.name,
          type: "purchase" as const,
          budget: 0,
          paid: m.paid_amount ?? 0,
          estimatedCost: purchaseTotal,
          isEstimated: (m.paid_amount ?? 0) <= 0,
          room: m.room_id ? roomMap.get(m.room_id) : undefined,
          roomId: m.room_id ?? undefined,
          hasAttachment: attachmentCount > 0,
          attachmentCount,
          isUnlinked: !m.task_id,
          taskId: m.task_id ?? undefined,
          materialBudget: 0,
          materialConsumed: 0,
          sourceMaterialId: m.source_material_id ?? undefined,
          parentBudgetPostId: m.source_material_id ?? undefined,
          status: m.status ?? undefined,
          quantity: m.quantity ?? undefined,
          pricePerUnit: m.price_per_unit ?? undefined,
          orderedAmount: m.ordered_amount ?? undefined,
          vendor: m.vendor_name ?? undefined,
          evidenceStatus: computeEvidenceStatus({
            rowType: "material",
            status: m.status,
            budget: 0,
            paid: m.paid_amount ?? 0,
            cost: purchaseTotal,
            hasQualifyingFile: materialHasInvoice.get(m.id) ?? false,
            fileCount: attachmentCount,
          }),
          phase: derivePurchasePhase(m),
          purchaseOrderId: m.purchase_order_id ?? undefined,
        };
      });

      // 5. ÄTA task rows
      const ataTaskRows: BudgetRow[] = ataTasks.map((t) => {
        const attachmentCount = taskDocCounts.get(t.id) || 0;
        return {
          id: t.id,
          name: t.title,
          type: "task" as const,
          isAta: true,
          budget: t.budget ?? 0,
          paid: t.paid_amount ?? 0,
          estimatedCost: computeTaskLaborCost(t, defaultLaborCostPercent),
          isEstimated: (t.paid_amount ?? 0) <= 0,
          taskCostType: (t as Record<string, unknown>).task_cost_type as string | null ?? null,
          room: t.room_id ? roomMap.get(t.room_id) : undefined,
          roomId: t.room_id ?? undefined,
          assignee: undefined,
          assigneeId: undefined,
          costCenter: t.cost_center ?? undefined,
          hasAttachment: attachmentCount > 0,
          attachmentCount,
          materialBudget: 0,
          materialConsumed: 0,
          status: t.status ?? undefined,
          subcontractorCost: t.subcontractor_cost ?? undefined,
          paymentStatus: t.payment_status ?? undefined,
          phase: (t.paid_amount ?? 0) > 0 ? "actual"
            : (t.ordered_amount ?? 0) > 0 ? "ordered"
            : "budget",
        };
      });

      // 6. ÄTA material rows — split planned vs purchases same as main
      const ataPlanned = ataMaterials.filter(m => m.status === "planned");
      const ataPurchases = ataMaterials.filter(m => m.status !== "planned");

      const ataConsumedBySource = new Map<string, number>();
      for (const m of ataPurchases) {
        if (m.source_material_id) {
          const cost = m.price_total ?? (((m.quantity || 0) * (m.price_per_unit || 0)) || 0);
          ataConsumedBySource.set(m.source_material_id, (ataConsumedBySource.get(m.source_material_id) || 0) + cost);
        }
      }

      const ataMaterialBudgetRows: BudgetRow[] = ataPlanned.map((m) => {
        const budgetAmount = m.price_total ?? (((m.quantity || 0) * (m.price_per_unit || 0)) || 0);
        return {
          id: m.id,
          name: m.name,
          type: "material" as const,
          isAta: true,
          isBudgetPost: true,
          budget: budgetAmount,
          paid: m.paid_amount ?? 0,
          estimatedCost: budgetAmount,
          isEstimated: true,
          room: m.room_id ? roomMap.get(m.room_id) : undefined,
          roomId: m.room_id ?? undefined,
          hasAttachment: false,
          attachmentCount: 0,
          isUnlinked: !m.task_id,
          taskId: m.task_id ?? undefined,
          materialBudget: budgetAmount,
          materialConsumed: ataConsumedBySource.get(m.id) || 0,
          consumedTotal: ataConsumedBySource.get(m.id) || 0,
          status: m.status ?? undefined,
          quantity: m.quantity ?? undefined,
          pricePerUnit: m.price_per_unit ?? undefined,
          vendor: m.vendor_name ?? undefined,
          phase: "budget",
        };
      });

      const ataPurchaseRows: BudgetRow[] = ataPurchases.map((m) => {
        const purchaseTotal = m.price_total ?? (((m.quantity || 0) * (m.price_per_unit || 0)) || 0);
        return {
          id: m.id,
          name: m.name,
          type: "purchase" as const,
          isAta: true,
          budget: 0,
          paid: m.paid_amount ?? 0,
          estimatedCost: purchaseTotal,
          isEstimated: (m.paid_amount ?? 0) <= 0,
          room: m.room_id ? roomMap.get(m.room_id) : undefined,
          roomId: m.room_id ?? undefined,
          hasAttachment: false,
          attachmentCount: 0,
          taskId: m.task_id ?? undefined,
          materialBudget: 0,
          materialConsumed: 0,
          sourceMaterialId: m.source_material_id ?? undefined,
          parentBudgetPostId: m.source_material_id ?? undefined,
          status: m.status ?? undefined,
          quantity: m.quantity ?? undefined,
          pricePerUnit: m.price_per_unit ?? undefined,
          vendor: m.vendor_name ?? undefined,
          phase: derivePurchasePhase(m),
          purchaseOrderId: m.purchase_order_id ?? undefined,
        };
      });

      setRows([...taskRows, ...materialBudgetRows, ...syntheticBudgetRows, ...purchaseRows, ...ataTaskRows, ...ataMaterialBudgetRows, ...ataPurchaseRows]);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('budget.failedToLoadData');
      toast({ title: t('common.error'), description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [projectId, toast, defaultLaborCostPercent]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch all rooms for the inline add dropdown
  const fetchRooms = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("rooms")
        .select("id, name")
        .eq("project_id", projectId)
        .order("name");
      if (error) throw error;
      setAllRooms(data || []);
    } catch (error: unknown) {
      console.error("Failed to fetch rooms:", error);
    }
  }, [projectId]);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

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
        const { error } = await supabase.from("materials").insert({
          project_id: projectId,
          name: newRowName.trim(),
          price_total: budgetValue,
          room_id: newRowRoomId || null,
          status: "submitted",
          exclude_from_budget: false,
          quantity: 1,
          unit: "st",
          created_by_user_id: profileId,
        });
        if (error) throw error;
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

        const { error } = await supabase.from("materials").insert({
          project_id: projectId,
          name: `${material.name} (${t('budget.copy')})`,
          price_total: material.price_total,
          room_id: material.room_id,
          status: "submitted",
          quantity: material.quantity,
          unit: material.unit,
          vendor_name: material.vendor_name,
          vendor_link: material.vendor_link,
          description: material.description,
          exclude_from_budget: material.exclude_from_budget,
          created_by_user_id: profileId,
        });
        if (error) throw error;
      }

      toast({ title: t('common.success'), description: t('budget.rowDuplicated') });
      await fetchData();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('budget.failedToDuplicate');
      toast({ title: t('common.error'), description: msg, variant: "destructive" });
    }
  };

  const handleDeleteRow = async (row: BudgetRow) => {
    // Simple confirmation
    if (!window.confirm(t('budget.confirmDelete', { name: row.name }))) {
      return;
    }

    try {
      if (row.type === "task") {
        const { error } = await supabase.from("tasks").delete().eq("id", row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("materials").delete().eq("id", row.id);
        if (error) throw error;
      }

      toast({ title: t('common.success'), description: t('budget.rowDeleted') });
      await fetchData();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('budget.failedToDelete');
      toast({ title: t('common.error'), description: msg, variant: "destructive" });
    }
  };

  // --- Distinct filter options ---

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

  // --- Filtering & Sorting ---

  const hasAdvancedFilter = filterRoom !== "all" || filterAssignee !== "all" || filterCostCenter !== "all" || filterStartDate !== "" || filterFinishDate !== "" || filterAttachment !== "all";

  // Separate ÄTA rows from main rows for distinct display
  const mainRows = rows.filter(r => !r.isAta);
  const ataRows = rows.filter(r => r.isAta);

  const filtered = mainRows.filter((r) => {
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
    filtered.sort((a, b) => {
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
        av = a[sortKey];
        bv = b[sortKey];
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

  const totals = filtered.reduce(
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
    { budget: 0, paid: 0, cost: 0, consumed: 0, matBudget: 0, matConsumed: 0 }
  );

  // Group linked materials under their parent task for display
  const [unlinkedExpanded, setUnlinkedExpanded] = useState(false);
  const [ataExpanded, setAtaExpanded] = useState(true);

  type DisplayRow = BudgetRow & { isChild?: boolean; isPurchaseChild?: boolean; childCount?: number; purchaseCount?: number; isSectionHeader?: boolean; isPoHeader?: boolean };

  const displayRows = useMemo(() => {
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
        const parentInList = taskRows.some(t => t.id === bp.taskId);
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
      const ataTasksFiltered = ataRows.filter(r => r.type === "task");
      const ataBudgetPosts = ataRows.filter(r => r.type === "material" && r.isBudgetPost);
      const ataPurchasesFiltered = ataRows.filter(r => r.type === "purchase");

      const ataBpByTask = new Map<string, BudgetRow[]>();
      const ataStandaloneBp: BudgetRow[] = [];
      for (const bp of ataBudgetPosts) {
        if (bp.taskId && ataTasksFiltered.some(t => t.id === bp.taskId)) {
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
    const groups = new Map<string, Array<typeof result[0]>>();
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

    const grouped: typeof result = [];
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
      } as typeof result[0] & { _groupKey?: string });
      if (!collapsedGroups.has(key)) {
        grouped.push(...groupRows);
      }
    }
    // Append standalone/orphan sections at the end
    grouped.push(...sectionRows);

    return grouped;
  }, [filtered, ataRows, expandedTasks, expandedBudgetPosts, expandedPurchaseOrders, purchaseOrderInfo, unlinkedExpanded, ataExpanded, groupBy, collapsedGroups, t]);

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

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "\u2014";
    return new Date(dateStr).toLocaleDateString("sv-SE");
  };

  // --- Cell renderers ---

  const renderCell = (col: ColumnDef, row: DisplayRow) => {
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
            {/* ÄTA badge */}
            {row.isAta && (
              <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0 text-orange-600 border-orange-300">{t('budget.addition', 'Tillägg')}</Badge>
            )}
            {/* Task: expand to show material budget posts */}
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
            {/* Material budget post: expand to show purchases */}
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
            {/* Orphan warning for purchases without budget post (skip aggregate PO header) */}
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
            <Badge variant="secondary" className="gap-1 text-blue-700 bg-blue-50 border-blue-200">
              <ShoppingCart className="h-3 w-3 text-blue-500" />
              {t('budget.materialBudget', 'Materialbudget')}
            </Badge>
          );
        }
        if (row.type === "material") {
          return (
            <Badge variant={row.isChild ? "outline" : "secondary"} className="gap-1">
              <ShoppingCart className="h-3 w-3 text-blue-500" />
              {t('budget.material')}
            </Badge>
          );
        }
        const isSubcontractor = isBuilder && (row.taskCostType === "subcontractor" || (!row.taskCostType && (row.subcontractorCost ?? 0) > 0));
        const hasOwnLabor = row.taskCostType === "own_labor" || (!row.taskCostType && (row.estimatedHours ?? 0) > 0);
        return (
          <Badge variant="default" className="gap-1">
            {isSubcontractor ? <Handshake className="h-3 w-3 text-amber-100" /> : <Hammer className="h-3 w-3" />}
            {isSubcontractor && !hasOwnLabor
              ? t('budget.subcontractor', 'UE')
              : t('budget.task')}
          </Badge>
        );
      }
      case "status": {
        // PO header: read-only PO status badge
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
          : "\u2014";

        if (isEditingStatus) {
          const options = row.type === "task"
            ? ["to_do", "in_progress", "done", "on_hold"]
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
        // Hide phase on non-PO synthetic headers (standalone-bp / ata-header); PO header keeps it
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
        // Show consumed total for material budget posts
        if (!isMaterialBudgetPost) return <span className="text-muted-foreground/30">{"–"}</span>;
        const consumed = row.consumedTotal ?? 0;
        return consumed > 0
          ? <span>{formatCurrency(consumed, currency)}</span>
          : <span className="text-muted-foreground/30">{"–"}</span>;
      }
      case "budget": {
        // Purchases don't have a budget — they consume one
        if (isPurchase) return <span className="text-muted-foreground/30">{"–"}</span>;
        // Legacy non-budget-post materials
        if (row.type === "material" && !row.isBudgetPost) return <span className="text-muted-foreground/30">{"–"}</span>;
        // Synthetic rows are not editable
        if (row.id.startsWith("__")) return <span>{formatCurrency(row.budget, currency)}</span>;
        // Homeowner: read-only
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
        // PO header: render aggregate cost read-only (builder shows effective, homeowner shows paid)
        if (row.isPoHeader) {
          const amount = isBuilder ? getEffectiveCost(row) : row.paid;
          return (
            <span className={isBuilder && row.isEstimated ? "text-muted-foreground italic" : ""}>
              {formatCurrency(amount, currency)}
              {isBuilder && row.isEstimated && amount > 0 && <span className="ml-0.5">*</span>}
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
            <span className={isBuilder && row.isEstimated ? "text-muted-foreground italic" : ""}>
              {formatCurrency(displayAmount, currency)}
              {isBuilder && row.isEstimated && displayAmount > 0 && <span className="ml-0.5">*</span>}
            </span>
          </button>
        );
      }
      case "remaining": {
        // Purchases don't have remaining — they are the consumption
        if (isPurchase) return <span className="text-muted-foreground/30">{"–"}</span>;
        // Material budget posts: remaining = budget - consumed
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
          // Builder: remaining = budget - effective cost (tasks only)
          if (row.type === "material") return <span className="text-muted-foreground/30">{"–"}</span>;
          const result = row.budget - getEffectiveCost(row);
          return (
            <span className={result < 0 ? "text-destructive" : result > 0 ? "text-green-600" : ""}>
              {formatCurrency(result, currency)}
            </span>
          );
        }
        // Homeowner: outstanding = quoted - paid (all rows)
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
      // Task-specific extras — inline editable numeric cells
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
      // Material-specific extras — inline editable
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
        // PO header: read-only vendor (already in name cell but this column may be visible without name expanded)
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
      case "rotAmount":
        if (row.type !== "task") return <span className="text-muted-foreground/30">{"–"}</span>;
        return <span>{row.rotAmount ? formatCurrency(row.rotAmount, currency) : "–"}</span>;
      default:
        return null;
    }
  };

  const renderFooterCell = (col: ColumnDef) => {
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
        // Homeowner: sum of actual payments only; Builder: sum of effective costs
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
        // Homeowner: sum of (quoted - paid) for tasks + budget posts only — skip purchase rows
        const totalOutstanding = filtered.reduce((sum, r) => {
          if (r.type === "purchase") return sum; // purchases are already consumed via budget post
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
  };

  // --- Loading state ---

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // --- Simplified read-only view for clients/viewers ---
  if (isReadOnly) {
    const totalSpent = totals.paid;
    const spentPercent = projectBudget > 0 ? Math.min(Math.round((totalSpent / projectBudget) * 100), 100) : 0;
    const remaining = projectBudget - totalSpent;
    const taskTotal = rows.filter(r => r.type === "task").reduce((s, r) => s + r.budget, 0);
    const materialTotal = rows.filter(r => r.type === "material").reduce((s, r) => s + r.budget, 0);

    return (
      <div className="space-y-5 sm:space-y-8">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('budget.title')}</h2>

        <div className="rounded-xl border bg-card p-6 space-y-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t('budget.simpleTotalBudget', 'Total budget')}</p>
              <p className="text-3xl font-bold">{formatCurrency(projectBudget, currency)}</p>
            </div>
            <p className="text-lg font-semibold text-muted-foreground">{spentPercent}%</p>
          </div>
          <Progress value={spentPercent} className="h-3" />
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div>
              <p className="text-sm text-muted-foreground">{t('budget.simpleSpent', 'Spent')}</p>
              <p className="text-xl font-semibold">{formatCurrency(totalSpent, currency)}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">{t('budget.simpleRemaining', 'Remaining')}</p>
              <p className={`text-xl font-semibold ${remaining < 0 ? "text-destructive" : ""}`}>
                {formatCurrency(remaining, currency)}
              </p>
            </div>
          </div>
        </div>

        {(taskTotal > 0 || materialTotal > 0) && (
          <div className="rounded-xl border bg-card p-6 space-y-3">
            <p className="text-sm font-medium text-muted-foreground">{t('budget.simpleBreakdown', 'Breakdown')}</p>
            {taskTotal > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm">{t('budget.simpleTasks', 'Work & services')}</span>
                <span className="font-medium">{formatCurrency(taskTotal, currency)}</span>
              </div>
            )}
            {materialTotal > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm">{t('budget.simpleMaterials', 'Materials & purchases')}</span>
                <span className="font-medium">{formatCurrency(materialTotal, currency)}</span>
              </div>
            )}
            {extraTotal > 0 && (
              <>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{t('budget.simpleExtra', 'Outside budget')}</span>
                  <span className="font-medium text-muted-foreground">{formatCurrency(extraTotal, currency)}</span>
                </div>
              </>
            )}
          </div>
        )}

        {rows.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <p>{t('budget.simpleEmpty', 'No budget items yet. Your project manager will add costs as work progresses.')}</p>
          </div>
        )}
      </div>
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
              <BuilderSummaryCards projectId={projectId} currency={currency} onCreateInvoice={() => setInvoiceMethodOpen(true)} />
            </div>
          </>
        ) : (
          <div className="mb-6">
            <HomeownerBudgetView projectId={projectId} currency={currency} />
          </div>
        )
      )}

      {/* Filters */}
      <div className="flex flex-row flex-wrap items-end gap-2 md:gap-4 mb-4">
        <div className={`transition-all duration-200 ${searchQuery || searchExpanded ? "min-w-[140px] max-w-[200px]" : "w-8"}`}>
          {searchQuery || searchExpanded ? (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="budget-search"
                autoFocus
                placeholder={t('budget.filterByName')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onBlur={() => { if (!searchQuery) setSearchExpanded(false); }}
                className="pl-9 h-8"
              />
            </div>
          ) : (
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setSearchExpanded(true)}
              title={t('budget.filterByName')}
            >
              <Search className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="w-[130px]">
          <Select value={filterType} onValueChange={(v) => setFilterType(v as "all" | "task" | "material" | "purchase")}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('budget.allTypes')}</SelectItem>
              <SelectItem value="task">{t('budget.tasks')}</SelectItem>
              <SelectItem value="material">{t('budget.materials')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Status filter - multiselect */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-8 gap-1.5 text-sm font-normal">
              {filterStatuses.size === 0
                ? t('budget.status', 'Status')
                : filterStatuses.size === 1
                  ? t(`statuses.${budgetStatusKey([...filterStatuses][0])}`, t(`materialStatuses.${[...filterStatuses][0]}`, [...filterStatuses][0]))
                  : `${filterStatuses.size} ${t('budget.statusesSelected', 'valda')}`}
              <ChevronDown className="h-3.5 w-3.5 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-2" align="start">
            {filterStatuses.size > 0 && (
              <Button variant="ghost" size="sm" className="w-full justify-start text-xs mb-1" onClick={() => setFilterStatuses(new Set())}>
                {t('budget.clearFilter', 'Rensa filter')}
              </Button>
            )}
            {distinctStatuses.task.length > 0 && (
              <>
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{t('budget.task')}</div>
                {distinctStatuses.task.map((s) => (
                  <label key={`task-${s}`} className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer">
                    <Checkbox
                      checked={filterStatuses.has(s)}
                      onCheckedChange={(checked) => {
                        const next = new Set(filterStatuses);
                        checked ? next.add(s) : next.delete(s);
                        setFilterStatuses(next);
                      }}
                    />
                    <span className="text-sm">{t(`statuses.${budgetStatusKey(s)}`, s)}</span>
                  </label>
                ))}
              </>
            )}
            {distinctStatuses.material.length > 0 && (
              <>
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{t('budget.material')}</div>
                {distinctStatuses.material.map((s) => (
                  <label key={`mat-${s}`} className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer">
                    <Checkbox
                      checked={filterStatuses.has(s)}
                      onCheckedChange={(checked) => {
                        const next = new Set(filterStatuses);
                        checked ? next.add(s) : next.delete(s);
                        setFilterStatuses(next);
                      }}
                    />
                    <span className="text-sm">{t(`materialStatuses.${s}`, s)}</span>
                  </label>
                ))}
              </>
            )}
          </PopoverContent>
        </Popover>

        {/* Secondary controls — visible on desktop, hidden on mobile */}
        <Button
          variant={hasAdvancedFilter ? "default" : "outline"}
          size="icon"
          className="h-8 w-8 hidden sm:flex"
          onClick={() => setShowAdvancedFilters((prev) => !prev)}
          title={t('budget.advancedFilter')}
        >
          <SlidersHorizontal className="h-4 w-4" />
        </Button>

        <ColumnToggle
          columns={effectiveExtraKeys}
          labels={Object.fromEntries(ALL_COLUMNS.map(c => [c.key, c.label])) as Record<string, string>}
          visible={visibleExtras}
          onChange={(vis) => {
            for (const key of effectiveExtraKeys) {
              if (vis.has(key) !== visibleExtras.has(key)) toggleExtraColumn(key);
            }
          }}
          trigger={
            <Button variant="outline" size="icon" className="h-8 w-8 hidden sm:flex" title={t('budget.columns')}>
              <Columns3 className="h-4 w-4" />
            </Button>
          }
        />

        {/* Evidence summary — clickable popover listing unverified items */}
        {(() => {
          const applicable = filtered.filter((r) => r.evidenceStatus && r.evidenceStatus !== "na");
          if (applicable.length === 0) return null;
          const verified = applicable.filter((r) => r.evidenceStatus === "verified").length;
          const missing = applicable.filter((r) => r.evidenceStatus === "missing").length;
          const unverified = applicable.filter((r) => r.evidenceStatus !== "verified");
          return (
            <Popover>
              <PopoverTrigger asChild>
                <button className={cn("text-xs tabular-nums px-2 py-1 rounded-md border hidden sm:inline-flex cursor-pointer hover:opacity-80 transition-opacity", missing > 0 ? "border-amber-300 text-amber-700 bg-amber-50" : "border-green-300 text-green-700 bg-green-50")}>
                  {verified}/{applicable.length} {t("evidence.summaryLabel")}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0">
                <div className="px-3 py-2.5 border-b">
                  <h4 className="text-sm font-semibold">{t("evidence.popoverTitle", "Verifieringsstatus")}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {missing > 0
                      ? t("evidence.popoverMissing", "{{count}} poster saknar underlag", { count: unverified.length })
                      : t("evidence.popoverAllGood", "Alla poster har underlag")}
                  </p>
                </div>
                {unverified.length > 0 && (
                  <div className="max-h-64 overflow-y-auto p-1.5 space-y-0.5">
                    {unverified.map((row) => (
                      <button
                        key={row.id}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md hover:bg-muted transition-colors text-left"
                        onClick={() => {
                          const el = document.getElementById(`budget-row-${row.id}`);
                          if (el) {
                            el.scrollIntoView({ behavior: "smooth", block: "center" });
                            el.classList.add("ring-2", "ring-amber-400");
                            setTimeout(() => el.classList.remove("ring-2", "ring-amber-400"), 2000);
                          }
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{row.name}</p>
                          <p className="text-xs text-muted-foreground capitalize">{t(`budget.${row.type === "task" ? "tasks" : "materials"}`)}</p>
                        </div>
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded border", row.evidenceStatus === "missing" ? "border-amber-300 text-amber-700 bg-amber-50" : "border-border text-muted-foreground")}>
                          {t(`evidence.${row.evidenceStatus}`, row.evidenceStatus)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </PopoverContent>
            </Popover>
          );
        })()}

        <Button
          variant={compactRows ? "default" : "outline"}
          size="icon"
          className="h-8 w-8 hidden sm:flex"
          onClick={() => setCompactRows((prev) => !prev)}
          title={t('budget.compactRows', 'Compact rows')}
        >
          <Rows3 className="h-4 w-4" />
        </Button>

        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 hidden sm:flex"
          onClick={() => setIsFullscreen((prev) => !prev)}
          title={t('budget.fullscreen', 'Fullscreen')}
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>

        {/* Mobile overflow menu — contains all secondary controls */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" className="h-8 w-8 sm:hidden">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-1" align="end">
            <button
              type="button"
              className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent text-left"
              onClick={() => setShowAdvancedFilters((prev) => !prev)}
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
              {t('budget.advancedFilter')}
            </button>
            <button
              type="button"
              className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent text-left"
              onClick={() => setCompactRows((prev) => !prev)}
            >
              <Rows3 className="h-3.5 w-3.5 text-muted-foreground" />
              {t('budget.compactRows', 'Kompakt')}
            </button>
          </PopoverContent>
        </Popover>

        {/* Group by */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant={groupBy !== "none" ? "default" : "outline"}
              size="icon"
              className="h-8 w-8"
              title={t("budget.groupNone")}
            >
              <Layers className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48" align="end">
            <div className="space-y-1">
              <p className="text-sm font-medium mb-2">{t("budget.groupBy", "Group by")}</p>
              {(["none", "room", "costCenter", "status"] as GroupByOption[]).map((opt) => (
                <label
                  key={opt}
                  className={`flex items-center gap-2 text-sm cursor-pointer rounded-md px-2 py-1.5 hover:bg-accent ${groupBy === opt ? "bg-accent font-medium" : ""}`}
                  onClick={() => handleGroupByChange(opt)}
                >
                  {opt === "none" && t("budget.groupNone")}
                  {opt === "room" && t("budget.groupByRoom")}
                  {opt === "costCenter" && t("budget.groupByCostCenter")}
                  {opt === "status" && t("budget.groupByStatus")}
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {(searchQuery || filterType !== "all" || hasAdvancedFilter) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAllFilters}
          >
            {t('budget.clearFilters')}
          </Button>
        )}
      </div>

      {/* Advanced Filters Row */}
      {showAdvancedFilters && (
        <div className="flex flex-wrap items-end gap-4 mb-4 p-4 bg-muted/30 rounded-lg border">
          {distinctRooms.length > 0 && (
            <div className="w-[160px]">
              <Label className="text-sm mb-1.5 block">{t('budget.room')}</Label>
              <Select value={filterRoom} onValueChange={setFilterRoom}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('budget.allRooms')}</SelectItem>
                  {distinctRooms.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {distinctAssignees.length > 0 && (
            <div className="w-[160px]">
              <Label className="text-sm mb-1.5 block">{t('budget.assignee')}</Label>
              <Select value={filterAssignee} onValueChange={setFilterAssignee}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('budget.allAssignees')}</SelectItem>
                  {distinctAssignees.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {distinctCostCenters.length > 0 && (
            <div className="w-[160px]">
              <Label className="text-sm mb-1.5 block">{t('budget.costCenter')}</Label>
              <Select value={filterCostCenter} onValueChange={setFilterCostCenter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('budget.all')}</SelectItem>
                  {distinctCostCenters.map((cc) => (
                    <SelectItem key={cc} value={cc}>{cc}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="w-[160px]">
            <Label className="text-sm mb-1.5 block">{t('budget.startDateFrom')}</Label>
            <Input
              type="date"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
            />
          </div>
          <div className="w-[160px]">
            <Label className="text-sm mb-1.5 block">{t('budget.finishDateTo')}</Label>
            <Input
              type="date"
              value={filterFinishDate}
              onChange={(e) => setFilterFinishDate(e.target.value)}
            />
          </div>
          <div className="w-[160px]">
            <Label className="text-sm mb-1.5 block">{t('budget.filterAttachment')}</Label>
            <Select value={filterAttachment} onValueChange={(v) => setFilterAttachment(v as "all" | "has" | "missing")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('budget.allAttachments')}</SelectItem>
                <SelectItem value="has">
                  <span className="flex items-center gap-1.5">
                    <Paperclip className="h-3 w-3" />
                    {t('budget.hasAttachment')}
                  </span>
                </SelectItem>
                <SelectItem value="missing">{t('budget.missingAttachment')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Table Section */}
      <div className="mt-6 mb-2 flex items-center justify-between">
        <span className="text-xs text-muted-foreground md:hidden flex items-center gap-1">
          ← {t('budget.swipeToSeeMore', 'Svep för mer')} →
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground/60 mb-1 text-right">
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
                      {renderCell(col, row)}
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
                    {renderFooterCell(col)}
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

      {isBuilder && (
        <InvoiceMethodDialog
          projectId={projectId}
          open={invoiceMethodOpen}
          onOpenChange={setInvoiceMethodOpen}
        />
      )}

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
    </div>
  );
};

export default BudgetTab;

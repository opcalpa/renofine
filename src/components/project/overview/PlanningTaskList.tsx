import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useTaxDeductionVisible } from "@/hooks/useTaxDeduction";
import { supabase } from "@/integrations/supabase/client";
import { TASK_CATEGORY_LABELS, TaskCategory } from "@/services/aiDocumentService.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Plus, ClipboardList, ArrowRight, Play, Pencil, Trash2, Columns3, Lock, Unlock, Info, Sparkles, Loader2, CheckCircle2, AlertTriangle, FileUp, ChevronRight, ChevronDown, ShoppingCart, Package, Wrench, Link2, MoreVertical, Paperclip, Hammer, Handshake } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AddMaterialDialog } from "./AddMaterialDialog";
import { MaterialFileAttachment } from "./MaterialFileAttachment";
import { UploadFileDialog, useUploadFileDialog } from "./UploadFileDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCurrency } from "@/lib/currency";
import { useToast } from "@/hooks/use-toast";
import { TaskEditDialog } from "../TaskEditDialog";
import { PlanningSmartImportDialog } from "./PlanningSmartImportDialog";
import {
  suggestMaterials,
  detectRecipeKey,
  detectWorkType,
  estimateTaskMultiRoom,
  parseEstimationSettings,
  ALL_WORK_TYPES,
  WORK_TYPE_LABEL_KEYS,
  type WorkType,
  type RecipeEstimationSettings,
  type RecipeRoom,
} from "@/lib/materialRecipes";

interface PlanningTask {
  id: string;
  title: string;
  description: string | null;
  budget: number | null;
  room_id: string | null;
  room_ids: string[] | null;
  room_name: string | null;
  room_names: string[];
  status: string;
  task_cost_type: string | null;
  estimated_hours: number | null;
  hourly_rate: number | null;
  subcontractor_cost: number | null;
  markup_percent: number | null;
  material_estimate: number | null;
  material_markup_percent: number | null;
  material_items: { amount: number; markup_percent: number | null; quantity?: number; unit?: string; unit_price?: number }[] | null;
  labor_cost_percent: number | null;
  cost_center: string | null;
  rot_amount: number | null;
  rot_eligible: boolean | null;
}

interface Room {
  id: string;
  name: string;
  dimensions: RecipeRoom["dimensions"];
  ceiling_height_mm: number | null;
}

interface PlanningMaterial {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  price_per_unit: number | null;
  price_total: number | null;
  markup_percent: number | null;
  task_id: string | null;
  room_id: string | null;
  status: string;
  vendor_name: string | null;
  kind: "material" | "subcontractor";
}

type ExtraColumnKey = "hours" | "hourlyRate" | "room" | "costType" | "profit" | "description" | "markup" | "rotAmount" | "budget" | "materialEstimate";

interface ExtraColumnDef {
  key: ExtraColumnKey;
  labelKey: string;
  defaultOn: boolean;
  /** Only visible for builders (hidden from homeowners) */
  builderOnly?: boolean;
  /** Only visible for homeowners (hidden from builders) */
  homeownerOnly?: boolean;
}

const EXTRA_COLUMNS: ExtraColumnDef[] = [
  { key: "description", labelKey: "tasks.description", defaultOn: false },
  { key: "room", labelKey: "planningTasks.room", defaultOn: true },
  { key: "hours", labelKey: "planningTasks.hoursQty", defaultOn: true, builderOnly: true },
  { key: "hourlyRate", labelKey: "planningTasks.rateUnitPrice", defaultOn: true, builderOnly: true },
  { key: "costType", labelKey: "planningTasks.costType", defaultOn: false, builderOnly: true },
  { key: "markup", labelKey: "planningTasks.markup", defaultOn: false, builderOnly: true },
  { key: "profit", labelKey: "taskCost.result", defaultOn: true, builderOnly: true },
  { key: "rotAmount", labelKey: "files.rotAmount", defaultOn: false },
  { key: "budget", labelKey: "planningTasks.budget", defaultOn: false, homeownerOnly: true },
  { key: "materialEstimate", labelKey: "planningTasks.materialEstimate", defaultOn: false },
];

function getDefaultExtras(isHomeowner: boolean): Set<ExtraColumnKey> {
  return new Set(
    EXTRA_COLUMNS
      .filter((c) => c.defaultOn && !(isHomeowner && c.builderOnly) && !(!isHomeowner && c.homeownerOnly))
      .map((c) => c.key)
  );
}

function getAvailableColumns(isHomeowner: boolean): ExtraColumnDef[] {
  return EXTRA_COLUMNS.filter((c) => !(isHomeowner && c.builderOnly) && !(!isHomeowner && c.homeownerOnly));
}

interface PlanningTaskListProps {
  projectId: string;
  currency?: string | null;
  isHomeowner?: boolean;
  onNavigateToTasks?: (taskId?: string) => void;
  onCreateQuote?: () => void;
  onActivateProject?: () => void;
  locked?: boolean;
  roomsVersion?: number;
}

function MaterialKindIcon({
  kind,
  editable,
  onChangeKind,
  size = "sm",
}: {
  kind: "material" | "subcontractor";
  editable: boolean;
  onChangeKind: (kind: "material" | "subcontractor") => void;
  size?: "sm" | "xs";
}) {
  const { t } = useTranslation();
  const iconCls = size === "xs" ? "h-3 w-3" : "h-3.5 w-3.5";
  const icon =
    kind === "subcontractor" ? (
      <Handshake className={`${iconCls} text-muted-foreground shrink-0`} />
    ) : (
      <ShoppingCart className={`${iconCls} text-muted-foreground shrink-0`} />
    );

  if (!editable) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{icon}</TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">
              {kind === "subcontractor"
                ? t("planningTasks.typeSubcontractor")
                : t("planningTasks.typeMaterial")}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="rounded p-0.5 hover:bg-muted transition-colors">{icon}</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuItem
          className="gap-2"
          onClick={() => onChangeKind("material")}
        >
          <ShoppingCart className="h-3.5 w-3.5" />
          {t("planningTasks.typeMaterial")}
          {kind === "material" && <span className="ml-auto text-xs text-muted-foreground">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2"
          onClick={() => onChangeKind("subcontractor")}
        >
          <Handshake className="h-3.5 w-3.5" />
          {t("planningTasks.typeSubcontractor")}
          {kind === "subcontractor" && <span className="ml-auto text-xs text-muted-foreground">✓</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PlanningTaskList({
  projectId,
  currency,
  isHomeowner = false,
  onNavigateToTasks,
  onCreateQuote,
  onActivateProject,
  locked = false,
  roomsVersion = 0,
}: PlanningTaskListProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { showTaxDeduction } = useTaxDeductionVisible();
  const [confirmActivate, setConfirmActivate] = useState(false);
  const [activating, setActivating] = useState(false);
  const [tasks, setTasks] = useState<PlanningTask[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomMap, setRoomMap] = useState<Map<string, Room>>(new Map());
  const [loading, setLoading] = useState(true);
  const [profileLaborCostPercent, setProfileLaborCostPercent] = useState<number | null>(null);
  const [estimationSettings, setEstimationSettings] = useState<RecipeEstimationSettings | null>(null);

  // Local override: user chose to unlock editing despite active quote
  const [lockOverridden, setLockOverridden] = useState(false);
  const effectiveLock = locked && !lockOverridden;

  const handleActivateProject = useCallback(async () => {
    setActivating(true);
    try {
      const { error } = await supabase
        .from("projects")
        .update({ status: "active" })
        .eq("id", projectId);
      if (error) throw error;

      // Transition planned tasks to to_do so they appear in kanban
      const { data: plannedTasks } = await supabase
        .from("tasks")
        .select("id, title, material_estimate, material_items")
        .eq("project_id", projectId)
        .eq("status", "planned");

      // Get auth user for created_by
      const { data: authData } = await supabase.auth.getUser();
      const { data: profileRow } = authData?.user
        ? await supabase.from("profiles").select("id").eq("user_id", authData.user.id).single()
        : { data: null };
      const creatorId = profileRow?.id ?? null;

      if (plannedTasks && plannedTasks.length > 0) {
        await supabase
          .from("tasks")
          .update({ status: "to_do" })
          .in("id", plannedTasks.map((t) => t.id));

        // Create planned material rows for tasks with material_estimate but no existing planned materials
        const { data: existingMats } = await supabase
          .from("materials")
          .select("task_id, description")
          .eq("project_id", projectId)
          .eq("status", "planned")
          .not("task_id", "is", null);
        const tasksWithPlannedMat = new Set(
          (existingMats || []).filter((m) => m.description !== "__subcontractor__").map((m) => m.task_id)
        );

        const materialsToInsert: Record<string, unknown>[] = [];
        for (const task of plannedTasks) {
          if (tasksWithPlannedMat.has(task.id)) continue;
          const items = task.material_items as { amount: number; quantity?: number; unit?: string; unit_price?: number }[] | null;
          if (items && items.length > 0) {
            for (const item of items) {
              if (!item.amount || item.amount <= 0) continue;
              materialsToInsert.push({
                id: crypto.randomUUID(),
                name: `${task.title} — material`,
                quantity: item.quantity ?? 1,
                unit: item.unit ?? "st",
                price_per_unit: item.unit_price ?? item.amount,
                price_total: item.amount,
                task_id: task.id,
                project_id: projectId,
                status: "planned",
                exclude_from_budget: false,
                created_by_user_id: creatorId,
              });
            }
          } else if (task.material_estimate && task.material_estimate > 0) {
            materialsToInsert.push({
              id: crypto.randomUUID(),
              name: `${task.title} — material`,
              quantity: 1,
              unit: "st",
              price_per_unit: task.material_estimate,
              price_total: task.material_estimate,
              task_id: task.id,
              project_id: projectId,
              status: "planned",
              exclude_from_budget: false,
              created_by_user_id: creatorId,
            });
          }
        }
        if (materialsToInsert.length > 0) {
          await supabase.from("materials").insert(materialsToInsert);
        }
      }

      // Convert UE (subcontractor) material rows into proper task cards
      const { data: ueMaterials } = await supabase
        .from("materials")
        .select("id, name, task_id, price_total, markup_percent, room_id")
        .eq("project_id", projectId)
        .eq("status", "planned")
        .eq("description", "__subcontractor__");

      if (ueMaterials && ueMaterials.length > 0) {
        // Task-linked UE: merge cost into task's subcontractor_cost
        const taskLinked = ueMaterials.filter((m) => m.task_id);
        const costByTask = new Map<string, number>();
        for (const m of taskLinked) {
          const amount = (m.price_total || 0) * (1 + (m.markup_percent || 0) / 100);
          costByTask.set(m.task_id!, (costByTask.get(m.task_id!) || 0) + amount);
        }
        for (const [taskId, cost] of costByTask) {
          await supabase
            .from("tasks")
            .update({ subcontractor_cost: cost, task_cost_type: "subcontractor" })
            .eq("id", taskId);
        }

        // Standalone UE (no task_id): create new task cards
        const standalone = ueMaterials.filter((m) => !m.task_id);
        if (standalone.length > 0) {
          const newTasks = standalone.map((m) => ({
            id: crypto.randomUUID(),
            project_id: projectId,
            title: m.name,
            status: "to_do",
            priority: "medium",
            task_cost_type: "subcontractor",
            subcontractor_cost: (m.price_total || 0) * (1 + (m.markup_percent || 0) / 100),
            room_id: m.room_id ?? null,
            created_by_user_id: creatorId,
          }));
          await supabase.from("tasks").insert(newTasks);
        }

        // Delete all UE sentinel rows — their data is now on tasks
        await supabase
          .from("materials")
          .delete()
          .in("id", ueMaterials.map((m) => m.id));
      }

      toast({ description: t("homeownerPlanning.projectActivated", "Project activated!") });
      onActivateProject?.();
    } catch {
      toast({ variant: "destructive", description: t("common.errorSaving", "Could not save") });
    } finally {
      setActivating(false);
      setConfirmActivate(false);
    }
  }, [projectId, toast, t, onActivateProject]);

  // Inline add state — auto-open when list is empty
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const autoOpenedRef = useRef(false);
  const [addingLoading, setAddingLoading] = useState(false);

  // Auto-open add row when task list is empty
  useEffect(() => {
    if (!loading && tasks.length === 0 && !effectiveLock && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      setIsAdding(true);
    }
  }, [loading, tasks.length, effectiveLock]);

  // Edit dialog state
  const [editTaskId, setEditTaskId] = useState<string | null>(null);

  // Smart import dialog state
  const [smartImportOpen, setSmartImportOpen] = useState(false);

  // Unified upload dialog
  const uploadDialog = useUploadFileDialog();

  // Inline cell editing state
  const [editingCell, setEditingCell] = useState<{
    taskId: string;
    field: "estimated_hours" | "hourly_rate" | "budget" | "description" | "room_id";
  } | {
    taskId: string;
    field: "mat_quantity" | "mat_price_per_unit" | "mat_markup_percent" | "mat_price_total" | "mat_room_id";
    materialId: string;
  } | null>(null);
  const [editValue, setEditValue] = useState("");

  // Inline new room creation
  const [newRoomName, setNewRoomName] = useState("");

  // Column visibility — homeowners get a filtered set
  const availableColumns = getAvailableColumns(isHomeowner);
  const [visibleExtras, setVisibleExtras] = useState<Set<ExtraColumnKey>>(
    () => getDefaultExtras(isHomeowner)
  );

  const toggleColumn = (key: ExtraColumnKey) => {
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

  const show = useMemo(
    () => ({
      description: visibleExtras.has("description"),
      hours: visibleExtras.has("hours"),
      hourlyRate: visibleExtras.has("hourlyRate"),
      room: visibleExtras.has("room"),
      costType: visibleExtras.has("costType"),
      markup: visibleExtras.has("markup"),
      profit: visibleExtras.has("profit"),
      rotAmount: visibleExtras.has("rotAmount"),
      budget: visibleExtras.has("budget"),
      materialEstimate: visibleExtras.has("materialEstimate"),
    }),
    [visibleExtras]
  );

  const extraCount = visibleExtras.size;

  // Category grouping state
  const [groupByCategory, setGroupByCategory] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Material/UE sub-rows state
  const [materials, setMaterials] = useState<PlanningMaterial[]>([]);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [addMaterialOpen, setAddMaterialOpen] = useState(false);
  const [addMaterialKind, setAddMaterialKind] = useState<"material" | "subcontractor">("material");

  // Auto-show columns that have data
  useEffect(() => {
    if (tasks.length === 0 && materials.length === 0) return;
    const autoShow = new Set<ExtraColumnKey>();
    if (tasks.some((t) => t.estimated_hours && t.estimated_hours > 0)) autoShow.add("hours");
    if (tasks.some((t) => t.hourly_rate && t.hourly_rate > 0)) autoShow.add("hourlyRate");
    if (tasks.some((t) => t.room_names.length > 0) || materials.some((m) => m.room_id)) autoShow.add("room");
    if (tasks.some((t) => {
      const hasLabor = !!(t.estimated_hours && t.hourly_rate);
      const hasMat = materials.some((m) => m.task_id === t.id) || !!(t.material_estimate && t.material_estimate > 0);
      const hasUe = !!t.subcontractor_cost;
      return (hasLabor ? 1 : 0) + (hasMat ? 1 : 0) + (hasUe ? 1 : 0) > 1;
    })) autoShow.add("costType");
    if (tasks.some((t) =>
      (t.material_markup_percent && t.material_markup_percent > 0)
      || (t.markup_percent && t.markup_percent > 0)
      || (t.material_items || []).some((i) => i.markup_percent && i.markup_percent > 0)
    ) || materials.some((m) => m.markup_percent && m.markup_percent > 0)) autoShow.add("markup");
    if (tasks.some((t) => t.rot_amount && t.rot_amount > 0)) autoShow.add("rotAmount");
    if (tasks.some((t) => t.material_estimate && t.material_estimate > 0)) autoShow.add("materialEstimate");
    if (tasks.some((t) => {
      const labor = (t.estimated_hours || 0) * (t.hourly_rate || 0);
      return labor > 0 || (t.markup_percent && t.markup_percent > 0) || (t.material_markup_percent && t.material_markup_percent > 0);
    })) autoShow.add("profit");

    setVisibleExtras((prev) => {
      const available = new Set(availableColumns.map((c) => c.key));
      const merged = new Set(prev);
      let changed = false;
      autoShow.forEach((key) => {
        if (available.has(key) && !merged.has(key)) {
          merged.add(key);
          changed = true;
        }
      });
      return changed ? merged : prev;
    });
  }, [tasks, materials, availableColumns]);

  // Auto-expand sub-rows for tasks that have materials
  useEffect(() => {
    const tasksWithMaterials = new Set(
      materials.filter(m => m.task_id).map(m => m.task_id!)
    );
    if (tasksWithMaterials.size > 0) {
      setExpandedTasks(prev => {
        // Only auto-expand on first load, not on every material change
        if (prev.size === 0) return tasksWithMaterials;
        return prev;
      });
    }
  }, [materials]);

  // Auto-show markup column when material/UE rows exist
  useEffect(() => {
    if (materials.length > 0 && !isHomeowner) {
      setVisibleExtras((prev) => {
        if (prev.has("markup")) return prev;
        const next = new Set(prev);
        next.add("markup");
        return next;
      });
    }
  }, [materials.length, isHomeowner]);

  // Row drag-reorder state
  const dragItem = React.useRef<{ type: "task" | "material"; id: string; index: number } | null>(null);
  const [dragOverTarget, setDragOverTarget] = React.useState<{ type: "task" | "material"; id: string; position: "above" | "below" } | null>(null);
  const [isDraggingMaterial, setIsDraggingMaterial] = useState(false);
  const [unlinkDropHover, setUnlinkDropHover] = useState(false);

  const toggleTaskExpand = useCallback((taskId: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);

  // Group materials by task
  const materialsByTask = useMemo(() => {
    const map = new Map<string, PlanningMaterial[]>();
    const standalone: PlanningMaterial[] = [];
    for (const m of materials) {
      if (m.task_id) {
        const list = map.get(m.task_id) || [];
        list.push(m);
        map.set(m.task_id, list);
      } else {
        standalone.push(m);
      }
    }
    return { byTask: map, standalone };
  }, [materials]);

  // Unified display order: tasks, standalone materials, and group headers
  type DisplayItem = { type: "task"; id: string } | { type: "standalone"; id: string } | { type: "groupHeader"; category: string; count: number; budget: number };
  const [displayOrder, setDisplayOrder] = useState<DisplayItem[]>([]);

  // Rebuild display order when tasks/materials change, preserving existing order
  useEffect(() => {
    setDisplayOrder((prev) => {
      const taskIds = new Set(tasks.map((t) => t.id));
      const standaloneIds = new Set(materialsByTask.standalone.map((m) => m.id));

      // Keep existing items that still exist
      const kept = prev.filter(
        (item) =>
          (item.type === "task" && taskIds.has(item.id)) ||
          (item.type === "standalone" && standaloneIds.has(item.id))
      );
      const keptIds = new Set(kept.map((item) => item.id));

      // Append new items not in previous order
      const newItems: DisplayItem[] = [];
      for (const t of tasks) {
        if (!keptIds.has(t.id)) newItems.push({ type: "task", id: t.id });
      }
      for (const m of materialsByTask.standalone) {
        if (!keptIds.has(m.id)) newItems.push({ type: "standalone", id: m.id });
      }

      return [...kept, ...newItems];
    });
  }, [tasks, materialsByTask.standalone]);

  // When grouping by category, sort by cost_center and inject group headers
  const effectiveDisplayOrder = useMemo((): DisplayItem[] => {
    if (!groupByCategory) return displayOrder;

    // Sort tasks by category, keep standalone at the end
    const taskItems = displayOrder.filter((d) => d.type === "task");
    const standaloneItems = displayOrder.filter((d) => d.type === "standalone");

    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    taskItems.sort((a, b) => {
      const catA = taskMap.get(a.id)?.cost_center || "ovrigt";
      const catB = taskMap.get(b.id)?.cost_center || "ovrigt";
      return catA.localeCompare(catB, "sv");
    });

    // Insert group headers
    const result: DisplayItem[] = [];
    let lastCategory = "";
    for (const item of taskItems) {
      const task = taskMap.get(item.id);
      const category = task?.cost_center || "ovrigt";
      if (category !== lastCategory) {
        const groupTasks = tasks.filter((t) => (t.cost_center || "ovrigt") === category);
        result.push({
          type: "groupHeader",
          category,
          count: groupTasks.length,
          budget: groupTasks.reduce((sum, t) => sum + (t.budget || 0), 0),
        });
        lastCategory = category;
      }
      result.push(item);
    }

    // Standalone materials at the end (under "Material" header if any)
    if (standaloneItems.length > 0) {
      result.push({
        type: "groupHeader",
        category: "__standalone__",
        count: standaloneItems.length,
        budget: materialsByTask.standalone.reduce((sum, m) => sum + (m.price_total || 0), 0),
      });
      result.push(...standaloneItems);
    }

    return result;
  }, [groupByCategory, displayOrder, tasks, materialsByTask.standalone]);

  const fetchProfileCostPercent = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("default_labor_cost_percent, estimation_settings")
        .eq("user_id", user.id)
        .single();
      setProfileLaborCostPercent(data?.default_labor_cost_percent ?? null);
      if (data?.estimation_settings) {
        setEstimationSettings(
          parseEstimationSettings(data.estimation_settings as Record<string, unknown>)
        );
      }
    } catch {
      // Non-critical
    }
  }, []);

  const fetchData = useCallback(async () => {
    const [tasksRes, roomsRes, plannedMatsRes] = await Promise.all([
      supabase
        .from("tasks")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true }),
      supabase
        .from("rooms")
        .select("id, name, dimensions, ceiling_height_mm")
        .eq("project_id", projectId),
      supabase
        .from("materials")
        .select("id, name, quantity, unit, price_per_unit, price_total, markup_percent, task_id, room_id, status, vendor_name, description")
        .eq("project_id", projectId),
    ]);

    const fetchedRooms = (roomsRes.data || []) as Room[];
    const nameMap = new Map(fetchedRooms.map((r) => [r.id, r.name]));
    const fullRoomMap = new Map(fetchedRooms.map((r) => [r.id, r]));
    setRooms(fetchedRooms);
    setRoomMap(fullRoomMap);

    // Build planned materials map per task
    const allMats = plannedMatsRes.data || [];
    const plannedByTask = new Map<string, NonNullable<PlanningTask["material_items"]>>();
    for (const m of allMats) {
      if (!m.task_id) continue;
      const items = plannedByTask.get(m.task_id) || [];
      items.push({
        amount: m.price_total ?? Math.round((m.quantity || 0) * (m.price_per_unit || 0)),
        markup_percent: m.markup_percent ?? null,
        quantity: m.quantity ?? undefined,
        unit: m.unit ?? undefined,
        unit_price: m.price_per_unit ?? undefined,
      });
      plannedByTask.set(m.task_id, items);
    }

    // Store all materials for sub-row display
    setMaterials(
      allMats.map((m) => ({
        id: m.id,
        name: m.name,
        quantity: m.quantity,
        unit: m.unit,
        price_per_unit: m.price_per_unit,
        price_total: m.price_total,
        markup_percent: m.markup_percent,
        task_id: m.task_id,
        room_id: m.room_id ?? null,
        status: m.status,
        vendor_name: m.vendor_name,
        kind: (m.description === "__subcontractor__" ? "subcontractor" : "material") as "material" | "subcontractor",
      }))
    );

    setTasks(
      (tasksRes.data || []).map((task) => {
        // Prefer planned materials from materials table over legacy JSONB
        const planned = plannedByTask.get(task.id);
        // Build room_ids — prefer array field, fall back to single room_id
        const ids: string[] = (task.room_ids && task.room_ids.length > 0)
          ? task.room_ids
          : task.room_id ? [task.room_id] : [];
        return {
          ...task,
          room_id: ids[0] || null,
          room_ids: ids,
          room_name: ids[0] ? nameMap.get(ids[0]) || null : null,
          room_names: ids.map((id: string) => nameMap.get(id) || "").filter(Boolean),
          material_items: planned && planned.length > 0 ? planned : task.material_items,
        };
      })
    );
    setLoading(false);
  }, [projectId]);

  const handleSaveMargin = useCallback(
    async (taskId: string, newCostPct: number) => {
      const { error } = await supabase
        .from("tasks")
        .update({ labor_cost_percent: newCostPct })
        .eq("id", taskId);
      if (error) {
        toast({ title: t("common.error"), description: error.message, variant: "destructive" });
      } else {
        fetchData();
      }
    },
    [fetchData, t, toast]
  );

  useEffect(() => {
    fetchData();
    fetchProfileCostPercent();
  }, [fetchData, fetchProfileCostPercent, roomsVersion]);

  const handleQuickAdd = async () => {
    const title = newTitle.trim();
    if (!title) return;

    setAddingLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, default_hourly_rate, default_labor_cost_percent")
        .eq("user_id", user.id)
        .single();

      if (!profile) return;

      const { error } = await supabase.from("tasks").insert({
        project_id: projectId,
        title,
        status: "planned",
        priority: "medium",
        created_by_user_id: profile.id,
        hourly_rate: profile.default_hourly_rate ?? null,
      });

      if (error) throw error;

      setNewTitle("");
      setIsAdding(false);
      fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : (err as { message?: string })?.message || String(err);
      toast({
        title: t("common.error"),
        description: message,
        variant: "destructive",
      });
    } finally {
      setAddingLoading(false);
    }
  };

  const handleInlineSave = useCallback(
    async (taskId: string, field: string, rawValue: string) => {
      const numValue = rawValue === "" ? null : parseFloat(rawValue);
      if (rawValue !== "" && isNaN(numValue as number)) {
        setEditingCell(null);
        return;
      }

      // Find the task to compute budget when in detail-calc mode
      const task = tasks.find((t) => t.id === taskId);
      const updates: Record<string, number | null> = { [field]: numValue };

      if (task) {
        // Determine effective values after this edit
        const hours = field === "estimated_hours" ? (numValue || 0) : (task.estimated_hours || 0);
        const rate = field === "hourly_rate" ? (numValue || 0) : (task.hourly_rate || 0);
        // Use linked materials sum if available, otherwise fall back to manual estimate
        const linkedMats = materialsByTask.byTask.get(taskId) || [];
        const linkedMatSum = linkedMats.length > 0
          ? linkedMats.reduce((sum, m) => sum + (m.price_total ?? Math.round((m.quantity || 0) * (m.price_per_unit || 0))), 0)
          : 0;
        const material = linkedMats.length > 0
          ? linkedMatSum
          : (task.material_estimate || 0);
        const hasDetailCalc = hours > 0 && rate > 0;

        if (field !== "budget" && hasDetailCalc) {
          const newBudget = (hours * rate) + material || null;
          // Notify user if a manually set price is being overridden
          if (task.budget && task.budget > 0 && newBudget !== task.budget) {
            const wasPreviouslyManual = !(task.estimated_hours && task.hourly_rate);
            if (wasPreviouslyManual) {
              toast({
                description: t("planningTasks.autoPriceEnabled", "Customer price is now auto-calculated from hours \u00d7 hourly rate"),
              });
            }
          }
          updates.budget = newBudget;
        }
      }

      const { error } = await supabase
        .from("tasks")
        .update(updates)
        .eq("id", taskId);

      if (error) {
        toast({
          title: t("common.error"),
          description: error.message,
          variant: "destructive",
        });
      } else {
        fetchData();
      }
      setEditingCell(null);
    },
    [fetchData, t, toast, tasks]
  );

  const handleInlineTextSave = useCallback(
    async (taskId: string, field: string, rawValue: string) => {
      const value = rawValue.trim() || null;
      const { error } = await supabase
        .from("tasks")
        .update({ [field]: value })
        .eq("id", taskId);

      if (error) {
        toast({
          title: t("common.error"),
          description: error.message,
          variant: "destructive",
        });
      } else {
        fetchData();
      }
      setEditingCell(null);
    },
    [fetchData, t, toast]
  );

  const handleRoomToggle = useCallback(
    async (taskId: string, roomId: string) => {
      const task = tasks.find((t) => t.id === taskId);
      const current = task?.room_ids || [];
      const next = current.includes(roomId)
        ? current.filter((id) => id !== roomId)
        : [...current, roomId];

      const { error } = await supabase
        .from("tasks")
        .update({ room_ids: next, room_id: next[0] || null })
        .eq("id", taskId);

      if (error) {
        toast({ title: t("common.error"), description: error.message, variant: "destructive" });
      } else {
        fetchData();
      }
    },
    [tasks, fetchData, t, toast]
  );

  const handleSelectAllRooms = useCallback(
    async (taskId: string) => {
      const allIds = rooms.map((r) => r.id);
      const { error } = await supabase
        .from("tasks")
        .update({ room_ids: allIds, room_id: allIds[0] || null })
        .eq("id", taskId);
      if (error) {
        toast({ title: t("common.error"), description: error.message, variant: "destructive" });
      } else {
        fetchData();
      }
    },
    [rooms, fetchData, t, toast]
  );

  const handleClearRooms = useCallback(
    async (taskId: string) => {
      const { error } = await supabase
        .from("tasks")
        .update({ room_ids: [], room_id: null })
        .eq("id", taskId);

      if (error) {
        toast({ title: t("common.error"), description: error.message, variant: "destructive" });
      } else {
        fetchData();
      }
      setEditingCell(null);
    },
    [fetchData, t, toast]
  );

  const handleCreateRoomAndAssign = useCallback(
    async (taskId: string, roomName: string) => {
      const name = roomName.trim();
      if (!name) return;

      const { data: room, error: createErr } = await supabase
        .from("rooms")
        .insert({ project_id: projectId, name })
        .select("id")
        .single();

      if (createErr || !room) {
        toast({
          title: t("common.error"),
          description: createErr?.message || "Failed to create room",
          variant: "destructive",
        });
        return;
      }

      await handleRoomToggle(taskId, room.id);
      setNewRoomName("");
    },
    [projectId, handleRoomToggle, t, toast]
  );

  const handleMaterialRoomChange = useCallback(
    async (materialId: string, roomId: string | null) => {
      const { error } = await supabase
        .from("materials")
        .update({ room_id: roomId })
        .eq("id", materialId);

      if (error) {
        toast({ title: t("common.error"), description: error.message, variant: "destructive" });
      } else {
        fetchData();
      }
      setEditingCell(null);
    },
    [fetchData, t, toast]
  );

  const handleDeleteTask = useCallback(
    async (taskId: string) => {
      const { error } = await supabase
        .from("tasks")
        .delete()
        .eq("id", taskId);

      if (error) {
        toast({
          title: t("common.error"),
          description: error.message,
          variant: "destructive",
        });
      } else {
        fetchData();
      }
    },
    [fetchData, t, toast]
  );

  // --- ROT helpers ---
  const ROT_PERCENT = 30;

  const calcRotAmount = (task: PlanningTask): number => {
    const laborCost = (task.estimated_hours || 0) * (task.hourly_rate || 0);
    if (laborCost <= 0) return 0;
    // ROT = 30% of labor inc moms (labor × 1.25 × 0.30)
    return Math.round(laborCost * 1.25 * ROT_PERCENT / 100);
  };

  const handleToggleRot = useCallback(
    async (taskId: string) => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;
      const isCurrentlyRot = task.rot_eligible;
      const rotAmount = isCurrentlyRot ? null : calcRotAmount(task);
      const { error } = await supabase
        .from("tasks")
        .update({ rot_eligible: !isCurrentlyRot, rot_amount: rotAmount })
        .eq("id", taskId);
      if (error) {
        toast({ title: t("common.error"), description: error.message, variant: "destructive" });
      } else {
        fetchData();
      }
    },
    [tasks, fetchData, t, toast]
  );

  const handleApplyRotToAll = useCallback(
    async () => {
      const laborTasks = tasks.filter((t) => {
        const labor = (t.estimated_hours || 0) * (t.hourly_rate || 0);
        return labor > 0;
      });
      if (laborTasks.length === 0) {
        toast({ description: t("planningTasks.noLaborTasksForRot", "Inga arbetsrader med timmar att applicera ROT på") });
        return;
      }
      const allHaveRot = laborTasks.every((t) => t.rot_eligible);
      const updates = laborTasks.map((task) => ({
        id: task.id,
        rot_eligible: !allHaveRot,
        rot_amount: allHaveRot ? null : calcRotAmount(task),
      }));
      for (const u of updates) {
        await supabase.from("tasks").update({ rot_eligible: u.rot_eligible, rot_amount: u.rot_amount }).eq("id", u.id);
      }
      fetchData();
      toast({
        description: allHaveRot
          ? t("planningTasks.rotRemovedAll", "ROT-avdrag borttaget från alla arbeten")
          : t("planningTasks.rotAppliedAll", "ROT-avdrag applicerat på {{count}} arbeten", { count: laborTasks.length }),
      });
    },
    [tasks, fetchData, t, toast]
  );

  // --- Material/UE handlers ---

  const handleAddMaterialSubmit = useCallback(
    async (data: {
      name: string;
      kind: "material" | "subcontractor";
      linkMode: "existing" | "create" | "none";
      existingTaskId?: string;
      newTaskTitle?: string;
      quantity?: number;
      priceTotal?: number;
      markupPercent?: number;
      file?: File;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, default_hourly_rate")
        .eq("user_id", user.id)
        .single();
      if (!profile) return;

      let taskId: string | null = null;

      if (data.linkMode === "existing" && data.existingTaskId) {
        taskId = data.existingTaskId;
      } else if (data.linkMode === "create" && data.newTaskTitle) {
        const { data: newTask, error: taskErr } = await supabase
          .from("tasks")
          .insert({
            project_id: projectId,
            title: data.newTaskTitle,
            status: "planned",
            priority: "medium",
            created_by_user_id: profile.id,
            hourly_rate: profile.default_hourly_rate ?? null,
          })
          .select("id")
          .single();

        if (taskErr || !newTask) {
          toast({ title: t("common.error"), description: taskErr?.message || "Failed", variant: "destructive" });
          return;
        }
        taskId = newTask.id;
      }

      const qty = data.quantity ?? 1;
      const unitPrice = data.priceTotal ?? 0;
      const { data: newMat, error } = await supabase.from("materials").insert({
        project_id: projectId,
        task_id: taskId,
        name: data.name,
        quantity: qty,
        unit: "st",
        price_per_unit: unitPrice,
        price_total: qty * unitPrice || null,
        status: "planned",
        created_by_user_id: profile.id,
        description: data.kind === "subcontractor" ? "__subcontractor__" : null,
        markup_percent: data.markupPercent ?? null,
      }).select("id").single();

      if (error || !newMat) {
        toast({ title: t("common.error"), description: error?.message || "Failed", variant: "destructive" });
        return;
      }

      // Upload attached file if provided
      if (data.file && newMat.id) {
        const ext = data.file.name.split(".").pop() || "pdf";
        const safeName = data.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const storagePath = `projects/${projectId}/underlag/${newMat.id}_${Date.now()}_${safeName}`;

        await supabase.storage.from("project-files").upload(storagePath, data.file, { upsert: true });
        await supabase.from("task_file_links").insert({
          project_id: projectId,
          material_id: newMat.id,
          file_path: storagePath,
          file_name: data.file.name,
          file_type: ext === "pdf" ? "contract" : "other",
          file_size: data.file.size,
          mime_type: data.file.type,
          linked_by_user_id: profile.id,
        });
      }

      // Auto-expand the parent task if linked
      if (taskId) {
        setExpandedTasks((prev) => new Set(prev).add(taskId));
      }
      fetchData();
    },
    [projectId, fetchData, t, toast]
  );

  const handleDeleteMaterial = useCallback(
    async (materialId: string) => {
      const mat = materials.find((m) => m.id === materialId);

      const { error } = await supabase
        .from("materials")
        .delete()
        .eq("id", materialId);

      if (error) {
        toast({ title: t("common.error"), description: error.message, variant: "destructive" });
      } else {
        // If a planned material linked to a task was deleted, check remaining
        // planned materials for that task. If none left, clear material_estimate
        // on the task so the card stays in sync.
        if (mat?.task_id && mat.status === "planned") {
          const { data: remaining } = await supabase
            .from("materials")
            .select("id")
            .eq("task_id", mat.task_id)
            .eq("status", "planned");
          if (!remaining || remaining.length === 0) {
            await supabase
              .from("tasks")
              .update({ material_estimate: null, material_items: null })
              .eq("id", mat.task_id);
          }
        }
        fetchData();
      }
    },
    [materials, fetchData, t, toast]
  );

  const handleMaterialInlineSave = useCallback(
    async (materialId: string, field: string, rawValue: string) => {
      const numValue = rawValue === "" ? null : parseFloat(rawValue);
      if (rawValue !== "" && isNaN(numValue as number)) {
        setEditingCell(null);
        return;
      }

      const mat = materials.find((m) => m.id === materialId);
      const updates: Record<string, number | null> = { [field]: numValue };

      // Auto-compute price_total when qty or unit price changes
      if (mat && (field === "quantity" || field === "price_per_unit")) {
        const qty = field === "quantity" ? (numValue || 0) : (mat.quantity || 0);
        const unitPrice = field === "price_per_unit" ? (numValue || 0) : (mat.price_per_unit || 0);
        if (qty > 0 && unitPrice > 0) {
          updates.price_total = Math.round(qty * unitPrice);
        }
      }

      const { error } = await supabase
        .from("materials")
        .update(updates)
        .eq("id", materialId);

      if (error) {
        toast({ title: t("common.error"), description: error.message, variant: "destructive" });
      } else {
        // Recalculate parent task budget if material is linked and task has detail-calc
        if (mat?.task_id) {
          const parentTask = tasks.find((t) => t.id === mat.task_id);
          if (parentTask?.estimated_hours && parentTask?.hourly_rate) {
            const laborTotal = parentTask.estimated_hours * parentTask.hourly_rate;
            // Re-fetch linked materials to get updated sum
            const { data: siblingMats } = await supabase
              .from("materials")
              .select("price_total, quantity, price_per_unit")
              .eq("task_id", mat.task_id);
            const matSum = (siblingMats || []).reduce((sum, m) => {
              return sum + (m.price_total ?? Math.round((m.quantity || 0) * (m.price_per_unit || 0)));
            }, 0);
            await supabase.from("tasks").update({ budget: laborTotal + matSum }).eq("id", mat.task_id);
          }
        }
        fetchData();
      }
      setEditingCell(null);
    },
    [materials, tasks, fetchData, t, toast]
  );

  const handleLinkMaterialToTask = useCallback(
    async (materialId: string, taskId: string) => {
      const { error } = await supabase
        .from("materials")
        .update({ task_id: taskId })
        .eq("id", materialId);

      if (error) {
        toast({ title: t("common.error"), description: error.message, variant: "destructive" });
      } else {
        setExpandedTasks((prev) => new Set(prev).add(taskId));
        fetchData();
      }
    },
    [fetchData, t, toast]
  );

  const handleUnlinkMaterial = useCallback(
    async (materialId: string) => {
      const { error } = await supabase
        .from("materials")
        .update({ task_id: null })
        .eq("id", materialId);

      if (error) {
        toast({ title: t("common.error"), description: error.message, variant: "destructive" });
      } else {
        fetchData();
      }
    },
    [fetchData, t, toast]
  );

  const handleChangeMaterialKind = useCallback(
    async (materialId: string, kind: "material" | "subcontractor") => {
      const { error } = await supabase
        .from("materials")
        .update({ description: kind === "subcontractor" ? "__subcontractor__" : null })
        .eq("id", materialId);

      if (error) {
        toast({ title: t("common.error"), description: error.message, variant: "destructive" });
      } else {
        fetchData();
      }
    },
    [fetchData, t, toast]
  );

  // --- Row drag-reorder handlers ---

  const handleRowDragStart = useCallback(
    (e: React.DragEvent, type: "task" | "material", id: string, index: number) => {
      dragItem.current = { type, id, index };
      e.dataTransfer.effectAllowed = "move";
      if (type === "material") setIsDraggingMaterial(true);
      if (e.currentTarget instanceof HTMLElement) {
        e.currentTarget.style.opacity = "0.5";
      }
    },
    []
  );

  const handleRowDragEnd = useCallback((e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "1";
    }
    dragItem.current = null;
    setDragOverTarget(null);
    setIsDraggingMaterial(false);
    setUnlinkDropHover(false);
  }, []);

  const handleRowDragOver = useCallback(
    (e: React.DragEvent, type: "task" | "material", id: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (!dragItem.current || dragItem.current.id === id) {
        setDragOverTarget(null);
        return;
      }
      // Determine above/below based on mouse position within the row
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const position = e.clientY < midY ? "above" : "below";
      setDragOverTarget({ type, id, position });
    },
    []
  );

  const handleRowDrop = useCallback(
    async (e: React.DragEvent, targetType: "task" | "material" | "child-material", targetId: string) => {
      e.preventDefault();
      const src = dragItem.current;
      if (!src || src.id === targetId) return;

      // Child material dragged onto a task → link it to that task
      if (src.type === "material" && targetType === "task") {
        const srcMat = materials.find((m) => m.id === src.id);
        // Only link if the material isn't already under this task
        if (srcMat?.task_id !== targetId) {
          await handleLinkMaterialToTask(src.id, targetId);
        }
      }
      // Dragged onto a child-material row
      else if (src.type === "material" && targetType === "child-material") {
        const srcMat = materials.find((m) => m.id === src.id);
        const targetMat = materials.find((m) => m.id === targetId);
        if (!targetMat?.task_id) return;

        // Same parent task → reorder within the group
        if (srcMat?.task_id === targetMat.task_id) {
          setMaterials((prev) => {
            const list = [...prev];
            const fromIdx = list.findIndex((m) => m.id === src.id);
            const toIdx = list.findIndex((m) => m.id === targetId);
            if (fromIdx === -1 || toIdx === -1) return prev;
            const [moved] = list.splice(fromIdx, 1);
            const adjustedTo = fromIdx < toIdx ? toIdx - 1 : toIdx;
            const insertIdx = dragOverTarget?.position === "below" ? adjustedTo + 1 : adjustedTo;
            list.splice(insertIdx, 0, moved);
            return list;
          });
        }
        // Different parent → move to that task
        else {
          await handleLinkMaterialToTask(src.id, targetMat.task_id);
        }
      }
      // Reorder within displayOrder (tasks + standalone materials)
      else {
        const srcDisplayType = src.type === "task" ? "task" : "standalone";
        setDisplayOrder((prev) => {
          const list = [...prev];
          const fromIdx = list.findIndex((item) => item.id === src.id && item.type === srcDisplayType);
          const toIdx = list.findIndex((item) => item.id === targetId);
          if (fromIdx === -1 || toIdx === -1) return prev;
          const [moved] = list.splice(fromIdx, 1);
          const adjustedTo = fromIdx < toIdx ? toIdx - 1 : toIdx;
          const insertIdx = dragOverTarget?.position === "below" ? adjustedTo + 1 : adjustedTo;
          list.splice(insertIdx, 0, moved);
          return list;
        });
      }

      dragItem.current = null;
      setDragOverTarget(null);
    },
    [handleLinkMaterialToTask, dragOverTarget, materials]
  );

  // Auto-estimate: compute hours + materials + budget from room dimensions
  const [estimatingTaskId, setEstimatingTaskId] = useState<string | null>(null);
  // Work-type picker popover state (shown when auto-detect fails)
  const [workTypePickerTaskId, setWorkTypePickerTaskId] = useState<string | null>(null);
  // Estimate feedback dialog (centered, replaces corner toasts)
  const [estimateFeedback, setEstimateFeedback] = useState<{
    title: string;
    lines: { icon: "success" | "warning" | "error"; text: string }[];
  } | null>(null);

  const runEstimate = useCallback(
    async (task: PlanningTask, workType: WorkType) => {
      const roomIds = task.room_ids || (task.room_id ? [task.room_id] : []);
      const linkedRooms = roomIds
        .map((id) => roomMap.get(id))
        .filter((r): r is Room => !!r && !!r.dimensions);

      setEstimatingTaskId(task.id);
      try {
        const taskWithType = { ...task, cost_center: workType };
        const result = estimateTaskMultiRoom(taskWithType, linkedRooms, estimationSettings ?? undefined);
        if (!result) {
          setEstimateFeedback({
            title: t("planningTasks.noEstimatePossible", "Not enough room data to estimate"),
            lines: [{ icon: "warning", text: t("planningTasks.noRoomsForEstimate", "Assign rooms with dimensions first") }],
          });
          return;
        }

        const hours = result.estimatedHours;
        const rate = task.hourly_rate || 0;
        const materialCost = result.material?.totalCost ?? 0;
        const laborTotal = hours * rate;
        const materialWithMarkup = materialCost * (1 + (task.material_markup_percent || 0) / 100);
        const budget = laborTotal + materialWithMarkup;

        // Update task fields + save cost_center for future detection
        const { error } = await supabase
          .from("tasks")
          .update({
            estimated_hours: hours,
            material_estimate: materialCost || null,
            budget: budget || null,
            cost_center: workType,
          })
          .eq("id", task.id);

        if (error) throw error;

        // Create planned material row (only if material was estimated)
        if (result.material) {
          const { data: { user: authUser } } = await supabase.auth.getUser();
          if (authUser) {
            const { data: profileRow } = await supabase
              .from("profiles").select("id").eq("user_id", authUser.id).single();
            const profileId = profileRow?.id;
            if (profileId) {
              // Delete old planned materials for this task, then upsert new
              await supabase.from("materials").delete().eq("task_id", task.id).eq("status", "planned");
              const s = result.material;
              const { error: upsertErr } = await supabase.from("materials").upsert({
                id: crypto.randomUUID(),
                name: s.nameFallback,
                quantity: s.quantity,
                unit: s.unit,
                price_per_unit: s.unitPrice,
                price_total: s.totalCost,
                task_id: task.id,
                project_id: projectId,
                status: "planned",
                exclude_from_budget: false,
                created_by_user_id: profileId,
              }, { onConflict: "id" });
              if (upsertErr) console.error("Material upsert failed:", upsertErr.message, upsertErr.details);
            }
          }
        }

        fetchData();

        // Build centered feedback dialog
        const workLabel = t(WORK_TYPE_LABEL_KEYS[result.workType], result.workType);
        const areaLabel = result.areaType === "wall"
          ? t("planningTasks.wallArea", "wall area")
          : t("planningTasks.floorArea", "floor area");
        const feedbackLines: { icon: "success" | "warning"; text: string }[] = [];
        feedbackLines.push({
          icon: "success",
          text: `${t("planningTasks.estLabor", "Labor")}: ${hours}h (${result.totalAreaSqm} m² ${areaLabel} × ${result.productivityRate} m²/h)`,
        });
        if (result.materialEstimated && result.material) {
          feedbackLines.push({
            icon: "success",
            text: `${t("planningTasks.estMaterial", "Material")}: ${formatCurrency(materialCost, currency)}`,
          });
        } else {
          feedbackLines.push({
            icon: "warning",
            text: t("planningTasks.estNoMaterial", "Material: add manually or via subcontractor quote"),
          });
        }
        if (budget > 0) {
          feedbackLines.push({
            icon: "success",
            text: `${t("planningTasks.estBudget", "Budget")}: ${formatCurrency(budget, currency)}`,
          });
        }

        setEstimateFeedback({
          title: `${workLabel} — ${t("planningTasks.estimateDone", "estimate done")}`,
          lines: feedbackLines,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setEstimateFeedback({
          title: t("common.error", "Error"),
          lines: [{ icon: "error", text: msg }],
        });
      } finally {
        setEstimatingTaskId(null);
      }
    },
    [roomMap, estimationSettings, fetchData, t, projectId, currency]
  );

  const handleAutoEstimate = useCallback(
    async (task: PlanningTask) => {
      const roomIds = task.room_ids || (task.room_id ? [task.room_id] : []);
      const linkedRooms = roomIds
        .map((id) => roomMap.get(id))
        .filter((r): r is Room => !!r && !!r.dimensions);

      if (linkedRooms.length === 0) {
        setEstimateFeedback({
          title: t("planningTasks.autoEstimate", "Auto-estimate"),
          lines: [{ icon: "warning", text: t("planningTasks.noRoomsForEstimate", "Assign rooms with dimensions first") }],
        });
        return;
      }

      const workType = detectWorkType(task);
      if (!workType) {
        // Open work-type picker popover instead of showing error toast
        setWorkTypePickerTaskId(task.id);
        return;
      }

      await runEstimate(task, workType);
    },
    [roomMap, runEstimate, t]
  );

  const handleWorkTypePicked = useCallback(
    async (taskId: string, workType: WorkType) => {
      setWorkTypePickerTaskId(null);
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;
      await runEstimate(task, workType);
    },
    [tasks, runEstimate]
  );

  const calcTaskProfit = useCallback((task: PlanningTask) => {
    const costPct = task.labor_cost_percent ?? profileLaborCostPercent ?? 50;
    // Lump-sum mode: no hours/rate/UE set but kundpris entered directly
    const isLumpSum = !task.estimated_hours && !task.hourly_rate && !task.subcontractor_cost;
    const laborBase = isLumpSum && task.budget
      ? task.budget
      : (task.estimated_hours || 0) * (task.hourly_rate || 0);
    const laborProfit = laborBase * (1 - costPct / 100);

    const ueProfit = (task.subcontractor_cost || 0) * (task.markup_percent || 0) / 100;

    // Material profit
    const items = task.material_items || [];
    let materialProfit = 0;
    if (items.length > 0) {
      const hasPerRow = items.some(i => (i.markup_percent ?? null) !== null);
      if (hasPerRow) {
        materialProfit = items.reduce((sum, i) => sum + (i.amount || 0) * (i.markup_percent || 0) / 100, 0);
      } else {
        const base = items.reduce((sum, i) => sum + (i.amount || 0), 0);
        materialProfit = base * (task.material_markup_percent || 0) / 100;
      }
    } else {
      materialProfit = (task.material_estimate || 0) * (task.material_markup_percent || 0) / 100;
    }

    return laborProfit + ueProfit + materialProfit;
  }, [profileLaborCostPercent]);

  const standaloneBudget = materialsByTask.standalone.reduce((sum, m) => {
    const base = m.price_total ?? Math.round((m.quantity || 0) * (m.price_per_unit || 0));
    return sum + Math.round(base * (1 + (m.markup_percent || 0) / 100));
  }, 0);
  const totalBudget = tasks.reduce((sum, t) => sum + (t.budget || 0), 0) + standaloneBudget;
  const standaloneProfit = materialsByTask.standalone.reduce((sum, m) => {
    const base = m.price_total ?? Math.round((m.quantity || 0) * (m.price_per_unit || 0));
    return sum + Math.round(base * (m.markup_percent || 0) / 100);
  }, 0);
  const totalProfit = tasks.reduce((sum, t) => sum + calcTaskProfit(t), 0) + standaloneProfit;
  const pricedCount = tasks.filter((t) => t.budget && t.budget > 0).length;

  // Count visible columns for colspan on inline-add row
  const visibleColCount = 1 + extraCount + 1 + (effectiveLock ? 0 : 1); // task + extras + price + edit

  return (
    <div className="space-y-3">
      {/* Header strip */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            {t("planningTasks.title", "Scope of work")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t("planningTasks.description", "Define tasks to include in your quote")}
          </p>
        </div>
        {tasks.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {pricedCount}/{tasks.length} {t("planningTasks.priced", "priced")}
          </span>
        )}
      </div>
      <div>
        {locked && (
          <Alert variant="default" className="mb-4">
            <Lock className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between gap-2">
              <span className="text-sm">
                {lockOverridden
                  ? t("planningTasks.unlocked", "Editing enabled — changes won't affect the sent quote")
                  : t("planningTasks.locked", "Scope is locked while a quote is active")}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 gap-1"
                onClick={() => setLockOverridden(!lockOverridden)}
              >
                {lockOverridden ? (
                  <>
                    <Lock className="h-3.5 w-3.5" />
                    {t("planningTasks.relock", "Lock")}
                  </>
                ) : (
                  <>
                    <Unlock className="h-3.5 w-3.5" />
                    {t("planningTasks.unlock", "Unlock editing")}
                  </>
                )}
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-muted/50 rounded animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            <div className="rounded-lg border bg-card overflow-auto max-h-[calc(100vh-20rem)]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-muted border-b">
                    {show.costType && (
                      <th className="px-3 py-2.5 kicker hidden sm:table-cell w-[60px]">
                        {t("planningTasks.costType", "Typ")}
                      </th>
                    )}
                    <th className="px-3 py-2.5 kicker min-w-[220px]">
                      {t("planningTasks.taskName", "Task")}
                    </th>
                    {show.description && (
                      <th className="px-3 py-2.5 kicker hidden sm:table-cell w-[200px]">
                        {t("tasks.description", "Description")}
                      </th>
                    )}
                    {show.hours && (
                      <th className="px-3 py-2.5 kicker hidden sm:table-cell text-right w-[90px]">
                        {t("planningTasks.hoursQty", "Hours / Qty")}
                      </th>
                    )}
                    {show.hourlyRate && (
                      <th className="px-3 py-2.5 kicker hidden sm:table-cell text-right w-[110px]">
                        {t("planningTasks.rateUnitPrice", "Timpris / Á-pris")}
                      </th>
                    )}
                    {show.room && (
                      <th className="px-3 py-2.5 kicker hidden sm:table-cell w-[130px]">
                        {t("planningTasks.room", "Room")}
                      </th>
                    )}
                    {show.markup && (
                      <th className="px-3 py-2.5 kicker hidden sm:table-cell text-right w-[80px]">
                        {t("planningTasks.markup", "Markup")}
                      </th>
                    )}
                    {show.budget && (
                      <th className="px-3 py-2.5 kicker hidden sm:table-cell text-right w-[120px]">
                        {t("planningTasks.budget", "Budget")}
                      </th>
                    )}
                    {show.materialEstimate && (
                      <th className="px-3 py-2.5 kicker hidden sm:table-cell text-right w-[130px]">
                        {t("planningTasks.materialEstimate", "Materialbudget")}
                      </th>
                    )}
                    {show.rotAmount && (
                      <th className="px-3 py-2.5 kicker hidden sm:table-cell text-right w-[110px]">
                        {!isHomeowner && !effectiveLock ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  className="hover:text-primary hover:underline transition-colors"
                                  onClick={handleApplyRotToAll}
                                >
                                  {t("files.rotAmount", "ROT-avdrag")}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p className="text-xs">{t("planningTasks.rotApplyAllTooltip", "Klicka för att applicera/ta bort ROT på alla arbetsrader")}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          t("files.rotAmount", "ROT-avdrag")
                        )}
                      </th>
                    )}
                    <th className="px-3 py-2.5 kicker text-right w-[140px]">
                      <div>
                        {isHomeowner
                          ? t("planningTasks.estimatedBudget", "Budget")
                          : t("planningTasks.customerPrice", "Kundpris")}
                        {!isHomeowner && (
                          <span className="block text-[10px] font-normal text-muted-foreground/70">{t("estimation.exMomsShort", "ex moms")}</span>
                        )}
                      </div>
                    </th>
                    {show.profit && (
                      <th className="px-3 py-2.5 kicker hidden sm:table-cell text-right w-[110px]">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help">{t("taskCost.result", "Resultat")}</span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[250px]">
                              <p className="text-xs">{t("planningTasks.profitFormula", "Profit from labor (hours × rate × margin) + markup on materials and subcontractors")}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </th>
                    )}
                    {!effectiveLock && <th className="px-3 py-2.5 kicker w-[40px]" />}
                  </tr>
                </thead>
                <tbody>
                  {effectiveDisplayOrder.map((displayItem, displayIdx) => {
                  // --- Group header row ---
                  if (displayItem.type === "groupHeader") {
                    const isCollapsed = collapsedGroups.has(displayItem.category);
                    const label = displayItem.category === "__standalone__"
                      ? t("planningTasks.standaloneMaterials", "Fristående material")
                      : (TASK_CATEGORY_LABELS[displayItem.category as TaskCategory] || displayItem.category);
                    return (
                      <tr
                        key={`group-${displayItem.category}`}
                        className="bg-muted/40 hover:bg-muted/60 cursor-pointer border-b transition-colors"
                        onClick={() => setCollapsedGroups((prev) => {
                          const next = new Set(prev);
                          if (next.has(displayItem.category)) next.delete(displayItem.category);
                          else next.add(displayItem.category);
                          return next;
                        })}
                      >
                        <td colSpan={99} className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isCollapsed ? '' : 'rotate-90'}`} />
                            <span className="text-sm font-semibold">{label}</span>
                            <span className="text-xs text-muted-foreground">
                              ({displayItem.count})
                            </span>
                            {displayItem.budget > 0 && (
                              <span className="ml-auto text-sm font-medium tabular-nums text-muted-foreground">
                                {formatCurrency(displayItem.budget, currency)}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  // Skip items in collapsed groups
                  if (groupByCategory) {
                    if (displayItem.type === "task") {
                      const t2 = tasks.find((t) => t.id === displayItem.id);
                      if (t2 && collapsedGroups.has(t2.cost_center || "ovrigt")) return null;
                    }
                    if (displayItem.type === "standalone" && collapsedGroups.has("__standalone__")) return null;
                  }

                  // --- Standalone material row ---
                  if (displayItem.type === "standalone") {
                    const mat = materialsByTask.standalone.find((m) => m.id === displayItem.id);
                    if (!mat) return null;
                    const hasQtyAndPriceS = !!(mat.quantity && mat.quantity > 0 && mat.price_per_unit && mat.price_per_unit > 0);
                    const matTotal = hasQtyAndPriceS
                      ? Math.round(mat.quantity! * mat.price_per_unit!)
                      : (mat.price_total ?? 0);
                    const renderStandaloneInline2 = (
                      matField: "mat_quantity" | "mat_price_per_unit" | "mat_markup_percent" | "mat_price_total",
                      dbField: string,
                      value: number | null,
                      suffix?: string,
                    ) => {
                      const isLockedFieldS = matField === "mat_price_total" && hasQtyAndPriceS;
                      if (isLockedFieldS) {
                        return matTotal > 0 ? (
                          <span className="text-sm text-muted-foreground">{formatCurrency(matTotal, currency)}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">–</span>
                        );
                      }
                      const isEditingThis = editingCell && "materialId" in editingCell && editingCell.materialId === mat.id && editingCell.field === matField;
                      if (isEditingThis && !effectiveLock) {
                        return (
                          <Input
                            type="number"
                            className="w-16 h-7 text-right text-sm"
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleMaterialInlineSave(mat.id, dbField, editValue);
                              if (e.key === "Escape") setEditingCell(null);
                            }}
                            onBlur={() => handleMaterialInlineSave(mat.id, dbField, editValue)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        );
                      }
                      if (effectiveLock) {
                        return value ? (
                          <span className="text-sm text-muted-foreground">{suffix ? `${value}${suffix}` : formatCurrency(value, currency)}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">–</span>
                        );
                      }
                      return (
                        <button
                          className="hover:bg-muted px-1.5 py-0.5 rounded cursor-text text-sm text-muted-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingCell({ taskId: "__standalone__", field: matField, materialId: mat.id });
                            setEditValue(value != null ? String(value) : "");
                          }}
                        >
                          {value ? (suffix ? `${value}${suffix}` : formatCurrency(value, currency)) : "–"}
                        </button>
                      );
                    };

                    return (
                      <tr
                        key={`s-${mat.id}`}
                        className={`bg-amber-50/30 border-b last:border-b-0 hover:bg-muted/30 transition-colors ${dragOverTarget?.id === mat.id ? (dragOverTarget.position === "above" ? "border-t-2 border-t-primary" : "border-b-2 border-b-primary") : ""}`}
                        draggable={!effectiveLock}
                        onDragStart={(e) => handleRowDragStart(e, "material", mat.id, displayIdx)}
                        onDragEnd={handleRowDragEnd}
                        onDragOver={(e) => handleRowDragOver(e, "material", mat.id)}
                        onDrop={(e) => handleRowDrop(e, "material", mat.id)}
                      >
                        {show.costType && (
                          <td className="hidden sm:table-cell px-3 py-2.5">
                            <MaterialKindIcon
                              kind={mat.kind}
                              editable={!effectiveLock}
                              onChangeKind={(kind) => handleChangeMaterialKind(mat.id, kind)}
                            />
                          </td>
                        )}
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm">{mat.name}</span>
                            <MaterialFileAttachment materialId={mat.id} projectId={projectId} />
                            {!effectiveLock && tasks.length > 0 ? (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="inline-flex items-center text-amber-500 hover:text-amber-700 transition-colors p-0.5 rounded hover:bg-amber-50" title={t("planningTasks.linkToTask")}>
                                    <Link2 className="h-3.5 w-3.5" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-52 p-2" align="start">
                                  <p className="text-xs font-medium text-muted-foreground mb-2 px-1">
                                    {t("planningTasks.linkToTask")}
                                  </p>
                                  <div className="flex flex-col">
                                    {tasks.map((tk) => (
                                      <button
                                        key={tk.id}
                                        className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted text-left"
                                        onClick={() => handleLinkMaterialToTask(mat.id, tk.id)}
                                      >
                                        {tk.title}
                                      </button>
                                    ))}
                                  </div>
                                </PopoverContent>
                              </Popover>
                            ) : null}
                          </div>
                        </td>
                        {show.description && <td className="hidden sm:table-cell py-2.5" />}
                        {show.hours && (
                          <td className="text-right hidden sm:table-cell px-3 py-2.5">
                            {renderStandaloneInline2("mat_quantity", "quantity", mat.quantity, ` ${mat.unit && mat.unit !== "kr" ? mat.unit : "st"}`)}
                          </td>
                        )}
                        {show.hourlyRate && (
                          <td className="text-right hidden sm:table-cell px-3 py-2.5">
                            {renderStandaloneInline2("mat_price_per_unit", "price_per_unit", mat.price_per_unit)}
                          </td>
                        )}
                        {show.room && (
                          <td className="hidden sm:table-cell px-3 py-2.5">
                            {editingCell && "materialId" in editingCell && editingCell.materialId === mat.id && editingCell.field === "mat_room_id" && !effectiveLock ? (
                              <Popover open onOpenChange={(isOpen) => { if (!isOpen) { setEditingCell(null); setNewRoomName(""); } }}>
                                <PopoverTrigger asChild>
                                  <button className="text-sm text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
                                    {mat.room_id && rooms.find((r) => r.id === mat.room_id)?.name || "–"}
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-52 p-1" align="start">
                                  <div className="space-y-0.5">
                                    {rooms.map((r) => (
                                      <label
                                        key={r.id}
                                        className="flex items-center gap-2 w-full text-sm px-2 py-1.5 rounded hover:bg-muted cursor-pointer"
                                      >
                                        <Checkbox
                                          checked={mat.room_id === r.id}
                                          onCheckedChange={() => handleMaterialRoomChange(mat.id, mat.room_id === r.id ? null : r.id)}
                                        />
                                        {r.name}
                                      </label>
                                    ))}
                                    {mat.room_id && (
                                      <button
                                        className="w-full text-left text-xs text-muted-foreground px-2 py-1 hover:bg-muted rounded"
                                        onClick={() => handleMaterialRoomChange(mat.id, null)}
                                      >
                                        {t("common.clearAll", "Clear all")}
                                      </button>
                                    )}
                                    <div className="border-t pt-1 mt-1">
                                      <form
                                        className="flex items-center gap-1 px-1"
                                        onSubmit={async (e) => {
                                          e.preventDefault();
                                          const name = newRoomName.trim();
                                          if (!name) return;
                                          const { data: room } = await supabase
                                            .from("rooms")
                                            .insert({ project_id: projectId, name })
                                            .select("id")
                                            .single();
                                          if (room) {
                                            await handleMaterialRoomChange(mat.id, room.id);
                                            setNewRoomName("");
                                          }
                                        }}
                                      >
                                        <Input
                                          placeholder={t("planningTasks.newRoom", "New room...")}
                                          value={newRoomName}
                                          onChange={(e) => setNewRoomName(e.target.value)}
                                          className="h-7 text-sm flex-1"
                                          onClick={(e) => e.stopPropagation()}
                                        />
                                        <Button
                                          type="submit"
                                          size="icon"
                                          variant="ghost"
                                          className="h-7 w-7 shrink-0"
                                          disabled={!newRoomName.trim()}
                                        >
                                          <Plus className="h-3.5 w-3.5" />
                                        </Button>
                                      </form>
                                    </div>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            ) : effectiveLock ? (
                              <span className="text-sm text-muted-foreground">
                                {mat.room_id && rooms.find((r) => r.id === mat.room_id)?.name || "–"}
                              </span>
                            ) : (
                              <button
                                className="hover:bg-muted px-1.5 py-0.5 rounded cursor-pointer text-sm text-muted-foreground text-left"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingCell({ taskId: "__standalone__", field: "mat_room_id", materialId: mat.id });
                                  setEditValue("");
                                }}
                              >
                                {mat.room_id && rooms.find((r) => r.id === mat.room_id)?.name || "–"}
                              </button>
                            )}
                          </td>
                        )}
                        {show.markup && (
                          <td className="text-right hidden sm:table-cell px-3 py-2.5">
                            {renderStandaloneInline2("mat_markup_percent", "markup_percent", mat.markup_percent, "%")}
                          </td>
                        )}
                        {(() => {
                          const base = matTotal || 0;
                          const markup = mat.markup_percent || 0;
                          const customerPrice = markup > 0 ? Math.round(base * (1 + markup / 100)) : base;
                          const profit = markup > 0 ? Math.round(base * markup / 100) : 0;
                          return (
                            <>
                              {show.budget && (
                                <td className="text-right hidden sm:table-cell px-3 py-2.5">
                                  <span className="text-xs text-muted-foreground">–</span>
                                </td>
                              )}
                              {show.materialEstimate && (
                                <td className="text-right hidden sm:table-cell px-3 py-2.5">
                                  <span className="text-xs text-muted-foreground">–</span>
                                </td>
                              )}
                              {show.rotAmount && (
                                <td className="text-right hidden sm:table-cell px-3 py-2.5">
                                  <span className="text-xs text-muted-foreground">–</span>
                                </td>
                              )}
                              <td className="text-right px-3 py-2.5">
                                {customerPrice > 0 && markup > 0 ? (
                                  <HoverCard openDelay={200} closeDelay={100}>
                                    <HoverCardTrigger asChild>
                                      <button className="text-sm font-medium hover:underline hover:text-primary transition-colors" onClick={(e) => e.stopPropagation()}>
                                        {formatCurrency(customerPrice, currency)}
                                      </button>
                                    </HoverCardTrigger>
                                    <HoverCardContent className="w-52 p-3" align="end" side="top">
                                      <div className="space-y-1.5 text-xs">
                                        <p className="font-semibold text-sm mb-2">{t("taskCost.customerPrice", "Kundpris")}</p>
                                        <div className="flex justify-between">
                                          <span className="text-muted-foreground">{mat.kind === "subcontractor" ? t("taskCost.subcontractor", "UE") : t("taskCost.material", "Material")}</span>
                                          <span className="tabular-nums">{formatCurrency(base, currency)}</span>
                                        </div>
                                        <div className="flex justify-between text-amber-700">
                                          <span>{t("taskCost.markupShort", "Påslag")} {markup}%</span>
                                          <span className="tabular-nums">+{formatCurrency(profit, currency)}</span>
                                        </div>
                                        <div className="flex justify-between pt-1.5 border-t font-semibold text-sm">
                                          <span>{t("common.total", "Totalt")}</span>
                                          <span className="tabular-nums text-primary">{formatCurrency(customerPrice, currency)}</span>
                                        </div>
                                      </div>
                                    </HoverCardContent>
                                  </HoverCard>
                                ) : customerPrice > 0 ? (
                                  <span className="text-sm font-medium">{formatCurrency(customerPrice, currency)}</span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">–</span>
                                )}
                              </td>
                              {show.profit && (
                                <td className="text-right hidden sm:table-cell px-3 py-2.5">
                                  {profit > 0 ? (
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <button className="text-sm text-green-600 hover:underline" onClick={(e) => e.stopPropagation()}>
                                          {formatCurrency(profit, currency)}
                                        </button>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-56 p-3" align="end" onClick={(e) => e.stopPropagation()}>
                                        <div className="space-y-2 text-xs">
                                          <div className="flex items-center justify-between">
                                            <span className="text-muted-foreground">{t("planningTasks.markup")}:</span>
                                            <span>{formatCurrency(base, currency)} × <span className="text-green-600 font-medium">{markup}%</span></span>
                                          </div>
                                          <div className="border-t pt-1.5 flex items-center justify-between font-medium">
                                            <span>{t("taskCost.result")}:</span>
                                            <span className="text-green-600">{formatCurrency(profit, currency)}</span>
                                          </div>
                                        </div>
                                      </PopoverContent>
                                    </Popover>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">–</span>
                                  )}
                                </td>
                              )}
                            </>
                          );
                        })()}
                        {!effectiveLock && (
                          <td className="px-3 py-2.5">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
                                  <MoreVertical className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem onClick={() => {
                                  const input = document.getElementById(`file-${mat.id}`) as HTMLInputElement;
                                  input?.click();
                                }}>
                                  <Paperclip className="h-3.5 w-3.5 mr-2" />
                                  {t("planningTasks.attachFile", "Attach file")}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => handleDeleteMaterial(mat.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                                  {t("common.delete", "Delete")}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        )}
                      </tr>
                    );
                  }

                  // --- Task row ---
                  const task = tasks.find((t) => t.id === displayItem.id);
                  if (!task) return null;
                  const idx = displayIdx;
                  {
                    const hasOwnLabor = !!(task.estimated_hours && task.hourly_rate);
                    const hasSubcontractor = !!task.subcontractor_cost;
                    // Detail-calc mode: budget is auto-computed when BOTH hours AND rate are set
                    const isDetailCalc = !!(task.estimated_hours && task.hourly_rate);

                    const renderInlineCell = (
                      field: "estimated_hours" | "hourly_rate" | "budget",
                      value: number | null,
                      format: "hours" | "currency",
                    ) => {
                      // Budget is locked when in detail-calc mode
                      const isLocked = field === "budget" && isDetailCalc;
                      const isEditing = editingCell?.taskId === task.id && editingCell?.field === field;

                      if (isEditing && !effectiveLock && !isLocked) {
                        return (
                          <Input
                            type="number"
                            className="w-20 h-7 text-right text-sm"
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleInlineSave(task.id, field, editValue);
                              if (e.key === "Escape") setEditingCell(null);
                            }}
                            onBlur={() => handleInlineSave(task.id, field, editValue)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        );
                      }

                      const display = value
                        ? format === "hours"
                          ? `${value}h`
                          : formatCurrency(value, currency)
                        : null;

                      if (effectiveLock || isLocked) {
                        return display ? (
                          <span className={`text-sm ${field === "budget" ? "font-medium" : "text-muted-foreground"}`}>{display}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">–</span>
                        );
                      }

                      return (
                        <button
                          className={`hover:bg-muted px-1.5 py-0.5 rounded cursor-text text-sm ${field === "budget" && value ? "font-medium" : "text-muted-foreground"}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingCell({ taskId: task.id, field });
                            setEditValue(value != null ? String(value) : "");
                          }}
                        >
                          {display || "–"}
                        </button>
                      );
                    };

                    const taskMaterials = materialsByTask.byTask.get(task.id) || [];
                    const matCount = taskMaterials.length;
                    const isExpanded = expandedTasks.has(task.id);

                    return (
                    <React.Fragment key={task.id}>
                    <tr
                      draggable={!effectiveLock}
                      onDragStart={(e) => handleRowDragStart(e, "task", task.id, idx)}
                      onDragEnd={handleRowDragEnd}
                      onDragOver={(e) => handleRowDragOver(e, "task", task.id)}
                      onDrop={(e) => handleRowDrop(e, "task", task.id)}
                      className={`border-b last:border-b-0 hover:bg-muted/30 transition-colors ${
                        dragOverTarget?.id === task.id
                          ? dragOverTarget.position === "above"
                            ? "border-t-2 border-t-primary"
                            : "border-b-2 border-b-primary"
                          : ""
                      }`}
                    >
                      {show.costType && (() => {
                        const hasMaterial = taskMaterials.length > 0 || !!(task.material_estimate && task.material_estimate > 0);
                        const hasAny = hasOwnLabor || hasMaterial || hasSubcontractor;
                        return (
                        <td className="hidden sm:table-cell px-3 py-2.5">
                          {hasAny ? (
                            <div className="flex items-center gap-1">
                              {hasOwnLabor && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Hammer className="h-3.5 w-3.5 text-muted-foreground" />
                                    </TooltipTrigger>
                                    <TooltipContent><p className="text-xs">{t("taskCost.ownLabor", "Eget arbete")}</p></TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              {hasMaterial && (
                                <>
                                  {hasOwnLabor && <span className="text-[10px] text-muted-foreground/50">+</span>}
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />
                                      </TooltipTrigger>
                                      <TooltipContent><p className="text-xs">{t("taskCost.material", "Material")}</p></TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </>
                              )}
                              {hasSubcontractor && (
                                <>
                                  {(hasOwnLabor || hasMaterial) && <span className="text-[10px] text-muted-foreground/50">+</span>}
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Handshake className="h-3.5 w-3.5 text-muted-foreground" />
                                      </TooltipTrigger>
                                      <TooltipContent><p className="text-xs">{t("taskCost.subcontractor", "UE")}</p></TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">–</span>
                          )}
                        </td>
                        );
                      })()}
                      <td className="font-medium px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className={`text-left hover:underline hover:text-primary transition-colors ${task.status === "completed" ? "line-through text-muted-foreground" : ""}`}
                            onClick={() => setEditTaskId(task.id)}
                          >
                            {task.title}
                          </button>
                          {matCount > 0 && (
                            <button
                              type="button"
                              className="ml-1.5 inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors rounded px-1 py-0.5 hover:bg-muted"
                              onClick={(e) => { e.stopPropagation(); toggleTaskExpand(task.id); }}
                            >
                              <ShoppingCart className="h-3 w-3" />
                              <span className="text-xs">{matCount}</span>
                            </button>
                          )}
                          <MaterialFileAttachment taskId={task.id} projectId={projectId} />
                        </div>
                      </td>
                      {show.description && (
                        <td className="hidden sm:table-cell py-2.5 max-w-[200px]">
                          {editingCell?.taskId === task.id && editingCell?.field === "description" && !effectiveLock ? (
                            <Input
                              className="h-7 text-sm"
                              autoFocus
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleInlineTextSave(task.id, "description", editValue);
                                if (e.key === "Escape") setEditingCell(null);
                              }}
                              onBlur={() => handleInlineTextSave(task.id, "description", editValue)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : effectiveLock ? (
                            task.description ? (
                              <span className="text-sm text-muted-foreground truncate block" title={task.description}>{task.description}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">–</span>
                            )
                          ) : (
                            <button
                              className="hover:bg-muted px-1.5 py-0.5 rounded cursor-text text-sm text-muted-foreground truncate block max-w-full text-left"
                              title={task.description || undefined}
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingCell({ taskId: task.id, field: "description" });
                                setEditValue(task.description || "");
                              }}
                            >
                              {task.description || "–"}
                            </button>
                          )}
                        </td>
                      )}
                      {show.hours && (
                        <td className="text-right hidden sm:table-cell px-3 py-2.5">
                          {renderInlineCell("estimated_hours", task.estimated_hours, "hours")}
                        </td>
                      )}
                      {show.hourlyRate && (
                        <td className="text-right hidden sm:table-cell px-3 py-2.5">
                          {renderInlineCell("hourly_rate", task.hourly_rate, "currency")}
                        </td>
                      )}
                      {show.room && (
                        <td className="hidden sm:table-cell px-3 py-2.5">
                          {editingCell?.taskId === task.id && editingCell?.field === "room_id" && !effectiveLock ? (
                            <Popover open onOpenChange={(isOpen) => { if (!isOpen) { setEditingCell(null); setNewRoomName(""); } }}>
                              <PopoverTrigger asChild>
                                <button className="text-sm text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
                                  {task.room_names.length > 0 ? task.room_names.join(", ") : "–"}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-52 p-1" align="start">
                                <div className="space-y-0.5">
                                  {rooms.map((r) => {
                                    const checked = (task.room_ids || []).includes(r.id);
                                    return (
                                      <label
                                        key={r.id}
                                        className="flex items-center gap-2 w-full text-sm px-2 py-1.5 rounded hover:bg-muted cursor-pointer"
                                      >
                                        <Checkbox
                                          checked={checked}
                                          onCheckedChange={() => handleRoomToggle(task.id, r.id)}
                                        />
                                        {r.name}
                                      </label>
                                    );
                                  })}
                                  {rooms.length > 1 && (task.room_ids || []).length < rooms.length && (
                                    <button
                                      className="w-full text-left text-xs text-primary px-2 py-1 hover:bg-muted rounded font-medium"
                                      onClick={() => handleSelectAllRooms(task.id)}
                                    >
                                      {t("common.selectAll", "Alla rum")}
                                    </button>
                                  )}
                                  {(task.room_ids || []).length > 0 && (
                                    <button
                                      className="w-full text-left text-xs text-muted-foreground px-2 py-1 hover:bg-muted rounded"
                                      onClick={() => handleClearRooms(task.id)}
                                    >
                                      {t("common.clearAll", "Rensa alla")}
                                    </button>
                                  )}
                                  <div className="border-t pt-1 mt-1">
                                    <form
                                      className="flex items-center gap-1 px-1"
                                      onSubmit={(e) => {
                                        e.preventDefault();
                                        handleCreateRoomAndAssign(task.id, newRoomName);
                                      }}
                                    >
                                      <Input
                                        placeholder={t("planningTasks.newRoom", "New room...")}
                                        value={newRoomName}
                                        onChange={(e) => setNewRoomName(e.target.value)}
                                        className="h-7 text-sm flex-1"
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                      <Button
                                        type="submit"
                                        size="icon"
                                        variant="ghost"
                                        className="h-7 w-7 shrink-0"
                                        disabled={!newRoomName.trim()}
                                      >
                                        <Plus className="h-3.5 w-3.5" />
                                      </Button>
                                    </form>
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          ) : effectiveLock ? (
                            <span className="text-sm text-muted-foreground">{task.room_names.length > 0 ? task.room_names.join(", ") : "–"}</span>
                          ) : (
                            <button
                              className="hover:bg-muted px-1.5 py-0.5 rounded cursor-pointer text-sm text-muted-foreground text-left"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingCell({ taskId: task.id, field: "room_id" });
                                setEditValue("");
                              }}
                            >
                              {task.room_names.length > 0 ? task.room_names.join(", ") : "–"}
                            </button>
                          )}
                        </td>
                      )}
                      {show.markup && (
                        <td className="text-right hidden sm:table-cell px-3 py-2.5">
                          {(() => {
                            const hasMatMarkup = (task.material_markup_percent && task.material_markup_percent > 0)
                              || (task.material_items || []).some(i => i.markup_percent && i.markup_percent > 0);
                            const hasUeMarkup = task.markup_percent && task.markup_percent > 0;
                            if (!hasMatMarkup && !hasUeMarkup) return null;
                            return (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="text-xs text-amber-600 cursor-default">*</span>
                                  </TooltipTrigger>
                                  <TooltipContent side="left" className="max-w-[200px]">
                                    <p className="text-xs">
                                      {hasMatMarkup && hasUeMarkup
                                        ? t("planningTasks.markupOnMatAndUe", "Påslag på material och UE")
                                        : hasMatMarkup
                                          ? t("planningTasks.markupOnMat", "Påslag på material")
                                          : t("planningTasks.markupOnUe", "Påslag på UE")}
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            );
                          })()}
                        </td>
                      )}
                      {show.budget && (
                        <td className="text-right hidden sm:table-cell px-3 py-2.5">
                          {task.budget ? <span className="text-sm">{formatCurrency(task.budget, currency)}</span> : <span className="text-xs text-muted-foreground">–</span>}
                        </td>
                      )}
                      {show.materialEstimate && (
                        <td className="text-right hidden sm:table-cell px-3 py-2.5">
                          {task.material_estimate ? (() => {
                            const matMarkup = task.material_markup_percent || 0;
                            const matItems = task.material_items || [];
                            const hasPerRowMarkup = matItems.some(i => i.markup_percent && i.markup_percent > 0);
                            const matWithMarkup = matItems.length > 0
                              ? (hasPerRowMarkup
                                  ? matItems.reduce((s, i) => s + (i.amount || 0) * (1 + (i.markup_percent || 0) / 100), 0)
                                  : task.material_estimate * (1 + matMarkup / 100))
                              : task.material_estimate * (1 + matMarkup / 100);
                            const markupAmt = Math.round(matWithMarkup - task.material_estimate);
                            if (markupAmt > 0) {
                              return (
                                <HoverCard openDelay={200} closeDelay={100}>
                                  <HoverCardTrigger asChild>
                                    <button className="text-sm text-amber-700 hover:underline" onClick={(e) => e.stopPropagation()}>
                                      {formatCurrency(task.material_estimate, currency)}
                                    </button>
                                  </HoverCardTrigger>
                                  <HoverCardContent className="w-52 p-3" align="end" side="top">
                                    <div className="space-y-1.5 text-xs">
                                      <p className="font-semibold text-sm mb-2">{t("planningTasks.materialEstimate", "Materialbudget")}</p>
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">{t("taskCost.material", "Material")}</span>
                                        <span className="tabular-nums">{formatCurrency(task.material_estimate, currency)}</span>
                                      </div>
                                      <div className="flex justify-between text-amber-700">
                                        <span>{t("taskCost.markupShort", "Påslag")} {!hasPerRowMarkup && matMarkup > 0 ? `${matMarkup}%` : ""}</span>
                                        <span className="tabular-nums">+{formatCurrency(markupAmt, currency)}</span>
                                      </div>
                                      <div className="flex justify-between pt-1.5 border-t font-semibold">
                                        <span>{t("taskCost.withMarkup", "Med påslag")}</span>
                                        <span className="tabular-nums">{formatCurrency(Math.round(matWithMarkup), currency)}</span>
                                      </div>
                                    </div>
                                  </HoverCardContent>
                                </HoverCard>
                              );
                            }
                            return <span className="text-sm text-amber-700">{formatCurrency(task.material_estimate, currency)}</span>;
                          })() : <span className="text-xs text-muted-foreground">–</span>}
                        </td>
                      )}
                      {show.rotAmount && (
                        <td className="text-right hidden sm:table-cell px-3 py-2.5">
                          {task.rot_amount ? (() => {
                            const laborCost = (task.estimated_hours || 0) * (task.hourly_rate || 0);
                            const laborIncMoms = Math.round(laborCost * 1.25);
                            return (
                              <HoverCard openDelay={200} closeDelay={100}>
                                <HoverCardTrigger asChild>
                                  <button className="text-sm text-green-700 hover:underline" onClick={(e) => e.stopPropagation()}>
                                    {formatCurrency(task.rot_amount, currency)}
                                  </button>
                                </HoverCardTrigger>
                                <HoverCardContent className="w-56 p-3" align="end" side="top">
                                  <div className="space-y-1.5 text-xs">
                                    <p className="font-semibold text-sm mb-2">{t("tasks.rotEligible", "ROT-avdrag")}</p>
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">{t("taskCost.ownLabor", "Eget arbete")}</span>
                                      <span className="tabular-nums">{formatCurrency(laborCost, currency)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">{t("estimation.incMomsShort", "inc moms")} (25%)</span>
                                      <span className="tabular-nums">{formatCurrency(laborIncMoms, currency)}</span>
                                    </div>
                                    <div className="flex justify-between pt-1.5 border-t font-semibold text-green-700">
                                      <span>ROT 30%</span>
                                      <span className="tabular-nums">{formatCurrency(task.rot_amount, currency)}</span>
                                    </div>
                                  </div>
                                </HoverCardContent>
                              </HoverCard>
                            );
                          })() : (
                            <span className="text-xs text-muted-foreground">–</span>
                          )}
                        </td>
                      )}
                      <td className="text-right px-3 py-2.5">
                        {(() => {
                          const laborTotal = (task.estimated_hours || 0) * (task.hourly_rate || 0);
                          const matItems = task.material_items || [];
                          const matBase = matItems.length > 0
                            ? matItems.reduce((s, i) => s + (i.amount || 0), 0)
                            : (task.material_estimate || 0);
                          const matMarkupPct = task.material_markup_percent || 0;
                          const matWithMarkup = matItems.length > 0
                            ? matItems.reduce((s, i) => s + (i.amount || 0) * (1 + (i.markup_percent || 0) / 100), 0)
                            : matBase * (1 + matMarkupPct / 100);
                          const matMarkupAmt = Math.round(matWithMarkup - matBase);
                          const ueBase = task.subcontractor_cost || 0;
                          const ueMarkupPct = task.markup_percent || 0;
                          const ueWithMarkup = Math.round(ueBase * (1 + ueMarkupPct / 100));
                          const ueMarkupAmt = ueWithMarkup - ueBase;
                          const hasBreakdown = laborTotal > 0 || matBase > 0 || ueBase > 0;

                          if (!hasBreakdown) {
                            return renderInlineCell("budget", task.budget, "currency");
                          }

                          return (
                            <HoverCard openDelay={200} closeDelay={100}>
                              <HoverCardTrigger asChild>
                                <button className="text-sm font-medium hover:underline hover:text-primary transition-colors" onClick={(e) => { e.stopPropagation(); setEditTaskId(task.id); }}>
                                  {task.budget ? formatCurrency(task.budget, currency) : "–"}
                                </button>
                              </HoverCardTrigger>
                              <HoverCardContent className="w-64 p-3" align="end" side="top">
                                <div className="space-y-1.5 text-xs">
                                  <p className="font-semibold text-sm mb-2">{t("taskCost.customerPrice", "Kundpris")}</p>
                                  {laborTotal > 0 && (
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">{t("taskCost.ownLabor", "Eget arbete")}</span>
                                      <span className="tabular-nums">{formatCurrency(laborTotal, currency)}</span>
                                    </div>
                                  )}
                                  {matBase > 0 && (
                                    <>
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">{t("taskCost.material", "Material")}</span>
                                        <span className="tabular-nums">{formatCurrency(matBase, currency)}</span>
                                      </div>
                                      {matMarkupAmt > 0 && (
                                        <div className="flex justify-between text-amber-700">
                                          <span className="pl-3">{t("taskCost.markupShort", "Påslag")} {matItems.length > 0 && matItems.some(i => i.markup_percent) ? "" : `${matMarkupPct}%`}</span>
                                          <span className="tabular-nums">+{formatCurrency(matMarkupAmt, currency)}</span>
                                        </div>
                                      )}
                                    </>
                                  )}
                                  {ueBase > 0 && (
                                    <>
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">{t("taskCost.subcontractor", "UE")}</span>
                                        <span className="tabular-nums">{formatCurrency(ueBase, currency)}</span>
                                      </div>
                                      {ueMarkupAmt > 0 && (
                                        <div className="flex justify-between text-amber-700">
                                          <span className="pl-3">{t("taskCost.markupShort", "Påslag")} {ueMarkupPct}%</span>
                                          <span className="tabular-nums">+{formatCurrency(ueMarkupAmt, currency)}</span>
                                        </div>
                                      )}
                                    </>
                                  )}
                                  <div className="flex justify-between pt-1.5 border-t font-semibold text-sm">
                                    <span>{t("common.total", "Totalt")}</span>
                                    <span className="tabular-nums text-primary">{formatCurrency(task.budget || 0, currency)}</span>
                                  </div>
                                </div>
                              </HoverCardContent>
                            </HoverCard>
                          );
                        })()}
                      </td>
                      {show.profit && (() => {
                        const rowProfit = calcTaskProfit(task);
                        const laborTotal = (task.estimated_hours || 0) * (task.hourly_rate || 0);
                        const costPct = task.labor_cost_percent ?? profileLaborCostPercent ?? 50;
                        const marginPct = 100 - costPct;
                        const laborProfit = laborTotal * marginPct / 100;
                        const ueProfit = (task.subcontractor_cost || 0) * (task.markup_percent || 0) / 100;
                        const matProfit = rowProfit - laborProfit - ueProfit;

                        return (
                          <td className="text-right hidden sm:table-cell px-3 py-2.5">
                            {rowProfit > 0 ? (
                              <HoverCard openDelay={200} closeDelay={100}>
                                <HoverCardTrigger asChild>
                                  <button className={`text-sm ${rowProfit >= 0 ? "text-green-600" : "text-destructive"} hover:underline`} onClick={(e) => e.stopPropagation()}>
                                    {formatCurrency(rowProfit, currency)}
                                  </button>
                                </HoverCardTrigger>
                                <HoverCardContent className="w-72 p-3" align="end" side="top">
                                  <div className="space-y-2 text-xs">
                                    {laborProfit > 0 && (
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-muted-foreground">{t("planningTasks.estLabor")}:</span>
                                        <span>
                                          {formatCurrency(laborTotal, currency)} ×{" "}
                                          <Popover>
                                            <PopoverTrigger asChild>
                                              <button className="text-green-600 font-medium hover:underline">{marginPct}%</button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-48 p-3" align="end" onClick={(e) => e.stopPropagation()}>
                                              <div className="space-y-2">
                                                <Label className="text-xs">{t("planningTasks.laborMargin", "Labor margin")} (%)</Label>
                                                <div className="flex gap-2">
                                                  <Input
                                                    type="number"
                                                    className="h-7 text-sm w-20"
                                                    defaultValue={marginPct}
                                                    onKeyDown={(e) => {
                                                      if (e.key === "Enter") {
                                                        const val = parseFloat((e.target as HTMLInputElement).value);
                                                        if (!isNaN(val)) handleSaveMargin(task.id, 100 - val);
                                                      }
                                                    }}
                                                    onBlur={(e) => {
                                                      const val = parseFloat(e.target.value);
                                                      if (!isNaN(val) && val !== marginPct) handleSaveMargin(task.id, 100 - val);
                                                    }}
                                                  />
                                                  <span className="text-xs text-muted-foreground self-center">%</span>
                                                </div>
                                              </div>
                                            </PopoverContent>
                                          </Popover>
                                          {" "}= {formatCurrency(Math.round(laborProfit), currency)}
                                        </span>
                                      </div>
                                    )}
                                    {ueProfit > 0 && (
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-muted-foreground">UE:</span>
                                        <span>{formatCurrency(task.subcontractor_cost || 0, currency)} × {task.markup_percent}% = {formatCurrency(Math.round(ueProfit), currency)}</span>
                                      </div>
                                    )}
                                    {matProfit > 0 && (
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-muted-foreground">{t("planningTasks.estMaterial")}:</span>
                                        <span>{formatCurrency(Math.round(matProfit), currency)}</span>
                                      </div>
                                    )}
                                    <div className="border-t pt-1.5 flex items-center justify-between font-medium">
                                      <span>{t("taskCost.result")}:</span>
                                      <span className="text-green-600">{formatCurrency(rowProfit, currency)}</span>
                                    </div>
                                  </div>
                                </HoverCardContent>
                              </HoverCard>
                            ) : (
                              <span className="text-xs text-muted-foreground">–</span>
                            )}
                          </td>
                        );
                      })()}
                      {!effectiveLock && (
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-0.5">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAutoEstimate(task);
                                    }}
                                    disabled={estimatingTaskId === task.id}
                                  >
                                    {estimatingTaskId === task.id ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {t("planningTasks.autoEstimate", "Auto-estimate")}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
                                <MoreVertical className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem onClick={() => setEditTaskId(task.id)}>
                                <Pencil className="h-3.5 w-3.5 mr-2" />
                                {t("common.edit", "Edit")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleAutoEstimate(task)}
                                disabled={estimatingTaskId === task.id}
                              >
                                {estimatingTaskId === task.id
                                  ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                                  : <Sparkles className="h-3.5 w-3.5 mr-2 text-amber-500" />}
                                {t("planningTasks.autoEstimate", "Auto-estimate")}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => {
                                const input = document.getElementById(`file-${task.id}`) as HTMLInputElement;
                                input?.click();
                              }}>
                                <Paperclip className="h-3.5 w-3.5 mr-2" />
                                {t("planningTasks.attachFile", "Attach file")}
                              </DropdownMenuItem>
                              {showTaxDeduction && !isHomeowner && (
                                <DropdownMenuItem onClick={() => handleToggleRot(task.id)}>
                                  <span className="h-3.5 w-3.5 mr-2 text-center text-[10px] font-bold text-green-600">R</span>
                                  {task.rot_eligible
                                    ? t("planningTasks.removeRot", "Ta bort ROT")
                                    : t("planningTasks.applyRot", "Lägg till ROT")}
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => handleDeleteTask(task.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-2" />
                                {t("common.delete", "Delete")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          </div>
                        </td>
                      )}
                    </tr>

                    {/* Material/UE sub-rows */}
                    {isExpanded && taskMaterials.map((mat) => {
                      const hasQtyAndPrice = !!(mat.quantity && mat.quantity > 0 && mat.price_per_unit && mat.price_per_unit > 0);
                      const matTotal = hasQtyAndPrice
                        ? Math.round(mat.quantity! * mat.price_per_unit!)
                        : (mat.price_total ?? 0);
                      const renderMatInline = (
                        matField: "mat_quantity" | "mat_price_per_unit" | "mat_markup_percent" | "mat_price_total",
                        dbField: string,
                        value: number | null,
                        suffix?: string,
                      ) => {
                        // price_total is locked when both qty and unit price are set
                        const isLockedField = matField === "mat_price_total" && hasQtyAndPrice;
                        if (isLockedField) {
                          return matTotal > 0 ? (
                            <span className="text-sm text-muted-foreground">{formatCurrency(matTotal, currency)}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">–</span>
                          );
                        }
                        const isEditingThis = editingCell && "materialId" in editingCell && editingCell.materialId === mat.id && editingCell.field === matField;
                        if (isEditingThis && !effectiveLock) {
                          return (
                            <Input
                              type="number"
                              className="w-16 h-7 text-right text-sm"
                              autoFocus
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleMaterialInlineSave(mat.id, dbField, editValue);
                                if (e.key === "Escape") setEditingCell(null);
                              }}
                              onBlur={() => handleMaterialInlineSave(mat.id, dbField, editValue)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          );
                        }
                        if (effectiveLock) {
                          return value ? (
                            <span className="text-sm text-muted-foreground">{suffix ? `${value}${suffix}` : formatCurrency(value, currency)}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">–</span>
                          );
                        }
                        return (
                          <button
                            className="hover:bg-muted px-1.5 py-0.5 rounded cursor-text text-sm text-muted-foreground"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingCell({ taskId: task.id, field: matField, materialId: mat.id });
                              setEditValue(value != null ? String(value) : "");
                            }}
                          >
                            {value ? (suffix ? `${value}${suffix}` : formatCurrency(value, currency)) : "–"}
                          </button>
                        );
                      };

                      return (
                        <tr
                          key={mat.id}
                          className={`bg-muted/30 hover:bg-muted/50 ${dragOverTarget?.id === mat.id ? (dragOverTarget.position === "above" ? "border-t-2 border-t-primary" : "border-b-2 border-b-primary") : ""}`}
                          draggable={!effectiveLock}
                          onDragStart={(e) => handleRowDragStart(e, "material", mat.id, 0)}
                          onDragEnd={handleRowDragEnd}
                          onDragOver={(e) => handleRowDragOver(e, "material", mat.id)}
                          onDrop={(e) => handleRowDrop(e, "child-material", mat.id)}
                        >
                          {show.costType && (
                            <td className="hidden sm:table-cell px-3 py-2">
                              <MaterialKindIcon
                                kind={mat.kind}
                                editable={!effectiveLock}
                                onChangeKind={(kind) => handleChangeMaterialKind(mat.id, kind)}
                                size="xs"
                              />
                            </td>
                          )}
                          <td className="px-3 py-2 pl-8">
                            <div className="flex items-center gap-1.5">
                              <span className="text-muted-foreground text-xs">└</span>
                              <span className="text-sm">{mat.name}</span>
                              <MaterialFileAttachment materialId={mat.id} projectId={projectId} />
                              {!effectiveLock && (
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <button className="ml-0.5 p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                                      <Link2 className="h-3 w-3" />
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-52 p-2" align="start">
                                    <p className="text-xs font-medium text-muted-foreground mb-2 px-1">
                                      {t("planningTasks.linkToTask")}
                                    </p>
                                    <div className="flex flex-col">
                                      {tasks.filter((tk) => tk.id !== task.id).map((tk) => (
                                        <button
                                          key={tk.id}
                                          className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted text-left"
                                          onClick={() => handleLinkMaterialToTask(mat.id, tk.id)}
                                        >
                                          {tk.title}
                                        </button>
                                      ))}
                                      <div className="border-t mt-1 pt-1">
                                        <button
                                          className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted text-left w-full text-amber-600"
                                          onClick={() => handleUnlinkMaterial(mat.id)}
                                        >
                                          {t("planningTasks.unlinkFromTask")}
                                        </button>
                                      </div>
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              )}
                            </div>
                          </td>
                          {show.description && <td className="hidden sm:table-cell py-2" />}
                          {show.hours && (
                            <td className="text-right hidden sm:table-cell px-3 py-2">
                              {renderMatInline("mat_quantity", "quantity", mat.quantity, ` ${mat.unit && mat.unit !== "kr" ? mat.unit : "st"}`)}
                            </td>
                          )}
                          {show.hourlyRate && (
                            <td className="text-right hidden sm:table-cell px-3 py-2">
                              {renderMatInline("mat_price_per_unit", "price_per_unit", mat.price_per_unit)}
                            </td>
                          )}
                          {show.room && <td className="hidden sm:table-cell py-2" />}
                          {show.markup && (
                            <td className="text-right hidden sm:table-cell px-3 py-2">
                              {renderMatInline("mat_markup_percent", "markup_percent", mat.markup_percent, "%")}
                            </td>
                          )}
                          {(() => {
                            const base = matTotal || 0;
                            const mkp = mat.markup_percent || 0;
                            const cp = mkp > 0 ? Math.round(base * (1 + mkp / 100)) : base;
                            const pr = mkp > 0 ? Math.round(base * mkp / 100) : 0;
                            return (
                              <>
                                {show.budget && <td className="hidden sm:table-cell py-2" />}
                                {show.materialEstimate && <td className="hidden sm:table-cell py-2" />}
                                {show.rotAmount && <td className="hidden sm:table-cell py-2" />}
                                <td className="text-right px-3 py-2">
                                  {cp > 0 && mkp > 0 ? (
                                    <HoverCard openDelay={200} closeDelay={100}>
                                      <HoverCardTrigger asChild>
                                        <button className="text-sm text-muted-foreground hover:underline hover:text-primary transition-colors" onClick={(e) => e.stopPropagation()}>
                                          {formatCurrency(cp, currency)}
                                        </button>
                                      </HoverCardTrigger>
                                      <HoverCardContent className="w-52 p-3" align="end" side="top">
                                        <div className="space-y-1.5 text-xs">
                                          <p className="font-semibold text-sm mb-2">{t("taskCost.customerPrice", "Kundpris")}</p>
                                          <div className="flex justify-between">
                                            <span className="text-muted-foreground">{mat.kind === "subcontractor" ? t("taskCost.subcontractor", "UE") : t("taskCost.material", "Material")}</span>
                                            <span className="tabular-nums">{formatCurrency(base, currency)}</span>
                                          </div>
                                          <div className="flex justify-between text-amber-700">
                                            <span>{t("taskCost.markupShort", "Påslag")} {mkp}%</span>
                                            <span className="tabular-nums">+{formatCurrency(pr, currency)}</span>
                                          </div>
                                          <div className="flex justify-between pt-1.5 border-t font-semibold text-sm">
                                            <span>{t("common.total", "Totalt")}</span>
                                            <span className="tabular-nums text-primary">{formatCurrency(cp, currency)}</span>
                                          </div>
                                        </div>
                                      </HoverCardContent>
                                    </HoverCard>
                                  ) : cp > 0 ? (
                                    <span className="text-sm text-muted-foreground">{formatCurrency(cp, currency)}</span>
                                  ) : null}
                                </td>
                                {show.profit && (
                                  <td className="text-right hidden sm:table-cell px-3 py-2">
                                    {pr > 0 ? (
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <button className="text-sm text-green-600 hover:underline" onClick={(e) => e.stopPropagation()}>
                                            {formatCurrency(pr, currency)}
                                          </button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-56 p-3" align="end" onClick={(e) => e.stopPropagation()}>
                                          <div className="space-y-2 text-xs">
                                            <div className="flex items-center justify-between">
                                              <span className="text-muted-foreground">{t("planningTasks.markup")}:</span>
                                              <span>{formatCurrency(base, currency)} × <span className="text-green-600 font-medium">{mkp}%</span></span>
                                            </div>
                                            <div className="border-t pt-1.5 flex items-center justify-between font-medium">
                                              <span>{t("taskCost.result")}:</span>
                                              <span className="text-green-600">{formatCurrency(pr, currency)}</span>
                                            </div>
                                          </div>
                                        </PopoverContent>
                                      </Popover>
                                    ) : null}
                                  </td>
                                )}
                              </>
                            );
                          })()}
                          {!effectiveLock && (
                            <td className="px-3 py-2">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
                                    <MoreVertical className="h-3.5 w-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                  <DropdownMenuItem onClick={() => {
                                    const input = document.getElementById(`file-${mat.id}`) as HTMLInputElement;
                                    input?.click();
                                  }}>
                                    <Paperclip className="h-3.5 w-3.5 mr-2" />
                                    {t("planningTasks.attachFile", "Attach file")}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => handleDeleteMaterial(mat.id)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5 mr-2" />
                                    {t("common.delete", "Delete")}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                    </React.Fragment>
                    );
                  }})}

                  {/* Unlink drop zone — shown when dragging a linked material */}
                  {isDraggingMaterial && (
                    <tr
                      className={`transition-colors ${unlinkDropHover ? "bg-amber-100 border-2 border-dashed border-amber-400" : "bg-amber-50/50 border-2 border-dashed border-amber-200"}`}
                      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setUnlinkDropHover(true); setDragOverTarget(null); }}
                      onDragLeave={() => setUnlinkDropHover(false)}
                      onDrop={async (e) => {
                        e.preventDefault();
                        const src = dragItem.current;
                        if (src?.type === "material") {
                          const mat = materials.find((m) => m.id === src.id);
                          if (mat?.task_id) {
                            await handleUnlinkMaterial(src.id);
                          }
                        }
                        dragItem.current = null;
                        setDragOverTarget(null);
                        setIsDraggingMaterial(false);
                        setUnlinkDropHover(false);
                      }}
                    >
                      <td colSpan={visibleColCount} className="px-3 py-3 text-center">
                        <span className={`text-sm ${unlinkDropHover ? "text-amber-700 font-medium" : "text-amber-500"}`}>
                          {t("planningTasks.unlinkFromTask", "Make standalone")}
                        </span>
                      </td>
                    </tr>
                  )}

                  {/* Inline add row */}
                  {isAdding && !effectiveLock && (
                    <tr className="hover:bg-transparent">
                      <td colSpan={visibleColCount} className="px-3 py-2.5">
                        <form
                          className="flex items-center gap-2"
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleQuickAdd();
                          }}
                        >
                          <Input
                            autoFocus
                            placeholder={t("planningTasks.taskPlaceholder", "e.g. Demolish bathroom")}
                            value={newTitle}
                            onChange={(e) => setNewTitle(e.target.value)}
                            className="h-8 text-sm"
                            disabled={addingLoading}
                          />
                          <Button
                            type="submit"
                            size="sm"
                            className="h-8 px-3"
                            disabled={!newTitle.trim() || addingLoading}
                          >
                            {t("common.add", "Add")}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2"
                            onClick={() => {
                              setIsAdding(false);
                              setNewTitle("");
                            }}
                          >
                            {t("common.cancel", "Cancel")}
                          </Button>
                        </form>
                      </td>
                    </tr>
                  )}
                </tbody>
                {tasks.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-primary/20 bg-primary/5">
                    {show.costType && <td className="hidden sm:table-cell" />}
                    <td className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("common.total", "Totalt")}
                    </td>
                    {show.description && <td className="hidden sm:table-cell" />}
                    {show.hours && (
                      <td className="text-right hidden sm:table-cell px-2 py-2.5">
                        <span className="text-sm font-semibold tabular-nums">
                          {(() => {
                            const totalHours = tasks.reduce((s, t2) => s + (t2.estimated_hours || 0), 0);
                            return totalHours > 0 ? `${totalHours}h` : null;
                          })()}
                        </span>
                      </td>
                    )}
                    {show.hourlyRate && <td className="hidden sm:table-cell" />}
                    {show.room && <td className="hidden sm:table-cell" />}
                    {show.markup && <td className="hidden sm:table-cell" />}
                    {show.budget && <td className="hidden sm:table-cell" />}
                    {show.materialEstimate && (
                      <td className="text-right hidden sm:table-cell px-3 py-2.5">
                        {(() => {
                          const totalMat = tasks.reduce((s, t2) => s + (t2.material_estimate || 0), 0);
                          return totalMat > 0 ? (
                            <span className="text-sm font-bold tabular-nums text-amber-700">{formatCurrency(totalMat, currency)}</span>
                          ) : null;
                        })()}
                      </td>
                    )}
                    {show.rotAmount && (
                      <td className="text-right hidden sm:table-cell px-3 py-2.5">
                        {(() => {
                          const totalRot = tasks.reduce((s, t2) => s + (t2.rot_amount || 0), 0);
                          return totalRot > 0 ? (
                            <span className="text-sm font-bold tabular-nums text-green-700">{formatCurrency(totalRot, currency)}</span>
                          ) : null;
                        })()}
                      </td>
                    )}
                    <td className="text-right px-3 py-2.5">
                      <span className="text-sm font-bold tabular-nums text-primary">
                        {formatCurrency(totalBudget, currency)}
                      </span>
                    </td>
                    {show.profit && (
                      <td className="text-right hidden sm:table-cell px-3 py-2.5">
                        <span className={`text-sm font-bold tabular-nums ${totalProfit >= 0 ? "text-green-600" : "text-destructive"}`}>
                          {totalProfit > 0 ? formatCurrency(totalProfit, currency) : null}
                        </span>
                      </td>
                    )}
                    {!effectiveLock && <td />}
                  </tr>
                </tfoot>
                )}
              </table>
            </div>

            {/* Action bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 mt-4">
              <div className="flex flex-wrap items-center gap-2">
                {!effectiveLock && (
                  <>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsAdding(true)}
                            disabled={isAdding}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            {t("planningTasks.addTask", "Task")}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs max-w-[200px]">{t("planningTasks.addTaskHint", "Add a work item such as painting, demolition, or tiling")}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { setAddMaterialKind("material"); setAddMaterialOpen(true); }}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            {t("planningTasks.addCost", "Cost")}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs max-w-[300px]">{t("planningTasks.addCostHint")}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={uploadDialog.triggerUpload}
                            className="gap-1"
                          >
                            <FileUp className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs max-w-[220px]">{t("planningTasks.uploadFileHint", "Upload a file — attach as reference or smart-import with AI")}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <input
                      ref={uploadDialog.fileRef}
                      type="file"
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png,.heic,.doc,.docx,.xls,.xlsx,.txt"
                      onChange={uploadDialog.onFileSelected}
                    />
                  </>
                )}

                {/* Column visibility toggle */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="icon" className="h-8 w-8" title={t("budget.columns", "Columns")}>
                      <Columns3 className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-52" align="start">
                    <div className="space-y-2">
                      <p className="text-sm font-medium mb-2">
                        {t("planningTasks.showColumns", "Show columns")}
                      </p>
                      {availableColumns.map((col) => (
                        <label
                          key={col.key}
                          className="flex items-center gap-2 text-sm cursor-pointer"
                        >
                          <Checkbox
                            checked={visibleExtras.has(col.key)}
                            onCheckedChange={() => toggleColumn(col.key)}
                          />
                          {t(col.labelKey)}
                        </label>
                      ))}
                      <div className="border-t pt-2 mt-2">
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            checked={groupByCategory}
                            onCheckedChange={(v) => {
                              setGroupByCategory(!!v);
                              if (!v) setCollapsedGroups(new Set());
                            }}
                          />
                          {t("planningTasks.groupByCategory", "Gruppera per kategori")}
                        </label>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {!effectiveLock && tasks.length > 0 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => setConfirmActivate(true)}
                  >
                    <Play className="h-3.5 w-3.5" />
                    {t("planningTasks.activateProject", "Activate project")}
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1"
                    onClick={() => onCreateQuote?.()}
                  >
                    {t("projectStatus.cta.generateQuote", "Generate quote")}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <TaskEditDialog
        taskId={editTaskId}
        projectId={projectId}
        open={editTaskId !== null}
        onOpenChange={(open) => !open && setEditTaskId(null)}
        onSaved={() => fetchData()}
        currency={currency}
        projectStatus="planning"
      />

      <PlanningSmartImportDialog
        projectId={projectId}
        open={smartImportOpen}
        onOpenChange={setSmartImportOpen}
        onImportComplete={() => fetchData()}
      />

      <UploadFileDialog
        projectId={projectId}
        targets={[
          ...tasks.map((t) => ({ id: t.id, name: t.title, type: "task" as const })),
          ...materials.map((m) => ({ id: m.id, name: m.name, type: "material" as const })),
        ]}
        open={uploadDialog.open}
        onOpenChange={uploadDialog.setOpen}
        pendingFile={uploadDialog.pendingFile}
        onComplete={() => fetchData()}
        onSmartImport={() => {
          uploadDialog.setOpen(false);
          setSmartImportOpen(true);
        }}
      />

      {/* Estimate feedback dialog — centered, impossible to miss */}
      <AlertDialog open={estimateFeedback !== null} onOpenChange={(open) => !open && setEstimateFeedback(null)}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              {estimateFeedback?.title}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 pt-1">
                {estimateFeedback?.lines.map((line, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    {line.icon === "success" && <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />}
                    {line.icon === "warning" && <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />}
                    {line.icon === "error" && <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />}
                    <span className={line.icon === "error" ? "text-destructive" : "text-foreground"}>{line.text}</span>
                  </div>
                ))}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>{t("common.ok", "OK")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AddMaterialDialog
        open={addMaterialOpen}
        onOpenChange={setAddMaterialOpen}
        tasks={tasks.map((t) => ({ id: t.id, title: t.title }))}
        initialKind={addMaterialKind}
        onAdd={handleAddMaterialSubmit}
      />

      {/* Confirm activate project without quote */}
      <AlertDialog open={confirmActivate} onOpenChange={setConfirmActivate}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Play className="h-4 w-4 text-primary" />
              {t("planningTasks.activateProject", "Activate project")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("planningTasks.activateConfirm", "Activate the project without creating a quote first? You can still create quotes later.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleActivateProject} disabled={activating}>
              {activating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {t("planningTasks.activateProject", "Activate project")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

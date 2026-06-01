import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useTaxDeductionVisible } from "@/hooks/useTaxDeduction";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Trash2, Send, ClipboardList, Info, Columns3, Play, Bell, X, Sparkles, ChevronDown, ChevronRight, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  detectWorkType,
  computeFloorAreaSqm,
  WORK_TYPE_LABEL_KEYS,
  type RecipeRoom,
} from "@/lib/materialRecipes";
import { formatCurrency } from "@/lib/currency";
import { useMeasurement } from "@/contexts/MeasurementContext";
import { PlanningRoomList } from "./PlanningRoomList";
import { ShareRfqDialog } from "./ShareRfqDialog";
import { GuestLoginPrompt } from "@/components/guest/GuestLoginPrompt";
import { StartProjectModal } from "./StartProjectModal";
import { PlanningWizard } from "./planning-wizard/PlanningWizard";
import { useGuestMode } from "@/hooks/useGuestMode";
import { ImportQuotePopover, type ExternalQuote } from "./ImportQuotePopover";
import { MaterialFormulaPopover } from "./MaterialFormulaPopover";
import { ExternalQuoteCell, type QuoteAssignment } from "./ExternalQuoteCell";
import { PlanningSmartImportDialog } from "./PlanningSmartImportDialog";
import {
  TASK_CATEGORY_LABELS,
  TASK_CATEGORY_TO_COST_CENTER,
  type TaskCategory,
} from "@/services/aiDocumentService.types";

const VAT_RATE = 0.25;

// Reverse map: cost_center value → Swedish label
const COST_CENTER_LABELS: Record<string, string> = Object.entries(TASK_CATEGORY_TO_COST_CENTER).reduce(
  (acc, [cat, cc]) => {
    if (!acc[cc]) acc[cc] = TASK_CATEGORY_LABELS[cat as TaskCategory];
    return acc;
  },
  {} as Record<string, string>
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HomeownerTask {
  id: string;
  title: string;
  description: string | null;
  room_id: string | null;
  room_ids: string[] | null;
  room_names: string[];
  cost_center: string | null;
  status: string;
  budget: number | null;
  material_estimate: number | null;
  rot_amount: number | null;
}

interface Room {
  id: string;
  name: string;
  dimensions: RecipeRoom["dimensions"];
  ceiling_height_mm: number | null;
}

// ---------------------------------------------------------------------------
// Column visibility config
// ---------------------------------------------------------------------------

type ExtraColumnKey = "description" | "room" | "area" | "quote" | "budget" | "materialEstimate" | "rotAmount";

interface ExtraColumnDef {
  key: ExtraColumnKey;
  labelKey: string;
  defaultOn: boolean;
}

const EXTRA_COLUMNS: ExtraColumnDef[] = [
  { key: "description", labelKey: "tasks.description", defaultOn: true },
  { key: "room", labelKey: "tasks.room", defaultOn: true },
  { key: "area", labelKey: "homeownerPlanning.area", defaultOn: true },
  { key: "quote", labelKey: "homeownerPlanning.quote", defaultOn: true },
  { key: "budget", labelKey: "planningTasks.budget", defaultOn: false },
  { key: "materialEstimate", labelKey: "planningTasks.materialEstimate", defaultOn: false },
  { key: "rotAmount", labelKey: "files.rotAmount", defaultOn: false },
];

const PREFS_KEY = (projectId: string) => `homeowner-planning-cols-${projectId}`;

function loadVisibleExtras(projectId: string): Set<ExtraColumnKey> {
  try {
    const raw = localStorage.getItem(PREFS_KEY(projectId));
    if (raw) return new Set(JSON.parse(raw) as ExtraColumnKey[]);
  } catch { /* ignore */ }
  return new Set(EXTRA_COLUMNS.filter((c) => c.defaultOn).map((c) => c.key));
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ProjectReminder {
  id: string;
  titleKey: string;
  bodyKey: string;
  severity: "warning" | "info";
  actionTarget?: string;
  actionKey?: string;
}

interface HomeownerPlanningViewProps {
  projectId: string;
  projectName?: string;
  projectAddress?: string;
  currency?: string | null;
  onActivate?: () => void;
  /** When true, hides owner-only actions (activate, import quote, share RFQ) */
  contributorMode?: boolean;
  /** When true, planning is read-only because the project has been activated */
  locked?: boolean;
  /** Callback to navigate to another tab */
  onNavigateTab?: (tab: string) => void;
  reminders?: ProjectReminder[];
  onDismissReminder?: (id: string) => void;
  onDismissAllReminders?: () => void;
  /** Callback to expose header actions (activate + reminders) to parent */
  onHeaderActions?: (actions: React.ReactNode) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HomeownerPlanningView({
  projectId,
  projectName,
  projectAddress,
  currency,
  onActivate,
  contributorMode = false,
  locked = false,
  onNavigateTab,
  reminders = [],
  onDismissReminder,
  onDismissAllReminders,
  onHeaderActions,
}: HomeownerPlanningViewProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const ms = useMeasurement();
  const { showTaxDeduction } = useTaxDeductionVisible();
  const { isGuest } = useGuestMode();
  const [tasks, setTasks] = useState<HomeownerTask[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [loginPromptAction, setLoginPromptAction] = useState<"activate" | "share_rfq" | null>(null);
  const [showStartModal, setShowStartModal] = useState(false);
  const [wizardDismissed, setWizardDismissed] = useState(false);
  // Latch: once we show the wizard, don't yank it away on background re-fetches
  const wizardShownRef = useRef(false);

  // Inline add
  const [isAdding, setIsAdding] = useState(false);
  const [smartImportOpen, setSmartImportOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [addingLoading, setAddingLoading] = useState(false);

  // Inline editing
  const [editingCell, setEditingCell] = useState<{ taskId: string; field: "title" | "description" | "room_id" | "budget" | "material_estimate" | "rot_amount" } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [newRoomName, setNewRoomName] = useState("");

  // Column header context menu
  const [headerMenu, setHeaderMenu] = useState<{ x: number; y: number } | null>(null);

  // Column visibility
  const [visibleExtras, setVisibleExtras] = useState<Set<ExtraColumnKey>>(
    () => loadVisibleExtras(projectId)
  );

  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  // External quotes
  const [externalQuotes, setExternalQuotes] = useState<ExternalQuote[]>([]);
  const [quoteAssignments, setQuoteAssignments] = useState<QuoteAssignment[]>([]);

  // Material info per task
  interface TaskMaterial { id: string; name: string; price_total: number | null; price_per_unit: number | null; quantity: number | null; unit: string | null; formula: string | null }
  const [taskMaterials, setTaskMaterials] = useState<Map<string, TaskMaterial[]>>(new Map());

  // Category grouping
  const [groupByCategory, setGroupByCategory] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Persist column prefs (localStorage + server sync)
  useEffect(() => {
    const key = PREFS_KEY(projectId);
    const arr = [...visibleExtras];
    localStorage.setItem(key, JSON.stringify(arr));
    import("@/hooks/usePersistedPreference").then(({ scheduleServerSync }) => scheduleServerSync(key, arr));
  }, [visibleExtras, projectId]);

  const toggleColumn = useCallback((key: ExtraColumnKey) => {
    setVisibleExtras((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const show = useMemo(() => ({
    description: visibleExtras.has("description"),
    room: visibleExtras.has("room"),
    area: visibleExtras.has("area"),
    quote: !contributorMode && visibleExtras.has("quote"),
    budget: visibleExtras.has("budget"),
    materialEstimate: visibleExtras.has("materialEstimate"),
    rotAmount: showTaxDeduction && visibleExtras.has("rotAmount"),
  }), [visibleExtras, contributorMode, showTaxDeduction]);

  // ---------- Fetch ----------
  const fetchTasks = useCallback(async () => {
    const { data } = await supabase
      .from("tasks")
      .select("id, title, description, room_id, room_ids, cost_center, status, budget, material_estimate, rot_amount")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    if (data) {
      setTasks(
        data.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          room_id: t.room_id,
          room_ids: t.room_ids as string[] | null,
          room_names: [],
          cost_center: t.cost_center,
          status: t.status,
          budget: t.budget,
          material_estimate: t.material_estimate,
          rot_amount: t.rot_amount,
        }))
      );
    }
    setLoading(false);
  }, [projectId]);

  const fetchRooms = useCallback(async () => {
    const { data } = await supabase
      .from("rooms")
      .select("id, name, dimensions, ceiling_height_mm")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });
    if (data) setRooms(data as Room[]);
  }, [projectId]);

  const fetchExternalQuotes = useCallback(async () => {
    // Fetch quotes
    const { data: quotesData } = await supabase
      .from("external_quotes")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    // Fetch all assignments for this project's quotes
    const { data: assignmentsData } = await supabase
      .from("external_quote_assignments")
      .select("id, external_quote_id, task_id, allocated_amount")
      .in(
        "external_quote_id",
        (quotesData ?? []).map((q) => q.id)
      );

    const assignments = (assignmentsData ?? []) as QuoteAssignment[];
    setQuoteAssignments(assignments);

    // Enrich quotes with allocation info
    const enriched: ExternalQuote[] = (quotesData ?? []).map((q) => {
      const qAssignments = assignments.filter((a) => a.external_quote_id === q.id);
      return {
        ...q,
        total_amount: Number(q.total_amount) || 0,
        allocated: qAssignments.reduce((sum, a) => sum + (Number(a.allocated_amount) || 0), 0),
        task_count: qAssignments.length,
      };
    });
    setExternalQuotes(enriched);
  }, [projectId]);

  const fetchTaskMaterials = useCallback(async () => {
    const { data } = await supabase
      .from("materials")
      .select("id, task_id, name, price_total, price_per_unit, quantity, unit, description")
      .eq("project_id", projectId)
      .not("task_id", "is", null);
    if (data) {
      const map = new Map<string, TaskMaterial[]>();
      for (const m of data) {
        if (!m.task_id) continue;
        if (!map.has(m.task_id)) map.set(m.task_id, []);
        map.get(m.task_id)!.push({
          id: m.id,
          name: m.name,
          price_total: m.price_total,
          price_per_unit: m.price_per_unit,
          quantity: m.quantity,
          unit: m.unit,
          formula: m.description !== "__subcontractor__" ? m.description : null,
        });
      }
      setTaskMaterials(map);
    }
  }, [projectId]);

  useEffect(() => {
    fetchTasks();
    fetchRooms();
    fetchExternalQuotes();
    fetchTaskMaterials();
  }, [fetchTasks, fetchRooms, fetchExternalQuotes, fetchTaskMaterials]);

  // Resolve room names from room_ids
  const roomMap = new Map(rooms.map((r) => [r.id, r]));
  const tasksWithRoomNames = tasks.map((task) => {
    const ids = task.room_ids?.length ? task.room_ids : task.room_id ? [task.room_id] : [];
    return {
      ...task,
      room_ids: ids,
      room_names: ids.map((id) => roomMap.get(id)?.name ?? "?"),
    };
  });

  // ---------- Actions ----------
  const addTask = async () => {
    if (!newTitle.trim()) return;
    setAddingLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();
      if (!profile) throw new Error("Profile not found");

      const { error } = await supabase.from("tasks").insert({
        project_id: projectId,
        title: newTitle.trim(),
        status: "to_do",
        created_by_user_id: profile.id,
      });
      if (error) throw error;
      setNewTitle("");
      setIsAdding(false);
      fetchTasks();
    } catch {
      toast({ variant: "destructive", description: t("common.errorSaving") });
    }
    setAddingLoading(false);
  };

  const deleteTask = async (taskId: string) => {
    await supabase.from("tasks").delete().eq("id", taskId);
    fetchTasks();
  };

  const commitCellEdit = async () => {
    if (!editingCell || editingCell.field === "room_id") return;
    const momsFields = ["budget", "material_estimate"]; // These are shown inc moms → convert back
    const numericFields = ["budget", "material_estimate", "rot_amount"];
    let value: string | number | null;
    if (numericFields.includes(editingCell.field)) {
      const parsed = editValue ? parseFloat(editValue) : null;
      // Budget/material_estimate: homeowner enters inc moms → convert to ex moms for DB
      // ROT amount: entered as-is (tax deduction, not VAT-affected)
      value = parsed !== null && momsFields.includes(editingCell.field)
        ? Math.round(parsed / (1 + VAT_RATE))
        : parsed;
    } else {
      value = editValue || null;
    }
    await supabase
      .from("tasks")
      .update({ [editingCell.field]: value })
      .eq("id", editingCell.taskId);
    setEditingCell(null);
    fetchTasks();
  };

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
        fetchTasks();
      }
    },
    [tasks, fetchTasks, t, toast]
  );

  const handleClearRooms = useCallback(
    async (taskId: string) => {
      await supabase
        .from("tasks")
        .update({ room_ids: [], room_id: null })
        .eq("id", taskId);
      setEditingCell(null);
      fetchTasks();
    },
    [fetchTasks]
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
        toast({ title: t("common.error"), description: createErr?.message || "Failed", variant: "destructive" });
        return;
      }

      await handleRoomToggle(taskId, room.id);
      setNewRoomName("");
      fetchRooms();
    },
    [projectId, handleRoomToggle, fetchRooms, t, toast]
  );

  // ---------- Activate project ----------
  const handleActivate = async () => {
    setActivating(true);
    try {
      const { error } = await supabase
        .from("projects")
        .update({ status: "active" })
        .eq("id", projectId);
      if (error) throw error;

      // Get auth user for created_by
      const { data: authData } = await supabase.auth.getUser();
      const { data: profileRow } = authData?.user
        ? await supabase.from("profiles").select("id").eq("user_id", authData.user.id).single()
        : { data: null };
      const creatorId = profileRow?.id ?? null;

      // Transition planned tasks to to_do so they appear in kanban
      const { data: plannedTasks } = await supabase
        .from("tasks")
        .select("id, title, material_estimate, material_items")
        .eq("project_id", projectId)
        .eq("status", "planned");

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
      onActivate?.();
    } catch {
      toast({ variant: "destructive", description: t("common.errorSaving") });
    } finally {
      setActivating(false);
    }
  };

  // ---------- Helpers ----------
  const getTaskAreaSqm = (task: HomeownerTask): number | null => {
    const ids = task.room_ids?.length ? task.room_ids : task.room_id ? [task.room_id] : [];
    if (ids.length === 0) return null;
    let total = 0;
    let hasAny = false;
    for (const id of ids) {
      const room = roomMap.get(id);
      if (!room) continue;
      const area = computeFloorAreaSqm(room as RecipeRoom);
      if (area != null) {
        total += area;
        hasAny = true;
      }
    }
    return hasAny ? total : null;
  };

  // ---------- Summary ----------
  const totalTasks = tasks.length;
  const linkedTasks = tasks.filter((t) => {
    const ids = t.room_ids?.length ? t.room_ids : t.room_id ? [t.room_id] : [];
    return ids.length > 0;
  }).length;
  const totalQuoted = quoteAssignments.reduce((sum, a) => sum + (Number(a.allocated_amount) || 0), 0);
  const totalAreaSqm = rooms.reduce((sum, room) => {
    const area = computeFloorAreaSqm(room as RecipeRoom);
    return sum + (area ?? 0);
  }, 0);
  const totalBudget = tasks.reduce((sum, t) => sum + (t.budget || 0), 0);
  // Material total: prefer task.material_estimate, fall back to sum of auto-generated materials
  const totalMaterialEstimate = tasks.reduce((sum, t) => {
    if (t.material_estimate) return sum + t.material_estimate;
    const mats = taskMaterials.get(t.id);
    if (mats) return sum + mats.reduce((s, m) => s + (m.price_total ?? 0), 0);
    return sum;
  }, 0);
  const totalRot = tasks.reduce((sum, t) => sum + (t.rot_amount || 0), 0);

  // ---------- Category grouping ----------
  const toggleGroup = useCallback((category: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }, []);

  type DisplayItem =
    | { type: "task"; task: HomeownerTask & { room_names: string[] } }
    | { type: "groupHeader"; category: string; count: number; budget: number };

  const displayItems = useMemo((): DisplayItem[] => {
    const withRooms = tasksWithRoomNames;
    if (!groupByCategory) return withRooms.map((t) => ({ type: "task" as const, task: t }));

    // Group by cost_center
    const groups = new Map<string, typeof withRooms>();
    for (const task of withRooms) {
      const cat = task.cost_center || "ovrigt";
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(task);
    }

    const items: DisplayItem[] = [];
    Array.from(groups.entries()).forEach(([category, groupTasks]) => {
      const groupBudget = groupTasks.reduce((s, t) => s + (t.budget || 0), 0);
      items.push({ type: "groupHeader", category, count: groupTasks.length, budget: groupBudget });
      if (!collapsedGroups.has(category)) {
        for (const task of groupTasks) {
          items.push({ type: "task", task });
        }
      }
    });
    return items;
  }, [tasksWithRoomNames, groupByCategory, collapsedGroups]);

  // Note: actions live inline in the intro card now (see render).
  // The legacy onHeaderActions pipeline was never wired in ProjectDetail and
  // hid the buttons entirely. Keep the prop for API compatibility but don't use it.

  // ---------- Render ----------
  if (loading) {
    return <div className="space-y-4 animate-pulse"><div className="h-32 bg-muted rounded-lg" /><div className="h-48 bg-muted rounded-lg" /></div>;
  }

  // Show wizard when project has no tasks (empty state)
  // Once shown, latch it — don't yank away on background re-fetches that
  // temporarily make tasks.length > 0 or cause a remount.
  const shouldShowWizard = tasks.length === 0 && !wizardDismissed && !contributorMode;
  if (shouldShowWizard) wizardShownRef.current = true;
  const showWizard = wizardShownRef.current && !wizardDismissed;

  if (showWizard) {
    return (
      <PlanningWizard
        projectId={projectId}
        onComplete={() => { wizardShownRef.current = false; fetchTasks(); fetchRooms(); setWizardDismissed(true); }}
        onSkip={() => { wizardShownRef.current = false; setWizardDismissed(true); }}
      />
    );
  }

  return (
    <div className={cn("space-y-6", locked && "select-none")}>
      {/* Locked banner — project has been activated */}
      {locked && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-5 flex flex-col sm:flex-row gap-4 items-start">
          <div className="w-10 h-10 rounded-lg bg-amber-100 grid place-items-center shrink-0 mt-0.5">
            <Lock className="h-5 w-5 text-amber-700" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-medium tracking-tight text-amber-900">
              {t("homeownerPlanning.lockedTitle", "Planeringen är låst")}
            </h3>
            <p className="text-sm text-amber-800/80 mt-1 leading-relaxed">
              {t("homeownerPlanning.lockedDescription", "Projektet har aktiverats och planeringen kan inte längre redigeras. Tillägg och ändringar görs via Arbeten eller genom en ny offert.")}
            </p>
            <div className="flex gap-2 mt-3">
              {onNavigateTab && (
                <Button variant="outline" size="sm" className="gap-1.5 border-amber-300 hover:bg-amber-100/60" onClick={() => onNavigateTab("tasks")}>
                  <ClipboardList className="h-3.5 w-3.5" />
                  {t("homeownerPlanning.goToTasks", "Gå till Arbeten")}
                </Button>
              )}
              {onNavigateTab && (
                <Button variant="outline" size="sm" className="gap-1.5 border-amber-300 hover:bg-amber-100/60" onClick={() => onNavigateTab("purchases")}>
                  <Send className="h-3.5 w-3.5" />
                  {t("homeownerPlanning.newQuote", "Ny offert")}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Intro card — explains what Planning is for + primary CTAs */}
      {!locked && (
      <div className="rounded-xl border border-border/60 bg-card p-5 flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="w-10 h-10 rounded-lg bg-primary/10 grid place-items-center shrink-0 mt-0.5">
          <ClipboardList className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-medium tracking-tight">
            {t("homeownerPlanning.introTitle", "Planera ditt projekt")}
          </h3>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            {t("homeownerPlanning.introDescription", "Lägg till rum, beskriv arbetsuppgifter och uppskatta kostnader. När du är nöjd kan du skapa en offert eller aktivera projektet.")}
          </p>
        </div>
        {!contributorMode && totalTasks > 0 && (
          <div className="flex flex-wrap items-center gap-2 sm:flex-shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => isGuest ? setLoginPromptAction("share_rfq") : setShareDialogOpen(true)}
            >
              <Send className="h-3.5 w-3.5" />
              {t("homeownerPlanning.requestQuote", "Be om offert")}
            </Button>
            <Button
              size="sm"
              variant="default"
              className="gap-1.5"
              onClick={() => isGuest ? setLoginPromptAction("activate") : setShowStartModal(true)}
              disabled={activating}
            >
              <Play className="h-3.5 w-3.5" />
              {t("homeownerPlanning.activateProject", "Starta projekt")}
            </Button>
          </div>
        )}
      </div>
      )}

      {/* Planning content — disabled overlay when locked */}
      <div className={cn("space-y-6", locked && "pointer-events-none opacity-60")}>

      {/* Task list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            <div>
              <h3 className="text-base font-semibold">{t("homeownerPlanning.whatToDo", "What needs to be done?")}</h3>
              <p className="text-sm text-muted-foreground">{t("homeownerPlanning.whatToDoDesc", "List every type of work. Connect each task to a room for better estimates.")}</p>
            </div>
          </div>
            <div className="flex items-center gap-2">
              {/* Import quote — populates table with quote data */}
              {!contributorMode && (
                <ImportQuotePopover
                  projectId={projectId}
                  quotes={externalQuotes}
                  currency={currency}
                  onQuotesChange={fetchExternalQuotes}
                  onSmartImport={() => setSmartImportOpen(true)}
                />
              )}
              {/* Group by category toggle */}
              <Button
                variant={groupByCategory ? "default" : "outline"}
                size="icon"
                className="h-8 w-8 shrink-0"
                title={t("homeownerPlanning.groupByCategory", "Group by category")}
                onClick={() => setGroupByCategory((prev) => !prev)}
              >
                <ClipboardList className="h-4 w-4" />
              </Button>
              {/* Column toggle */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" title={t("budget.columns", "Columns")}>
                    <Columns3 className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
              <PopoverContent className="w-52" align="end">
                <div className="space-y-2">
                  <p className="text-sm font-medium mb-2">{t("planningTasks.showColumns", "Show columns")}</p>
                  {EXTRA_COLUMNS.filter((col) => (!contributorMode || col.key !== "quote") && (showTaxDeduction || col.key !== "rotAmount")).map((col) => (
                    <label key={col.key} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={visibleExtras.has(col.key)}
                        onCheckedChange={() => toggleColumn(col.key)}
                      />
                      {t(col.labelKey)}
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            </div>
          </div>
        </div>
            <div className="rounded-lg border bg-card overflow-auto max-h-[calc(100vh-20rem)] mb-3">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-muted border-b" onContextMenu={(e) => { e.preventDefault(); setHeaderMenu({ x: e.clientX, y: e.clientY }); }}>
                    <th className="px-3 py-2.5 kicker text-left min-w-[140px]">{t("planningTasks.task", "Task")}</th>
                    {show.description && <th className="px-3 py-2.5 kicker text-left min-w-[120px]">{t("tasks.description", "Description")}</th>}
                    {show.room && <th className="px-3 py-2.5 kicker text-left min-w-[100px]">{t("tasks.room", "Room")}</th>}
                    {show.area && <th className="px-3 py-2.5 kicker text-right min-w-[60px] hidden sm:table-cell">{t("homeownerPlanning.area", "Area")}</th>}
                    {show.quote && <th className="px-3 py-2.5 kicker text-center min-w-[80px]">{t("homeownerPlanning.quote", "Quote")}</th>}
                    {show.budget && <th className="px-3 py-2.5 kicker text-right min-w-[90px]">{t("planningTasks.budget", "Budget")} <span className="text-[10px] font-normal text-muted-foreground">({t("budget.incVat", "ink. moms")})</span></th>}
                    {show.materialEstimate && <th className="px-3 py-2.5 kicker text-right min-w-[100px]">{t("planningTasks.materialEstimate", "Materialbudget")} <span className="text-[10px] font-normal text-muted-foreground">({t("budget.incVat", "ink. moms")})</span></th>}
                    {show.rotAmount && <th className="px-3 py-2.5 kicker text-right min-w-[80px]">{t("files.rotAmount", "ROT-avdrag")}</th>}
                    <th className="px-3 py-2.5 kicker w-[40px]" />
                  </tr>
                </thead>
                <tbody>
                  {displayItems.map((item) => {
                    if (item.type === "groupHeader") {
                      const colSpan = 1 + (show.description ? 1 : 0) + (show.room ? 1 : 0) + (show.area ? 1 : 0) + (show.quote ? 1 : 0) + (show.budget ? 1 : 0) + (show.materialEstimate ? 1 : 0) + (show.rotAmount ? 1 : 0) + 1;
                      const isCollapsed = collapsedGroups.has(item.category);
                      const label = COST_CENTER_LABELS[item.category] || TASK_CATEGORY_LABELS[item.category as TaskCategory] || item.category;
                      return (
                        <tr key={`group-${item.category}`} className="bg-muted/50 hover:bg-muted/70 border-b transition-colors">
                          <td colSpan={colSpan} className="px-3 py-2.5">
                            <button
                              type="button"
                              className="flex items-center gap-2 w-full text-left font-medium text-sm"
                              onClick={() => toggleGroup(item.category)}
                            >
                              {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              <span>{label}</span>
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{item.count}</Badge>
                              {item.budget > 0 && (
                                <span className="ml-auto text-xs tabular-nums text-muted-foreground font-normal">
                                  {formatCurrency(Math.round(item.budget * (1 + VAT_RATE)), currency)}
                                </span>
                              )}
                            </button>
                          </td>
                        </tr>
                      );
                    }

                    const task = item.task;
                    const workType = detectWorkType(task);
                    const areaSqm = getTaskAreaSqm(task);
                    const mats = taskMaterials.get(task.id) || [];
                    const matCount = mats.length;
                    return (
                      <tr key={task.id} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                        {/* Title — always visible */}
                        <td className="font-medium px-3 py-2.5">
                          {editingCell?.taskId === task.id && editingCell.field === "title" ? (
                            <Input
                              autoFocus
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitCellEdit();
                                if (e.key === "Escape") setEditingCell(null);
                              }}
                              onBlur={commitCellEdit}
                              className="h-7 text-sm"
                            />
                          ) : (
                            <div className="flex items-center gap-1.5 min-w-0">
                              <button
                                type="button"
                                className="text-left hover:bg-muted px-1.5 py-0.5 rounded cursor-text flex items-center gap-1.5 max-w-[180px] min-w-0"
                                onClick={() => {
                                  setEditingCell({ taskId: task.id, field: "title" });
                                  setEditValue(task.title);
                                }}
                              >
                                {workType && (
                                  <Badge variant="outline" className="text-[10px] px-1 py-0 font-normal shrink-0">
                                    {t(WORK_TYPE_LABEL_KEYS[workType], workType)}
                                  </Badge>
                                )}
                                <span className="break-words">{task.title}</span>
                              </button>
                              {matCount > 0 && (() => {
                                const ids = task.room_ids?.length ? task.room_ids : task.room_id ? [task.room_id] : [];
                                return (
                                  <MaterialFormulaPopover
                                    taskId={task.id}
                                    taskTitle={task.title}
                                    taskCostCenter={task.cost_center}
                                    projectId={projectId}
                                    materials={mats}
                                    rooms={ids.map((id) => roomMap.get(id)).filter(Boolean) as RecipeRoom[]}
                                    roomIds={ids}
                                    onChanged={fetchTaskMaterials}
                                    isHomeowner
                                  />
                                );
                              })()}
                            </div>
                          )}
                        </td>

                        {/* Description */}
                        {show.description && (
                        <td className="text-muted-foreground text-sm px-3 py-2.5">
                          {editingCell?.taskId === task.id && editingCell.field === "description" ? (
                            <Input
                              autoFocus
                              value={editValue}
                              placeholder={t("homeownerPlanning.descPlaceholder", "e.g. white matte paint, keep ceiling")}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitCellEdit();
                                if (e.key === "Escape") setEditingCell(null);
                              }}
                              onBlur={commitCellEdit}
                              className="h-7 text-sm"
                            />
                          ) : (
                            <button
                              type="button"
                              className="text-left w-full hover:bg-muted px-1.5 py-0.5 rounded cursor-text text-sm text-muted-foreground break-words block max-w-full"
                              onClick={() => {
                                setEditingCell({ taskId: task.id, field: "description" });
                                setEditValue(task.description ?? "");
                              }}
                            >
                              {task.description || (
                                <span className="text-muted-foreground/40 italic text-xs">
                                  {t("homeownerPlanning.addDetails", "Add details...")}
                                </span>
                              )}
                            </button>
                          )}
                        </td>
                        )}

                        {/* Room — multi-select popover with inline create */}
                        {show.room && (
                        <td className="px-3 py-2.5">
                          {editingCell?.taskId === task.id && editingCell?.field === "room_id" ? (
                            <Popover open onOpenChange={(isOpen) => { if (!isOpen) { setEditingCell(null); setNewRoomName(""); } }}>
                              <PopoverTrigger asChild>
                                <button className="text-sm text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
                                  {task.room_names.length > 0 ? task.room_names.join(", ") : "–"}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-52 p-1" align="start">
                                <div className="space-y-0.5">
                                  {rooms.map((r) => {
                                    const checked = task.room_ids.includes(r.id);
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
                                  {task.room_ids.length > 0 && (
                                    <button
                                      className="w-full text-left text-xs text-muted-foreground px-2 py-1 hover:bg-muted rounded"
                                      onClick={() => handleClearRooms(task.id)}
                                    >
                                      {t("common.clearAll", "Clear all")}
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
                          ) : (
                            <button
                              className="hover:bg-muted px-1.5 py-0.5 rounded cursor-pointer text-sm text-muted-foreground text-left max-w-[120px] truncate block"
                              title={task.room_names.join(", ")}
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

                        {/* Area (m²) */}
                        {show.area && (
                        <td className="text-right text-xs tabular-nums text-muted-foreground hidden sm:table-cell px-3 py-2.5">
                          {areaSqm != null ? `${areaSqm.toFixed(1)} ${ms.areaLabel}` : "–"}
                        </td>
                        )}

                        {/* Quote */}
                        {show.quote && (
                        <td className="px-3 py-2.5">
                          <ExternalQuoteCell
                            taskId={task.id}
                            quotes={externalQuotes}
                            assignment={quoteAssignments.find((a) => a.task_id === task.id) ?? null}
                            currency={currency}
                            onAssignmentChange={fetchExternalQuotes}
                          />
                        </td>
                        )}
                        {show.budget && (
                          <td className="text-right px-3 py-2.5">
                            {editingCell?.taskId === task.id && editingCell.field === "budget" ? (
                              <input autoFocus type="number" className="w-full h-7 px-1 text-sm text-right rounded border focus:outline-none focus:ring-1 focus:ring-primary tabular-nums" value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") commitCellEdit(); if (e.key === "Escape") setEditingCell(null); }} onBlur={commitCellEdit} step="100" />
                            ) : (
                              <button type="button" className="w-full text-right hover:bg-muted/50 rounded px-1 py-0.5 transition-colors" onClick={() => { setEditingCell({ taskId: task.id, field: "budget" }); setEditValue(task.budget ? Math.round(task.budget * (1 + VAT_RATE)).toString() : ""); }}>
                                {task.budget ? <span className="text-sm tabular-nums">{Math.round(task.budget * (1 + VAT_RATE)).toLocaleString("sv-SE")} kr</span> : <span className="text-xs text-muted-foreground">–</span>}
                              </button>
                            )}
                          </td>
                        )}
                        {show.materialEstimate && (() => {
                          const autoTotal = mats.reduce((sum, m) => sum + (m.price_total ?? 0), 0);
                          const displayValue = task.material_estimate ?? (autoTotal > 0 ? autoTotal : null);
                          const isAutoCalc = !task.material_estimate && autoTotal > 0;
                          return (
                          <td className="text-right px-3 py-2.5">
                            {editingCell?.taskId === task.id && editingCell.field === "material_estimate" ? (
                              <input autoFocus type="number" className="w-full h-7 px-1 text-sm text-right rounded border focus:outline-none focus:ring-1 focus:ring-primary tabular-nums" value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") commitCellEdit(); if (e.key === "Escape") setEditingCell(null); }} onBlur={commitCellEdit} step="100" />
                            ) : (
                              <button type="button" className="w-full text-right hover:bg-muted/50 rounded px-1 py-0.5 transition-colors" onClick={() => { setEditingCell({ taskId: task.id, field: "material_estimate" }); setEditValue(task.material_estimate ? Math.round(task.material_estimate * (1 + VAT_RATE)).toString() : ""); }}>
                                {displayValue ? (
                                  <span className={`text-sm tabular-nums ${isAutoCalc ? "text-amber-600/70 italic" : "text-amber-700"}`}>
                                    {Math.round(displayValue * (1 + VAT_RATE)).toLocaleString("sv-SE")} kr
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">–</span>
                                )}
                              </button>
                            )}
                          </td>
                          );
                        })()}
                        {show.rotAmount && (
                          <td className="text-right px-3 py-2.5">
                            {editingCell?.taskId === task.id && editingCell.field === "rot_amount" ? (
                              <input autoFocus type="number" className="w-full h-7 px-1 text-sm text-right rounded border focus:outline-none focus:ring-1 focus:ring-primary tabular-nums" value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") commitCellEdit(); if (e.key === "Escape") setEditingCell(null); }} onBlur={commitCellEdit} step="100" />
                            ) : (
                              <button type="button" className="w-full text-right hover:bg-muted/50 rounded px-1 py-0.5 transition-colors" onClick={() => { setEditingCell({ taskId: task.id, field: "rot_amount" }); setEditValue(task.rot_amount?.toString() ?? ""); }}>
                                {task.rot_amount ? <span className="text-sm tabular-nums text-green-700">{Math.round(task.rot_amount).toLocaleString("sv-SE")} kr</span> : <span className="text-xs text-muted-foreground">–</span>}
                              </button>
                            )}
                          </td>
                        )}

                        {/* Delete — always visible */}
                        <td className="px-3 py-2.5">
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-destructive transition-colors"
                            onClick={() => deleteTask(task.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {/* Add row — looks like the next empty row in the table */}
                  <tr className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                    {isAdding ? (
                      <td
                        colSpan={1 + (show.description ? 1 : 0) + (show.room ? 1 : 0) + (show.area ? 1 : 0) + (show.quote ? 1 : 0) + (show.budget ? 1 : 0) + (show.materialEstimate ? 1 : 0) + (show.rotAmount ? 1 : 0) + 1}
                        className="px-3 py-2.5"
                      >
                        <div className="flex items-center gap-2">
                          <Input
                            autoFocus
                            placeholder={t("homeownerPlanning.taskPlaceholder", "e.g. Paint living room, new flooring in kitchen...")}
                            value={newTitle}
                            onChange={(e) => setNewTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") addTask();
                              if (e.key === "Escape") { setIsAdding(false); setNewTitle(""); }
                            }}
                            className="flex-1 h-7 text-sm"
                            disabled={addingLoading}
                          />
                          <Button size="sm" onClick={addTask} disabled={addingLoading || !newTitle.trim()}>
                            {t("common.add", "Add")}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setIsAdding(false); setNewTitle(""); }}>
                            {t("common.cancel", "Cancel")}
                          </Button>
                        </div>
                      </td>
                    ) : (
                      <>
                        <td className="px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => setIsAdding(true)}
                            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-sm transition-colors"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            {t("homeownerPlanning.addTask", "Add task")}
                          </button>
                        </td>
                        {show.description && <td />}
                        {show.room && <td />}
                        {show.area && <td className="hidden sm:table-cell" />}
                        {show.quote && <td />}
                        {show.budget && <td />}
                        {show.materialEstimate && <td />}
                        {show.rotAmount && <td />}
                        <td />
                      </>
                    )}
                  </tr>
                </tbody>
              </table>
            </div>

          {/* Column context menu */}
          {headerMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setHeaderMenu(null)} />
              <div
                className="fixed z-50 bg-popover border rounded-lg shadow-lg p-1 min-w-[180px]"
                style={{ left: headerMenu.x, top: headerMenu.y }}
              >
                <p className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{t("planningTasks.columns", "Columns")}</p>
                {EXTRA_COLUMNS.map((col) => (
                  <button
                    key={col.key}
                    type="button"
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-accent text-left transition-colors"
                    onClick={() => { toggleColumn(col.key); }}
                  >
                    <span className={cn(
                      "h-3.5 w-3.5 rounded border flex items-center justify-center text-[10px]",
                      visibleExtras.has(col.key) ? "border-primary bg-primary text-white" : "border-muted-foreground/30"
                    )}>
                      {visibleExtras.has(col.key) && "✓"}
                    </span>
                    {t(col.labelKey)}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Smart import — moved out of "Add task" peer group; lives alone now that
              Add task is an inline row inside the table. */}
          <div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setSmartImportOpen(true)}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {t("homeownerPlanning.smartImport", "Smart import")}
            </Button>
          </div>

      {/* Rooms: reuse builder component */}
      <PlanningRoomList
        projectId={projectId}
        locked={false}
        onRoomChange={fetchRooms}
      />

      {/* Prompt: connect tasks to rooms if not done */}
      {totalTasks > 0 && rooms.length > 0 && linkedTasks < totalTasks && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 px-4 py-4">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-800">
              {t("homeownerPlanning.connectHint", "Connect each task to a room to get estimated costs and create a more detailed quote request.")}
              {" "}<strong>{linkedTasks}/{totalTasks}</strong> {t("homeownerPlanning.tasksConnected", "tasks connected to rooms.")}
            </p>
          </div>
        </div>
      )}
      </div>{/* end locked wrapper */}

      {/* Share RFQ dialog */}
      <ShareRfqDialog
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
        projectId={projectId}
        projectName={projectName}
        projectAddress={projectAddress}
      />

      {/* Start project modal — choose path */}
      <StartProjectModal
        open={showStartModal}
        onOpenChange={setShowStartModal}
        onStartSelf={handleActivate}
        onSendRfq={() => setShareDialogOpen(true)}
      />

      {/* Guest login prompt */}
      <GuestLoginPrompt
        open={!!loginPromptAction}
        onOpenChange={(open) => { if (!open) setLoginPromptAction(null); }}
        action={loginPromptAction || "save_project"}
        projectId={projectId}
      />

      {/* Smart import dialog — AI extract tasks + rooms from document */}
      <PlanningSmartImportDialog
        projectId={projectId}
        open={smartImportOpen}
        onOpenChange={setSmartImportOpen}
        onImportComplete={() => { fetchTasks(); fetchRooms(); }}
      />
    </div>
  );
}

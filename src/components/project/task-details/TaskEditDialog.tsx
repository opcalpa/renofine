/**
 * TaskEditDialog — tabbed task detail dialog, mirroring RoomDetailFormV2's
 * structure (Carl 8 Jul): Översikt / Ekonomi / Checklistor / Foton /
 * Anteckningar / Relaterat. The orchestrator owns state and persistence;
 * each tab renders a slice. Section bodies moved verbatim from the previous
 * single-file dialog — behaviour is unchanged unless noted.
 */
import React, { useEffect, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useTaxDeductionVisible } from "@/hooks/useTaxDeduction";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
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
import { Loader2, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useProjectPermissions } from "@/hooks/useProjectPermissions";
import { useContextualTips } from "@/hooks/useContextualTips";
import { DEFAULT_COST_CENTERS } from "@/lib/costCenters";
import { detectWorkType, parseEstimationSettings, type RecipeEstimationSettings } from "@/lib/materialRecipes";
import { type Task, type TaskRoom, type MaterialItem } from "./types";
import { useNavigate } from "react-router-dom";
import { OverviewTab } from "./tabs/OverviewTab";
import { EconomyTab } from "./tabs/EconomyTab";
import { RelatedTab, type TaskDependency, type RelatedPurchaseOrder } from "./tabs/RelatedTab";
import { FieldVisibilityMenu, type FieldVisibilityItem } from "./FieldVisibilityMenu";

// Per-user, device-local show/hide of optional dialog fields
const FIELD_PREFS_KEY = "rf-task-field-prefs";

function loadFieldPrefs(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(FIELD_PREFS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Task title — click-to-edit with read mode as default
// ---------------------------------------------------------------------------

function TaskTitleField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => { setDraft(value); }, [value]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onChange(trimmed);
    setEditing(false);
  };

  if (!editing) {
    return (
      <DialogTitle
        className="text-lg font-semibold truncate cursor-pointer hover:text-primary transition-colors py-1"
        onClick={() => setEditing(true)}
        title={t("common.clickToEdit", "Click to edit")}
      >
        {value}
      </DialogTitle>
    );
  }

  return (
    <input
      className="text-lg font-semibold bg-transparent border-0 border-b-2 border-primary focus:outline-none w-full truncate px-0 py-1"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") { setDraft(value); setEditing(false); }
      }}
      autoFocus
    />
  );
}

/** Wrapper that renders either a Dialog (modal) or Sheet (right drawer) with the same header */
function TaskEditWrapper({ variant, open, onOpenChange, title, onTitleChange, t, children }: {
  variant: "dialog" | "sheet";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  onTitleChange?: (title: string) => void;
  t: (key: string, fallback?: string) => string;
  children: React.ReactNode;
}) {
  const header = title && onTitleChange ? (
    <TaskTitleField value={title} onChange={onTitleChange} />
  ) : null;

  if (variant === "sheet") {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-xl lg:max-w-2xl p-0 flex flex-col overflow-hidden">
          <SheetHeader className="flex-shrink-0 px-6 pt-5 pb-3 border-b bg-gradient-to-b from-background to-muted/20">
            {header || <SheetTitle className="truncate">{t("tasks.editTask")}</SheetTitle>}
            <SheetDescription className="sr-only">{t("tasks.editTaskDescription", "Edit task details")}</SheetDescription>
          </SheetHeader>
          {children}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl lg:max-w-5xl max-h-[90vh] h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="flex-shrink-0 px-6 pt-5 pb-3 border-b bg-gradient-to-b from-background to-muted/20">
          {header || <DialogTitle className="truncate">{t("tasks.editTask")}</DialogTitle>}
          <DialogDescription className="sr-only">{t("tasks.editTaskDescription", "Edit task details")}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

interface TaskEditDialogProps {
  taskId: string | null;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
  currency?: string | null;
  projectStatus?: string | null;
  variant?: "dialog" | "sheet";
  /** Makes the selected room names links into the room's detail view. */
  onOpenRoom?: (roomId: string) => void;
}

type TabKey = "overview" | "economy" | "related";

export const TaskEditDialog = ({
  taskId,
  projectId,
  open,
  onOpenChange,
  onSaved,
  currency,
  projectStatus,
  variant = "dialog",
  onOpenRoom,
}: TaskEditDialogProps) => {
  const isPlanning = projectStatus === "planning";
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { showTaxDeduction } = useTaxDeductionVisible();
  const permissions = useProjectPermissions(projectId);
  const [task, setTask] = useState<Task | null>(null);
  const [tab, setTab] = useState<TabKey>("overview");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [rooms, setRooms] = useState<TaskRoom[]>([]);
  const [teamMembers, setTeamMembers] = useState<{ id: string; name: string; role?: string }[]>([]);
  const [rotSubsidyPercent, setRotSubsidyPercent] = useState(30);
  const [rotMaxPerPerson, setRotMaxPerPerson] = useState(50000);
  const [profileDefaultRate, setProfileDefaultRate] = useState<number | null>(null);
  const [profileLaborCostPercent, setProfileLaborCostPercent] = useState<number | null>(null);
  const [userType, setUserType] = useState<string | null>(null);
  const [taskProfileId, setTaskProfileId] = useState<string | null>(null);
  const [taskSuppliers, setTaskSuppliers] = useState<{ id: string; name: string }[]>([]);
  const isBuilder = permissions.isOwner && userType !== "homeowner";
  const isHomeowner = userType === "homeowner";
  const hasAutoFilledRef = useRef(false);
  const [materialSpent, setMaterialSpent] = useState(0);
  const [estimationSettings, setEstimationSettings] = useState<RecipeEstimationSettings | null>(null);
  const [dependencies, setDependencies] = useState<TaskDependency[]>([]);
  const [allProjectTasks, setAllProjectTasks] = useState<{ id: string; title: string; status: string; finish_date: string | null }[]>([]);
  const [relatedPOs, setRelatedPOs] = useState<RelatedPurchaseOrder[]>([]);
  const [photoCount, setPhotoCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [fieldPrefs, setFieldPrefs] = useState<Record<string, boolean>>(loadFieldPrefs);

  const updateFieldPref = useCallback((key: string, visible: boolean) => {
    setFieldPrefs((prev) => {
      const next = { ...prev, [key]: visible };
      try { localStorage.setItem(FIELD_PREFS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const patch = useCallback((updates: Partial<Task>) => {
    setTask((prev) => (prev ? { ...prev, ...updates } : prev));
  }, []);

  // Contextual tips based on task title, work type, room, etc.
  const taskTipContext = React.useMemo(() => ({
    taskTitle: task?.title || undefined,
    workType: task ? detectWorkType(task) ?? undefined : undefined,
    costCenter: task?.cost_center || undefined,
    projectStatus: projectStatus || undefined,
    userRole: isBuilder ? "contractor" as const : "homeowner" as const,
  }), [task?.title, task?.cost_center, projectStatus, isBuilder]);
  const { tips: taskTips, dismiss: dismissTip } = useContextualTips(taskTipContext);

  const fetchTask = useCallback(async () => {
    if (!taskId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("id", taskId)
        .single();

      if (error) throw error;

      // Fetch linked materials for this task
      const { data: linkedMaterials } = await supabase
        .from("materials")
        .select("id, name, quantity, unit, price_per_unit, price_total, markup_percent, status, exclude_from_budget, purchase_order_id")
        .eq("task_id", taskId);

      // Split into planned items (editable in pricing) vs actual spend
      const allMaterials = linkedMaterials || [];
      const plannedItems: MaterialItem[] = allMaterials
        .filter((m) => m.status === "planned")
        .map((m) => ({
          id: m.id,
          name: m.name,
          quantity: m.quantity ?? 1,
          unit: m.unit ?? "st",
          unit_price: m.price_per_unit ?? (m.price_total ?? 0),
          amount: m.price_total ?? Math.round((m.quantity ?? 1) * (m.price_per_unit ?? 0)),
          markup_percent: m.markup_percent ?? null,
        }));

      // Materials table is the source of truth. Clear JSONB to avoid stale data showing.
      data.material_items = plannedItems.length > 0 ? plannedItems : undefined;

      setTask(data);

      // Counts for the visibility safeguard: sections with content always render
      supabase
        .from("photos")
        .select("id", { count: "exact", head: true })
        .eq("linked_to_type", "task")
        .eq("linked_to_id", data.id)
        .then(({ count }) => setPhotoCount(count || 0));
      supabase
        .from("comments")
        .select("id", { count: "exact", head: true })
        .eq("task_id", data.id)
        .then(({ count }) => setCommentCount(count || 0));

      // Material spend = non-planned materials linked to this task
      const actualSpend = allMaterials
        .filter((m) => m.status !== "planned" && !m.exclude_from_budget)
        .reduce((sum, m) => sum + (m.price_total ?? ((m.quantity || 0) * (m.price_per_unit || 0))), 0);
      setMaterialSpent(actualSpend);

      // Related purchase orders — grouped from the task's material lines
      const linesByPO = new Map<string, string[]>();
      for (const m of allMaterials) {
        if (m.purchase_order_id) {
          linesByPO.set(m.purchase_order_id, [...(linesByPO.get(m.purchase_order_id) ?? []), m.name]);
        }
      }
      if (linesByPO.size > 0) {
        const { data: pos } = await supabase
          .from("purchase_orders")
          .select("id, status, total, vendor_name")
          .in("id", [...linesByPO.keys()]);
        setRelatedPOs((pos ?? []).map((po) => {
          const names = linesByPO.get(po.id) ?? [];
          return {
            id: po.id,
            label: names[0] ? `${names[0]}${names.length > 1 ? ` +${names.length - 1}` : ""}` : po.vendor_name ?? "—",
            status: po.status,
            total: po.total,
            vendorName: po.vendor_name,
          };
        }));
      } else {
        setRelatedPOs([]);
      }

      // Fetch dependencies (what this task depends on)
      const { data: deps } = await supabase
        .from("task_dependencies")
        .select("id, depends_on_task_id")
        .eq("task_id", taskId);

      // Fetch all project tasks for the dependency picker
      const { data: projTasks } = await supabase
        .from("tasks")
        .select("id, title, status, finish_date")
        .eq("project_id", projectId)
        .neq("id", taskId);

      const taskList = projTasks || [];
      setAllProjectTasks(taskList);

      // Enrich dependencies with task info
      const enrichedDeps = (deps || []).map((d) => {
        const depTask = taskList.find((pt) => pt.id === d.depends_on_task_id);
        return {
          id: d.id,
          depends_on_task_id: d.depends_on_task_id,
          title: depTask?.title || "Unknown",
          status: depTask?.status || "to_do",
          finish_date: depTask?.finish_date || null,
        };
      });
      setDependencies(enrichedDeps);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to load task";
      toast({ title: t("common.error"), description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [taskId, projectId, toast, t]);

  const fetchSupportingData = useCallback(async () => {
    try {
      const { data: roomsData } = await supabase
        .from("rooms")
        .select("id, name, dimensions, ceiling_height_mm")
        .eq("project_id", projectId)
        .order("name");
      setRooms(roomsData || []);

      // Fetch team members in two steps (no FK relationship)
      const { data: sharesData } = await supabase
        .from("project_shares")
        .select("shared_with_user_id")
        .eq("project_id", projectId);

      const profileIds = (sharesData || [])
        .map((s) => s.shared_with_user_id)
        .filter((id): id is string => id != null);

      if (profileIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, name")
          .in("id", profileIds);

        setTeamMembers(
          (profilesData || [])
            .filter((p) => p.name)
            .map((p) => ({ id: p.id, name: p.name }))
        );
      } else {
        setTeamMembers([]);
      }
    } catch (error) {
      console.error("Failed to fetch supporting data:", error);
    }
  }, [projectId]);

  const fetchProfileDefault = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("default_hourly_rate, default_labor_cost_percent, estimation_settings, onboarding_user_type")
        .eq("user_id", user.id)
        .single();
      setProfileDefaultRate(data?.default_hourly_rate ?? null);
      setProfileLaborCostPercent(data?.default_labor_cost_percent ?? null);
      setUserType(data?.onboarding_user_type ?? null);
      // Fetch profile id + suppliers for autocomplete
      const { data: prof } = await supabase.from("profiles").select("id").eq("user_id", user.id).single();
      if (prof) {
        setTaskProfileId(prof.id);
        const { data: suppData } = await supabase.from("suppliers").select("id, name").eq("profile_id", prof.id).order("name");
        setTaskSuppliers(suppData || []);
      }
      if (data?.estimation_settings) {
        setEstimationSettings(
          parseEstimationSettings(data.estimation_settings as Record<string, unknown>)
        );
      }
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    if (open && taskId) {
      setTab("overview");
      fetchTask();
      fetchSupportingData();
      fetchProfileDefault();
      // Fetch current ROT rate
      const today = new Date().toISOString().slice(0, 10);
      supabase
        .from("rot_yearly_limits")
        .select("subsidy_percent, max_amount_per_person")
        .lte("valid_from", today)
        .gte("valid_until", today)
        .limit(1)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            setRotSubsidyPercent(data.subsidy_percent);
            setRotMaxPerPerson(data.max_amount_per_person);
          }
        });
    }
    if (!open) {
      hasAutoFilledRef.current = false;
    }
  }, [open, taskId, fetchTask, fetchSupportingData, fetchProfileDefault]);

  // Auto-fill hourly rate from profile default during planning
  useEffect(() => {
    if (
      isPlanning &&
      task &&
      task.hourly_rate == null &&
      profileDefaultRate != null &&
      !hasAutoFilledRef.current
    ) {
      hasAutoFilledRef.current = true;
      const hours = task.estimated_hours || 0;
      const labor = hours * profileDefaultRate;
      const ue = (task.subcontractor_cost || 0) * (1 + (task.markup_percent || 0) / 100);
      const matItems = task.material_items || [];
      const matBase = matItems.length > 0
        ? matItems.reduce((sum, i) => sum + (i.amount || 0), 0)
        : (task.material_estimate || 0);
      const mat = matBase * (1 + (task.material_markup_percent || 0) / 100);
      const budget = labor + ue + mat || null;
      setTask({ ...task, hourly_rate: profileDefaultRate, budget });
    }
  }, [isPlanning, task, profileDefaultRate]);

  // Sync material items → materials table (status: "planned")
  // Called immediately on SmartEstimate apply AND on save as fallback.
  const syncPlannedMaterials = React.useCallback(async (items: MaterialItem[], taskId: string, projectId: string) => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;
    const { data: matProfile } = await supabase.from("profiles").select("id").eq("user_id", authUser.id).single();
    const profileId = matProfile?.id;
    if (!profileId) return;

    const { data: existingPlanned } = await supabase
      .from("materials").select("id").eq("task_id", taskId).eq("status", "planned");
    const existingIds = new Set((existingPlanned || []).map((m) => m.id));
    const currentIds = new Set(items.map((i) => i.id));
    const toDelete = [...existingIds].filter((id) => !currentIds.has(id));

    if (toDelete.length > 0) {
      await supabase.from("materials").delete().in("id", toDelete);
    }

    for (const item of items) {
      const row = {
        id: item.id,
        name: item.name || t("taskCost.material", "Material"),
        quantity: item.quantity ?? null,
        unit: item.unit ?? null,
        price_per_unit: item.unit_price ?? null,
        price_total: item.amount ?? null,
        markup_percent: item.markup_percent ?? null,
        task_id: taskId,
        project_id: projectId,
        status: "planned",
        exclude_from_budget: false,
        created_by_user_id: profileId,
      };
      const { error } = await supabase
        .from("materials")
        .upsert(row, { onConflict: "id" });
      if (error) {
        console.error("Material upsert failed:", error.message, error.details, row);
        toast({ title: t("common.error"), description: `Material: ${error.message}`, variant: "destructive" });
      }
    }
  }, [t, toast]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task) return;

    setSaving(true);
    try {
      // Build update payload — only include cost fields if they exist on the DB
      // (i.e. the migration has been applied and select("*") returned them)
      const payload: Record<string, unknown> = {
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        start_date: task.start_date || null,
        finish_date: task.finish_date || null,
        room_id: task.room_id || null,
        room_ids: task.room_ids || [],
        progress: task.progress,
        assigned_to_stakeholder_id: task.assigned_to_stakeholder_id || null,
        budget: task.budget ? Math.round(task.budget) : null,
        ordered_amount: task.ordered_amount || null,
        payment_status: task.payment_status || null,
        paid_amount: task.paid_amount || null,
        cost_center: task.cost_center || null,
        cost_centers: task.cost_centers || null,
        checklists: task.checklists || [],
      };

      // Cost estimation fields — only include if the column existed when we fetched
      if ("task_cost_type" in task) {
        payload.task_cost_type = task.task_cost_type || "own_labor";
        payload.estimated_hours = task.estimated_hours || null;
        payload.hourly_rate = task.hourly_rate || null;
        payload.subcontractor_cost = task.subcontractor_cost || null;
        payload.markup_percent = task.markup_percent ?? 0;
        payload.material_estimate = task.material_estimate || null;
        payload.material_markup_percent = task.material_markup_percent ?? 0;
      }

      // Labor cost percent — only include if the column existed when we fetched
      if ("labor_cost_percent" in task) {
        payload.labor_cost_percent = task.labor_cost_percent;
      }

      // material_items JSONB is no longer written — materials table is the source of truth.

      // ÄTA field — only include if the column existed when we fetched
      if ("is_ata" in task) {
        payload.is_ata = task.is_ata;
      }

      // Supplier
      if ("supplier_id" in task) {
        payload.supplier_id = task.supplier_id || null;
      }

      // ROT fields
      if ("rot_eligible" in task) {
        payload.rot_eligible = task.rot_eligible;
        payload.rot_amount = task.rot_amount || null;
      }

      // Internal notes (Anteckningar tab) — only if the column exists on remote
      if ("internal_notes" in task) {
        payload.internal_notes = task.internal_notes || null;
      }

      const { error } = await supabase
        .from("tasks")
        .update(payload)
        .eq("id", task.id);

      if (error) throw error;

      // Sync material items → materials table (fallback for any manual edits since last apply)
      const items: MaterialItem[] = task.material_items || [];
      if (items.length > 0) {
        await syncPlannedMaterials(items, task.id, task.project_id);
      }

      toast({
        title: t("common.success"),
        description: t("tasks.taskUpdatedDescription"),
      });

      // Offer to save hourly rate as profile default if none set yet
      if (
        task.hourly_rate &&
        task.hourly_rate > 0 &&
        profileDefaultRate == null
      ) {
        toast({
          description: t("taskCost.saveAsDefault"),
          action: (
            <ToastAction
              altText={t("common.save")}
              onClick={async () => {
                const { data: { user: currentUser } } = await supabase.auth.getUser();
                if (!currentUser) return;
                const { error: profileError } = await supabase
                  .from("profiles")
                  .update({ default_hourly_rate: task.hourly_rate })
                  .eq("user_id", currentUser.id);
                if (!profileError) {
                  setProfileDefaultRate(task.hourly_rate);
                  toast({
                    description: t("taskCost.rateSavedToProfile"),
                  });
                }
              }}
            >
              {t("common.save")}
            </ToastAction>
          ),
        });
      }

      onOpenChange(false);
      onSaved?.();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to update";
      toast({ title: t("common.error"), description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Delete this task (confirm-gated). Mirrors useBulkTaskActions.bulkDelete —
  // DB FK cascades handle dependents, same as bulk delete and Budget-row delete.
  const handleDelete = async () => {
    if (!task) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("tasks").delete().eq("id", task.id);
      if (error) throw error;
      toast({ description: t("tasks.taskDeleted", "Arbetet togs bort") });
      onOpenChange(false);
      onSaved?.();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to delete";
      toast({ title: t("common.error"), description: msg, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const tabs: { k: TabKey; label: string; count?: number }[] = [
    { k: "overview", label: t("tasks.tabOverview", "Översikt") },
    { k: "economy", label: t("tasks.tabEconomy", "Ekonomi") },
    { k: "related", label: t("tasks.tabRelated", "Relaterat"), count: dependencies.length + relatedPOs.length },
  ];

  const fieldItems: FieldVisibilityItem[] = task ? [
    { key: "checklists", label: t("tasks.checklists"), hasContent: (task.checklists || []).length > 0 },
    { key: "photos", label: t("entityPhotos.photos", "Foton"), hasContent: photoCount > 0 },
    { key: "comments", label: t("feed.comments", "Kommentarer"), hasContent: commentCount > 0 },
    { key: "quickInfo", label: t("rooms.quickInfo", "Snabbinfo"), hasContent: relatedPOs.length > 0 || dependencies.length > 0 },
    { key: "priority", label: t("tasks.priority"), hasContent: task.priority !== "medium" },
    { key: "assignee", label: t("tasks.assignTo"), hasContent: !!task.assigned_to_stakeholder_id },
    { key: "category", label: t("tasks.costCenter"), hasContent: (task.cost_centers || []).length > 0 },
  ] : [];

  return (
    <TaskEditWrapper variant={variant} open={open} onOpenChange={onOpenChange} title={task?.title} onTitleChange={task ? (title: string) => patch({ title }) : undefined} t={t}>
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : task ? (
        <form onSubmit={handleSave} className="rf-paper flex flex-col flex-1 min-h-0" style={{ background: "var(--rf-paper)" }}>
          {/* Tab navigation — mirrors RoomDetailFormV2 */}
          <div
            className="flex flex-shrink-0 gap-0 overflow-x-auto border-b px-3"
            style={{ borderColor: "var(--rf-hairline)", background: "var(--rf-surface)" }}
          >
            {tabs.map((tt) => {
              const active = tab === tt.k;
              return (
                <button
                  key={tt.k}
                  type="button"
                  onClick={() => setTab(tt.k)}
                  className="relative -mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3 text-[13px]"
                  style={{
                    color: active ? "var(--rf-ink)" : "var(--rf-fg-muted)",
                    fontWeight: active ? 500 : 400,
                    borderBottomColor: active ? "var(--rf-ink)" : "transparent",
                    background: "transparent",
                  }}
                >
                  {tt.label}
                  {tt.count != null && tt.count > 0 && (
                    <span
                      className="rf-num inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[9px] px-1 text-[10px]"
                      style={{ background: "var(--rf-bg-sunken)", color: "var(--rf-fg-muted)" }}
                    >
                      {tt.count}
                    </span>
                  )}
                </button>
              );
            })}
            <div className="ml-auto flex items-center self-center pl-2">
              <FieldVisibilityMenu items={fieldItems} prefs={fieldPrefs} onChange={updateFieldPref} />
            </div>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto" style={{ background: "var(--rf-paper)" }}>
            {tab === "overview" && (
              <OverviewTab
                task={task}
                patch={patch}
                isPlanning={isPlanning}
                projectId={projectId}
                rooms={rooms}
                teamMembers={teamMembers}
                dependencies={dependencies}
                tips={taskTips}
                dismissTip={dismissTip}
                onOpenRoom={onOpenRoom}
                relatedPOCount={relatedPOs.length}
                onShowRelated={() => setTab("related")}
                fieldPrefs={fieldPrefs}
                photoCount={photoCount}
                commentCount={commentCount}
              />
            )}
            {tab === "economy" && (
              <EconomyTab
                task={task}
                patch={patch}
                setTask={setTask}
                isPlanning={isPlanning}
                isBuilder={isBuilder}
                isHomeowner={isHomeowner}
                rooms={rooms}
                projectId={projectId}
                currency={currency}
                showTaxDeduction={showTaxDeduction}
                rotSubsidyPercent={rotSubsidyPercent}
                rotMaxPerPerson={rotMaxPerPerson}
                profileLaborCostPercent={profileLaborCostPercent}
                materialSpent={materialSpent}
                estimationSettings={estimationSettings}
                setEstimationSettings={setEstimationSettings}
                taskProfileId={taskProfileId}
                taskSuppliers={taskSuppliers}
                setTaskSuppliers={setTaskSuppliers}
                syncPlannedMaterials={syncPlannedMaterials}
              />
            )}
            {tab === "related" && (
              <RelatedTab
                task={task}
                projectId={projectId}
                dependencies={dependencies}
                setDependencies={setDependencies}
                allProjectTasks={allProjectTasks}
                relatedPOs={relatedPOs}
                currency={currency}
                onOpenPurchase={(poId) => {
                  onOpenChange(false);
                  navigate(`/projects/${projectId}?tab=purchases&entityId=${poId}`);
                }}
              />
            )}
          </div>

          {/* Sticky save footer */}
          <div className="flex-shrink-0 border-t bg-background px-6 py-4 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 flex-shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={saving || deleting}
              title={t("tasks.deleteTask", "Ta bort arbete")}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </Button>
            <Button type="submit" className="flex-1 h-11 text-base font-medium shadow-sm" disabled={saving || deleting}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {t("tasks.updating")}
                </>
              ) : (
                t("tasks.updateTask")
              )}
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-muted-foreground py-8 text-center">{t("budget.noData")}</p>
      )}

      {/* Confirm delete (mirrors the bulk-delete confirm) */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("tasks.deleteConfirmTitle", { title: task?.title ?? "", defaultValue: "Ta bort \"{{title}}\"?" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("tasks.deleteConfirmDesc", "Arbetet tas bort permanent, inklusive dess checklista och kopplingar. Detta går inte att ångra.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setShowDeleteConfirm(false);
                void handleDelete();
              }}
            >
              {t("tasks.deleteTask", "Ta bort arbete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TaskEditWrapper>
  );
};

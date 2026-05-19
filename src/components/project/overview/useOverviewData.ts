import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchProjectActivities } from "../feed/utils";
import { differenceInDays, parseISO, startOfDay } from "date-fns";
import { isTeamV2MaskingEnabled } from "@/lib/featureFlags";
import { PUBLIC_DEMO_PROJECT_ID } from "@/constants/publicDemo";
import {
  getViewerMode,
  getProjectOverview,
  type MaskedTask,
  type ProjectOverviewData,
  type ViewerMode,
} from "@/services/projectDataService";
import type { OverviewTask, TaskStats, BudgetStats, OrderStats, TimelineStats, OverviewData, OverviewProject } from "./types";

interface RawTask {
  id: string;
  title: string;
  status: string | null;
  priority: string | null;
  due_date: string | null;
  finish_date: string | null;
  progress: number | null;
  assigned_to_contractor_id: string | null;
  assigned_to_stakeholder_id?: string | null;
  budget: number | null;
  is_ata: boolean | null;
  parent_task_id: string | null;
  estimated_hours: number | null;
  hourly_rate: number | null;
  labor_cost_percent: number | null;
  subcontractor_cost: number | null;
  markup_percent: number | null;
  material_estimate: number | null;
  material_markup_percent: number | null;
}

interface Stakeholder {
  id: string;
  name: string;
}

interface Material {
  price_total: number | null;
  exclude_from_budget: boolean;
  status: string | null;
  task_id: string | null;
}

// Team v2 masked path. For non-"full" viewers the DB-masking RPC never sends
// sensitive economics over the wire, so profit/contract/invoiced are not
// derivable here — they are reported as zero by design. Owner/"full" never
// reaches this branch (handled by the raw path for zero regression).
function buildMaskedOverview(od: ProjectOverviewData, today: Date) {
  const mapTask = (t: MaskedTask): OverviewTask => ({
    id: t.id,
    title: t.title,
    status: t.status || "",
    priority: "",
    due_date: t.finish_date,
    progress: t.progress || 0,
    assigned_to_contractor_id: null,
    assignee_name: null,
  });

  const tasks = od.tasks;
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === "completed").length;
  const inProgressCount = tasks.filter((t) => t.status === "in_progress").length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  const overdue = tasks
    .filter((t) => t.finish_date && t.status !== "completed" && startOfDay(parseISO(t.finish_date)) < today)
    .map(mapTask);
  const blockedOrOnHold = tasks
    .filter((t) => t.status && ["on_hold", "blocked", "waiting"].includes(t.status))
    .map(mapTask);
  const inProgressTasks = tasks.filter((t) => t.status === "in_progress").slice(0, 5).map(mapTask);

  const totalBudget = od.project.total_budget;
  const spent = od.project.spent_amount ?? 0;
  const budgetPercentage = totalBudget && totalBudget > 0 ? Math.round((spent / totalBudget) * 100) : 0;

  const taskStats: TaskStats = {
    total, completed, inProgress: inProgressCount, overdue, blockedOrOnHold, percentage,
  };
  const budgetStats: BudgetStats = {
    total: totalBudget,
    spent,
    percentage: budgetPercentage,
    isWarning: budgetPercentage > 80,
    contractTotal: od.project.contract_value ?? 0,
    invoicedTotal: 0,
    invoicedPercent: 0,
    estimatedProfit: 0,
  };
  const orderStats: OrderStats = {
    pendingCount: od.materials.filter((m) => m.status === "submitted").length,
  };

  return { taskStats, budgetStats, orderStats, inProgressTasks };
}

export function useOverviewData(project: OverviewProject, skip?: boolean): OverviewData {
  const [loading, setLoading] = useState(!skip);
  const [taskStats, setTaskStats] = useState<TaskStats>({
    total: 0, completed: 0, inProgress: 0, overdue: [], blockedOrOnHold: [], percentage: 0,
  });
  const [budgetStats, setBudgetStats] = useState<BudgetStats>({
    total: null, spent: 0, percentage: 0, isWarning: false,
    contractTotal: 0, invoicedTotal: 0, invoicedPercent: 0, estimatedProfit: 0,
  });
  const [orderStats, setOrderStats] = useState<OrderStats>({ pendingCount: 0 });
  const [timelineStats, setTimelineStats] = useState<TimelineStats>({
    finishGoalDate: null, startDate: null, daysRemaining: null,
  });
  const [inProgressTasks, setInProgressTasks] = useState<OverviewTask[]>([]);
  const [recentActivities, setRecentActivities] = useState<import("../feed/types").ActivityLogItem[]>([]);
  // null = masking flag off / not resolved. Consumers gate economy UI on this.
  const [viewerMode, setViewerMode] = useState<ViewerMode | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Team v2: masked viewers read through the DB-masking RPC so sensitive
      // economics never cross the wire. Owner/"full" falls through to the raw
      // path below unchanged (zero regression on the core read path).
      // The public demo has no membership/viewer concept — it is public
      // read-only — so it must skip the masking RPCs (which hard-reject
      // non-members) and use the raw RLS path that permits public_demo.
      if (isTeamV2MaskingEnabled() && project.id !== PUBLIC_DEMO_PROJECT_ID) {
        const mode = await getViewerMode(project.id);
        setViewerMode(mode);
        if (mode !== "full") {
          const od = await getProjectOverview(project.id);
          const today = startOfDay(new Date());
          const masked = buildMaskedOverview(od, today);
          setTaskStats(masked.taskStats);
          setBudgetStats(masked.budgetStats);
          setOrderStats(masked.orderStats);
          setInProgressTasks(masked.inProgressTasks);
          setTimelineStats({
            finishGoalDate: project.finish_goal_date,
            startDate: project.start_date,
            daysRemaining: project.finish_goal_date
              ? differenceInDays(parseISO(project.finish_goal_date), today)
              : null,
          });
          const activities = await fetchProjectActivities(project.id);
          setRecentActivities(activities.slice(0, 8));
          return;
        }
      }

      const { data: { user } } = await supabase.auth.getUser();

      const [tasksRes, stakeholdersRes, materialsRes, activitiesData, quotesRes, invoicesRes, profileRes] = await Promise.all([
        supabase
          .from("tasks")
          .select("*")
          .eq("project_id", project.id),
        supabase
          .from("stakeholders" as never)
          .select("id, name")
          .eq("project_id", project.id),
        supabase
          .from("materials")
          .select("price_total, exclude_from_budget, status, task_id")
          .eq("project_id", project.id),
        fetchProjectActivities(project.id),
        supabase
          .from("quotes")
          .select("total_amount")
          .eq("project_id", project.id)
          .eq("status", "accepted"),
        supabase
          .from("invoices")
          .select("total_amount, status")
          .eq("project_id", project.id)
          .neq("status", "cancelled"),
        user ? supabase
          .from("profiles")
          .select("default_labor_cost_percent")
          .eq("user_id", user.id)
          .single() : Promise.resolve({ data: null }),
      ]);

      const tasks: RawTask[] = (tasksRes.data || []) as unknown as RawTask[];
      const stakeholders: Stakeholder[] = (stakeholdersRes.data || []) as unknown as Stakeholder[];
      const materials: Material[] = materialsRes.data || [];

      const stakeholderMap = new Map(stakeholders.map(s => [s.id, s.name]));
      const today = startOfDay(new Date());

      // Task stats
      const total = tasks.length;
      const completed = tasks.filter(t => t.status === "completed").length;
      const inProgressCount = tasks.filter(t => t.status === "in_progress").length;
      const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

      const mapTask = (t: RawTask): OverviewTask => {
        const assigneeId = t.assigned_to_stakeholder_id || t.assigned_to_contractor_id;
        const effectiveDueDate = t.due_date || t.finish_date;
        return {
          id: t.id,
          title: t.title,
          status: t.status || "",
          priority: t.priority || "",
          due_date: effectiveDueDate,
          progress: t.progress || 0,
          assigned_to_contractor_id: assigneeId || null,
          assignee_name: assigneeId ? stakeholderMap.get(assigneeId) || null : null,
        };
      };

      const overdue = tasks
        .filter(t => {
          const effectiveDate = t.due_date || t.finish_date;
          return effectiveDate && t.status !== "completed" && startOfDay(parseISO(effectiveDate)) < today;
        })
        .map(mapTask);

      const blockedOrOnHold = tasks
        .filter(t => t.status && ["on_hold", "blocked", "waiting"].includes(t.status))
        .map(mapTask);

      setTaskStats({ total, completed, inProgress: inProgressCount, overdue, blockedOrOnHold, percentage });

      // In-progress tasks (limit 5)
      const inProgressList = tasks
        .filter(t => t.status === "in_progress")
        .slice(0, 5)
        .map(mapTask);
      setInProgressTasks(inProgressList);

      // Budget stats — avoid double-counting linked purchases & sub-tasks
      // Sub-task budgets grouped by parent
      const childBudgetByParent = new Map<string, number>();
      tasks.forEach(t => {
        if (t.parent_task_id && !t.is_ata && (t.budget || 0) > 0) {
          childBudgetByParent.set(
            t.parent_task_id,
            (childBudgetByParent.get(t.parent_task_id) || 0) + (t.budget || 0)
          );
        }
      });

      // Root tasks only (not sub-tasks, not ÄTA)
      const rootTasks = tasks.filter(t => !t.parent_task_id && !t.is_ata);

      // IDs of root tasks that have linked items (materials or sub-tasks)
      const taskIdsWithLinkedItems = new Set([
        ...materials.filter(m => m.task_id && !m.exclude_from_budget).map(m => m.task_id),
        ...Array.from(childBudgetByParent.keys()),
      ]);

      // Actual spend = linked materials + sub-task budgets
      const linkedSpend =
        materials
          .filter(m => m.task_id && !m.exclude_from_budget)
          .reduce((sum, m) => sum + (m.price_total || 0), 0)
        + Array.from(childBudgetByParent.values()).reduce((sum, v) => sum + v, 0);

      // Root tasks WITHOUT linked items → use their budget as estimate
      const unlinkedTaskBudget = rootTasks
        .filter(t => !taskIdsWithLinkedItems.has(t.id))
        .reduce((sum, t) => sum + (t.budget || 0), 0);

      // Unlinked materials (no task_id, not excluded from budget)
      const unlinkedMaterialCost = materials
        .filter(m => !m.task_id && !m.exclude_from_budget)
        .reduce((sum, m) => sum + (m.price_total || 0), 0);

      const spent = linkedSpend + unlinkedTaskBudget + unlinkedMaterialCost;
      // contract_value = SUM(accepted quotes) incl. ÄTAor (auto-synced by DB trigger).
      // NULL until first quote is accepted — Kundvy/PulseCards hide budget UI in that state.
      const totalBudget = project.contract_value ?? null;
      const budgetPercentage = totalBudget && totalBudget > 0
        ? Math.round((spent / totalBudget) * 100)
        : 0;

      // Builder financial pulse
      const contractTotal = (quotesRes.data || []).reduce(
        (sum, q) => sum + ((q as { total_amount: number | null }).total_amount || 0), 0
      );
      const invoicedTotal = (invoicesRes.data || [])
        .filter(inv => (inv as { status: string }).status !== "draft")
        .reduce((sum, inv) => sum + ((inv as { total_amount: number | null }).total_amount || 0), 0);
      const invoicedPercent = contractTotal > 0
        ? Math.round((invoicedTotal / contractTotal) * 100) : 0;

      const laborCostPct = (profileRes.data as { default_labor_cost_percent?: number | null })
        ?.default_labor_cost_percent ?? 50;
      const estimatedProfit = tasks.reduce((sum, t) => {
        const costPct = t.labor_cost_percent ?? laborCostPct;
        // Lump-sum mode: no hours/rate/UE set but kundpris entered directly
        const isLumpSum = !t.estimated_hours && !t.hourly_rate && !t.subcontractor_cost;
        const laborBase = isLumpSum && t.budget
          ? t.budget
          : (t.estimated_hours || 0) * (t.hourly_rate || 0);
        const laborProfit = laborBase * (1 - costPct / 100);
        const ueProfit = (t.subcontractor_cost || 0) * (t.markup_percent || 0) / 100;
        const matProfit = (t.material_estimate || 0) * (t.material_markup_percent || 0) / 100;
        return sum + laborProfit + ueProfit + matProfit;
      }, 0);

      setBudgetStats({
        total: totalBudget,
        spent,
        percentage: budgetPercentage,
        isWarning: budgetPercentage > 80,
        contractTotal,
        invoicedTotal,
        invoicedPercent,
        estimatedProfit,
      });

      // Order stats
      const pendingCount = materials.filter(m => m.status === "submitted").length;
      setOrderStats({ pendingCount });

      // Timeline stats
      const finishGoalDate = project.finish_goal_date;
      const daysRemaining = finishGoalDate
        ? differenceInDays(parseISO(finishGoalDate), today)
        : null;
      setTimelineStats({
        finishGoalDate,
        startDate: project.start_date,
        daysRemaining,
      });

      // Recent activities (limit 8)
      setRecentActivities(activitiesData.slice(0, 8));
    } catch (error: unknown) {
      console.error("Failed to load overview data:", error);
    } finally {
      setLoading(false);
    }
  }, [project.id, project.contract_value, project.finish_goal_date, project.start_date]);

  useEffect(() => {
    if (!skip) fetchData();
  }, [fetchData, skip]);

  return {
    taskStats,
    budgetStats,
    orderStats,
    timelineStats,
    inProgressTasks,
    recentActivities,
    viewerMode,
    loading,
    refetch: fetchData,
  };
}

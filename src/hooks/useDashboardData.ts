import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DashboardProject {
  id: string;
  name: string;
  address: string | null;
  status: string | null;
  totalBudget: number;
  spentAmount: number;
  tasksDone: number;
  tasksTotal: number;
  progress: number;
}

export interface DashboardActivity {
  id: string;
  action: string;
  entityType: string;
  entityName: string | null;
  createdAt: string;
  actorName: string | null;
  actorColor: string;
}

export interface DashboardStats {
  activeProjects: number;
  tasksThisWeek: number;
  budgetRemaining: number;
  totalBudget: number;
  pendingPurchases: number;
}

export interface DashboardData {
  userName: string;
  stats: DashboardStats;
  projects: DashboardProject[];
  activities: DashboardActivity[];
  isLoading: boolean;
}

const ACTIVITY_COLORS = [
  "oklch(55% 0.12 75)",
  "oklch(52% 0.09 155)",
  "oklch(45% 0.05 230)",
  "oklch(58% 0.14 25)",
  "oklch(72% 0.12 75)",
];

export function useDashboardData(userId: string | undefined): DashboardData {
  // 1. Profile
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["dashboard-profile", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("name")
        .eq("user_id", userId!)
        .single();
      return data;
    },
    enabled: !!userId,
    staleTime: 300_000,
  });

  // 2. Projects + budget
  const { data: projects, isLoading: projectsLoading } = useQuery({
    queryKey: ["dashboard-projects", userId],
    queryFn: async () => {
      // Get owned + shared project IDs
      const [ownedRes, sharedRes] = await Promise.all([
        supabase
          .from("projects")
          .select("id")
          .is("deleted_at", null),
        supabase
          .from("project_shares")
          .select("project_id"),
      ]);

      const projectIds = [
        ...new Set([
          ...(ownedRes.data || []).map((p) => p.id),
          ...(sharedRes.data || []).map((s) => s.project_id),
        ]),
      ];

      if (projectIds.length === 0) return [];

      const { data } = await supabase
        .from("projects")
        .select("id, name, address, status, contract_value, spent_amount")
        .in("id", projectIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      return data || [];
    },
    enabled: !!userId,
    staleTime: 60_000,
  });

  const projectIds = (projects || []).map((p) => p.id);

  // 3. Tasks aggregation
  const { data: tasksByProject, isLoading: tasksLoading } = useQuery({
    queryKey: ["dashboard-tasks", projectIds],
    queryFn: async () => {
      const { data } = await supabase
        .from("tasks")
        .select("id, status, project_id, due_date")
        .in("project_id", projectIds);

      const map = new Map<string, { total: number; done: number }>();
      let tasksThisWeek = 0;

      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay() + 1); // Monday
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);

      for (const task of data || []) {
        const entry = map.get(task.project_id) || { total: 0, done: 0 };
        entry.total++;
        if (task.status === "done") entry.done++;
        map.set(task.project_id, entry);

        // Count tasks with due_date this week (regardless of status)
        if (task.due_date) {
          const due = new Date(task.due_date);
          if (due >= weekStart && due < weekEnd) tasksThisWeek++;
        }
      }

      return { map, tasksThisWeek };
    },
    enabled: projectIds.length > 0,
    staleTime: 60_000,
  });

  // 4. Pending purchases
  const { data: pendingCount } = useQuery({
    queryKey: ["dashboard-pending-purchases", projectIds],
    queryFn: async () => {
      const { count } = await supabase
        .from("materials")
        .select("id", { count: "exact", head: true })
        .in("project_id", projectIds)
        .eq("status", "to_order");
      return count || 0;
    },
    enabled: projectIds.length > 0,
    staleTime: 60_000,
  });

  // 5. Activity feed (cross-project)
  const { data: rawActivities } = useQuery({
    queryKey: ["dashboard-activities", projectIds],
    queryFn: async () => {
      const { data } = await supabase
        .from("activity_log")
        .select("id, action, entity_type, entity_name, created_at, actor:profiles!activity_log_actor_id_fkey(name)")
        .in("project_id", projectIds)
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: projectIds.length > 0,
    staleTime: 60_000,
  });

  // Aggregate
  const activeProjects = (projects || []).filter(
    (p) => p.status && !["completed", "archived"].includes(p.status)
  ).length;

  const totalBudget = (projects || []).reduce(
    (sum, p) => sum + (p.contract_value || 0),
    0
  );
  const totalSpent = (projects || []).reduce(
    (sum, p) => sum + (p.spent_amount || 0),
    0
  );

  const enrichedProjects: DashboardProject[] = (projects || []).map((p) => {
    const tasks = tasksByProject?.map.get(p.id) || { total: 0, done: 0 };
    const progress = tasks.total > 0 ? Math.round((tasks.done / tasks.total) * 100) : 0;
    return {
      id: p.id,
      name: p.name,
      address: p.address,
      status: p.status,
      totalBudget: p.contract_value || 0,
      spentAmount: p.spent_amount || 0,
      tasksDone: tasks.done,
      tasksTotal: tasks.total,
      progress,
    };
  });

  // Assign colors per unique actor (not per index) so each person gets a consistent color
  const actorColorMap = new Map<string, string>();
  let colorIdx = 0;
  const activities: DashboardActivity[] = (rawActivities || []).map((a) => {
    const actorKey = (a.actor as { name: string } | null)?.name || "system";
    if (!actorColorMap.has(actorKey)) {
      actorColorMap.set(actorKey, ACTIVITY_COLORS[colorIdx % ACTIVITY_COLORS.length]);
      colorIdx++;
    }
    return {
      id: a.id,
      action: a.action,
      entityType: a.entity_type,
      entityName: a.entity_name,
      createdAt: a.created_at,
      actorName: actorKey === "system" ? null : actorKey,
      actorColor: actorColorMap.get(actorKey)!,
    };
  });

  return {
    userName: profile?.name || "",
    stats: {
      activeProjects,
      tasksThisWeek: tasksByProject?.tasksThisWeek || 0,
      budgetRemaining: totalBudget - totalSpent,
      totalBudget,
      pendingPurchases: pendingCount || 0,
    },
    projects: enrichedProjects,
    activities,
    isLoading: profileLoading || projectsLoading || tasksLoading,
  };
}

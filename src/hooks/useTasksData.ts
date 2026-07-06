/**
 * useTasksData — data fetching hook for TasksTab.
 * Loads tasks, rooms, stakeholders, team members, dependencies, and permissions.
 */

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface TaskItem {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  start_date: string | null;
  finish_date: string | null;
  progress: number;
  assigned_to_stakeholder_id: string | null;
  room_id: string | null;
  budget: number | null;
  ordered_amount: number | null;
  payment_status: string | null;
  paid_amount: number | null;
  cost_center: string | null;
  cost_centers?: string[] | null;
  checklists?: Array<{ id: string; title: string; items: Array<{ id: string; title: string; completed: boolean }> }>;
  task_cost_type: string | null;
  estimated_hours: number | null;
  hourly_rate: number | null;
  subcontractor_cost: number | null;
  markup_percent: number | null;
  material_estimate: number | null;
  labor_cost_percent: number | null;
  material_markup_percent: number | null;
  material_items?: { amount?: number }[] | null;
  supplier_id: string | null;
  is_ata?: boolean;
  parent_task_id?: string | null;
  attachmentCount?: number;
  fileCategories?: string[];
  [key: string]: unknown;
}

export interface StakeholderItem {
  id: string;
  name: string;
  role: string;
  contractor_category: string | null;
}

export interface TeamMemberItem {
  id: string;
  name: string;
  role?: string;
}

export interface TaskDependencyItem {
  id: string;
  depends_on_task_id: string;
}

interface UseTasksDataResult {
  tasks: TaskItem[];
  setTasks: React.Dispatch<React.SetStateAction<TaskItem[]>>;
  loading: boolean;
  rooms: Array<{ id: string; name: string }>;
  stakeholders: StakeholderItem[];
  teamMembers: TeamMemberItem[];
  taskDependencies: Record<string, TaskDependencyItem[]>;
  currentProfileId: string | null;
  defaultLaborCostPercent: number;
  canCreateRequests: boolean;
  taskMaterialSpend: Map<string, number>;
  taskMaterialPlanned: Map<string, number>;
  refetchTasks: () => Promise<void>;
  refetchRooms: () => Promise<void>;
  refetchStakeholders: () => Promise<void>;
  refetchTeamMembers: () => Promise<void>;
  refetchTaskDependencies: () => Promise<void>;
}

export function useTasksData(
  projectId: string,
  tasksScope: "all" | "assigned" = "all",
): UseTasksDataResult {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [rooms, setRooms] = useState<Array<{ id: string; name: string }>>([]);
  const [stakeholders, setStakeholders] = useState<StakeholderItem[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMemberItem[]>([]);
  const [taskDependencies, setTaskDependencies] = useState<Record<string, TaskDependencyItem[]>>({});
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(null);
  const [defaultLaborCostPercent, setDefaultLaborCostPercent] = useState(57);
  const [canCreateRequests, setCanCreateRequests] = useState(false);
  const [taskMaterialSpend, setTaskMaterialSpend] = useState<Map<string, number>>(new Map());
  const [taskMaterialPlanned, setTaskMaterialPlanned] = useState<Map<string, number>>(new Map());

  const fetchRooms = useCallback(async () => {
    const { data } = await supabase
      .from("rooms")
      .select("id, name")
      .eq("project_id", projectId)
      .order("name");
    setRooms(data || []);
  }, [projectId]);

  const checkPermissions = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, default_labor_cost_percent")
      .eq("user_id", user.id)
      .single();
    if (!profile) return;

    setCurrentProfileId(profile.id);
    if (profile.default_labor_cost_percent != null) {
      setDefaultLaborCostPercent(profile.default_labor_cost_percent);
    }

    const { data: shareData } = await supabase
      .from("project_shares")
      .select("can_create_purchase_requests")
      .eq("project_id", projectId)
      .eq("shared_with_user_id", profile.id)
      .maybeSingle();
    setCanCreateRequests(shareData?.can_create_purchase_requests || false);
  }, [projectId]);

  const fetchStakeholders = useCallback(async () => {
    const { data } = await supabase
      .from("stakeholders" as string)
      .select("id, name, role, contractor_category")
      .eq("project_id", projectId)
      .order("name");
    setStakeholders((data || []) as unknown as StakeholderItem[]);
  }, [projectId]);

  const fetchTasks = useCallback(async () => {
    try {
      let query = supabase
        .from("tasks")
        .select("*")
        .eq("project_id", projectId);

      if (tasksScope === "assigned" && currentProfileId) {
        query = query.eq("assigned_to_stakeholder_id", currentProfileId);
      }

      const [{ data, error }, materialsRes, fileLinksRes] = await Promise.all([
        query.order("created_at", { ascending: false }),
        supabase
          .from("materials")
          .select("task_id, price_total, status, quantity, price_per_unit")
          .eq("project_id", projectId)
          .eq("exclude_from_budget", false)
          .not("task_id", "is", null),
        supabase
          .from("task_file_links")
          .select("task_id, file_type")
          .eq("project_id", projectId)
          .not("task_id", "is", null),
      ]);

      if (error) throw error;

      const spendMap = new Map<string, number>();
      const plannedMap = new Map<string, number>();
      (materialsRes.data || []).forEach((m: { task_id: string | null; price_total: number | null; status: string | null; quantity: number | null; price_per_unit: number | null }) => {
        if (m.task_id) {
          const cost = m.price_total ?? ((m.quantity || 0) * (m.price_per_unit || 0));
          if (m.status === "planned") {
            plannedMap.set(m.task_id, (plannedMap.get(m.task_id) || 0) + cost);
          } else {
            spendMap.set(m.task_id, (spendMap.get(m.task_id) || 0) + cost);
          }
        }
      });
      setTaskMaterialSpend(spendMap);
      setTaskMaterialPlanned(plannedMap);

      const attachCountMap = new Map<string, number>();
      const fileCatMap = new Map<string, Set<string>>();
      (fileLinksRes.data || []).forEach((l: { task_id: string | null; file_type: string }) => {
        if (l.task_id) {
          attachCountMap.set(l.task_id, (attachCountMap.get(l.task_id) || 0) + 1);
          if (!fileCatMap.has(l.task_id)) fileCatMap.set(l.task_id, new Set());
          fileCatMap.get(l.task_id)!.add(l.file_type);
        }
      });

      const mappedTasks = (data || []).map((task: Record<string, unknown>) => ({
        ...task,
        assigned_to_stakeholder_id: (task.assigned_to_stakeholder_id || task.assigned_to_contractor_id || null) as string | null,
        attachmentCount: attachCountMap.get(task.id as string) || 0,
        fileCategories: fileCatMap.has(task.id as string) ? [...fileCatMap.get(task.id as string)!] : [],
      }));

      setTasks(mappedTasks as TaskItem[]);
    } catch (error) {
      console.error("Error fetching tasks:", error);
    } finally {
      setLoading(false);
    }
  }, [projectId, tasksScope, currentProfileId]);

  const fetchTeamMembers = useCallback(async () => {
    const { data: projectData } = await supabase
      .from("projects")
      .select("owner_id, profiles!projects_owner_id_fkey(id, name)")
      .eq("id", projectId)
      .single();

    const members: TeamMemberItem[] = [];
    if (projectData?.profiles) {
      const p = projectData.profiles as unknown as { id: string; name: string };
      members.push({ id: p.id, name: p.name, role: "Owner" });
    }

    const { data: shares } = await supabase
      .from("project_shares")
      .select("shared_with_user_id, role, profiles!project_shares_shared_with_user_id_fkey(id, name)")
      .eq("project_id", projectId);

    if (shares) {
      const existingIds = new Set(members.map((m) => m.id));
      shares.forEach((share: Record<string, unknown>) => {
        const p = share.profiles as { id: string; name: string } | null;
        if (p && !existingIds.has(p.id)) {
          existingIds.add(p.id);
          members.push({ id: p.id, name: p.name, role: share.role as string });
        }
      });
    }

    setTeamMembers(members);
  }, [projectId]);

  const fetchTaskDependencies = useCallback(async () => {
    if (tasks.length === 0) return;
    const { data } = await supabase
      .from("task_dependencies")
      .select("*")
      .in("task_id", tasks.map((t) => t.id));

    const deps: Record<string, TaskDependencyItem[]> = {};
    data?.forEach((dep: Record<string, unknown>) => {
      const taskId = dep.task_id as string;
      if (!deps[taskId]) deps[taskId] = [];
      deps[taskId].push(dep as unknown as TaskDependencyItem);
    });
    setTaskDependencies(deps);
  }, [tasks]);

  // Initial load
  useEffect(() => {
    fetchTasks();
    checkPermissions();
    fetchTeamMembers();
    fetchStakeholders();
    fetchRooms();
  }, [projectId]);

  // Re-fetch when profile resolves for scope filtering
  useEffect(() => {
    if (tasksScope === "assigned" && currentProfileId) {
      fetchTasks();
    }
  }, [currentProfileId, tasksScope]);

  // Renaida applied/undid changes out-of-band → the table snapshot goes stale
  // vs the modal (which re-fetches by id on open). Mirror OverviewTab's listener.
  useEffect(() => {
    const handler = () => fetchTasks();
    window.addEventListener("renaida-data-changed", handler);
    return () => window.removeEventListener("renaida-data-changed", handler);
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch dependencies after tasks load
  useEffect(() => {
    if (tasks.length > 0) fetchTaskDependencies();
  }, [tasks.length]);

  return {
    tasks,
    setTasks,
    loading,
    rooms,
    stakeholders,
    teamMembers,
    taskDependencies,
    currentProfileId,
    defaultLaborCostPercent,
    canCreateRequests,
    taskMaterialSpend,
    taskMaterialPlanned,
    refetchTasks: fetchTasks,
    refetchRooms: fetchRooms,
    refetchStakeholders: fetchStakeholders,
    refetchTeamMembers: fetchTeamMembers,
    refetchTaskDependencies: fetchTaskDependencies,
  };
}

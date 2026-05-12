import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useTasksData } from "@/hooks/useTasksData";
import { analytics, AnalyticsEvents } from "@/lib/analytics";
import { usePersistedPreference } from "@/hooks/usePersistedPreference";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ColumnToggle } from "@/components/shared/ColumnToggle";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { DatePicker } from "@/components/ui/date-picker";
import { useToast } from "@/hooks/use-toast";
// Tabs replaced with custom handoff-styled toggle buttons
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, CheckCircle2, Circle, Clock, XCircle, Pencil, Users, ChevronDown, ChevronUp, DollarSign, Tag, LayoutGrid, Table as TableIcon, Filter, CheckSquare, Trash2, X, ShoppingCart, Calendar, MapPin, Map as MapIcon, Loader2, AlertTriangle, Link2, ImageIcon, MessageSquare, Columns3, AlignJustify, Layers, MoreVertical } from "lucide-react";
import { TaskListSkeleton } from "@/components/ui/skeleton-screens";
import { DEFAULT_COST_CENTERS, getCostCenterIcon, getCostCenterLabel } from "@/lib/costCenters";
import { formatCurrency } from "@/lib/currency";
import { parseLocalDate, formatLocalDate } from "@/lib/dateUtils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import MaterialsList from "./MaterialsList";
import { EntityPhotoGallery } from "@/components/shared/EntityPhotoGallery";
import { CommentsSection } from "@/components/comments/CommentsSection";
import { TaskFilesList } from "./TaskFilesList";
import { Separator } from "@/components/ui/separator";
import ProjectTimeline from "./ProjectTimeline";
import { KonvaTimeline } from "./timeline/KonvaTimeline";
import { TaskEditDialog } from "./TaskEditDialog";
import { ProjectLockBanner } from "./ProjectLockBanner";
import { useProjectLock } from "@/hooks/useProjectLock";
import { PUBLIC_DEMO_PROJECT_ID } from "@/constants/publicDemo";
import { getStatusSolidColor } from "@/lib/statusColors";
import { TasksTableView, useTasksTableView, EXTRA_COLUMN_KEYS } from "./tasks";
import { useBulkTaskActions } from "./tasks/useBulkTaskActions";
import { BulkActionBar } from "./tasks/BulkActionBar";
import { SwipeableRoomInstructions, useRoomInstructionsData } from "@/components/room-instructions";
import { TasksCalendarView } from "./calendar";

interface ChecklistItem {
  id: string;
  title: string;
  completed: boolean;
}

interface Checklist {
  id: string;
  title: string;
  items: ChecklistItem[];
}

interface Task {
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
  checklists?: Checklist[];
  // Cost estimation fields
  task_cost_type: string | null;
  estimated_hours: number | null;
  hourly_rate: number | null;
  subcontractor_cost: number | null;
  markup_percent: number | null;
  material_estimate: number | null;
  labor_cost_percent: number | null;
  material_markup_percent: number | null;
  material_items?: { amount?: number }[] | null;
  // Supplier
  supplier_id: string | null;
  // Sub-task / ÄTA fields
  is_ata?: boolean;
  parent_task_id?: string | null;
}

interface Stakeholder {
  id: string;
  name: string;
  role: string;
  contractor_category: string | null;
}

interface TeamMember {
  id: string;
  name: string;
  role?: string;
}

interface TaskDependency {
  id: string;
  depends_on_task_id: string;
}

interface TasksTabProps {
  projectId: string;
  projectName?: string;
  projectStatus?: string | null;
  tasksScope?: 'all' | 'assigned';
  tasksAccess?: 'none' | 'view' | 'edit';
  openEntityId?: string | null;
  onEntityOpened?: () => void;
  onNavigateToRoom?: (roomId: string) => void;
  showTimeline?: boolean;
  currency?: string | null;
  userType?: string | null;
}

const TasksTab = ({ projectId, projectName, projectStatus, tasksScope = 'all', tasksAccess = 'edit', openEntityId, onEntityOpened, onNavigateToRoom, showTimeline = true, currency, userType }: TasksTabProps) => {
  const { t } = useTranslation();
  const isPlanning = projectStatus === "planning";
  const isBuilder = userType !== "homeowner";
  const canEditTasks = tasksAccess === 'edit';
  const {
    tasks, setTasks, loading, rooms, stakeholders, teamMembers,
    taskDependencies, currentProfileId, defaultLaborCostPercent,
    canCreateRequests, taskMaterialSpend, taskMaterialPlanned,
    refetchTasks: fetchTasks, refetchRooms: fetchRooms,
    refetchStakeholders: fetchStakeholders, refetchTeamMembers: fetchTeamMembers,
    refetchTaskDependencies: fetchTaskDependencies,
  } = useTasksData(projectId, tasksScope);
  const [creating, setCreating] = useState(false);
  const [createStakeholderDialogOpen, setCreateStakeholderDialogOpen] = useState(false);
  const [newStakeholderName, setNewStakeholderName] = useState("");
  const [newStakeholderRole, setNewStakeholderRole] = useState<'contractor' | 'client' | 'other'>('contractor');
  const [newStakeholderCategory, setNewStakeholderCategory] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskAssignee, setNewTaskAssignee] = useState("");
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState("medium");
  const [newTaskStartDate, setNewTaskStartDate] = useState("");
  const [newTaskFinishDate, setNewTaskFinishDate] = useState("");
  const [newTaskRoomId, setNewTaskRoomId] = useState<string>("");
  const [newTaskBudget, setNewTaskBudget] = useState("");
  const [newTaskCostCenter, setNewTaskCostCenter] = useState("");
  const [newTaskCostCenters, setNewTaskCostCenters] = useState<string[]>([]);
  const [customCostCenters, setCustomCostCenters] = useState<string[]>([]);
  const [showCustomCostCenter, setShowCustomCostCenter] = useState(false);
  const [customCostCenterValue, setCustomCostCenterValue] = useState("");
  const [newTaskIsAta, setNewTaskIsAta] = useState(false);
  const [newTaskParentId, setNewTaskParentId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editVariant, setEditVariant] = useState<"dialog" | "sheet">("dialog");
  const { toast } = useToast();
  const { lockStatus } = useProjectLock(projectId);

  // Filters (multi-select: empty set = show all)
  const [filterStatuses, setFilterStatuses] = useState<Set<string>>(new Set());
  const [filterAssignees, setFilterAssignees] = useState<Set<string>>(new Set());
  const [filterRooms, setFilterRooms] = useState<Set<string>>(new Set());
  const [filterCostCenters, setFilterCostCenters] = useState<Set<string>>(new Set());
  
  // View mode — persisted per project + synced to server
  // Schedule view (top section): timeline or calendar
  type ScheduleView = 'timeline' | 'calendar';
  const [scheduleView, setScheduleView] = usePersistedPreference<string>(`tasks-schedule-view-${projectId}`, 'timeline');
  const safeScheduleView = (scheduleView === 'calendar' ? 'calendar' : 'timeline') as ScheduleView;
  const [scheduleOpen, setScheduleOpen] = useState(() => localStorage.getItem(`tasks-schedule-open-${projectId}`) !== 'false');

  // Detail view (bottom section): table or kanban
  type DetailView = 'table' | 'kanban';
  const [detailView, setDetailView] = usePersistedPreference<string>(`tasks-detail-view-${projectId}`, 'kanban');
  const safeDetailView = (detailView === 'table' ? 'table' : 'kanban') as DetailView;

  // Legacy compat — viewMode used by some conditional toolbar items
  const viewMode = safeDetailView;
  const handleSetViewMode = (v: string) => {
    if (v === 'timeline' || v === 'calendar') { setScheduleView(v); setScheduleOpen(true); }
    else setDetailView(v);
  };

  // Table view state (lifted so toolbar can render in parent)
  const tableViewState = useTasksTableView(projectId);

  // Bulk selection — moved below fetchTasks definition

  // Room instructions data (for rooms view mode — legacy, kept for potential reuse)
  const { rooms: roomInstructions, floorPlanShapes } = useRoomInstructionsData(projectId, null);
  
  // Column order for Kanban view (filter out legacy 'done' status which is merged into 'completed')
  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    const saved = localStorage.getItem(`kanban-column-order-${projectId}`);
    const order = saved ? JSON.parse(saved) : ['planned', 'to_do', 'in_progress', 'waiting', 'completed', 'cancelled'];
    return order.filter((s: string) => s !== 'done');
  });

  // Which Kanban columns are visible — default: only the three core statuses
  const [kanbanVisibleStatuses, setKanbanVisibleStatuses] = useState<Set<string>>(() => {
    const saved = localStorage.getItem(`kanban-visible-statuses-${projectId}`);
    if (saved) {
      try { return new Set(JSON.parse(saved) as string[]); } catch { /* ignore */ }
    }
    return new Set(['to_do', 'in_progress', 'completed']);
  });

  const toggleKanbanStatus = (status: string) => {
    setKanbanVisibleStatuses(prev => {
      const next = new Set(prev);
      next.has(status) ? next.delete(status) : next.add(status);
      localStorage.setItem(`kanban-visible-statuses-${projectId}`, JSON.stringify([...next]));
      return next;
    });
  };
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  
  // Custom column names
  const [customColumnNames, setCustomColumnNames] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem(`kanban-column-names-${projectId}`);
    return saved ? JSON.parse(saved) : {};
  });
  const [editingColumnName, setEditingColumnName] = useState<string | null>(null);
  const [editingColumnValue, setEditingColumnValue] = useState<string>("");
  
  // Drag and drop
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);

  // Milestones for calendar view
  const [calendarMilestones, setCalendarMilestones] = useState<Array<{ id: string; title: string; date: string; color: string | null }>>([]);
  const fetchMilestones = () => {
    supabase.from("milestones").select("id, title, date, color").eq("project_id", projectId).order("date")
      .then(({ data }) => { if (data) setCalendarMilestones(data); });
  };
  useEffect(() => { fetchMilestones(); }, [projectId, viewMode]);

  // Purchase Orders for edit dialog
  const [editTaskMaterials, setEditTaskMaterials] = useState<{ id: string; name: string; quantity: number; unit: string; price_per_unit: number | null; price_total: number | null; status: string }[]>([]);
  const [poDialogOpen, setPoDialogOpen] = useState(false);
  const [creatingPO, setCreatingPO] = useState(false);
  const [poName, setPoName] = useState("");
  const [poQuantity, setPoQuantity] = useState("1");
  const [poUnit, setPoUnit] = useState("pcs");
  const [poPricePerUnit, setPoPricePerUnit] = useState("");


  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!profile) throw new Error("Profile not found");

      const { error } = await supabase
        .from("tasks")
        .insert({
          project_id: projectId,
          title: newTaskTitle,
          description: newTaskDescription,
          status: "to_do",
          priority: newTaskPriority,
          start_date: newTaskStartDate || null,
          finish_date: newTaskFinishDate || null,
          room_id: newTaskRoomId || null,
          budget: newTaskBudget ? parseFloat(newTaskBudget) : null,
          cost_center: newTaskCostCenter || (newTaskCostCenters.length > 0 ? newTaskCostCenters[0] : null),
          cost_centers: newTaskCostCenters.length > 0 ? newTaskCostCenters : null,
          assigned_to_stakeholder_id: newTaskAssignee && newTaskAssignee !== "unassigned" ? newTaskAssignee : null,
          created_by_user_id: profile.id,
          is_ata: !isPlanning && newTaskIsAta,
          parent_task_id: newTaskParentId || null,
        });

      if (error) throw error;

      // Track task creation
      analytics.capture(AnalyticsEvents.TASK_CREATED, {
        has_description: Boolean(newTaskDescription),
        has_room: Boolean(newTaskRoomId),
        has_assignee: Boolean(newTaskAssignee && newTaskAssignee !== "unassigned"),
        has_dates: Boolean(newTaskStartDate || newTaskFinishDate),
        has_budget: Boolean(newTaskBudget),
        priority: newTaskPriority,
      });

      toast({
        title: t('tasks.taskCreated'),
        description: t('tasks.taskCreatedDescription'),
      });

      setDialogOpen(false);
      setNewTaskTitle("");
      setNewTaskDescription("");
      setNewTaskPriority("medium");
      setNewTaskAssignee("");
      setNewTaskStartDate("");
      setNewTaskFinishDate("");
      setNewTaskRoomId("");
      setNewTaskBudget("");
      setNewTaskCostCenter("");
      setNewTaskCostCenters([]);
      setShowCustomCostCenter(false);
      setCustomCostCenterValue("");
      setNewTaskIsAta(false);
      setNewTaskParentId(null);
      fetchTasks();
    } catch (error: unknown) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleEditTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask) return;
    setCreating(true);

    try {
      const payload: Record<string, unknown> = {
        title: editingTask.title,
        description: editingTask.description,
        status: editingTask.status,
        priority: editingTask.priority,
        start_date: editingTask.start_date || null,
        finish_date: editingTask.finish_date || null,
        room_id: editingTask.room_id || null,
        progress: editingTask.progress,
        assigned_to_stakeholder_id: editingTask.assigned_to_stakeholder_id || null,
        budget: editingTask.budget || null,
        ordered_amount: editingTask.ordered_amount || null,
        payment_status: editingTask.payment_status || null,
        paid_amount: editingTask.paid_amount || null,
        cost_center: editingTask.cost_center || null,
        cost_centers: editingTask.cost_centers || null,
        checklists: editingTask.checklists || [],
      };

      if ("task_cost_type" in editingTask) {
        payload.task_cost_type = editingTask.task_cost_type || "own_labor";
        payload.estimated_hours = editingTask.estimated_hours || null;
        payload.hourly_rate = editingTask.hourly_rate || null;
        payload.subcontractor_cost = editingTask.subcontractor_cost || null;
        payload.markup_percent = editingTask.markup_percent ?? 0;
        payload.material_estimate = editingTask.material_estimate || null;
      }

      const { error } = await supabase
        .from("tasks")
        .update(payload)
        .eq("id", editingTask.id);

      if (error) throw error;

      toast({
        title: t('tasks.taskUpdated'),
        description: t('tasks.taskUpdatedDescription'),
      });

      setEditDialogOpen(false);
      setEditingTask(null);
      fetchTasks();
    } catch (error: unknown) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleAddDependency = async (taskId: string, dependsOnTaskId: string) => {
    try {
      const { error } = await supabase
        .from("task_dependencies")
        .insert({
          task_id: taskId,
          depends_on_task_id: dependsOnTaskId,
        });

      if (error) throw error;

      toast({
        title: t('tasks.dependencyAdded'),
        description: t('tasks.dependencyAddedDescription'),
      });

      fetchTaskDependencies();
    } catch (error: unknown) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleRemoveDependency = async (dependencyId: string) => {
    try {
      const { error } = await supabase
        .from("task_dependencies")
        .delete()
        .eq("id", dependencyId);

      if (error) throw error;

      toast({
        title: t('tasks.dependencyRemoved'),
        description: t('tasks.dependencyRemovedDescription'),
      });

      fetchTaskDependencies();
    } catch (error: unknown) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const fetchEditTaskMaterials = async (taskId: string) => {
    const { data } = await supabase
      .from("materials")
      .select("id, name, quantity, unit, price_per_unit, price_total, status")
      .eq("task_id", taskId);
    setEditTaskMaterials(data || []);
  };

  const handleCreatePurchaseOrder = async () => {
    if (!editingTask || !poName.trim()) return;
    setCreatingPO(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!profile) throw new Error("Profile not found");

      const { error } = await supabase
        .from("materials")
        .insert({
          name: poName.trim(),
          quantity: parseFloat(poQuantity) || 1,
          unit: poUnit,
          price_per_unit: poPricePerUnit ? parseFloat(poPricePerUnit) : null,
          status: "submitted",
          task_id: editingTask.id,
          project_id: projectId,
          created_by_user_id: profile.id,
        });

      if (error) throw error;

      toast({
        title: t('common.success', 'Success'),
        description: t('taskPanel.poCreated', 'Purchase order created and linked to task'),
      });

      setPoName("");
      setPoQuantity("1");
      setPoUnit("pcs");
      setPoPricePerUnit("");
      setPoDialogOpen(false);
      fetchEditTaskMaterials(editingTask.id);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error("Error creating purchase order:", error);
      toast({
        title: t('common.error', 'Error'),
        description: message,
        variant: "destructive",
      });
    } finally {
      setCreatingPO(false);
    }
  };

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("tasks")
        .update({ status: newStatus })
        .eq("id", taskId);

      if (error) throw error;

      fetchTasks();
      toast({
        title: t('tasks.statusUpdated'),
        description: t('tasks.statusUpdatedDescription', { status: newStatus.replace('_', ' ') }),
      });
    } catch (error: unknown) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-success" />;
      case "in_progress":
        return <Clock className="h-4 w-4 text-warning" />;
      case "waiting":
        return <Clock className="h-4 w-4 text-muted-foreground" />;
      case "on_hold":
        return <XCircle className="h-4 w-4 text-muted-foreground" />;
      default:
        return <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/20 ml-[3px]" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "destructive";
      case "low":
        return "secondary";
      default:
        return "default";
    }
  };

  // Filter tasks based on selected filters (merge 'done' into 'completed' for filtering)
  const filteredTasks = tasks.filter(task => {
    if (filterStatuses.size > 0) {
      const statusMatches = filterStatuses.has(task.status) ||
        (task.status === 'done' && filterStatuses.has('completed'));
      if (!statusMatches) return false;
    }
    if (filterAssignees.size > 0) {
      const val = task.assigned_to_stakeholder_id || "unassigned";
      if (!filterAssignees.has(val)) return false;
    }
    if (filterRooms.size > 0) {
      const val = task.room_id || "unassigned";
      if (!filterRooms.has(val)) return false;
    }
    if (filterCostCenters.size > 0) {
      const ccs = task.cost_centers || (task.cost_center ? [task.cost_center] : []);
      if (ccs.length === 0 && !filterCostCenters.has("none")) return false;
      if (ccs.length > 0 && !ccs.some(cc => filterCostCenters.has(cc))) return false;
    }
    return true;
  });

  // Bulk selection — shared across all views
  const bulk = useBulkTaskActions({ tasks, projectId, onTaskUpdated: fetchTasks });

  // Modifier-aware click: Cmd/Ctrl+click → bulk select, normal click → open task
  const handleTaskClickWithModifier = (task: Task, nativeEvent?: MouseEvent | React.MouseEvent) => {
    if (nativeEvent && (nativeEvent.metaKey || nativeEvent.ctrlKey || nativeEvent.shiftKey)) {
      bulk.toggleOne(task.id);
      return;
    }
    setEditingTask(task);
    setEditVariant(safeScheduleView === "timeline" && scheduleOpen ? "sheet" : "dialog");
    setEditDialogOpen(true);
  };

  // Group tasks by status (supporting both old and new status values)
  // Note: 'done' is a legacy status that should be merged into 'completed'
  const statusOrder = ['planned', 'to_do', 'in_progress', 'waiting', 'completed', 'cancelled'] as const;
  const kanbanStatusDotColor = (status: string): string => {
    const map: Record<string, string> = {
      planned:     "bg-indigo-400",
      to_do:       "bg-muted-foreground/50",
      in_progress: "bg-primary",
      waiting:     "bg-amber-500",
      completed:   "bg-emerald-500",
      cancelled:   "bg-red-400",
    };
    return map[status] || "bg-muted-foreground/30";
  };

  const statusLabels: Record<string, string> = {
    planned: t('statuses.planned', 'Planned'),
    to_do: t('statuses.toDo'),
    in_progress: t('statuses.inProgress'),
    waiting: t('statuses.waiting', 'Waiting'),
    completed: t('statuses.completed'),
    cancelled: t('statuses.cancelled', 'Cancelled'),
  };

  // Group tasks by status, merging legacy 'done' status into 'completed'
  const groupedTasks = statusOrder.reduce((acc, status) => {
    const tasksForStatus = filteredTasks.filter(t =>
      t.status === status || (status === 'completed' && t.status === 'done')
    );
    acc[status] = tasksForStatus;
    return acc;
  }, {} as Record<string, Task[]>);

  // Find tasks with unknown statuses ('done' is known but merged into 'completed')
  const knownStatuses = [...statusOrder, 'done'] as string[];
  const unknownStatusTasks = filteredTasks.filter(t => !knownStatuses.includes(t.status));

  // Add unknown status tasks to a catch-all column
  const allStatusesWithUnknown = [...statusOrder];
  if (unknownStatusTasks.length > 0) {
    // Group unknown tasks by their actual status
    unknownStatusTasks.forEach(task => {
      if (!allStatusesWithUnknown.includes(task.status as any)) {
        allStatusesWithUnknown.push(task.status as any);
        groupedTasks[task.status] = groupedTasks[task.status] || [];
        groupedTasks[task.status].push(task);
      }
    });
  }

  // Extract unknown statuses (statuses not in columnOrder)
  const unknownStatuses = allStatusesWithUnknown.filter(status => !columnOrder.includes(status));

  const getAssignedMemberName = (task: Task) => {
    if (!task.assigned_to_stakeholder_id) return null;
    const member = teamMembers.find(m => m.id === task.assigned_to_stakeholder_id);
    return member?.name;
  };

  // Calculate counts for filter options (merge 'done' into 'completed' count)
  const getStatusCount = (status: string) => tasks.filter(t =>
    t.status === status || (status === 'completed' && t.status === 'done')
  ).length;

  const getAssigneeCount = (assigneeId: string) => {
    if (assigneeId === "unassigned") return tasks.filter(t => !t.assigned_to_stakeholder_id).length;
    return tasks.filter(t => t.assigned_to_stakeholder_id === assigneeId).length;
  };

  const getRoomCount = (roomId: string) => {
    if (roomId === "unassigned") return tasks.filter(t => !t.room_id).length;
    return tasks.filter(t => t.room_id === roomId).length;
  };

  const getCostCenterCount = (ccId: string) => {
    if (ccId === "none") return tasks.filter(t => {
      const ccs = t.cost_centers || (t.cost_center ? [t.cost_center] : []);
      return ccs.length === 0;
    }).length;
    return tasks.filter(t => {
      const ccs = t.cost_centers || (t.cost_center ? [t.cost_center] : []);
      return ccs.includes(ccId);
    }).length;
  };

  // Build cost center filter options from defaults + custom values in tasks
  const allCostCenterIds = new Set<string>();
  tasks.forEach(t => {
    const ccs = t.cost_centers || (t.cost_center ? [t.cost_center] : []);
    ccs.forEach(cc => allCostCenterIds.add(cc));
  });
  const defaultCcIds = DEFAULT_COST_CENTERS.map(cc => cc.id);
  const customCcIds = [...allCostCenterIds].filter(id => !defaultCcIds.includes(id));

  const toggleFilterValue = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, value: string) => {
    setter(prev => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  // Column name editing handlers
  const handleStartEditColumnName = (status: string, currentName: string) => {
    setEditingColumnName(status);
    setEditingColumnValue(currentName);
  };

  const handleSaveColumnName = (status: string) => {
    if (editingColumnValue.trim()) {
      const newNames = { ...customColumnNames, [status]: editingColumnValue.trim() };
      setCustomColumnNames(newNames);
      localStorage.setItem(`kanban-column-names-${projectId}`, JSON.stringify(newNames));
    } else {
      // Remove custom name if empty (revert to default)
      const newNames = { ...customColumnNames };
      delete newNames[status];
      setCustomColumnNames(newNames);
      localStorage.setItem(`kanban-column-names-${projectId}`, JSON.stringify(newNames));
    }
    setEditingColumnName(null);
    setEditingColumnValue("");
  };

  const handleCancelEditColumnName = () => {
    setEditingColumnName(null);
    setEditingColumnValue("");
  };

  // Drag and drop handlers for columns
  const handleColumnDragStart = (status: string) => {
    setDraggedColumn(status);
  };

  const handleColumnDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleColumnDrop = (targetStatus: string) => {
    if (!draggedColumn || draggedColumn === targetStatus) {
      setDraggedColumn(null);
      return;
    }

    const newOrder = [...columnOrder];
    const draggedIndex = newOrder.indexOf(draggedColumn);
    const targetIndex = newOrder.indexOf(targetStatus);

    // Remove dragged column and insert at target position
    newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, draggedColumn);

    setColumnOrder(newOrder);
    localStorage.setItem(`kanban-column-order-${projectId}`, JSON.stringify(newOrder));
    setDraggedColumn(null);
  };

  // Drag and drop handlers for tasks
  const handleDragStart = (task: Task) => {
    setDraggedTask(task);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (newStatus: string) => {
    if (!draggedTask || !canEditTasks) return;
    
    try {
      const { error } = await supabase
        .from("tasks")
        .update({ status: newStatus })
        .eq("id", draggedTask.id);

      if (error) throw error;

      toast({
        title: t('tasks.taskUpdated'),
        description: t('tasks.taskMovedTo', { status: statusLabels[newStatus as keyof typeof statusLabels] }),
      });

      fetchTasks();
    } catch (error: unknown) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDraggedTask(null);
    }
  };

  const getChecklistCounts = (task: Task) => {
    const checklists = task.checklists || [];
    let total = 0;
    let completed = 0;
    for (const cl of checklists) {
      for (const item of cl.items) {
        total++;
        if (item.completed) completed++;
      }
    }
    return { total, completed };
  };

  const TaskCard = ({ task }: { task: Task }) => {
    const isCompact = tableViewState.compactRows;
    const statusColor = getStatusSolidColor(task.status);
    const assigneeName = getAssignedMemberName(task);
    const roomName = task.room_id ? rooms.find(r => r.id === task.room_id)?.name : null;

    if (isCompact) {
      return (
        <div
          className={cn("flex items-center gap-2 px-2 py-1.5 rounded-md bg-card border border-border/60 cursor-grab hover:shadow-sm transition-all group", bulk.selectedIds.has(task.id) && "ring-2 ring-primary")}
          draggable
          onDragStart={() => handleDragStart(task)}
          onDragEnd={() => setDraggedTask(null)}
          onClick={(e) => handleTaskClickWithModifier(task, e)}
        >
          <div className="w-1 h-4 rounded-full shrink-0" style={{ backgroundColor: statusColor }} />
          <span className={cn("text-xs font-medium truncate flex-1", task.status === "completed" && "line-through text-muted-foreground")}>
            {task.title}
          </span>
          {task.priority === "high" && (
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
          )}
        </div>
      );
    }

    return (
      <div
        key={task.id}
        className={cn("rounded-xl border border-border/60 bg-card p-3 cursor-grab hover:shadow-md transition-all group", bulk.selectedIds.has(task.id) && "ring-2 ring-primary")}
        draggable
        onDragStart={() => handleDragStart(task)}
        onDragEnd={() => setDraggedTask(null)}
        onClick={(e) => handleTaskClickWithModifier(task, e)}
      >
        {/* Header: priority dot */}
        <div className="flex items-center gap-1.5 mb-1.5">
          {task.priority === "high" && (
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
          )}
        </div>

        {/* Title */}
        <p className={cn("text-[13px] font-medium leading-snug tracking-[-0.003em] mb-2", task.status === "completed" && "line-through text-muted-foreground")}>
          {task.title}
        </p>

        {/* Progress bar */}
        {task.progress > 0 && (
          <div className="h-[3px] bg-muted rounded-full overflow-hidden mb-2">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${task.progress}%`, backgroundColor: statusColor }}
            />
          </div>
        )}

        {/* Footer: room, due date, assignee */}
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {roomName && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-muted/60 text-[10px] font-medium truncate max-w-[100px]">
              {roomName}
            </span>
          )}
          {task.due_date && (
            <span className="font-mono text-[10px] tnum">{task.due_date.slice(5)}</span>
          )}
          <span className="flex-1" />
          {assigneeName ? (
            <div className="w-5 h-5 rounded-full bg-primary/80 text-primary-foreground grid place-items-center text-[9px] font-semibold shrink-0">
              {assigneeName.charAt(0).toUpperCase()}
            </div>
          ) : (
            <div className="w-5 h-5 rounded-full border border-dashed border-border shrink-0" />
          )}
        </div>
      </div>
    );
  };

  const filterCount = filterStatuses.size + filterAssignees.size + filterRooms.size + filterCostCenters.size;

  const filterPopover = (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5 relative">
          <Filter className="h-4 w-4" />
          <span className="hidden sm:inline">{t('tasks.filter', 'Filter')}</span>
          {filterCount > 0 && (
            <span className="ml-0.5 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-medium flex items-center justify-center">
              {filterCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0 max-h-[70vh] overflow-y-auto" align="start">
        <div className="max-h-[70vh] overflow-y-auto">
          {/* Status */}
          <div className="px-3 pt-3 pb-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('tasks.status')}</p>
          </div>
          <div className="px-1 pb-2">
            {statusOrder.map(status => {
              const count = getStatusCount(status);
              const label = statusLabels[status as keyof typeof statusLabels] || status;
              return (
                <label key={status} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                  <Checkbox checked={filterStatuses.has(status)} onCheckedChange={() => toggleFilterValue(setFilterStatuses, status)} />
                  <span className="flex-1">{label}</span>
                  <span className="text-xs text-muted-foreground">{count}</span>
                </label>
              );
            })}
          </div>
          <div className="border-t" />
          {/* Assignee */}
          <div className="px-3 pt-3 pb-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('tasks.assignee')}</p>
          </div>
          <div className="px-1 pb-2">
            <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
              <Checkbox checked={filterAssignees.has("unassigned")} onCheckedChange={() => toggleFilterValue(setFilterAssignees, "unassigned")} />
              <span className="flex-1">{t('common.unassigned')}</span>
              <span className="text-xs text-muted-foreground">{getAssigneeCount("unassigned")}</span>
            </label>
            {teamMembers.map(member => (
              <label key={member.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                <Checkbox checked={filterAssignees.has(member.id)} onCheckedChange={() => toggleFilterValue(setFilterAssignees, member.id)} />
                <span className="flex-1">{member.name}</span>
                <span className="text-xs text-muted-foreground">{getAssigneeCount(member.id)}</span>
              </label>
            ))}
          </div>
          <div className="border-t" />
          {/* Room */}
          <div className="px-3 pt-3 pb-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('tasks.room')}</p>
          </div>
          <div className="px-1 pb-2">
            <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
              <Checkbox checked={filterRooms.has("unassigned")} onCheckedChange={() => toggleFilterValue(setFilterRooms, "unassigned")} />
              <span className="flex-1">{t('tasks.noRoom')}</span>
              <span className="text-xs text-muted-foreground">{getRoomCount("unassigned")}</span>
            </label>
            {rooms.map(room => (
              <label key={room.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                <Checkbox checked={filterRooms.has(room.id)} onCheckedChange={() => toggleFilterValue(setFilterRooms, room.id)} />
                <span className="flex-1">{room.name}</span>
                <span className="text-xs text-muted-foreground">{getRoomCount(room.id)}</span>
              </label>
            ))}
          </div>
          <div className="border-t" />
          {/* Cost Center */}
          <div className="px-3 pt-3 pb-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('tasks.costCenter')}</p>
          </div>
          <div className="px-1 pb-2">
            <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
              <Checkbox checked={filterCostCenters.has("none")} onCheckedChange={() => toggleFilterValue(setFilterCostCenters, "none")} />
              <span className="flex-1">{t('common.none')}</span>
              <span className="text-xs text-muted-foreground">{getCostCenterCount("none")}</span>
            </label>
            {DEFAULT_COST_CENTERS.map(cc => {
              const Icon = cc.icon;
              return (
                <label key={cc.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                  <Checkbox checked={filterCostCenters.has(cc.id)} onCheckedChange={() => toggleFilterValue(setFilterCostCenters, cc.id)} />
                  <Icon className="h-3 w-3 flex-shrink-0" />
                  <span className="flex-1">{t(cc.labelKey, cc.label)}</span>
                  <span className="text-xs text-muted-foreground">{getCostCenterCount(cc.id)}</span>
                </label>
              );
            })}
            {customCcIds.map(ccId => (
              <label key={ccId} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                <Checkbox checked={filterCostCenters.has(ccId)} onCheckedChange={() => toggleFilterValue(setFilterCostCenters, ccId)} />
                <Tag className="h-3 w-3 flex-shrink-0" />
                <span className="flex-1">{getCostCenterLabel(ccId)}</span>
                <span className="text-xs text-muted-foreground">{getCostCenterCount(ccId)}</span>
              </label>
            ))}
          </div>
          {filterCount > 0 && (
            <>
              <div className="border-t" />
              <div className="p-2">
                <Button variant="ghost" size="sm" className="w-full" onClick={() => {
                  setFilterStatuses(new Set());
                  setFilterAssignees(new Set());
                  setFilterRooms(new Set());
                  setFilterCostCenters(new Set());
                }}>
                  {t('tasks.clearFilters')}
                </Button>
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );

  return (
    <div className="space-y-6">
      <ProjectLockBanner lockStatus={lockStatus} />

      {/* ===== TOP TOOLBAR (applies to all views: timeline, calendar, table, kanban) ===== */}
      <div className="flex items-center gap-2 flex-wrap">
        {filterPopover}
        <div className="flex-1" />
        {!loading && tasks.length > 0 && (
          <span className="hidden sm:inline font-mono text-[11px] text-muted-foreground tnum mr-2">
            {tasks.length} {t('tasks.tasks', 'arbeten')} · {tasks.filter(t => t.status === 'completed' || t.status === 'done').length} {t('statuses.completed', 'klara')}
            {tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completed' && t.status !== 'done').length > 0 && (
              <> · {tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completed' && t.status !== 'done').length} {t('tasks.overdue', 'försenade')}</>
            )}
          </span>
        )}
        {canEditTasks && (
          <Button size="sm" className="h-9" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">{t('tasks.addTask')}</span>
          </Button>
        )}
      </div>

      {/* ===== SCHEDULE SECTION (collapsible): Timeline | Calendar ===== */}
      <section className="mb-0">
        <div className="flex items-center gap-2 w-full text-left py-2 group">
          <button
            type="button"
            className="flex items-center gap-2 flex-1 text-left"
            onClick={() => { const next = !scheduleOpen; setScheduleOpen(next); localStorage.setItem(`tasks-schedule-open-${projectId}`, String(next)); }}
          >
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">
              {safeScheduleView === 'timeline' ? t('projectDetail.timeline', 'Tidslinje') : t('timeline.calendar', 'Kalender')}
            </span>
            {scheduleOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
          {/* Schedule sub-toggle */}
          <div className="flex rounded-md bg-muted/40 border border-border/60 p-0.5 ml-2">
            {(['timeline', 'calendar'] as const).map(v => (
              <button
                key={v}
                type="button"
                onClick={() => { setScheduleView(v); setScheduleOpen(true); }}
                className={cn(
                  "px-2.5 py-1 rounded text-xs transition-colors",
                  safeScheduleView === v
                    ? "bg-card shadow-sm font-medium text-foreground border border-border/60"
                    : "text-muted-foreground hover:text-foreground border border-transparent"
                )}
              >
                {v === 'timeline' ? t('projectDetail.timeline', 'Tidslinje') : t('timeline.calendar', 'Kalender')}
              </button>
            ))}
          </div>
        </div>
        {scheduleOpen && (
          <Card className="overflow-hidden">
            <CardContent className="p-0 overflow-hidden">
              {safeScheduleView === 'timeline' ? (
                <KonvaTimeline projectId={projectId} projectName={projectName} filteredTaskIds={filteredTasks.map(t => t.id)} selectedTaskIds={bulk.selectedIds} onNavigateToRoom={onNavigateToRoom} currency={currency} isDemo={projectId === PUBLIC_DEMO_PROJECT_ID} onTaskClick={(taskId, nativeEvent) => {
                    const task = tasks.find(t => t.id === taskId);
                    if (task) handleTaskClickWithModifier(task, nativeEvent);
                  }} />
              ) : (
                <TasksCalendarView tasks={tasks} milestones={calendarMilestones} selectedTaskIds={bulk.selectedIds} onTaskClick={(taskId, nativeEvent) => {
                  const task = tasks.find(t => t.id === taskId);
                  if (task) handleTaskClickWithModifier(task, nativeEvent);
                }} />
              )}
            </CardContent>
          </Card>
        )}
      </section>

      <div className="flex flex-col gap-4">
        {/* View tabs — controls for Table/Kanban below */}
        <div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* Detail view toggle: Table | Kanban */}
          <div className="flex rounded-md bg-muted/40 border border-border/60 p-0.5">
            {(['table', 'kanban'] as const).map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setDetailView(v)}
                className={cn(
                  "px-2.5 py-1 rounded text-xs transition-colors",
                  safeDetailView === v
                    ? "bg-card shadow-sm font-medium text-foreground border border-border/60"
                    : "text-muted-foreground hover:text-foreground border border-transparent"
                )}
              >
                {v === 'table' ? t('tasks.tableView', 'Tabell') : t('tasks.kanbanView', 'Kanban')}
              </button>
            ))}
          </div>

          {/* Kanban column visibility toggle */}
          {viewMode === 'kanban' && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9" title={t("tasks.kanbanColumns", "Kanban-kolumner")}>
                  <Columns3 className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-52 p-2" align="start">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 py-1 mb-1">
                  {t("tasks.visibleColumns", "Synliga kolumner")}
                </p>
                {statusOrder.map(status => {
                  const count = getStatusCount(status);
                  const label = statusLabels[status as keyof typeof statusLabels] || status;
                  return (
                    <label key={status} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                      <Checkbox
                        checked={kanbanVisibleStatuses.has(status)}
                        onCheckedChange={() => toggleKanbanStatus(status)}
                      />
                      <span className="flex-1">{label}</span>
                      <span className="text-xs text-muted-foreground">({count})</span>
                    </label>
                  );
                })}
              </PopoverContent>
            </Popover>
          )}

          {/* Table view toolbar items (inline) */}
          {viewMode === 'table' && (
            <>
              {/* Columns toggle */}
              <ColumnToggle
                columns={EXTRA_COLUMN_KEYS}
                labels={Object.fromEntries(tableViewState.ALL_COLUMNS.map(c => [c.key, c.label])) as Record<string, string>}
                visible={tableViewState.visibleExtras}
                onChange={(vis) => {
                  // Sync each column toggle
                  for (const key of EXTRA_COLUMN_KEYS) {
                    const isVisible = vis.has(key);
                    const wasVisible = tableViewState.visibleExtras.has(key);
                    if (isVisible !== wasVisible) tableViewState.toggleExtraColumn(key);
                  }
                }}
                align="start"
                trigger={
                  <Button variant="outline" size="icon" className="h-8 w-8" title={t("tasksTable.columns")}>
                    <Columns3 className="h-4 w-4" />
                  </Button>
                }
              />

            </>
          )}

          {/* Compact toggle — works for both kanban and table */}
          <Button
            variant={tableViewState.compactRows ? "secondary" : "outline"}
            size="icon"
            className="h-9 w-9"
            onClick={() => tableViewState.setCompactRows(!tableViewState.compactRows)}
            title={t("tasksTable.compactRows")}
          >
            <AlignJustify className="h-4 w-4" />
          </Button>

          {/* Group by — table/list views only */}
          {(viewMode === "table" || viewMode === "list") && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={tableViewState.groupBy !== "none" ? "default" : "outline"}
                  size="icon"
                  className="h-9 w-9"
                  title={t("budget.groupBy")}
                >
                  <Layers className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48" align="end">
                <div className="space-y-1">
                  <p className="text-sm font-medium mb-2">{t("budget.groupBy")}</p>
                  {(["none", "room", "costCenter", "status", "assignee"] as const).map((opt) => (
                    <label
                      key={opt}
                      className={`flex items-center gap-2 text-sm cursor-pointer rounded-md px-2 py-1.5 hover:bg-accent ${tableViewState.groupBy === opt ? "bg-accent font-medium" : ""}`}
                      onClick={() => tableViewState.handleGroupByChange(opt)}
                    >
                      {opt === "none" && t("budget.groupNone")}
                      {opt === "room" && t("budget.groupByRoom")}
                      {opt === "costCenter" && t("budget.groupByCostCenter")}
                      {opt === "status" && t("budget.groupByStatus")}
                      {opt === "assignee" && t("budget.groupByAssignee")}
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}

          {/* Add Task dialog (trigger lives in top toolbar) */}
          {canEditTasks && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle>{t('tasks.addNewTask')}</DialogTitle>
              <DialogDescription>
                {t('tasks.addNewTaskDescription')}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateTask} className="flex flex-col flex-1 overflow-hidden">
              <div className="space-y-4 overflow-y-auto flex-1 pr-2">
              <div className="space-y-2">
                <Label htmlFor="task-title">{t('tasks.taskTitle')}</Label>
                <Input
                  id="task-title"
                  placeholder={t('tasks.taskTitlePlaceholder')}
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-description">{t('tasks.descriptionOptional')}</Label>
                <Textarea
                  id="task-description"
                  placeholder={t('tasks.descriptionPlaceholder')}
                  value={newTaskDescription}
                  onChange={(e) => setNewTaskDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-priority">{t('tasks.priority')}</Label>
                <Select value={newTaskPriority} onValueChange={setNewTaskPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">{t('tasks.priorityLow')}</SelectItem>
                    <SelectItem value="medium">{t('tasks.priorityMedium')}</SelectItem>
                    <SelectItem value="high">{t('tasks.priorityHigh')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-assignee">{t('tasks.assignTo')}</Label>
                <Select value={newTaskAssignee} onValueChange={setNewTaskAssignee}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('common.unassigned')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">{t('common.unassigned')}</SelectItem>
                    {teamMembers.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name} {member.role ? `(${member.role})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="task-start-date">{t('tasks.startDateOptional')}</Label>
                  <DatePicker
                    date={newTaskStartDate ? parseLocalDate(newTaskStartDate) : undefined}
                    onDateChange={(date) => setNewTaskStartDate(date ? formatLocalDate(date) : '')}
                    placeholder="Välj startdatum"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="task-finish-date">{t('tasks.finishDateOptional')}</Label>
                  <DatePicker
                    date={newTaskFinishDate ? parseLocalDate(newTaskFinishDate) : undefined}
                    onDateChange={(date) => setNewTaskFinishDate(date ? formatLocalDate(date) : '')}
                    placeholder="Välj slutdatum"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-room">{t('tasks.roomOptional')}</Label>
                <Select value={newTaskRoomId} onValueChange={setNewTaskRoomId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('tasks.selectRoom')} />
                  </SelectTrigger>
                  <SelectContent>
                    {rooms.map((room) => (
                      <SelectItem key={room.id} value={room.id}>
                        {room.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-budget">{t('tasks.budgetOptional')}</Label>
                <Input
                  id="task-budget"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={newTaskBudget}
                  onChange={(e) => setNewTaskBudget(e.target.value)}
                />
              </div>
              {/* Budget post picker — only during active project */}
              {!isPlanning && (() => {
                const budgetPosts = tasks.filter(
                  (t) => !t.is_ata && (t.budget || 0) > 0 && !t.parent_task_id
                );
                // "standalone" = parentId null + not ÄTA, "ata" = parentId null + ÄTA
                const pickerValue = newTaskIsAta ? "ata" : (newTaskParentId ?? "standalone");
                return (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      <Link2 className="h-4 w-4" />
                      {t('tasks.linkToBudgetPost')}
                    </Label>
                    <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-1">
                      {budgetPosts.map((bp) => {
                        const spent = taskMaterialSpend.get(bp.id) || 0;
                        return (
                          <label
                            key={bp.id}
                            className={`flex items-center justify-between gap-2 p-2 rounded cursor-pointer hover:bg-accent/50 ${pickerValue === bp.id ? "bg-accent" : ""}`}
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="radio"
                                name="parentTask"
                                checked={pickerValue === bp.id}
                                onChange={() => {
                                  setNewTaskParentId(bp.id);
                                  setNewTaskIsAta(false);
                                }}
                                className="accent-primary"
                              />
                              <span className="text-sm font-medium truncate max-w-[200px]">{bp.title}</span>
                            </div>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {formatCurrency(spent)} / {formatCurrency(bp.budget || 0)}
                            </span>
                          </label>
                        );
                      })}
                      {budgetPosts.length > 0 && <Separator className="my-1" />}
                      <label
                        className={`flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-accent/50 ${pickerValue === "standalone" ? "bg-accent" : ""}`}
                      >
                        <input
                          type="radio"
                          name="parentTask"
                          checked={pickerValue === "standalone"}
                          onChange={() => { setNewTaskParentId(null); setNewTaskIsAta(false); }}
                          className="accent-primary"
                        />
                        <span className="text-sm">{t('tasks.standaloneTask')}</span>
                      </label>
                      <label
                        className={`flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-accent/50 ${pickerValue === "ata" ? "bg-accent" : ""}`}
                      >
                        <input
                          type="radio"
                          name="parentTask"
                          checked={pickerValue === "ata"}
                          onChange={() => { setNewTaskParentId(null); setNewTaskIsAta(true); }}
                          className="accent-primary"
                        />
                        <span className="text-sm">{t('tasks.isAta')}</span>
                      </label>
                    </div>
                  </div>
                );
              })()}
              <div className="space-y-2">
                <Label>{t('tasks.costCentersOptional')}</Label>
                <div className="border rounded-lg p-3 max-h-[60vh] overflow-y-auto space-y-2">
                  {DEFAULT_COST_CENTERS.map((cc) => {
                    const Icon = cc.icon;
                    const isSelected = newTaskCostCenters.includes(cc.id);
                    
                    return (
                      <div key={cc.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`new-cc-${cc.id}`}
                          checked={isSelected}
                          onCheckedChange={(checked) => {
                            const newCenters = checked
                              ? [...newTaskCostCenters, cc.id]
                              : newTaskCostCenters.filter(c => c !== cc.id);
                            setNewTaskCostCenters(newCenters);
                            setNewTaskCostCenter(newCenters[0] || "");
                          }}
                        />
                        <label
                          htmlFor={`new-cc-${cc.id}`}
                          className="flex items-center gap-2 text-sm font-medium leading-none cursor-pointer"
                        >
                          <Icon className="h-4 w-4" />
                          {t(cc.labelKey, cc.label)}
                        </label>
                      </div>
                    );
                  })}
                  {customCostCenters.map((cc) => {
                    const isSelected = newTaskCostCenters.includes(cc);
                    
                    return (
                      <div key={cc} className="flex items-center space-x-2">
                        <Checkbox
                          id={`new-cc-custom-${cc}`}
                          checked={isSelected}
                          onCheckedChange={(checked) => {
                            const newCenters = checked
                              ? [...newTaskCostCenters, cc]
                              : newTaskCostCenters.filter(c => c !== cc);
                            setNewTaskCostCenters(newCenters);
                            setNewTaskCostCenter(newCenters[0] || "");
                          }}
                        />
                        <label
                          htmlFor={`new-cc-custom-${cc}`}
                          className="flex items-center gap-2 text-sm font-medium leading-none cursor-pointer"
                        >
                          <Tag className="h-4 w-4" />
                          {cc}
                        </label>
                      </div>
                    );
                  })}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCustomCostCenter(true)}
                  className="w-full"
                >
                  <Plus className="h-3 w-3 mr-2" />
                  {t('tasks.addCustomCostCenter')}
                </Button>
                {showCustomCostCenter && (
                  <div className="flex gap-2 mt-2">
                    <Input
                      placeholder={t('tasks.enterCustomCostCenter')}
                      value={customCostCenterValue}
                      onChange={(e) => setCustomCostCenterValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (customCostCenterValue.trim()) {
                            const newCustomCenter = customCostCenterValue.trim();
                            setCustomCostCenters([...customCostCenters, newCustomCenter]);
                            setNewTaskCostCenters([...newTaskCostCenters, newCustomCenter]);
                            setNewTaskCostCenter(newCustomCenter);
                            setShowCustomCostCenter(false);
                            setCustomCostCenterValue("");
                          }
                        }
                      }}
                    />
                    <Button
                      type="button"
                      onClick={() => {
                        if (customCostCenterValue.trim()) {
                          const newCustomCenter = customCostCenterValue.trim();
                          setCustomCostCenters([...customCostCenters, newCustomCenter]);
                          setNewTaskCostCenters([...newTaskCostCenters, newCustomCenter]);
                          setNewTaskCostCenter(newCustomCenter);
                          setShowCustomCostCenter(false);
                          setCustomCostCenterValue("");
                        }
                      }}
                    >
                      {t('common.add')}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setShowCustomCostCenter(false);
                        setCustomCostCenterValue("");
                      }}
                    >
                      {t('common.cancel')}
                    </Button>
                  </div>
                )}
              </div>
              </div>

              {/* Fixed Save Button */}
              <div className="flex-shrink-0 pt-4 border-t mt-4 bg-background sticky bottom-0">
                <Button type="submit" className="w-full" disabled={creating}>
                  {creating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      {t('tasks.adding')}
                    </>
                  ) : (
                    t('tasks.addTask')
                  )}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        )}

        <TaskEditDialog
          taskId={editingTask?.id ?? null}
          projectId={projectId}
          open={editDialogOpen}
          onOpenChange={(open) => {
            setEditDialogOpen(open);
            if (!open) { setEditingTask(null); setEditVariant("dialog"); }
          }}
          onSaved={() => {
            fetchTasks();
            setEditDialogOpen(false);
            setEditingTask(null);
            setEditVariant("dialog");
          }}
          currency={currency}
          projectStatus={projectStatus}
          variant={editVariant}
        />
        {/* Legacy inline edit dialog removed — all task editing uses TaskEditDialog */}
      </div>
      </div>

      {/* Bulk action bar — shared across all views */}
      {bulk.showBulkBar && !lockStatus.isLocked && canEditTasks && (
        <BulkActionBar
          selectedCount={bulk.selectedCount}
          statusLabels={statusLabels}
          rooms={rooms}
          stakeholders={stakeholders}
          teamMembers={teamMembers}
          onBulkUpdate={bulk.bulkUpdateField}
          onBulkDelete={bulk.bulkDelete}
          onClearSelection={bulk.clearSelection}
          isLoading={bulk.isBulkLoading}
        />
      )}

      {/* ===== DETAIL SECTION: Table | Kanban ===== */}
      {loading ? (
        <TaskListSkeleton rows={5} />
      ) : tasks.length === 0 ? (
        <Card className="text-center py-12 border-dashed">
          <CardContent>
            <CheckCircle2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">{t('tasks.noTasks')}</h3>
            <p className="text-muted-foreground mb-4">
              {t('tasks.noTasksDescription')}
            </p>
            <Button onClick={() => setDialogOpen(true)} className="mb-4">
              <Plus className="h-4 w-4 mr-2" />
              {t('tasks.addFirstTask')}
            </Button>
            <p className="text-xs text-muted-foreground">
              {t('tasks.emptyStateTip', 'Tip: Link tasks to rooms for better organization')}
            </p>
          </CardContent>
        </Card>
      ) : filteredTasks.length === 0 ? (
        <Card className="text-center py-12 border-dashed">
          <CardContent>
            <XCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">{t('tasks.noTasksMatchFilters')}</h3>
            <p className="text-muted-foreground mb-4">
              {t('tasks.tryAdjustingFilters')}
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setFilterStatuses(new Set());
                setFilterAssignees(new Set());
                setFilterRooms(new Set());
                setFilterCostCenters(new Set());
              }}
            >
              {t('tasks.clearFilters')}
            </Button>
          </CardContent>
        </Card>
      ) : viewMode === 'kanban' ? (
        <div className="overflow-x-auto pb-4 snap-x snap-mandatory">
          <div className="grid gap-3.5 p-0.5" style={{ gridTemplateColumns: `repeat(${[...columnOrder, ...unknownStatuses].filter(status => kanbanVisibleStatuses.has(status) || unknownStatuses.includes(status) || (groupedTasks[status]?.length ?? 0) > 0).length}, minmax(200px, 1fr))`, minWidth: `${Math.max([...columnOrder, ...unknownStatuses].filter(status => kanbanVisibleStatuses.has(status) || unknownStatuses.includes(status) || (groupedTasks[status]?.length ?? 0) > 0).length * 260, 800)}px` }}>
            {[...columnOrder, ...unknownStatuses].filter(status =>
              kanbanVisibleStatuses.has(status) || unknownStatuses.includes(status) || (groupedTasks[status]?.length ?? 0) > 0
            ).map((status) => {
              const tasksForStatus = groupedTasks[status] || [];
              const defaultLabel = statusLabels[status as keyof typeof statusLabels] || status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
              const displayLabel = customColumnNames[status] || defaultLabel;

              return (
                <div
                  key={status}
                  draggable
                  onDragStart={() => handleColumnDragStart(status)}
                  onDragOver={handleColumnDragOver}
                  onDrop={(e) => {
                    e.stopPropagation();
                    handleColumnDrop(status);
                  }}
                  onDragEnd={() => setDraggedColumn(null)}
                  className={cn("flex flex-col snap-center transition-opacity", draggedColumn === status && "opacity-50")}
                >
                  {/* Column header */}
                  <div className="flex items-center gap-2 px-1 mb-2">
                    <div className={cn("w-[7px] h-[7px] rounded-full shrink-0", kanbanStatusDotColor(status))} />
                    {editingColumnName === status ? (
                      <Input
                        autoFocus
                        value={editingColumnValue}
                        onChange={(e) => setEditingColumnValue(e.target.value)}
                        onBlur={() => handleSaveColumnName(status)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveColumnName(status);
                          else if (e.key === 'Escape') handleCancelEditColumnName();
                        }}
                        className="h-6 text-[13px] font-medium px-1.5"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <h4
                        className="text-[13px] font-medium whitespace-nowrap cursor-text hover:text-primary transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartEditColumnName(status, displayLabel);
                        }}
                        title={t('tasks.clickToRename')}
                      >
                        {displayLabel}
                      </h4>
                    )}
                    <span className="font-mono text-[11px] text-muted-foreground tnum">
                      {tasksForStatus.length}
                    </span>
                  </div>
                  {/* Cards */}
                  <div
                    className={cn("flex-1 min-h-[80px]", tableViewState.compactRows ? "space-y-1" : "space-y-2")}
                    onDragOver={(e) => {
                      e.stopPropagation();
                      handleDragOver(e);
                    }}
                    onDrop={(e) => {
                      e.stopPropagation();
                      handleDrop(status);
                    }}
                  >
                    {tasksForStatus.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground/50 text-xs border border-dashed border-border rounded-xl">
                        {t('tasks.dropTasksHere')}
                      </div>
                    ) : (
                      tasksForStatus.map((task) => (
                        <TaskCard key={task.id} task={task} />
                      ))
                    )}
                  </div>
                  {/* Add task button at bottom */}
                  {canEditTasks && (
                    <button
                      type="button"
                      className="mt-2 flex items-center justify-center gap-1.5 w-full py-2 px-2.5 border border-dashed border-border rounded-xl text-[12px] text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
                      onClick={() => setDialogOpen(true)}
                    >
                      <Plus className="h-3 w-3" />
                      {t('tasks.addTask')}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Table View */
        <TasksTableView
          tasks={filteredTasks}
          projectId={projectId}
          rooms={rooms}
          stakeholders={stakeholders}
          teamMembers={teamMembers}
          currency={currency}
          isReadOnly={lockStatus.isLocked || !canEditTasks}
          onTaskClick={(task) => { setEditingTask(task); setEditDialogOpen(true); }}
          onTaskUpdated={fetchTasks}
          statusLabels={statusLabels}
          getStatusIcon={getStatusIcon}
          getPriorityColor={getPriorityColor}
          getAssignedMemberName={getAssignedMemberName}
          tableViewState={tableViewState}
          bulk={bulk}
          hideToolbar
        />
      )}
      </div>
      {/* Create Purchase Order Dialog */}
      <Dialog open={poDialogOpen} onOpenChange={setPoDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('taskPanel.createPOForTask')}</DialogTitle>
            <DialogDescription>
              {editingTask && t('taskPanel.poLinkedTo', { title: editingTask.title })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="tt-po-name">{t('purchases.materialName')} *</Label>
              <Input
                id="tt-po-name"
                value={poName}
                onChange={(e) => setPoName(e.target.value)}
                placeholder="e.g. Floor tiles"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="tt-po-quantity">{t('common.quantity')}</Label>
                <Input
                  id="tt-po-quantity"
                  type="number"
                  value={poQuantity}
                  onChange={(e) => setPoQuantity(e.target.value)}
                  min="0"
                  step="0.01"
                />
              </div>
              <div>
                <Label htmlFor="tt-po-unit">{t('common.unit')}</Label>
                <Select value={poUnit} onValueChange={setPoUnit}>
                  <SelectTrigger id="tt-po-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pcs">{t('taskPanel.pieces')}</SelectItem>
                    <SelectItem value="sqm">{t('taskPanel.squareMeters')}</SelectItem>
                    <SelectItem value="m">{t('taskPanel.meters')}</SelectItem>
                    <SelectItem value="kg">{t('taskPanel.kilograms')}</SelectItem>
                    <SelectItem value="liters">{t('taskPanel.liters')}</SelectItem>
                    <SelectItem value="hours">{t('taskPanel.hours')}</SelectItem>
                    <SelectItem value="days">{t('taskPanel.days')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="tt-po-price-per-unit">{t('purchases.pricePerUnit')} ({t('common.optional')})</Label>
              <Input
                id="tt-po-price-per-unit"
                type="number"
                value={poPricePerUnit}
                onChange={(e) => setPoPricePerUnit(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
              />
              {poQuantity && poPricePerUnit && (
                <p className="text-xs text-muted-foreground mt-1">
                  {t('purchases.priceTotal')}: {(parseFloat(poQuantity) * parseFloat(poPricePerUnit)).toFixed(2)}
                </p>
              )}
            </div>
            <div className="flex gap-3 pt-4">
              <Button
                onClick={handleCreatePurchaseOrder}
                disabled={creatingPO || !poName.trim()}
                className="flex-1"
              >
                {creatingPO ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('purchases.creating')}
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    {t('purchases.createOrder')}
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => setPoDialogOpen(false)}
                disabled={creatingPO}
              >
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TasksTab;
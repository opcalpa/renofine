import React, { useEffect, useState, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Calendar, Loader2, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, ZoomIn, ZoomOut, RotateCcw, Layers, SlidersHorizontal, X, GripVertical } from "lucide-react";
import { useTimelineGestures } from "@/hooks/useTimelineGestures";
import { Slider } from "@/components/ui/slider";
import { format, differenceInDays, parseISO, addDays, getISOWeek } from "date-fns";
import { sv } from "date-fns/locale";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TaskEditDialog } from "./TaskEditDialog";
import { ClientTaskSheet } from "./ClientTaskSheet";
import { parseLocalDate, formatLocalDate } from "@/lib/dateUtils";
import { getStatusSolidColor } from "@/lib/statusColors";
interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  start_date: string | null;
  finish_date: string | null;
  progress: number;
  assigned_to_stakeholder_id: string | null;
  room_id: string | null;
  budget: number | null;
  cost_center: string | null;
  cost_centers?: string[] | null;
}
interface TaskDependency {
  id: string;
  task_id: string;
  depends_on_task_id: string;
}
interface TeamMember {
  id: string;
  name: string;
}
interface Room {
  id: string;
  name: string;
}
type GroupByOption = 'none' | 'status' | 'room' | 'assignee' | 'priority';

interface TaskGroup {
  id: string;
  label: string;
  color?: string;
  tasks: Task[];
  isCollapsed: boolean;
}
function getDownstreamTasks(
  taskId: string,
  dependencies: TaskDependency[],
  visited = new Set<string>()
): string[] {
  if (visited.has(taskId)) return [];
  visited.add(taskId);
  const directDependents = dependencies
    .filter(d => d.depends_on_task_id === taskId)
    .map(d => d.task_id);
  const all = [...directDependents];
  for (const depId of directDependents) {
    all.push(...getDownstreamTasks(depId, dependencies, visited));
  }
  return all;
}

interface ProjectTimelineProps {
  projectId: string;
  projectName?: string;
  projectStartDate?: string | null;
  projectFinishDate?: string | null;
  onTaskClick?: (taskId: string) => void;
  onNavigateToRoom?: (roomId: string) => void;
  currency?: string | null;
  isDemo?: boolean;
  userType?: string | null;
}
const ProjectTimeline = ({
  projectId,
  projectName,
  projectStartDate,
  projectFinishDate,
  onTaskClick,
  onNavigateToRoom,
  currency,
  isDemo = false,
  userType,
}: ProjectTimelineProps) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [unscheduledTasks, setUnscheduledTasks] = useState<{ id: string; title: string }[]>([]);
  const [dependencies, setDependencies] = useState<TaskDependency[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedAssignee, setSelectedAssignee] = useState<string>("all");
  const [groupBy, setGroupBy] = useState<GroupByOption>('none');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Project dates (fetched if not passed as props)
  const [fetchedStartDate, setFetchedStartDate] = useState<string | null>(null);
  const [fetchedFinishDate, setFetchedFinishDate] = useState<string | null>(null);
  const effectiveStartDate = projectStartDate ?? fetchedStartDate;
  const effectiveFinishDate = projectFinishDate ?? fetchedFinishDate;
  const [savingProjectDate, setSavingProjectDate] = useState(false);
  const [dragInteraction, setDragInteraction] = useState<{
    mode: 'moving' | 'resize-left' | 'resize-right';
    taskId: string;
    startX: number;
    origStart: string;
    origFinish: string;
    previewStart: string;
    previewFinish: string;
  } | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();

  // Touch gestures for pan and zoom - controls visible time range
  const {
    containerRef: gestureContainerRef,
    daysVisible,
    centerDate,
    startDate: gestureStartDate,
    endDate: gestureEndDate,
    setDaysVisible,
    setCenterDate,
    zoomIn,
    zoomOut,
    panByDays,
    minDays,
    maxDays,
    isDragging,
  } = useTimelineGestures({
    minDays: 7,
    maxDays: 365,
    initialDays: 7,
    initialCenterDate: addDays(new Date(), 3),
  });
  useEffect(() => {
    fetchTasks();
    fetchDependencies();
    fetchTeamMembers();
    fetchRooms();
    fetchProjectDates();
  }, [projectId]);

  const fetchProjectDates = async () => {
    const { data } = await supabase
      .from("projects")
      .select("start_date, finish_goal_date")
      .eq("id", projectId)
      .single();
    if (data) {
      setFetchedStartDate(data.start_date);
      setFetchedFinishDate(data.finish_goal_date);
    }
  };

  const zoomToProjectSpan = () => {
    if (!effectiveStartDate || !effectiveFinishDate) return;
    const start = parseISO(effectiveStartDate);
    const finish = parseISO(effectiveFinishDate);
    const span = differenceInDays(finish, start) + 2; // 1 day padding each side
    const clampedSpan = Math.max(minDays, Math.min(span, maxDays));
    setDaysVisible(clampedSpan);
    setCenterDate(addDays(start, Math.floor(differenceInDays(finish, start) / 2)));
  };

  const saveProjectDate = async (field: "start_date" | "finish_goal_date", value: string) => {
    setSavingProjectDate(true);
    const { error } = await supabase
      .from("projects")
      .update({ [field]: value })
      .eq("id", projectId);
    setSavingProjectDate(false);
    if (error) {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
      return;
    }
    if (field === "start_date") setFetchedStartDate(value);
    else setFetchedFinishDate(value);
    toast({ title: t("common.saved") });
  };

  // Auto-zoom to task span (or project dates as fallback) on first load
  const hasAutoZoomed = useRef(false);
  useEffect(() => {
    if (hasAutoZoomed.current || loading) return;

    // Prefer actual task dates over project dates (tasks may be shifted, e.g. demo projects)
    const dates: Date[] = [];
    tasks.forEach(task => {
      if (task.start_date) dates.push(parseISO(task.start_date));
      if (task.finish_date) dates.push(parseISO(task.finish_date));
    });
    // Fallback to project dates if no tasks
    if (dates.length === 0) {
      if (effectiveStartDate) dates.push(parseISO(effectiveStartDate));
      if (effectiveFinishDate) dates.push(parseISO(effectiveFinishDate));
    }
    if (dates.length < 2) return;

    const minD = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxD = new Date(Math.max(...dates.map(d => d.getTime())));
    const span = differenceInDays(maxD, minD) + 14;
    const clampedSpan = Math.max(7, Math.min(span, maxDays));
    setDaysVisible(clampedSpan);
    setCenterDate(addDays(minD, Math.floor(span / 2)));
    hasAutoZoomed.current = true;
  }, [loading, tasks, effectiveStartDate, effectiveFinishDate, maxDays, setDaysVisible, setCenterDate]);

  const fetchTasks = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from("tasks").select("id, title, description, status, priority, start_date, finish_date, progress, assigned_to_stakeholder_id, room_id, budget, cost_center, cost_centers").eq("project_id", projectId).not("start_date", "is", null).not("finish_date", "is", null).order("start_date", {
        ascending: true
      });
      if (error) throw error;
      setTasks(data || []);

      // Fetch unscheduled tasks (title for hover list)
      const { data: unschedData, error: unschedError } = await supabase
        .from("tasks")
        .select("id, title")
        .eq("project_id", projectId)
        .or("start_date.is.null,finish_date.is.null")
        .order("created_at", { ascending: true });
      if (!unschedError) {
        setUnscheduledTasks(unschedData || []);
      }
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  const fetchDependencies = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from("task_dependencies").select("*");
      if (error) throw error;
      setDependencies(data || []);
    } catch (error: unknown) {
      console.error("Error fetching dependencies:", error);
    }
  };
  const fetchTeamMembers = async () => {
    try {
      // Fetch project owner
      const { data: projectData } = await supabase
        .from("projects")
        .select("owner_id, profiles!projects_owner_id_fkey(id, name)")
        .eq("id", projectId)
        .single();

      const members: TeamMember[] = [];
      if (projectData?.profiles) {
        members.push({ id: (projectData.profiles as any).id, name: (projectData.profiles as any).name });
      }

      // Fetch accepted shares
      const { data: shares } = await supabase
        .from("project_shares")
        .select("shared_with_user_id, profiles!project_shares_shared_with_user_id_fkey(id, name)")
        .eq("project_id", projectId);

      if (shares) {
        const existingIds = new Set(members.map(m => m.id));
        shares.forEach((share: any) => {
          if (share.profiles && !existingIds.has(share.profiles.id)) {
            existingIds.add(share.profiles.id);
            members.push({ id: share.profiles.id, name: share.profiles.name });
          }
        });
      }

      setTeamMembers(members);
    } catch (error: unknown) {
      console.error("Error fetching team members:", error);
    }
  };
  const fetchRooms = async () => {
    try {
      const { data, error } = await supabase
        .from("rooms")
        .select("id, name")
        .eq("project_id", projectId)
        .order("name");
      if (error) throw error;
      setRooms(data || []);
    } catch (error: unknown) {
      console.error("Error fetching rooms:", error);
    }
  };

  // Toggle group collapsed state
  const toggleGroupCollapse = (groupId: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  // Navigation functions using gesture hook
  const handlePrevious = () => {
    panByDays(-Math.ceil(daysVisible / 2));
  };

  const handleNext = () => {
    panByDays(Math.ceil(daysVisible / 2));
  };

  const handleToday = () => {
    setCenterDate(addDays(new Date(), Math.floor(daysVisible / 2)));
  };

  // View mode presets - set specific day ranges
  const setViewPreset = (preset: 'week' | 'month' | '3months' | 'full') => {
    switch (preset) {
      case 'week':
        setDaysVisible(7);
        setCenterDate(addDays(new Date(), 3));
        break;
      case 'month':
        setDaysVisible(30);
        setCenterDate(addDays(new Date(), 15));
        break;
      case '3months':
        setDaysVisible(90);
        setCenterDate(addDays(new Date(), 45));
        break;
      case 'full': {
        // Calculate span from actual task dates (not project dates which may be stale)
        const dates: Date[] = [];
        tasks.forEach(task => {
          if (task.start_date) dates.push(parseISO(task.start_date));
          if (task.finish_date) dates.push(parseISO(task.finish_date));
        });
        // Fallback to project dates only if no tasks have dates
        if (dates.length === 0) {
          if (projectStartDate) dates.push(parseISO(projectStartDate));
          if (projectFinishDate) dates.push(parseISO(projectFinishDate));
        }
        if (dates.length >= 2) {
          const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
          const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
          const span = differenceInDays(maxDate, minDate) + 14; // Add padding
          setDaysVisible(Math.min(span, maxDays));
          setCenterDate(addDays(minDate, Math.floor(span / 2)));
        }
        break;
      }
    }
  };

  // Use gesture-controlled dates for timeline bounds
  const minDate = gestureStartDate;
  const maxDate = gestureEndDate;
  const totalDays = differenceInDays(maxDate, minDate) + 1;

  // Generate date markers for the timeline based on visible days
  // Must be called before any early returns (React hooks rule)
  // Filter tasks that overlap with current view and match assignee filter
  // Must be called before any early returns (React hooks rule)
  const visibleTasks = useMemo(() => {
    return tasks.filter(task => {
      if (!task.start_date || !task.finish_date) return false;
      const taskStart = parseISO(task.start_date);
      const taskEnd = parseISO(task.finish_date);
      const inTimeRange = taskStart <= maxDate && taskEnd >= minDate;
      const matchesAssignee = selectedAssignee === "all" ||
        (selectedAssignee === "unassigned" && !task.assigned_to_stakeholder_id) ||
        task.assigned_to_stakeholder_id === selectedAssignee;
      return inTimeRange && matchesAssignee;
    });
  }, [tasks, minDate, maxDate, selectedAssignee]);

  const getStatusColor = (status: string) => getStatusSolidColor(status);

  const getStatusLabel = (status: string) => {
    const statusKey = status.replace(/_/g, '');
    const keyMap: Record<string, string> = {
      'todo': 'toDo',
      'inprogress': 'inProgress',
      'onhold': 'onHold',
    };
    const key = keyMap[statusKey] || status;
    return t(`statuses.${key}`, status);
  };

  // Group tasks based on selected grouping option
  const groupedTasks = useMemo((): TaskGroup[] => {
    if (groupBy === 'none') {
      return [{
        id: 'all',
        label: '',
        tasks: visibleTasks,
        isCollapsed: false,
      }];
    }

    const groupMap = new Map<string, Task[]>();
    const groupOrder: string[] = [];

    // Define group order and colors based on groupBy type
    const statusOrder = ['in_progress', 'to_do', 'waiting', 'on_hold', 'blocked', 'awaiting_review', 'completed', 'cancelled'];
    const priorityOrder = ['high', 'medium', 'low'];

    visibleTasks.forEach(task => {
      let groupKey: string;

      switch (groupBy) {
        case 'status':
          groupKey = task.status || 'to_do';
          break;
        case 'room':
          groupKey = task.room_id || 'unassigned';
          break;
        case 'assignee':
          groupKey = task.assigned_to_stakeholder_id || 'unassigned';
          break;
        case 'priority':
          groupKey = task.priority || 'medium';
          break;
        default:
          groupKey = 'all';
      }

      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, []);
        groupOrder.push(groupKey);
      }
      groupMap.get(groupKey)!.push(task);
    });

    // Sort groups based on type
    let sortedKeys: string[];
    if (groupBy === 'status') {
      sortedKeys = groupOrder.sort((a, b) => {
        const aIndex = statusOrder.indexOf(a);
        const bIndex = statusOrder.indexOf(b);
        return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
      });
    } else if (groupBy === 'priority') {
      sortedKeys = groupOrder.sort((a, b) => {
        const aIndex = priorityOrder.indexOf(a);
        const bIndex = priorityOrder.indexOf(b);
        return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
      });
    } else {
      sortedKeys = groupOrder.sort((a, b) => {
        if (a === 'unassigned') return 1;
        if (b === 'unassigned') return -1;
        return a.localeCompare(b);
      });
    }

    // Build group objects with labels and colors
    return sortedKeys.map(key => {
      let label: string;
      let color: string | undefined;

      switch (groupBy) {
        case 'status':
          label = getStatusLabel(key);
          color = getStatusColor(key);
          break;
        case 'room':
          if (key === 'unassigned') {
            label = t('common.noRoom', 'No Room');
          } else {
            const room = rooms.find(r => r.id === key);
            label = room?.name || t('common.unknownRoom', 'Unknown Room');
          }
          break;
        case 'assignee':
          if (key === 'unassigned') {
            label = t('common.unassigned', 'Unassigned');
          } else {
            const member = teamMembers.find(m => m.id === key);
            label = member?.name || t('common.unknownUser', 'Unknown');
          }
          break;
        case 'priority':
          label = t(`tasks.priority${key.charAt(0).toUpperCase() + key.slice(1)}`, key);
          color = key === 'high' ? 'bg-red-500' : key === 'medium' ? 'bg-amber-500' : 'bg-slate-400';
          break;
        default:
          label = key;
      }

      return {
        id: key,
        label,
        color,
        tasks: groupMap.get(key) || [],
        isCollapsed: collapsedGroups.has(key),
      };
    });
  }, [visibleTasks, groupBy, rooms, teamMembers, collapsedGroups, t]);

  // Calculate total visible rows (accounting for collapsed groups)
  const totalVisibleRows = useMemo(() => {
    if (groupBy === 'none') return visibleTasks.length;
    return groupedTasks.reduce((sum, group) => {
      return sum + 1 + (group.isCollapsed ? 0 : group.tasks.length); // 1 for header
    }, 0);
  }, [groupedTasks, groupBy, visibleTasks.length]);

  // Container width tracking for SVG dependency arrows
  const timelineContentRef = useRef<HTMLDivElement>(null);
  const [timelineWidth, setTimelineWidth] = useState(0);

  useEffect(() => {
    const el = timelineContentRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setTimelineWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Build task-row index map for dependency arrow positioning
  const taskRowMap = useMemo(() => {
    const map = new Map<string, number>();
    let rowIndex = 0;
    for (const group of groupedTasks) {
      if (groupBy !== 'none') rowIndex++; // group header row
      if (!group.isCollapsed) {
        for (const task of group.tasks) {
          map.set(task.id, rowIndex);
          rowIndex++;
        }
      }
    }
    return map;
  }, [groupedTasks, groupBy]);

  // Pixel width of one day column (for pointer drag)
  const dayWidthPx = timelineWidth > 0 ? timelineWidth / totalDays : 0;

  // Cleanup drag listeners on unmount
  useEffect(() => {
    return () => { dragCleanupRef.current?.(); };
  }, []);

  // Stable today string to avoid repeated format() calls
  const todayStr = format(new Date(), "yyyy-MM-dd");

  const getTaskPosition = (task: Task, minDate: Date, totalDays: number) => {
    if (!task.start_date || !task.finish_date) return {
      left: 0,
      width: 0
    };
    const startDate = parseISO(task.start_date);
    const finishDate = parseISO(task.finish_date);
    const daysFromStart = differenceInDays(startDate, minDate);
    const taskDuration = differenceInDays(finishDate, startDate) + 1;
    const left = daysFromStart / totalDays * 100;
    const width = taskDuration / totalDays * 100;
    return {
      left,
      width
    };
  };

  // Status badge colors for hover card and other UI elements
  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "completed":
      case "done":
        return "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800";
      case "in_progress":
      case "doing":
        return "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800";
      case "waiting":
      case "on_hold":
        return "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800";
      case "awaiting_review":
        return "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-400 dark:border-violet-800";
      case "blocked":
        return "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800";
      case "cancelled":
      case "scrapped":
        return "bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800";
      case "planned":
      case "discovery":
        return "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800";
      case "ideas":
        return "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
    }
  };

  const getPriorityBorderColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "border-destructive";
      case "low":
        return "border-secondary";
      default:
        return "border-border";
    }
  };
  // Commit drag result to Supabase (with cascade for moves)
  const commitTaskDates = async (
    interaction: NonNullable<typeof dragInteraction>,
    task: Task
  ) => {
    try {
      const { error } = await supabase.from("tasks").update({
        start_date: interaction.previewStart,
        finish_date: interaction.previewFinish,
      }).eq("id", interaction.taskId);
      if (error) throw error;

      if (interaction.mode === 'moving') {
        const delta = differenceInDays(
          parseISO(interaction.previewStart),
          parseISO(interaction.origStart)
        );
        let cascadedCount = 0;
        if (delta > 0) {
          // Only cascade forward — moving backward should not pull dependents
          const newFinish = parseISO(interaction.previewFinish);
          const downstreamIds = getDownstreamTasks(interaction.taskId, dependencies);
          for (const dt of tasks.filter(tt => downstreamIds.includes(tt.id))) {
            if (dt.start_date && dt.finish_date) {
              const depStart = parseISO(dt.start_date);
              if (depStart <= newFinish) {
                const pushDays = differenceInDays(newFinish, depStart) + 1;
                const { error: ce } = await supabase.from("tasks").update({
                  start_date: format(addDays(depStart, pushDays), "yyyy-MM-dd"),
                  finish_date: format(addDays(parseISO(dt.finish_date), pushDays), "yyyy-MM-dd"),
                }).eq("id", dt.id);
                if (!ce) cascadedCount++;
              }
            }
          }
        }
        toast({
          title: t('timeline.taskRescheduled', 'Task rescheduled'),
          description: cascadedCount > 0
            ? `${task.title} → ${format(parseISO(interaction.previewStart), "MMM d")}. ${t('timeline.dependenciesCascaded', 'Also moved {{count}} dependent task(s)', { count: cascadedCount })}`
            : `${task.title} → ${format(parseISO(interaction.previewStart), "MMM d, yyyy")}`
        });
      } else {
        const dateStr = interaction.mode === 'resize-left'
          ? interaction.previewStart : interaction.previewFinish;
        toast({
          title: t('timeline.taskDurationUpdated', 'Task duration updated'),
          description: `${task.title} ${interaction.mode === 'resize-left' ? 'start' : 'end'} → ${format(parseISO(dateStr), "MMM d")}`
        });
      }
      fetchTasks();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  // Pointer-based drag: smooth real-time move/resize with day-snapping
  const handleBarPointerDown = (
    e: React.PointerEvent,
    task: Task,
    mode: 'moving' | 'resize-left' | 'resize-right'
  ) => {
    e.preventDefault();
    e.stopPropagation();
    // Capture pointer on the currentTarget (the div with the handler), not e.target (could be a child span)
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    let current = {
      mode,
      taskId: task.id,
      startX: e.clientX,
      origStart: task.start_date!,
      origFinish: task.finish_date!,
      previewStart: task.start_date!,
      previewFinish: task.finish_date!,
    };
    setDragInteraction(current);

    const onMove = (ev: PointerEvent) => {
      if (dayWidthPx === 0) return;
      const deltaDays = Math.round((ev.clientX - current.startX) / dayWidthPx);
      let ps = current.origStart;
      let pf = current.origFinish;

      if (current.mode === 'moving') {
        ps = format(addDays(parseISO(current.origStart), deltaDays), 'yyyy-MM-dd');
        pf = format(addDays(parseISO(current.origFinish), deltaDays), 'yyyy-MM-dd');
      } else if (current.mode === 'resize-left') {
        const ns = addDays(parseISO(current.origStart), deltaDays);
        if (ns < parseISO(current.origFinish)) ps = format(ns, 'yyyy-MM-dd');
      } else {
        const nf = addDays(parseISO(current.origFinish), deltaDays);
        if (nf > parseISO(current.origStart)) pf = format(nf, 'yyyy-MM-dd');
      }

      if (ps !== current.previewStart || pf !== current.previewFinish) {
        current = { ...current, previewStart: ps, previewFinish: pf };
        setDragInteraction({ ...current });
      }
    };

    const onUp = async () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      dragCleanupRef.current = null;

      const final = current;
      setDragInteraction(null);

      const noChange = final.previewStart === final.origStart
        && final.previewFinish === final.origFinish;
      if (noChange) {
        if (final.mode === 'moving') handleTaskClick(task);
        return;
      }
      await commitTaskDates(final, task);
    };

    dragCleanupRef.current = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
  const handleTaskClick = (task: Task) => {
    setSelectedTaskId(task.id);
    setSidePanelOpen(true);
    onTaskClick?.(task.id);
  };

  const handleEditTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask) return;

    try {
      const { error } = await supabase
        .from("tasks")
        .update({
          title: editingTask.title,
          description: editingTask.description,
          priority: editingTask.priority,
          start_date: editingTask.start_date,
          finish_date: editingTask.finish_date,
          progress: editingTask.progress,
          assigned_to_stakeholder_id: editingTask.assigned_to_stakeholder_id,
          room_id: editingTask.room_id,
          budget: editingTask.budget,
          cost_center: editingTask.cost_center,
        })
        .eq("id", editingTask.id);

      if (error) throw error;

      toast({
        title: t('timeline.taskUpdated', 'Task updated'),
        description: t('timeline.taskUpdatedDescription', 'Task has been updated successfully'),
      });

      setEditDialogOpen(false);
      setEditingTask(null);
      fetchTasks();
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };
  const cardRef = useRef<HTMLDivElement>(null);

  // Keep gesture container scrollLeft at 1px (center of 2px overflow).
  // This ensures Chrome macOS sees scrollable content in BOTH directions
  // and doesn't intercept swipe gestures for browser navigation.
  useEffect(() => {
    const container = gestureContainerRef.current;
    if (!container) return;
    container.scrollLeft = 1;
    const resetScroll = () => { container.scrollLeft = 1; };
    container.addEventListener("scroll", resetScroll);
    return () => container.removeEventListener("scroll", resetScroll);
  });

  if (loading) {
    return <Card>
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>;
  }

  if (tasks.length === 0) {
    return <Card className="border-dashed">
        <CardContent className="py-12 text-center">
          <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">{t('projectDetail.noScheduledTasks')}</h3>
          <p className="text-muted-foreground">
            {t('projectDetail.noScheduledTasksDescription')}
          </p>
        </CardContent>
      </Card>;
  }

  return <Card>
      <CardHeader className="pb-3">
        {/* === MOBILE HEADER (compact) === */}
        <div className="md:hidden space-y-3">
          {/* Row 1: Title + Filter button */}
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <span className="kicker">{t('overview.timeline', 'Tidslinje')}</span>
              <CardTitle className="text-base font-display font-normal tracking-tight truncate mt-0.5">
                {format(minDate, "d MMM")} — {format(maxDate, "d MMM")}
              </CardTitle>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant={mobileFiltersOpen ? "secondary" : "outline"}
                size="icon"
                className="h-8 w-8"
                onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
              >
                <SlidersHorizontal className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Row 2: Zoom + navigation */}
          <div className="flex items-center justify-between gap-2">
            {/* Zoom controls */}
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" onClick={zoomOut} disabled={daysVisible >= maxDays} className="h-7 w-7">
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="icon" onClick={zoomIn} disabled={daysVisible <= minDays} className="h-7 w-7">
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => setViewPreset('month')} className="h-7 w-7">
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </div>
            {/* Navigation + Calendar */}
            <div className="flex items-center gap-1">
              {(() => {
                const missingStart = !effectiveStartDate;
                const missingFinish = !effectiveFinishDate;
                const warningCount = unscheduledTasks.length + (missingStart ? 1 : 0) + (missingFinish ? 1 : 0);
                return (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="icon" className="h-7 w-7 relative">
                        <Calendar className="h-3.5 w-3.5" />
                        {warningCount > 0 && (
                          <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-0.5 rounded-full bg-orange-500 text-white text-[10px] font-medium flex items-center justify-center">
                            {warningCount}
                          </span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-0" align="end">
                      <div className="p-3 space-y-2 border-b">
                        <p className="text-xs font-medium text-muted-foreground">
                          {t('timeline.projectDatesTitle', 'Project dates')}
                        </p>
                        <div className="space-y-1">
                          <Label className="text-xs">{t('common.startDate')}</Label>
                          <Input
                            type="date"
                            className={`h-8 text-sm ${!effectiveStartDate ? "border-amber-300 bg-amber-50/50" : ""}`}
                            value={effectiveStartDate || ""}
                            disabled={savingProjectDate}
                            onChange={(e) => {
                              if (e.target.value) saveProjectDate("start_date", e.target.value);
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t('timeline.goalDate', 'Goal date')}</Label>
                          <Input
                            type="date"
                            className={`h-8 text-sm ${!effectiveFinishDate ? "border-amber-300 bg-amber-50/50" : ""}`}
                            value={effectiveFinishDate || ""}
                            disabled={savingProjectDate}
                            onChange={(e) => {
                              if (e.target.value) saveProjectDate("finish_goal_date", e.target.value);
                            }}
                          />
                        </div>
                        {effectiveStartDate && effectiveFinishDate && (
                          <button
                            type="button"
                            className="w-full text-left text-xs text-primary hover:underline pt-1"
                            onClick={zoomToProjectSpan}
                          >
                            {t('timeline.showFullProject', 'Show full project period')}
                          </button>
                        )}
                      </div>
                      {unscheduledTasks.length > 0 && (
                        <div className="p-3">
                          <p className="text-xs font-medium text-muted-foreground mb-2">
                            {t('timeline.unscheduledTasksTitle', 'Unscheduled tasks')}
                          </p>
                          <ul className="space-y-1">
                            {unscheduledTasks.map((ut) => (
                              <li
                                key={ut.id}
                                className="text-sm truncate text-primary hover:underline cursor-pointer"
                                onClick={() => onTaskClick?.(ut.id)}
                              >
                                {ut.title}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                );
              })()}
              <Button variant="outline" size="sm" onClick={handleToday} className="h-7 px-2 text-xs">
                {t('timeline.today', 'Idag')}
              </Button>
              <Button variant="outline" size="icon" onClick={handlePrevious} className="h-7 w-7">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={handleNext} className="h-7 w-7">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Expandable filters panel */}
          {mobileFiltersOpen && (
            <div className="bg-muted/50 rounded-lg p-3 space-y-3 border">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t('timeline.filters', 'Filter')}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setMobileFiltersOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Select value={groupBy} onValueChange={(value) => setGroupBy(value as GroupByOption)}>
                  <SelectTrigger className="h-9">
                    <Layers className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                    <SelectValue placeholder={t('timeline.groupBy', 'Gruppering')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('timeline.noGrouping', 'Ingen')}</SelectItem>
                    <SelectItem value="status">{t('timeline.groupByStatus', 'Status')}</SelectItem>
                    <SelectItem value="room">{t('timeline.groupByRoom', 'Rum')}</SelectItem>
                    <SelectItem value="assignee">{t('timeline.groupByAssignee', 'Person')}</SelectItem>
                    <SelectItem value="priority">{t('timeline.groupByPriority', 'Prioritet')}</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={selectedAssignee} onValueChange={setSelectedAssignee}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder={t('budget.allAssignees')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('budget.allAssignees')}</SelectItem>
                    <SelectItem value="unassigned">{t('common.unassigned')}</SelectItem>
                    {teamMembers.map(member => (
                      <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

        </div>

        {/* === DESKTOP HEADER (full controls) === */}
        <div className="hidden md:block">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="kicker">{t('overview.timeline', 'Tidslinje')}</span>
              <CardTitle className="font-display font-normal tracking-tight mt-0.5">
                {format(minDate, "MMMM", { locale: sv })} — {format(maxDate, "MMMM yyyy", { locale: sv })}
              </CardTitle>
            </div>
            <div className="flex items-center gap-2">
              {/* Timeline info popover (desktop) */}
              {(() => {
                const missingStart = !effectiveStartDate;
                const missingFinish = !effectiveFinishDate;
                const warningCount = unscheduledTasks.length + (missingStart ? 1 : 0) + (missingFinish ? 1 : 0);
                return (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="icon" className="h-8 w-8 relative">
                        <Calendar className="h-4 w-4" />
                        {warningCount > 0 && (
                          <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-0.5 rounded-full bg-orange-500 text-white text-[10px] font-medium flex items-center justify-center">
                            {warningCount}
                          </span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-0" align="end">
                      {/* Project dates — always visible */}
                      <div className="p-3 space-y-2 border-b">
                        <p className="text-xs font-medium text-muted-foreground">
                          {t('timeline.projectDatesTitle', 'Project dates')}
                        </p>
                        {/* Start date */}
                        <div className="space-y-1">
                          <Label className="text-xs">{t('common.startDate')}</Label>
                          {effectiveStartDate ? (
                            <Input
                              type="date"
                              className="h-8 text-sm"
                              value={effectiveStartDate}
                              disabled={savingProjectDate}
                              onChange={(e) => {
                                if (e.target.value) saveProjectDate("start_date", e.target.value);
                              }}
                            />
                          ) : (
                            <Input
                              type="date"
                              className="h-8 text-sm border-amber-300 bg-amber-50/50"
                              placeholder={t('timeline.setDate', 'Set date')}
                              disabled={savingProjectDate}
                              onChange={(e) => {
                                if (e.target.value) saveProjectDate("start_date", e.target.value);
                              }}
                            />
                          )}
                        </div>
                        {/* Finish date */}
                        <div className="space-y-1">
                          <Label className="text-xs">{t('timeline.goalDate', 'Goal date')}</Label>
                          {effectiveFinishDate ? (
                            <Input
                              type="date"
                              className="h-8 text-sm"
                              value={effectiveFinishDate}
                              disabled={savingProjectDate}
                              onChange={(e) => {
                                if (e.target.value) saveProjectDate("finish_goal_date", e.target.value);
                              }}
                            />
                          ) : (
                            <Input
                              type="date"
                              className="h-8 text-sm border-amber-300 bg-amber-50/50"
                              placeholder={t('timeline.setDate', 'Set date')}
                              disabled={savingProjectDate}
                              onChange={(e) => {
                                if (e.target.value) saveProjectDate("finish_goal_date", e.target.value);
                              }}
                            />
                          )}
                        </div>
                        {/* Zoom to project span */}
                        {effectiveStartDate && effectiveFinishDate && (
                          <button
                            type="button"
                            className="w-full text-left text-xs text-primary hover:underline pt-1"
                            onClick={zoomToProjectSpan}
                          >
                            {t('timeline.showFullProject', 'Show full project period')}
                          </button>
                        )}
                      </div>
                      {/* Unscheduled tasks */}
                      {unscheduledTasks.length > 0 && (
                        <div className="p-3">
                          <p className="text-xs font-medium text-muted-foreground mb-2">
                            {t('timeline.unscheduledTasksTitle', 'Unscheduled tasks')}
                          </p>
                          <ul className="space-y-1">
                            {unscheduledTasks.map((ut) => (
                              <li
                                key={ut.id}
                                className="text-sm truncate text-primary hover:underline cursor-pointer"
                                onClick={() => onTaskClick?.(ut.id)}
                              >
                                {ut.title}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                );
              })()}
              {/* Filter popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant={groupBy !== "none" || selectedAssignee !== "all" ? "secondary" : "outline"} size="icon" className="h-8 w-8 relative">
                    <SlidersHorizontal className="h-4 w-4" />
                    {(groupBy !== "none" || selectedAssignee !== "all") && (
                      <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-primary" />
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3" align="end">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium">{t('timeline.filters', 'Filter')}</p>
                    {(groupBy !== "none" || selectedAssignee !== "all") && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-muted-foreground"
                        onClick={() => { setGroupBy("none"); setSelectedAssignee("all"); }}
                      >
                        <X className="h-3 w-3 mr-1" />
                        {t('common.clear', 'Rensa')}
                      </Button>
                    )}
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">{t('timeline.groupBy', 'Gruppering')}</label>
                      <Select value={groupBy} onValueChange={(value) => setGroupBy(value as GroupByOption)}>
                        <SelectTrigger className="h-9">
                          <Layers className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t('timeline.noGrouping', 'No grouping')}</SelectItem>
                          <SelectItem value="status">{t('timeline.groupByStatus', 'Status')}</SelectItem>
                          <SelectItem value="room">{t('timeline.groupByRoom', 'Room')}</SelectItem>
                          <SelectItem value="assignee">{t('timeline.groupByAssignee', 'Assignee')}</SelectItem>
                          <SelectItem value="priority">{t('timeline.groupByPriority', 'Priority')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">{t('budget.allAssignees', 'Tilldelade')}</label>
                      <Select value={selectedAssignee} onValueChange={setSelectedAssignee}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t('budget.allAssignees')}</SelectItem>
                          <SelectItem value="unassigned">{t('common.unassigned')}</SelectItem>
                          {teamMembers.map(member => (
                            <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              {/* View presets: Dag | Vecka | Månad */}
              <div className="flex rounded-md bg-muted/40 border border-border/60 p-0.5">
                {([
                  { key: 'week', label: t('timeline.week', 'Vecka'), days: 7 },
                  { key: 'month', label: t('timeline.month', 'Månad'), days: 30 },
                  { key: '3months', label: '3M', days: 90 },
                ] as const).map(preset => {
                  const isActive = Math.abs(daysVisible - preset.days) < 5;
                  return (
                    <button
                      key={preset.key}
                      type="button"
                      onClick={() => setViewPreset(preset.key)}
                      className={cn(
                        "px-2.5 py-1 rounded text-xs transition-colors",
                        isActive
                          ? "bg-card shadow-sm font-medium text-foreground border border-border/60"
                          : "text-muted-foreground hover:text-foreground border border-transparent"
                      )}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
              {/* Zoom fine-tune */}
              <div className="flex items-center gap-1 border rounded-md p-0.5">
                <Button variant="ghost" size="icon" onClick={zoomOut} disabled={daysVisible >= maxDays} className="h-7 w-7" title={t('timeline.showMoreDays', 'Show more days')}>
                  <ZoomOut className="h-3.5 w-3.5" />
                </Button>
                <span className="font-mono text-[11px] text-muted-foreground min-w-[50px] text-center tnum">
                  {daysVisible}d
                </span>
                <Button variant="ghost" size="icon" onClick={zoomIn} disabled={daysVisible <= minDays} className="h-7 w-7" title={t('timeline.showFewerDays', 'Show fewer days')}>
                  <ZoomIn className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Button variant="outline" onClick={handleToday}>
                {t('timeline.today', 'Idag')}
              </Button>
              <Button variant="outline" size="icon" onClick={handlePrevious}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={handleNext}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div
              ref={gestureContainerRef}
              className="overflow-x-auto overflow-y-hidden -mx-3 px-3 md:mx-0 md:px-0 select-none rounded-lg [&::-webkit-scrollbar]:hidden"
              style={{ maxHeight: '70vh', minHeight: '200px', cursor: isDragging ? 'grabbing' : 'grab', scrollbarWidth: 'none' as unknown as undefined }}
            ><div
              className="relative"
              style={{ minHeight: '160px', width: 'calc(100% + 2px)', minWidth: '802px' }}
            >
              {/* Sticky date ruler — month / week / day rows */}
              <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border shadow-sm flex flex-col">
                {/* Row 1: Month blocks */}
                <div className="flex">
                  {groupBy !== 'none' && <div className="w-40 flex-shrink-0 border-r border-border/30" />}
                  <div className="relative h-5 flex-1 border-b border-border/40">
                    {(() => {
                      const monthBlocks: { start: number; span: number; label: string }[] = [];
                      let blockStart = 0;
                      let currentMonth = minDate.getMonth();
                      for (let i = 1; i <= totalDays; i++) {
                        const date = addDays(minDate, i);
                        const month = i < totalDays ? date.getMonth() : -1;
                        if (month !== currentMonth || i === totalDays) {
                          const blockDate = addDays(minDate, blockStart);
                          monthBlocks.push({
                            start: blockStart,
                            span: i - blockStart,
                            label: format(blockDate, "MMMM yyyy"),
                          });
                          blockStart = i;
                          currentMonth = month;
                        }
                      }
                      return monthBlocks.map((block, idx) => {
                        const left = (block.start / totalDays) * 100;
                        const width = (block.span / totalDays) * 100;
                        return (
                          <div
                            key={idx}
                            className={`absolute h-full flex items-center overflow-hidden border-r border-border/60 px-2 ${idx % 2 === 0 ? 'bg-muted/10' : ''}`}
                            style={{ left: `${left}%`, width: `${width}%` }}
                          >
                            <span className="text-[10px] font-bold text-foreground/60 uppercase tracking-wider whitespace-nowrap">
                              {block.label}
                            </span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
                {/* Row 2: Week blocks */}
                <div className="flex">
                  {groupBy !== 'none' && <div className="w-40 flex-shrink-0 border-r border-border/30" />}
                  <div className="relative h-5 flex-1 border-b border-border/30">
                    {(() => {
                      const weekBlocks: { start: number; span: number; weekNum: number }[] = [];
                      let blockStart = 0;
                      let currentWeek = getISOWeek(minDate);
                      for (let i = 1; i <= totalDays; i++) {
                        const date = addDays(minDate, i);
                        const week = i < totalDays ? getISOWeek(date) : -1;
                        if (week !== currentWeek || i === totalDays) {
                          weekBlocks.push({ start: blockStart, span: i - blockStart, weekNum: currentWeek });
                          blockStart = i;
                          currentWeek = week;
                        }
                      }
                      return weekBlocks.map((block, idx) => {
                        const left = (block.start / totalDays) * 100;
                        const width = (block.span / totalDays) * 100;
                        return (
                          <div
                            key={idx}
                            className={`absolute h-full flex items-center justify-center overflow-hidden border-r border-border/50 ${idx % 2 === 0 ? 'bg-muted/15' : ''}`}
                            style={{ left: `${left}%`, width: `${width}%` }}
                          >
                            <span className="font-mono text-[10px] font-semibold text-muted-foreground whitespace-nowrap tnum">
                              v{block.weekNum}
                            </span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
                {/* Row 3: Day labels */}
                <div className="flex">
                  {groupBy !== 'none' && <div className="w-40 flex-shrink-0 border-r border-border/30 flex items-end pb-0.5 px-3">
                    <span className="text-[9px] font-medium text-muted-foreground">{t('timeline.groupBy', 'Group by')}: {groupBy}</span>
                  </div>}
                  <div className="relative h-6 flex-1">
                    {Array.from({ length: totalDays }, (_, i) => {
                      const date = addDays(minDate, i);
                      const isToday = format(date, "yyyy-MM-dd") === todayStr;
                      const isMonday = date.getDay() === 1;
                      const colLeft = (i / totalDays) * 100;
                      const colWidth = 100 / totalDays;

                      let showLabel = false;
                      if (daysVisible <= 14) showLabel = true;
                      else if (daysVisible <= 31) showLabel = i % 2 === 0;
                      else if (daysVisible <= 90) showLabel = isMonday || date.getDate() === 1;
                      else showLabel = date.getDate() === 1;
                      if (isToday) showLabel = true;

                      if (!showLabel) return null;

                      return (
                        <div
                          key={i}
                          className={`absolute h-full flex items-center justify-center overflow-hidden ${isToday ? 'z-10' : ''}`}
                          style={{ left: `${colLeft}%`, width: `${colWidth}%` }}
                        >
                          <span className={`text-[10px] whitespace-nowrap leading-none ${isToday ? 'text-primary font-bold' : isMonday ? 'text-foreground/70 font-semibold' : 'text-muted-foreground'}`}>
                            {daysVisible <= 14 ? format(date, "EEE d") : format(date, "d")}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Timeline content with optional left sidebar for grouping */}
              <div className="flex">
                {/* Left sidebar for group labels - only shown when grouping is active */}
                {groupBy !== 'none' && (
                  <div className="sticky left-0 z-20 bg-background/95 backdrop-blur-sm border-r border-border/30 w-40 flex-shrink-0">
                    <div className="pt-1">
                      {groupedTasks.map((group) => (
                        <div key={group.id}>
                          {/* Group header */}
                          <div
                            className="h-10 flex items-center gap-2 px-3 cursor-pointer hover:bg-muted/50 transition-colors border-b border-border/20"
                            onClick={() => toggleGroupCollapse(group.id)}
                          >
                            {group.isCollapsed ? (
                              <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            )}
                            {group.color && (
                              <div className={`w-2.5 h-2.5 rounded-full ${group.color} flex-shrink-0`} />
                            )}
                            <span className="text-sm font-medium truncate flex-1">{group.label}</span>
                            <Badge variant="secondary" className="text-xs h-5 px-1.5">
                              {group.tasks.length}
                            </Badge>
                          </div>
                          {/* Spacer rows for tasks (when not collapsed) */}
                          {!group.isCollapsed && group.tasks.map((task) => (
                            <div key={task.id} className="h-12 border-b border-border/10 flex items-center px-3">
                              <span className="text-xs text-muted-foreground truncate">{task.title}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Main timeline area */}
                <div className="flex-1 min-w-0">
                  <div ref={timelineContentRef} className="relative pt-1 overflow-hidden">
                    {/* Background grid - week blocks, day lines, weekend shading */}
                    <div className="absolute inset-0 pointer-events-none" style={{ top: 0 }}>
                      {/* Week-alternating background bands */}
                      {(() => {
                        const weekBands: { start: number; span: number; idx: number }[] = [];
                        let blockStart = 0;
                        let currentWeek = getISOWeek(minDate);
                        let weekIdx = 0;
                        for (let i = 1; i <= totalDays; i++) {
                          const date = addDays(minDate, i);
                          const week = i < totalDays ? getISOWeek(date) : -1;
                          if (week !== currentWeek || i === totalDays) {
                            weekBands.push({ start: blockStart, span: i - blockStart, idx: weekIdx });
                            blockStart = i;
                            currentWeek = week;
                            weekIdx++;
                          }
                        }
                        return weekBands.map((band) => {
                          const left = (band.start / totalDays) * 100;
                          const width = (band.span / totalDays) * 100;
                          return band.idx % 2 === 0 ? (
                            <div
                              key={`wb-${band.idx}`}
                              className="absolute bg-muted/15 pointer-events-none"
                              style={{ left: `${left}%`, width: `${width}%`, top: '0', bottom: '0', height: '100%' }}
                            />
                          ) : null;
                        });
                      })()}
                      {Array.from({ length: totalDays + 1 }, (_, i) => {
                        const currentDate = addDays(minDate, i);
                        const isMonday = currentDate.getDay() === 1;
                        const isFirstOfMonth = currentDate.getDate() === 1 && i > 0;
                        const isWeekend = currentDate.getDay() === 0 || currentDate.getDay() === 6;
                        const isToday = format(currentDate, "yyyy-MM-dd") === todayStr;
                        const left = (i / totalDays) * 100;

                        return (
                          <React.Fragment key={`grid-${i}`}>
                            {/* Day separator lines — hierarchy: month > week (Monday) > day */}
                            {i > 0 && (
                              <div
                                className={`absolute pointer-events-none ${
                                  isFirstOfMonth ? 'w-[2px] bg-border' :
                                  isMonday ? 'w-[2px] bg-border/60' :
                                  'w-px bg-border/30'
                                }`}
                                style={{ left: `${left}%`, top: '0', bottom: '0', height: '100%' }}
                              />
                            )}
                            {/* Weekend shading */}
                            {isWeekend && i < totalDays && (
                              <div
                                className="absolute bg-muted/25 pointer-events-none"
                                style={{ left: `${left}%`, width: `${100/totalDays}%`, top: '0', bottom: '0', height: '100%' }}
                              />
                            )}
                            {/* Today indicator — warm amber line */}
                            {isToday && (
                              <div
                                className="absolute w-0.5 bg-amber-500 z-20 pointer-events-none"
                                style={{ left: `${left}%`, top: '0', bottom: '0', height: '100%' }}
                              />
                            )}
                          </React.Fragment>
                        );
                      })}

                      {/* Project start date marker */}
                      {effectiveStartDate && (() => {
                        const startDay = differenceInDays(parseISO(effectiveStartDate), minDate);
                        if (startDay < 0 || startDay > totalDays) return null;
                        const left = (startDay / totalDays) * 100;
                        return (
                          <>
                            <div
                              className="absolute w-0.5 bg-blue-400/60 z-10 pointer-events-none"
                              style={{ left: `${left}%`, top: '0', bottom: '0', height: '100%' }}
                            />
                            <div
                              className="absolute z-20 pointer-events-none flex items-center gap-0.5"
                              style={{ left: `${left}%`, top: '2px', transform: 'translateX(-50%)' }}
                            >
                              <span className="text-[9px] font-medium text-blue-500 bg-background/80 rounded px-1 py-0.5 whitespace-nowrap leading-none">
                                ▶ Start
                              </span>
                            </div>
                          </>
                        );
                      })()}

                      {/* Project finish/goal date marker */}
                      {effectiveFinishDate && (() => {
                        const finishDay = differenceInDays(parseISO(effectiveFinishDate), minDate);
                        if (finishDay < 0 || finishDay > totalDays) return null;
                        const left = (finishDay / totalDays) * 100;
                        return (
                          <>
                            <div
                              className="absolute w-0.5 bg-green-400/60 z-10 pointer-events-none"
                              style={{ left: `${left}%`, top: '0', bottom: '0', height: '100%' }}
                            />
                            <div
                              className="absolute z-20 pointer-events-none flex items-center gap-0.5"
                              style={{ left: `${left}%`, top: '2px', transform: 'translateX(-50%)' }}
                            >
                              <span className="text-[9px] font-medium text-green-600 bg-background/80 rounded px-1 py-0.5 whitespace-nowrap leading-none">
                                {t('timeline.goal', 'Goal')} 🏁
                              </span>
                            </div>
                          </>
                        );
                      })()}
                    </div>

                    {/* Dependency arrows SVG overlay */}
                    {timelineWidth > 0 && dependencies.length > 0 && (
                      <svg className="absolute inset-0 pointer-events-none z-10" style={{ top: '0.25rem' }}>
                        <defs>
                          <marker id="dep-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                            <path d="M0,0 L8,3 L0,6" className="fill-muted-foreground/50" />
                          </marker>
                        </defs>
                        {dependencies.filter(dep =>
                          taskRowMap.has(dep.task_id) && taskRowMap.has(dep.depends_on_task_id)
                        ).map(dep => {
                          const sourceTask = tasks.find(t => t.id === dep.depends_on_task_id);
                          const targetTask = tasks.find(t => t.id === dep.task_id);
                          if (!sourceTask || !targetTask) return null;

                          // Use drag preview dates for arrows during drag
                          const getPreviewDates = (t: Task) => {
                            if (dragInteraction?.taskId === t.id) {
                              return { ...t, start_date: dragInteraction.previewStart, finish_date: dragInteraction.previewFinish };
                            }
                            if (dragInteraction?.mode === 'moving') {
                              const delta = differenceInDays(parseISO(dragInteraction.previewStart), parseISO(dragInteraction.origStart));
                              if (delta > 0) { // Only preview cascade forward
                                const downstreamIds = getDownstreamTasks(dragInteraction.taskId, dependencies);
                                const predNewFinish = parseISO(dragInteraction.previewFinish);
                                if (downstreamIds.includes(t.id) && t.start_date && t.finish_date) {
                                  const depStart = parseISO(t.start_date);
                                  if (depStart <= predNewFinish) {
                                    const pushDays = differenceInDays(predNewFinish, depStart) + 1;
                                    return {
                                      ...t,
                                      start_date: format(addDays(depStart, pushDays), 'yyyy-MM-dd'),
                                      finish_date: format(addDays(parseISO(t.finish_date), pushDays), 'yyyy-MM-dd'),
                                    };
                                  }
                                }
                              }
                            }
                            return t;
                          };

                          const sourcePos = getTaskPosition(getPreviewDates(sourceTask), minDate, totalDays);
                          const targetPos = getTaskPosition(getPreviewDates(targetTask), minDate, totalDays);
                          const sourceRow = taskRowMap.get(dep.depends_on_task_id)!;
                          const targetRow = taskRowMap.get(dep.task_id)!;

                          // Convert percentage to pixels
                          const x1 = (sourcePos.left + sourcePos.width) / 100 * timelineWidth;
                          const y1 = sourceRow * 48 + 24;
                          const x2 = targetPos.left / 100 * timelineWidth;
                          const y2 = targetRow * 48 + 24;

                          // Bezier control points for smooth curve
                          const dx = Math.abs(x2 - x1) / 2;
                          const cpx1 = x1 + Math.max(dx, 20);
                          const cpx2 = x2 - Math.max(dx, 20);
                          const path = `M ${x1} ${y1} C ${cpx1} ${y1}, ${cpx2} ${y2}, ${x2} ${y2}`;

                          return (
                            <path
                              key={dep.id}
                              d={path}
                              className="stroke-muted-foreground/40"
                              strokeWidth={1.5}
                              fill="none"
                              markerEnd="url(#dep-arrow)"
                            />
                          );
                        })}
                      </svg>
                    )}

                    {/* Empty state message (shown inside grid so scroll/gestures still work) */}
                    {visibleTasks.length === 0 && (
                      <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                        {t('timeline.noTasksInPeriod', 'No tasks scheduled in this time period')}
                      </div>
                    )}

                    {/* Grouped task rows */}
                    {groupedTasks.map((group) => (
                      <div key={group.id}>
                        {/* Group header row (only when grouping is active) */}
                        {groupBy !== 'none' && (
                          <div className="h-10 flex items-center border-b border-border/30 bg-muted/20 px-2">
                            <div className="flex items-center gap-2">
                              {group.color && <div className={`w-3 h-3 rounded-full ${group.color}`} />}
                              <span className="text-sm font-semibold text-foreground">{group.label}</span>
                              <Badge variant="outline" className="text-xs">{group.tasks.length} {group.tasks.length === 1 ? 'task' : 'tasks'}</Badge>
                            </div>
                          </div>
                        )}

                        {/* Task rows (hidden when collapsed) */}
                        {!group.isCollapsed && group.tasks.map((task) => {
                          // Use preview dates during drag for real-time feedback
                          const isDragging = dragInteraction?.taskId === task.id;
                          const cascadePreview = dragInteraction && dragInteraction.mode === 'moving'
                            ? (() => {
                                const delta = differenceInDays(
                                  parseISO(dragInteraction.previewStart),
                                  parseISO(dragInteraction.origStart)
                                );
                                if (delta <= 0) return null; // Only preview cascade forward
                                const downstreamIds = getDownstreamTasks(dragInteraction.taskId, dependencies);
                                if (!downstreamIds.includes(task.id)) return null;
                                // Only shift if dependent starts before predecessor's new finish
                                const predNewFinish = parseISO(dragInteraction.previewFinish);
                                const depStart = task.start_date ? parseISO(task.start_date) : null;
                                if (!depStart || depStart > predNewFinish) return null;
                                const pushDays = differenceInDays(predNewFinish, depStart) + 1;
                                return {
                                  start: task.start_date ? format(addDays(parseISO(task.start_date), pushDays), 'yyyy-MM-dd') : task.start_date,
                                  finish: task.finish_date ? format(addDays(parseISO(task.finish_date), pushDays), 'yyyy-MM-dd') : task.finish_date,
                                };
                              })()
                            : null;
                          const displayStart = isDragging ? dragInteraction.previewStart : cascadePreview?.start || task.start_date;
                          const displayFinish = isDragging ? dragInteraction.previewFinish : cascadePreview?.finish || task.finish_date;
                          const { left, width } = getTaskPosition(
                            { ...task, start_date: displayStart, finish_date: displayFinish },
                            minDate, totalDays
                          );
                          return (
                            <div key={task.id} className="relative h-12 py-0.5">
                              <HoverCard openDelay={400} open={!!dragInteraction ? false : undefined} key={dragInteraction ? 'dragging' : 'idle'}>
                                <HoverCardTrigger asChild>
                                  <div
                                    className={`task-bar absolute h-11 rounded-md ${getStatusColor(task.status)} shadow-sm hover:shadow-md transition-shadow group border border-white/20 ${
                                      isDragging ? 'opacity-90 shadow-lg ring-2 ring-primary/30 z-30' : ''
                                    } ${cascadePreview ? 'ring-1 ring-blue-400/50 opacity-80' : ''}`}
                                    style={{ left: `${left}%`, width: `${Math.max(width, 100 / totalDays * 0.5)}%`, overflow: 'clip' }}
                                  >
                                    {/* Left resize handle */}
                                    <div
                                      className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize z-30 rounded-l-md touch-none group/left"
                                      onPointerDown={(e) => handleBarPointerDown(e, task, 'resize-left')}
                                    >
                                      <div className="absolute inset-y-2 left-0.5 w-0.5 rounded-full bg-white/0 group-hover/left:bg-white/60 transition-colors" />
                                    </div>

                                    {/* Task content — drag to move, tap to open */}
                                    <div
                                      className="sticky left-0 h-full w-fit max-w-full flex items-center gap-1 px-2 py-0.5 relative z-10 touch-none cursor-grab active:cursor-grabbing"
                                      onPointerDown={(e) => handleBarPointerDown(e, task, 'moving')}
                                    >
                                      <GripVertical className="h-3 w-3 text-white/40 group-hover:text-white/80 shrink-0 transition-colors" />
                                      <span className="text-xs font-semibold text-white drop-shadow line-clamp-2 leading-tight min-w-0">
                                        {task.title}
                                      </span>
                                      {task.progress > 0 && (
                                        <div className="hidden md:flex flex-shrink-0 bg-black/20 px-1.5 py-0.5 rounded ml-1">
                                          <span className="text-[10px] font-bold text-white">{task.progress}%</span>
                                        </div>
                                      )}
                                    </div>

                                    {/* Progress bar overlay */}
                                    {task.progress > 0 && (
                                      <div
                                        className="absolute inset-0 bg-white/15 pointer-events-none rounded-md"
                                        style={{ width: `${task.progress}%` }}
                                      />
                                    )}

                                    {/* Right resize handle */}
                                    <div
                                      className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize z-30 rounded-r-md touch-none group/right"
                                      onPointerDown={(e) => handleBarPointerDown(e, task, 'resize-right')}
                                    >
                                      <div className="absolute inset-y-2 right-0.5 w-0.5 rounded-full bg-white/0 group-hover/right:bg-white/60 transition-colors" />
                                    </div>
                                  </div>
                                </HoverCardTrigger>
                                <HoverCardContent className="w-72">
                                  <div className="space-y-2">
                                    <div className="flex items-start justify-between gap-2">
                                      <h4 className="font-semibold leading-tight text-sm">{task.title}</h4>
                                      <span className={`px-2 py-0.5 rounded text-xs font-medium border whitespace-nowrap ${getStatusBadgeColor(task.status)}`}>
                                        {getStatusLabel(task.status)}
                                      </span>
                                    </div>
                                    {task.description && (
                                      <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>
                                    )}
                                    <div className="text-xs text-muted-foreground">
                                      {format(parseISO(task.start_date!), "MMM d")} – {format(parseISO(task.finish_date!), "MMM d, yyyy")}
                                      {task.progress > 0 && ` · ${task.progress}%`}
                                    </div>
                                  </div>
                                </HoverCardContent>
                              </HoverCard>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div></div>
        </div>
        {/* Footer — today indicator */}
        <div className="flex items-center gap-2.5 px-4 py-2.5 border-t bg-muted/30 text-[11px] text-muted-foreground">
          <div className="w-0.5 h-2.5 bg-amber-500 rounded-full shrink-0" />
          <span>{t('timeline.today', 'Idag')} · {format(new Date(), "d MMMM yyyy", { locale: sv })} · {t('timeline.day', 'dag')} {effectiveStartDate ? differenceInDays(new Date(), parseISO(effectiveStartDate)) + 1 : '–'} {t('timeline.of', 'av')} {effectiveStartDate && effectiveFinishDate ? differenceInDays(parseISO(effectiveFinishDate), parseISO(effectiveStartDate)) + 1 : '–'}</span>
        </div>
      </CardContent>

      <TaskEditDialog
        taskId={editingTask?.id ?? null}
        projectId={projectId}
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) setEditingTask(null);
        }}
        onSaved={() => {
          fetchTasks();
          setEditDialogOpen(false);
          setEditingTask(null);
        }}
        currency={currency}
      />
      {/* Legacy inline dialog removed — using shared TaskEditDialog */}
      {false && (
      <Dialog open={false} onOpenChange={() => {}}>
        <DialogContent className="hidden">
          <DialogHeader>
            <DialogTitle>legacy</DialogTitle>
            <DialogDescription className="sr-only">legacy</DialogDescription>
          </DialogHeader>
          {editingTask && (
            <form onSubmit={() => {}} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-task-title">{t('tasks.taskTitle')}</Label>
                <Input
                  id="edit-task-title"
                  value={editingTask.title}
                  onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-task-description">{t('common.description')}</Label>
                <Textarea
                  id="edit-task-description"
                  value={editingTask.description || ""}
                  onChange={(e) => setEditingTask({ ...editingTask, description: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-task-priority">Priority</Label>
                  <Select 
                    value={editingTask.priority} 
                    onValueChange={(value) => setEditingTask({ ...editingTask, priority: value })}
                  >
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
                  <Label htmlFor="edit-task-assignee">{t('common.assignedTo')}</Label>
                  <Select
                    value={editingTask.assigned_to_stakeholder_id || "unassigned"}
                    onValueChange={(value) => 
                      setEditingTask({ 
                        ...editingTask, 
                        assigned_to_stakeholder_id: value === "unassigned" ? null : value 
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('common.unassigned')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">{t('common.unassigned')}</SelectItem>
                      {teamMembers.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-task-progress">{t('common.progress')}: {editingTask.progress}%</Label>
                <Slider
                  id="edit-task-progress"
                  min={0}
                  max={100}
                  step={5}
                  value={[editingTask.progress]}
                  onValueChange={([value]) => setEditingTask({ ...editingTask, progress: value })}
                  className="w-full"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-task-start-date">{t('common.startDate')}</Label>
                  <DatePicker
                    date={editingTask.start_date ? parseLocalDate(editingTask.start_date) : undefined}
                    onDateChange={(date) => setEditingTask({ ...editingTask, start_date: date ? formatLocalDate(date) : null })}
                    placeholder="Välj startdatum"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-task-finish-date">{t('common.finishDate')}</Label>
                  <DatePicker
                    date={editingTask.finish_date ? parseLocalDate(editingTask.finish_date) : undefined}
                    onDateChange={(date) => setEditingTask({ ...editingTask, finish_date: date ? formatLocalDate(date) : null })}
                    placeholder="Välj slutdatum"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-task-budget">{t('common.budget')}</Label>
                <Input
                  id="edit-task-budget"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={editingTask.budget || ""}
                  onChange={(e) => setEditingTask({ ...editingTask, budget: parseFloat(e.target.value) || null })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-task-cost-center">{t('budget.costCenter')}</Label>
                <Select
                  value={editingTask.cost_center || ""}
                  onValueChange={(value) => setEditingTask({ ...editingTask, cost_center: value || null })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select cost center" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    <SelectItem value="Floor">Floor</SelectItem>
                    <SelectItem value="Paint">Paint</SelectItem>
                    <SelectItem value="Construction">Construction</SelectItem>
                    <SelectItem value="Kitchen">Kitchen</SelectItem>
                    <SelectItem value="Bathrooms">Bathrooms</SelectItem>
                    <SelectItem value="Plumbing">Plumbing</SelectItem>
                    <SelectItem value="Tiles">Tiles</SelectItem>
                    <SelectItem value="Windows">Windows</SelectItem>
                    <SelectItem value="Doors">Doors</SelectItem>
                    <SelectItem value="Electricity">Electricity</SelectItem>
                    <SelectItem value="Carpentry">Carpentry</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit">
                  {t('taskPanel.saveChanges')}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      )}

      {/* Task detail — read-only sheet for homeowners, full edit dialog for builders */}
      {userType === "homeowner" ? (
        <ClientTaskSheet
          taskId={selectedTaskId}
          projectId={projectId}
          open={sidePanelOpen}
          onOpenChange={setSidePanelOpen}
        />
      ) : (
        <TaskEditDialog
          taskId={selectedTaskId}
          projectId={projectId}
          open={sidePanelOpen}
          onOpenChange={setSidePanelOpen}
          onSaved={() => {
            fetchTasks();
            fetchDependencies();
          }}
          currency={currency}
        />
      )}
    </Card>;
};
export default ProjectTimeline;
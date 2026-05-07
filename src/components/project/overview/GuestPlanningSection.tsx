import { useState, useCallback, useMemo } from "react";
import { GuestLoginPrompt } from "@/components/guest/GuestLoginPrompt";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ColumnToggle } from "@/components/shared/ColumnToggle";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { Plus, ClipboardList, Home, Trash2, Cloud, Columns3, Info, Sparkles, Rocket, FileUp } from "lucide-react";
import { GuestTaskEstimateSheet } from "./GuestTaskEstimateSheet";
import { PlanningTour } from "@/components/onboarding/PlanningTour";
import { detectWorkType } from "@/lib/materialRecipes";
import {
  getGuestTasks,
  saveGuestTask,
  updateGuestTask,
  deleteGuestTask,
  getGuestRooms,
  saveGuestRoom,
  updateGuestRoom,
  deleteGuestRoom,
} from "@/services/guestStorageService";
import type { GuestTask, GuestRoom } from "@/types/guest.types";
import { computeFloorAreaSqm, computeWallAreaSqm } from "@/lib/materialRecipes";
import type { RecipeRoom } from "@/lib/materialRecipes";

// ---------------------------------------------------------------------------
// Column config
// ---------------------------------------------------------------------------

type TaskColumnKey = "room" | "description" | "status";

interface ColumnDef {
  key: TaskColumnKey;
  labelKey: string;
  defaultOn: boolean;
}

const TASK_COLUMNS: ColumnDef[] = [
  { key: "room", labelKey: "planningTasks.room", defaultOn: true },
  { key: "description", labelKey: "tasks.description", defaultOn: false },
  { key: "status", labelKey: "common.status", defaultOn: false },
];

const TASK_STATUSES = ["to_do", "in_progress", "completed"] as const;

// ---------------------------------------------------------------------------
// Room column config
// ---------------------------------------------------------------------------

type RoomColumnKey = "width" | "depth" | "ceilingHeight" | "wallArea" | "paintEstimate";

interface RoomColumnDef {
  key: RoomColumnKey;
  labelKey: string;
  defaultOn: boolean;
}

const ROOM_COLUMNS: RoomColumnDef[] = [
  { key: "width", labelKey: "rooms.width", defaultOn: true },
  { key: "depth", labelKey: "rooms.depth", defaultOn: true },
  { key: "ceilingHeight", labelKey: "rooms.ceilingHeight", defaultOn: true },
  { key: "wallArea", labelKey: "rooms.wallArea", defaultOn: true },
  { key: "paintEstimate", labelKey: "rooms.paintEstimate", defaultOn: false },
];

const DEFAULT_CEILING_MM = 2400;

// ---------------------------------------------------------------------------
// Helpers: GuestRoom → RecipeRoom adapter
// ---------------------------------------------------------------------------

function guestRoomToRecipe(room: GuestRoom): RecipeRoom {
  return {
    dimensions: {
      area_sqm: room.area_sqm ?? undefined,
      width_mm: room.width_mm ?? undefined,
      height_mm: room.height_mm ?? undefined,
    },
    ceiling_height_mm: room.ceiling_height_mm ?? DEFAULT_CEILING_MM,
  };
}

function computeGuestPaintLiters(room: GuestRoom, coverage: number, coats: number): number | null {
  const wallArea = computeWallAreaSqm(guestRoomToRecipe(room));
  if (!wallArea || wallArea <= 0) return null;
  return Math.ceil((wallArea / coverage) * coats);
}

function formatMm(val: number | null | undefined): string {
  if (val === null || val === undefined) return "";
  return String(val);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface GuestPlanningSectionProps {
  projectId: string;
  projectStatus?: string;
  onActivate?: () => void;
}

export function GuestPlanningSection({ projectId, projectStatus, onActivate }: GuestPlanningSectionProps) {
  const { t } = useTranslation();
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  // Tasks
  const [tasks, setTasks] = useState<GuestTask[]>(() => getGuestTasks(projectId));
  const [addingTask, setAddingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");

  // Rooms
  const [rooms, setRooms] = useState<GuestRoom[]>(() => getGuestRooms(projectId));
  const [addingRoom, setAddingRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");

  // Task estimate sheet
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Inline editing (shared for tasks and rooms)
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState("");

  // Task column visibility
  const [visibleCols, setVisibleCols] = useState<Set<TaskColumnKey>>(
    () => new Set(TASK_COLUMNS.filter((c) => c.defaultOn).map((c) => c.key))
  );

  const show = useMemo(() => ({
    room: visibleCols.has("room"),
    description: visibleCols.has("description"),
    status: visibleCols.has("status"),
  }), [visibleCols]);

  const toggleColumn = useCallback((key: TaskColumnKey) => {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  // Room column visibility
  const [visibleRoomCols, setVisibleRoomCols] = useState<Set<RoomColumnKey>>(
    () => new Set(ROOM_COLUMNS.filter((c) => c.defaultOn).map((c) => c.key))
  );

  const showRoom = useMemo(() => {
    const s: Record<RoomColumnKey, boolean> = {} as Record<RoomColumnKey, boolean>;
    for (const col of ROOM_COLUMNS) s[col.key] = visibleRoomCols.has(col.key);
    return s;
  }, [visibleRoomCols]);

  const toggleRoomColumn = useCallback((key: RoomColumnKey) => {
    setVisibleRoomCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  // Paint estimation settings (localStorage for guests)
  const [paintCoverage, setPaintCoverage] = useState(10);
  const [paintCoats, setPaintCoats] = useState(2);

  const roomMap = useMemo(() => new Map(rooms.map((r) => [r.id, r.name])), [rooms]);

  // Refresh helpers
  const refreshTasks = useCallback(() => setTasks(getGuestTasks(projectId)), [projectId]);
  const refreshRooms = useCallback(() => {
    setRooms(getGuestRooms(projectId));
    refreshTasks(); // room deletion cascades
  }, [projectId, refreshTasks]);

  // ----- Task CRUD -----
  const handleAddTask = useCallback(() => {
    const title = newTaskTitle.trim();
    if (!title) return;
    saveGuestTask(projectId, {
      title,
      room_id: null,
      description: null,
      status: "to_do",
      priority: null,
      due_date: null,
    });
    refreshTasks();
    setNewTaskTitle("");
    setAddingTask(false);
  }, [projectId, newTaskTitle, refreshTasks]);

  const handleDeleteTask = useCallback((taskId: string) => {
    deleteGuestTask(projectId, taskId);
    refreshTasks();
  }, [projectId, refreshTasks]);

  const handleTaskUpdate = useCallback((taskId: string, updates: Partial<GuestTask>) => {
    updateGuestTask(projectId, taskId, updates);
    refreshTasks();
  }, [projectId, refreshTasks]);

  // Inline edit helpers
  const startEdit = useCallback((id: string, field: string, value: string) => {
    setEditingCell({ id, field });
    setEditValue(value);
  }, []);

  const saveEdit = useCallback((taskId: string, field: string) => {
    setEditingCell(null);
    if (field === "title") {
      const trimmed = editValue.trim();
      if (trimmed) handleTaskUpdate(taskId, { title: trimmed });
    } else if (field === "description") {
      handleTaskUpdate(taskId, { description: editValue.trim() || null });
    }
  }, [editValue, handleTaskUpdate]);

  // ----- Room CRUD -----
  const handleAddRoom = useCallback(() => {
    const name = newRoomName.trim();
    if (!name) return;
    saveGuestRoom(projectId, {
      name,
      room_type: null,
      status: "existing",
      area_sqm: null,
      floor_number: null,
      notes: null,
      width_mm: null,
      height_mm: null,
      ceiling_height_mm: DEFAULT_CEILING_MM,
    });
    refreshRooms();
    setNewRoomName("");
    setAddingRoom(false);
  }, [projectId, newRoomName, refreshRooms]);

  const handleDeleteRoom = useCallback((roomId: string) => {
    deleteGuestRoom(projectId, roomId);
    refreshRooms();
  }, [projectId, refreshRooms]);

  // Room inline edit save
  const saveRoomEdit = useCallback((roomId: string, field: string, rawValue: string) => {
    setEditingCell(null);
    const room = rooms.find((r) => r.id === roomId);
    if (!room) return;

    const numVal = rawValue.trim() === "" ? null : Number(rawValue);
    let updates: Partial<GuestRoom> = {};

    if (field === "name") {
      const trimmed = rawValue.trim();
      if (!trimmed) return;
      updates = { name: trimmed };
    } else if (field === "width") {
      updates = { width_mm: numVal };
      // Auto-compute area if both dimensions exist
      if (numVal && room.height_mm) {
        updates.area_sqm = (numVal / 1000) * (room.height_mm / 1000);
      }
    } else if (field === "depth") {
      updates = { height_mm: numVal };
      if (numVal && room.width_mm) {
        updates.area_sqm = (room.width_mm / 1000) * (numVal / 1000);
      }
    } else if (field === "ceilingHeight") {
      updates = { ceiling_height_mm: numVal };
    } else if (field === "area") {
      updates = { area_sqm: numVal };
    }

    if (Object.keys(updates).length === 0) return;
    updateGuestRoom(projectId, roomId, updates);
    refreshRooms();
  }, [rooms, projectId, refreshRooms]);

  // Computed room stats
  const totalArea = useMemo(() => {
    return rooms.reduce((sum, r) => {
      const recipe = guestRoomToRecipe(r);
      return sum + (computeFloorAreaSqm(recipe) || 0);
    }, 0);
  }, [rooms]);

  const totalWallArea = useMemo(() => {
    return rooms.reduce((sum, r) => {
      const recipe = guestRoomToRecipe(r);
      return sum + (computeWallAreaSqm(recipe) || 0);
    }, 0);
  }, [rooms]);

  const roomsWithDimensions = useMemo(() => {
    return rooms.filter((r) => computeFloorAreaSqm(guestRoomToRecipe(r)) !== null).length;
  }, [rooms]);

  const roomColCount = useMemo(() => {
    let count = 2; // name + area
    for (const col of ROOM_COLUMNS) {
      if (visibleRoomCols.has(col.key)) count++;
    }
    count++; // delete column
    return count;
  }, [visibleRoomCols]);

  // Column count for colSpan
  const colCount = 1 + (show.room ? 1 : 0) + (show.description ? 1 : 0) + (show.status ? 1 : 0) + 1;

  const statusKey = (s: string) => {
    const map: Record<string, string> = { to_do: "toDo", in_progress: "inProgress" };
    return map[s] || s;
  };

  const isPlanning = !projectStatus || projectStatus === "planning";
  const canActivate = isPlanning && tasks.length >= 1 && rooms.length >= 1;

  return (
    <>
      {/* Activate project button — shown in planning phase when ready */}
      {isPlanning && (
        <div className="flex items-center justify-end gap-3">
          {!canActivate && (
            <p className="text-xs text-muted-foreground">
              {tasks.length === 0 && rooms.length === 0
                ? t("guestEstimate.activateHintBoth", "Add at least 1 task and 1 room to activate")
                : tasks.length === 0
                  ? t("guestEstimate.activateHintTask", "Add at least 1 task to activate")
                  : t("guestEstimate.activateHintRoom", "Add at least 1 room to activate")}
            </p>
          )}
          <Button
            size="sm"
            disabled={!canActivate}
            className="gap-1.5"
            onClick={() => setShowLoginPrompt(true)}
          >
            <Rocket className="h-4 w-4" />
            {t("guestEstimate.activateProject", "Activate project")}
          </Button>
        </div>
      )}

      {/* Task planning */}
      <div className="space-y-3" data-tour="task-table">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-primary" />
          <div>
            <h3 className="text-base font-semibold">{t("planningTasks.title", "Scope of work")}</h3>
            <p className="text-xs text-muted-foreground">
              {t("planningTasks.description", "Define the tasks included in your renovation, e.g. painting, demolition, tiling")}
            </p>
          </div>
        </div>
        <div>
          {tasks.length === 0 && !addingTask ? (
            <div className="text-center py-8">
              <ClipboardList className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm font-medium text-muted-foreground">
                {t("planningTasks.empty", "No tasks yet")}
              </p>
              <p className="text-xs text-muted-foreground/70 mb-4">
                {t("planningTasks.emptyHint", "Add the work items included in your renovation")}
              </p>
              <Button size="sm" onClick={() => setAddingTask(true)}>
                <Plus className="h-4 w-4 mr-1" />
                {t("planningTasks.addFirst", "Add first task")}
              </Button>
            </div>
          ) : (
            <>
              <div className="rounded-lg border bg-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted border-b">
                    <th className="px-3 py-2.5 kicker text-left">{t("planningTasks.taskName", "Task")}</th>
                    {show.room && (
                      <th className="px-3 py-2.5 kicker text-left w-[140px]">{t("planningTasks.room", "Room")}</th>
                    )}
                    {show.description && (
                      <th className="px-3 py-2.5 kicker text-left w-[200px]">{t("tasks.description", "Description")}</th>
                    )}
                    {show.status && (
                      <th className="px-3 py-2.5 kicker text-left w-[120px]">{t("common.status", "Status")}</th>
                    )}
                    <th className="px-3 py-2.5 kicker w-[40px]" />
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => {
                    const isEditingTitle = editingCell?.id === task.id && editingCell?.field === "title";
                    const isEditingDesc = editingCell?.id === task.id && editingCell?.field === "description";
                    const taskRoom = task.room_id ? rooms.find((r) => r.id === task.room_id) ?? null : null;
                    const taskWorkType = detectWorkType({ title: task.title });
                    const roomHasDims = taskRoom && (taskRoom.width_mm || taskRoom.area_sqm);
                    const canEstimate = taskWorkType !== null && roomHasDims;

                    return (
                      <tr key={task.id} className="group border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                        {/* Title — inline editable + sparkles indicator */}
                        <td className="px-3 py-2.5">
                          {isEditingTitle ? (
                            <Input
                              autoFocus
                              className="h-7 text-sm"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveEdit(task.id, "title");
                                if (e.key === "Escape") setEditingCell(null);
                              }}
                              onBlur={() => saveEdit(task.id, "title")}
                            />
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <button
                                className="text-sm font-medium text-left flex-1 rounded px-1 -mx-1 hover:bg-muted cursor-text transition-colors"
                                onClick={() => startEdit(task.id, "title", task.title)}
                              >
                                {task.title}
                              </button>
                              {canEstimate && (
                                <button
                                  className="shrink-0 p-0.5 rounded hover:bg-amber-100 transition-colors"
                                  onClick={() => setSelectedTaskId(task.id)}
                                  title={t("guestEstimate.viewEstimate", "View estimate")}
                                >
                                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                                </button>
                              )}
                              {taskWorkType && !roomHasDims && (
                                <button
                                  className="shrink-0 p-0.5 rounded hover:bg-muted transition-colors"
                                  onClick={() => setSelectedTaskId(task.id)}
                                  title={t("guestEstimate.viewEstimate", "View estimate")}
                                >
                                  <Sparkles className="h-3.5 w-3.5 text-muted-foreground/40" />
                                </button>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Room — select dropdown */}
                        {show.room && (
                          <td className="px-3 py-2.5">
                            <Select
                              value={task.room_id || "__none__"}
                              onValueChange={(val) =>
                                handleTaskUpdate(task.id, { room_id: val === "__none__" ? null : val })
                              }
                            >
                              <SelectTrigger className="h-7 text-xs border-0 shadow-none bg-transparent hover:bg-muted px-1 -mx-1">
                                <SelectValue placeholder="–" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">
                                  <span className="text-muted-foreground">–</span>
                                </SelectItem>
                                {rooms.map((r) => (
                                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                        )}

                        {/* Description — inline editable */}
                        {show.description && (
                          <td className="px-3 py-2.5">
                            {isEditingDesc ? (
                              <Input
                                autoFocus
                                className="h-7 text-sm"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveEdit(task.id, "description");
                                  if (e.key === "Escape") setEditingCell(null);
                                }}
                                onBlur={() => saveEdit(task.id, "description")}
                              />
                            ) : (
                              <button
                                className="text-sm text-left w-full rounded px-1 -mx-1 hover:bg-muted cursor-text transition-colors text-muted-foreground"
                                onClick={() => startEdit(task.id, "description", task.description || "")}
                              >
                                {task.description || <span className="text-muted-foreground/50">–</span>}
                              </button>
                            )}
                          </td>
                        )}

                        {/* Status — select dropdown */}
                        {show.status && (
                          <td className="px-3 py-2.5">
                            <Select
                              value={task.status}
                              onValueChange={(val) => handleTaskUpdate(task.id, { status: val })}
                            >
                              <SelectTrigger className="h-7 text-xs border-0 shadow-none bg-transparent hover:bg-muted px-1 -mx-1">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {TASK_STATUSES.map((s) => (
                                  <SelectItem key={s} value={s}>
                                    {t(`statuses.${statusKey(s)}`, s)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                        )}

                        {/* Delete */}
                        <td className="px-3 py-2.5 w-[40px]">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                            onClick={() => handleDeleteTask(task.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}

                  {addingTask && (
                    <tr>
                      <td colSpan={colCount} className="px-3 py-2.5">
                        <form
                          className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
                          onSubmit={(e) => { e.preventDefault(); handleAddTask(); }}
                        >
                          <Input
                            autoFocus
                            placeholder={t("planningTasks.taskPlaceholder", "e.g. Paint living room")}
                            className="h-7 text-sm flex-1 sm:max-w-[300px]"
                            value={newTaskTitle}
                            onChange={(e) => setNewTaskTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") { setAddingTask(false); setNewTaskTitle(""); }
                            }}
                          />
                          <Button type="submit" size="sm" variant="ghost" className="h-7 text-xs" disabled={!newTaskTitle.trim()}>
                            {t("common.add", "Add")}
                          </Button>
                          <Button type="button" size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground"
                            onClick={() => { setAddingTask(false); setNewTaskTitle(""); }}>
                            {t("common.cancel")}
                          </Button>
                        </form>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>

              {/* Footer: add + column chooser */}
              <div className="flex items-center gap-2 mt-2 pt-2 border-t">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setAddingTask(true)} data-tour="add-task">
                  <Plus className="h-3.5 w-3.5" />
                  {t("planningTasks.addTask", "Add task")}
                </Button>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <a href="/auth">
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                          <FileUp className="h-3.5 w-3.5" />
                          <Sparkles className="h-3 w-3 text-amber-500" />
                        </Button>
                      </a>
                    </TooltipTrigger>
                    <TooltipContent>
                      {t("planningSmartImport.guestTooltip", "Create an account to import rooms & tasks from documents")}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <ColumnToggle
                  columns={TASK_COLUMNS.map(c => c.key)}
                  labels={Object.fromEntries(TASK_COLUMNS.map(c => [c.key, t(c.labelKey)])) as Record<string, string>}
                  visible={visibleCols}
                  onChange={setVisibleCols}
                  trigger={
                    <Button variant="ghost" size="icon" className="h-7 w-7 ml-auto" data-tour="task-columns" title={t("planningTasks.showColumns", "Columns")}>
                      <Columns3 className="h-3.5 w-3.5" />
                    </Button>
                  }
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Room planning */}
      <div className="space-y-3" data-tour="room-table">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Home className="h-5 w-5 text-blue-500" />
            <div>
              <h3 className="text-base font-semibold">{t("planningRooms.title", "Room planning")}</h3>
              <p className="text-xs text-muted-foreground">
                {t("planningRooms.description", "Add rooms and dimensions to help estimate work")}
              </p>
            </div>
          </div>

          {rooms.length > 0 && (
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>
                {t("planningRooms.totalArea", "Total area")}: <strong>{totalArea > 0 ? `${totalArea.toFixed(1)} m²` : "–"}</strong>
              </span>
              {showRoom.wallArea && totalWallArea > 0 && (
                <span>
                  {t("rooms.wallArea")}: <strong>{totalWallArea.toFixed(1)} m²</strong>
                </span>
              )}
              <span className="text-muted-foreground/60">
                {roomsWithDimensions}/{rooms.length} {t("planningRooms.measured", "measured")}
              </span>
            </div>
          )}
        </div>
        <div>
          {rooms.length === 0 && !addingRoom ? (
            <div className="text-center py-8">
              <Home className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm font-medium text-muted-foreground">
                {t("planningRooms.empty", "No rooms yet")}
              </p>
              <p className="text-xs text-muted-foreground/70 mb-4">
                {t("planningRooms.emptyHint", "Add rooms to plan dimensions and estimate materials")}
              </p>
              <Button size="sm" onClick={() => setAddingRoom(true)}>
                <Plus className="h-4 w-4 mr-1" />
                {t("planningRooms.addFirst", "Add first room")}
              </Button>
            </div>
          ) : (
            <>
              <div className="rounded-lg border bg-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted border-b">
                    <th className="px-3 py-2.5 kicker text-left w-[180px]">{t("planningRooms.roomName", "Room")}</th>
                    {showRoom.width && <th className="px-3 py-2.5 kicker text-right w-[90px]">{t("rooms.width")}</th>}
                    {showRoom.depth && <th className="px-3 py-2.5 kicker text-right w-[90px]">{t("rooms.depth")}</th>}
                    {showRoom.ceilingHeight && <th className="px-3 py-2.5 kicker text-right w-[90px]">{t("rooms.ceilingHeight")}</th>}
                    <th className="px-3 py-2.5 kicker text-right w-[90px]">{t("rooms.area")}</th>
                    {showRoom.wallArea && <th className="px-3 py-2.5 kicker text-right w-[90px]">{t("rooms.wallArea")}</th>}
                    {showRoom.paintEstimate && (
                      <th className="px-3 py-2.5 kicker text-right w-[100px]">
                        <div className="flex items-center gap-1">
                          {t("rooms.paintEstimate")}
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <button className="text-muted-foreground/60 hover:text-foreground transition-colors">
                                      <Info className="h-3 w-3" />
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-72 p-3" align="start">
                                    <div className="space-y-3">
                                      <div>
                                        <p className="text-xs font-medium mb-1">{t("estimation.paintFormula", "Paint formula")}</p>
                                        <p className="text-xs text-muted-foreground">
                                          {t("estimation.paintFormulaDesc", "wall area / coverage × coats")}
                                        </p>
                                      </div>
                                      <div className="space-y-2 pt-1 border-t">
                                        <p className="text-xs font-medium">{t("estimation.adjustSettings", "Adjust defaults")}</p>
                                        <div className="grid grid-cols-2 gap-2">
                                          <div>
                                            <Label className="text-xs text-muted-foreground">{t("estimation.coverage", "Coverage (m²/L)")}</Label>
                                            <Input
                                              type="number"
                                              step="0.5"
                                              min="1"
                                              className="h-7 text-sm mt-0.5"
                                              value={paintCoverage}
                                              onChange={(e) => setPaintCoverage(Number(e.target.value) || 10)}
                                            />
                                          </div>
                                          <div>
                                            <Label className="text-xs text-muted-foreground">{t("estimation.coats", "Coats")}</Label>
                                            <Input
                                              type="number"
                                              step="1"
                                              min="1"
                                              max="5"
                                              className="h-7 text-sm mt-0.5"
                                              value={paintCoats}
                                              onChange={(e) => setPaintCoats(Number(e.target.value) || 2)}
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                {t("estimation.clickToAdjust", "Click to adjust formula")}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </th>
                    )}
                    <th className="px-3 py-2.5 kicker w-[40px]" />
                  </tr>
                </thead>
                <tbody>
                  {rooms.map((room) => {
                    const recipe = guestRoomToRecipe(room);
                    const area = computeFloorAreaSqm(recipe);
                    const wallArea = computeWallAreaSqm(recipe);
                    const paintLiters = computeGuestPaintLiters(room, paintCoverage, paintCoats);

                    const renderRoomCell = (field: string, displayValue: string, cls = "") => {
                      const isEditing = editingCell?.id === room.id && editingCell?.field === field;
                      if (isEditing) {
                        return (
                          <Input
                            autoFocus
                            type={field === "name" ? "text" : "number"}
                            className="h-7 w-full text-sm"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveRoomEdit(room.id, field, editValue);
                              if (e.key === "Escape") setEditingCell(null);
                            }}
                            onBlur={() => saveRoomEdit(room.id, field, editValue)}
                          />
                        );
                      }
                      return (
                        <button
                          className={`text-sm text-left w-full rounded px-1 -mx-1 hover:bg-muted cursor-text transition-colors ${cls}`}
                          onClick={() => {
                            setEditingCell({ id: room.id, field });
                            setEditValue(displayValue === "–" ? "" : displayValue);
                          }}
                        >
                          {displayValue || <span className="text-muted-foreground">–</span>}
                        </button>
                      );
                    };

                    return (
                      <tr key={room.id} className="group border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-2.5">
                          {renderRoomCell("name", room.name, "font-medium")}
                        </td>
                        {showRoom.width && (
                          <td className="px-3 py-2.5">
                            {renderRoomCell("width", formatMm(room.width_mm), "tabular-nums")}
                          </td>
                        )}
                        {showRoom.depth && (
                          <td className="px-3 py-2.5">
                            {renderRoomCell("depth", formatMm(room.height_mm), "tabular-nums")}
                          </td>
                        )}
                        {showRoom.ceilingHeight && (
                          <td className="px-3 py-2.5">
                            {renderRoomCell("ceilingHeight", formatMm(room.ceiling_height_mm), "tabular-nums")}
                          </td>
                        )}
                        <td className="px-3 py-2.5">
                          {renderRoomCell("area", area !== null ? area.toFixed(1) : "", "tabular-nums")}
                        </td>
                        {showRoom.wallArea && (
                          <td className="px-3 py-2.5">
                            <span className="text-sm tabular-nums text-muted-foreground">
                              {wallArea !== null ? `${wallArea.toFixed(1)} m²` : "–"}
                            </span>
                          </td>
                        )}
                        {showRoom.paintEstimate && (
                          <td className="px-3 py-2.5">
                            <span className="text-sm tabular-nums text-muted-foreground">
                              {paintLiters !== null ? `~${paintLiters} L` : "–"}
                            </span>
                          </td>
                        )}
                        <td className="px-3 py-2.5 w-[40px]">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                            onClick={() => handleDeleteRoom(room.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {addingRoom && (
                    <tr>
                      <td colSpan={roomColCount} className="px-3 py-2.5">
                        <form
                          className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
                          onSubmit={(e) => { e.preventDefault(); handleAddRoom(); }}
                        >
                          <Input
                            autoFocus
                            placeholder={t("rooms.roomNamePlaceholder", "e.g. Kitchen")}
                            className="h-7 text-sm flex-1 sm:max-w-[240px]"
                            value={newRoomName}
                            onChange={(e) => setNewRoomName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") { setAddingRoom(false); setNewRoomName(""); }
                            }}
                          />
                          <Button type="submit" size="sm" variant="ghost" className="h-7 text-xs" disabled={!newRoomName.trim()}>
                            {t("common.add", "Add")}
                          </Button>
                          <Button type="button" size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground"
                            onClick={() => { setAddingRoom(false); setNewRoomName(""); }}>
                            {t("common.cancel")}
                          </Button>
                        </form>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>

              <div className="flex items-center gap-2 mt-2 pt-2 border-t">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setAddingRoom(true)} data-tour="add-room">
                  <Plus className="h-3.5 w-3.5" />
                  {t("planningRooms.addRoom", "Add room")}
                </Button>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 ml-auto" title={t("planningTasks.showColumns", "Columns")}>
                      <Columns3 className="h-3.5 w-3.5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-2" align="end">
                    {ROOM_COLUMNS.map((col) => (
                      <label
                        key={col.key}
                        className="flex items-center gap-2 py-1 px-1 rounded hover:bg-muted cursor-pointer text-sm"
                      >
                        <Checkbox
                          checked={visibleRoomCols.has(col.key)}
                          onCheckedChange={() => toggleRoomColumn(col.key)}
                        />
                        {t(col.labelKey)}
                      </label>
                    ))}
                  </PopoverContent>
                </Popover>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Soft sign-up nudge */}
      <div className="flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-muted/50 text-sm text-muted-foreground" data-tour="signup-nudge">
        <Cloud className="h-4 w-4 shrink-0" />
        <span>{t("guest.signUpNudge", "Create a free account to save your project, get estimates, and invite collaborators.")}</span>
        <Button variant="link" size="sm" className="shrink-0 h-auto p-0 text-sm" onClick={() => window.location.href = "/auth"}>
          {t("guest.signUpLink", "Sign up")}
        </Button>
      </div>

      {/* Planning tour for first-time guests */}
      <PlanningTour />

      {/* Task estimate sheet */}
      {selectedTaskId && (
        <GuestTaskEstimateSheet
          task={tasks.find((t) => t.id === selectedTaskId)!}
          room={(() => {
            const task = tasks.find((t) => t.id === selectedTaskId);
            return task?.room_id ? rooms.find((r) => r.id === task.room_id) ?? null : null;
          })()}
          open={!!selectedTaskId}
          onOpenChange={(open) => { if (!open) setSelectedTaskId(null); }}
        />
      )}
      {/* Guest login prompt */}
      <GuestLoginPrompt
        open={showLoginPrompt}
        onOpenChange={setShowLoginPrompt}
        action="activate"
        projectId={projectId}
      />
    </>
  );
}

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LANGUAGES = [
  { code: "sv", name: "Svenska", flag: "\u{1F1F8}\u{1F1EA}" },
  { code: "en", name: "English", flag: "\u{1F1EC}\u{1F1E7}" },
  { code: "uk", name: "\u0423\u043A\u0440\u0430\u0457\u043D\u0441\u044C\u043A\u0430", flag: "\u{1F1FA}\u{1F1E6}" },
  { code: "pl", name: "Polski", flag: "\u{1F1F5}\u{1F1F1}" },
  { code: "ro", name: "Rom\u00E2n\u0103", flag: "\u{1F1F7}\u{1F1F4}" },
  { code: "lt", name: "Lietuvi\u0173", flag: "\u{1F1F1}\u{1F1F9}" },
  { code: "et", name: "Eesti", flag: "\u{1F1EA}\u{1F1EA}" },
  { code: "de", name: "Deutsch", flag: "\u{1F1E9}\u{1F1EA}" },
  { code: "fr", name: "Fran\u00E7ais", flag: "\u{1F1EB}\u{1F1F7}" },
  { code: "es", name: "Espa\u00F1ol", flag: "\u{1F1EA}\u{1F1F8}" },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

export interface TaskOption {
  id: string;
  title: string;
  description: string | null;
  roomId: string | null;
  roomIds: string[];
  roomName: string | null;
  checklists: Checklist[];
}

export interface TaskOverride {
  taskId: string;
  descriptionOverride: string | null;
  checklistOverride: Array<{ checklistId: string; itemId: string }> | null; // null = all items
  photoOverride: string[] | null; // array of photo IDs to include, null = all
}

export interface WorkerInviteData {
  phone: string;
  email: string;
  language: string;
  welcomeMessage: string;
  selectedTaskIds: string[];
  taskOverrides: Map<string, TaskOverride>;
}

// ---------------------------------------------------------------------------
// Hook: load project tasks (lifted for shared use by fields + preview)
// ---------------------------------------------------------------------------

export function useWorkerTasks(projectId: string) {
  const [tasks, setTasks] = useState<TaskOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const { data: taskRows } = await supabase
          .from("tasks")
          .select("id, title, description, room_id, room_ids, checklists")
          .eq("project_id", projectId)
          .order("created_at", { ascending: true });

        if (cancelled) return;
        if (!taskRows) {
          setTasks([]);
          return;
        }

        const roomIds = [...new Set(taskRows.map((t) => t.room_id).filter(Boolean))] as string[];
        const roomMap: Record<string, string> = {};
        if (roomIds.length > 0) {
          const { data: rooms } = await supabase.from("rooms").select("id, name").in("id", roomIds);
          if (cancelled) return;
          for (const r of rooms || []) roomMap[r.id] = r.name;
        }

        setTasks(
          taskRows.map((t) => ({
            id: t.id,
            title: t.title,
            description: t.description,
            roomId: t.room_id,
            roomIds: (t.room_ids && (t.room_ids as string[]).length > 0) ? t.room_ids as string[] : t.room_id ? [t.room_id] : [],
            roomName: t.room_id ? roomMap[t.room_id] || null : null,
            checklists: Array.isArray(t.checklists) ? (t.checklists as Checklist[]) : [],
          }))
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [projectId]);

  return { tasks, loading };
}

// ---------------------------------------------------------------------------
// Helper: checklist override logic
// ---------------------------------------------------------------------------

export function getOverride(data: WorkerInviteData, taskId: string): TaskOverride {
  return data.taskOverrides.get(taskId) || {
    taskId,
    descriptionOverride: null,
    checklistOverride: null,
    photoOverride: null,
  };
}

export function isChecklistItemIncluded(
  data: WorkerInviteData,
  taskId: string,
  checklistId: string,
  itemId: string
): boolean {
  const override = data.taskOverrides.get(taskId);
  if (!override?.checklistOverride) return true;
  return override.checklistOverride.some((o) => o.checklistId === checklistId && o.itemId === itemId);
}

export function toggleChecklistItem(
  data: WorkerInviteData,
  task: TaskOption,
  checklistId: string,
  itemId: string,
  onChange: (updates: Partial<WorkerInviteData>) => void
) {
  const override = getOverride(data, task.id);
  const allItems = task.checklists.flatMap((cl) =>
    cl.items.map((item) => ({ checklistId: cl.id, itemId: item.id }))
  );

  const newOverrides = new Map(data.taskOverrides);

  if (!override.checklistOverride) {
    const filtered = allItems.filter((i) => !(i.checklistId === checklistId && i.itemId === itemId));
    newOverrides.set(task.id, { ...override, checklistOverride: filtered });
  } else {
    const exists = override.checklistOverride.some((o) => o.checklistId === checklistId && o.itemId === itemId);
    if (exists) {
      const filtered = override.checklistOverride.filter((o) => !(o.checklistId === checklistId && o.itemId === itemId));
      newOverrides.set(task.id, { ...override, checklistOverride: filtered });
    } else {
      newOverrides.set(task.id, { ...override, checklistOverride: [...override.checklistOverride, { checklistId, itemId }] });
    }
  }

  onChange({ taskOverrides: newOverrides });
}

export function setOverrideField(
  data: WorkerInviteData,
  taskId: string,
  updates: Partial<TaskOverride>,
  onChange: (updates: Partial<WorkerInviteData>) => void
) {
  const current = getOverride(data, taskId);
  const newOverrides = new Map(data.taskOverrides);
  newOverrides.set(taskId, { ...current, ...updates });
  onChange({ taskOverrides: newOverrides });
}

// ---------------------------------------------------------------------------
// Contact Fields (left column)
// ---------------------------------------------------------------------------

interface WorkerContactFieldsProps {
  data: WorkerInviteData;
  onChange: (updates: Partial<WorkerInviteData>) => void;
}

export function WorkerContactFields({ data, onChange }: WorkerContactFieldsProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      {/* Phone + Email */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="worker-phone">{t("teamWorker.workerPhone", "Phone number")}</Label>
          <Input
            id="worker-phone"
            type="tel"
            value={data.phone}
            onChange={(e) => onChange({ phone: e.target.value })}
            placeholder="+46 ..."
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="worker-email">{t("teamWorker.workerEmail", "Email")}</Label>
          <Input
            id="worker-email"
            type="email"
            value={data.email}
            onChange={(e) => onChange({ email: e.target.value })}
            placeholder="name@example.com"
          />
        </div>
      </div>

      {/* Language */}
      <div className="space-y-2">
        <Label>{t("teamWorker.workerLanguage", "Language")}</Label>
        <Select value={data.language} onValueChange={(v) => onChange({ language: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGES.map((lang) => (
              <SelectItem key={lang.code} value={lang.code}>
                {lang.flag} {lang.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Welcome message */}
      <div className="space-y-2">
        <Label htmlFor="welcome-msg">{t("teamWorker.welcomeMessage", "Welcome message")}</Label>
        <Textarea
          id="welcome-msg"
          value={data.welcomeMessage}
          onChange={(e) => onChange({ welcomeMessage: e.target.value })}
          placeholder={t("teamWorker.welcomeMessagePlaceholder", "Optional message shown when the worker opens the link...")}
          rows={3}
          className="resize-none"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task List (middle column)
// ---------------------------------------------------------------------------

interface WorkerTaskListProps {
  tasks: TaskOption[];
  data: WorkerInviteData;
  onChange: (updates: Partial<WorkerInviteData>) => void;
  previewTaskId: string | null;
  onPreviewTask: (taskId: string | null) => void;
}

export function WorkerTaskList({
  tasks,
  data,
  onChange,
  previewTaskId,
  onPreviewTask,
}: WorkerTaskListProps) {
  const { t } = useTranslation();

  const toggleTask = (taskId: string) => {
    const wasSelected = data.selectedTaskIds.includes(taskId);
    const newSelected = wasSelected
      ? data.selectedTaskIds.filter((id) => id !== taskId)
      : [...data.selectedTaskIds, taskId];

    if (wasSelected) {
      // Deselecting — remove override and close preview if this task was previewed
      const newOverrides = new Map(data.taskOverrides);
      newOverrides.delete(taskId);
      onChange({ selectedTaskIds: newSelected, taskOverrides: newOverrides });
      if (previewTaskId === taskId) onPreviewTask(null);
    } else {
      // Selecting — auto-open preview for this task
      onChange({ selectedTaskIds: newSelected });
      onPreviewTask(taskId);
    }
  };

  return (
    <div className="space-y-2">
      <Label>{t("teamWorker.assignTasks", "Assign tasks")} *</Label>
      <div className="border rounded-lg divide-y max-h-[400px] overflow-y-auto">
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground p-3">{t("tasks.noTasks", "No tasks")}</p>
        ) : (
          tasks.map((task) => {
            const isSelected = data.selectedTaskIds.includes(task.id);
            const isPreviewing = previewTaskId === task.id;
            const override = data.taskOverrides.get(task.id);
            const hasOverrides =
              (override?.descriptionOverride !== null && override?.descriptionOverride !== undefined) ||
              (override?.checklistOverride !== null && override?.checklistOverride !== undefined) ||
              (override?.photoOverride !== null && override?.photoOverride !== undefined);
            const totalChecklist = task.checklists.reduce((s, cl) => s + cl.items.length, 0);
            const includedCount = override?.checklistOverride
              ? override.checklistOverride.length
              : totalChecklist;

            return (
              <div
                key={task.id}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 transition-colors",
                  isPreviewing && "bg-primary/5 border-l-2 border-l-primary",
                  !isPreviewing && "hover:bg-muted/50"
                )}
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => toggleTask(task.id)}
                />
                <button
                  type="button"
                  className="flex-1 min-w-0 text-left"
                  onClick={() => {
                    if (isSelected) {
                      onPreviewTask(isPreviewing ? null : task.id);
                    }
                  }}
                  disabled={!isSelected}
                >
                  <div className="flex items-center gap-2">
                    <p className="text-sm truncate">{task.title}</p>
                    {hasOverrides && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary shrink-0">
                        {t("teamWorker.customized", "customized")}
                      </span>
                    )}
                  </div>
                  {task.roomName && (
                    <p className="text-xs text-muted-foreground truncate">{task.roomName}</p>
                  )}
                </button>
                {isSelected && (
                  <div className="flex items-center gap-1 shrink-0 text-muted-foreground">
                    {totalChecklist > 0 && (
                      <span className="text-[10px] tabular-nums">{includedCount}/{totalChecklist}</span>
                    )}
                    <ChevronRight
                      className={cn(
                        "h-3.5 w-3.5 transition-transform",
                        isPreviewing && "rotate-90 text-primary"
                      )}
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      {data.selectedTaskIds.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("teamWorker.tasksAssigned", "{{count}} tasks", { count: data.selectedTaskIds.length })}
        </p>
      )}
    </div>
  );
}

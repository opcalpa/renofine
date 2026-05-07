import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Check, ChevronDown, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
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

interface TaskOption {
  id: string;
  title: string;
  description: string | null;
  roomName: string | null;
  checklists: Checklist[];
}

export interface TaskOverride {
  taskId: string;
  descriptionOverride: string | null;
  checklistOverride: Array<{ checklistId: string; itemId: string }> | null; // null = all items
}

export interface WorkerInviteData {
  phone: string;
  email: string;
  language: string;
  welcomeMessage: string;
  selectedTaskIds: string[];
  taskOverrides: Map<string, TaskOverride>;
}

interface WorkerInviteFieldsProps {
  projectId: string;
  data: WorkerInviteData;
  onChange: (updates: Partial<WorkerInviteData>) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WorkerInviteFields({ projectId, data, onChange }: WorkerInviteFieldsProps) {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<TaskOption[]>([]);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  // Load project tasks
  useEffect(() => {
    loadTasks();
  }, [projectId]);

  const loadTasks = async () => {
    const { data: taskRows } = await supabase
      .from("tasks")
      .select("id, title, description, room_id, checklists")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    if (!taskRows) return;

    const roomIds = [...new Set(taskRows.map((t) => t.room_id).filter(Boolean))] as string[];
    const roomMap: Record<string, string> = {};
    if (roomIds.length > 0) {
      const { data: rooms } = await supabase.from("rooms").select("id, name").in("id", roomIds);
      for (const r of rooms || []) roomMap[r.id] = r.name;
    }

    setTasks(
      taskRows.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        roomName: t.room_id ? roomMap[t.room_id] || null : null,
        checklists: Array.isArray(t.checklists) ? (t.checklists as Checklist[]) : [],
      }))
    );
  };

  const toggleTask = (taskId: string) => {
    const newSelected = data.selectedTaskIds.includes(taskId)
      ? data.selectedTaskIds.filter((id) => id !== taskId)
      : [...data.selectedTaskIds, taskId];

    // Remove override if task is deselected
    if (!newSelected.includes(taskId)) {
      const newOverrides = new Map(data.taskOverrides);
      newOverrides.delete(taskId);
      onChange({ selectedTaskIds: newSelected, taskOverrides: newOverrides });
    } else {
      onChange({ selectedTaskIds: newSelected });
    }
  };

  const getOverride = (taskId: string): TaskOverride => {
    return data.taskOverrides.get(taskId) || {
      taskId,
      descriptionOverride: null,
      checklistOverride: null,
    };
  };

  const setOverride = (taskId: string, updates: Partial<TaskOverride>) => {
    const current = getOverride(taskId);
    const newOverrides = new Map(data.taskOverrides);
    newOverrides.set(taskId, { ...current, ...updates });
    onChange({ taskOverrides: newOverrides });
  };

  const isChecklistItemIncluded = (taskId: string, checklistId: string, itemId: string): boolean => {
    const override = data.taskOverrides.get(taskId);
    if (!override?.checklistOverride) return true; // all included by default
    return override.checklistOverride.some((o) => o.checklistId === checklistId && o.itemId === itemId);
  };

  const toggleChecklistItem = (task: TaskOption, checklistId: string, itemId: string) => {
    const override = getOverride(task.id);
    const allItems = task.checklists.flatMap((cl) =>
      cl.items.map((item) => ({ checklistId: cl.id, itemId: item.id }))
    );

    if (!override.checklistOverride) {
      // Currently "all" — switch to "all minus this one"
      const filtered = allItems.filter((i) => !(i.checklistId === checklistId && i.itemId === itemId));
      setOverride(task.id, { checklistOverride: filtered });
    } else {
      const exists = override.checklistOverride.some((o) => o.checklistId === checklistId && o.itemId === itemId);
      if (exists) {
        // Remove item
        const filtered = override.checklistOverride.filter((o) => !(o.checklistId === checklistId && o.itemId === itemId));
        // If all removed, keep empty array (not null, which means "all")
        setOverride(task.id, { checklistOverride: filtered });
      } else {
        // Add item back
        setOverride(task.id, { checklistOverride: [...override.checklistOverride, { checklistId, itemId }] });
      }
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Left column: contact + settings */}
      <div className="space-y-4">
        {/* Phone + Email side by side */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="worker-phone">{t("teamWorker.workerPhone", "Phone number")}</Label>
            <Input
              id="worker-phone"
              type="tel"
              value={data.phone}
              onChange={(e) => onChange({ phone: e.target.value })}
              placeholder="+380 ..."
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

      {/* Right column: task selection */}
      <div className="space-y-2">
        <Label>{t("teamWorker.assignTasks", "Assign tasks")} *</Label>
        <div className="border rounded-lg divide-y max-h-[400px] overflow-y-auto">
          {tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground p-3">{t("tasks.noTasks", "No tasks")}</p>
          ) : (
            tasks.map((task) => {
              const isSelected = data.selectedTaskIds.includes(task.id);
              const isExpanded = expandedTaskId === task.id && isSelected;
              const override = getOverride(task.id);
              const hasOverrides = override.descriptionOverride !== null || override.checklistOverride !== null;
              const totalChecklist = task.checklists.reduce((s, cl) => s + cl.items.length, 0);
              const includedCount = override.checklistOverride
                ? override.checklistOverride.length
                : totalChecklist;

              return (
                <div key={task.id}>
                  {/* Task row */}
                  <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleTask(task.id)}
                    />
                    <button
                      type="button"
                      className="flex-1 min-w-0 text-left"
                      onClick={() => {
                        if (isSelected) setExpandedTaskId(isExpanded ? null : task.id);
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
                        {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </div>
                    )}
                  </div>

                  {/* Expanded: description override + checklist selection */}
                  {isExpanded && (
                    <div className="px-4 pb-3 pt-1 ml-9 space-y-3 bg-muted/20">
                      {/* Description */}
                      <DescriptionOverride
                        original={task.description}
                        override={override.descriptionOverride}
                        onChange={(v) => setOverride(task.id, { descriptionOverride: v })}
                      />

                      {/* Checklist items */}
                      {task.checklists.map((cl) => (
                        <div key={cl.id} className="space-y-1">
                          {cl.title && (
                            <p className="text-xs font-medium text-muted-foreground">{cl.title}</p>
                          )}
                          {cl.items.map((item) => (
                            <label
                              key={item.id}
                              className="flex items-center gap-2 text-sm py-0.5 cursor-pointer"
                            >
                              <Checkbox
                                checked={isChecklistItemIncluded(task.id, cl.id, item.id)}
                                onCheckedChange={() => toggleChecklistItem(task, cl.id, item.id)}
                              />
                              <span className={cn(
                                "text-xs",
                                !isChecklistItemIncluded(task.id, cl.id, item.id) && "line-through text-muted-foreground"
                              )}>
                                {item.title}
                              </span>
                            </label>
                          ))}
                        </div>
                      ))}
                      {totalChecklist === 0 && (
                        <p className="text-xs text-muted-foreground italic">
                          {t("teamWorker.noChecklist", "No checklist — add one to the task first")}
                        </p>
                      )}
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Description override sub-component
// ---------------------------------------------------------------------------

function DescriptionOverride({
  original,
  override,
  onChange,
}: {
  original: string | null;
  override: string | null;
  onChange: (v: string | null) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const displayText = override ?? original ?? "";
  const isOverridden = override !== null;

  if (editing) {
    return (
      <div className="space-y-1">
        <Label className="text-xs">{t("teamWorker.descriptionLabel", "Description")}</Label>
        <Textarea
          value={override ?? original ?? ""}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className="text-xs resize-none"
          autoFocus
        />
        <div className="flex gap-1">
          <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditing(false)}>
            <Check className="h-3 w-3 mr-1" /> {t("common.done", "Done")}
          </Button>
          {isOverridden && (
            <Button type="button" size="sm" variant="ghost" className="h-6 text-xs text-muted-foreground" onClick={() => { onChange(null); setEditing(false); }}>
              {t("common.reset", "Reset")}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <Label className="text-xs">{t("teamWorker.descriptionLabel", "Description")}</Label>
        <Button type="button" size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => setEditing(true)}>
          <Pencil className="h-3 w-3" />
        </Button>
        {isOverridden && (
          <span className="text-[10px] text-primary">{t("teamWorker.overridden", "overridden")}</span>
        )}
      </div>
      {displayText ? (
        <p className="text-xs text-muted-foreground line-clamp-2">{displayText}</p>
      ) : (
        <p className="text-xs text-muted-foreground italic">{t("teamWorker.noDescription", "No description")}</p>
      )}
    </div>
  );
}

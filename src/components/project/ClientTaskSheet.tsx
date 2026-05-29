// ---------------------------------------------------------------------------
// ClientTaskSheet — read-only task detail for homeowners / clients
// Shows only what's relevant: title, description, status, room, dates, photos, comments.
// No pricing, hours, margins, or edit capabilities.
// ---------------------------------------------------------------------------

import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Calendar, MapPin, Clock, CheckSquare, Image as ImageIcon } from "lucide-react";
import { getStatusBadgeColor } from "@/lib/statusColors";
import { CommentsSection } from "@/components/comments/CommentsSection";
import { EntityPhotoGallery } from "@/components/shared/EntityPhotoGallery";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClientTask {
  id: string;
  title: string;
  description: string | null;
  status: string;
  progress: number;
  start_date: string | null;
  due_date: string | null;
  room_name: string | null;
  checklists: ChecklistData[] | null;
}

interface ChecklistData {
  id: string;
  title: string;
  items: { id: string; title: string; completed: boolean }[];
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ClientTaskSheetProps {
  taskId: string | null;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const statusKey = (s: string) => {
  const map: Record<string, string> = {
    to_do: "toDo", in_progress: "inProgress", on_hold: "onHold",
    awaiting_review: "awaitingReview",
  };
  return map[s] || s;
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("sv-SE");
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ClientTaskSheet({ taskId, projectId, open, onOpenChange }: ClientTaskSheetProps) {
  const { t } = useTranslation();
  const [task, setTask] = useState<ClientTask | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchTask = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    const { data } = await supabase
      .from("tasks")
      .select("id, title, description, status, progress, start_date, due_date, checklists, room_id")
      .eq("id", taskId)
      .single();

    if (data) {
      let roomName: string | null = null;
      if (data.room_id) {
        const { data: room } = await supabase
          .from("rooms")
          .select("name")
          .eq("id", data.room_id)
          .single();
        roomName = room?.name ?? null;
      }
      setTask({
        id: data.id,
        title: data.title,
        description: data.description,
        status: data.status,
        progress: data.progress ?? 0,
        start_date: data.start_date,
        due_date: data.due_date,
        room_name: roomName,
        checklists: data.checklists as ChecklistData[] | null,
      });
    }
    setLoading(false);
  }, [taskId]);

  useEffect(() => {
    if (open && taskId) fetchTask();
    if (!open) setTask(null);
  }, [open, taskId, fetchTask]);

  // Flatten checklists for progress display
  const allItems = (task?.checklists ?? []).flatMap((cl) => cl.items ?? []);
  const completedItems = allItems.filter((i) => i.completed);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md w-full overflow-y-auto p-0" aria-describedby={undefined}>
        {loading && (
          <div className="flex items-center justify-center h-32">
            <SheetTitle className="sr-only">{t("common.loading", "Loading...")}</SheetTitle>
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
          </div>
        )}

        {!task && !loading && (
          <SheetTitle className="sr-only">{t("tasks.task", "Task")}</SheetTitle>
        )}

        {task && !loading && (
          <div className="flex flex-col h-full">
            {/* Header */}
            <SheetHeader className="px-5 pt-5 pb-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <SheetTitle className="text-base leading-snug pr-2">{task.title}</SheetTitle>
                <Badge className={`shrink-0 text-xs ${getStatusBadgeColor(task.status)}`}>
                  {t(`statuses.${statusKey(task.status)}`, task.status)}
                </Badge>
              </div>

              {/* Progress */}
              {task.progress > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{t("tasks.progress", "Progress")}</span>
                    <span className="tabular-nums">{task.progress}%</span>
                  </div>
                  <Progress value={task.progress} className="h-1.5" />
                </div>
              )}
            </SheetHeader>

            <Separator />

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {/* Description */}
              {task.description && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">{t("tasks.description", "Description")}</p>
                  <p className="text-sm whitespace-pre-wrap">{task.description}</p>
                </div>
              )}

              {/* Meta: room + dates */}
              <div className="grid grid-cols-2 gap-3">
                {task.room_name && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span>{task.room_name}</span>
                  </div>
                )}
                {task.start_date && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span>{formatDate(task.start_date)}</span>
                  </div>
                )}
                {task.due_date && (
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span>{formatDate(task.due_date)}</span>
                  </div>
                )}
              </div>

              {/* Checklists */}
              {allItems.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckSquare className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-xs font-medium text-muted-foreground">
                      {t("tasks.checklist", "Checklist")} · {completedItems.length}/{allItems.length}
                    </p>
                  </div>
                  <div className="space-y-1">
                    {(task.checklists ?? []).map((cl) => (
                      <div key={cl.id} className="space-y-0.5">
                        {cl.title && <p className="text-xs font-medium">{cl.title}</p>}
                        {(cl.items ?? []).map((item) => (
                          <div key={item.id} className="flex items-center gap-2 text-sm pl-1">
                            <div className={`h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 ${item.completed ? "bg-emerald-100 border-emerald-300" : "border-muted-foreground/30"}`}>
                              {item.completed && <span className="text-emerald-600 text-[10px]">✓</span>}
                            </div>
                            <span className={item.completed ? "text-muted-foreground line-through" : ""}>{item.title}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Photos */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs font-medium text-muted-foreground">{t("tasks.photos", "Photos")}</p>
                </div>
                <EntityPhotoGallery
                  entityId={task.id}
                  entityType="task"
                  projectId={projectId}
                />
              </div>

              <Separator />

              {/* Comments */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">{t("comments.title", "Comments")}</p>
                <CommentsSection
                  entityId={task.id}
                  entityType="task"
                  projectId={projectId}
                />
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

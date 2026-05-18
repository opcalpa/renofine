import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { TaskRoomDetails } from "@/components/shared/TaskRoomDetails";
import {
  CheckSquare,
  Pencil,
  Check,
  Eye,
  HardHat,
  Camera,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TaskOverride } from "./WorkerInviteFields";

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

interface PreviewTask {
  id: string;
  title: string;
  description: string | null;
  roomId: string | null;
  roomIds: string[];
  roomName: string | null;
  checklists: Checklist[];
}

interface BeforePhoto {
  id: string;
  url: string;
  caption: string | null;
  origin: "task" | "room";
}

interface WorkerInvitePreviewProps {
  task: PreviewTask;
  override: TaskOverride;
  onOverrideChange: (updates: Partial<TaskOverride>) => void;
  onChecklistToggle: (checklistId: string, itemId: string) => void;
  isChecklistItemIncluded: (checklistId: string, itemId: string) => boolean;
  /** Navigation between selected tasks */
  currentIndex?: number;
  totalCount?: number;
  onNavigate?: (direction: "prev" | "next") => void;
  /** Rendered directly under the task title — used for the instruction-image section. */
  headerSlot?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WorkerInvitePreview({
  task,
  override,
  onOverrideChange,
  onChecklistToggle,
  isChecklistItemIncluded,
  currentIndex,
  totalCount,
  onNavigate,
  headerSlot,
}: WorkerInvitePreviewProps) {
  const { t } = useTranslation();
  const [editingDesc, setEditingDesc] = useState(false);
  const [beforePhotos, setBeforePhotos] = useState<BeforePhoto[]>([]);

  // Resolve before-photos when the task changes: task-linked first, then
  // room-linked fallback (mirrors the worker-facing get-worker-data logic).
  useEffect(() => {
    let cancelled = false;
    const fetchBeforePhotos = async () => {
      const resolved: BeforePhoto[] = [];
      const seenIds = new Set<string>();

      const { data: taskPhotos } = await supabase
        .from("photos")
        .select("id, url, caption")
        .eq("linked_to_type", "task")
        .eq("linked_to_id", task.id)
        .eq("source", "before")
        .order("created_at", { ascending: true });

      for (const p of taskPhotos || []) {
        resolved.push({ id: p.id, url: p.url, caption: p.caption, origin: "task" });
        seenIds.add(p.id);
      }

      if (task.roomIds.length > 0) {
        const { data: roomPhotos } = await supabase
          .from("photos")
          .select("id, url, caption")
          .eq("linked_to_type", "room")
          .eq("source", "before")
          .in("linked_to_id", task.roomIds)
          .order("created_at", { ascending: true });

        for (const p of roomPhotos || []) {
          if (!seenIds.has(p.id)) {
            resolved.push({ id: p.id, url: p.url, caption: p.caption, origin: "room" });
          }
        }
      }

      if (!cancelled) setBeforePhotos(resolved);
    };
    setBeforePhotos([]);
    fetchBeforePhotos();
    return () => { cancelled = true; };
  }, [task.id, task.roomIds]);

  // null override = all photos included; an array = only those IDs.
  const isPhotoIncluded = (photoId: string): boolean => {
    if (!override.photoOverride) return true;
    return override.photoOverride.includes(photoId);
  };

  const togglePhoto = (photoId: string) => {
    if (!override.photoOverride) {
      // Currently "all" → switch to "all minus this one"
      const allIds = beforePhotos.map((p) => p.id);
      onOverrideChange({ photoOverride: allIds.filter((id) => id !== photoId) });
    } else {
      const exists = override.photoOverride.includes(photoId);
      if (exists) {
        onOverrideChange({ photoOverride: override.photoOverride.filter((id) => id !== photoId) });
      } else {
        onOverrideChange({ photoOverride: [...override.photoOverride, photoId] });
      }
    }
  };

  const displayDescription = override.descriptionOverride ?? task.description ?? "";
  const isOverridden = override.descriptionOverride !== null;
  const includedItems = task.checklists.flatMap((cl) =>
    cl.items.filter((item) => isChecklistItemIncluded(cl.id, item.id))
  );
  const totalItems = task.checklists.reduce((s, cl) => s + cl.items.length, 0);
  const includedPhotos = beforePhotos.filter((p) => isPhotoIncluded(p.id));

  return (
    <div className="flex flex-col h-full">
      {/* Header with navigation */}
      <div className="flex items-center gap-2 pb-3 border-b mb-3">
        <Eye className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex-1">
          {t("teamWorker.preview", "Worker preview")}
        </span>
        {totalCount != null && totalCount > 1 && onNavigate && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onNavigate("prev")}
              className="h-6 w-6 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-xs tabular-nums text-muted-foreground">
              {(currentIndex ?? 0) + 1}/{totalCount}
            </span>
            <button
              type="button"
              onClick={() => onNavigate("next")}
              className="h-6 w-6 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto -mr-2 pr-2 space-y-0">
        {/* Card shell — mimics WorkerTaskCard */}
        <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
          {/* Task header */}
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold leading-snug">{task.title}</h3>
              <Badge variant="outline" className="shrink-0 text-xs">
                {t("statuses.toDo", "To do")}
              </Badge>
            </div>
          </div>

          {/* Instruction images — surfaced directly under the title so it's
              discoverable without scrolling past the description. */}
          {headerSlot && <div className="px-4 pb-3">{headerSlot}</div>}

          {/* Room details (all linked rooms) */}
          {task.roomIds.length > 0 && (
            <div className="px-4 pb-3">
              <TaskRoomDetails roomIds={task.roomIds} compact />
            </div>
          )}

          {/* Before-photos — auto-included; tap any to exclude it from
              what this worker sees (per-invite, scoped to this task/room). */}
          {beforePhotos.length > 0 && (
            <div className="px-4 pb-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Camera className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">
                    {t("teamWorker.beforePhotos", "Before photos")}
                  </span>
                </div>
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {includedPhotos.length}/{beforePhotos.length}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {beforePhotos.map((photo) => {
                  const included = isPhotoIncluded(photo.id);
                  return (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={() => togglePhoto(photo.id)}
                      className={cn(
                        "relative aspect-square rounded-lg overflow-hidden bg-muted transition-all",
                        !included && "opacity-40 ring-1 ring-inset ring-muted-foreground/20"
                      )}
                    >
                      <img
                        src={photo.url}
                        alt={photo.caption || ""}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      <div className={cn(
                        "absolute top-1 left-1 h-5 w-5 rounded-full flex items-center justify-center text-[10px]",
                        included
                          ? "bg-primary text-primary-foreground"
                          : "bg-background/80 text-muted-foreground border"
                      )}>
                        {included ? <Check className="h-3 w-3" /> : null}
                      </div>
                      {photo.origin === "room" && (
                        <div className="absolute bottom-1 right-1 bg-background/80 text-[9px] px-1 rounded text-muted-foreground">
                          {t("teamWorker.fromRoom", "room")}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              {override.photoOverride !== null && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs text-muted-foreground"
                  onClick={() => onOverrideChange({ photoOverride: null })}
                >
                  {t("common.reset", "Reset")}
                </Button>
              )}
            </div>
          )}

          {/* Description — editable */}
          <div className="px-4 pb-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Label className="text-xs text-muted-foreground">
                {t("teamWorker.descriptionLabel", "Description")}
              </Label>
              {!editingDesc && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-5 w-5 p-0"
                  onClick={() => setEditingDesc(true)}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              )}
              {isOverridden && !editingDesc && (
                <span className="text-[10px] text-primary">
                  {t("teamWorker.overridden", "overridden")}
                </span>
              )}
            </div>

            {editingDesc ? (
              <div className="space-y-1.5">
                <Textarea
                  value={override.descriptionOverride ?? task.description ?? ""}
                  onChange={(e) =>
                    onOverrideChange({ descriptionOverride: e.target.value })
                  }
                  rows={3}
                  className="text-sm resize-none"
                  autoFocus
                />
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs"
                    onClick={() => setEditingDesc(false)}
                  >
                    <Check className="h-3 w-3 mr-1" /> {t("common.done", "Done")}
                  </Button>
                  {isOverridden && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs text-muted-foreground"
                      onClick={() => {
                        onOverrideChange({ descriptionOverride: null });
                        setEditingDesc(false);
                      }}
                    >
                      {t("common.reset", "Reset")}
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm whitespace-pre-wrap text-foreground/90">
                {displayDescription || (
                  <span className="italic text-muted-foreground">
                    {t("teamWorker.noDescription", "No description")}
                  </span>
                )}
              </p>
            )}
          </div>

          {/* Checklist — toggleable inclusion */}
          {totalItems > 0 && (
            <div className="px-4 pb-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckSquare className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">
                    {t("worker.checklist", "Checklist")}
                  </span>
                </div>
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {includedItems.length}/{totalItems}
                </span>
              </div>
              {task.checklists.map((cl) => (
                <div key={cl.id} className="space-y-1">
                  {cl.title && (
                    <p className="text-xs font-medium pl-1">{cl.title}</p>
                  )}
                  {cl.items.map((item) => {
                    const included = isChecklistItemIncluded(cl.id, item.id);
                    return (
                      <label
                        key={item.id}
                        className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors cursor-pointer hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={included}
                          onCheckedChange={() => onChecklistToggle(cl.id, item.id)}
                          className="h-4 w-4"
                        />
                        <span
                          className={cn(
                            "text-sm flex-1",
                            !included && "line-through text-muted-foreground"
                          )}
                        >
                          {item.title}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

export function WorkerPreviewEmpty() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 pb-3 border-b mb-3">
        <Eye className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {t("teamWorker.preview", "Worker preview")}
        </span>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
        <HardHat className="h-10 w-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">
          {t("teamWorker.previewHint", "Select a task to preview what the worker will see")}
        </p>
      </div>
    </div>
  );
}

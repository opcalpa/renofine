import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ColorSwatchRow } from "@/components/worker/ColorSwatchRow";
import { RoomSpecsSummary } from "@/components/worker/RoomSpecsSummary";
import {
  MapPin,
  Ruler,
  CheckSquare,
  ImageIcon,
  Pencil,
  Check,
  Eye,
  HardHat,
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

interface RoomData {
  name: string;
  wallSpec: Record<string, unknown> | null;
  floorSpec: Record<string, unknown> | null;
  ceilingSpec: Record<string, unknown> | null;
  joinerySpec: Record<string, unknown> | null;
  dimensions: { area_sqm?: number; ceiling_height_mm?: number } | null;
  ceilingHeightMm: number | null;
}

interface Photo {
  id: string;
  url: string;
  caption: string | null;
}

interface PreviewTask {
  id: string;
  title: string;
  description: string | null;
  roomId: string | null;
  roomName: string | null;
  checklists: Checklist[];
}

interface WorkerInvitePreviewProps {
  task: PreviewTask;
  override: TaskOverride;
  onOverrideChange: (updates: Partial<TaskOverride>) => void;
  onChecklistToggle: (checklistId: string, itemId: string) => void;
  isChecklistItemIncluded: (checklistId: string, itemId: string) => boolean;
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
}: WorkerInvitePreviewProps) {
  const { t } = useTranslation();
  const [room, setRoom] = useState<RoomData | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [editingDesc, setEditingDesc] = useState(false);

  // Fetch room data + photos when task changes
  useEffect(() => {
    setRoom(null);
    setPhotos([]);

    if (task.roomId) {
      fetchRoomData(task.roomId);
      fetchPhotos(task.roomId, task.id);
    } else {
      fetchPhotos(null, task.id);
    }
  }, [task.id, task.roomId]);

  const fetchRoomData = async (roomId: string) => {
    const { data } = await supabase
      .from("rooms")
      .select("name, wall_spec, floor_spec, ceiling_spec, joinery_spec, dimensions, ceiling_height_mm")
      .eq("id", roomId)
      .single();

    if (data) {
      setRoom({
        name: data.name,
        wallSpec: data.wall_spec as RoomData["wallSpec"],
        floorSpec: data.floor_spec as RoomData["floorSpec"],
        ceilingSpec: data.ceiling_spec as RoomData["ceilingSpec"],
        joinerySpec: data.joinery_spec as RoomData["joinerySpec"],
        dimensions: data.dimensions as RoomData["dimensions"],
        ceilingHeightMm: data.ceiling_height_mm,
      });
    }
  };

  const fetchPhotos = async (roomId: string | null, taskId: string) => {
    const allPhotos: Photo[] = [];

    // Room photos
    if (roomId) {
      const { data: roomPhotos } = await supabase
        .from("photos")
        .select("id, url, caption")
        .eq("linked_to_type", "room")
        .eq("linked_to_id", roomId)
        .limit(6);
      if (roomPhotos) allPhotos.push(...roomPhotos);
    }

    // Task photos
    const { data: taskPhotos } = await supabase
      .from("photos")
      .select("id, url, caption")
      .eq("linked_to_type", "task")
      .eq("linked_to_id", taskId)
      .limit(6);
    if (taskPhotos) allPhotos.push(...taskPhotos);

    setPhotos(allPhotos);
  };

  const displayDescription = override.descriptionOverride ?? task.description ?? "";
  const isOverridden = override.descriptionOverride !== null;
  const areaSqm = room?.dimensions?.area_sqm;
  const ceilingH = room?.ceilingHeightMm || room?.dimensions?.ceiling_height_mm;
  const includedItems = task.checklists.flatMap((cl) =>
    cl.items.filter((item) => isChecklistItemIncluded(cl.id, item.id))
  );
  const totalItems = task.checklists.reduce((s, cl) => s + cl.items.length, 0);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 border-b mb-3">
        <Eye className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {t("teamWorker.preview", "Worker preview")}
        </span>
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

          {/* Room info */}
          {room && (
            <div className="px-4 pb-3 flex flex-wrap gap-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                <span className="font-medium text-foreground">{room.name}</span>
              </div>
              {areaSqm && (
                <div className="flex items-center gap-1.5">
                  <Ruler className="h-3.5 w-3.5" />
                  <span>{areaSqm} m²</span>
                </div>
              )}
              {ceilingH && (
                <span className="text-xs">
                  {t("worker.ceilingHeight", "Ceiling")}: {(ceilingH / 1000).toFixed(1)}m
                </span>
              )}
            </div>
          )}

          {/* Color specs */}
          {room?.wallSpec && (
            <div className="px-4 pb-3">
              <ColorSwatchRow
                wallSpec={room.wallSpec}
                ceilingSpec={room.ceilingSpec}
                floorSpec={room.floorSpec}
              />
            </div>
          )}

          {/* Room specs */}
          {room && (room.wallSpec || room.floorSpec || room.ceilingSpec || room.joinerySpec) && (
            <div className="px-4 pb-3">
              <RoomSpecsSummary
                wallSpec={room.wallSpec}
                floorSpec={room.floorSpec}
                ceilingSpec={room.ceilingSpec}
                joinerySpec={room.joinerySpec}
              />
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

          {/* Photos */}
          {photos.length > 0 && (
            <div className="px-4 pb-4 space-y-2">
              <div className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">
                  {t("worker.photos", "Photos")} ({photos.length})
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {photos.map((photo) => (
                  <div
                    key={photo.id}
                    className="aspect-square rounded-lg overflow-hidden bg-muted"
                  >
                    <img
                      src={photo.url}
                      alt={photo.caption || ""}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>
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

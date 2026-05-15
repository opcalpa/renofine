import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { getStatusBadgeColor } from "@/lib/statusColors";
import { ColorSwatchRow } from "@/components/worker/ColorSwatchRow";
import { RoomMiniMap } from "@/components/worker/RoomMiniMap";
import {
  ChevronDown,
  Camera,
  Loader2,
  ImageIcon,
  Ruler,
  Package,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { RoomInstruction, RoomTask, FloorPlanShape } from "./types";

interface RoomInstructionCardProps {
  room: RoomInstruction;
  floorPlanShapes?: FloorPlanShape[];
  canToggleChecklist?: boolean;
  canUploadPhotos?: boolean;
  onChecklistToggle?: (taskId: string, checklistId: string, itemId: string, completed: boolean) => void;
  onPhotoUpload?: (taskId: string | null, roomId: string, category: "progress" | "completed", file: File) => void;
}

const statusKey = (s: string) => {
  const map: Record<string, string> = {
    to_do: "toDo", in_progress: "inProgress", on_hold: "onHold",
  };
  return map[s] || s;
};

export function RoomInstructionCard({
  room,
  floorPlanShapes,
  canToggleChecklist = false,
  canUploadPhotos = false,
  onChecklistToggle,
  onPhotoUpload,
}: RoomInstructionCardProps) {
  const { t } = useTranslation();
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(() => new Set(room.tasks.map((t) => t.id)));
  const [uploading, setUploading] = useState(false);

  const toggleTask = (taskId: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const progressPct = room.progress.total > 0
    ? Math.round((room.progress.completed / room.progress.total) * 100)
    : 0;

  const handleFileUpload = async (taskId: string | null, category: "progress" | "completed", e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onPhotoUpload) return;
    setUploading(true);
    try {
      await onPhotoUpload(taskId, room.id, category, file);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-4 pb-8">
      {/* Room header */}
      <div className="space-y-2">
        <h2 className="text-lg font-bold">{room.name}</h2>
        {room.dimensions && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <Ruler className="h-3.5 w-3.5" />
            {room.dimensions.area_sqm && <span>{room.dimensions.area_sqm} m²</span>}
            {room.dimensions.ceiling_height_mm && (
              <span>{t("rooms.ceilingHeight", "Takhöjd")}: {(room.dimensions.ceiling_height_mm / 1000).toFixed(1)}m</span>
            )}
          </div>
        )}
        {/* Progress bar */}
        <div className="flex items-center gap-2">
          <Progress value={progressPct} className="flex-1 h-2" />
          <span className="text-xs font-medium tabular-nums">{progressPct}%</span>
        </div>
      </div>

      {/* Floor plan minimap */}
      {floorPlanShapes && floorPlanShapes.length > 0 && room.id !== "__none__" && (
        <RoomMiniMap
          shapes={floorPlanShapes}
          highlightRoomId={room.id}
          className="rounded-lg border"
        />
      )}

      {/* Color specs — reuse existing ColorSwatchRow */}
      <ColorSwatchRow
        wallSpec={room.wallSpec}
        ceilingSpec={room.ceilingSpec}
        floorSpec={room.floorSpec}
      />

      {/* Reference / instruction images */}
      {room.referencePhotos.length > 0 && (
        <PhotoStrip
          label={t("rooms.referenceImages", "Förebilder")}
          icon={<ImageIcon className="h-3.5 w-3.5" />}
          photos={room.referencePhotos}
        />
      )}

      {/* Tasks with checklists */}
      <div className="space-y-2">
        {room.tasks.map((task) => (
          <TaskSection
            key={task.id}
            task={task}
            expanded={expandedTasks.has(task.id)}
            onToggle={() => toggleTask(task.id)}
            canToggleChecklist={canToggleChecklist}
            onChecklistToggle={onChecklistToggle}
          />
        ))}
      </div>

      {/* Materials */}
      {room.materials.length > 0 && (
        <div className="rounded-lg border p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase">
            <Package className="h-3.5 w-3.5" />
            {t("rooms.materials", "Material")}
          </div>
          <div className="space-y-1">
            {room.materials.map((m) => (
              <div key={m.id} className="flex items-center justify-between text-sm">
                <span>{m.name}</span>
                <span className="text-muted-foreground text-xs">
                  {m.quantity} {m.unit}
                  {m.vendorName && ` · ${m.vendorName}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Progress photos */}
      {room.progressPhotos.length > 0 && (
        <PhotoStrip
          label={t("rooms.progressPhotos", "Progressbilder")}
          icon={<Clock className="h-3.5 w-3.5" />}
          photos={room.progressPhotos}
        />
      )}

      {/* Completed photos */}
      {room.completedPhotos.length > 0 && (
        <PhotoStrip
          label={t("rooms.completedPhotos", "Slutförda bilder")}
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          photos={room.completedPhotos}
        />
      )}

      {/* Photo upload buttons */}
      {canUploadPhotos && (
        <div className="grid grid-cols-2 gap-2">
          <UploadButton
            label={t("rooms.progressPhoto", "Progressfoto")}
            uploading={uploading}
            onChange={(e) => handleFileUpload(null, "progress", e)}
          />
          <UploadButton
            label={t("rooms.completedPhoto", "Slutfört-foto")}
            uploading={uploading}
            onChange={(e) => handleFileUpload(null, "completed", e)}
          />
        </div>
      )}
    </div>
  );
}

// --- Sub-components ---

function PhotoStrip({ label, icon, photos }: { label: string; icon: React.ReactNode; photos: Array<{ id: string; url: string; caption: string | null }> }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1.5">
        {icon}
        {label}
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ WebkitOverflowScrolling: "touch" }}>
        {photos.map((photo) => (
          <img
            key={photo.id}
            src={photo.url}
            alt={photo.caption || ""}
            className="h-24 w-32 rounded-lg object-cover flex-shrink-0 border"
            loading="lazy"
          />
        ))}
      </div>
    </div>
  );
}

function TaskSection({
  task,
  expanded,
  onToggle,
  canToggleChecklist,
  onChecklistToggle,
}: {
  task: RoomTask;
  expanded: boolean;
  onToggle: () => void;
  canToggleChecklist: boolean;
  onChecklistToggle?: (taskId: string, checklistId: string, itemId: string, completed: boolean) => void;
}) {
  const { t } = useTranslation();
  const totalItems = task.checklists.reduce((sum, cl) => sum + cl.items.length, 0);
  const completedItems = task.checklists.reduce((sum, cl) => sum + cl.items.filter((i) => i.completed).length, 0);

  return (
    <div className="rounded-lg border overflow-hidden">
      <button
        type="button"
        className="flex items-center gap-2 w-full p-3 text-left hover:bg-muted/50 transition-colors"
        onClick={onToggle}
      >
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform flex-shrink-0", !expanded && "-rotate-90")} />
        <span className="text-sm font-medium flex-1 truncate">{task.title}</span>
        <Badge className={cn("text-[10px] px-1.5", getStatusBadgeColor(task.status))}>
          {t(`statuses.${statusKey(task.status)}`, task.status)}
        </Badge>
        {totalItems > 0 && (
          <span className="text-[10px] text-muted-foreground tabular-nums">{completedItems}/{totalItems}</span>
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t bg-muted/20">
          {task.description && (
            <p className="text-xs text-muted-foreground pt-2 whitespace-pre-line">{task.description}</p>
          )}

          {task.instructionImages.length > 0 && (
            <div className="space-y-2 pt-1">
              {task.instructionImages.map((img, i) => (
                <div key={i} className="rounded-lg border bg-card overflow-hidden">
                  <a href={img.url} target="_blank" rel="noopener noreferrer" className="block">
                    <img
                      src={img.url}
                      alt=""
                      className="w-full max-h-60 object-cover bg-muted"
                      loading="lazy"
                    />
                  </a>
                  {img.description && (
                    <p className="px-2.5 py-2 text-xs whitespace-pre-wrap text-foreground/90 border-t bg-muted/30">
                      {img.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {task.checklists.map((cl) => (
            <div key={cl.id} className="space-y-1">
              {cl.title && <p className="text-xs font-medium">{cl.title}</p>}
              {cl.items.map((item) => (
                <label
                  key={item.id}
                  className="flex items-center gap-2 py-1 text-sm cursor-pointer"
                >
                  <Checkbox
                    checked={item.completed}
                    disabled={!canToggleChecklist}
                    onCheckedChange={(checked) => {
                      onChecklistToggle?.(task.id, cl.id, item.id, !!checked);
                    }}
                  />
                  <span className={cn(item.completed && "line-through text-muted-foreground")}>
                    {item.title}
                  </span>
                </label>
              ))}
            </div>
          ))}

          {task.photos.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {task.photos.map((photo) => (
                <img
                  key={photo.id}
                  src={photo.url}
                  alt={photo.caption || ""}
                  className="h-20 w-20 rounded object-cover flex-shrink-0 border"
                  loading="lazy"
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UploadButton({
  label,
  uploading,
  onChange,
}: {
  label: string;
  uploading: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="flex items-center justify-center gap-2 h-12 rounded-lg border-2 border-dashed text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors cursor-pointer">
      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
      {label}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onChange}
        disabled={uploading}
      />
    </label>
  );
}

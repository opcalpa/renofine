import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { getStatusBadgeColor } from "@/lib/statusColors";
import { ColorSwatchRow } from "./ColorSwatchRow";
import { RoomMiniMap } from "./RoomMiniMap";
import { RoomSpecsSummary } from "./RoomSpecsSummary";
import { WorkerMessageInput } from "./WorkerMessageInput";
import { MapPin, Ruler, Camera, Loader2, CheckSquare, ImageIcon, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Call edge function with FormData (supabase.functions.invoke doesn't handle FormData) */
async function invokeWithFormData(fnName: string, formData: FormData) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
    method: "POST",
    body: formData,
    headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!res.ok) throw new Error(`${fnName}: ${res.status}`);
  return res.json();
}

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

interface Photo {
  id: string;
  url: string;
  caption: string | null;
}

interface WallSpec {
  main_color?: string;
  accent_wall_color?: string;
  has_accent_wall?: boolean;
  treatments?: string[];
}

interface FloorSpec {
  material?: string;
  specification?: string;
  treatments?: string[];
  skirting_type?: string;
  skirting_color?: string;
}

interface CeilingSpec {
  color?: string;
  material?: string;
  molding_type?: string;
}

interface JoinerySpec {
  door_type?: string;
  trim_type?: string;
}

interface WorkerRoom {
  name: string;
  wallSpec: WallSpec | null;
  floorSpec: FloorSpec | null;
  ceilingSpec: CeilingSpec | null;
  joinerySpec: JoinerySpec | null;
  dimensions: { area_sqm?: number; ceiling_height_mm?: number } | null;
  ceilingHeightMm: number | null;
}

interface WorkerMessage {
  id: string;
  content: string;
  createdAt: string;
  authorName: string;
  isWorker: boolean;
  images: Array<{ id: string; url: string; filename?: string }>;
}

export interface WorkerTask {
  id: string;
  title: string;
  description: string | null;
  status: string;
  progress: number;
  checklists: Checklist[];
  photos: Photo[];
  beforePhotos?: Photo[];
  instructionImages?: Array<{ url: string; description: string }>;
  messages: WorkerMessage[];
  roomId: string | null;
  room: WorkerRoom | null;
}

interface FloorPlanShape {
  id: string;
  roomId: string | null;
  points: Array<{ x: number; y: number }>;
  color: string;
  strokeColor: string;
  name: string | null;
}

interface WorkerTaskCardProps {
  task: WorkerTask;
  token: string;
  canToggleChecklist: boolean;
  canUploadPhotos: boolean;
  floorPlan: FloorPlanShape[] | null;
  floorPlanImage?: { url: string; x: number; y: number } | null;
  onTaskUpdate: (taskId: string, updates: Partial<WorkerTask>) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const statusKey = (s: string) => {
  const map: Record<string, string> = {
    to_do: "toDo", in_progress: "inProgress", on_hold: "onHold",
  };
  return map[s] || s;
};

async function compressImage(file: File, maxSize = 1200, quality = 0.8): Promise<Blob> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement("canvas");
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => resolve(blob || file), "image/jpeg", quality);
    };
    img.onerror = () => URL.revokeObjectURL(objectUrl);
    img.src = objectUrl;
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WorkerTaskCard({
  task,
  token,
  canToggleChecklist,
  canUploadPhotos,
  floorPlan,
  floorPlanImage,
  onTaskUpdate,
}: WorkerTaskCardProps) {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const [togglingItems, setTogglingItems] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Flatten for progress count
  const allItems = task.checklists.flatMap((cl) => cl.items);
  const completedCount = allItems.filter((i) => i.completed).length;

  // Room info
  const room = task.room;
  const areaSqm = room?.dimensions?.area_sqm;
  const ceilingH = room?.ceilingHeightMm || room?.dimensions?.ceiling_height_mm;

  // ---------------------------------------------------------------------------
  // Checklist toggle
  // ---------------------------------------------------------------------------
  const handleToggle = async (checklistId: string, itemId: string, completed: boolean) => {
    if (!canToggleChecklist) return;

    setTogglingItems((prev) => new Set(prev).add(itemId));

    // Optimistic update
    const updatedChecklists = task.checklists.map((cl) => ({
      ...cl,
      items: cl.items.map((item) =>
        cl.id === checklistId && item.id === itemId ? { ...item, completed } : item
      ),
    }));
    onTaskUpdate(task.id, { checklists: updatedChecklists });

    try {
      const { data, error } = await supabase.functions.invoke("worker-toggle-checklist", {
        body: { token, taskId: task.id, checklistId, itemId, completed },
      });
      if (error || data?.error) {
        console.error("Toggle failed:", error || data?.error);
        onTaskUpdate(task.id, { checklists: task.checklists });
        toast.error(t("common.error", "Could not save"));
      }
    } catch (err) {
      console.error("Toggle failed:", err);
      onTaskUpdate(task.id, { checklists: task.checklists });
      toast.error(t("common.error", "Could not save"));
    } finally {
      setTogglingItems((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };

  // ---------------------------------------------------------------------------
  // Photo upload
  // ---------------------------------------------------------------------------
  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const compressed = await compressImage(file);
      const formData = new FormData();
      formData.append("token", token);
      formData.append("taskId", task.id);
      formData.append("file", compressed, `worker-${Date.now()}.jpg`);

      const data = await invokeWithFormData("worker-upload-photo", formData);

      if (data?.photo) {
        onTaskUpdate(task.id, {
          photos: [...task.photos, data.photo],
        });
        toast.success(t("worker.photoUploaded", "Photo uploaded"));
      } else if (data?.error) {
        toast.error(data.error);
      }
    } catch (err) {
      console.error("Upload failed:", err);
      toast.error(t("common.error", "Upload failed"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold leading-snug">{task.title}</h3>
          <Badge className={`shrink-0 text-xs ${getStatusBadgeColor(task.status)}`}>
            {t(`statuses.${statusKey(task.status)}`, task.status)}
          </Badge>
        </div>

        {/* Progress */}
        {(task.progress > 0 || completedCount > 0) && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{t("worker.progress", "Progress")}</span>
              <span className="tabular-nums">
                {allItems.length > 0 ? `${completedCount}/${allItems.length}` : `${task.progress}%`}
              </span>
            </div>
            <Progress
              value={allItems.length > 0 ? (completedCount / allItems.length) * 100 : task.progress}
              className="h-2"
            />
          </div>
        )}
      </div>

      {/* Floor plan mini-map */}
      {floorPlan && floorPlan.length > 0 && task.room && (
        <div className="px-4 pb-2">
          <div className="rounded-lg bg-muted/30 border p-2">
            <RoomMiniMap
              shapes={floorPlan}
              highlightRoomId={task.roomId}
              backgroundImage={floorPlanImage}
              className="rounded"
            />
          </div>
        </div>
      )}

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
      {room && (
        <div className="px-4 pb-3">
          <ColorSwatchRow
            wallSpec={room.wallSpec}
            ceilingSpec={room.ceilingSpec}
            floorSpec={room.floorSpec}
          />
        </div>
      )}

      {/* Room specs details */}
      {room && (
        <div className="px-4 pb-3">
          <RoomSpecsSummary
            wallSpec={room.wallSpec}
            floorSpec={room.floorSpec}
            ceilingSpec={room.ceilingSpec}
            joinerySpec={room.joinerySpec}
          />
        </div>
      )}

      {/* Instruction images (per-task, sent with the invite) */}
      {task.instructionImages && task.instructionImages.length > 0 && (
        <div className="px-4 pb-3 space-y-3">
          <div className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">
              {t("worker.instructionImages", "Instruktioner")}
            </span>
          </div>
          <ul className="space-y-3">
            {task.instructionImages.map((img, i) => (
              <li key={i} className="rounded-lg border bg-card overflow-hidden">
                <a href={img.url} target="_blank" rel="noopener noreferrer" className="block">
                  <img
                    src={img.url}
                    alt=""
                    className="w-full max-h-72 object-cover bg-muted"
                    loading="lazy"
                  />
                </a>
                {img.description && (
                  <p className="px-3 py-2 text-sm whitespace-pre-wrap text-foreground/90 border-t bg-muted/30">
                    {img.description}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Before-photos (reference images) */}
      {task.beforePhotos && task.beforePhotos.length > 0 && (
        <div className="px-4 pb-3 space-y-2">
          <div className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">
              {t("worker.beforePhotos", "Before photos")}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {task.beforePhotos.map((photo) => (
              <a
                key={photo.id}
                href={photo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="aspect-square rounded-lg overflow-hidden bg-muted"
              >
                <img
                  src={photo.url}
                  alt={photo.caption || ""}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Description */}
      {task.description && (
        <div className="px-4 pb-3">
          <p className="text-sm whitespace-pre-wrap text-foreground/90">{task.description}</p>
        </div>
      )}

      {/* Checklists */}
      {allItems.length > 0 && (
        <div className="px-4 pb-3 space-y-2">
          <div className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">
              {t("worker.checklist", "Checklist")}
            </span>
          </div>
          {task.checklists.map((cl) => (
            <div key={cl.id} className="space-y-1">
              {cl.title && <p className="text-xs font-medium pl-1">{cl.title}</p>}
              {cl.items.map((item) => (
                <label
                  key={item.id}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                    canToggleChecklist ? "cursor-pointer active:bg-muted" : ""
                  } ${item.completed ? "bg-emerald-50 dark:bg-emerald-950/20" : "bg-muted/30"}`}
                >
                  <Checkbox
                    checked={item.completed}
                    disabled={!canToggleChecklist || togglingItems.has(item.id)}
                    onCheckedChange={(checked) =>
                      handleToggle(cl.id, item.id, checked as boolean)
                    }
                    className="h-5 w-5"
                  />
                  <span
                    className={`text-sm flex-1 ${
                      item.completed ? "text-muted-foreground line-through" : "text-foreground"
                    }`}
                  >
                    {item.title}
                  </span>
                </label>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Photos */}
      {(task.photos.length > 0 || canUploadPhotos) && (
        <div className="px-4 pb-4 space-y-2">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">
              {t("worker.photos", "Photos")}
            </span>
          </div>

          {task.photos.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {task.photos.map((photo) => (
                <a
                  key={photo.id}
                  href={photo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="aspect-square rounded-lg overflow-hidden bg-muted"
                >
                  <img
                    src={photo.url}
                    alt={photo.caption || ""}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </a>
              ))}
            </div>
          )}

          {canUploadPhotos && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handlePhotoCapture}
              />
              <Button
                variant="outline"
                className="w-full h-12 text-sm gap-2"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("worker.uploading", "Uploading...")}
                  </>
                ) : (
                  <>
                    <Camera className="h-4 w-4" />
                    {t("worker.takePhoto", "Take photo")}
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="px-4 pb-4 space-y-2">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            {t("worker.messages", "Messages")}
            {task.messages.length > 0 && ` (${task.messages.length})`}
          </span>
        </div>

        {/* Message history */}
        {task.messages.length > 0 && (
          <div className="space-y-2 max-h-60 overflow-y-auto rounded-lg bg-muted/30 p-2">
            {task.messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.isWorker ? "items-end" : "items-start"}`}
              >
                <div
                  className={`rounded-lg px-3 py-2 max-w-[85%] text-sm ${
                    msg.isWorker
                      ? "bg-primary text-primary-foreground"
                      : "bg-background border"
                  }`}
                >
                  {!msg.isWorker && (
                    <p className="text-[10px] font-medium text-muted-foreground mb-0.5">
                      {msg.authorName}
                    </p>
                  )}
                  {msg.content.startsWith("🎤") ? (
                    <audio controls src={msg.content.replace("🎤 ", "")} className="h-8 max-w-full" />
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                  {msg.images.length > 0 && (
                    <div className="flex gap-1 mt-1">
                      {msg.images.map((img) => (
                        <img key={img.id} src={img.url} alt="" className="h-16 w-16 rounded object-cover" />
                      ))}
                    </div>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground mt-0.5 px-1">
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Message input */}
        <WorkerMessageInput
          token={token}
          taskId={task.id}
          onMessageSent={(content) => {
            onTaskUpdate(task.id, {
              messages: [...task.messages, {
                id: crypto.randomUUID(),
                content,
                createdAt: new Date().toISOString(),
                authorName: "",
                isWorker: true,
                images: [],
              }],
            });
          }}
        />
      </div>
    </div>
  );
}

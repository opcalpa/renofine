import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Upload, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InstructionImage } from "./types";

interface ProjectPhoto {
  id: string;
  url: string;
  caption: string | null;
  source: string | null;
  linkedToType: string;
  linkedToId: string;
  roomName?: string | null;
  taskName?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  taskId: string;
  /** Photo IDs already chosen for this task — hides them from picker. */
  alreadyChosenPhotoIds: string[];
  onAdd: (image: InstructionImage) => void;
}

function uid(): string {
  return `img-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

export function InstructionImagePicker({
  open,
  onOpenChange,
  projectId,
  taskId,
  alreadyChosenPhotoIds,
  onAdd,
}: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"existing" | "upload">("existing");
  const [photos, setPhotos] = useState<ProjectPhoto[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadPreview, setUploadPreview] = useState<{ file: File; url: string } | null>(null);
  const [uploadDescription, setUploadDescription] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setPhotos(null);
      setUploadPreview(null);
      setUploadDescription("");
      return;
    }
    loadProjectPhotos();
  }, [open, projectId]);

  const loadProjectPhotos = async () => {
    setLoading(true);
    try {
      // Fetch all rooms + tasks for this project so we can resolve photo names.
      const [roomsRes, tasksRes] = await Promise.all([
        supabase.from("rooms").select("id, name").eq("project_id", projectId),
        supabase.from("tasks").select("id, title, room_id").eq("project_id", projectId),
      ]);
      const roomMap = new Map<string, string>();
      for (const r of roomsRes.data ?? []) roomMap.set(r.id, r.name);
      const taskMap = new Map<string, { title: string; roomId: string | null }>();
      for (const tk of tasksRes.data ?? []) {
        taskMap.set(tk.id, { title: tk.title, roomId: tk.room_id });
      }

      const taskIds = Array.from(taskMap.keys());
      const roomIds = Array.from(roomMap.keys());
      if (taskIds.length === 0 && roomIds.length === 0) {
        setPhotos([]);
        return;
      }

      const orClauses: string[] = [];
      if (taskIds.length > 0) {
        orClauses.push(`and(linked_to_type.eq.task,linked_to_id.in.(${taskIds.join(",")}))`);
      }
      if (roomIds.length > 0) {
        orClauses.push(`and(linked_to_type.eq.room,linked_to_id.in.(${roomIds.join(",")}))`);
      }

      const { data, error } = await supabase
        .from("photos")
        .select("id, url, caption, source, linked_to_type, linked_to_id")
        .or(orClauses.join(","))
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Failed to load photos:", error);
        setPhotos([]);
        return;
      }

      const resolved: ProjectPhoto[] = (data ?? []).map((p) => {
        const linkedType = p.linked_to_type;
        const linkedId = p.linked_to_id;
        let roomName: string | null = null;
        let taskName: string | null = null;
        if (linkedType === "task") {
          const t = taskMap.get(linkedId);
          if (t) {
            taskName = t.title;
            if (t.roomId) roomName = roomMap.get(t.roomId) ?? null;
          }
        } else if (linkedType === "room") {
          roomName = roomMap.get(linkedId) ?? null;
        }
        return {
          id: p.id,
          url: p.url,
          caption: p.caption,
          source: p.source,
          linkedToType: linkedType,
          linkedToId: linkedId,
          roomName,
          taskName,
        };
      });

      setPhotos(resolved);
    } finally {
      setLoading(false);
    }
  };

  const handlePickExisting = (photo: ProjectPhoto) => {
    onAdd({
      localId: uid(),
      source: "existing",
      photoId: photo.id,
      previewUrl: photo.url,
      // Start empty — the photo's own caption is not an instruction, and
      // pre-filling it made typing concatenate onto the caption string.
      description: "",
    });
    onOpenChange(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      return;
    }
    const url = URL.createObjectURL(file);
    setUploadPreview({ file, url });
  };

  const handleConfirmUpload = () => {
    if (!uploadPreview) return;
    onAdd({
      localId: uid(),
      source: "upload",
      file: uploadPreview.file,
      previewUrl: uploadPreview.url,
      description: uploadDescription.trim(),
    });
    onOpenChange(false);
  };

  const filteredPhotos = (photos ?? []).filter(
    (p) => !alreadyChosenPhotoIds.includes(p.id),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t("instructionImages.pickerTitle", "Lägg till instruktionsbild")}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="existing">
              <ImageIcon className="h-4 w-4 mr-1.5" />
              {t("instructionImages.existingTab", "Befintliga")}
            </TabsTrigger>
            <TabsTrigger value="upload">
              <Upload className="h-4 w-4 mr-1.5" />
              {t("instructionImages.uploadTab", "Ladda upp")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="existing" className="mt-3">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredPhotos.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">
                {t(
                  "instructionImages.noExistingPhotos",
                  "Inga bilder att välja från i detta projekt än.",
                )}
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2 max-h-[420px] overflow-y-auto">
                {filteredPhotos.map((photo) => (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => handlePickExisting(photo)}
                    className={cn(
                      "relative aspect-square rounded-md overflow-hidden bg-muted",
                      "ring-1 ring-border hover:ring-2 hover:ring-primary transition-all",
                      "text-left",
                    )}
                  >
                    <img
                      src={photo.url}
                      alt={photo.caption ?? ""}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {(photo.roomName || photo.taskName) && (
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-1.5">
                        <p className="text-[10px] font-medium text-white truncate">
                          {photo.taskName ?? photo.roomName}
                        </p>
                        {photo.source && (
                          <p className="text-[9px] text-white/70 truncate">
                            {photo.source}
                          </p>
                        )}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="upload" className="mt-3 space-y-3">
            {!uploadPreview ? (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "w-full rounded-md border-2 border-dashed border-muted-foreground/30",
                    "py-12 flex flex-col items-center gap-2 text-muted-foreground",
                    "hover:border-primary/50 hover:text-foreground transition-colors",
                  )}
                >
                  <Upload className="h-8 w-8" />
                  <span className="text-sm font-medium">
                    {t("instructionImages.uploadCta", "Välj en bild att ladda upp")}
                  </span>
                  <span className="text-xs">
                    {t("instructionImages.uploadHint", "JPG, PNG eller WebP")}
                  </span>
                </button>
              </>
            ) : (
              <div className="space-y-3">
                <div className="rounded-md overflow-hidden border bg-muted/30">
                  <img
                    src={uploadPreview.url}
                    alt=""
                    className="w-full max-h-[300px] object-contain"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    {t("instructionImages.descriptionLabel", "Beskrivning")}
                  </label>
                  <textarea
                    value={uploadDescription}
                    onChange={(e) => setUploadDescription(e.target.value)}
                    placeholder={t(
                      "instructionImages.descriptionPlaceholder",
                      "Vad ska arbetaren göra eller notera här?",
                    )}
                    rows={3}
                    className="w-full text-sm border rounded-md px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                    autoFocus
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      URL.revokeObjectURL(uploadPreview.url);
                      setUploadPreview(null);
                      setUploadDescription("");
                    }}
                  >
                    {t("common.cancel", "Avbryt")}
                  </Button>
                  <Button type="button" size="sm" onClick={handleConfirmUpload}>
                    {t("instructionImages.addToList", "Lägg till")}
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

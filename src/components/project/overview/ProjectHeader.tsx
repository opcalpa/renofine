import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { MapPin, Pencil, Camera, X, Loader2, GripVertical, Check, ZoomIn, ZoomOut, AlertTriangle, Upload, Link2, Images } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { normalizeStatus, STATUS_META, PROJECT_STATUSES, type ProjectStatus } from "@/lib/projectStatus";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { OverviewProject } from "./types";
import { useFileUrl, toStoragePath } from "@/lib/fileUrl";

interface ProjectHeaderProps {
  project: OverviewProject;
  onOpenSettings?: () => void;
  onCoverChange?: (url: string | null) => void;
  onStatusChange?: (newStatus: string) => void;
  actions?: React.ReactNode;
}

export function ProjectHeader({ project, onOpenSettings, onCoverChange, onStatusChange, actions }: ProjectHeaderProps) {
  const { t } = useTranslation();
  const status = normalizeStatus(project.status);
  const meta = STATUS_META[status];
  const [uploading, setUploading] = useState(false);
  // Holds a storage path (or an external URL); signed for display below.
  const [coverUrl, setCoverUrl] = useState(project.cover_image_url || null);
  const coverDisplayUrl = useFileUrl(coverUrl);
  const [coverPosition, setCoverPosition] = useState(project.cover_image_position ?? 50);
  const [coverZoom, setCoverZoom] = useState(project.cover_image_zoom ?? 100);
  const [repositioning, setRepositioning] = useState(false);
  const [dragStartY, setDragStartY] = useState<number | null>(null);
  const [dragStartPos, setDragStartPos] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [isAutoCover, setIsAutoCover] = useState(false);
  const [statusPopoverOpen, setStatusPopoverOpen] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState<ProjectStatus | null>(null);
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const [coverPickerMode, setCoverPickerMode] = useState<"menu" | "url" | "existing">("menu");
  const [urlInput, setUrlInput] = useState("");
  const [existingImages, setExistingImages] = useState<{ url: string; name: string }[]>([]);
  const [loadingExisting, setLoadingExisting] = useState(false);

  // Statuses available from current status
  const availableStatuses = PROJECT_STATUSES.filter((s) => s !== status && s !== "quote_rejected" && s !== "cancelled");

  const handleStatusSelect = (newStatus: ProjectStatus) => {
    setStatusPopoverOpen(false);
    // Warn when jumping from planning to active
    if (status === "planning" && newStatus === "active") {
      setConfirmStatus(newStatus);
      return;
    }
    onStatusChange?.(newStatus);
  };

  const handleConfirmStatusChange = async () => {
    if (!confirmStatus) return;
    onStatusChange?.(confirmStatus);
    setConfirmStatus(null);
  };

  // Sync with prop changes
  useEffect(() => {
    setCoverPosition(project.cover_image_position ?? 50);
    setCoverZoom(project.cover_image_zoom ?? 100);
  }, [project.cover_image_position, project.cover_image_zoom]);

  // Auto-cover: if no cover set, find first image uploaded to the project
  useEffect(() => {
    if (project.cover_image_url) return;
    let cancelled = false;

    (async () => {
      const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "heic"];

      // Search Storage for first image in project folder
      const { data: files } = await supabase.storage
        .from("project-files")
        .list(`projects/${project.id}`, { limit: 50, sortBy: { column: "created_at", order: "asc" } });

      if (cancelled || !files) return;

      const firstImage = files.find((f) => {
        const ext = f.name.split(".").pop()?.toLowerCase() || "";
        return IMAGE_EXTENSIONS.includes(ext);
      });

      if (firstImage) {
        if (!cancelled) {
          setCoverUrl(`projects/${project.id}/${firstImage.name}`);
          setIsAutoCover(true);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [project.id, project.cover_image_url]);

  // Set cover from an existing URL (no upload needed)
  const setCoverFromUrl = async (url: string) => {
    setCoverUrl(url);
    setCoverPosition(50);
    setCoverZoom(100);
    setIsAutoCover(false);
    await supabase.from("projects").update({
      cover_image_url: url,
      cover_image_position: 50,
      cover_image_zoom: 100,
    } as Record<string, unknown>).eq("id", project.id);
    onCoverChange?.(url);
    setCoverPickerOpen(false);
    setCoverPickerMode("menu");
  };

  // Load all images from the project (storage + inspiration)
  const loadExistingImages = async () => {
    setLoadingExisting(true);
    const images: { url: string; name: string }[] = [];

    // Storage files
    const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "heic", "gif"];
    const folders = ["", "inspiration", "Uppladdade filer", "Random"];
    for (const folder of folders) {
      const path = folder ? `projects/${project.id}/${folder}` : `projects/${project.id}`;
      const { data: files } = await supabase.storage
        .from("project-files")
        .list(path, { limit: 50, sortBy: { column: "created_at", order: "desc" } });
      if (files) {
        for (const f of files) {
          const ext = f.name.split(".").pop()?.toLowerCase() || "";
          if (IMAGE_EXTS.includes(ext)) {
            const fullPath = folder ? `${path}/${f.name}` : `projects/${project.id}/${f.name}`;
            images.push({ url: fullPath, name: f.name });
          }
        }
      }
    }

    // Inspiration photos from project_photos table
    const { data: photos } = await supabase
      .from("project_photos")
      .select("url, caption")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false })
      .limit(30);
    if (photos) {
      for (const p of photos) {
        if (p.url && !images.some((i) => i.url === p.url)) {
          images.push({ url: p.url, name: p.caption || "Inspiration" });
        }
      }
    }

    setExistingImages(images);
    setLoadingExisting(false);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);

    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `projects/${project.id}/${Date.now()}.${ext}`;

      if (coverUrl) {
        const oldPath = toStoragePath(coverUrl);
        if (oldPath) await supabase.storage.from("project-files").remove([oldPath]);
      }

      const { error } = await supabase.storage.from("project-files").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (error) {
        console.error("Cover upload failed:", { error, path, fileType: file.type, fileSize: file.size });
        toast.error(error.message);
        return;
      }

      setCoverUrl(path);
      setCoverPosition(50);
      setCoverZoom(100);

      await supabase.from("projects").update({
        cover_image_url: path,
        cover_image_position: 50,
        cover_image_zoom: 100,
      } as Record<string, unknown>).eq("id", project.id);
      onCoverChange?.(path);
    } catch {
      toast.error(t("errors.generic"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleRemoveCover = async () => {
    if (!coverUrl) return;
    const oldPath = toStoragePath(coverUrl);
    if (oldPath) await supabase.storage.from("project-files").remove([oldPath]);

    setCoverUrl(null);
    await supabase.from("projects").update({
      cover_image_url: null,
      cover_image_position: 50,
      cover_image_zoom: 100,
    } as Record<string, unknown>).eq("id", project.id);
    onCoverChange?.(null);
  };

  const handleDoubleClick = useCallback(() => {
    if (!coverUrl) return;
    setRepositioning(true);
    setDragStartPos(coverPosition);
  }, [coverUrl, coverPosition]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!repositioning) return;
    e.preventDefault();
    setDragStartY(e.clientY);
    setDragStartPos(coverPosition);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [repositioning, coverPosition]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (dragStartY === null || !containerRef.current) return;
    const containerHeight = containerRef.current.offsetHeight;
    const deltaY = e.clientY - dragStartY;
    // Moving mouse down = showing higher part of image = lower object-position %
    const deltaPct = -(deltaY / containerHeight) * 100;
    const newPos = Math.max(0, Math.min(100, dragStartPos + deltaPct));
    setCoverPosition(newPos);
  }, [dragStartY, dragStartPos]);

  const handlePointerUp = useCallback(() => {
    setDragStartY(null);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!repositioning) return;
    e.preventDefault();
    setCoverZoom((prev) => Math.max(100, Math.min(300, prev - e.deltaY * 0.5)));
  }, [repositioning]);

  const handleSavePosition = useCallback(async () => {
    setRepositioning(false);
    await supabase.from("projects").update({
      cover_image_position: Math.round(coverPosition),
      cover_image_zoom: Math.round(coverZoom),
    } as Record<string, unknown>).eq("id", project.id);
  }, [coverPosition, coverZoom, project.id]);

  const handleCancelReposition = useCallback(() => {
    setRepositioning(false);
    setCoverPosition(project.cover_image_position ?? 50);
    setCoverZoom(project.cover_image_zoom ?? 100);
  }, [project.cover_image_position, project.cover_image_zoom]);

  return (
    <div className="space-y-2 px-2 sm:px-4">
      {/* Hero / Cover image */}
      <div className="relative group">
        {coverUrl ? (
          <div
            ref={containerRef}
            className={`relative h-40 sm:h-52 rounded-xl overflow-hidden ${repositioning ? "ring-2 ring-primary cursor-grab active:cursor-grabbing" : ""}`}
            onDoubleClick={handleDoubleClick}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onWheel={handleWheel}
          >
            <img
              src={coverDisplayUrl ?? undefined}
              alt={project.name}
              className="w-full h-full object-cover select-none"
              style={{
                objectPosition: `center ${coverPosition}%`,
                transform: coverZoom !== 100 ? `scale(${coverZoom / 100})` : undefined,
                transformOrigin: `center ${coverPosition}%`,
              }}
              draggable={false}
              onError={() => { setCoverUrl(null); setIsAutoCover(false); }}
            />
            {/* Repositioning overlay */}
            {repositioning && (
              <div className="absolute inset-0 bg-black/20 flex flex-col items-center justify-center pointer-events-none">
                <div className="flex items-center gap-2 bg-black/60 text-white px-3 py-1.5 rounded-full text-xs font-medium">
                  <GripVertical className="h-3.5 w-3.5" />
                  {t("overview.dragToReposition", "Dra för att justera")}
                </div>
              </div>
            )}
            {/* Zoom slider */}
            {repositioning && (
              <div className="absolute bottom-14 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 rounded-full px-3 py-1.5 pointer-events-auto">
                <ZoomOut className="h-3.5 w-3.5 text-white/70" />
                <Slider
                  min={100}
                  max={300}
                  step={5}
                  value={[coverZoom]}
                  onValueChange={([v]) => setCoverZoom(v)}
                  className="w-28 [&_[role=slider]]:h-3 [&_[role=slider]]:w-3 [&_[role=slider]]:bg-white [&>span:first-child]:bg-white/30 [&>span:first-child>span]:bg-white"
                />
                <ZoomIn className="h-3.5 w-3.5 text-white/70" />
              </div>
            )}
            {/* Reposition save/cancel buttons */}
            {repositioning && (
              <div className="absolute bottom-3 right-3 flex gap-1.5">
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1 shadow-lg"
                  onClick={handleSavePosition}
                >
                  <Check className="h-3.5 w-3.5" />
                  {t("common.save", "Spara")}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 text-xs shadow-lg"
                  onClick={handleCancelReposition}
                >
                  {t("common.cancel", "Avbryt")}
                </Button>
              </div>
            )}
            {/* Normal hover controls */}
            {!repositioning && (
              <>
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
                {/* Auto-cover hint */}
                {isAutoCover && (
                  <div className="absolute bottom-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      className="flex items-center gap-1.5 bg-black/60 text-white px-2.5 py-1 rounded-full text-[11px] font-medium hover:bg-black/80 transition-colors"
                      onClick={() => fileRef.current?.click()}
                    >
                      <Camera className="h-3 w-3" />
                      {t("overview.changeCover", "Byt omslagsbild")}
                    </button>
                  </div>
                )}
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-8 w-8 bg-white/90 hover:bg-white"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                  >
                    <Camera className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-8 w-8 bg-white/90 hover:bg-white"
                    onClick={handleRemoveCover}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleUpload}
        />
      </div>

      {/* Title + status + actions */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="font-display text-2xl sm:text-3xl font-normal leading-tight tracking-tight">{project.name}</h1>
          {onOpenSettings && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={onOpenSettings}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          <Popover open={coverPickerOpen} onOpenChange={(open) => { setCoverPickerOpen(open); if (!open) setCoverPickerMode("menu"); }}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground/50 hover:text-muted-foreground"
                disabled={uploading}
                title={t("overview.addCoverPhoto", "Add project photo")}
              >
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-1.5" align="start">
              {coverPickerMode === "menu" && (
                <div className="space-y-0.5">
                  <button
                    type="button"
                    className="flex items-center gap-2 w-full px-2.5 py-2 text-sm rounded-md hover:bg-accent transition-colors text-left"
                    onClick={() => { setCoverPickerOpen(false); fileRef.current?.click(); }}
                  >
                    <Upload className="h-4 w-4 text-muted-foreground" />
                    {t("overview.coverUpload", "Ladda upp bild")}
                  </button>
                  <button
                    type="button"
                    className="flex items-center gap-2 w-full px-2.5 py-2 text-sm rounded-md hover:bg-accent transition-colors text-left"
                    onClick={() => setCoverPickerMode("url")}
                  >
                    <Link2 className="h-4 w-4 text-muted-foreground" />
                    {t("overview.coverUrl", "Klistra länk")}
                  </button>
                  <button
                    type="button"
                    className="flex items-center gap-2 w-full px-2.5 py-2 text-sm rounded-md hover:bg-accent transition-colors text-left"
                    onClick={() => { setCoverPickerMode("existing"); loadExistingImages(); }}
                  >
                    <Images className="h-4 w-4 text-muted-foreground" />
                    {t("overview.coverExisting", "Välj bland bilder")}
                  </button>
                </div>
              )}
              {coverPickerMode === "url" && (
                <div className="space-y-2 p-1">
                  <Input
                    autoFocus
                    placeholder="https://..."
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && urlInput.trim()) setCoverFromUrl(urlInput.trim()); }}
                    className="h-8 text-sm"
                  />
                  <div className="flex gap-1">
                    <Button size="sm" className="h-7 text-xs flex-1" disabled={!urlInput.trim()} onClick={() => setCoverFromUrl(urlInput.trim())}>
                      {t("common.save")}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setCoverPickerMode("menu")}>
                      {t("common.back", "Tillbaka")}
                    </Button>
                  </div>
                </div>
              )}
              {coverPickerMode === "existing" && (
                <div className="space-y-2 p-1">
                  <p className="text-xs font-medium text-muted-foreground">{t("overview.coverPickExisting", "Välj omslagsbild")}</p>
                  {loadingExisting ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : existingImages.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">{t("overview.noExistingImages", "Inga bilder hittades")}</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-1 max-h-48 overflow-y-auto">
                      {existingImages.map((img, i) => (
                        <button
                          key={i}
                          type="button"
                          className="aspect-square rounded overflow-hidden hover:ring-2 ring-primary transition-all"
                          onClick={() => setCoverFromUrl(img.url)}
                          title={img.name}
                        >
                          <img src={img.url} alt={img.name} className="w-full h-full object-cover" loading="lazy" />
                        </button>
                      ))}
                    </div>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 text-xs w-full" onClick={() => setCoverPickerMode("menu")}>
                    {t("common.back", "Tillbaka")}
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
          {onStatusChange ? (
            <Popover open={statusPopoverOpen} onOpenChange={setStatusPopoverOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity ${meta.color}`}
                >
                  {t(meta.labelKey)}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-1" align="start">
                <p className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{t("projectStatus.changeStatus", "Ändra status")}</p>
                {availableStatuses.map((s) => {
                  const sMeta = STATUS_META[s];
                  return (
                    <button
                      key={s}
                      type="button"
                      className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-accent text-left transition-colors"
                      onClick={() => handleStatusSelect(s)}
                    >
                      <span className={`w-2 h-2 rounded-full ${sMeta.color.split(" ")[0]}`} />
                      {t(sMeta.labelKey)}
                    </button>
                  );
                })}
              </PopoverContent>
            </Popover>
          ) : (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${meta.color}`}
            >
              {t(meta.labelKey)}
            </span>
          )}
          {actions && (
            <>
              <div className="flex-1" />
              {actions}
            </>
          )}
        </div>

        {(project.address || project.description) && (
          <div className="flex flex-col gap-0.5">
            {project.address && (
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3 shrink-0" />
                {project.address}
              </p>
            )}
            {project.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {project.description}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Confirmation dialog: Planning → Active */}
      <AlertDialog open={!!confirmStatus} onOpenChange={(open) => { if (!open) setConfirmStatus(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              {t("projectStatus.confirmActivateTitle", "Starta projektet?")}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>{t("projectStatus.confirmActivateDesc", "När du ändrar till Pågående:")}</p>
              <ul className="list-disc list-inside text-sm space-y-1">
                <li>{t("projectStatus.confirmActivatePoint1", "Planeringsvyn ersätts av projektledningsvyn")}</li>
                <li>{t("projectStatus.confirmActivatePoint2", "Arbeten, rum och budget behålls")}</li>
                <li>{t("projectStatus.confirmActivatePoint3", "Du kan inte gå tillbaka till planeringsstatus")}</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmStatusChange}>
              {t("projectStatus.confirmActivateAction", "Ja, starta projektet")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

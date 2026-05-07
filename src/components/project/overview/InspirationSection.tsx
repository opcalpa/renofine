import { useState, useRef, useCallback, useEffect, lazy, Suspense } from "react";
import { usePersistedPreference } from "@/hooks/usePersistedPreference";
import { useTranslation } from "react-i18next";
import { CommentsSection } from "@/components/comments/CommentsSection";
import { supabase } from "@/integrations/supabase/client";
import { MOODBOARD_BACKGROUNDS, hexLuminance, stablePhotoEntityId } from "./inspiration/types";
import { useInspirationData } from "./inspiration/hooks/useInspirationData";
import { useInspirationActions } from "./inspiration/hooks/useInspirationActions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/currency";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ImageIcon,
  Camera,
  Link2,
  Upload,
  X,
  Trash2,
  ShoppingCart,
  Sparkles,
  Home,
  Hammer,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Type,
  Plus,
  LayoutGrid,
  Palette,
  Settings,
  Clock,
  Loader2,
  Maximize2,
  Pencil,
  Columns3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import type { InspirationSectionProps } from "./inspiration/types";

export function InspirationSection({ projectId, currency, isPlanning = false }: InspirationSectionProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedRoom, setSelectedRoom] = useState<string>("all");
  const [dragging, setDragging] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const [editingCaption, setEditingCaption] = useState<string | null>(null);
  const [captionDraft, setCaptionDraft] = useState("");
  const [baPhase, setBaPhase] = useState<"before" | "during" | "after">("before");
  const [baViewMode, setBaViewMode] = useState<"gallery" | "compare">("gallery");
  const [inspoView, setInspoView] = usePersistedPreference<"gallery" | "moodboard" | "beforeafter">("inspo-view-mode", "gallery");
  const [collapsed, setCollapsed] = usePersistedPreference("inspo-collapsed", false);
  const [moodboardBg, setMoodboardBg] = usePersistedPreference("moodboard-bg", "#f5f0eb");
  const [moodboardGap, setMoodboardGap] = usePersistedPreference("moodboard-gap", true);
  const [moodboardGapSize, setMoodboardGapSize] = usePersistedPreference("moodboard-gap-size", 8);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [fullscreenMoodboard, setFullscreenMoodboard] = useState(false);
  const [dragPhotoId, setDragPhotoId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const moodboardGridRef = useRef<HTMLDivElement>(null);
  const moodboardWrapperRef = useRef<HTMLDivElement>(null);
  const moodboardInnerRef = useRef<HTMLDivElement>(null);
  const [mbZoom, setMbZoom] = useState(1);
  const mbInitialScale = useRef(1);
  const inspoRef = useRef<HTMLDivElement>(null);

  // ---- Data hook ----
  const {
    rooms, allPhotos, beforePhotos, materialCards, filteredPhotos,
    beforeAfterByRoom, allGalleryPhotos, totalCount, rawData: data, tasks,
  } = useInspirationData(projectId, selectedRoom);

  // ---- Actions hook ----
  const {
    uploading, baUploading, handleUpload, handleBeforeAfterUpload, handleUrlImport,
    urlInput, setUrlInput, showUrlInput, setShowUrlInput,
    assignPhoto, deletePhoto, updateCaption,
    createRoomAndLink, newRoomName, setNewRoomName, creatingRoom,
    updateGridSpan, toggleCircle, saveCropTransform, reorderPhotos,
  } = useInspirationActions(projectId, inspoView, baPhase, selectedRoom, filteredPhotos, setEditingCaption);

  // Check for room filter deep-link from room details
  useEffect(() => {
    try {
      const stored = localStorage.getItem("inspo-room-filter");
      if (stored) {
        const roomId = JSON.parse(stored) as string;
        localStorage.removeItem("inspo-room-filter");
        setSelectedRoom(roomId);
        setCollapsed(false);
        // Scroll into view after render
        setTimeout(() => inspoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 200);
      }
    } catch { /* ignore */ }
  }, []);

  // Drag and drop
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) handleUpload(e.dataTransfer.files);
  };


  const hasPhotos = totalCount > 0;

  // Gallery navigation
  const openGallery = (index: number) => setGalleryIndex(index);
  const openGalleryById = (photoId: string) => {
    const idx = allGalleryPhotos.findIndex((p) => p.id === photoId);
    if (idx !== -1) setGalleryIndex(idx);
  };
  const closeGallery = () => { setGalleryIndex(null); setEditingCaption(null); };
  const galleryPhoto = galleryIndex !== null ? allGalleryPhotos[galleryIndex] : null;
  const galleryPrev = () => setGalleryIndex((i) => i !== null && i > 0 ? i - 1 : i);
  const galleryNext = () => setGalleryIndex((i) => i !== null && i < allGalleryPhotos.length - 1 ? i + 1 : i);

  return (
    <Card ref={inspoRef}>
      <CardContent className="p-4 sm:p-5">
        {/* Header */}
        <div className={cn("flex items-center gap-2 flex-wrap", !collapsed && "mb-3")}>
          {/* Section title */}
          <div className="flex rounded-full border overflow-hidden">
            <button
              type="button"
              onClick={() => { if (inspoView === "beforeafter") setInspoView("gallery"); else setCollapsed(!collapsed); }}
              className={cn(
                "text-xs font-medium flex items-center gap-1.5 px-3 py-1.5 transition-colors",
                inspoView !== "beforeafter"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              <Sparkles className="h-3 w-3" />
              {t("inspiration.title")}
              {inspoView !== "beforeafter" && (
                <ChevronDown className={cn("h-3 w-3 transition-transform", collapsed && "-rotate-90")} />
              )}
            </button>
            <button
              type="button"
              onClick={() => { setInspoView("beforeafter"); setCollapsed(false); }}
              className={cn(
                "text-xs font-medium flex items-center gap-1.5 px-3 py-1.5 transition-colors border-l",
                inspoView === "beforeafter"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              <Camera className="h-3 w-3" />
              {t("inspiration.beforePhotos", "Före-bilder")}
              {beforePhotos.length > 0 && (
                <span className="text-[10px] opacity-75">({beforePhotos.length})</span>
              )}
            </button>
          </div>
          {/* Room filter — shared across all views */}
          {hasPhotos && rooms.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className="flex items-center gap-1 px-2 py-1 rounded-md border text-xs hover:bg-accent transition-colors">
                  <Home className="h-3 w-3 text-muted-foreground" />
                  {selectedRoom === "all"
                    ? `${t("common.all")} (${allPhotos.length})`
                    : selectedRoom === "untagged"
                      ? t("inspiration.untagged")
                      : rooms.find((r) => r.id === selectedRoom)?.name || t("common.all")}
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-44 p-1" align="end">
                <button type="button" className={cn("flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded", selectedRoom === "all" ? "bg-accent font-medium" : "hover:bg-accent")} onClick={() => setSelectedRoom("all")}>
                  {t("common.all")} ({allPhotos.length})
                </button>
                {rooms.map((room) => {
                  const count = allPhotos.filter((p) => p.roomId === room.id).length;
                  return (
                    <button key={room.id} type="button" className={cn("flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded", selectedRoom === room.id ? "bg-accent font-medium" : "hover:bg-accent")} onClick={() => setSelectedRoom(room.id)}>
                      {room.name} {count > 0 && <span className="text-muted-foreground">({count})</span>}
                    </button>
                  );
                })}
                {allPhotos.some((p) => !p.roomId) && (
                  <button type="button" className={cn("flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded", selectedRoom === "untagged" ? "bg-accent font-medium" : "hover:bg-accent")} onClick={() => setSelectedRoom("untagged")}>
                    {t("inspiration.untagged")} ({allPhotos.filter((p) => !p.roomId).length})
                  </button>
                )}
              </PopoverContent>
            </Popover>
          )}
          {/* Before/After: gallery/compare toggle + phase pills */}
          {inspoView === "beforeafter" && (
            <>
            <div className="flex rounded-md border bg-muted/30 p-0.5">
              <button
                type="button"
                onClick={() => setBaViewMode("gallery")}
                title={t("inspiration.gallery", "Galleri")}
                className={cn("p-1 rounded transition-colors", baViewMode === "gallery" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setBaViewMode("compare")}
                title={t("inspiration.compareView", "Jämför före/efter")}
                className={cn("p-1 rounded transition-colors", baViewMode === "compare" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                <Columns3 className="h-3.5 w-3.5" />
              </button>
            </div>
            {baViewMode === "compare" && (
            <BeforeAfterUploader
              selectedPhase={baPhase}
              onPhaseChange={setBaPhase}
            />
            )}
            </>
          )}
          {/* Gallery/Moodboard sub-toggle — only for Inspiration tab, hidden in beforeafter */}
          {hasPhotos && inspoView !== "beforeafter" && (
            <div className="flex rounded-md border bg-muted/30 p-0.5">
              <button
                type="button"
                onClick={() => setInspoView("gallery")}
                title={t("inspiration.gallery", "Galleri")}
                className={cn("p-1 rounded transition-colors", inspoView === "gallery" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setInspoView("moodboard")}
                title="Moodboard"
                className={cn("p-1 rounded transition-colors", inspoView === "moodboard" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                <Palette className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {/* Moodboard settings — only when moodboard active */}
          {hasPhotos && inspoView === "moodboard" && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="p-1 rounded-md border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  title={t("common.settings", "Inställningar")}
                >
                  <Settings className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-3 space-y-3" align="end">
                <div className="space-y-1.5">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{t("inspiration.background", "Bakgrund")}</p>
                  <div className="grid grid-cols-4 gap-2">
                    {MOODBOARD_BACKGROUNDS.map((bg) => (
                      <button
                        key={bg.id}
                        type="button"
                        title={bg.label}
                        className={cn(
                          "h-7 w-7 rounded-full border-2 transition-transform hover:scale-110",
                          moodboardBg === bg.color ? "border-primary scale-110" : "border-muted"
                        )}
                        style={{ backgroundColor: bg.color }}
                        onClick={() => setMoodboardBg(bg.color)}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5 pt-1 border-t">
                    <input
                      type="color"
                      value={moodboardBg}
                      onChange={(e) => setMoodboardBg(e.target.value)}
                      className="h-6 w-6 rounded cursor-pointer border-0 p-0 bg-transparent"
                    />
                    <input
                      type="text"
                      value={moodboardBg}
                      onChange={(e) => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) setMoodboardBg(e.target.value); }}
                      className="flex-1 px-1.5 py-0.5 text-[10px] font-mono rounded border bg-background w-16 focus:outline-none focus:ring-1 focus:ring-primary"
                      maxLength={7}
                    />
                  </div>
                </div>
                <div className="space-y-2 pt-1 border-t">
                  <div className="flex items-center justify-between">
                    <span className="text-xs">{t("inspiration.withGap", "Med mellanrum")}</span>
                    <button
                      type="button"
                      onClick={() => setMoodboardGap(!moodboardGap)}
                      className={cn(
                        "h-5 w-9 rounded-full transition-colors relative",
                        moodboardGap ? "bg-primary" : "bg-muted"
                      )}
                    >
                      <div className={cn(
                        "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
                        moodboardGap ? "translate-x-4" : "translate-x-0.5"
                      )} />
                    </button>
                  </div>
                  {moodboardGap && (
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={2}
                        max={24}
                        step={2}
                        value={moodboardGapSize}
                        onChange={(e) => setMoodboardGapSize(parseInt(e.target.value))}
                        className="flex-1 h-1 accent-primary cursor-pointer"
                      />
                      <span className="text-[10px] text-muted-foreground tabular-nums w-6 text-right">{moodboardGapSize}px</span>
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          )}
          {hasPhotos && inspoView === "moodboard" && (
            <button
              type="button"
              onClick={() => setFullscreenMoodboard(true)}
              className="p-1 rounded-md border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title={t("inspiration.fullscreen", "Helskärm")}
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          )}
          <Popover open={addMenuOpen} onOpenChange={setAddMenuOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="ml-auto p-1 rounded-md border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  title={t("inspiration.add")}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-1" align="end">
                <button
                  type="button"
                  className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent text-left"
                  onClick={() => { setAddMenuOpen(false); setTimeout(() => fileInputRef.current?.click(), 150); }}
                >
                  <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                  {t("inspiration.upload")}
                </button>
                <button
                  type="button"
                  className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent text-left sm:hidden"
                  onClick={() => {
                    setAddMenuOpen(false);
                    const input = fileInputRef.current;
                    if (input) { setTimeout(() => { input.setAttribute("capture", "environment"); input.click(); input.removeAttribute("capture"); }, 150); }
                  }}
                >
                  <Camera className="h-3.5 w-3.5 text-muted-foreground" />
                  {t("inspiration.camera")}
                </button>
                <button
                  type="button"
                  className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent text-left"
                  onClick={() => { setAddMenuOpen(false); setTimeout(() => setShowUrlInput(true), 100); }}
                >
                  <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                  {t("inspiration.fromUrl")}
                </button>
              </PopoverContent>
            </Popover>
        </div>

        {/* Collapsible content */}
        {!collapsed && (<>

        {/* ===== GALLERY VIEW ===== */}
        {inspoView === "gallery" && (
        <>
        {/* Photo grid + drop zone */}
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={cn(
            "rounded-xl border-2 border-dashed transition-colors min-h-[120px]",
            dragging ? "border-primary bg-primary/5" : hasPhotos ? "border-transparent" : "border-muted",
          )}
        >
          {filteredPhotos.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 p-1">
              {filteredPhotos.map((photo, idx) => (
                <div
                  key={photo.id}
                  className="relative aspect-square rounded-lg overflow-hidden group cursor-pointer"
                  onClick={() => openGallery(idx)}
                >
                  <img
                    src={photo.url}
                    alt={photo.caption || ""}
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    loading="lazy"
                  />
                  {/* Badges — top right */}
                  <div className="absolute top-1 right-1 flex gap-1">
                    {photo.source === "pinterest" && (
                      <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-red-100 text-red-700">Pin</Badge>
                    )}
                    {photo.roomName && (
                      <Badge variant="secondary" className="text-[9px] px-1 py-0">{photo.roomName}</Badge>
                    )}
                  </div>

                  {/* Caption overlay — editable inline or display */}
                  {editingCaption === photo.id ? (
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 pb-1.5 pt-6 z-20" onClick={(e) => e.stopPropagation()}>
                      <input
                        autoFocus
                        type="text"
                        className="w-full px-1.5 py-1 text-[10px] text-white bg-white/15 backdrop-blur-sm rounded border border-white/20 focus:outline-none focus:ring-1 focus:ring-white/50 placeholder:text-white/40"
                        value={captionDraft}
                        onChange={(e) => setCaptionDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); updateCaption(photo.id, captionDraft); }
                          if (e.key === "Escape") setEditingCaption(null);
                        }}
                        onBlur={() => { updateCaption(photo.id, captionDraft); }}
                        placeholder={t("inspiration.captionPlaceholder", "Beskriv din inspiration...")}
                      />
                    </div>
                  ) : photo.caption ? (
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-5 pointer-events-none">
                      <p className="text-[10px] text-white/90 truncate">{photo.caption}</p>
                    </div>
                  ) : null}

                  {/* Hover action bar */}
                  <div className={cn(
                    "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 flex items-center gap-1 transition-opacity",
                    editingCaption === photo.id ? "opacity-0 pointer-events-none" : "opacity-0 group-hover:opacity-100"
                  )}>
                    {/* Edit caption */}
                    <button
                      type="button"
                      className="h-6 w-6 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition-colors"
                      onClick={(e) => { e.stopPropagation(); setEditingCaption(photo.id); setCaptionDraft(photo.caption || ""); }}
                    >
                      <Pencil className="h-3 w-3 text-white" />
                    </button>
                    {/* Link to entity */}
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="h-6 w-6 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Link2 className="h-3 w-3 text-white" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-48 p-1" align="start" side="top" onClick={(e) => e.stopPropagation()}>
                        <p className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase">{t("inspiration.linkRoom")}</p>
                        {rooms.map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent text-left"
                            onClick={() => assignPhoto(photo.id, "room", r.id)}
                          >
                            <Home className="h-3 w-3 text-muted-foreground" />
                            {r.name}
                          </button>
                        ))}
                        <div className="flex items-center gap-1 px-1 py-1">
                          <input
                            type="text"
                            placeholder={t("inspiration.newRoom", "Nytt rum...")}
                            className="flex-1 px-2 py-1 text-xs rounded border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                            value={newRoomName}
                            onChange={(e) => setNewRoomName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") createRoomAndLink(newRoomName, photo.id); }}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <button
                            type="button"
                            className="h-6 w-6 rounded flex items-center justify-center hover:bg-accent text-muted-foreground hover:text-primary"
                            onClick={(e) => { e.stopPropagation(); createRoomAndLink(newRoomName, photo.id); }}
                            disabled={!newRoomName.trim() || creatingRoom}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {(tasks?.length ?? 0) > 0 && (
                          <>
                            <p className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase mt-1">{t("inspiration.linkTask")}</p>
                            <div className="max-h-[120px] overflow-y-auto">
                              {(tasks || []).slice(0, 15).map((task) => (
                                <button
                                  key={task.id}
                                  type="button"
                                  className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent text-left"
                                  onClick={() => assignPhoto(photo.id, "task", task.id)}
                                >
                                  <Hammer className="h-3 w-3 text-muted-foreground" />
                                  <span className="truncate">{task.title}</span>
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                        {photo.roomId && (
                          <button
                            type="button"
                            className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent text-left text-muted-foreground mt-1 border-t"
                            onClick={() => assignPhoto(photo.id, "project", projectId)}
                          >
                            <X className="h-3 w-3" />
                            {t("inspiration.unlink")}
                          </button>
                        )}
                      </PopoverContent>
                    </Popover>

                    {/* Delete */}
                    <button
                      type="button"
                      className="h-6 w-6 rounded-full bg-white/20 hover:bg-red-500/80 flex items-center justify-center transition-colors"
                      onClick={(e) => { e.stopPropagation(); deletePhoto(photo.id); }}
                    >
                      <Trash2 className="h-3 w-3 text-white" />
                    </button>
                  </div>
                </div>
              ))}

              {/* Add more tile — same popover as header button */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="aspect-square rounded-lg border-2 border-dashed border-muted flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                  >
                    <Upload className="h-5 w-5" />
                    <span className="text-[10px]">{t("inspiration.addMore")}</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-1" align="start" side="top">
                  <label
                    htmlFor={`inspo-file-${projectId}`}
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent text-left cursor-pointer"
                  >
                    <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                    {t("inspiration.upload")}
                  </label>
                  <button
                    type="button"
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent text-left"
                    onClick={() => setShowUrlInput(true)}
                  >
                    <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                    {t("inspiration.fromUrl")}
                  </button>
                </PopoverContent>
              </Popover>
            </div>
          ) : (
            /* Empty state — single upload tile matching gallery style */
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 p-1">
              <label
                htmlFor={uploading ? undefined : `inspo-file-${projectId}`}
                className={cn(
                  "aspect-square rounded-lg border-2 border-dashed border-muted flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary hover:text-primary transition-colors cursor-pointer",
                  uploading && "opacity-50 pointer-events-none"
                )}
              >
                <Upload className="h-5 w-5" />
                <span className="text-[10px]">{t("inspiration.addMore", "Lägg till")}</span>
              </label>
            </div>
          )}
        </div>

        {/* URL input popover — anchored to bottom of section, closes on outside click */}
        <Popover open={showUrlInput} onOpenChange={(open) => { if (!open) { setShowUrlInput(false); setUrlInput(""); } }}>
          <PopoverTrigger asChild>
            <span className="sr-only" />
          </PopoverTrigger>
          <PopoverContent className="w-[min(500px,90vw)] p-3" side="top" align="start">
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); handleUrlImport(); }}>
              <input
                type="url"
                autoFocus
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder={t("inspiration.urlPlaceholder")}
                className="flex-1 px-3 py-1.5 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <Button size="sm" type="submit" disabled={!urlInput.trim() || uploading}>
                {t("common.add")}
              </Button>
            </form>
          </PopoverContent>
        </Popover>

        {/* Material cards — only show when viewing a specific room */}
        {selectedRoom !== "all" && selectedRoom !== "untagged" && (() => {
          const roomMats = materialCards.filter((m) => m.roomId === selectedRoom && m.photoUrl);
          if (roomMats.length === 0) return null;
          return (
            <div className="mt-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <ShoppingCart className="h-3 w-3" />
                {t("inspiration.linkedMaterials")}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {roomMats.map((mat) => (
                  <div key={mat.id} className="rounded-lg border overflow-hidden bg-card">
                    <div className="aspect-video overflow-hidden">
                      <img src={mat.photoUrl!} alt={mat.name} className="w-full h-full object-cover" loading="lazy" />
                    </div>
                    <div className="p-2">
                      <p className="text-xs font-medium truncate">{mat.name}</p>
                      {mat.price > 0 && <p className="text-[10px] text-muted-foreground">{formatCurrency(mat.price, currency)}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        </>
        )}

        {/* ===== MOODBOARD VIEW ===== */}
        {inspoView === "moodboard" && (
          <div className="space-y-3">
            {/* Interactive grid — pinch-to-zoom on mobile, scrollable on desktop */}
            <div
              ref={moodboardWrapperRef}
              className="rounded-xl overflow-hidden transition-colors -mx-1 px-1 sm:overflow-x-auto sm:overflow-y-hidden"
              style={{ touchAction: mbZoom <= mbInitialScale.current ? "pan-y" : "none" }}
            >
            <div
              ref={moodboardInnerRef}
              className="rounded-xl overflow-hidden transition-colors min-w-[600px]"
              style={{
                backgroundColor: moodboardBg,
                padding: moodboardGap ? `${moodboardGapSize + 4}px` : "0",
                zoom: mbZoom < 1 ? mbZoom : undefined,
              }}
              onClick={() => setSelectedPhotoId(null)}
            >
              {filteredPhotos.length === 0 ? (
                <label
                  htmlFor={uploading ? undefined : `inspo-file-${projectId}`}
                  className="flex flex-col items-center justify-center py-12 text-sm cursor-pointer hover:opacity-70 transition-opacity gap-2"
                  style={{ color: hexLuminance(moodboardBg) < 128 ? "#999" : "#888" }}
                >
                  <Upload className="h-5 w-5" />
                  {t("inspiration.emptyTitle")}
                </label>
              ) : (
                <div
                  ref={moodboardGridRef}
                  className="grid grid-cols-6 auto-rows-[80px] sm:auto-rows-[100px] md:auto-rows-[120px]"
                  style={{ gap: moodboardGap ? `${moodboardGapSize}px` : "0px" }}
                >
                  {filteredPhotos
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((photo) => {
                      const isCircle = photo.cropShape === "circle";
                      // For circles: compute col-span so cell width ≈ cell height (square)
                      let circleColSpan = photo.gridColSpan;
                      if (isCircle && moodboardGridRef.current) {
                        const colW = moodboardGridRef.current.clientWidth / 6;
                        const gap = moodboardGap ? moodboardGapSize : 0;
                        const rowH = 120; // md auto-rows
                        const totalH = photo.gridRowSpan * rowH + (photo.gridRowSpan - 1) * gap;
                        circleColSpan = Math.max(1, Math.min(6, Math.round((totalH + gap) / (colW + gap))));
                      }
                      const spans = { col: isCircle ? circleColSpan : photo.gridColSpan, row: photo.gridRowSpan };
                      const isSelected = selectedPhotoId === photo.id;
                      const isDragging = dragPhotoId === photo.id;
                      const isDragOver = dragOverId === photo.id;
                      const isDark = hexLuminance(moodboardBg) < 128;

                      return (
                        <div
                          key={photo.id}
                          draggable={!isSelected}
                          onDragStart={(e) => { if (!isSelected) { setDragPhotoId(photo.id); e.dataTransfer.effectAllowed = "move"; } }}
                          onDragEnd={() => { setDragPhotoId(null); setDragOverId(null); }}
                          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverId(photo.id); }}
                          onDragLeave={() => setDragOverId(null)}
                          onDrop={(e) => { e.preventDefault(); if (dragPhotoId) reorderPhotos(dragPhotoId, photo.id); setDragPhotoId(null); setDragOverId(null); }}
                          className={cn(
                            "relative group transition-all",
                            isSelected && isCircle ? "overflow-visible" : "overflow-hidden",
                            !isSelected && "cursor-grab active:cursor-grabbing",
                            isDragging && "opacity-40 scale-95",
                            isDragOver && !isDragging && "ring-2 ring-primary ring-offset-2",
                            isSelected && "ring-2 ring-primary ring-offset-1",
                          )}
                          style={{
                            gridColumn: `span ${Math.min(spans.col, 6)}`,
                            gridRow: `span ${spans.row}`,
                          }}
                          onClick={(e) => { e.stopPropagation(); setSelectedPhotoId(isSelected ? null : photo.id); }}
                          onDoubleClick={(e) => { e.stopPropagation(); openGallery(filteredPhotos.indexOf(photo)); }}
                          ref={(el) => {
                            if (!el) return;
                            el.onwheel = null;
                          }}
                          onMouseDown={(e) => {
                            if (!isSelected || e.button !== 0) return;
                            if ((e.target as HTMLElement).closest('button, input')) return;
                            e.preventDefault();
                            const el = e.currentTarget as HTMLElement;
                            const img = el.querySelector('img');
                            const startX = e.clientX;
                            const startY = e.clientY;
                            const startOx = photo.cropOffsetX;
                            const startOy = photo.cropOffsetY;
                            const onMove = (me: MouseEvent) => {
                              const dx = (me.clientX - startX) * 0.15;
                              const dy = (me.clientY - startY) * 0.15;
                              const nx = Math.max(0, Math.min(100, startOx - dx));
                              const ny = Math.max(0, Math.min(100, startOy - dy));
                              if (img) img.style.objectPosition = `${nx}% ${ny}%`;
                            };
                            const onUp = (me: MouseEvent) => {
                              const dx = (me.clientX - startX) * 0.15;
                              const dy = (me.clientY - startY) * 0.15;
                              const nx = Math.max(0, Math.min(100, startOx - dx));
                              const ny = Math.max(0, Math.min(100, startOy - dy));
                              saveCropTransform(photo.id, photo.cropZoom, nx, ny);
                              window.removeEventListener("mousemove", onMove);
                              window.removeEventListener("mouseup", onUp);
                            };
                            window.addEventListener("mousemove", onMove);
                            window.addEventListener("mouseup", onUp);
                          }}
                        >
                          {/* Image wrapper — clips at circle boundary */}
                          <div
                            className={cn("overflow-hidden", isCircle ? "rounded-full absolute inset-0 m-auto" : "absolute inset-0")}
                            style={isCircle
                              ? { aspectRatio: "1", maxHeight: "100%", maxWidth: "100%" }
                              : { borderRadius: moodboardGap ? "6px" : "0" }
                            }
                          >
                            <img
                              src={photo.url}
                              alt={photo.caption || ""}
                              className="w-full h-full object-cover"
                              style={{
                                objectPosition: `${photo.cropOffsetX}% ${photo.cropOffsetY}%`,
                                transform: photo.cropZoom > 1 ? `scale(${photo.cropZoom})` : undefined,
                              }}
                              loading="lazy"
                              draggable={false}
                            />
                            {/* Caption overlay — editable inline or display */}
                            {editingCaption === photo.id && !isCircle ? (
                              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 pb-1.5 pt-6 z-20" onClick={(e) => e.stopPropagation()}>
                                <input
                                  autoFocus
                                  type="text"
                                  className="w-full px-1.5 py-1 text-[10px] text-white bg-white/15 backdrop-blur-sm rounded border border-white/20 focus:outline-none focus:ring-1 focus:ring-white/50 placeholder:text-white/40"
                                  value={captionDraft}
                                  onChange={(e) => setCaptionDraft(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") { e.preventDefault(); updateCaption(photo.id, captionDraft); }
                                    if (e.key === "Escape") setEditingCaption(null);
                                  }}
                                  onBlur={() => { updateCaption(photo.id, captionDraft); }}
                                  placeholder={t("inspiration.captionPlaceholder", "Beskriv din inspiration...")}
                                />
                              </div>
                            ) : photo.caption && !isCircle ? (
                              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 pb-1.5 pt-5 pointer-events-none">
                                <p className="text-[10px] text-white/90 truncate">{photo.caption}</p>
                              </div>
                            ) : null}
                          </div>
                          {/* Room badge */}
                          {photo.roomName && !isCircle && (
                            <div className={cn("absolute top-1 left-1 transition-opacity", isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
                              <Badge variant="secondary" className={cn("text-[9px] px-1 py-0", isDark ? "bg-white/20 text-white" : "")}>
                                {photo.roomName}
                              </Badge>
                            </div>
                          )}
                          {/* Hover action bar — link room + edit caption + delete */}
                          <div className={cn(
                            "absolute bottom-1 left-1 flex items-center gap-1 transition-opacity z-10",
                            editingCaption === photo.id ? "opacity-0 pointer-events-none" : isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                          )}>
                            {/* Edit caption */}
                            {!isCircle && (
                              <button
                                type="button"
                                className="h-6 w-6 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center transition-colors"
                                onClick={(e) => { e.stopPropagation(); setEditingCaption(photo.id); setCaptionDraft(photo.caption || ""); }}
                              >
                                <Pencil className="h-3 w-3 text-white" />
                              </button>
                            )}
                            <Popover>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  className="h-6 w-6 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center transition-colors"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Link2 className="h-3 w-3 text-white" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-48 p-1" align="start" side="top">
                                <p className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase">{t("inspiration.linkRoom")}</p>
                                {rooms.map((r) => (
                                  <button
                                    key={r.id}
                                    type="button"
                                    className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent text-left"
                                    onClick={() => assignPhoto(photo.id, "room", r.id)}
                                  >
                                    <Home className="h-3 w-3 text-muted-foreground" />
                                    {r.name}
                                  </button>
                                ))}
                                <div className="flex items-center gap-1 px-1 py-1">
                                  <input
                                    type="text"
                                    placeholder={t("inspiration.newRoom", "Nytt rum...")}
                                    className="flex-1 px-2 py-1 text-xs rounded border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                                    value={newRoomName}
                                    onChange={(e) => setNewRoomName(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter") createRoomAndLink(newRoomName, photo.id); }}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <button
                                    type="button"
                                    className="h-6 w-6 rounded flex items-center justify-center hover:bg-accent text-muted-foreground hover:text-primary"
                                    onClick={(e) => { e.stopPropagation(); createRoomAndLink(newRoomName, photo.id); }}
                                    disabled={!newRoomName.trim() || creatingRoom}
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                                {photo.roomId && (
                                  <button
                                    type="button"
                                    className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent text-left text-muted-foreground mt-1 border-t"
                                    onClick={() => assignPhoto(photo.id, "project", projectId)}
                                  >
                                    <X className="h-3 w-3" />
                                    {t("inspiration.unlink")}
                                  </button>
                                )}
                              </PopoverContent>
                            </Popover>
                            <button
                              type="button"
                              className="h-6 w-6 rounded-full bg-black/40 hover:bg-red-500/80 flex items-center justify-center transition-colors"
                              onClick={(e) => { e.stopPropagation(); deletePhoto(photo.id); }}
                            >
                              <Trash2 className="h-3 w-3 text-white" />
                            </button>
                          </div>
                          {/* Controls — circle toggle + zoom */}
                          {isSelected && (
                            <div
                              className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-black/50 backdrop-blur-sm rounded-full px-2 py-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {/* Circle toggle */}
                              <button
                                type="button"
                                className={cn(
                                  "h-5 w-5 rounded-full flex items-center justify-center text-[11px] transition-colors",
                                  isCircle ? "bg-white text-black" : "text-white/60 hover:text-white"
                                )}
                                onClick={() => toggleCircle(photo.id, isCircle)}
                                title="Circle"
                              >○</button>
                              <div className="w-px h-3 bg-white/20" />
                              {/* Zoom slider */}
                              <button
                                type="button"
                                className="text-[9px] text-white/60 hover:text-white px-0.5"
                                onClick={() => saveCropTransform(photo.id, Math.max(1, photo.cropZoom - 0.2), photo.cropOffsetX, photo.cropOffsetY)}
                              >−</button>
                              <input
                                type="range"
                                min={1}
                                max={4}
                                step={0.1}
                                value={photo.cropZoom}
                                onChange={(e) => {
                                  const z = parseFloat(e.target.value);
                                  saveCropTransform(photo.id, z, photo.cropOffsetX, photo.cropOffsetY);
                                }}
                                className="w-14 h-1 accent-white cursor-pointer"
                                style={{ WebkitAppearance: "none", appearance: "none", background: "rgba(255,255,255,0.3)", borderRadius: "2px" }}
                              />
                              <button
                                type="button"
                                className="text-[9px] text-white/60 hover:text-white px-0.5"
                                onClick={() => saveCropTransform(photo.id, Math.min(4, photo.cropZoom + 0.2), photo.cropOffsetX, photo.cropOffsetY)}
                              >+</button>
                              <span className="text-[9px] text-white/70 tabular-nums w-6 text-center">{photo.cropZoom.toFixed(1)}×</span>
                            </div>
                          )}
                          {/* Resize handle — bottom-right corner drag */}
                          {isSelected && (
                            <div
                              className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize z-10 flex items-end justify-end"
                              onClick={(e) => e.stopPropagation()}
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                const startX = e.clientX;
                                const startY = e.clientY;
                                const startCol = photo.gridColSpan;
                                const startRow = photo.gridRowSpan;
                                const gridEl = (e.target as HTMLElement).closest('.grid');
                                const cellW = gridEl ? gridEl.clientWidth / 6 : 80;
                                const cellH = 120;
                                const onMove = (me: MouseEvent) => {
                                  const dx = me.clientX - startX;
                                  const dy = me.clientY - startY;
                                  if (isCircle) {
                                    // Circle: uniform resize — use the larger delta
                                    const delta = Math.abs(dx) > Math.abs(dy) ? dx / cellW : dy / cellH;
                                    const newSpan = Math.max(1, Math.min(6, Math.round(startCol + delta)));
                                    updateGridSpan(photo.id, newSpan, newSpan);
                                  } else {
                                    const newCol = Math.max(1, Math.min(6, Math.round(startCol + dx / cellW)));
                                    const newRow = Math.max(1, Math.min(6, Math.round(startRow + dy / cellH)));
                                    updateGridSpan(photo.id, newCol, newRow);
                                  }
                                };
                                const onUp = () => {
                                  window.removeEventListener("mousemove", onMove);
                                  window.removeEventListener("mouseup", onUp);
                                };
                                window.addEventListener("mousemove", onMove);
                                window.addEventListener("mouseup", onUp);
                              }}
                            >
                              <svg width="10" height="10" viewBox="0 0 10 10" className="text-white drop-shadow-md">
                                <path d="M9 1L1 9M9 5L5 9M9 9L9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                              </svg>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
            </div>
          </div>
        )}

        {/* Fullscreen moodboard dialog */}
        <Dialog open={fullscreenMoodboard} onOpenChange={setFullscreenMoodboard}>
          <DialogContent
            className="p-0 border-0 rounded-none [&>button]:z-50 [&>button]:text-white [&>button]:bg-black/40 [&>button]:backdrop-blur-sm [&>button]:rounded-full [&>button]:h-10 [&>button]:w-10 [&>button]:top-4 [&>button]:right-4"
            style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", maxWidth: "100vw", maxHeight: "100vh", transform: "none" }}
          >
            <DialogTitle className="sr-only">{t("inspiration.moodboard", "Moodboard")}</DialogTitle>
            <div
              className="w-full h-full overflow-auto"
              style={{ backgroundColor: moodboardBg || "#111" }}
            >
              {filteredPhotos.length === 1 ? (
                /* Single image — hero fullscreen */
                <div className="w-full h-full flex items-center justify-center p-4">
                  <img
                    src={filteredPhotos[0].url}
                    alt={filteredPhotos[0].caption || ""}
                    className="max-w-full max-h-full object-contain rounded-lg"
                    onClick={() => { setFullscreenMoodboard(false); openGallery(0); }}
                    style={{ cursor: "pointer" }}
                  />
                </div>
              ) : (
                /* Multi image — masonry grid */
                <div
                  className="grid grid-cols-4 sm:grid-cols-6 w-full"
                  style={{
                    gap: moodboardGap ? `${moodboardGapSize}px` : "0px",
                    padding: moodboardGap ? `${moodboardGapSize + 4}px` : "0",
                    gridAutoRows: `minmax(${Math.max(150, Math.floor((typeof window !== "undefined" ? window.innerHeight : 800) / 3))}px, auto)`,
                  }}
                >
                  {filteredPhotos
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((photo, idx) => (
                      <div
                        key={photo.id}
                        className="relative overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                        style={{
                          gridColumn: `span ${Math.min(photo.gridColSpan, 6)}`,
                          gridRow: `span ${photo.gridRowSpan}`,
                          borderRadius: photo.cropShape === "circle" ? "50%" : moodboardGap ? "8px" : "0",
                        }}
                        onClick={() => { setFullscreenMoodboard(false); openGallery(idx); }}
                      >
                        <img
                          src={photo.url}
                          alt={photo.caption || ""}
                          className="absolute inset-0 w-full h-full"
                          style={{
                            objectFit: photo.fitMode || "cover",
                            objectPosition: photo.cropPosition || "center",
                          }}
                        />
                        {photo.caption && (
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-3 pb-2 pt-6 pointer-events-none">
                            <p className="text-white text-xs font-medium truncate">{photo.caption}</p>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* ===== BEFORE / AFTER VIEW ===== */}
        {inspoView === "beforeafter" && (
          <div className="space-y-4">
            {baViewMode === "gallery" ? (
              /* Gallery: simple grid of before photos */
              beforePhotos.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-center">
                  <Camera className="h-8 w-8 text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground mb-1">{t("inspiration.noBeforePhotos", "No before photos yet")}</p>
                  <p className="text-xs text-muted-foreground/60 mb-3">{t("inspiration.noBeforePhotosHint", "Upload photos of the current state before renovation starts")}</p>
                  <Button size="sm" variant="outline" onClick={() => { fileInputRef.current?.click(); }}>
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    {t("inspiration.upload")}
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 p-1">
                  {beforePhotos.map((photo, idx) => (
                    <div
                      key={photo.id}
                      className="relative group aspect-square rounded-lg overflow-hidden cursor-pointer"
                      onClick={() => openGalleryById(photo.id)}
                    >
                      <img
                        src={photo.url}
                        alt={photo.caption || ""}
                        className="w-full h-full object-cover transition-all group-hover:brightness-90"
                        loading="lazy"
                      />
                      {/* Room badge */}
                      {photo.roomName && (
                        <div className="absolute top-1 right-1">
                          <Badge variant="secondary" className="text-[9px] px-1 py-0">{photo.roomName}</Badge>
                        </div>
                      )}
                      {/* Caption overlay */}
                      {editingCaption === photo.id ? (
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 pb-1.5 pt-6 z-20" onClick={(e) => e.stopPropagation()}>
                          <input
                            autoFocus
                            type="text"
                            className="w-full px-1.5 py-1 text-[10px] text-white bg-white/15 backdrop-blur-sm rounded border border-white/20 focus:outline-none focus:ring-1 focus:ring-white/50 placeholder:text-white/40"
                            value={captionDraft}
                            onChange={(e) => setCaptionDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { e.preventDefault(); updateCaption(photo.id, captionDraft); }
                              if (e.key === "Escape") setEditingCaption(null);
                            }}
                            onBlur={() => updateCaption(photo.id, captionDraft)}
                            placeholder={t("inspiration.captionPlaceholder", "Beskriv bilden...")}
                          />
                        </div>
                      ) : photo.caption ? (
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-5 pointer-events-none">
                          <p className="text-[10px] text-white/90 truncate">{photo.caption}</p>
                        </div>
                      ) : null}
                      {/* Hover action bar — same as inspiration */}
                      <div className={cn(
                        "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 flex items-center gap-1 transition-opacity",
                        editingCaption === photo.id ? "opacity-0 pointer-events-none" : "opacity-0 group-hover:opacity-100"
                      )}>
                        <button
                          type="button"
                          className="h-6 w-6 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition-colors"
                          onClick={(e) => { e.stopPropagation(); setEditingCaption(photo.id); setCaptionDraft(photo.caption || ""); }}
                        >
                          <Pencil className="h-3 w-3 text-white" />
                        </button>
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="h-6 w-6 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Link2 className="h-3 w-3 text-white" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-48 p-1" align="start" side="top" onClick={(e) => e.stopPropagation()}>
                            <p className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase">{t("inspiration.linkRoom")}</p>
                            {rooms.map((r) => (
                              <button
                                key={r.id}
                                type="button"
                                className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent text-left"
                                onClick={(e) => { e.stopPropagation(); assignPhoto(photo.id, "room", r.id); }}
                              >
                                <Home className="h-3 w-3 text-muted-foreground" />
                                {r.name}
                              </button>
                            ))}
                            {(tasks?.length ?? 0) > 0 && (
                              <>
                                <p className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase mt-1">{t("inspiration.linkTask")}</p>
                                <div className="max-h-[120px] overflow-y-auto">
                                  {(tasks || []).slice(0, 15).map((task) => (
                                    <button
                                      key={task.id}
                                      type="button"
                                      className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent text-left"
                                      onClick={(e) => { e.stopPropagation(); assignPhoto(photo.id, "task", task.id); }}
                                    >
                                      <Hammer className="h-3 w-3 text-muted-foreground" />
                                      <span className="truncate">{task.title}</span>
                                    </button>
                                  ))}
                                </div>
                              </>
                            )}
                            {photo.roomId && (
                              <button
                                type="button"
                                className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent text-left text-muted-foreground mt-1 border-t"
                                onClick={(e) => { e.stopPropagation(); assignPhoto(photo.id, "project", projectId); }}
                              >
                                <X className="h-3 w-3" />
                                {t("inspiration.unlink")}
                              </button>
                            )}
                          </PopoverContent>
                        </Popover>
                        <button
                          type="button"
                          className="h-6 w-6 rounded-full bg-white/20 hover:bg-red-500/80 flex items-center justify-center transition-colors"
                          onClick={(e) => { e.stopPropagation(); deletePhoto(photo.id); }}
                        >
                          <Trash2 className="h-3 w-3 text-white" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {/* Add more tile */}
                  <label
                    htmlFor={`inspo-file-${projectId}`}
                    className="aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 cursor-pointer hover:bg-accent/50 transition-colors text-muted-foreground"
                  >
                    <Upload className="h-5 w-5" />
                    <span className="text-[10px]">{t("inspiration.addMore", "Lägg till")}</span>
                  </label>
                </div>
              )
            ) : (
              /* Compare: Före/Pågående/Efter three-column layout */
              <>
                {beforeAfterByRoom.length === 0 && (
                  <div className="flex flex-col items-center py-8 text-center">
                    <Camera className="h-8 w-8 text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground mb-1">{t("inspiration.noBeforeAfter", "Inga före & efter-bilder ännu")}</p>
                    <p className="text-xs text-muted-foreground/60 mb-3">{t("inspiration.noBeforeAfterHint", "Välj fas ovan och klicka + för att ladda upp")}</p>
                    <Button size="sm" variant="outline" onClick={() => { fileInputRef.current?.click(); }}>
                      <Upload className="h-3.5 w-3.5 mr-1.5" />
                      {t("inspiration.upload")}
                    </Button>
                  </div>
                )}
                {beforeAfterByRoom.length > 0 && (
                  beforeAfterByRoom.map((group) => (
                    <div key={group.id} className="rounded-lg border overflow-hidden">
                      <div className="px-3 py-2 bg-muted/30 border-b">
                        <span className="text-sm font-medium">{group.name}</span>
                      </div>
                      <div className="grid grid-cols-3 divide-x">
                        {(["before", "during", "after"] as const).map((phase) => {
                          const photos = group[phase];
                          const labels = {
                            before: t("inspiration.before", "Före"),
                            during: t("inspiration.during", "Pågående"),
                            after: t("inspiration.after", "Efter"),
                          };
                          return (
                            <div key={phase} className="p-2 space-y-2">
                              <p className="text-[10px] font-medium text-muted-foreground uppercase text-center">{labels[phase]}</p>
                              {photos.length > 0 ? (
                                <div className="grid grid-cols-2 gap-1">
                                  {photos.map((photo) => (
                                    <img
                                      key={photo.id}
                                      src={photo.url}
                                      alt={photo.caption || ""}
                                      className="w-full aspect-square object-cover rounded cursor-pointer hover:opacity-90 transition-opacity"
                                      loading="lazy"
                                      onClick={() => openGallery(allPhotos.findIndex((p) => p.id === photo.id))}
                                    />
                                  ))}
                                </div>
                              ) : (
                                <div className="flex items-center justify-center aspect-square rounded border-2 border-dashed text-muted-foreground/30">
                                  <Camera className="h-5 w-5" />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </>
            )}
          </div>
        )}

        </>)}
        {/* File input — sr-only (not display:none) so label htmlFor works */}
        <input
          id={`inspo-file-${projectId}`}
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => {
            const files = e.target.files;
            if (files?.length) {
              const fileArray = Array.from(files);
              e.target.value = "";
              handleUpload(fileArray);
            }
          }}
        />
      </CardContent>

      {/* ===== Fullscreen Gallery Dialog ===== */}
      <Dialog open={galleryIndex !== null} onOpenChange={(open) => { if (!open) closeGallery(); }}>
        <DialogContent
          className="!max-w-[min(1200px,94vw)] w-[94vw] sm:!max-h-[88vh] sm:h-[88vh] !max-h-[100dvh] !h-[100dvh] !p-0 gap-0 flex flex-col sm:flex-row overflow-hidden sm:!rounded-xl !rounded-none"
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") galleryPrev();
            if (e.key === "ArrowRight") galleryNext();
          }}
        >
          <DialogTitle className="sr-only">{t("inspiration.gallery", "Inspiration gallery")}</DialogTitle>
          {galleryPhoto && (
            <div className="flex flex-col sm:flex-row flex-1 overflow-y-auto sm:overflow-hidden">
              {/* Image area — cinematic dark backdrop */}
              <div className="relative flex-1 bg-neutral-950 flex items-center justify-center sm:min-h-0 min-w-0 shrink-0 sm:shrink">
                <img
                  src={galleryPhoto.url}
                  alt={galleryPhoto.caption || ""}
                  className="w-full sm:h-full object-contain select-none"
                  draggable={false}
                />
                {/* Nav arrows */}
                {galleryIndex !== null && galleryIndex > 0 && (
                  <button
                    type="button"
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-white/10 backdrop-blur-sm hover:bg-white/20 flex items-center justify-center transition-all"
                    onClick={(e) => { e.stopPropagation(); galleryPrev(); }}
                  >
                    <ChevronLeft className="h-6 w-6 text-white" />
                  </button>
                )}
                {galleryIndex !== null && galleryIndex < allGalleryPhotos.length - 1 && (
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-white/10 backdrop-blur-sm hover:bg-white/20 flex items-center justify-center transition-all"
                    onClick={(e) => { e.stopPropagation(); galleryNext(); }}
                  >
                    <ChevronRight className="h-6 w-6 text-white" />
                  </button>
                )}
                {/* Bottom bar — counter + caption */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-6 pb-4 pt-10 pointer-events-none">
                  <div className="flex items-end justify-between">
                    <div>
                      {galleryPhoto.caption && (
                        <p className="text-white text-sm font-medium mb-1">{galleryPhoto.caption}</p>
                      )}
                      {galleryPhoto.roomName && (
                        <p className="text-white/60 text-xs">{galleryPhoto.roomName}</p>
                      )}
                    </div>
                    <span className="text-white/50 text-xs tabular-nums">
                      {(galleryIndex ?? 0) + 1} / {allGalleryPhotos.length}
                    </span>
                  </div>
                </div>
              </div>

              {/* Side panel — scrolls on mobile, fixed width on desktop */}
              <div className="w-full sm:w-72 shrink-0 border-t sm:border-t-0 sm:border-l bg-background p-4 space-y-4 overflow-y-auto sm:max-h-none">
                {/* Caption */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <Type className="h-3 w-3" />
                    {t("inspiration.caption", "Beskrivning")}
                  </label>
                  {editingCaption === galleryPhoto.id ? (
                    <div className="space-y-1.5">
                      <textarea
                        autoFocus
                        className="w-full px-2 py-1.5 text-sm rounded-md border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                        rows={3}
                        value={captionDraft}
                        onChange={(e) => setCaptionDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); updateCaption(galleryPhoto.id, captionDraft); }
                          if (e.key === "Escape") setEditingCaption(null);
                        }}
                        placeholder={t("inspiration.captionPlaceholder", "Beskriv din inspiration...")}
                      />
                      <div className="flex gap-1">
                        <Button size="sm" className="h-7 text-xs" onClick={() => updateCaption(galleryPhoto.id, captionDraft)}>
                          {t("common.save")}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingCaption(null)}>
                          {t("common.cancel")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="w-full text-left px-2 py-1.5 rounded-md text-sm hover:bg-muted transition-colors min-h-[36px]"
                      onClick={() => { setEditingCaption(galleryPhoto.id); setCaptionDraft(galleryPhoto.caption || ""); }}
                    >
                      {galleryPhoto.caption || (
                        <span className="text-muted-foreground italic">{t("inspiration.addCaption", "Lägg till beskrivning...")}</span>
                      )}
                    </button>
                  )}
                </div>

                {/* Details table */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {t("inspiration.details", "Detaljer")}
                  </label>
                  <div className="text-xs space-y-2">
                    {/* Room — clickable popover to change */}
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{t("inspiration.room", "Rum")}</span>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button type="button" className="text-sm font-medium hover:underline transition-colors">
                            {galleryPhoto.roomName || <span className="text-muted-foreground italic">{t("inspiration.noRoom", "Ej kopplat")}</span>}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-40 p-1" align="end" side="bottom">
                          {rooms.map((r) => (
                            <button
                              key={r.id}
                              type="button"
                              className={cn(
                                "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded text-left transition-colors",
                                galleryPhoto.roomId === r.id ? "bg-primary/10 font-medium" : "hover:bg-accent"
                              )}
                              onClick={() => assignPhoto(galleryPhoto.id, "room", r.id)}
                            >
                              <Home className="h-3 w-3 text-muted-foreground" />
                              {r.name}
                            </button>
                          ))}
                          {galleryPhoto.roomId && (
                            <button
                              type="button"
                              className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded text-left text-muted-foreground hover:bg-destructive/10 hover:text-destructive mt-1 border-t"
                              onClick={() => assignPhoto(galleryPhoto.id, "project", projectId)}
                            >
                              <X className="h-3 w-3" />
                              {t("inspiration.unlink")}
                            </button>
                          )}
                          <div className="flex items-center gap-1 px-1 py-1 mt-1 border-t">
                            <input
                              type="text"
                              placeholder={t("inspiration.newRoom", "Nytt rum...")}
                              className="flex-1 px-2 py-1 text-xs rounded border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                              value={newRoomName}
                              onChange={(e) => setNewRoomName(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") createRoomAndLink(newRoomName, galleryPhoto.id); }}
                            />
                            <button
                              type="button"
                              className="h-6 w-6 rounded flex items-center justify-center hover:bg-accent text-muted-foreground hover:text-primary"
                              onClick={() => createRoomAndLink(newRoomName, galleryPhoto.id)}
                              disabled={!newRoomName.trim() || creatingRoom}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{t("inspiration.source", "Källa")}</span>
                      {galleryPhoto.sourceUrl ? (
                        <a
                          href={galleryPhoto.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline truncate max-w-[140px]"
                          title={galleryPhoto.sourceUrl}
                        >
                          {galleryPhoto.source === "pinterest" ? "Pinterest" : new URL(galleryPhoto.sourceUrl).hostname.replace("www.", "")}
                        </a>
                      ) : (
                        <span>{t("inspiration.upload")}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Delete */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-destructive hover:text-destructive hover:bg-destructive/10 text-xs gap-1"
                  onClick={() => { deletePhoto(galleryPhoto.id); closeGallery(); }}
                >
                  <Trash2 className="h-3 w-3" />
                  {t("common.delete")}
                </Button>

                {/* Comments on photo — uses stable URL-based ID for cross-view consistency */}
                <div className="border-t pt-3">
                  <CommentsSection
                    entityId={stablePhotoEntityId(galleryPhoto.url, galleryPhoto.id)}
                    entityType="photo"
                    projectId={projectId}
                    compact
                  />
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/** Upload widget for Before/After photos — pick phase + room + file */
function BeforeAfterUploader({
  selectedPhase,
  onPhaseChange,
}: {
  selectedPhase: "before" | "during" | "after";
  onPhaseChange: (phase: "before" | "during" | "after") => void;
}) {
  const { t } = useTranslation();

  const phases = [
    { key: "before" as const, label: t("inspiration.before", "Före"), color: "text-amber-600 bg-amber-50 border-amber-200" },
    { key: "during" as const, label: t("inspiration.during", "Pågående"), color: "text-blue-600 bg-blue-50 border-blue-200" },
    { key: "after" as const, label: t("inspiration.after", "Efter"), color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  ];

  return (
    <div className="flex rounded-md border bg-muted/30 p-0.5">
      {phases.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => onPhaseChange(p.key)}
          className={cn(
            "px-2 py-0.5 rounded text-[11px] font-medium transition-colors",
            selectedPhase === p.key ? p.color : "text-muted-foreground hover:text-foreground"
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

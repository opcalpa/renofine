import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { X, ChevronLeft, ChevronRight, ExternalLink, Trash2, Pencil, Check, MapPin } from "lucide-react";
import { Button } from "./button";
import { Textarea } from "./textarea";
import { cn } from "@/lib/utils";

interface Photo {
  id: string;
  url: string;
  caption?: string | null;
  source?: string | null;
  source_url?: string | null;
  created_at?: string;
}

interface Room {
  id: string;
  name: string;
}

interface PhotoCarouselProps {
  photos: Photo[];
  initialIndex?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Enable metadata sidebar (caption, source badge, delete) */
  showMetadata?: boolean;
  onDelete?: (photo: Photo) => void;
  /** Called when user changes photo source/category */
  onSourceChange?: (photo: Photo, source: string) => void;
  /** Called when user edits caption */
  onCaptionChange?: (photo: Photo, caption: string) => void;
  /** Available rooms for linking (shows room selector if provided) */
  rooms?: Room[];
  /** Current room the photo is linked to */
  linkedRoomId?: string | null;
  /** Called when user changes room link */
  onRoomChange?: (photo: Photo, roomId: string | null) => void;
}

const SOURCE_LABELS: Record<string, { labelKey: string; icon: string }> = {
  before: { labelKey: "photoSource.before", icon: "📷" },
  during: { labelKey: "photoSource.during", icon: "🔨" },
  after: { labelKey: "photoSource.after", icon: "✅" },
  receipt: { labelKey: "photoSource.receipt", icon: "🧾" },
  product: { labelKey: "photoSource.product", icon: "📦" },
  upload: { labelKey: "photoSource.upload", icon: "📎" },
  pinterest: { labelKey: "photoSource.pinterest", icon: "📌" },
};

const CLASSIFIABLE_SOURCES = ["before", "during", "after", "receipt", "product"];

export function PhotoCarousel({
  photos,
  initialIndex = 0,
  open,
  onOpenChange,
  showMetadata = false,
  onDelete,
  onSourceChange,
  onCaptionChange,
  rooms,
  linkedRoomId,
  onRoomChange,
}: PhotoCarouselProps) {
  const { t } = useTranslation();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionDraft, setCaptionDraft] = useState("");

  useEffect(() => {
    setCurrentIndex(initialIndex);
    setEditingCaption(false);
  }, [initialIndex]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowLeft": goToPrevious(); break;
        case "ArrowRight": goToNext(); break;
        case "Escape": onOpenChange(false); break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, currentIndex, photos.length]);

  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev === 0 ? photos.length - 1 : prev - 1));
    setEditingCaption(false);
  }, [photos.length]);

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev === photos.length - 1 ? 0 : prev + 1));
    setEditingCaption(false);
  }, [photos.length]);

  const minSwipeDistance = 50;
  const onTouchStart = (e: React.TouchEvent) => { setTouchEnd(null); setTouchStart(e.targetTouches[0].clientX); };
  const onTouchMove = (e: React.TouchEvent) => { setTouchEnd(e.targetTouches[0].clientX); };
  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    if (distance > minSwipeDistance) goToNext();
    else if (distance < -minSwipeDistance) goToPrevious();
  };

  if (!open || photos.length === 0) return null;

  const currentPhoto = photos[currentIndex];
  const sourceInfo = currentPhoto.source ? SOURCE_LABELS[currentPhoto.source] : null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/95 flex"
      onClick={() => onOpenChange(false)}
    >
      {/* Left: Image area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between p-4 text-white shrink-0">
          <span className="text-sm opacity-70">
            {currentIndex + 1} / {photos.length}
          </span>
          {!showMetadata && (
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={(e) => { e.stopPropagation(); onOpenChange(false); }}
            >
              <X className="h-6 w-6" />
            </Button>
          )}
        </div>

        {/* Main image */}
        <div
          className="flex-1 flex items-center justify-center px-4 relative"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onClick={(e) => e.stopPropagation()}
        >
          {photos.length > 1 && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-4 z-10 h-12 w-12 rounded-full bg-black/50 text-white hover:bg-black/70 hidden md:flex"
              onClick={(e) => { e.stopPropagation(); goToPrevious(); }}
            >
              <ChevronLeft className="h-8 w-8" />
            </Button>
          )}

          <img
            src={currentPhoto.url}
            alt={currentPhoto.caption || "Photo"}
            className="max-w-full max-h-[calc(100vh-180px)] object-contain rounded-lg"
            draggable={false}
          />

          {photos.length > 1 && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 z-10 h-12 w-12 rounded-full bg-black/50 text-white hover:bg-black/70 hidden md:flex"
              onClick={(e) => { e.stopPropagation(); goToNext(); }}
            >
              <ChevronRight className="h-8 w-8" />
            </Button>
          )}
        </div>

        {/* Caption (only if no metadata sidebar) */}
        {!showMetadata && currentPhoto.caption && (
          <div className="p-4 text-center text-white">
            <p className="text-sm opacity-90">{currentPhoto.caption}</p>
          </div>
        )}

        {/* Thumbnail strip */}
        {photos.length > 1 && (
          <div className="p-4 overflow-x-auto shrink-0">
            <div className="flex gap-2 justify-center">
              {photos.map((photo, index) => (
                <button
                  key={photo.id}
                  className={cn(
                    "w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-all",
                    index === currentIndex
                      ? "border-white opacity-100"
                      : "border-transparent opacity-50 hover:opacity-75"
                  )}
                  onClick={(e) => { e.stopPropagation(); setCurrentIndex(index); }}
                >
                  <img src={photo.url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Swipe hint */}
        <div className="md:hidden text-center pb-4 text-white/50 text-xs">
          {t("common.swipeToNavigate", "Svep för att navigera")}
        </div>
      </div>

      {/* Right: Metadata sidebar */}
      {showMetadata && (
        <div
          className="hidden md:flex flex-col w-80 bg-card border-l shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Sidebar header */}
          <div className="flex items-center justify-between p-4 border-b">
            <h3 className="text-sm font-medium">{t("entityPhotos.details", "Details")}</h3>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Metadata content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Caption — editable if onCaptionChange provided */}
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <p className="text-xs text-muted-foreground">{t("entityPhotos.caption", "Caption")}</p>
                {onCaptionChange && !editingCaption && (
                  <button
                    type="button"
                    className="h-4 w-4 text-muted-foreground hover:text-foreground"
                    onClick={() => { setCaptionDraft(currentPhoto.caption || ""); setEditingCaption(true); }}
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
              </div>
              {editingCaption && onCaptionChange ? (
                <div className="space-y-1.5">
                  <Textarea
                    value={captionDraft}
                    onChange={(e) => setCaptionDraft(e.target.value)}
                    rows={2}
                    className="text-sm resize-none"
                    autoFocus
                    placeholder={t("entityPhotos.captionPlaceholder", "Add a description...")}
                  />
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs"
                      onClick={() => {
                        onCaptionChange(currentPhoto, captionDraft);
                        setEditingCaption(false);
                      }}
                    >
                      <Check className="h-3 w-3 mr-1" /> {t("common.save", "Save")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs text-muted-foreground"
                      onClick={() => setEditingCaption(false)}
                    >
                      {t("common.cancel", "Cancel")}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm">{currentPhoto.caption || <span className="italic text-muted-foreground">{t("entityPhotos.noCaption", "No description")}</span>}</p>
              )}
            </div>

            {/* Room link */}
            {rooms && rooms.length > 0 && onRoomChange && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {t("entityPhotos.linkedRoom", "Room")}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {rooms.map((room) => {
                    const isLinked = linkedRoomId === room.id;
                    return (
                      <button
                        key={room.id}
                        type="button"
                        onClick={() => onRoomChange(currentPhoto, isLinked ? null : room.id)}
                        className={cn(
                          "px-2.5 py-1 rounded-full text-xs border transition-colors",
                          isLinked
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted hover:bg-primary/10 hover:border-primary/50"
                        )}
                      >
                        {room.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Source category — interactive picker if onSourceChange provided */}
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">{t("entityPhotos.category", "Category")}</p>
              {onSourceChange ? (
                <div className="flex flex-wrap gap-1.5">
                  {CLASSIFIABLE_SOURCES.map((src) => {
                    const info = SOURCE_LABELS[src];
                    const isActive = currentPhoto.source === src;
                    return (
                      <button
                        key={src}
                        type="button"
                        onClick={() => onSourceChange(currentPhoto, isActive ? "upload" : src)}
                        className={cn(
                          "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-colors",
                          isActive
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted hover:bg-primary/10 hover:border-primary/50"
                        )}
                      >
                        {info.icon} {t(info.labelKey, src)}
                      </button>
                    );
                  })}
                </div>
              ) : sourceInfo && currentPhoto.source && !["upload", "unclassified"].includes(currentPhoto.source) ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border bg-muted">
                  {sourceInfo.icon} {t(sourceInfo.labelKey, currentPhoto.source)}
                </span>
              ) : (
                <p className="text-xs text-muted-foreground italic">{t("entityPhotos.noCategory", "Not classified")}</p>
              )}
            </div>

            {/* Date */}
            {currentPhoto.created_at && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{t("entityPhotos.uploaded", "Uploaded")}</p>
                <p className="text-sm">
                  {new Date(currentPhoto.created_at).toLocaleDateString("sv-SE", {
                    year: "numeric", month: "short", day: "numeric",
                  })}
                </p>
              </div>
            )}

            {/* Source URL */}
            {currentPhoto.source_url && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{t("entityPhotos.sourceUrl", "Source")}</p>
                <a
                  href={currentPhoto.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline flex items-center gap-1"
                >
                  <ExternalLink className="h-3 w-3" />
                  {t("common.openLink", "Open link")}
                </a>
              </div>
            )}
          </div>

          {/* Delete button */}
          {onDelete && (
            <div className="p-4 border-t">
              <Button
                variant="ghost"
                className="w-full text-destructive hover:text-destructive hover:bg-destructive/10 gap-2"
                onClick={() => {
                  onDelete(currentPhoto);
                  if (photos.length <= 1) {
                    onOpenChange(false);
                  } else if (currentIndex >= photos.length - 1) {
                    setCurrentIndex(Math.max(0, currentIndex - 1));
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
                {t("entityPhotos.removePhoto", "Delete photo")}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

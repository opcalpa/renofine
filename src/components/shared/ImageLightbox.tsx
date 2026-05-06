import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CommentsSection } from "@/components/comments/CommentsSection";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw, Download } from "lucide-react";

export interface LightboxImage {
  id: string;
  url: string;
  caption?: string | null;
  roomName?: string | null;
  filename?: string | null;
  /** Optional download URL (if different from display URL) */
  downloadUrl?: string | null;
}

/**
 * Derive a stable comment entity ID from a photo URL.
 * Extracts a short, stable path segment so the same physical file
 * always gets the same comment thread regardless of where it's viewed.
 *
 * Uses "photo:<relative-path>" format to avoid collisions with UUID-based
 * entity_ids (the RLS policy for quotes casts entity_id::uuid which would
 * fail on a full storage path).
 */
function stableEntityId(photo: LightboxImage): string {
  try {
    const url = new URL(photo.url);
    // Supabase storage URLs: /storage/v1/object/public/project-files/projects/{uuid}/...
    const match = url.pathname.match(/\/projects\/[a-f0-9-]+\/(.+)/);
    if (match) return `photo:${match[1]}`; // e.g. "photo:inspiration/file.jpg"
  } catch { /* not a valid URL, use id */ }
  return photo.id;
}

interface ImageLightboxProps {
  images: LightboxImage[];
  initialIndex: number;
  open: boolean;
  onClose: () => void;
  projectId?: string;
}

/**
 * Unified image lightbox used across the app.
 * Combines the best of InspirationSection gallery + Files preview:
 * - Cinematic dark image area with navigation arrows
 * - Zoom (25–400%) and rotate controls
 * - Sidebar with image info and comments
 * - Keyboard: arrows = nav, +/- = zoom, R = rotate, Escape = close
 */
export function ImageLightbox({ images, initialIndex, open, onClose, projectId }: ImageLightboxProps) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);

  useEffect(() => { setIndex(initialIndex); setZoom(100); setRotation(0); }, [initialIndex]);

  // Reset zoom/rotation when navigating
  const goTo = (i: number) => { setIndex(i); setZoom(100); setRotation(0); };

  const photo = images[index];
  if (!photo) return null;

  const prev = () => { if (index > 0) goTo(index - 1); };
  const next = () => { if (index < images.length - 1) goTo(index + 1); };
  const zoomIn = () => setZoom((z) => Math.min(400, z + 25));
  const zoomOut = () => setZoom((z) => Math.max(25, z - 25));
  const rotate = () => setRotation((r) => (r + 90) % 360);

  const handleDownload = () => {
    const url = photo.downloadUrl || photo.url;
    const a = document.createElement("a");
    a.href = url;
    a.download = photo.filename || "image";
    a.target = "_blank";
    a.click();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") prev();
    if (e.key === "ArrowRight") next();
    if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomIn(); }
    if (e.key === "-") { e.preventDefault(); zoomOut(); }
    if (e.key === "r" || e.key === "R") { e.preventDefault(); rotate(); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        className="!max-w-[min(1200px,94vw)] w-[94vw] sm:!max-h-[88vh] sm:h-[88vh] !max-h-[100dvh] !h-[100dvh] !p-0 gap-0 flex flex-col sm:flex-row overflow-hidden sm:!rounded-xl !rounded-none"
        onKeyDown={handleKeyDown}
      >
        <DialogTitle className="sr-only">{t("inspiration.gallery", "Gallery")}</DialogTitle>

        {/* Mobile: scrollable vertical layout. Desktop: flex row */}
        <div className="flex flex-col sm:flex-row flex-1 overflow-y-auto sm:overflow-hidden">

        {/* Image area */}
        <div className="relative flex-1 bg-neutral-950 flex flex-col sm:min-h-0 min-w-0 shrink-0 sm:shrink">
          {/* Image container with zoom/rotate */}
          <div className="flex-1 flex items-center justify-center overflow-auto min-h-0">
            <img
              src={photo.url}
              alt={photo.caption || photo.filename || ""}
              className="w-full sm:w-auto sm:max-w-full sm:max-h-full object-contain select-none transition-transform duration-150"
              style={{
                transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
                maxWidth: zoom <= 100 ? "100%" : "none",
                maxHeight: zoom <= 100 ? (window.innerWidth < 640 ? "none" : "100%") : "none",
              }}
              draggable={false}
            />
          </div>

          {/* Nav arrows */}
          {index > 0 && (
            <button
              type="button"
              className="absolute left-3 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-white/10 backdrop-blur-sm hover:bg-white/20 flex items-center justify-center transition-all z-10"
              onClick={(e) => { e.stopPropagation(); prev(); }}
            >
              <ChevronLeft className="h-6 w-6 text-white" />
            </button>
          )}
          {index < images.length - 1 && (
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-white/10 backdrop-blur-sm hover:bg-white/20 flex items-center justify-center transition-all z-10"
              onClick={(e) => { e.stopPropagation(); next(); }}
            >
              <ChevronRight className="h-6 w-6 text-white" />
            </button>
          )}

          {/* Bottom toolbar: zoom, rotate, download, counter */}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-3 pt-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                {/* Zoom controls */}
                <button type="button" onClick={zoomOut} disabled={zoom <= 25} className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 flex items-center justify-center transition-all">
                  <ZoomOut className="h-4 w-4 text-white" />
                </button>
                <span className="text-white/70 text-xs tabular-nums min-w-[40px] text-center">{zoom}%</span>
                <button type="button" onClick={zoomIn} disabled={zoom >= 400} className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 flex items-center justify-center transition-all">
                  <ZoomIn className="h-4 w-4 text-white" />
                </button>
                {/* Rotate */}
                <button type="button" onClick={rotate} className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all ml-1" title="Rotate (R)">
                  <RotateCw className="h-4 w-4 text-white" />
                </button>
                {/* Download */}
                <button type="button" onClick={handleDownload} className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all ml-1" title={t("common.download", "Download")}>
                  <Download className="h-4 w-4 text-white" />
                </button>
              </div>
              <div className="text-right">
                {photo.caption && <p className="text-white text-sm font-medium mb-0.5">{photo.caption}</p>}
                <div className="flex items-center gap-2 justify-end">
                  {(photo.roomName || photo.filename) && (
                    <span className="text-white/60 text-xs">{photo.roomName || photo.filename}</span>
                  )}
                  {images.length > 1 && (
                    <span className="text-white/40 text-xs tabular-nums">{index + 1}/{images.length}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar — scrolls independently on mobile, fixed width on desktop */}
        <div className="w-full sm:w-72 shrink-0 border-t sm:border-t-0 sm:border-l bg-background p-4 space-y-4 overflow-y-auto sm:max-h-none">
          {/* Info */}
          {(photo.caption || photo.filename) && (
            <div>
              <p className="text-sm font-medium">{photo.caption || photo.filename}</p>
              {photo.roomName && <p className="text-xs text-muted-foreground mt-0.5">{photo.roomName}</p>}
            </div>
          )}

          {/* Comments — uses stable URL-based ID so same image gets same thread everywhere */}
          {projectId && (
            <div className="border-t pt-3">
              <CommentsSection
                entityId={stableEntityId(photo)}
                entityType="photo"
                projectId={projectId}
                compact
              />
            </div>
          )}
        </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Hook for managing lightbox state. Use in any component that shows images.
 *
 * Usage:
 *   const lightbox = useLightbox();
 *   <img onClick={() => lightbox.open(images, 0)} />
 *   <ImageLightbox {...lightbox.props} projectId={projectId} />
 */
export function useLightbox() {
  const [state, setState] = useState<{ images: LightboxImage[]; index: number } | null>(null);

  const open = useCallback((images: LightboxImage[], index: number) => {
    setState({ images, index });
  }, []);

  const close = useCallback(() => setState(null), []);

  return {
    open,
    close,
    props: {
      images: state?.images ?? [],
      initialIndex: state?.index ?? 0,
      open: state !== null,
      onClose: close,
    },
  };
}

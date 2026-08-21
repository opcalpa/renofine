import { Suspense, lazy, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Image as ImageIcon,
  Download,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  X,
  Loader2,
} from "lucide-react";
import type { ProjectFile } from "./types";

// pdfjs rides in its own lazy chunk — only loads when a PDF is previewed.
const PdfCanvasPreview = lazy(() =>
  import("./PdfCanvasPreview").then((m) => ({ default: m.PdfCanvasPreview }))
);

interface FilePreviewDialogProps {
  previewFile: ProjectFile | null;
  previewUrl: string;
  imageZoom: number;
  setImageZoom: (zoom: number) => void;
  imageRotation: number;
  setImageRotation: (rotation: number) => void;
  hasPrevFile: boolean;
  hasNextFile: boolean;
  previewFileIndex: number;
  totalPreviewable: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onDownload: (file: ProjectFile) => void;
  onComments: (file: ProjectFile) => void;
  formatFileSize: (bytes: number) => string;
}

export function FilePreviewDialog({
  previewFile,
  previewUrl,
  imageZoom,
  setImageZoom,
  imageRotation,
  setImageRotation,
  hasPrevFile,
  hasNextFile,
  previewFileIndex,
  totalPreviewable,
  onClose,
  onPrev,
  onNext,
  onDownload,
  onComments,
  formatFileSize,
}: FilePreviewDialogProps) {
  const { t } = useTranslation();
  const isPdf = !!previewFile?.type?.includes("pdf");
  const contentRef = useRef<HTMLDivElement>(null);

  // iOS/WebKit (Safari, Brave) zooms the whole PAGE on pinch via gesture*
  // events — which our touchmove handler below can't intercept. Block them at
  // the document level while the preview is open so pinch only drives the
  // in-app zoom; touch events still fire, so the handler below keeps working.
  useEffect(() => {
    if (!previewFile) return;
    const block = (e: Event) => e.preventDefault();
    document.addEventListener("gesturestart", block, { passive: false });
    document.addEventListener("gesturechange", block, { passive: false });
    document.addEventListener("gestureend", block, { passive: false });
    return () => {
      document.removeEventListener("gesturestart", block);
      document.removeEventListener("gesturechange", block);
      document.removeEventListener("gestureend", block);
    };
  }, [previewFile]);

  // Pinch-to-zoom (mobile): two-finger distance drives the shared zoom state.
  // Non-passive listener so preventDefault stops the browser's page zoom.
  const zoomRef = useRef(imageZoom);
  zoomRef.current = imageZoom;
  const setZoomRef = useRef(setImageZoom);
  setZoomRef.current = setImageZoom;
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    let startDist = 0;
    let startZoom = 100;
    const dist = (e: TouchEvent) =>
      Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        startDist = dist(e);
        startZoom = zoomRef.current;
      }
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && startDist > 0) {
        e.preventDefault();
        const next = Math.round(
          Math.min(400, Math.max(25, (startZoom * dist(e)) / startDist)),
        );
        setZoomRef.current(next);
      }
    };
    const onEnd = () => { startDist = 0; };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, [previewFile?.id]);

  return (
    <Dialog open={!!previewFile} onOpenChange={onClose}>
      <DialogContent className="!w-full !max-w-full !h-[calc(100dvh-1rem)] !max-h-[calc(100dvh-1rem)] !p-0 !rounded-t-2xl md:!w-[calc(100%-2rem)] md:!max-w-[calc(100%-2rem)] md:!h-[calc(100vh-2rem)] md:!max-h-[calc(100vh-2rem)] md:!rounded-xl">
        <DialogTitle className="sr-only">
          {previewFile?.name || t("files.imagePreview")}
        </DialogTitle>
        <div className="relative h-full">
          {/* Header with controls */}
          <div className="absolute top-0 left-0 right-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <ImageIcon className="h-5 w-5 text-primary shrink-0" />
                <div className="min-w-0">
                  <h3 className="font-semibold truncate">{previewFile?.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {previewFile && formatFileSize(previewFile.size)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* Zoom works for both images and PDFs; 100 % = fit to screen. */}
                <div className="flex items-center gap-1 border rounded-md p-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setImageZoom(Math.max(25, imageZoom - 25))}
                    disabled={imageZoom <= 25}
                  >
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <span className="text-sm font-medium min-w-[52px] text-center tabular-nums">
                    {imageZoom}%
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setImageZoom(Math.min(400, imageZoom + 25))}
                    disabled={imageZoom >= 400}
                  >
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                </div>
                {!isPdf && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setImageRotation((imageRotation + 90) % 360)}
                    title={t("files.rotate")}
                  >
                    <RotateCw className="h-4 w-4" />
                  </Button>
                )}

                <div className="h-6 w-px bg-border mx-1 hidden sm:block" />

                <Button
                  variant="ghost"
                  size="sm"
                  className="hidden sm:inline-flex"
                  onClick={() => previewFile && onComments(previewFile)}
                  title={t("common.comments")}
                >
                  <MessageSquare className="h-4 w-4" />
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => previewFile && onDownload(previewFile)}
                  title={t("common.download")}
                >
                  <Download className="h-4 w-4" />
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  title={t("common.close")}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Prev/Next navigation arrows */}
          {hasPrevFile && (
            <button
              type="button"
              onClick={onPrev}
              className="absolute left-3 top-1/2 -translate-y-1/2 z-20 bg-background/80 hover:bg-background backdrop-blur rounded-full p-2 shadow-lg border transition-colors"
              title={t("files.previousFile", "Föregående fil")}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          {hasNextFile && (
            <button
              type="button"
              onClick={onNext}
              className="absolute right-3 top-1/2 -translate-y-1/2 z-20 bg-background/80 hover:bg-background backdrop-blur rounded-full p-2 shadow-lg border transition-colors"
              title={t("files.nextFile", "Nästa fil")}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}

          {/* Content container — 100 % zoom fits the whole document on screen
              (Carl's mobile finding: PDFs opened zoomed into a corner). */}
          <div
            ref={contentRef}
            className="absolute inset-0 pt-16 pb-10 px-0 overflow-auto bg-muted/30"
          >
            {previewUrl && isPdf ? (
              <Suspense
                fallback={
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                }
              >
                <PdfCanvasPreview url={previewUrl} zoom={imageZoom} fileName={previewFile?.name} />
              </Suspense>
            ) : (
              previewUrl && (
                <div className="flex items-center justify-center h-full w-full">
                  <img
                    src={previewUrl}
                    alt={previewFile?.name}
                    className="max-w-full max-h-full object-contain transition-transform duration-150"
                    style={{
                      transform: `scale(${imageZoom / 100}) rotate(${imageRotation}deg)`,
                      transformOrigin: "center",
                    }}
                  />
                </div>
              )
            )}
          </div>

          {/* Footer with navigation info */}
          <div className="absolute bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t p-2">
            <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
              {totalPreviewable > 1 && (
                <>
                  <span>
                    {previewFileIndex + 1} / {totalPreviewable}
                  </span>
                  <span>•</span>
                  <span>
                    ← →{" "}
                    {t("files.navigateFiles", "bläddra mellan filer")}
                  </span>
                  <span>•</span>
                </>
              )}
              <span>{t("files.scrollToPan")}</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

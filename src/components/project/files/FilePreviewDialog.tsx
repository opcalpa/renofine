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
} from "lucide-react";
import type { ProjectFile } from "./types";

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

  return (
    <Dialog open={!!previewFile} onOpenChange={onClose}>
      <DialogContent className="!w-[calc(100%-2rem)] !max-w-[calc(100%-2rem)] !h-[calc(100vh-2rem)] !max-h-[calc(100vh-2rem)] !p-0 !rounded-xl">
        <DialogTitle className="sr-only">
          {previewFile?.name || t("files.imagePreview")}
        </DialogTitle>
        <div className="relative h-full">
          {/* Header with controls */}
          <div className="absolute top-0 left-0 right-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ImageIcon className="h-5 w-5 text-primary" />
                <div>
                  <h3 className="font-semibold">{previewFile?.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {previewFile && formatFileSize(previewFile.size)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {previewFile && !previewFile.type?.includes("pdf") && (
                  <>
                    <div className="flex items-center gap-1 border rounded-md p-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setImageZoom(Math.max(25, imageZoom - 25))
                        }
                        disabled={imageZoom <= 25}
                      >
                        <ZoomOut className="h-4 w-4" />
                      </Button>
                      <span className="text-sm font-medium min-w-[60px] text-center">
                        {imageZoom}%
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setImageZoom(Math.min(400, imageZoom + 25))
                        }
                        disabled={imageZoom >= 400}
                      >
                        <ZoomIn className="h-4 w-4" />
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setImageRotation((imageRotation + 90) % 360)
                      }
                      title={t("files.rotate")}
                    >
                      <RotateCw className="h-4 w-4" />
                    </Button>
                  </>
                )}

                <div className="h-6 w-px bg-border mx-1" />

                <Button
                  variant="ghost"
                  size="sm"
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

          {/* Content container */}
          <div className="pt-16 pb-8 px-0 h-[calc(100vh-4rem)] overflow-auto bg-muted/30">
            <div className="flex items-center justify-center min-h-full">
              {previewUrl && previewFile?.type?.includes("pdf") ? (
                <iframe
                  src={`${previewUrl}#navpanes=0&scrollbar=1&view=FitH`}
                  title={previewFile?.name}
                  className="w-full h-full border-0 rounded"
                  style={{ minHeight: "calc(100vh - 6rem)" }}
                />
              ) : (
                previewUrl && (
                  <img
                    src={previewUrl}
                    alt={previewFile?.name}
                    className="max-w-full h-auto transition-all duration-200"
                    style={{
                      transform: `scale(${imageZoom / 100}) rotate(${imageRotation}deg)`,
                      transformOrigin: "center",
                    }}
                  />
                )
              )}
            </div>
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

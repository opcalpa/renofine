/**
 * FilePreviewPopover
 * Wraps a trigger element (e.g. paperclip icon). On click, fetches linked
 * files from task_file_links and shows a popover with file list + inline preview.
 */

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
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
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Image as ImageIcon,
  Eye,
  Download,
  X,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useFileUrl } from "@/lib/fileUrl";

interface FileLink {
  id: string;
  file_path: string;
  file_name: string;
  file_type: string | null;
  mime_type: string | null;
  vendor_name: string | null;
  invoice_amount: number | null;
}

interface FilePreviewPopoverProps {
  projectId: string;
  taskId?: string | null;
  materialId?: string | null;
  children: React.ReactNode;
}

function isImage(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext);
}

function isPdf(name: string): boolean {
  return name.toLowerCase().endsWith(".pdf");
}

function FileIcon({ name }: { name: string }) {
  if (isImage(name)) return <ImageIcon className="h-3.5 w-3.5 text-blue-500 shrink-0" />;
  if (isPdf(name)) return <FileText className="h-3.5 w-3.5 text-red-500 shrink-0" />;
  return <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
}

export function FilePreviewPopover({
  projectId,
  taskId,
  materialId,
  children,
}: FilePreviewPopoverProps) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<FileLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileLink | null>(null);
  const previewUrl = useFileUrl(previewFile?.file_path);
  const [previewZoom, setPreviewZoom] = useState(100);

  const entityId = taskId || materialId;
  const entityField = taskId ? "task_id" : "material_id";

  const fetchFiles = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    const { data } = await supabase
      .from("task_file_links")
      .select("id, file_path, file_name, file_type, mime_type, vendor_name, invoice_amount")
      .eq("project_id", projectId)
      .eq(entityField, entityId)
      .order("created_at", { ascending: false });
    setFiles(data || []);
    setLoading(false);
  }, [projectId, entityId, entityField]);

  useEffect(() => {
    if (popoverOpen) fetchFiles();
  }, [popoverOpen, fetchFiles]);

  const handleDownload = async (file: FileLink) => {
    const { data, error } = await supabase.storage
      .from("project-files")
      .download(file.file_path);
    if (error || !data) return;
    const url = window.URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.file_name;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const previewIdx = previewFile ? files.findIndex((f) => f.id === previewFile.id) : -1;

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
          {children}
        </PopoverTrigger>
        <PopoverContent
          className="w-72 p-0"
          align="end"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-3 pb-2 border-b">
            <p className="text-sm font-medium">{t("files.attachments", "Bilagor")}</p>
          </div>
          {loading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {t("common.loading", "Laddar...")}
            </div>
          ) : files.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {t("files.noAttachments", "Inga bilagor")}
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 cursor-pointer transition-colors border-b last:border-b-0"
                  onClick={() => {
                    setPreviewFile(file);
                    setPreviewZoom(100);
                    setPopoverOpen(false);
                  }}
                >
                  <FileIcon name={file.file_name} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{file.file_name}</p>
                    <div className="flex items-center gap-1.5">
                      {file.file_type && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0">
                          {file.file_type}
                        </Badge>
                      )}
                      {file.vendor_name && (
                        <span className="text-[10px] text-muted-foreground truncate">{file.vendor_name}</span>
                      )}
                    </div>
                  </div>
                  <Eye className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </div>
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Full preview dialog */}
      <Dialog open={!!previewFile} onOpenChange={(o) => { if (!o) setPreviewFile(null); }}>
        <DialogContent className="!max-w-[90vw] !w-[90vw] !h-[90vh] max-h-[90vh] p-0 gap-0 overflow-hidden flex flex-col">
          <VisuallyHidden><DialogTitle>File preview</DialogTitle></VisuallyHidden>
          {previewFile && (
            <>
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
                <div className="flex items-center gap-2 min-w-0">
                  <FileIcon name={previewFile.file_name} />
                  <span className="text-sm font-medium truncate">{previewFile.file_name}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {/* Navigation */}
                  {files.length > 1 && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        disabled={previewIdx <= 0}
                        onClick={() => { setPreviewFile(files[previewIdx - 1]); setPreviewZoom(100); }}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {previewIdx + 1}/{files.length}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        disabled={previewIdx >= files.length - 1}
                        onClick={() => { setPreviewFile(files[previewIdx + 1]); setPreviewZoom(100); }}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  {/* Zoom (images) */}
                  {isImage(previewFile.file_name) && (
                    <>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setPreviewZoom((z) => Math.max(25, z - 25))}>
                        <ZoomOut className="h-3.5 w-3.5" />
                      </Button>
                      <span className="text-xs tabular-nums min-w-[28px] text-center">{previewZoom}%</span>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setPreviewZoom((z) => Math.min(300, z + 25))}>
                        <ZoomIn className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDownload(previewFile)}>
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setPreviewFile(null)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {/* Content */}
              <div className="flex-1 overflow-auto bg-muted/10">
                {isPdf(previewFile.file_name) ? (
                  <iframe
                    src={previewUrl ? `${previewUrl}#navpanes=0&scrollbar=1&view=FitH` : undefined}
                    className="w-full border-0"
                    style={{ height: "calc(90vh - 48px)" }}
                    title={previewFile.file_name}
                  />
                ) : isImage(previewFile.file_name) ? (
                  <div className="flex items-center justify-center p-4 overflow-auto h-full">
                    <img
                      src={previewUrl ?? undefined}
                      alt={previewFile.file_name}
                      className="max-w-full transition-transform"
                      style={{ transform: `scale(${previewZoom / 100})`, transformOrigin: "center" }}
                    />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full gap-3 py-12">
                    <FileText className="h-12 w-12 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">{previewFile.file_name}</p>
                    <Button variant="outline" onClick={() => handleDownload(previewFile)}>
                      <Download className="h-4 w-4 mr-2" />
                      {t("common.download", "Ladda ner")}
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

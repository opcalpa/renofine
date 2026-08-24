import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Paperclip, Loader2, X, FileText, Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { useToast } from "@/hooks/use-toast";
import { getFileUrl } from "@/lib/fileUrl";

interface FileLink {
  id: string;
  file_name: string;
  file_path: string;
  mime_type: string | null;
}

interface MaterialFileAttachmentProps {
  materialId?: string;
  taskId?: string;
  projectId: string;
  compact?: boolean;
}

function isPreviewable(mimeType: string | null, fileName: string): "image" | "pdf" | false {
  if (mimeType?.startsWith("image/")) return "image";
  if (mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) return "pdf";
  return false;
}

export function MaterialFileAttachment({
  materialId,
  taskId,
  projectId,
  compact = true,
}: MaterialFileAttachmentProps) {
  const entityId = materialId || taskId || "";
  const entityField = materialId ? "material_id" : "task_id";

  const { t } = useTranslation();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [files, setFiles] = useState<FileLink[]>([]);
  const [previewFile, setPreviewFile] = useState<FileLink | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");

  const fetchFiles = useCallback(async () => {
    const { data } = await supabase
      .from("task_file_links")
      .select("id, file_name, file_path, mime_type")
      .eq(entityField, entityId)
      .eq("project_id", projectId);
    setFiles(data || []);
  }, [entityId, entityField, projectId]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const handleUpload = useCallback(
    async (file: File) => {
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        toast({ title: t("common.error"), description: "Max 10 MB", variant: "destructive" });
        return;
      }

      setUploading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", user.id)
          .single();
        if (!profile) return;

        const ext = file.name.split(".").pop() || "pdf";
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const storagePath = `projects/${projectId}/underlag/${entityId}_${Date.now()}_${safeName}`;

        const { error: uploadErr } = await supabase.storage
          .from("project-files")
          .upload(storagePath, file, { upsert: true });

        if (uploadErr) throw uploadErr;

        const { error: linkErr } = await supabase.from("task_file_links").insert({
          project_id: projectId,
          material_id: materialId || null,
          task_id: taskId || null,
          file_path: storagePath,
          file_name: file.name,
          file_type: ext === "pdf" ? "contract" : "other",
          file_size: file.size,
          mime_type: file.type,
          linked_by_user_id: profile.id,
        });

        if (linkErr) throw linkErr;
        fetchFiles();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        toast({ title: t("common.error"), description: msg, variant: "destructive" });
      } finally {
        setUploading(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [materialId, taskId, entityId, projectId, fetchFiles, t, toast]
  );

  const handleDelete = useCallback(
    async (link: FileLink) => {
      await supabase.storage.from("project-files").remove([link.file_path]);
      await supabase.from("task_file_links").delete().eq("id", link.id);
      fetchFiles();
    },
    [fetchFiles]
  );

  const handlePreview = useCallback(async (file: FileLink) => {
    const url = await getFileUrl(file.file_path);
    if (!url) return;
    setPreviewUrl(url);
    setPreviewFile(file);
  }, []);

  const handleDownload = useCallback(async (file: FileLink) => {
    const url = await getFileUrl(file.file_path, { download: file.file_name });
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = file.file_name;
    a.target = "_blank";
    a.click();
  }, []);

  const closePreview = () => {
    setPreviewFile(null);
    setPreviewUrl("");
  };

  const previewType = previewFile ? isPreviewable(previewFile.mime_type, previewFile.file_name) : false;

  if (files.length === 0 && compact) {
    return (
      <input
        ref={fileRef}
        id={`file-${entityId}`}
        type="file"
        className="hidden"
        accept=".pdf,.jpg,.jpeg,.png,.heic,.doc,.docx,.xls,.xlsx"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f);
        }}
      />
    );
  }

  return (
    <>
      <input
        ref={fileRef}
        id={`file-${entityId}`}
        type="file"
        className="hidden"
        accept=".pdf,.jpg,.jpeg,.png,.heic,.doc,.docx,.xls,.xlsx"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f);
        }}
      />
      <Popover>
        <PopoverTrigger asChild>
          <button
            className="inline-flex items-center gap-0.5 p-0.5 rounded hover:bg-muted transition-colors text-emerald-600"
            onClick={(e) => e.stopPropagation()}
          >
            <Paperclip className="h-3 w-3" />
            {files.length > 1 && <span className="text-xs">{files.length}</span>}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2" align="start" onClick={(e) => e.stopPropagation()}>
          <div className="space-y-1">
            {files.map((f) => (
              <div key={f.id} className="flex items-center gap-1.5 text-sm group">
                <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                <button
                  className="flex-1 text-left truncate text-xs hover:underline"
                  onClick={() => handlePreview(f)}
                  title={f.file_name}
                >
                  {f.file_name}
                </button>
                <button
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                  onClick={() => handleDelete(f)}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full mt-1 h-7 text-xs gap-1"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />}
            {t("planningTasks.attachFile", "Attach file")}
          </Button>
        </PopoverContent>
      </Popover>

      {/* File preview dialog */}
      <Dialog open={!!previewFile} onOpenChange={(open) => { if (!open) closePreview(); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0">
          <DialogTitle className="sr-only">{previewFile?.file_name}</DialogTitle>
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium truncate">{previewFile?.file_name}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => previewFile && handleDownload(previewFile)}>
                  <Download className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => {
                  if (previewUrl) window.open(previewUrl, "_blank");
                }}>
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto bg-muted/30 min-h-[400px]">
              {previewType === "image" && previewUrl && (
                <div className="flex items-center justify-center p-4 h-full">
                  <img
                    src={previewUrl}
                    alt={previewFile?.file_name}
                    className="max-w-full max-h-[70vh] object-contain rounded"
                  />
                </div>
              )}
              {previewType === "pdf" && previewUrl && (
                <iframe
                  src={previewUrl}
                  className="w-full h-[75vh] border-0"
                  title={previewFile?.file_name}
                />
              )}
              {!previewType && previewFile && (
                <div className="flex flex-col items-center justify-center h-full gap-3 py-12">
                  <FileText className="h-12 w-12 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">{t("files.noPreviewAvailable", "Preview not available for this file type")}</p>
                  <Button variant="outline" size="sm" onClick={() => previewFile && handleDownload(previewFile)}>
                    <Download className="h-4 w-4 mr-1" />
                    {t("common.download", "Download")}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

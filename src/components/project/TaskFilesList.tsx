import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileIcon, FileText, Image as ImageIcon, Download, Unlink, Loader2 } from "lucide-react";

interface TaskFileLink {
  id: string;
  file_path: string;
  file_name: string;
  file_type: string;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
}

interface TaskFilesListProps {
  taskId?: string;
  materialId?: string;
  purchaseOrderId?: string;
  projectId: string;
  readonly?: boolean;
}

const formatFileSize = (bytes: number | null) => {
  if (!bytes) return "";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
};

const getFileIcon = (mimeType: string | null) => {
  if (mimeType?.startsWith("image/")) {
    return <ImageIcon className="h-4 w-4 text-blue-500" />;
  }
  if (mimeType?.includes("pdf")) {
    return <FileText className="h-4 w-4 text-red-500" />;
  }
  return <FileIcon className="h-4 w-4 text-gray-500" />;
};

const fileTypeBadgeVariant = (fileType: string): "default" | "secondary" | "outline" => {
  switch (fileType) {
    case "invoice":
      return "default";
    case "receipt":
      return "secondary";
    case "contract":
      return "outline";
    default:
      return "outline";
  }
};

export const TaskFilesList = ({ taskId, materialId, purchaseOrderId, projectId, readonly }: TaskFilesListProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [files, setFiles] = useState<TaskFileLink[]>([]);
  const [loading, setLoading] = useState(true);

  const entityId = taskId || materialId || purchaseOrderId;
  const entityColumn: "task_id" | "material_id" | "purchase_order_id" = taskId
    ? "task_id"
    : materialId
      ? "material_id"
      : "purchase_order_id";

  useEffect(() => {
    if (entityId) fetchFiles();
  }, [entityId]);

  const fetchFiles = async () => {
    if (!entityId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("task_file_links")
      .select("id, file_path, file_name, file_type, file_size, mime_type, created_at")
      .eq(entityColumn, entityId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to load task files:", error);
    } else {
      setFiles(data || []);
    }
    setLoading(false);
  };

  const handleDownload = async (file: TaskFileLink) => {
    const { data, error } = await supabase.storage
      .from("project-files")
      .download(file.file_path);

    if (error) {
      toast({
        title: t("files.downloadError", "Download error"),
        variant: "destructive",
      });
      return;
    }

    const url = window.URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.file_name;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleUnlink = async (fileId: string) => {
    const { error } = await supabase
      .from("task_file_links")
      .delete()
      .eq("id", fileId);

    if (error) {
      console.error("Failed to unlink file:", error);
      toast({
        title: t("files.error", "Error"),
        variant: "destructive",
      });
      return;
    }

    toast({ title: t("files.fileUnlinked", "File unlinked") });
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm text-muted-foreground">{t("common.loading")}</span>
      </div>
    );
  }

  return (
    <div>
      <h4 className="text-sm font-medium mb-2">{t("files.linkedFiles", "Linked Files")}</h4>
      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("files.noLinkedFiles", "No linked files")}</p>
      ) : (
        <div className="space-y-2">
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center justify-between bg-muted px-3 py-2 rounded-lg"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {getFileIcon(file.mime_type)}
                <span className="text-sm font-medium truncate">{file.file_name}</span>
                <Badge variant={fileTypeBadgeVariant(file.file_type)} className="text-xs shrink-0">
                  {t(`files.${file.file_type}`, file.file_type)}
                </Badge>
                {file.file_size && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatFileSize(file.file_size)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => handleDownload(file)} title={t("common.download")}>
                  <Download className="h-3.5 w-3.5" />
                </Button>
                {!readonly && (
                  <Button variant="ghost" size="sm" onClick={() => handleUnlink(file.id)} title={t("files.unlinkFile", "Unlink file")}>
                    <Unlink className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Upload, Image as ImageIcon, XCircle, Maximize2, Camera, FileText, Paperclip, Download } from "lucide-react";
import { compressImage } from "@/lib/compressImage";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { PhotoCarousel } from "@/components/ui/photo-carousel";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Photo {
  id: string;
  url: string;
  caption: string | null;
  source?: string;
  mime_type?: string;
  created_at: string;
}

const isImageFile = (file: File) => file.type.startsWith("image/");
const isImageUrl = (photo: Photo) =>
  !photo.mime_type || photo.mime_type.startsWith("image/");

/** Source options per entity type */
type SourceOption = { value: string; labelKey: string; icon: string };

const TASK_SOURCE_OPTIONS: SourceOption[] = [
  { value: "before", labelKey: "photoSource.before", icon: "📷" },
  { value: "during", labelKey: "photoSource.during", icon: "🔨" },
  { value: "after", labelKey: "photoSource.after", icon: "✅" },
  { value: "receipt", labelKey: "photoSource.receipt", icon: "🧾" },
  { value: "product", labelKey: "photoSource.product", icon: "📦" },
];

const MATERIAL_SOURCE_OPTIONS: SourceOption[] = [
  { value: "product", labelKey: "photoSource.product", icon: "📦" },
  { value: "receipt", labelKey: "photoSource.receipt", icon: "🧾" },
];

function getSourceOptions(entityType: string): SourceOption[] | null {
  if (entityType === "task") return TASK_SOURCE_OPTIONS;
  if (entityType === "material") return MATERIAL_SOURCE_OPTIONS;
  return null; // room/shape — no classification needed
}

interface EntityPhotoGalleryProps {
  entityId: string;
  entityType: "task" | "room" | "material" | "shape";
  projectId?: string;
  storagePath?: string;
  /** Called when photo count changes (for parent to display in header) */
  onPhotoCount?: (count: number) => void;
}

// compressImage imported from @/lib/compressImage

export function EntityPhotoGallery({ entityId, entityType, projectId, storagePath, onPhotoCount }: EntityPhotoGalleryProps) {
  const { t } = useTranslation();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [carouselOpen, setCarouselOpen] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [unclassifiedPhotos, setUnclassifiedPhotos] = useState<Photo[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const sourceOptions = getSourceOptions(entityType);

  const bucket = storagePath || "project-files";
  const useProjectPath = !!projectId;
  const legacyFolder = `${entityType}-photos`;

  const loadPhotos = useCallback(async () => {
    setLoadingPhotos(true);
    try {
      const { data, error } = await supabase
        .from("photos")
        .select("id, url, caption, source, mime_type, created_at")
        .eq("linked_to_type", entityType)
        .eq("linked_to_id", entityId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      const loaded = (data as Photo[]) || [];
      setPhotos(loaded);
      onPhotoCount?.(loaded.length);
    } catch (error) {
      console.error("Error loading photos:", error);
      toast.error(t('entityPhotos.loadError'));
    } finally {
      setLoadingPhotos(false);
    }
  }, [entityId, entityType]);

  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  const uploadFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error(t('entityPhotos.loginRequired'));
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!profile) {
        toast.error(t('entityPhotos.profileNotFound'));
        return;
      }

      for (const file of fileArray) {
        const isImage = isImageFile(file);
        const isDocument = file.type === "application/pdf" || file.type.includes("word") || file.type === "text/plain";

        if (!isImage && !isDocument) {
          toast.error(t('entityPhotos.unsupportedFormat', { name: file.name }));
          continue;
        }
        if (file.size > 10 * 1024 * 1024) {
          toast.error(t('entityPhotos.fileTooLarge', { name: file.name }));
          continue;
        }

        const uploadFile = isImage ? await compressImage(file) : file;
        const fileExt = file.name.split(".").pop() || (isImage ? "jpg" : "pdf");
        const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const fileName = useProjectPath
          ? `projects/${projectId}/attachments/${entityType}/${uniqueName}`
          : `${legacyFolder}/${entityId}/${uniqueName}`;

        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(fileName, uploadFile);

        if (uploadError) {
          console.error("Upload error:", uploadError);
          toast.error(t('entityPhotos.uploadError', { name: file.name }));
          continue;
        }

        const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(fileName);

        const needsClassification = !!sourceOptions;
        const { data: insertedPhoto, error: dbError } = await supabase.from("photos").insert({
          linked_to_type: entityType,
          linked_to_id: entityId,
          url: publicUrl,
          caption: file.name,
          mime_type: file.type,
          uploaded_by_user_id: profile.id,
          source: needsClassification ? "unclassified" : "upload",
        }).select("id, url, caption, source, mime_type, created_at").single();

        if (dbError || !insertedPhoto) {
          console.error("Database error:", dbError);
          toast.error(t('entityPhotos.saveError', { name: file.name }));
          continue;
        }

        if (needsClassification && insertedPhoto) {
          setUnclassifiedPhotos((prev) => [...prev, insertedPhoto]);
        }

        // Create task_file_links record so file appears in Files tab
        if (useProjectPath) {
          const linkRecord: Record<string, unknown> = {
            project_id: projectId,
            file_path: fileName,
            file_name: file.name,
            file_type: "other",
            file_size: uploadFile.size,
            mime_type: file.type,
            linked_by_user_id: profile.id,
          };
          if (entityType === "task") linkRecord.task_id = entityId;
          else if (entityType === "material") linkRecord.material_id = entityId;

          await supabase.from("task_file_links").insert(linkRecord);
        }
      }

      toast.success(t('entityPhotos.filesUploaded'));
      loadPhotos();
    } catch (error) {
      console.error("Error uploading files:", error);
      toast.error(t('entityPhotos.uploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      uploadFiles(event.target.files);
      event.target.value = "";
    }
  };

  const handleDeletePhoto = async (photoId: string, photoUrl: string) => {
    if (!confirm(t('entityPhotos.confirmDelete'))) return;

    try {
      const urlParts = photoUrl.split(`/${bucket}/`);
      if (urlParts.length > 1) {
        const filePath = urlParts[1];
        await supabase.storage.from(bucket).remove([filePath]);
      }

      const { error: dbError } = await supabase
        .from("photos")
        .delete()
        .eq("id", photoId);

      if (dbError) throw dbError;

      toast.success(t('entityPhotos.photoDeleted'));
      loadPhotos();
    } catch (error) {
      console.error("Error deleting photo:", error);
      toast.error(t('entityPhotos.deleteError'));
    }
  };

  const classifyPhoto = async (photoId: string, source: string) => {
    const { error } = await supabase
      .from("photos")
      .update({ source })
      .eq("id", photoId);
    if (!error) {
      setUnclassifiedPhotos((prev) => prev.filter((p) => p.id !== photoId));
      loadPhotos();
    }
  };

  const imagePhotos = photos.filter((p) => isImageUrl(p));
  const docPhotos = photos.filter((p) => !isImageUrl(p));

  // Group images by source category (only for entity types with classification)
  const groupedImages = sourceOptions
    ? (() => {
        const groups: Array<{ source: string; label: string; icon: string; photos: Photo[] }> = [];
        const bySource: Record<string, Photo[]> = {};
        for (const p of imagePhotos) {
          const key = p.source || "unclassified";
          if (!bySource[key]) bySource[key] = [];
          bySource[key].push(p);
        }
        // Ordered by source options, then unclassified/upload at end
        for (const opt of sourceOptions) {
          if (bySource[opt.value]?.length) {
            groups.push({ source: opt.value, label: t(opt.labelKey, opt.value), icon: opt.icon, photos: bySource[opt.value] });
          }
        }
        // Remaining (unclassified, upload, etc.)
        for (const [key, items] of Object.entries(bySource)) {
          if (!sourceOptions.some((o) => o.value === key) && items.length > 0) {
            groups.push({ source: key, label: t(`photoSource.${key}`, key), icon: "📎", photos: items });
          }
        }
        return groups;
      })()
    : null;

  const handleDownloadDoc = (photo: Photo) => {
    const a = document.createElement("a");
    a.href = photo.url;
    a.download = photo.caption || "document";
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-gray-600" />
          <Label>{t('entityPhotos.photosAndDocuments')}</Label>
        </div>
        <div className="text-xs text-gray-500">
          {photos.length} {t('entityPhotos.fileCount', { count: photos.length })}
        </div>
      </div>

      <div>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileUpload}
          className="hidden"
          disabled={uploading}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf,.doc,.docx"
          multiple
          onChange={handleFileUpload}
          className="hidden"
          disabled={uploading}
        />
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              disabled={uploading}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              {t('entityPhotos.photos', 'Photos')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-1" align="start">
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-sm rounded hover:bg-muted flex items-center gap-2"
              onClick={() => cameraInputRef.current?.click()}
            >
              <Camera className="h-3.5 w-3.5" />
              {t('entityPhotos.takePhoto')}
            </button>
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-sm rounded hover:bg-muted flex items-center gap-2"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" />
              {t('entityPhotos.uploadFile')}
            </button>
          </PopoverContent>
        </Popover>
      </div>

      {/* Classification prompt for newly uploaded photos */}
      {unclassifiedPhotos.length > 0 && sourceOptions && (
        <div className="space-y-2">
          {unclassifiedPhotos.map((photo) => (
            <div key={photo.id} className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <img
                src={photo.url}
                alt=""
                className="w-14 h-14 rounded object-cover shrink-0"
              />
              <div className="flex-1 min-w-0 space-y-1.5">
                <p className="text-xs font-medium">{t("photoSource.classify", "What type of photo is this?")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {sourceOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className="px-2.5 py-1 rounded-full text-xs border transition-colors hover:bg-primary hover:text-primary-foreground hover:border-primary"
                      onClick={() => classifyPhoto(photo.id, opt.value)}
                    >
                      {opt.icon} {t(opt.labelKey, opt.value)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {loadingPhotos ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : photos.length > 0 ? (
        <div className="space-y-3">
          {/* Document files */}
          {docPhotos.length > 0 && (
            <div className="space-y-1.5">
              {docPhotos.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between bg-muted px-3 py-2 rounded-lg group"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <FileText className="h-4 w-4 text-red-500 shrink-0" />
                    <span className="text-sm truncate">{doc.caption || "Document"}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleDownloadDoc(doc)}
                      className="p-1.5 rounded-md hover:bg-background transition-colors"
                      title={t('common.download', 'Download')}
                    >
                      <Download className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    <button
                      onClick={() => handleDeletePhoto(doc.id, doc.url)}
                      className="p-1.5 rounded-md hover:bg-destructive/10 transition-colors"
                      title={t('entityPhotos.removeFile')}
                    >
                      <XCircle className="h-3.5 w-3.5 text-destructive" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Image gallery — grouped by category when applicable */}
          {imagePhotos.length > 0 && (
            <ScrollArea className="h-56">
              {groupedImages && groupedImages.length > 0 ? (
                <div className="space-y-3">
                  {groupedImages.map((group) => (
                    <div key={group.source}>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                        <span>{group.icon}</span> {group.label}
                        <span className="text-[10px] tabular-nums ml-auto">{group.photos.length}</span>
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {group.photos.map((photo) => {
                          const flatIdx = imagePhotos.findIndex((p) => p.id === photo.id);
                          return (
                            <PhotoThumbnail
                              key={photo.id}
                              photo={photo}
                              onClick={() => { setCarouselIndex(flatIdx); setCarouselOpen(true); }}
                              onDelete={() => handleDeletePhoto(photo.id, photo.url)}
                              t={t}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {imagePhotos.map((photo, index) => (
                    <PhotoThumbnail
                      key={photo.id}
                      photo={photo}
                      onClick={() => { setCarouselIndex(index); setCarouselOpen(true); }}
                      onDelete={() => handleDeletePhoto(photo.id, photo.url)}
                      t={t}
                    />
                  ))}
                </div>
              )}
            </ScrollArea>
          )}
        </div>
      ) : (
        <div className="text-center py-6 text-gray-400 text-sm">
          <Paperclip className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>{t('entityPhotos.noFiles')}</p>
        </div>
      )}

      <PhotoCarousel
        photos={imagePhotos}
        initialIndex={carouselIndex}
        open={carouselOpen}
        onOpenChange={setCarouselOpen}
        showMetadata
        onDelete={(photo) => handleDeletePhoto(photo.id, photo.url)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Photo thumbnail sub-component
// ---------------------------------------------------------------------------

function PhotoThumbnail({
  photo,
  onClick,
  onDelete,
  t,
}: {
  photo: Photo;
  onClick: () => void;
  onDelete: () => void;
  t: (key: string, fallback?: string) => string;
}) {
  return (
    <div className="relative group cursor-pointer" onClick={onClick}>
      <img
        src={photo.url}
        alt={photo.caption || ""}
        className="w-full aspect-square object-cover rounded-lg border border-gray-200 transition-all group-hover:brightness-90"
      />
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="bg-black/50 rounded-full p-1.5">
          <Maximize2 className="h-4 w-4 text-white" />
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 hover:bg-red-600 text-white rounded-full p-1 z-10"
        title={t("entityPhotos.removePhoto")}
      >
        <XCircle className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

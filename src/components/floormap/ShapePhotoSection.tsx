/**
 * ShapePhotoSection - Photo management for floor map shapes
 *
 * Similar to PhotoSection but works with any shape (walls, rectangles, etc.)
 * Photos are stored in the photos table with linked_to_type: 'shape'
 * and linked_to_id: shape.id
 */

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Upload, Image as ImageIcon, XCircle, Maximize2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PhotoCarousel } from "@/components/ui/photo-carousel";

interface Photo {
  id: string;
  url: string;
  caption: string | null;
  source?: string;
  source_url?: string;
  created_at: string;
}

interface ShapePhotoSectionProps {
  shapeId: string;
  projectId: string;
  compact?: boolean; // Compact mode for smaller panels
}

export function ShapePhotoSection({ shapeId, projectId, compact = false }: ShapePhotoSectionProps) {
  const { t } = useTranslation();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Carousel state
  const [carouselOpen, setCarouselOpen] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);

  const loadPhotos = useCallback(async () => {
    setLoadingPhotos(true);
    try {
      const { data, error } = await supabase
        .from("photos")
        .select("*")
        .eq("linked_to_type", "shape")
        .eq("linked_to_id", shapeId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPhotos((data as Photo[]) || []);
    } catch (error) {
      console.error("Error loading photos:", error);
      // Don't show toast for initial load failures - might just be no photos yet
    } finally {
      setLoadingPhotos(false);
    }
  }, [shapeId]);

  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error(t('shapePhotos.loginRequired'));
        return;
      }

      // Get profile ID (foreign key requires profile.id, not auth.uid)
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!profile) {
        toast.error(t('shapePhotos.profileNotFound'));
        return;
      }

      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) {
          toast.error(t('shapePhotos.notAnImage', { name: file.name }));
          continue;
        }

        if (file.size > 10 * 1024 * 1024) {
          toast.error(t('shapePhotos.fileTooLarge', { name: file.name }));
          continue;
        }

        const fileExt = file.name.split(".").pop();
        const fileName = `shapes/${shapeId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        // Upload to shape-photos bucket (create if needed via Supabase dashboard)
        const { error: uploadError } = await supabase.storage
          .from("project-files") // Reuse room-photos bucket
          .upload(fileName, file);

        if (uploadError) {
          console.error("Upload error:", uploadError);
          toast.error(t('shapePhotos.uploadError', { name: file.name }));
          continue;
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from("project-files").getPublicUrl(fileName);

        const { error: dbError } = await supabase.from("photos").insert({
          linked_to_type: "shape",
          linked_to_id: shapeId,
          url: publicUrl,
          caption: file.name,
          uploaded_by_user_id: profile.id,
        });

        if (dbError) {
          console.error("Database error:", dbError);
          toast.error(t('shapePhotos.saveError', { name: file.name }));
          continue;
        }
      }

      toast.success(t('shapePhotos.photosUploaded'));
      loadPhotos();
    } catch (error) {
      console.error("Error uploading files:", error);
      toast.error(t('shapePhotos.uploadFailed'));
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const handleDeletePhoto = async (photoId: string, photoUrl: string) => {
    if (!confirm(t('shapePhotos.confirmDelete'))) return;

    try {
      // Try to delete from storage
      const urlParts = photoUrl.split("/room-photos/");
      if (urlParts.length > 1) {
        const filePath = urlParts[1];
        await supabase.storage
          .from("project-files")
          .remove([filePath]);
      }

      // Delete from database
      const { error: dbError } = await supabase
        .from("photos")
        .delete()
        .eq("id", photoId);

      if (dbError) throw dbError;

      toast.success(t('shapePhotos.photoDeleted'));
      loadPhotos();
    } catch (error) {
      console.error("Error deleting photo:", error);
      toast.error(t('shapePhotos.deleteError'));
    }
  };

  // Carousel handlers
  const openCarousel = (index: number) => {
    setCarouselIndex(index);
    setCarouselOpen(true);
  };

  const uploadAreaHeight = compact ? "h-16" : "h-20";
  const gridHeight = compact ? "h-32" : "h-40";
  const imageHeight = compact ? "h-24" : "h-28";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-gray-600" />
          <Label className="text-sm font-medium">{t('shapePhotos.photos')}</Label>
        </div>
        <div className="text-xs text-gray-500">
          {photos.length} {photos.length === 1 ? t('shapePhotos.photo') : t('shapePhotos.photosPlural')}
        </div>
      </div>

      {/* Upload Button */}
      <div>
        <input
          type="file"
          id={`shape-photo-upload-${shapeId}`}
          accept="image/*"
          multiple
          onChange={handleFileUpload}
          className="hidden"
          disabled={uploading}
        />
        <label
          htmlFor={`shape-photo-upload-${shapeId}`}
          className={`
            flex items-center justify-center gap-2 w-full ${uploadAreaHeight}
            border-2 border-dashed rounded-lg
            transition-all cursor-pointer
            ${
              uploading
                ? "border-gray-300 bg-gray-50 cursor-not-allowed"
                : "border-gray-300 hover:border-blue-400 hover:bg-blue-50"
            }
          `}
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
              <span className="text-xs text-gray-500">{t('shapePhotos.uploading')}</span>
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 text-gray-400" />
              <span className="text-xs text-gray-600">
                {t('shapePhotos.clickToUpload')}
              </span>
            </>
          )}
        </label>
      </div>

      {/* Photos Grid */}
      {loadingPhotos ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : photos.length > 0 ? (
        <ScrollArea className={gridHeight}>
          <div className="grid grid-cols-2 gap-2">
            {photos.map((photo, index) => (
              <div
                key={photo.id}
                className="relative group cursor-pointer"
                onClick={() => openCarousel(index)}
              >
                <img
                  src={photo.url}
                  alt={photo.caption || t('shapePhotos.shapeImage')}
                  className={`w-full ${imageHeight} object-cover rounded-lg border border-gray-200 transition-all group-hover:brightness-90`}
                />
                {/* Expand icon overlay */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="bg-black/50 rounded-full p-1.5">
                    <Maximize2 className="h-4 w-4 text-white" />
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeletePhoto(photo.id, photo.url);
                  }}
                  className="
                    absolute top-1 right-1
                    opacity-0 group-hover:opacity-100
                    transition-opacity
                    bg-red-500 hover:bg-red-600
                    text-white rounded-full p-1
                    z-10
                  "
                  title={t('shapePhotos.removePhoto')}
                >
                  <XCircle className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </ScrollArea>
      ) : (
        <div className="text-center py-3 text-gray-400 text-xs">
          <ImageIcon className="h-6 w-6 mx-auto mb-1 opacity-50" />
          <p>{t('shapePhotos.noPhotos')}</p>
        </div>
      )}

      {/* Photo Carousel/Lightbox */}
      <PhotoCarousel
        photos={photos}
        initialIndex={carouselIndex}
        open={carouselOpen}
        onOpenChange={setCarouselOpen}
        showMetadata
      />
    </div>
  );
}

export default ShapePhotoSection;

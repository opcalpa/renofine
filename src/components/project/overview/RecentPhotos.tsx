import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ImageIcon, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatDistanceToNow } from "date-fns";
import { getDateLocale } from "@/lib/dateFnsLocale";
import { getFileUrls } from "@/lib/fileUrl";

// Image file extensions to include from storage
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"];

interface PhotoLink {
  type: "room" | "task" | "material" | "file" | "comment";
  id?: string;
  // For comments, we need to know what the comment is attached to
  commentParentType?: "task" | "material";
  commentParentId?: string;
}

interface PhotoItem {
  id: string;
  url: string;
  caption?: string | null;
  createdAt: string;
  source: "project" | "room" | "task" | "material" | "comment" | "file";
  sourceName?: string;
  linkTo?: PhotoLink;
}

interface RecentPhotosProps {
  projectId: string;
  onViewAll: () => void;
  onNavigateToRoom?: (roomId: string) => void;
  onNavigateToTask?: (taskId: string) => void;
  onNavigateToMaterial?: (materialId: string) => void;
  onNavigateToFiles?: () => void;
}

export const RecentPhotos = ({
  projectId,
  onViewAll,
  onNavigateToRoom,
  onNavigateToTask,
  onNavigateToMaterial,
  onNavigateToFiles,
}: RecentPhotosProps) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRecentPhotos = async () => {
      try {
        // Step 1: Get rooms, tasks, and materials for this project
        const [roomsRes, tasksRes, materialsRes] = await Promise.all([
          supabase
            .from("rooms")
            .select("id, name")
            .eq("project_id", projectId),
          supabase
            .from("tasks")
            .select("id, title")
            .eq("project_id", projectId),
          supabase
            .from("materials")
            .select("id, name")
            .eq("project_id", projectId),
        ]);

        const roomMap = new Map<string, string>();
        (roomsRes.data || []).forEach((r) => roomMap.set(r.id, r.name));

        const taskMap = new Map<string, string>();
        (tasksRes.data || []).forEach((t) => taskMap.set(t.id, t.title));

        const materialMap = new Map<string, string>();
        (materialsRes.data || []).forEach((m) => materialMap.set(m.id, m.name));

        const roomIds = Array.from(roomMap.keys());
        const taskIds = Array.from(taskMap.keys());
        const materialIds = Array.from(materialMap.keys());

        const allPhotos: PhotoItem[] = [];

        // Step 2: Fetch photos from photos table
        const photoQueries: Promise<{ data: { id: string; url: string; caption: string | null; created_at: string; linked_to_id: string }[] | null }>[] = [
          supabase
            .from("photos")
            .select("id, url, caption, created_at, linked_to_id")
            .eq("linked_to_type", "project")
            .eq("linked_to_id", projectId)
            .order("created_at", { ascending: false })
            .limit(10),
        ];

        if (roomIds.length > 0) {
          photoQueries.push(
            supabase
              .from("photos")
              .select("id, url, caption, created_at, linked_to_id")
              .eq("linked_to_type", "room")
              .in("linked_to_id", roomIds)
              .order("created_at", { ascending: false })
              .limit(10)
          );
        }

        if (taskIds.length > 0) {
          photoQueries.push(
            supabase
              .from("photos")
              .select("id, url, caption, created_at, linked_to_id")
              .eq("linked_to_type", "task")
              .in("linked_to_id", taskIds)
              .order("created_at", { ascending: false })
              .limit(10)
          );
        }

        if (materialIds.length > 0) {
          photoQueries.push(
            supabase
              .from("photos")
              .select("id, url, caption, created_at, linked_to_id")
              .eq("linked_to_type", "material")
              .in("linked_to_id", materialIds)
              .order("created_at", { ascending: false })
              .limit(10)
          );
        }

        const photoResults = await Promise.all(photoQueries);

        // Add project photos
        if (photoResults[0]?.data) {
          photoResults[0].data.forEach((p) => {
            allPhotos.push({
              id: p.id,
              url: p.url,
              caption: p.caption,
              createdAt: p.created_at,
              source: "project",
            });
          });
        }

        // Add room photos
        let resultIndex = 1;
        if (roomIds.length > 0 && photoResults[resultIndex]?.data) {
          photoResults[resultIndex].data.forEach((p) => {
            allPhotos.push({
              id: p.id,
              url: p.url,
              caption: p.caption,
              createdAt: p.created_at,
              source: "room",
              sourceName: roomMap.get(p.linked_to_id),
              linkTo: { type: "room", id: p.linked_to_id },
            });
          });
          resultIndex++;
        }

        // Add task photos
        if (taskIds.length > 0 && photoResults[resultIndex]?.data) {
          photoResults[resultIndex].data.forEach((p) => {
            allPhotos.push({
              id: p.id,
              url: p.url,
              caption: p.caption,
              createdAt: p.created_at,
              source: "task",
              sourceName: taskMap.get(p.linked_to_id),
              linkTo: { type: "task", id: p.linked_to_id },
            });
          });
          resultIndex++;
        }

        // Add material photos
        if (materialIds.length > 0 && photoResults[resultIndex]?.data) {
          photoResults[resultIndex].data.forEach((p) => {
            allPhotos.push({
              id: p.id,
              url: p.url,
              caption: p.caption,
              createdAt: p.created_at,
              source: "material",
              sourceName: materialMap.get(p.linked_to_id),
              linkTo: { type: "material", id: p.linked_to_id },
            });
          });
        }

        // Step 3: Fetch comment images
        const { data: commentsData } = await supabase
          .from("comments")
          .select("id, images, created_at, task_id, material_id")
          .eq("project_id", projectId)
          .not("images", "is", null)
          .order("created_at", { ascending: false })
          .limit(20);

        if (commentsData) {
          for (const comment of commentsData) {
            if (!comment.images || !Array.isArray(comment.images)) continue;

            for (const img of comment.images as { id?: string; url: string; filename?: string }[]) {
              if (!img.url) continue;

              // Determine what the comment is attached to
              let parentType: "task" | "material" | undefined;
              let parentId: string | undefined;
              let parentName: string | undefined;

              if (comment.task_id) {
                parentType = "task";
                parentId = comment.task_id;
                parentName = taskMap.get(comment.task_id);
              } else if (comment.material_id) {
                parentType = "material";
                parentId = comment.material_id;
                parentName = materialMap.get(comment.material_id);
              }

              allPhotos.push({
                id: img.id || `comment-${comment.id}-${img.url}`,
                url: img.url,
                caption: img.filename || null,
                createdAt: comment.created_at,
                source: "comment",
                sourceName: parentName,
                linkTo: parentType && parentId ? {
                  type: "comment",
                  commentParentType: parentType,
                  commentParentId: parentId,
                } : undefined,
              });
            }
          }
        }

        // Step 4: Fetch image files from storage
        const { data: storageFiles } = await supabase.storage
          .from("project-files")
          .list(`projects/${projectId}`, {
            limit: 50,
            sortBy: { column: "created_at", order: "desc" },
          });

        if (storageFiles) {
          for (const file of storageFiles) {
            // Skip folders and non-image files
            if (!file.name || file.id === null) continue;

            const lowerName = file.name.toLowerCase();
            const isImage = IMAGE_EXTENSIONS.some(ext => lowerName.endsWith(ext));
            if (!isImage) continue;

            allPhotos.push({
              id: `file-${file.id}`,
              url: `projects/${projectId}/${file.name}`,
              caption: file.name,
              createdAt: file.created_at || new Date().toISOString(),
              source: "file",
              sourceName: file.name,
              linkTo: { type: "file" },
            });
          }
        }

        // One signing round for every source above; external URLs pass through.
        const signed = await getFileUrls(allPhotos.map((p) => p.url));
        for (const p of allPhotos) {
          const url = signed.get(p.url);
          if (url) p.url = url;
        }

        // Sort by date and take the 6 most recent
        allPhotos.sort((a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        setPhotos(allPhotos.slice(0, 6));
      } catch (error) {
        console.error("Error fetching photos:", error);
        setPhotos([]);
      } finally {
        setLoading(false);
      }
    };

    fetchRecentPhotos();
  }, [projectId]);

  const handlePhotoClick = (photo: PhotoItem) => {
    if (!photo.linkTo) return;

    switch (photo.linkTo.type) {
      case "room":
        if (photo.linkTo.id && onNavigateToRoom) {
          onNavigateToRoom(photo.linkTo.id);
        }
        break;
      case "task":
        if (photo.linkTo.id && onNavigateToTask) {
          onNavigateToTask(photo.linkTo.id);
        }
        break;
      case "material":
        if (photo.linkTo.id && onNavigateToMaterial) {
          onNavigateToMaterial(photo.linkTo.id);
        }
        break;
      case "comment":
        // Navigate to the comment's parent
        if (photo.linkTo.commentParentType === "task" && photo.linkTo.commentParentId && onNavigateToTask) {
          onNavigateToTask(photo.linkTo.commentParentId);
        } else if (photo.linkTo.commentParentType === "material" && photo.linkTo.commentParentId && onNavigateToMaterial) {
          onNavigateToMaterial(photo.linkTo.commentParentId);
        }
        break;
      case "file":
        if (onNavigateToFiles) {
          onNavigateToFiles();
        }
        break;
    }
  };

  if (loading) return null;

  if (photos.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 flex flex-col items-center text-center">
          <ImageIcon className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">
            {t("overview.recentPhotos.noPhotos", "No photos yet. Photos uploaded by the team will appear here.")}
          </p>
        </CardContent>
      </Card>
    );
  }

  const locale = getDateLocale(i18n.language);

  const getSourceLabel = (source: PhotoItem["source"]) => {
    switch (source) {
      case "room":
        return t("overview.recentPhotos.sourceRoom", "Room");
      case "task":
        return t("overview.recentPhotos.sourceTask", "Task");
      case "material":
        return t("overview.recentPhotos.sourceMaterial", "Purchase");
      case "comment":
        return t("overview.recentPhotos.sourceComment", "Comment");
      case "file":
        return t("overview.recentPhotos.sourceFile", "File");
      default:
        return null;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ImageIcon className="h-4 w-4" />
            {t("overview.recentPhotos.title", "Latest photos")}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onViewAll} className="text-xs">
            {t("overview.recentPhotos.viewAll", "View all photos")}
            <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className={`relative group ${photo.linkTo ? "cursor-pointer" : ""}`}
              onClick={() => handlePhotoClick(photo)}
            >
              <div className="aspect-square rounded-md overflow-hidden bg-muted max-h-28">
                <img
                  src={photo.url}
                  alt={photo.caption || photo.sourceName || "Photo"}
                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  loading="lazy"
                />
                {/* Source badge on hover */}
                {photo.source !== "project" && (
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-end justify-start p-1 opacity-0 group-hover:opacity-100">
                    <span className="text-[8px] text-white bg-black/60 px-1 py-0.5 rounded truncate max-w-full">
                      {getSourceLabel(photo.source)}{photo.sourceName ? `: ${photo.sourceName}` : ""}
                    </span>
                  </div>
                )}
              </div>
              <p className="text-[9px] text-muted-foreground mt-0.5 truncate">
                {formatDistanceToNow(new Date(photo.createdAt), {
                  addSuffix: true,
                  locale,
                })}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

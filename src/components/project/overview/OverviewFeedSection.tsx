import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity, MessageSquare, Loader2, ImageIcon } from "lucide-react";
import { FeedCommentCard } from "../feed/FeedCommentCard";
import { ActivityCard } from "../feed/ActivityCard";
import { FeedReplyInput } from "../feed/FeedReplyInput";
import { fetchAllProjectComments, fetchProjectActivities, mergeIntoUnifiedFeed } from "../feed/utils";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { getDateLocale } from "@/lib/dateFnsLocale";
import type { FeedComment, ActivityLogItem, UnifiedFeedItem, FeedFilterMode, PhotoFeedItem } from "../feed/types";
import type { OverviewNavigation } from "./types";

interface OverviewFeedSectionProps {
  projectId: string;
  navigation: OverviewNavigation;
  userType?: string | null;
  onNavigateToEntity?: (comment: FeedComment) => void;
  onNavigateToFiles?: () => void;
  onNavigateToTask?: (taskId: string) => void;
  onNavigateToMaterial?: (materialId: string) => void;
  onNavigateToRoom?: (roomId: string) => void;
}

const ITEMS_LIMIT = 10;
const PHOTOS_LIMIT = 12;
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"];

async function fetchProjectPhotos(projectId: string): Promise<PhotoFeedItem[]> {
  const [roomsRes, tasksRes, materialsRes] = await Promise.all([
    supabase.from("rooms").select("id, name").eq("project_id", projectId),
    supabase.from("tasks").select("id, title").eq("project_id", projectId),
    supabase.from("materials").select("id, name").eq("project_id", projectId),
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

  const photos: PhotoFeedItem[] = [];

  // Fetch from photos table
  type PhotoRow = { id: string; url: string; caption: string | null; created_at: string; linked_to_id: string };
  const photoQueries: Promise<{ data: PhotoRow[] | null }>[] = [
    supabase.from("photos").select("id, url, caption, created_at, linked_to_id")
      .eq("linked_to_type", "project").eq("linked_to_id", projectId)
      .order("created_at", { ascending: false }).limit(10),
  ];

  if (roomIds.length > 0) {
    photoQueries.push(
      supabase.from("photos").select("id, url, caption, created_at, linked_to_id")
        .eq("linked_to_type", "room").in("linked_to_id", roomIds)
        .order("created_at", { ascending: false }).limit(10)
    );
  }
  if (taskIds.length > 0) {
    photoQueries.push(
      supabase.from("photos").select("id, url, caption, created_at, linked_to_id")
        .eq("linked_to_type", "task").in("linked_to_id", taskIds)
        .order("created_at", { ascending: false }).limit(10)
    );
  }
  if (materialIds.length > 0) {
    photoQueries.push(
      supabase.from("photos").select("id, url, caption, created_at, linked_to_id")
        .eq("linked_to_type", "material").in("linked_to_id", materialIds)
        .order("created_at", { ascending: false }).limit(10)
    );
  }

  const photoResults = await Promise.all(photoQueries);

  const sources: { data: PhotoRow[] | null; source: PhotoFeedItem["source"]; map?: Map<string, string> }[] = [
    { data: photoResults[0]?.data, source: "project" },
  ];
  let idx = 1;
  if (roomIds.length > 0) { sources.push({ data: photoResults[idx]?.data, source: "room", map: roomMap }); idx++; }
  if (taskIds.length > 0) { sources.push({ data: photoResults[idx]?.data, source: "task", map: taskMap }); idx++; }
  if (materialIds.length > 0) { sources.push({ data: photoResults[idx]?.data, source: "material", map: materialMap }); }

  for (const s of sources) {
    for (const p of s.data || []) {
      photos.push({
        id: p.id,
        url: p.url,
        caption: p.caption,
        createdAt: p.created_at,
        source: s.source,
        sourceName: s.map?.get(p.linked_to_id),
      });
    }
  }

  // Comment images
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
        const parentName = comment.task_id ? taskMap.get(comment.task_id) : comment.material_id ? materialMap.get(comment.material_id) : undefined;
        photos.push({
          id: img.id || `comment-${comment.id}-${img.url}`,
          url: img.url,
          caption: img.filename || null,
          createdAt: comment.created_at,
          source: "comment",
          sourceName: parentName,
        });
      }
    }
  }

  // Storage images
  const { data: storageFiles } = await supabase.storage
    .from("project-files")
    .list(`projects/${projectId}`, { limit: 50, sortBy: { column: "created_at", order: "desc" } });

  if (storageFiles) {
    for (const file of storageFiles) {
      if (!file.name || file.id === null) continue;
      const isImage = IMAGE_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext));
      if (!isImage) continue;
      const { data: { publicUrl } } = supabase.storage.from("project-files").getPublicUrl(`projects/${projectId}/${file.name}`);
      photos.push({
        id: `file-${file.id}`,
        url: publicUrl,
        caption: file.name,
        createdAt: file.created_at || new Date().toISOString(),
        source: "file",
        sourceName: file.name,
      });
    }
  }

  photos.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return photos;
}

// Activities safe for homeowner/client view (no internal team management)
const CLIENT_SAFE_ACTIONS = new Set(["created", "status_changed", "deleted"]);
const CLIENT_SAFE_ENTITY_TYPES = new Set(["task", "room"]);

export function OverviewFeedSection({
  projectId,
  navigation,
  userType,
  onNavigateToEntity,
  onNavigateToFiles,
}: OverviewFeedSectionProps) {
  const isClient = userType === "homeowner";
  const { t, i18n } = useTranslation();
  const [comments, setComments] = useState<FeedComment[]>([]);
  const [activities, setActivities] = useState<ActivityLogItem[]>([]);
  const [photos, setPhotos] = useState<PhotoFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMode, setFilterMode] = useState<FeedFilterMode>("all");
  const [replyingTo, setReplyingTo] = useState<FeedComment | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [commentsData, activitiesData, photosData] = await Promise.all([
        fetchAllProjectComments(projectId),
        fetchProjectActivities(projectId),
        fetchProjectPhotos(projectId),
      ]);
      setComments(commentsData);
      setActivities(activitiesData);
      setPhotos(photosData);
    } catch (error) {
      console.error("Failed to load feed data:", error);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleReply = (comment: FeedComment) => {
    setReplyingTo(comment);
  };

  const handleReplyPosted = () => {
    setReplyingTo(null);
    loadData();
  };

  const handleCancelReply = () => {
    setReplyingTo(null);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            {t("feed.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Filter for client view: only project-level comments, safe activities, no material info
  const visibleComments = isClient
    ? comments.filter((c) => !!c.project_id && !c.task_id && !c.material_id && !c.drawing_object_id)
    : comments;
  // Renaida receipt rows (renaida_*) are the user's own assistant actions — always client-safe
  const visibleActivities = isClient
    ? activities.filter((a) => a.action.startsWith("renaida_") || (CLIENT_SAFE_ACTIONS.has(a.action) && CLIENT_SAFE_ENTITY_TYPES.has(a.entity_type)))
    : activities;

  // Merge comments + activities into unified feed
  const unifiedFeed = mergeIntoUnifiedFeed(visibleComments, visibleActivities);

  // Filter photos for client: hide material photos (may contain pricing info in captions)
  const visiblePhotos = isClient
    ? photos.filter((p) => p.source !== "material")
    : photos;

  // Add photos to unified feed (only for "all" and "photos" views)
  const fullFeed: UnifiedFeedItem[] = [
    ...unifiedFeed,
    ...visiblePhotos.map((p) => ({
      type: "photo" as const,
      created_at: p.createdAt,
      photo: p,
    })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Apply filter
  let filteredFeed: UnifiedFeedItem[];
  if (filterMode === "comments") {
    filteredFeed = fullFeed.filter((i) => i.type === "comment");
  } else if (filterMode === "activity") {
    filteredFeed = fullFeed.filter((i) => i.type === "activity");
  } else if (filterMode === "photos") {
    filteredFeed = fullFeed.filter((i) => i.type === "photo");
  } else {
    filteredFeed = fullFeed;
  }

  // Limit
  const limit = filterMode === "photos" ? PHOTOS_LIMIT : ITEMS_LIMIT;
  const displayedItems = filteredFeed.slice(0, limit);
  const hasMore = filteredFeed.length > limit;

  const locale = getDateLocale(i18n.language);

  const getSourceLabel = (source: PhotoFeedItem["source"]) => {
    switch (source) {
      case "room": return t("overview.recentPhotos.sourceRoom", "Room");
      case "task": return t("overview.recentPhotos.sourceTask", "Task");
      case "material": return t("overview.recentPhotos.sourceMaterial", "Purchase");
      case "comment": return t("overview.recentPhotos.sourceComment", "Comment");
      case "file": return t("overview.recentPhotos.sourceFile", "File");
      default: return null;
    }
  };

  const renderFeedItem = (item: UnifiedFeedItem) => {
    if (item.type === "comment" && item.comment) {
      const isReplyingToThis = replyingTo?.id === item.comment.id;
      return (
        <div key={`c-${item.comment.id}`} className="space-y-2">
          <FeedCommentCard
            comment={item.comment}
            onNavigate={onNavigateToEntity}
            onReply={handleReply}
          />
          {isReplyingToThis && (
            <div className="ml-11">
              <FeedReplyInput
                projectId={projectId}
                replyTarget={item.comment}
                onPosted={handleReplyPosted}
                onCancel={handleCancelReply}
              />
            </div>
          )}
        </div>
      );
    }
    if (item.type === "activity" && item.activity) {
      return (
        <ActivityCard key={`a-${item.activity.id}`} activity={item.activity} />
      );
    }
    return null;
  };

  // Photo grid for "photos" filter
  const renderPhotoGrid = () => {
    const photoItems = displayedItems.filter((i) => i.type === "photo" && i.photo);
    if (photoItems.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <ImageIcon className="h-8 w-8 mb-2" />
          <p className="text-sm">{t("overview.recentPhotos.noPhotos", "No photos yet. Photos uploaded by the team will appear here.")}</p>
        </div>
      );
    }
    return (
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
        {photoItems.map((item) => {
          const photo = item.photo!;
          return (
            <div key={photo.id} className="relative group cursor-pointer" onClick={() => {
              onNavigateToFiles?.();
            }}>
              <div className="aspect-square rounded-md overflow-hidden bg-muted">
                <img
                  src={photo.url}
                  alt={photo.caption || photo.sourceName || "Photo"}
                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  loading="lazy"
                />
                {photo.source !== "project" && (
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-end justify-start p-1 opacity-0 group-hover:opacity-100">
                    <span className="text-[8px] text-white bg-black/60 px-1 py-0.5 rounded truncate max-w-full">
                      {getSourceLabel(photo.source)}{photo.sourceName ? `: ${photo.sourceName}` : ""}
                    </span>
                  </div>
                )}
              </div>
              <p className="text-[9px] text-muted-foreground mt-0.5 truncate">
                {formatDistanceToNow(new Date(photo.createdAt), { addSuffix: true, locale })}
              </p>
            </div>
          );
        })}
      </div>
    );
  };

  // Mixed feed: show photos inline as small thumbnails
  const renderMixedFeedItem = (item: UnifiedFeedItem) => {
    if (item.type === "photo" && item.photo) {
      return (
        <div key={item.photo.id} className="flex items-center gap-3 py-1.5">
          <div className="h-10 w-10 shrink-0 rounded-md overflow-hidden bg-muted cursor-pointer" onClick={() => onNavigateToFiles?.()}>
            <img
              src={item.photo.url}
              alt={item.photo.caption || "Photo"}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">
              <ImageIcon className="h-3 w-3 inline mr-1" />
              {item.photo.sourceName
                ? `${getSourceLabel(item.photo.source)}: ${item.photo.sourceName}`
                : t("overview.recentPhotos.photoUploaded", "Photo uploaded")}
              {" · "}
              {formatDistanceToNow(new Date(item.photo.createdAt), { addSuffix: true, locale })}
            </p>
          </div>
        </div>
      );
    }
    return renderFeedItem(item);
  };

  const filterModes: FeedFilterMode[] = ["all", "comments", "activity", "photos"];

  const getEmptyMessage = () => {
    switch (filterMode) {
      case "comments": return t("feed.noComments");
      case "activity": return t("overview.recentActivity.noActivity");
      case "photos": return t("overview.recentPhotos.noPhotos", "No photos yet. Photos uploaded by the team will appear here.");
      default: return t("feed.noActivity", "No activity yet");
    }
  };

  const getEmptyIcon = () => {
    if (filterMode === "photos") return <ImageIcon className="h-8 w-8 mb-2" />;
    return <Activity className="h-8 w-8 mb-2" />;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            {t("feed.title")}
          </CardTitle>
          {/* Filter buttons */}
          <div className="flex gap-1">
            {filterModes.map((mode) => (
              <Button
                key={mode}
                variant={filterMode === mode ? "default" : "outline"}
                size="sm"
                className="h-7 px-3 text-xs"
                onClick={() => setFilterMode(mode)}
              >
                {t(`feed.filter${mode.charAt(0).toUpperCase() + mode.slice(1)}`)}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {displayedItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            {getEmptyIcon()}
            <p className="text-sm">{getEmptyMessage()}</p>
          </div>
        ) : filterMode === "photos" ? (
          renderPhotoGrid()
        ) : (
          <div className="space-y-3">
            {displayedItems.map(filterMode === "all" ? renderMixedFeedItem : renderFeedItem)}
          </div>
        )}

        {/* View all button */}
        <div className="mt-3 pt-3 border-t">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
            onClick={() => {
              if (filterMode === "photos") {
                onNavigateToFiles?.();
              } else {
                navigation.onNavigateToFeed();
              }
            }}
          >
            {filterMode === "photos"
              ? t("overview.recentPhotos.viewAll", "View all photos")
              : hasMore
              ? t("overview.recentActivity.viewAllActivity")
              : t("feed.viewFullFeed", "Go to full feed")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

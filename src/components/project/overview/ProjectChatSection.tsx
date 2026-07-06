/**
 * ProjectChatSection — Unified Chat + Feed component.
 *
 * Merges the old separate "Chatt" (CommentsSection) and "Feed" (OverviewFeedSection)
 * into a single section. Features:
 * - DM avatar bar: click a team member → private DM mode
 * - Unified feed: project comments, entity comments, activities, photos
 * - Filter tabs: All, Messages, Activity, Photos
 * - Reply on entity comments (posts reply on the original entity)
 * - Navigate to entity by clicking the context badge
 * - General comment input at bottom (project-level)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Activity, Lock, X, Send, Loader2, ImageIcon, Camera, MessageSquare, Smile, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import EmojiPicker, { EmojiClickData, Theme } from "emoji-picker-react";
import { FeedCommentCard } from "../feed/FeedCommentCard";
import { ActivityCard } from "../feed/ActivityCard";

import { MentionTextarea } from "../feed/MentionTextarea";
import { fetchAllProjectComments, fetchProjectActivities, mergeIntoUnifiedFeed, parseMentions } from "../feed/utils";
import { useDirectMessages, useUnreadDmCounts } from "@/hooks/useDirectMessages";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { compressImage } from "@/lib/compressImage";
import { formatDistanceToNow } from "date-fns";
import { getDateLocale } from "@/lib/dateFnsLocale";
import type { FeedComment, UnifiedFeedItem, FeedFilterMode, PhotoFeedItem, ActivityLogItem } from "../feed/types";
import { ImageLightbox, useLightbox } from "@/components/shared/ImageLightbox";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TeamMemberInfo {
  id: string;
  name: string;
  avatar_url: string | null;
}

interface ProjectChatSectionProps {
  projectId: string;
  userType?: string | null;
  onNavigateToEntity?: (comment: FeedComment) => void;
  onNavigateToFiles?: () => void;
}

const ITEMS_LIMIT = 7;
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"];


// Activities safe for homeowner/client view
const CLIENT_SAFE_ACTIONS = new Set(["created", "status_changed", "deleted"]);
const CLIENT_SAFE_ENTITY_TYPES = new Set(["task", "room"]);

// ---------------------------------------------------------------------------
// Photo fetcher (extracted from OverviewFeedSection)
// ---------------------------------------------------------------------------

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
      photos.push({ id: p.id, url: p.url, caption: p.caption, createdAt: p.created_at, source: s.source, sourceName: s.map?.get(p.linked_to_id) });
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
          url: img.url, caption: img.filename || null, createdAt: comment.created_at, source: "comment", sourceName: parentName,
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
      photos.push({ id: `file-${file.id}`, url: publicUrl, caption: file.name, createdAt: file.created_at || new Date().toISOString(), source: "file", sourceName: file.name });
    }
  }

  photos.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return photos;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProjectChatSection({ projectId, userType, onNavigateToEntity, onNavigateToFiles }: ProjectChatSectionProps) {
  const isClient = userType === "homeowner";
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const lightbox = useLightbox();

  // Feed state
  const [comments, setComments] = useState<FeedComment[]>([]);
  const [activities, setActivities] = useState<ActivityLogItem[]>([]);
  const [photos, setPhotos] = useState<PhotoFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilters, setActiveFilters] = useState<Set<"comments" | "activity" | "photos">>(
    new Set(["comments"])
  );
  const toggleFilter = (f: "comments" | "activity" | "photos") => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(f)) {
        if (next.size > 1) next.delete(f); // don't allow empty
      } else {
        next.add(f);
      }
      return next;
    });
  };
  // Derive filterMode for backward compat with filtering logic
  const filterMode: FeedFilterMode = activeFilters.size === 3 ? "all" :
    activeFilters.size === 1 ? [...activeFilters][0] as FeedFilterMode : "all";
  const [replyingTo, setReplyingTo] = useState<FeedComment | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Chat input state
  const [chatInput, setChatInput] = useState("");
  const [posting, setPosting] = useState(false);
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const feedScrollRef = useRef<HTMLDivElement>(null);
  const dmScrollRef = useRef<HTMLDivElement>(null);

  // DM state
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMemberInfo[]>([]);
  const [dmRecipient, setDmRecipient] = useState<TeamMemberInfo | null>(null);
  const [dmInput, setDmInput] = useState("");
  const [dmSending, setDmSending] = useState(false);
  const [dmImages, setDmImages] = useState<File[]>([]);
  const [dmImagePreviews, setDmImagePreviews] = useState<string[]>([]);
  const [dmEmojiOpen, setDmEmojiOpen] = useState(false);
  const dmFileInputRef = useRef<HTMLInputElement>(null);

  const unreadCounts = useUnreadDmCounts(projectId, currentProfileId || "");

  const {
    messages: dmMessages,
    sendMessage: sendDm,
    markAsRead: markDmRead,
  } = useDirectMessages({
    projectId,
    currentUserId: currentProfileId || "",
    recipientId: dmRecipient?.id || "",
    enabled: !!dmRecipient && !!currentProfileId,
  });

  // Mark DMs as read when viewing
  useEffect(() => {
    if (dmRecipient && dmMessages.length > 0) markDmRead();
  }, [dmRecipient, dmMessages.length, markDmRead]);

  // Load feed data
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

  useEffect(() => { loadData(); }, [loadData]);

  // Realtime subscription for comments
  useEffect(() => {
    const channel = supabase
      .channel(`project-chat-${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments", filter: `project_id=eq.${projectId}` }, () => loadData())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_log", filter: `project_id=eq.${projectId}` }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId, loadData]);

  // Feed shows newest first — keep scroll at the top where the news is.
  useEffect(() => {
    if (feedScrollRef.current) {
      feedScrollRef.current.scrollTop = 0;
    }
  }, [comments, activities, photos, filterMode]);

  // Auto-scroll DM to bottom
  useEffect(() => {
    if (dmScrollRef.current) {
      dmScrollRef.current.scrollTop = dmScrollRef.current.scrollHeight;
    }
  }, [dmMessages]);

  // Fetch current user + team members
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).single();
      if (!profile) return;
      setCurrentProfileId(profile.id);

      const { data: project } = await supabase.from("projects").select("owner_id").eq("id", projectId).single();
      if (!project) return;

      const [ownerRes, sharesRes] = await Promise.all([
        supabase.from("profiles").select("id, name, avatar_url").eq("id", project.owner_id).single(),
        supabase.from("project_shares").select("shared_with_user_id, profiles:shared_with_user_id(id, name, avatar_url)").eq("project_id", projectId),
      ]);

      const members: TeamMemberInfo[] = [];
      if (ownerRes.data) {
        members.push({ id: ownerRes.data.id, name: ownerRes.data.name || "Owner", avatar_url: ownerRes.data.avatar_url });
      }
      for (const share of sharesRes.data || []) {
        const p = share.profiles as unknown as { id: string; name: string | null; avatar_url: string | null } | null;
        if (p && !members.some((m) => m.id === p.id)) {
          members.push({ id: p.id, name: p.name || share.shared_with_user_id, avatar_url: p.avatar_url });
        }
      }
      setTeamMembers(members.filter((m) => m.id !== profile.id));
    })();
  }, [projectId]);

  // --- Handlers ---

  const handleToggleDm = useCallback((member: TeamMemberInfo) => {
    setDmRecipient((prev) => (prev?.id === member.id ? null : member));
    setDmInput("");
  }, []);

  const handleDmImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;
    const newFiles: File[] = [];
    const newPreviews: string[] = [];
    for (let i = 0; i < files.length; i++) {
      if (files[i].type.startsWith("image/")) {
        newFiles.push(files[i]);
        newPreviews.push(URL.createObjectURL(files[i]));
      }
    }
    setDmImages((prev) => [...prev, ...newFiles]);
    setDmImagePreviews((prev) => [...prev, ...newPreviews]);
  };

  const removeDmImage = (index: number) => {
    URL.revokeObjectURL(dmImagePreviews[index]);
    setDmImages((prev) => prev.filter((_, i) => i !== index));
    setDmImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSendDm = useCallback(async () => {
    if ((!dmInput.trim() && dmImages.length === 0) || !dmRecipient) return;
    setDmSending(true);
    try {
      let uploadedImages: { id: string; url: string; filename: string }[] = [];
      if (dmImages.length > 0) {
        for (const image of dmImages) {
          const compressed = await compressImage(image);
          const fileName = `${Date.now()}-${image.name}`;
          const filePath = `projects/${projectId}/dm-images/${fileName}`;
          const { error } = await supabase.storage.from("project-files").upload(filePath, compressed, { contentType: compressed.type || "image/jpeg" });
          if (error) { console.error("DM image upload error:", error); continue; }
          const { data: { publicUrl } } = supabase.storage.from("project-files").getPublicUrl(filePath);
          uploadedImages.push({ id: Date.now().toString(), url: publicUrl, filename: image.name });
        }
      }
      const content = dmInput.trim() || (uploadedImages.length > 0 ? "📷" : "");
      await sendDm(content, uploadedImages);
      setDmInput("");
      dmImagePreviews.forEach((p) => URL.revokeObjectURL(p));
      setDmImages([]);
      setDmImagePreviews([]);
    } finally {
      setDmSending(false);
    }
  }, [dmInput, dmImages, dmImagePreviews, dmRecipient, projectId, sendDm]);

  const handleReply = (comment: FeedComment) => setReplyingTo(comment);
  const handleCancelReply = () => setReplyingTo(null);

  const handleImageSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;
    const newFiles: File[] = [];
    const newPreviews: string[] = [];
    for (let i = 0; i < files.length; i++) {
      if (files[i].type.startsWith("image/")) {
        newFiles.push(files[i]);
        newPreviews.push(URL.createObjectURL(files[i]));
      }
    }
    setSelectedImages((prev) => [...prev, ...newFiles]);
    setImagePreviews((prev) => [...prev, ...newPreviews]);
  };

  const removeImage = (index: number) => {
    URL.revokeObjectURL(imagePreviews[index]);
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePostComment = useCallback(async () => {
    if (!chatInput.trim() || !currentProfileId) return;
    setPosting(true);
    try {
      // Upload images if any
      let uploadedImages: { id: string; url: string; filename: string }[] = [];
      if (selectedImages.length > 0) {
        for (const image of selectedImages) {
          const compressed = await compressImage(image);
          const fileName = `${Date.now()}-${image.name}`;
          const filePath = `projects/${projectId}/comment-images/${fileName}`;
          const { error } = await supabase.storage.from("project-files").upload(filePath, compressed, { contentType: compressed.type || "image/jpeg" });
          if (error) { console.error("Upload error:", error); continue; }
          const { data: { publicUrl } } = supabase.storage.from("project-files").getPublicUrl(filePath);
          uploadedImages.push({ id: Date.now().toString(), url: publicUrl, filename: image.name });
        }
      }

      const trimmedContent = chatInput.trim();

      // Build insert payload — route to entity if replying, else project-level
      const insertData: Record<string, unknown> = {
        content: trimmedContent,
        created_by_user_id: currentProfileId,
        images: uploadedImages.length > 0 ? uploadedImages : null,
      };

      if (replyingTo) {
        // Post on the same entity as the original comment
        if (replyingTo.task_id) {
          insertData.task_id = replyingTo.task_id;
        } else if (replyingTo.material_id) {
          insertData.material_id = replyingTo.material_id;
        } else if (replyingTo.entity_id) {
          insertData.entity_id = replyingTo.entity_id;
          insertData.entity_type = replyingTo.entity_type;
        } else if (replyingTo.drawing_object_id) {
          insertData.drawing_object_id = replyingTo.drawing_object_id;
        } else {
          insertData.project_id = projectId;
        }
      } else {
        insertData.project_id = projectId;
      }

      const { data: commentData, error } = await supabase.from("comments").insert(insertData).select("id").single();
      if (error) throw error;

      const mentions = parseMentions(trimmedContent);
      if (mentions.length > 0 && commentData) {
        await supabase.from("comment_mentions").insert(
          mentions.map((m) => ({ comment_id: commentData.id, mentioned_user_id: m.profileId }))
        );
      }

      setChatInput("");
      setReplyingTo(null);
      imagePreviews.forEach((p) => URL.revokeObjectURL(p));
      setSelectedImages([]);
      setImagePreviews([]);
      loadData();

      if (replyingTo) {
        toast({ title: t("comments.commentPosted"), description: t("comments.commentPostedDescription") });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t("comments.postError");
      toast({ title: t("errors.generic"), description: message, variant: "destructive" });
    } finally {
      setPosting(false);
    }
  }, [chatInput, currentProfileId, projectId, replyingTo, selectedImages, imagePreviews, loadData, t, toast]);

  // --- Build feed ---

  // Clients see project-level + task comments (not material/drawing comments which are internal)
  const visibleComments = isClient
    ? comments.filter((c) => (!!c.project_id || !!c.task_id) && !c.material_id && !c.drawing_object_id)
    : comments;
  // Renaida receipt rows (renaida_*) are the user's own assistant actions — always client-safe
  const visibleActivities = isClient
    ? activities.filter((a) => a.action.startsWith("renaida_") || (CLIENT_SAFE_ACTIONS.has(a.action) && CLIENT_SAFE_ENTITY_TYPES.has(a.entity_type)))
    : activities;
  const visiblePhotos = isClient
    ? photos.filter((p) => p.source !== "material")
    : photos;

  const unifiedFeed = mergeIntoUnifiedFeed(visibleComments, visibleActivities);
  const fullFeed: UnifiedFeedItem[] = [
    ...unifiedFeed,
    ...visiblePhotos.map((p) => ({ type: "photo" as const, created_at: p.createdAt, photo: p })),
  // Newest FIRST — this is a "what just happened?" log, not a chat thread.
  // (Round-9/12 flag; DMs below keep chat order since those are conversations.)
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Multi-select filter
  const typeMap: Record<string, "comments" | "activity" | "photos"> = {
    comment: "comments",
    activity: "activity",
    photo: "photos",
  };
  const filteredFeed = activeFilters.size === 3
    ? fullFeed
    : fullFeed.filter((i) => activeFilters.has(typeMap[i.type]));

  // Search filter
  const searchedFeed = searchQuery.trim()
    ? filteredFeed.filter((item) => {
        const q = searchQuery.toLowerCase();
        if (item.comment) {
          return (
            item.comment.content.toLowerCase().includes(q) ||
            item.comment.creator?.name.toLowerCase().includes(q) ||
            item.comment.task?.title.toLowerCase().includes(q) ||
            item.comment.material?.name.toLowerCase().includes(q) ||
            item.comment.room?.name.toLowerCase().includes(q)
          );
        }
        if (item.activity) {
          return (
            item.activity.entity_name?.toLowerCase().includes(q) ||
            item.activity.actor?.name.toLowerCase().includes(q) ||
            item.activity.action.toLowerCase().includes(q)
          );
        }
        if (item.photo) {
          return (
            item.photo.caption?.toLowerCase().includes(q) ||
            item.photo.sourceName?.toLowerCase().includes(q)
          );
        }
        return false;
      })
    : filteredFeed;

  // Feed is newest-first: the visible window is the FIRST N items. (slice(-N)
  // after the flip showed the OLDEST events until "Show older" — round 13.)
  const displayedItems = showAll ? searchedFeed : searchedFeed.slice(0, ITEMS_LIMIT);
  const hasMore = searchedFeed.length > ITEMS_LIMIT && !showAll;

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

  // --- Render helpers ---

  const renderFeedItem = (item: UnifiedFeedItem) => {
    if (item.type === "comment" && item.comment) {
      return (
        <FeedCommentCard
          key={`c-${item.comment.id}`}
          comment={item.comment}
          onNavigate={onNavigateToEntity}
          onReply={handleReply}
          currentProfileId={currentProfileId}
          projectId={projectId}
        />
      );
    }
    if (item.type === "activity" && item.activity) {
      return <ActivityCard key={`a-${item.activity.id}`} activity={item.activity} />;
    }
    if (item.type === "photo" && item.photo) {
      const photoIdx = visiblePhotos.findIndex((p) => p.id === item.photo!.id);
      return (
        <div key={item.photo.id} className="space-y-1 py-1.5">
          <div
            className="rounded-lg overflow-hidden bg-muted cursor-pointer max-w-sm"
            onClick={() => lightbox.open(
              visiblePhotos.map((p) => ({ id: p.id, url: p.url, caption: p.caption, roomName: p.sourceName })),
              Math.max(0, photoIdx)
            )}
          >
            <img src={item.photo.url} alt={item.photo.caption || "Photo"} className="w-full h-auto max-h-64 object-cover" loading="lazy" />
          </div>
          <p className="text-xs text-muted-foreground">
            <ImageIcon className="h-3 w-3 inline mr-1" />
            {item.photo.sourceName
              ? `${getSourceLabel(item.photo.source)}: ${item.photo.sourceName}`
              : t("overview.recentPhotos.photoUploaded", "Photo uploaded")}
            {" · "}
            {formatDistanceToNow(new Date(item.photo.createdAt), { addSuffix: true, locale })}
          </p>
        </div>
      );
    }
    return null;
  };

  const filterOptions: Array<"comments" | "activity" | "photos"> = ["comments", "activity", "photos"];

  const showDmFeed = !!dmRecipient;
  const chatInputRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to input when reply is set
  useEffect(() => {
    if (replyingTo && chatInputRef.current) {
      chatInputRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [replyingTo]);

  return (
    <div id="project-chat" className="space-y-3">
      {/* DM mode */}
      {showDmFeed && dmRecipient ? (
        <div className="rounded-lg border border-blue-200 dark:border-blue-800/40 bg-blue-50/50 dark:bg-blue-950/20">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-blue-200 dark:border-blue-800/40">
            <Lock className="h-3.5 w-3.5 text-blue-500 shrink-0" />
            <span className="text-xs font-medium text-blue-700 dark:text-blue-300 flex-1">
              {t("dm.privateTo", { name: dmRecipient.name })}
            </span>
            <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-blue-500 hover:text-blue-700" onClick={() => setDmRecipient(null)}>
              <X className="h-3 w-3" />
            </Button>
          </div>

          <div ref={dmScrollRef} className="max-h-64 overflow-y-auto p-3 space-y-2">
            {dmMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-4 text-muted-foreground">
                <Lock className="h-5 w-5 mb-1.5 opacity-40" />
                <p className="text-xs">{t("dm.empty")}</p>
                <p className="text-[10px] opacity-60 mt-0.5">{t("dm.emptyHint")}</p>
              </div>
            ) : (
              dmMessages.map((msg) => {
                const isOwn = msg.from_user_id === currentProfileId;
                return (
                  <div key={msg.id} className={cn("flex", isOwn ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-[80%] rounded-2xl px-3 py-1.5 text-sm whitespace-pre-wrap break-words",
                      isOwn ? "bg-blue-600 text-white rounded-br-sm" : "bg-white dark:bg-blue-900/40 rounded-bl-sm"
                    )}>
                      {msg.images && Array.isArray(msg.images) && msg.images.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-1">
                          {(msg.images as { url: string; filename?: string }[]).map((img, i) => (
                            <img key={i} src={img.url} alt={img.filename || "Image"} className="max-w-[200px] max-h-40 rounded-lg object-cover" loading="lazy" />
                          ))}
                        </div>
                      )}
                      {msg.content !== "📷" && msg.content}
                      <div className={cn("text-[9px] mt-0.5", isOwn ? "text-blue-200" : "text-muted-foreground/60")}>
                        {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true, locale })}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="border-t border-blue-200 dark:border-blue-800/40 px-3 py-2 space-y-2">
            {dmImagePreviews.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {dmImagePreviews.map((preview, index) => (
                  <div key={index} className="relative group">
                    <img src={preview} alt={`Preview ${index + 1}`} className="w-14 h-14 object-cover rounded border" />
                    <button
                      type="button"
                      onClick={() => removeDmImage(index)}
                      className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-1">
              <input ref={dmFileInputRef} type="file" accept="image/*" multiple onChange={handleDmImageSelect} className="hidden" />
              <Button type="button" variant="ghost" size="icon" onClick={() => dmFileInputRef.current?.click()} className="h-8 w-8 shrink-0 text-blue-500 hover:text-blue-700">
                <Camera className="h-4 w-4" />
              </Button>
              <Popover open={dmEmojiOpen} onOpenChange={setDmEmojiOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-blue-500 hover:text-blue-700">
                    <Smile className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 border-none shadow-xl" side="top" align="start">
                  <EmojiPicker
                    onEmojiClick={(emojiData: EmojiClickData) => {
                      setDmInput((prev) => prev + emojiData.emoji);
                      setDmEmojiOpen(false);
                    }}
                    theme={Theme.AUTO}
                    height={350}
                    width={320}
                    searchPlaceHolder={t("feed.emojiSearch", "Search emoji...")}
                    previewConfig={{ showPreview: false }}
                    lazyLoadEmojis
                  />
                </PopoverContent>
              </Popover>
              <input
                type="text"
                value={dmInput}
                onChange={(e) => setDmInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendDm(); } }}
                placeholder={t("dm.placeholder")}
                className="flex-1 rounded-full border bg-white dark:bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-blue-400"
              />
              <Button size="icon" className="h-8 w-8 shrink-0 rounded-full bg-blue-600 hover:bg-blue-700" onClick={handleSendDm} disabled={(!dmInput.trim() && dmImages.length === 0) || dmSending}>
                {dmSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <p className="text-[10px] text-blue-400">{t("dm.onlyVisibleToTwo", { name: dmRecipient.name })}</p>
          </div>
        </div>
      ) : (
        /* Unified feed + chat — mini chat-app layout */
        <div className="flex flex-col rounded-lg border bg-background max-h-[calc(100dvh-12rem)] md:max-h-[70vh]">
          {/* Sticky header: filter tabs + search */}
          <div className="flex items-center gap-1 px-3 py-2 border-b bg-muted/30 shrink-0">
            {!searchOpen && filterOptions.map((opt) => (
              <Button
                key={opt}
                variant={activeFilters.has(opt) ? "default" : "outline"}
                size="sm"
                className="h-7 px-3 text-xs"
                onClick={() => { toggleFilter(opt); setShowAll(false); }}
              >
                {t(`feed.filter${opt.charAt(0).toUpperCase() + opt.slice(1)}`)}
              </Button>
            ))}
            {/* Team avatars — inline in filter bar */}
            {!searchOpen && teamMembers.length > 0 && (
              <>
                <div className="w-px h-4 bg-border mx-0.5" />
                {teamMembers.map((member) => {
                  const isSelected = dmRecipient?.id === member.id;
                  const unread = unreadCounts[member.id] || 0;
                  return (
                    <button
                      key={member.id}
                      onClick={() => handleToggleDm(member)}
                      className={cn(
                        "relative shrink-0 rounded-full transition-all",
                        isSelected
                          ? "ring-2 ring-blue-500 ring-offset-1 ring-offset-background"
                          : "hover:ring-2 hover:ring-muted-foreground/30 hover:ring-offset-1 hover:ring-offset-background"
                      )}
                      title={member.name}
                    >
                      <Avatar className="h-6 w-6">
                        {member.avatar_url && <AvatarImage src={member.avatar_url} alt={member.name} />}
                        <AvatarFallback className="text-[8px] bg-muted">
                          {member.name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      {unread > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 h-3 min-w-3 rounded-full bg-red-500 text-white text-[7px] font-bold flex items-center justify-center px-0.5">
                          {unread}
                        </span>
                      )}
                    </button>
                  );
                })}
              </>
            )}
            {searchOpen ? (
              <div className="flex items-center gap-1 flex-1">
                <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setShowAll(true); }}
                  placeholder={t("feed.searchPlaceholder", "Search messages...")}
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  onKeyDown={(e) => { if (e.key === "Escape") { setSearchOpen(false); setSearchQuery(""); setShowAll(false); } }}
                />
                {searchQuery && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {searchedFeed.length}
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => { setSearchOpen(false); setSearchQuery(""); setShowAll(false); }}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 ml-auto"
                onClick={() => { setSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 50); }}
              >
                <Search className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          {/* Scrollable feed area */}
          <div ref={feedScrollRef} className="flex-1 overflow-y-auto px-3 py-2 min-h-0">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : displayedItems.length === 0 ? (
              <div className="py-3" />
            ) : (
              <div className="space-y-2">
                {displayedItems.map(renderFeedItem)}
                {/* Older items now live BELOW the newest-first window */}
                {hasMore && (
                  <Button variant="ghost" size="sm" className="w-full text-muted-foreground text-xs mt-2" onClick={() => setShowAll(true)}>
                    {t("feed.showOlder", "Show older ({{count}})").replace("{{count}}", String(filteredFeed.length))}
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Sticky footer: chat input */}
          {currentProfileId && (
            <div ref={chatInputRef} className="shrink-0 border-t bg-background px-3 py-2 space-y-2">
              {/* Reply preview */}
              {replyingTo && (
                <div className="flex items-center gap-2 px-2 py-1.5 bg-muted/60 rounded-md text-xs">
                  <MessageSquare className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground shrink-0">{t("feed.replyingToLabel", "Replying to:")}</span>
                  <span className="truncate font-medium">{replyingTo.content?.slice(0, 60)}{(replyingTo.content?.length || 0) > 60 ? "..." : ""}</span>
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0 ml-auto shrink-0" onClick={handleCancelReply}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}
              {imagePreviews.length > 0 && (
                <div className="flex flex-wrap gap-2 p-2 bg-muted rounded-md">
                  {imagePreviews.map((preview, index) => (
                    <div key={index} className="relative group">
                      <img src={preview} alt={`Preview ${index + 1}`} className="w-14 h-14 object-cover rounded border" />
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-1">
                <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageSelect} className="hidden" />
                <Button type="button" variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} className="h-8 w-8 shrink-0">
                  <Camera className="h-4 w-4" />
                </Button>
                <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                      <Smile className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 border-none shadow-xl" side="top" align="start">
                    <EmojiPicker
                      onEmojiClick={(emojiData: EmojiClickData) => {
                        setChatInput((prev) => prev + emojiData.emoji);
                        setEmojiOpen(false);
                      }}
                      theme={Theme.AUTO}
                      height={350}
                      width={320}
                      searchPlaceHolder={t("feed.emojiSearch", "Search emoji...")}
                      previewConfig={{ showPreview: false }}
                      lazyLoadEmojis
                    />
                  </PopoverContent>
                </Popover>
                <div className="flex-1 min-w-0">
                  <MentionTextarea
                    projectId={projectId}
                    placeholder={replyingTo ? t("feed.writeReply", "Write a reply...") : t("feed.generalCommentPlaceholder")}
                    value={chatInput}
                    onChange={setChatInput}
                    className="min-h-9 max-h-24 resize-none text-sm bg-white dark:bg-background"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handlePostComment(); }
                    }}
                  />
                </div>
                <Button
                  onClick={handlePostComment}
                  disabled={posting || !chatInput.trim()}
                  size="icon"
                  className="h-8 w-8 shrink-0 rounded-full"
                >
                  {posting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      <ImageLightbox {...lightbox.props} projectId={projectId} />
    </div>
  );
}

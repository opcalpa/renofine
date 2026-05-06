import { useEffect, useState, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/compressImage";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarColor } from "@/lib/avatarColor";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Send, Trash2, MessageSquare, Camera, X, Languages, Lock, Reply, ChevronDown } from "lucide-react";
import { ImageLightbox, useLightbox } from "@/components/shared/ImageLightbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCommentTranslation } from "@/hooks/useCommentTranslation";
import { formatDistanceToNow } from "date-fns";
import { getDateLocale } from "@/lib/dateFnsLocale";

interface Comment {
  id: string;
  content: string;
  created_at: string;
  created_by_user_id: string;
  author_display_name?: string;
  parent_comment_id?: string | null;
  creator: {
    name: string;
    email: string;
  };
  images?: {
    id: string;
    url: string;
    filename: string;
  }[];
  mentions?: {
    mentioned_user_id: string;
    mentioned_user: {
      name: string;
    };
  }[];
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
}

interface CommentsSectionProps {
  taskId?: string;
  materialId?: string;
  entityId?: string;
  entityType?: string;
  drawingObjectId?: string;
  projectId?: string;
  chatMode?: boolean;
  /** Compact mode: minimal header, inline input, no empty state text. Used in lightboxes. */
  compact?: boolean;
}

const COLLAPSED_REPLY_THRESHOLD = 2;

// compressImage imported from @/lib/compressImage

export const CommentsSection = ({ taskId, materialId, entityId, entityType, drawingObjectId, projectId, chatMode = false, compact = false }: CommentsSectionProps) => {
  const { t, i18n } = useTranslation();
  const lightbox = useLightbox();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { translationsEnabled, translating, toggleTranslations, getTranslatedContent, targetLang } = useCommentTranslation();

  // Group comments into top-level and replies
  const { topLevelComments, repliesByParent } = useMemo(() => {
    const topLevel: Comment[] = [];
    const replies: Record<string, Comment[]> = {};

    for (const comment of comments) {
      if (comment.parent_comment_id) {
        if (!replies[comment.parent_comment_id]) {
          replies[comment.parent_comment_id] = [];
        }
        replies[comment.parent_comment_id].push(comment);
      } else {
        topLevel.push(comment);
      }
    }

    return { topLevelComments: topLevel, repliesByParent: replies };
  }, [comments]);

  const toggleThread = (parentId: string) => {
    setExpandedThreads(prev => {
      const next = new Set(prev);
      if (next.has(parentId)) {
        next.delete(parentId);
      } else {
        next.add(parentId);
      }
      return next;
    });
  };

  const handleReply = (comment: Comment) => {
    setReplyingTo(comment);
    textareaRef.current?.focus();
  };

  const cancelReply = () => {
    setReplyingTo(null);
  };

  // Handle image selection
  const handleImageSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const newFiles: File[] = [];
    const newPreviews: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('image/')) {
        // Compress the image
        const compressedFile = await compressImage(file);
        newFiles.push(compressedFile);

        // Create preview
        const previewUrl = URL.createObjectURL(compressedFile);
        newPreviews.push(previewUrl);
      }
    }

    setSelectedImages(prev => [...prev, ...newFiles]);
    setImagePreviews(prev => [...prev, ...newPreviews]);
  };

  // Remove selected image
  const removeImage = (index: number) => {
    URL.revokeObjectURL(imagePreviews[index]);
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  // Upload images to Supabase Storage
  const uploadImages = async (): Promise<{ id: string; url: string; filename: string }[]> => {
    const uploadedImages: { id: string; url: string; filename: string }[] = [];

    for (const image of selectedImages) {
      const fileName = `${Date.now()}-${image.name}`;
      // Use projects/{projectId}/comment-images/ path for RLS policy compatibility
      const filePath = projectId
        ? `projects/${projectId}/comment-images/${fileName}`
        : `comment-images/${fileName}`;

      const { error } = await supabase.storage
        .from('project-files')
        .upload(filePath, image);

      if (error) {
        console.error('Error uploading image:', error);
        continue;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('project-files')
        .getPublicUrl(filePath);

      uploadedImages.push({
        id: Date.now().toString(),
        url: publicUrl,
        filename: image.name
      });
    }

    return uploadedImages;
  };
  const [cursorPosition, setCursorPosition] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const abortController = new AbortController();

    fetchCurrentUser();
    fetchComments(abortController.signal);
    fetchTeamMembers();

    // Subscribe to new comments
    const entityFilter = taskId ? `task_id=eq.${taskId}` :
                       materialId ? `material_id=eq.${materialId}` :
                       drawingObjectId ? `drawing_object_id=eq.${drawingObjectId}` :
                       entityId ? `entity_id=eq.${entityId}` : '';

    const channel = supabase
      .channel(`comments_${taskId || materialId || drawingObjectId || entityId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'comments',
          filter: entityFilter,
        },
        () => {
          fetchComments(); // Real-time updates don't need abort signal
        }
      )
      .subscribe();

    return () => {
      abortController.abort();
      supabase.removeChannel(channel);
    };
  }, [taskId, materialId, drawingObjectId, entityId]);

  const fetchCurrentUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (profile) setCurrentUserId(profile.id);
    } catch (error) {
      console.error("Error fetching current user:", error);
    }
  };

  const fetchTeamMembers = async () => {
    if (!projectId) return;
    try {
      const members: TeamMember[] = [];

      // Get project owner - use maybeSingle to avoid 406 errors
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("owner_id")
        .eq("id", projectId)
        .maybeSingle();

      if (projectError) {
        console.warn("Could not fetch project owner:", projectError);
      }

      // Fetch owner profile separately
      if (project?.owner_id) {
        const { data: ownerProfile } = await supabase
          .from("profiles")
          .select("id, name, email")
          .eq("id", project.owner_id)
          .maybeSingle();

        if (ownerProfile) {
          members.push({
            id: ownerProfile.id,
            name: ownerProfile.name,
            email: ownerProfile.email,
          });
        }
      }

      // Get shared team members
      const { data: sharesData } = await supabase
        .from("project_shares")
        .select(`
          shared_with_user_id,
          profiles:shared_with_user_id(id, name, email)
        `)
        .eq("project_id", projectId);

      if (sharesData) {
        const existingIds = new Set(members.map(m => m.id));
        sharesData.forEach((share: unknown) => {
          const s = share as { profiles: { id: string; name: string; email: string } | null };
          if (s.profiles && !existingIds.has(s.profiles.id)) {
            existingIds.add(s.profiles.id);
            members.push({
              id: s.profiles.id,
              name: s.profiles.name,
              email: s.profiles.email,
            });
          }
        });
      }

      setTeamMembers(members);
    } catch (error) {
      console.error("Error fetching team members:", error);
    }
  };

  const fetchComments = async (_signal?: AbortSignal) => {
    try {
      const query = supabase
        .from("comments")
        .select(`
          id,
          content,
          images,
          created_at,
          created_by_user_id,
          author_display_name,
          parent_comment_id,
          creator:profiles(name, email),
          mentions:comment_mentions(
            mentioned_user_id,
            mentioned_user:profiles(name)
          )
        `)
        .order("created_at", { ascending: true });

      if (taskId) {
        query.eq("task_id", taskId);
      } else if (materialId) {
        query.eq("material_id", materialId);
      } else if (drawingObjectId) {
        query.eq("drawing_object_id", drawingObjectId);
      } else if (entityId) {
        query.eq("entity_id", entityId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setComments(data || []);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("Error fetching comments:", msg);
      toast({
        title: t('errors.generic'),
        description: t('comments.loadError'),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursor = e.target.selectionStart;
    setNewComment(value);
    setCursorPosition(cursor);

    // Check if user is typing @mention
    const textBeforeCursor = value.slice(0, cursor);
    const lastAtSymbol = textBeforeCursor.lastIndexOf('@');

    if (lastAtSymbol !== -1) {
      const textAfterAt = textBeforeCursor.slice(lastAtSymbol + 1);
      // If no space after @ and we're still at the cursor position
      if (!textAfterAt.includes(' ') && cursor === value.length) {
        setMentionSearch(textAfterAt.toLowerCase());
        setShowMentions(true);
        return;
      }
    }

    setShowMentions(false);
  };

  const insertMention = (member: TeamMember) => {
    const textBeforeCursor = newComment.slice(0, cursorPosition);
    const textAfterCursor = newComment.slice(cursorPosition);
    const lastAtSymbol = textBeforeCursor.lastIndexOf('@');

    const newText =
      newComment.slice(0, lastAtSymbol) +
      `@${member.name} ` +
      textAfterCursor;

    setNewComment(newText);
    setShowMentions(false);
    textareaRef.current?.focus();
  };

  const extractMentions = (text: string): string[] => {
    const mentionRegex = /@(\w+(?:\s+\w+)*)/g;
    const mentions: string[] = [];
    let match;

    while ((match = mentionRegex.exec(text)) !== null) {
      const mentionedName = match[1].trim();
      const member = teamMembers.find(m =>
        m.name.toLowerCase() === mentionedName.toLowerCase()
      );
      if (member) {
        mentions.push(member.id);
      }
    }

    return [...new Set(mentions)]; // Remove duplicates
  };

  const handlePostComment = async () => {
    if (!newComment.trim()) return;

    setPosting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!profile) throw new Error("Profile not found");

      // Upload images first
      let uploadedImages: { id: string; url: string; filename: string }[] = [];
      if (selectedImages.length > 0) {
        uploadedImages = await uploadImages();
      }

      // Create comment
      const commentData: Record<string, unknown> = {
        content: newComment.trim(),
        created_by_user_id: profile.id,
        images: uploadedImages.length > 0 ? uploadedImages : null,
      };

      if (replyingTo) {
        commentData.parent_comment_id = replyingTo.id;
      }

      if (taskId) {
        commentData.task_id = taskId;
      } else if (materialId) {
        commentData.material_id = materialId;
      } else if (drawingObjectId) {
        commentData.drawing_object_id = drawingObjectId;
      } else if (entityId) {
        commentData.entity_id = entityId;
        commentData.entity_type = entityType;
      }

      if (projectId) {
        commentData.project_id = projectId;
      }

      const { data: comment, error: commentError } = await supabase
        .from("comments")
        .insert(commentData)
        .select()
        .single();

      if (commentError) throw commentError;

      // Extract and save mentions
      const mentionedUserIds = extractMentions(newComment);
      if (mentionedUserIds.length > 0 && comment) {
        const mentionsData = mentionedUserIds.map(userId => ({
          comment_id: comment.id,
          mentioned_user_id: userId,
        }));

        const { error: mentionsError } = await supabase
          .from("comment_mentions")
          .insert(mentionsData);

        if (mentionsError) {
          console.error("Error saving mentions:", mentionsError);
        }
      }

      setNewComment("");
      setReplyingTo(null);
      // Clear selected images
      selectedImages.forEach((_, index) => {
        URL.revokeObjectURL(imagePreviews[index]);
      });
      setSelectedImages([]);
      setImagePreviews([]);
      fetchComments();

      toast({
        title: chatMode ? t('messaging.messageSent') : t('comments.commentPosted'),
        description: chatMode ? t('messaging.messageSentDescription') : t('comments.commentPostedDescription'),
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : undefined;
      toast({
        title: t('errors.generic'),
        description: msg || t('comments.postError'),
        variant: "destructive",
      });
    } finally {
      setPosting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!confirm(chatMode ? t('messaging.confirmDelete') : t('comments.confirmDeleteComment'))) return;

    try {
      const { error } = await supabase
        .from("comments")
        .delete()
        .eq("id", commentId);

      if (error) throw error;

      toast({
        title: t('comments.commentDeleted'),
        description: t('comments.commentDeletedDescription'),
      });

      fetchComments();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : undefined;
      toast({
        title: t('errors.generic'),
        description: msg || t('comments.deleteError'),
        variant: "destructive",
      });
    }
  };

  const filteredMembers = teamMembers.filter(member =>
    member.name.toLowerCase().includes(mentionSearch)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Shared reply banner component
  const replyBanner = replyingTo && (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/60 rounded-md text-xs border-l-2 border-primary">
      <Reply className="h-3 w-3 text-muted-foreground shrink-0" />
      <span className="text-muted-foreground truncate">
        {chatMode
          ? t('messaging.replyingTo', { name: replyingTo.author_display_name || replyingTo.creator?.name })
          : t('comments.replyingTo', { name: replyingTo.author_display_name || replyingTo.creator?.name })}
        {': '}
        <span className="italic">{replyingTo.content.slice(0, 60)}{replyingTo.content.length > 60 ? '...' : ''}</span>
      </span>
      <button
        type="button"
        className="ml-auto text-muted-foreground hover:text-foreground shrink-0"
        onClick={cancelReply}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );

  if (chatMode) {
    // Render a single chat bubble with optional reply indicator
    const renderChatBubble = (comment: Comment, isReply = false) => {
      const isOwn = comment.created_by_user_id === currentUserId;
      const parentComment = isReply && comment.parent_comment_id
        ? comments.find(c => c.id === comment.parent_comment_id)
        : null;

      return (
        <div
          key={comment.id}
          className={`flex ${isOwn ? 'justify-end' : 'justify-start'} group ${isReply ? 'ml-8' : ''}`}
        >
          <div className={`max-w-[80%] space-y-1 ${isOwn ? 'items-end' : 'items-start'}`}>
            {/* Reply indicator */}
            {isReply && parentComment && (
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Reply className="h-2.5 w-2.5" />
                <span>{parentComment.author_display_name || parentComment.creator?.name}</span>
              </div>
            )}
            <div
              className={`rounded-2xl px-3.5 py-2 text-sm ${
                isOwn
                  ? 'bg-primary text-primary-foreground rounded-br-md'
                  : 'bg-muted rounded-bl-md'
              } ${isReply ? 'border-l-2 border-primary/30' : ''}`}
            >
              {!isOwn && (
                <p className="text-xs font-medium mb-0.5 opacity-70">{comment.author_display_name || comment.creator?.name}</p>
              )}
              <p className="whitespace-pre-wrap break-words">
                {getTranslatedContent(comment.id, comment.content)}
              </p>
            </div>
            {/* Images */}
            {comment.images && comment.images.length > 0 && (
              <div className={`flex flex-wrap gap-1.5 ${isOwn ? 'justify-end' : ''}`}>
                {comment.images.map((image, idx) => (
                  <img
                    key={image.id}
                    src={image.url}
                    alt={image.filename}
                    className="max-w-28 max-h-28 object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => lightbox.open(comment.images!.map((img) => ({ id: img.id, url: img.url, filename: img.filename })), idx)}
                  />
                ))}
              </div>
            )}
            <div className={`flex items-center gap-2 ${isOwn ? 'justify-end' : ''}`}>
              <span className="text-[10px] text-muted-foreground">
                {formatDistanceToNow(new Date(comment.created_at), {
                  addSuffix: true,
                  locale: getDateLocale(i18n.language),
                })}
              </span>
              <button
                type="button"
                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary text-[10px]"
                onClick={() => handleReply(comment)}
              >
                {t('messaging.reply', 'Reply')}
              </button>
              {isOwn && (
                <button
                  type="button"
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  onClick={() => handleDeleteComment(comment.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        </div>
      );
    };

    return (
      <div className="space-y-3">
        {/* Private notice */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="h-3 w-3" />
          <span>{t('messaging.privateNotice')}</span>
        </div>

        {/* Messages list — chat bubble style */}
        <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
          {comments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {t('messaging.noMessages')}
            </p>
          ) : (
            topLevelComments.map((comment) => {
              const replies = repliesByParent[comment.id] || [];
              const hasCollapsedReplies = replies.length > COLLAPSED_REPLY_THRESHOLD;
              const isExpanded = expandedThreads.has(comment.id);
              const visibleReplies = hasCollapsedReplies && !isExpanded
                ? replies.slice(-COLLAPSED_REPLY_THRESHOLD)
                : replies;
              const hiddenCount = replies.length - COLLAPSED_REPLY_THRESHOLD;

              return (
                <div key={comment.id}>
                  {renderChatBubble(comment)}
                  {/* Show expand button for collapsed replies */}
                  {hasCollapsedReplies && !isExpanded && (
                    <button
                      type="button"
                      className="ml-8 mt-1 flex items-center gap-1 text-[10px] text-primary hover:underline"
                      onClick={() => toggleThread(comment.id)}
                    >
                      <ChevronDown className="h-3 w-3" />
                      {t('messaging.showReplies', { count: hiddenCount })}
                    </button>
                  )}
                  {visibleReplies.map((reply) => renderChatBubble(reply, true))}
                </div>
              );
            })
          )}
        </div>

        {/* Reply banner */}
        {replyBanner}

        {/* Image previews */}
        {imagePreviews.length > 0 && (
          <div className="flex flex-wrap gap-2 p-2 bg-muted rounded-md">
            {imagePreviews.map((preview, index) => (
              <div key={index} className="relative group">
                <img
                  src={preview}
                  alt={`Preview ${index + 1}`}
                  className="w-14 h-14 object-cover rounded-lg border"
                />
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

        {/* Message input */}
        <div className="relative">
          {showMentions && filteredMembers.length > 0 && (
            <div className="absolute bottom-full mb-1 w-full bg-popover border rounded-md shadow-lg max-h-40 overflow-y-auto z-10">
              {filteredMembers.map((member) => (
                <button
                  key={member.id}
                  className="w-full px-3 py-2 text-left hover:bg-accent text-sm flex items-center gap-2"
                  onClick={() => insertMention(member)}
                >
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className={`text-xs font-medium ${getAvatarColor(member.name)}`}>
                      {member.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span>{member.name}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageSelect}
              className="hidden"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => fileInputRef.current?.click()}
            >
              <Camera className="h-4 w-4" />
            </Button>
            <Textarea
              ref={textareaRef}
              placeholder={t('messaging.placeholder')}
              value={newComment}
              onChange={handleTextChange}
              className="flex-1 min-h-[40px] max-h-24 text-sm resize-none rounded-2xl"
              rows={1}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && replyingTo) {
                  e.preventDefault();
                  cancelReply();
                } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handlePostComment();
                }
              }}
            />
            <Button
              onClick={handlePostComment}
              disabled={posting || !newComment.trim()}
              size="icon"
              className="h-9 w-9 shrink-0 rounded-full"
            >
              {posting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Render a single comment in non-chat mode
  const renderComment = (comment: Comment, isReply = false) => {
    const replies = repliesByParent[comment.id] || [];
    const hasCollapsedReplies = replies.length > COLLAPSED_REPLY_THRESHOLD;
    const isExpanded = expandedThreads.has(comment.id);
    const visibleReplies = hasCollapsedReplies && !isExpanded
      ? replies.slice(-COLLAPSED_REPLY_THRESHOLD)
      : replies;
    const hiddenCount = replies.length - COLLAPSED_REPLY_THRESHOLD;

    return (
      <div key={comment.id}>
        <div className={`flex gap-3 group ${isReply ? 'ml-8 border-l-2 border-muted pl-3' : ''}`}>
          <Avatar className="h-8 w-8 flex-shrink-0">
            <AvatarFallback className={`text-xs font-medium ${getAvatarColor(comment.author_display_name || comment.creator?.name || "")}`}>
              {(comment.author_display_name || comment.creator?.name)?.charAt(0) || '?'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{comment.author_display_name || comment.creator?.name}</span>
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(comment.created_at), {
                  addSuffix: true,
                  locale: getDateLocale(i18n.language)
                })}
              </span>
            </div>
            <p className="text-sm whitespace-pre-wrap break-words">
              {getTranslatedContent(comment.id, comment.content)}
            </p>

            {/* Comment images */}
            {comment.images && comment.images.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {comment.images.map((image, idx) => (
                  <div key={image.id} className="relative group">
                    <img
                      src={image.url}
                      alt={image.filename}
                      className="max-w-32 max-h-32 object-cover rounded border cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => lightbox.open(comment.images!.map((img) => ({ id: img.id, url: img.url, filename: img.filename })), idx)}
                    />
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="opacity-0 group-hover:opacity-100 transition-opacity h-6 px-2 text-xs"
                onClick={() => handleReply(comment)}
              >
                <Reply className="h-3 w-3 mr-1" />
                {t('comments.reply', 'Reply')}
              </Button>
              {comment.created_by_user_id === currentUserId && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="opacity-0 group-hover:opacity-100 transition-opacity h-6 px-2"
                  onClick={() => handleDeleteComment(comment.id)}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  {t('comments.deleteButton')}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Thread replies */}
        {!isReply && replies.length > 0 && (
          <div className="mt-2 space-y-3">
            {hasCollapsedReplies && !isExpanded && (
              <button
                type="button"
                className="ml-8 flex items-center gap-1 text-xs text-primary hover:underline"
                onClick={() => toggleThread(comment.id)}
              >
                <ChevronDown className="h-3 w-3" />
                {t('comments.showReplies', { count: hiddenCount })}
              </button>
            )}
            {visibleReplies.map((reply) => renderComment(reply, true))}
          </div>
        )}
      </div>
    );
  };

  // Compact mode: minimal header + inline input (used in lightboxes)
  if (compact) {
    return (
      <div className="space-y-2">
        {/* Header — only show when there are comments */}
        {comments.length > 0 && (
          <div className="flex items-center gap-2 text-sm font-medium">
            <MessageSquare className="h-3.5 w-3.5" />
            <span>{t('comments.title')} ({comments.length})</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs ml-auto"
              disabled={translating}
              onClick={() => toggleTranslations(comments)}
            >
              {translating ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Languages className="h-3 w-3 mr-1" />
              )}
              {translating
                ? t('comments.translating', 'Translating...')
                : translationsEnabled
                  ? t('comments.showOriginal', 'Show original')
                  : t('comments.translateAll', { language: t(`languages.${targetLang}`, targetLang), defaultValue: `Translate all to ${targetLang}` })}
            </Button>
          </div>
        )}

        {/* Comments list — only rendered when there are comments */}
        {comments.length > 0 && (
          <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
            {topLevelComments.map((comment) => renderComment(comment))}
          </div>
        )}

        {/* Reply banner */}
        {replyBanner}

        {/* Image previews */}
        {imagePreviews.length > 0 && (
          <div className="flex flex-wrap gap-1.5 p-1.5 bg-muted rounded-md">
            {imagePreviews.map((preview, index) => (
              <div key={index} className="relative group">
                <img src={preview} alt={`Preview ${index + 1}`} className="w-12 h-12 object-cover rounded border" />
                <button type="button" onClick={() => removeImage(index)} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Inline input — camera + textarea + send */}
        <div className="relative">
          {showMentions && filteredMembers.length > 0 && (
            <div className="absolute bottom-full mb-1 w-full bg-popover border rounded-md shadow-lg max-h-40 overflow-y-auto z-10">
              {filteredMembers.map((member) => (
                <button key={member.id} className="w-full px-3 py-2 text-left hover:bg-accent text-sm flex items-center gap-2" onClick={() => insertMention(member)}>
                  <Avatar className="h-5 w-5"><AvatarFallback className={`text-[10px] font-medium ${getAvatarColor(member.name)}`}>{member.name.charAt(0)}</AvatarFallback></Avatar>
                  <span className="text-xs">{member.name}</span>
                </button>
              ))}
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageSelect} className="hidden" />
          <div className="flex items-end gap-1.5">
            <button type="button" className="h-9 w-9 shrink-0 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" onClick={() => fileInputRef.current?.click()}>
              <Camera className="h-4 w-4" />
            </button>
            <Textarea
              ref={textareaRef}
              placeholder={t('comments.placeholder')}
              value={newComment}
              onChange={handleTextChange}
              className="flex-1 min-h-[36px] max-h-20 text-sm resize-none"
              rows={1}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && replyingTo) { e.preventDefault(); cancelReply(); }
                else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handlePostComment(); }
              }}
            />
            <Button
              onClick={handlePostComment}
              disabled={posting || !newComment.trim()}
              size="icon"
              className="h-9 w-9 shrink-0 rounded-full"
            >
              {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <ImageLightbox {...lightbox.props} projectId={projectId} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <MessageSquare className="h-4 w-4" />
        <span>{t('comments.title')} ({comments.length})</span>
        {comments.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs ml-auto"
            disabled={translating}
            onClick={() => toggleTranslations(comments)}
          >
            {translating ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <Languages className="h-3 w-3 mr-1" />
            )}
            {translating
              ? t('comments.translating', 'Translating...')
              : translationsEnabled
                ? t('comments.showOriginal', 'Show original')
                : t('comments.translateAll', { language: t(`languages.${targetLang}`, targetLang), defaultValue: `Translate all to ${targetLang}` })}
          </Button>
        )}
      </div>

      {/* Comments list */}
      <div className="space-y-4 max-h-64 overflow-y-auto pr-2">
        {comments.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            {t('comments.noComments')}
          </p>
        ) : (
          topLevelComments.map((comment) => renderComment(comment))
        )}
      </div>

      {/* Reply banner */}
      {replyBanner}

      {/* New comment input */}
      <div className="space-y-2 relative">
        <Textarea
          ref={textareaRef}
          placeholder={t('comments.placeholder')}
          value={newComment}
          onChange={handleTextChange}
          className="w-full min-h-20 text-base resize-none"
          onKeyDown={(e) => {
            if (e.key === 'Escape' && replyingTo) {
              e.preventDefault();
              cancelReply();
            } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handlePostComment();
            }
          }}
        />

        {/* Mention suggestions */}
        {showMentions && filteredMembers.length > 0 && (
          <div className="absolute bottom-full mb-1 w-full bg-popover border rounded-md shadow-lg max-h-40 overflow-y-auto z-10">
            {filteredMembers.map((member) => (
              <button
                key={member.id}
                className="w-full px-3 py-2 text-left hover:bg-accent text-sm flex items-center gap-2"
                onClick={() => insertMention(member)}
              >
                <Avatar className="h-6 w-6">
                  <AvatarFallback className={`text-xs font-medium ${getAvatarColor(member.name)}`}>
                    {member.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-medium">{member.name}</div>
                  <div className="text-xs text-muted-foreground">{member.email}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Image previews */}
        {imagePreviews.length > 0 && (
          <div className="flex flex-wrap gap-2 p-2 bg-muted rounded-md">
            {imagePreviews.map((preview, index) => (
              <div key={index} className="relative group">
                <img
                  src={preview}
                  alt={`Preview ${index + 1}`}
                  className="w-16 h-16 object-cover rounded border"
                />
                <button
                  type="button"
                  onClick={() => removeImage(index)}
                  className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageSelect}
              className="hidden"
            />
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleImageSelect}
              className="hidden"
              ref={(el) => { if (el) el.dataset.camera = "true"; }}
              id="camera-capture-input"
            />
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                >
                  <Camera className="h-3 w-3 mr-1" />
                  {t('comments.addImage')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-40 p-1" align="start">
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm rounded hover:bg-muted"
                  onClick={() => { document.getElementById("camera-capture-input")?.click(); }}
                >
                  {t('comments.takePhoto')}
                </button>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm rounded hover:bg-muted"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {t('comments.chooseFiles', 'Välj filer')}
                </button>
              </PopoverContent>
            </Popover>
          </div>
          <Button
            onClick={handlePostComment}
            disabled={posting || !newComment.trim()}
            size="sm"
            title={t('comments.cmdEnterToPost')}
          >
            {posting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            {t('comments.postComment')}
          </Button>
        </div>
      </div>
      <ImageLightbox {...lightbox.props} projectId={projectId} />
    </div>
  );
};

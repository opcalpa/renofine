import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ImageLightbox, useLightbox, type LightboxImage } from "@/components/shared/ImageLightbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { getDateLocale } from "@/lib/dateFnsLocale";
import { CheckSquare, Package, Home, Pencil, MessageSquare, Reply, Trash2 } from "lucide-react";
import type { FeedComment, FeedContextType } from "./types";
import { getContextType, getContextLabel, renderContentWithMentions } from "./utils";
import { ReactionBar } from "./ReactionBar";

const contextIcons: Record<FeedContextType, React.ReactNode> = {
  task: <CheckSquare className="h-3 w-3" />,
  material: <Package className="h-3 w-3" />,
  room: <Home className="h-3 w-3" />,
  drawing_object: <Pencil className="h-3 w-3" />,
  project: <MessageSquare className="h-3 w-3" />,
};

const contextColors: Record<FeedContextType, string> = {
  task: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  material: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  room: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  drawing_object: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  project: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

interface FeedCommentCardProps {
  comment: FeedComment;
  compact?: boolean;
  translatedContent?: string;
  onReply?: (comment: FeedComment) => void;
  onNavigate?: (comment: FeedComment) => void;
  onAvatarClick?: (profileId: string, name: string) => void;
  currentProfileId?: string | null;
  projectId?: string;
  /** Called after the comment is deleted so the parent can drop it from its list. */
  onDeleted?: (commentId: string) => void;
}

export const FeedCommentCard = ({ comment, compact, translatedContent, onReply, onNavigate, onAvatarClick, currentProfileId, projectId, onDeleted }: FeedCommentCardProps) => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const lightbox = useLightbox();
  const [deleting, setDeleting] = useState(false);
  const contextType = getContextType(comment);
  const contextLabel = getContextLabel(comment);
  const isEntityComment = contextType !== "project";
  // RLS only allows authors to delete their own comments; worker comments carry
  // the owner's profile id, so the owner can moderate those too.
  const canDelete = !!currentProfileId && comment.created_by_user_id === currentProfileId;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase.from("comments").delete().eq("id", comment.id);
      if (error) throw error;
      toast({
        title: t("comments.commentDeleted"),
        description: t("comments.commentDeletedDescription"),
      });
      onDeleted?.(comment.id);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : undefined;
      toast({
        title: t("errors.generic"),
        description: msg || t("comments.deleteError"),
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex gap-3 p-3 rounded-lg border bg-card">
      <Avatar
        className={`h-8 w-8 flex-shrink-0 ${onAvatarClick && comment.created_by_user_id ? "cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all" : ""}`}
        onClick={() => {
          if (onAvatarClick && comment.created_by_user_id && comment.creator?.name) {
            onAvatarClick(comment.created_by_user_id, comment.creator.name);
          }
        }}
      >
        {comment.creator?.avatar_url && (
          <AvatarImage src={comment.creator.avatar_url} alt={comment.creator.name} />
        )}
        <AvatarFallback className="text-xs">
          {comment.creator?.name?.charAt(0) || "?"}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{comment.creator?.name}</span>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(comment.created_at), {
              addSuffix: true,
              locale: getDateLocale(i18n.language),
            })}
          </span>
          {!compact && (
            <Badge
              variant="outline"
              className={`text-xs gap-1 px-1.5 py-0 ${contextColors[contextType]} ${isEntityComment && onNavigate ? "cursor-pointer hover:underline" : ""}`}
              onClick={isEntityComment && onNavigate ? () => onNavigate(comment) : undefined}
              role={isEntityComment && onNavigate ? "button" : undefined}
            >
              {contextIcons[contextType]}
              <span>{t(`feed.contextTypes.${contextType}`)}</span>
              {contextLabel && (
                <>
                  <span className="opacity-50">·</span>
                  <span className="truncate max-w-[120px]">{contextLabel}</span>
                </>
              )}
            </Badge>
          )}
        </div>
        <p className="text-sm whitespace-pre-wrap break-words">{renderContentWithMentions(translatedContent || comment.content)}</p>
        {comment.images && comment.images.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-1">
            {comment.images.map((image, idx) => (
              <img
                key={image.id}
                src={image.url}
                alt={image.filename}
                className="max-w-32 max-h-32 object-cover rounded border cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => lightbox.open(
                  comment.images!.map((img) => ({ id: img.id, url: img.url, filename: img.filename })),
                  idx
                )}
              />
            ))}
          </div>
        )}
        <ImageLightbox {...lightbox.props} projectId={projectId} />
        <div className="flex items-center gap-2">
          {isEntityComment && onReply && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => onReply(comment)}
            >
              <Reply className="h-3 w-3 mr-1" />
              {t("feed.reply")}
            </Button>
          )}
          <ReactionBar commentId={comment.id} profileId={currentProfileId ?? null} />
          {canDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                  disabled={deleting}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  {t("comments.deleteButton")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("comments.deleteButton")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("comments.confirmDeleteComment")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("common.cancel", "Avbryt")}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {t("comments.deleteButton")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
    </div>
  );
};

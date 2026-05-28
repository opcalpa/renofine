import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { getDateLocale } from "@/lib/dateFnsLocale";
import { CheckSquare, Package, Home, Pencil, MessageSquare, ChevronDown, Languages, Loader2 } from "lucide-react";
import { useCommentTranslation } from "@/hooks/useCommentTranslation";
import type { FeedComment, FeedContextType, FeedThreadGroup } from "./types";
import { FeedCommentCard } from "./FeedCommentCard";
import { FeedReplyInput } from "./FeedReplyInput";

const contextIcons: Record<FeedContextType, React.ReactNode> = {
  task: <CheckSquare className="h-3.5 w-3.5" />,
  material: <Package className="h-3.5 w-3.5" />,
  room: <Home className="h-3.5 w-3.5" />,
  drawing_object: <Pencil className="h-3.5 w-3.5" />,
  project: <MessageSquare className="h-3.5 w-3.5" />,
};

const contextColors: Record<FeedContextType, string> = {
  task: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  material: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  room: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  drawing_object: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  project: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

const VISIBLE_COUNT = 3;

interface FeedThreadProps {
  group: FeedThreadGroup;
  projectId: string;
  onNavigate?: (comment: FeedComment) => void;
  onCommentPosted: () => void;
}

export const FeedThread = ({ group, projectId, onNavigate, onCommentPosted }: FeedThreadProps) => {
  const { t, i18n } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [replyTarget, setReplyTarget] = useState<FeedComment | null>(null);
  const { translationsEnabled, translating, toggleTranslations, ensureTranslations, getTranslatedContent, targetLang } = useCommentTranslation();

  const { contextType, contextLabel, comments } = group;

  // Auto-load translations so the default "translations on" state lands
  // with content already cached. Idempotent — only uncached ids hit the API.
  useEffect(() => {
    if (translationsEnabled && comments.length > 0) {
      ensureTranslations(comments.map((c) => ({ id: c.id, content: c.content })));
    }
  }, [comments, translationsEnabled, ensureTranslations]);

  const isEntityThread = contextType !== "project";
  const latestComment = comments[comments.length - 1];
  const hiddenCount = comments.length - VISIBLE_COUNT;
  const visibleComments = expanded || comments.length <= VISIBLE_COUNT
    ? comments
    : comments.slice(comments.length - VISIBLE_COUNT);

  const commentCountLabel = comments.length === 1
    ? t("feed.commentCount")
    : t("feed.commentsCount", { count: comments.length });

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Thread header */}
      <div
        className={`flex items-center gap-2 px-3 py-2 border-b bg-muted/30 ${isEntityThread && onNavigate ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}`}
        onClick={isEntityThread && onNavigate ? () => onNavigate(group.firstComment) : undefined}
        role={isEntityThread && onNavigate ? "button" : undefined}
      >
        <Badge
          variant="outline"
          className={`text-xs gap-1 px-1.5 py-0 ${contextColors[contextType]}`}
        >
          {contextIcons[contextType]}
          <span>{t(`feed.contextTypes.${contextType}`)}</span>
        </Badge>
        {contextLabel && (
          <span className="text-sm font-medium truncate max-w-[200px]">{contextLabel}</span>
        )}
        <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">
          {commentCountLabel}
          {" · "}
          {formatDistanceToNow(new Date(latestComment.created_at), {
            addSuffix: true,
            locale: getDateLocale(i18n.language),
          })}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs flex-shrink-0"
          disabled={translating}
          onClick={(e) => { e.stopPropagation(); toggleTranslations(comments); }}
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

      {/* Comments */}
      <div className="divide-y">
        {!expanded && hiddenCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-8 text-xs text-muted-foreground rounded-none"
            onClick={() => setExpanded(true)}
          >
            <ChevronDown className="h-3 w-3 mr-1" />
            {t("feed.showEarlier", { count: hiddenCount })}
          </Button>
        )}
        {visibleComments.map((comment) => (
          <div key={comment.id} className="px-1">
            <FeedCommentCard
              comment={comment}
              compact
              translatedContent={translationsEnabled ? getTranslatedContent(comment.id, comment.content) : undefined}
              onReply={() => setReplyTarget(group.firstComment)}
              onNavigate={onNavigate}
            />
          </div>
        ))}
      </div>

      {/* Inline reply */}
      {replyTarget && (
        <div className="border-t">
          <FeedReplyInput
            replyTarget={replyTarget}
            projectId={projectId}
            onPosted={() => { setReplyTarget(null); onCommentPosted(); }}
            onCancel={() => setReplyTarget(null)}
          />
        </div>
      )}
    </div>
  );
};

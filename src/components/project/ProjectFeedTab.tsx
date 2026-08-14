import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { FeedThread } from "./feed/FeedThread";
import { FeedCommentCard } from "./feed/FeedCommentCard";
import { ActivityCard } from "./feed/ActivityCard";
import { GeneralCommentInput } from "./feed/GeneralCommentInput";
import { fetchAllProjectComments, groupComments, parseMentions, fetchProjectActivities, mergeIntoUnifiedFeed } from "./feed/utils";
import { useCurrentProfileId } from "@/hooks/useCurrentProfileId";
import type { FeedComment, FeedThreadGroup, ActivityLogItem, FeedFilterMode, UnifiedFeedItem } from "./feed/types";

interface ProjectFeedTabProps {
  projectId: string;
  onNavigateToEntity?: (comment: FeedComment) => void;
  restrictToUserId?: string;
}

async function filterThreadsForUser(
  groups: FeedThreadGroup[],
  userId: string,
  projectId: string
): Promise<FeedThreadGroup[]> {
  const taskIds = new Set<string>();
  const materialIds = new Set<string>();
  for (const g of groups) {
    for (const c of g.comments) {
      if (c.task_id) taskIds.add(c.task_id);
      if (c.material_id) materialIds.add(c.material_id);
    }
  }

  const assignedTaskIds = new Set<string>();
  const assignedMaterialIds = new Set<string>();

  if (taskIds.size > 0) {
    const { data: tasks } = await supabase
      .from("tasks")
      .select("id")
      .in("id", Array.from(taskIds))
      .eq("assigned_to_stakeholder_id", userId);
    tasks?.forEach((t) => assignedTaskIds.add(t.id));
  }

  if (materialIds.size > 0) {
    const { data: materials } = await supabase
      .from("materials")
      .select("id, assigned_to_user_id")
      .in("id", Array.from(materialIds));
    materials?.forEach((m) => {
      if ((m as Record<string, unknown>).assigned_to_user_id === userId) {
        assignedMaterialIds.add(m.id);
      }
    });
  }

  const allCommentIds = groups.flatMap((g) => g.comments.map((c) => c.id));
  const mentionedCommentIds = new Set<string>();
  if (allCommentIds.length > 0) {
    const { data: mentions } = await supabase
      .from("comment_mentions")
      .select("comment_id")
      .eq("mentioned_user_id", userId)
      .in("comment_id", allCommentIds);
    mentions?.forEach((m) => mentionedCommentIds.add(m.comment_id));
  }

  return groups.filter((group) => {
    for (const c of group.comments) {
      if (c.created_by_user_id === userId) return true;
      if (mentionedCommentIds.has(c.id)) return true;
      const contentMentions = parseMentions(c.content);
      if (contentMentions.some((m) => m.profileId === userId)) return true;
      if (c.task_id && assignedTaskIds.has(c.task_id)) return true;
      if (c.material_id && assignedMaterialIds.has(c.material_id)) return true;
    }
    return false;
  });
}

const ProjectFeedTab = ({ projectId, onNavigateToEntity, restrictToUserId }: ProjectFeedTabProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [comments, setComments] = useState<FeedComment[]>([]);
  const [activities, setActivities] = useState<ActivityLogItem[]>([]);
  const [filteredGroups, setFilteredGroups] = useState<FeedThreadGroup[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterMode, setFilterMode] = useState<FeedFilterMode>("all");
  const currentProfileId = useCurrentProfileId();

  const handleCommentDeleted = (commentId: string) => {
    setComments((prev) => prev.filter((c) => c.id !== commentId));
  };

  const loadData = async () => {
    try {
      const [commentsData, activitiesData] = await Promise.all([
        fetchAllProjectComments(projectId),
        fetchProjectActivities(projectId),
      ]);
      setComments(commentsData);
      setActivities(activitiesData);

      if (restrictToUserId) {
        const allGroups = groupComments(commentsData);
        const filtered = await filterThreadsForUser(allGroups, restrictToUserId, projectId);
        setFilteredGroups(filtered);
      } else {
        setFilteredGroups(null);
      }
    } catch {
      toast({ title: t("errors.generic"), description: t("feed.loadError"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel(`feed_${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comments", filter: `project_id=eq.${projectId}` },
        () => { loadData(); }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_log", filter: `project_id=eq.${projectId}` },
        () => { loadData(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [projectId, restrictToUserId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const groups = filteredGroups ?? groupComments(comments);
  const unifiedFeed = mergeIntoUnifiedFeed(comments, activities);

  const renderFilterBar = () => (
    <div className="flex gap-1 mb-3">
      {(["all", "comments", "activity"] as const).map((mode) => (
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
  );

  const renderUnifiedFeed = (items: UnifiedFeedItem[]) => {
    if (items.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">{t("feed.noComments")}</p>
          <p className="text-xs mt-1">{t("feed.noCommentsHint", "Comments and activity from your team will appear here")}</p>
        </div>
      );
    }
    return items.map((item) => {
      if (item.type === "comment" && item.comment) {
        return (
          <FeedCommentCard
            key={`c-${item.comment.id}`}
            comment={item.comment}
            onNavigate={onNavigateToEntity}
            projectId={projectId}
            currentProfileId={currentProfileId}
            onDeleted={handleCommentDeleted}
          />
        );
      }
      if (item.type === "activity" && item.activity) {
        return (
          <ActivityCard key={`a-${item.activity.id}`} activity={item.activity} />
        );
      }
      return null;
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="mb-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <MessageSquare className="h-6 w-6" />
          {t("feed.title")}
        </h2>
        <p className="text-muted-foreground text-sm mt-1">{t("feed.description")}</p>
      </div>

      {renderFilterBar()}

      <div className="flex-1 space-y-3 overflow-y-auto mb-4">
        {filterMode === "comments" ? (
          groups.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>{t("feed.noComments")}</p>
            </div>
          ) : (
            groups.map((group) => (
              <FeedThread
                key={group.key}
                group={group}
                projectId={projectId}
                onNavigate={onNavigateToEntity}
                onCommentPosted={loadData}
                currentProfileId={currentProfileId}
                onCommentDeleted={handleCommentDeleted}
              />
            ))
          )
        ) : filterMode === "activity" ? (
          renderUnifiedFeed(unifiedFeed.filter((i) => i.type === "activity"))
        ) : (
          renderUnifiedFeed(unifiedFeed)
        )}
      </div>

      <GeneralCommentInput projectId={projectId} onPosted={loadData} />
    </div>
  );
};

export default ProjectFeedTab;

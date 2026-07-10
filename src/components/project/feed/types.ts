export interface FeedComment {
  id: string;
  content: string;
  created_at: string;
  created_by_user_id: string;
  images?: { id: string; url: string; filename: string }[] | null;
  creator: {
    name: string;
    email: string;
    avatar_url?: string | null;
  } | null;
  // Context: which entity this comment belongs to
  task_id?: string | null;
  material_id?: string | null;
  entity_id?: string | null;
  entity_type?: string | null;
  drawing_object_id?: string | null;
  project_id?: string | null;
  // Joined context names
  task?: { title: string } | null;
  material?: { name: string } | null;
  room?: { name: string } | null;
  drawing_object?: { name: string } | null;
}

export interface MentionUser {
  id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
}

export type FeedContextType = "task" | "material" | "room" | "drawing_object" | "project";

export interface ActivityLogItem {
  id: string;
  project_id: string;
  actor_id: string | null;
  action: "created" | "status_changed" | "assigned" | "deleted" | "member_added" | "member_removed";
  entity_type: "task" | "room" | "material" | "floor_plan" | "team_member";
  entity_id: string | null;
  entity_name: string | null;
  changes: Record<string, unknown>;
  created_at: string;
  actor: { name: string; email: string } | null;
  /** Set at fetch time when the entity was later undone/deleted — rows stay as
   *  history but must not link to something that no longer exists. */
  entityGone?: boolean;
}

export interface PhotoFeedItem {
  id: string;
  url: string;
  caption?: string | null;
  createdAt: string;
  source: "project" | "room" | "task" | "material" | "comment" | "file";
  sourceName?: string;
}

export interface UnifiedFeedItem {
  type: "comment" | "activity" | "photo";
  created_at: string;
  comment?: FeedComment;
  activity?: ActivityLogItem;
  photo?: PhotoFeedItem;
}

export type FeedFilterMode = "all" | "comments" | "activity" | "photos";

export interface FeedThreadGroup {
  key: string;
  contextType: FeedContextType;
  contextLabel: string;
  firstComment: FeedComment;
  comments: FeedComment[];
}

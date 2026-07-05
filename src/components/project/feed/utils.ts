import React from "react";
import { supabase } from "@/integrations/supabase/client";
import type { FeedComment, FeedContextType, FeedThreadGroup, ActivityLogItem, UnifiedFeedItem } from "./types";

export async function fetchAllProjectComments(projectId: string): Promise<FeedComment[]> {
  // Fetch all comments linked to this project's entities + project-level comments
  // We query comments that belong to tasks, materials, rooms, or drawing objects of this project,
  // plus comments with project_id directly set.

  const results: FeedComment[] = [];

  // 1. Task comments
  const { data: taskComments } = await supabase
    .from("comments")
    .select(`
      id, content, created_at, created_by_user_id, images, task_id,
      creator:profiles(name, email, avatar_url),
      task:tasks!inner(title, project_id)
    `)
    .not("task_id", "is", null)
    .eq("task.project_id", projectId)
    .order("created_at", { ascending: false });

  if (taskComments) results.push(...(taskComments as unknown as FeedComment[]));

  // 2. Material (purchase order) comments
  const { data: materialComments } = await supabase
    .from("comments")
    .select(`
      id, content, created_at, created_by_user_id, images, material_id,
      creator:profiles(name, email, avatar_url),
      material:materials!inner(name, project_id)
    `)
    .not("material_id", "is", null)
    .eq("material.project_id", projectId)
    .order("created_at", { ascending: false });

  if (materialComments) results.push(...(materialComments as unknown as FeedComment[]));

  // 3. Drawing object comments — PostgREST cannot resolve the
  //    drawing_object_id FK, so fetch without join and enrich client-side.
  const { data: drawingComments } = await supabase
    .from("comments")
    .select(`
      id, content, created_at, created_by_user_id, images, drawing_object_id,
      creator:profiles(name, email, avatar_url)
    `)
    .not("drawing_object_id", "is", null)
    .order("created_at", { ascending: false });

  if (drawingComments && drawingComments.length > 0) {
    const shapeIds = drawingComments.map(c => (c as unknown as FeedComment).drawing_object_id).filter(Boolean) as string[];
    const { data: shapes } = await supabase
      .from("floor_map_shapes")
      .select("id, name, plan_id, floor_map_plans(project_id)")
      .in("id", shapeIds);

    const projectShapeMap = new Map<string, string>();
    if (shapes) {
      for (const s of shapes as unknown as { id: string; name: string; floor_map_plans: { project_id: string } | null }[]) {
        if (s.floor_map_plans?.project_id === projectId) {
          projectShapeMap.set(s.id, s.name || "");
        }
      }
    }

    for (const c of drawingComments as unknown as FeedComment[]) {
      if (c.drawing_object_id && projectShapeMap.has(c.drawing_object_id)) {
        c.drawing_object = { name: projectShapeMap.get(c.drawing_object_id) || "" };
        results.push(c);
      }
    }
  }

  // 4. Project-level (general) comments
  const { data: projectComments } = await supabase
    .from("comments")
    .select(`
      id, content, created_at, created_by_user_id, images, project_id,
      creator:profiles(name, email, avatar_url)
    `)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (projectComments) results.push(...(projectComments as unknown as FeedComment[]));

  // Sort all by created_at descending
  results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return results;
}

export function getContextType(comment: FeedComment): FeedContextType {
  if (comment.task_id) return "task";
  if (comment.material_id) return "material";
  if (comment.entity_id) return "room";
  if (comment.drawing_object_id) return "drawing_object";
  return "project";
}

export function getContextLabel(comment: FeedComment): string {
  if (comment.task_id && comment.task) return (comment.task as { title: string }).title;
  if (comment.material_id && comment.material) return (comment.material as { name: string }).name;
  if (comment.entity_id && comment.room) return (comment.room as { name: string }).name;
  if (comment.drawing_object_id && comment.drawing_object) return (comment.drawing_object as { name: string }).name;
  return "";
}

function getContextKey(comment: FeedComment): string {
  if (comment.task_id) return `task:${comment.task_id}`;
  if (comment.material_id) return `material:${comment.material_id}`;
  if (comment.entity_id) return `room:${comment.entity_id}`;
  if (comment.drawing_object_id) return `drawing:${comment.drawing_object_id}`;
  return "project";
}

export function groupComments(comments: FeedComment[]): FeedThreadGroup[] {
  const groupMap = new Map<string, FeedComment[]>();

  for (const comment of comments) {
    const key = getContextKey(comment);
    const list = groupMap.get(key);
    if (list) {
      list.push(comment);
    } else {
      groupMap.set(key, [comment]);
    }
  }

  const groups: FeedThreadGroup[] = [];
  for (const [key, groupComments] of groupMap) {
    // Sort comments within group oldest first (chronological)
    groupComments.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const firstComment = groupComments[0];
    groups.push({
      key,
      contextType: getContextType(firstComment),
      contextLabel: getContextLabel(firstComment),
      firstComment,
      comments: groupComments,
    });
  }

  // Sort groups by most recent comment (newest group first)
  groups.sort((a, b) => {
    const aLatest = new Date(a.comments[a.comments.length - 1].created_at).getTime();
    const bLatest = new Date(b.comments[b.comments.length - 1].created_at).getTime();
    return bLatest - aLatest;
  });

  return groups;
}

const MENTION_REGEX = /@\[([^\]]+)\]\(([^)]+)\)/g;

export function parseMentions(content: string): { profileId: string; name: string }[] {
  const mentions: { profileId: string; name: string }[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(MENTION_REGEX.source, "g");
  while ((match = re.exec(content)) !== null) {
    mentions.push({ name: match[1], profileId: match[2] });
  }
  return mentions;
}

export function renderContentWithMentions(content: string): React.ReactNode {
  const re = new RegExp(MENTION_REGEX.source, "g");
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = re.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }
    parts.push(
      React.createElement(
        "span",
        {
          key: key++,
          className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded px-0.5 font-medium",
        },
        `@${match[1]}`
      )
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return parts.length > 0 ? parts : content;
}

export async function fetchProjectActivities(projectId: string): Promise<ActivityLogItem[]> {
  const { data, error } = await supabase
    .from("activity_log")
    .select(`
      id, project_id, actor_id, action, entity_type, entity_id, entity_name, changes, created_at,
      actor:profiles!activity_log_actor_id_fkey(name, email)
    `)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch activities:", error);
    return [];
  }

  const rows = (data ?? []) as unknown as ActivityLogItem[];

  // Entities Renaida created get two rows: the generic DB-trigger "created" row
  // and Renaida's explicit receipt. Keep the receipt, drop the duplicate.
  const createdByRenaida = new Set(
    rows
      .filter((r) => r.action === "renaida_task_create" || r.action === "renaida_room_create")
      .map((r) => `${r.entity_type}:${r.entity_id}`)
  );
  // Same for undo: the "Renaida ångrade" receipt lists the entity ids it removed —
  // suppress the DB-trigger "deleted" rows for those so one action reads as one row.
  const undoneByRenaida = new Set(
    rows
      .filter((r) => r.action === "renaida_undo")
      .flatMap((r) => (Array.isArray(r.changes?.entityIds) ? (r.changes.entityIds as string[]) : []))
  );
  return rows.filter((r) => {
    if (r.action === "created" && createdByRenaida.has(`${r.entity_type}:${r.entity_id}`)) return false;
    if (r.action === "deleted" && undoneByRenaida.has(r.entity_id)) return false;
    return true;
  });
}

export function mergeIntoUnifiedFeed(
  comments: FeedComment[],
  activities: ActivityLogItem[]
): UnifiedFeedItem[] {
  const items: UnifiedFeedItem[] = [
    ...comments.map((c) => ({ type: "comment" as const, created_at: c.created_at, comment: c })),
    ...activities.map((a) => ({ type: "activity" as const, created_at: a.created_at, activity: a })),
  ];
  items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return items;
}

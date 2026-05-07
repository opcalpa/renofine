import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface NotificationItem {
  id: string;
  type: "comment" | "mention" | "task" | "material" | "quote_accepted" | "quote_rejected" | "dm";
  title: string;
  preview: string;
  projectId: string;
  projectName: string;
  createdAt: string;
  isUnread: boolean;
  entityType?: "task" | "material" | "room" | "drawing_object" | "project" | "quote";
  entityId?: string;
  entityName?: string;
}

const LAST_READ_KEY = "renofine_notifications_lastReadAt";
const READ_IDS_KEY = "renofine_notifications_readIds";
const POLL_INTERVAL = 30_000;

function getLastReadAt(): string {
  return localStorage.getItem(LAST_READ_KEY) || new Date(0).toISOString();
}

function getReadIds(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_IDS_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveReadIds(ids: Set<string>) {
  // Keep only the most recent 200 IDs to avoid unbounded growth
  const arr = Array.from(ids);
  localStorage.setItem(READ_IDS_KEY, JSON.stringify(arr.slice(-200)));
}

function truncate(text: string, max = 80): string {
  // Strip mention markup like @[Name](id)
  const clean = text.replace(/@\[([^\]]+)\]\([^)]+\)/g, "@$1");
  return clean.length > max ? clean.slice(0, max) + "..." : clean;
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchNotifications = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    // Resolve auth UID → profiles.id (all FKs use profiles.id)
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();
    if (!profile) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    const userId = profile.id;
    const lastReadAt = getLastReadAt();
    const readIds = getReadIds();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Get user's project IDs (owned + shared)
    const [ownedRes, sharedRes] = await Promise.all([
      supabase.from("projects").select("id, name").eq("owner_id", userId).is("deleted_at", null),
      supabase.from("project_shares").select("project_id, project:projects(id, name)").eq("shared_with_user_id", userId),
    ]);

    const projectMap = new Map<string, string>();
    ownedRes.data?.forEach((p) => projectMap.set(p.id, p.name));
    sharedRes.data?.forEach((s) => {
      const proj = s.project as unknown as { id: string; name: string } | null;
      if (proj) projectMap.set(proj.id, proj.name);
    });

    const projectIds = Array.from(projectMap.keys());

    const items: NotificationItem[] = [];

    // Shared select for comment queries (includes task/material name + project_id fallback)
    const commentSelect = `
      id, content, created_at, created_by_user_id, task_id, material_id, project_id,
      entity_id, entity_type,
      creator:profiles(name),
      task:tasks(title, project_id),
      material:materials(name, project_id)
    `;

    type CommentRow = {
      id: string; content: string; created_at: string; created_by_user_id: string;
      task_id: string | null; material_id: string | null; project_id: string | null;
      entity_id: string | null; entity_type: string | null;
      creator: { name: string } | null;
      task: { title: string; project_id: string } | null;
      material: { name: string; project_id: string } | null;
    };

    function resolveProject(c: CommentRow): string {
      return c.project_id || c.task?.project_id || c.material?.project_id || "";
    }

    function resolveEntityName(c: CommentRow): string | undefined {
      if (c.task_id && c.task) return c.task.title;
      if (c.material_id && c.material) return c.material.name;
      if (c.entity_type === "quote" && c.entity_id) return undefined;
      return undefined;
    }

    function resolveEntityType(c: CommentRow): NotificationItem["entityType"] {
      if (c.task_id) return "task";
      if (c.material_id) return "material";
      if (c.entity_type === "quote") return "quote";
      return "project";
    }

    // 1. Mentions — always fetch regardless of project membership
    const { data: mentionRows } = await supabase
      .from("comment_mentions")
      .select("comment_id")
      .eq("mentioned_user_id", userId);

    const mentionCommentIds = mentionRows?.map((r) => r.comment_id) || [];

    if (mentionCommentIds.length > 0) {
      const { data: mentionComments } = await supabase
        .from("comments")
        .select(commentSelect)
        .in("id", mentionCommentIds)
        .gte("created_at", sevenDaysAgo)
        .order("created_at", { ascending: false })
        .limit(30);

      if (mentionComments) {
        for (const c of mentionComments as unknown as CommentRow[]) {
          const pId = resolveProject(c);
          // Don't filter mentions by project membership — if a user is mentioned, always show it
          items.push({
            id: `mention-${c.id}`,
            type: "mention",
            title: c.creator?.name || "Someone",
            preview: truncate(c.content),
            projectId: pId,
            projectName: projectMap.get(pId) || "",
            createdAt: c.created_at,
            isUnread: c.created_at > lastReadAt && !readIds.has(`mention-${c.id}`) && !readIds.has(`comment-${c.id}`),
            entityType: resolveEntityType(c),
            entityId: c.task_id || c.material_id || c.entity_id || undefined,
            entityName: resolveEntityName(c),
          });
        }
      }
    }

    // Remaining queries require project membership
    if (projectIds.length === 0) {
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setNotifications(items.slice(0, 50));
      setLoading(false);
      return;
    }

    // 2. Comments by others on user's projects
    const { data: recentComments } = await supabase
      .from("comments")
      .select(commentSelect)
      .in("project_id", projectIds)
      .neq("created_by_user_id", userId)
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(30);

    if (recentComments) {
      for (const c of recentComments as unknown as CommentRow[]) {
        const pId = resolveProject(c);
        if (items.some((i) => i.id === `mention-${c.id}`)) continue;

        // Detect quote accept/decline comments by content pattern (works across locales)
        const isQuoteComment = c.entity_type === "quote";
        let type: NotificationItem["type"] = "comment";
        let title = c.creator?.name || "Someone";
        if (isQuoteComment) {
          const lc = c.content.toLowerCase();
          // Match known i18n patterns: "accepted the quote" / "godkände offerten"
          if (/accepted the quote|godkände offerten|zaakceptowan|прийня/i.test(lc)) {
            type = "quote_accepted";
            // Extract quote name from content (between quotes or after the pattern)
            const quoteNameMatch = c.content.match(/[""]([^""]+)[""]|"([^"]+)"/);
            title = quoteNameMatch ? (quoteNameMatch[1] || quoteNameMatch[2]) : (c.entity_id || "");
          } else if (/declined the quote|avböjde offerten|odrzucon|відхил/i.test(lc)) {
            type = "quote_rejected";
            const quoteNameMatch = c.content.match(/[""]([^""]+)[""]|"([^"]+)"/);
            title = quoteNameMatch ? (quoteNameMatch[1] || quoteNameMatch[2]) : (c.entity_id || "");
          }
        }

        items.push({
          id: `comment-${c.id}`,
          type,
          title,
          preview: type === "quote_accepted" || type === "quote_rejected" ? "" : truncate(c.content),
          projectId: pId,
          projectName: projectMap.get(pId) || "",
          createdAt: c.created_at,
          isUnread: c.created_at > lastReadAt && !readIds.has(`mention-${c.id}`) && !readIds.has(`comment-${c.id}`),
          entityType: resolveEntityType(c),
          entityId: c.task_id || c.material_id || c.entity_id || undefined,
          entityName: resolveEntityName(c),
        });
      }
    }

    // 2b. Comments by others on tasks/materials in the user's projects
    const { data: userTasks } = await supabase
      .from("tasks")
      .select("id")
      .in("project_id", projectIds);
    const { data: userMaterials } = await supabase
      .from("materials")
      .select("id")
      .in("project_id", projectIds);

    // Cap IDs to avoid overly long URLs that cause Supabase 500 errors
    const MAX_IN_IDS = 50;
    const userTaskIds = (userTasks?.map((t) => t.id) || []).slice(0, MAX_IN_IDS);
    const userMaterialIds = (userMaterials?.map((m) => m.id) || []).slice(0, MAX_IN_IDS);
    const seenIds = new Set(items.map((i) => i.id));

    if (userTaskIds.length > 0) {
      try {
        const { data: taskComments } = await supabase
          .from("comments")
          .select(commentSelect)
          .in("task_id", userTaskIds)
          .neq("created_by_user_id", userId)
          .gte("created_at", sevenDaysAgo)
          .order("created_at", { ascending: false })
          .limit(20);

        if (taskComments) {
          for (const c of taskComments as unknown as CommentRow[]) {
            const key = `comment-${c.id}`;
            if (seenIds.has(key) || seenIds.has(`mention-${c.id}`)) continue;
            seenIds.add(key);
            const pId = resolveProject(c);
            items.push({
              id: key,
              type: "comment",
              title: c.creator?.name || "Someone",
              preview: truncate(c.content),
              projectId: pId,
              projectName: projectMap.get(pId) || "",
              createdAt: c.created_at,
              isUnread: c.created_at > lastReadAt && !readIds.has(`mention-${c.id}`) && !readIds.has(`comment-${c.id}`),
              entityType: "task",
              entityId: c.task_id || undefined,
              entityName: resolveEntityName(c),
            });
          }
        }
      } catch { /* silently skip if query fails */ }
    }

    if (userMaterialIds.length > 0) {
      try {
        const { data: matComments } = await supabase
          .from("comments")
          .select(commentSelect)
          .in("material_id", userMaterialIds)
          .neq("created_by_user_id", userId)
          .gte("created_at", sevenDaysAgo)
          .order("created_at", { ascending: false })
          .limit(20);

        if (matComments) {
          for (const c of matComments as unknown as CommentRow[]) {
            const key = `comment-${c.id}`;
            if (seenIds.has(key) || seenIds.has(`mention-${c.id}`)) continue;
            seenIds.add(key);
            const pId = resolveProject(c);
            items.push({
              id: key,
              type: "comment",
              title: c.creator?.name || "Someone",
              preview: truncate(c.content),
              projectId: pId,
              projectName: projectMap.get(pId) || "",
              createdAt: c.created_at,
              isUnread: c.created_at > lastReadAt && !readIds.has(`mention-${c.id}`) && !readIds.has(`comment-${c.id}`),
              entityType: "material",
              entityId: c.material_id || undefined,
              entityName: resolveEntityName(c),
            });
          }
        }
      } catch { /* silently skip if query fails */ }
    }

    // 3. Tasks created by others in user's projects
    const { data: tasks } = await supabase
      .from("tasks")
      .select("id, title, created_at, project_id, created_by_user_id")
      .in("project_id", projectIds)
      .neq("created_by_user_id", userId)
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(20);

    if (tasks) {
      for (const t of tasks) {
        items.push({
          id: `task-${t.id}`,
          type: "task",
          title: t.title,
          preview: "",
          projectId: t.project_id,
          projectName: projectMap.get(t.project_id) || "",
          createdAt: t.created_at,
          isUnread: t.created_at > lastReadAt && !readIds.has(`task-${t.id}`),
          entityType: "task",
          entityId: t.id,
        });
      }
    }

    // 4. Materials/POs created by others in user's projects
    const { data: materials } = await supabase
      .from("materials")
      .select("id, name, created_at, project_id, created_by_user_id")
      .in("project_id", projectIds)
      .neq("created_by_user_id", userId)
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(20);

    if (materials) {
      for (const m of materials) {
        if (!m.project_id) continue;
        items.push({
          id: `material-${m.id}`,
          type: "material",
          title: m.name,
          preview: "",
          projectId: m.project_id,
          projectName: projectMap.get(m.project_id) || "",
          createdAt: m.created_at,
          isUnread: m.created_at > lastReadAt && !readIds.has(`material-${m.id}`),
          entityType: "material",
          entityId: m.id,
        });
      }
    }

    // 5. Unread DMs
    const { data: unreadDms } = await supabase
      .from("direct_messages")
      .select("id, content, created_at, project_id, from_user_id, from_user:profiles!direct_messages_from_user_id_fkey(name)")
      .eq("to_user_id", userId)
      .eq("is_read", false)
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(20);

    if (unreadDms) {
      for (const dm of unreadDms as unknown as Array<{
        id: string; content: string; created_at: string; project_id: string;
        from_user_id: string; from_user: { name: string } | null;
      }>) {
        items.push({
          id: `dm-${dm.id}`,
          type: "dm",
          title: dm.from_user?.name || "Someone",
          preview: truncate(dm.content),
          projectId: dm.project_id,
          projectName: projectMap.get(dm.project_id) || "",
          createdAt: dm.created_at,
          isUnread: !readIds.has(`dm-${dm.id}`),
          entityType: "project",
        });
      }
    }

    // 6. Quote activity notifications from activity_log (accepted, rejected, viewed)
    const quoteStatusEntityIds = new Set<string>();

    const { data: quoteActivity } = await supabase
      .from("activity_log")
      .select("id, entity_id, entity_name, created_at, project_id, action, actor_id, changes")
      .eq("entity_type", "quote")
      .in("action", ["status_changed", "viewed"])
      .in("project_id", projectIds)
      .neq("actor_id", userId)
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(10);

    if (quoteActivity) {
      for (const a of quoteActivity) {
        const isViewed = a.action === "viewed";
        const newStatus = (a.changes as Record<string, unknown>)?.new as string | undefined;
        const isAccepted = a.action === "status_changed" && newStatus === "accepted";
        const isRejected = a.action === "status_changed" && newStatus === "rejected";
        if (!isViewed && !isAccepted && !isRejected) continue;

        // Track quote IDs that have status-change notifications to suppress duplicate comments
        if ((isAccepted || isRejected) && a.entity_id) {
          quoteStatusEntityIds.add(a.entity_id);
        }

        items.push({
          id: `quote-${a.id}`,
          type: isAccepted ? "quote_accepted" : isRejected ? "quote_rejected" : "task",
          title: isViewed
            ? `opened your quote: ${a.entity_name || ""}`
            : a.entity_name || "",
          preview: "",
          projectId: a.project_id,
          projectName: projectMap.get(a.project_id) || "",
          createdAt: a.created_at,
          isUnread: a.created_at > lastReadAt && !readIds.has(`quote-${a.id}`),
          entityType: "quote",
          entityId: a.entity_id || undefined,
        });
      }
    }

    // Remove duplicate comment notifications for quotes that already have status-change notifications
    if (quoteStatusEntityIds.size > 0) {
      const before = items.length;
      for (let i = items.length - 1; i >= 0; i--) {
        const n = items[i];
        if (n.type === "comment" && n.entityType === "quote" && n.entityId && quoteStatusEntityIds.has(n.entityId)) {
          items.splice(i, 1);
        }
      }
    }

    // Sort by date descending, limit to 50
    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setNotifications(items.slice(0, 50));
    setLoading(false);
  }, []);

  const markOneRead = useCallback((id: string) => {
    const ids = getReadIds();
    ids.add(id);
    saveReadIds(ids);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isUnread: false } : n))
    );
  }, []);

  const markAllRead = useCallback(() => {
    localStorage.setItem(LAST_READ_KEY, new Date().toISOString());
    // Also mark all current notification IDs as read
    const ids = getReadIds();
    notifications.forEach((n) => ids.add(n.id));
    saveReadIds(ids);
    setNotifications((prev) => prev.map((n) => ({ ...n, isUnread: false })));
  }, [notifications]);

  useEffect(() => {
    fetchNotifications();
    intervalRef.current = setInterval(fetchNotifications, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchNotifications]);

  const unreadCount = notifications.filter((n) => n.isUnread).length;

  return { notifications, unreadCount, markAllRead, markOneRead, loading };
}

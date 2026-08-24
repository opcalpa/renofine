import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ImageLightbox, useLightbox } from "@/components/shared/ImageLightbox";
import { WorkerInstructionsView } from "@/components/project/WorkerInstructionsView";
import { Loader2, MessageSquare, HelpCircle, Camera, Eye, ClipboardCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { signRows } from "@/lib/fileUrl";

interface WorkerActivityPanelProps {
  projectId: string;
  /** worker_access_tokens.token — drives the "se vad hen ser" preview. */
  workerToken: string | null;
  /** worker_name — the edge functions attribute content by "{name} (worker)". */
  workerName: string;
  assignedTaskIds: string[] | null;
}

type CommentImage = { id: string; url: string; filename: string };
interface WorkerComment {
  id: string;
  content: string;
  created_at: string;
  task_id: string | null;
  drawing_object_id: string | null;
  images: CommentImage[] | null;
}

interface TaskStatusRow {
  id: string;
  title: string;
  status: string;
  progress: number | null;
}

/** A standalone worker photo from the `photos` table (not mirrored to a comment). */
interface WorkerPhoto {
  id: string;
  url: string;
  caption: string | null;
  created_at: string;
}

/** Unified activity entry — a comment (message/question/photo) or a standalone photo. */
interface ActivityItem {
  id: string;
  icon: LucideIcon;
  label: string;
  created_at: string;
  content: string | null;
  images: CommentImage[] | null;
}

/**
 * Per-worker activity roll-up shown in the expanded Team row. Answers the
 * owner's "what has this worker actually done?" — questions, messages, submitted
 * photos, and how far their assigned tasks have come — plus a "see exactly what
 * they see" preview. Reuses the existing attribution: worker content carries the
 * owner's id but author_display_name = "{name} (worker)" (there is no
 * worker_token_id FK yet — see backlog worker-content-token-fk).
 */
export function WorkerActivityPanel({ projectId, workerToken, workerName, assignedTaskIds }: WorkerActivityPanelProps) {
  const { t, i18n } = useTranslation();
  const lightbox = useLightbox();
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState<WorkerComment[]>([]);
  const [tasks, setTasks] = useState<TaskStatusRow[]>([]);
  const [photos, setPhotos] = useState<WorkerPhoto[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      // Attribution: worker content carries the owner's id but
      // author_display_name = "{name} (worker)". Scope with project_id OR
      // task_id ∈ assigned — mirrors the notification query and maximizes
      // RLS-readable coverage (some rows bear project_id, others only task_id).
      const marker = `${workerName} (worker)`;
      const taskIds = assignedTaskIds ?? [];
      let commentsQuery = supabase
        .from("comments")
        .select("id, content, created_at, task_id, drawing_object_id, images")
        .eq("author_display_name", marker)
        .order("created_at", { ascending: false })
        .limit(12);
      commentsQuery =
        taskIds.length > 0
          ? commentsQuery.or(`project_id.eq.${projectId},task_id.in.(${taskIds.join(",")})`)
          : commentsQuery.eq("project_id", projectId);
      // Worker photos: worker-upload-photo mirrors a photo into `comments`
      // ONLY for completed-task hand-offs (linked_to_type=task, category=completed).
      // General / non-completed uploads live only in `photos`, so a comments-only
      // panel drops them (Cowork C-finding). Query `photos` too, scoped to this
      // worker (caption = name, source ilike 'worker%') within the project's
      // task/project ids — mirrors RecentPhotos' owner-readable pattern.
      const photoLinkIds = [projectId, ...taskIds];
      const [commentsRes, tasksRes, photosRes] = await Promise.all([
        commentsQuery,
        taskIds.length > 0
          ? supabase.from("tasks").select("id, title, status, progress").in("id", taskIds)
          : Promise.resolve({ data: [] as TaskStatusRow[] }),
        supabase
          .from("photos")
          .select("id, url, caption, created_at")
          .ilike("source", "worker%")
          .eq("caption", workerName)
          .in("linked_to_id", photoLinkIds)
          .order("created_at", { ascending: false })
          .limit(12),
      ]);
      if (!active) return;
      setComments((commentsRes.data as WorkerComment[] | null) ?? []);
      setTasks((tasksRes.data as TaskStatusRow[] | null) ?? []);
      setPhotos(await signRows((photosRes.data as WorkerPhoto[] | null) ?? []));
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [projectId, workerName, assignedTaskIds]);

  const awaitingReview = tasks.filter((t) => t.status === "awaiting_review").length;
  const completed = tasks.filter((t) => t.status === "completed" || t.status === "done").length;

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(i18n.language === "sv" ? "sv-SE" : "en-US", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  const kindOf = (c: WorkerComment) => {
    if (c.drawing_object_id) return { icon: HelpCircle, label: t("workerActivity.question", "Fråga") };
    if (c.images && c.images.length > 0) return { icon: Camera, label: t("workerActivity.photo", "Foto") };
    return { icon: MessageSquare, label: t("workerActivity.message", "Meddelande") };
  };

  // Merge standalone worker photos into the activity list, deduped against
  // photos already surfaced via a completion-comment (comment.images[].id).
  const commentImageIds = new Set(
    comments.flatMap((c) => (c.images ?? []).map((img) => img.id)).filter(Boolean),
  );
  const activity: ActivityItem[] = [
    ...comments.map((c): ActivityItem => {
      const k = kindOf(c);
      return { id: c.id, icon: k.icon, label: k.label, created_at: c.created_at, content: c.content, images: c.images };
    }),
    ...photos
      .filter((p) => !commentImageIds.has(p.id))
      .map((p): ActivityItem => ({
        id: `photo-${p.id}`,
        icon: Camera,
        label: t("workerActivity.photo", "Foto"),
        created_at: p.created_at,
        content: null,
        images: [{ id: p.id, url: p.url, filename: p.caption ?? "" }],
      })),
  ]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 12);

  return (
    <div className="rounded-lg border bg-background/60 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          {t("workerActivity.title", "Aktivitet")}
        </p>
        {workerToken && (
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setPreviewOpen(true)}>
            <Eye className="h-3.5 w-3.5" />
            {t("workerActivity.seeWhatTheySee", "Se vad {{name}} ser", { name: workerName })}
          </Button>
        )}
      </div>

      {/* Assigned-task status summary */}
      {tasks.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-muted-foreground">
            <ClipboardCheck className="h-3 w-3" />
            {t("workerActivity.tasksAssigned", "{{count}} arbeten", { count: tasks.length })}
          </span>
          {awaitingReview > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
              {t("workerActivity.awaitingReview", "{{count}} att granska", { count: awaitingReview })}
            </span>
          )}
          {completed > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 font-medium text-emerald-800">
              {t("workerActivity.completed", "{{count}} klara", { count: completed })}
            </span>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t("common.loading", "Laddar…")}
        </div>
      ) : activity.length === 0 ? (
        <p className="py-1 text-xs text-muted-foreground">
          {t("workerActivity.empty", "Ingen aktivitet från {{name}} än.", { name: workerName })}
        </p>
      ) : (
        <ul className="space-y-2">
          {activity.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.id} className="flex gap-2 text-xs">
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="font-medium text-foreground">{item.label}</span>
                    <span>·</span>
                    <span>{fmt(item.created_at)}</span>
                  </div>
                  {item.content && <p className="mt-0.5 break-words text-foreground/80">{item.content}</p>}
                  {item.images && item.images.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {item.images.map((img, idx) => (
                        <img
                          key={img.id ?? idx}
                          src={img.url}
                          alt={img.filename ?? ""}
                          className="h-14 w-14 cursor-pointer rounded border object-cover hover:opacity-90"
                          onClick={() => lightbox.open(item.images!.map((i) => ({ id: i.id, url: i.url, filename: i.filename })), idx)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ImageLightbox {...lightbox.props} projectId={projectId} />

      {previewOpen && workerToken && (
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent size="4xl" className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("workerActivity.seeWhatTheySee", "Se vad {{name}} ser", { name: workerName })}</DialogTitle>
            </DialogHeader>
            <WorkerInstructionsView projectId={projectId} workerToken={workerToken} displayName={workerName} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

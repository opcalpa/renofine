import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://app.renofine.com",
  "https://renofine.com",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function jsonResponse(data: unknown, status: number, req: Request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

// Statuses that may be transitioned to 'awaiting_review' when the worker
// submits a completion photo. Leaves 'completed', 'awaiting_review',
// 'cancelled' alone so we don't undo PM decisions.
const TRANSITIONABLE_STATUSES = new Set([
  "planned",
  "to_do",
  "waiting",
  "in_progress",
]);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  try {
    const formData = await req.formData();
    const token = formData.get("token") as string;
    const taskId = (formData.get("taskId") as string) || "";
    const roomId = (formData.get("roomId") as string) || "";
    const category = (formData.get("category") as string) || "";
    const file = formData.get("file") as File;
    // Optional worker-reported progress (0-100). Travels with the photo so a
    // photo and a progress update always stay in sync. Only sent by the client
    // for checklist-less work (where there is no derived progress).
    const progressRaw = formData.get("progress");
    let progress: number | null = null;
    if (progressRaw != null && progressRaw !== "") {
      const n = Math.round(Number(progressRaw));
      if (!Number.isNaN(n)) progress = Math.min(100, Math.max(0, n));
    }

    if (!token || !file) {
      return jsonResponse({ error: "token and file are required" }, 400, req);
    }
    if (!taskId && !roomId) {
      return jsonResponse({ error: "taskId or roomId is required" }, 400, req);
    }
    if (category && category !== "progress" && category !== "completed") {
      return jsonResponse({ error: "category must be 'progress' or 'completed'" }, 400, req);
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: tokenRecord } = await sb
      .from("worker_access_tokens")
      .select("project_id, assigned_task_ids, can_upload_photos, created_by_user_id, worker_name")
      .eq("token", token)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (!tokenRecord) {
      return jsonResponse({ error: "Invalid or expired token" }, 403, req);
    }

    if (!tokenRecord.can_upload_photos) {
      return jsonResponse({ error: "Photo upload not allowed" }, 403, req);
    }

    const assignedIds: string[] = tokenRecord.assigned_task_ids || [];

    let linkedToType: "task" | "room";
    let linkedToId: string;
    // Tasks whose progress the worker's % update applies to.
    let progressTaskIds: string[] = [];

    if (taskId) {
      if (!assignedIds.includes(taskId)) {
        return jsonResponse({ error: "Task not assigned" }, 403, req);
      }
      linkedToType = "task";
      linkedToId = taskId;
      progressTaskIds = [taskId];
    } else {
      const { data: roomTasks } = await sb
        .from("tasks")
        .select("id")
        .eq("project_id", tokenRecord.project_id)
        .eq("room_id", roomId)
        .in("id", assignedIds);
      if (!roomTasks || roomTasks.length === 0) {
        return jsonResponse({ error: "Room not accessible" }, 403, req);
      }
      linkedToType = "room";
      linkedToId = roomId;
      progressTaskIds = roomTasks.map((t) => t.id);
    }

    const ext = file.name?.split(".").pop() || "jpg";
    const uniqueName = `${crypto.randomUUID()}.${ext}`;
    const storagePath = `projects/${tokenRecord.project_id}/attachments/${linkedToType}/${uniqueName}`;

    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadError } = await sb.storage
      .from("project-files")
      .upload(storagePath, arrayBuffer, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return jsonResponse({ error: "Failed to upload file" }, 500, req);
    }

    const { data: urlData } = sb.storage
      .from("project-files")
      .getPublicUrl(storagePath);

    const source = category ? `worker_${category}` : "worker";

    const { data: photo, error: insertError } = await sb
      .from("photos")
      .insert({
        url: urlData.publicUrl,
        linked_to_type: linkedToType,
        linked_to_id: linkedToId,
        uploaded_by_user_id: tokenRecord.created_by_user_id,
        caption: `${tokenRecord.worker_name}`,
        source,
        mime_type: file.type || "image/jpeg",
      })
      .select("id, url, caption")
      .single();

    if (insertError) {
      console.error("Photo insert error:", insertError);
      return jsonResponse({ error: "Failed to save photo record" }, 500, req);
    }

    // Apply the worker-reported progress to the relevant task(s). 100% also
    // hands the work off for review (same signal as a completion photo).
    if (progress != null && progressTaskIds.length > 0) {
      const update: Record<string, unknown> = {
        progress,
        updated_at: new Date().toISOString(),
      };
      if (progress >= 100) {
        const { data: rows } = await sb
          .from("tasks")
          .select("id, status")
          .in("id", progressTaskIds);
        const toReview = (rows || [])
          .filter((r) => TRANSITIONABLE_STATUSES.has(r.status))
          .map((r) => r.id);
        if (toReview.length > 0) {
          await sb
            .from("tasks")
            .update({ ...update, status: "awaiting_review" })
            .in("id", toReview);
        }
        const rest = progressTaskIds.filter((id) => !toReview.includes(id));
        if (rest.length > 0) {
          await sb.from("tasks").update(update).in("id", rest);
        }
      } else {
        await sb.from("tasks").update(update).in("id", progressTaskIds);
      }
    }

    // Side-effect: a task-level "completed" upload is the worker's
    // hand-off signal. Move the task into awaiting_review (unless the
    // PM already moved it past it) and post the photo into the task's
    // comment feed so the PM gets the normal in-app notification.
    if (linkedToType === "task" && category === "completed") {
      const { data: taskRow } = await sb
        .from("tasks")
        .select("status")
        .eq("id", taskId)
        .single();

      if (taskRow && TRANSITIONABLE_STATUSES.has(taskRow.status)) {
        await sb
          .from("tasks")
          .update({ status: "awaiting_review", updated_at: new Date().toISOString() })
          .eq("id", taskId);
      }

      const workerLabel = `${tokenRecord.worker_name} (worker)`;
      await sb.from("comments").insert({
        entity_type: "task",
        entity_id: taskId,
        content: "📸 Worker submitted a completion photo for review.",
        author_display_name: workerLabel,
        created_by_user_id: tokenRecord.created_by_user_id,
        images: [{ id: photo.id, url: photo.url, caption: photo.caption }],
      });
    }

    return jsonResponse({ success: true, photo }, 200, req);
  } catch (error) {
    console.error("worker-upload-photo error:", error);
    return jsonResponse({ error: error.message }, 500, req);
  }
});

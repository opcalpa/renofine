import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5002",
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

/**
 * What the sender wants the receiver to DO. See the migration comment on
 * comments.intent — a question that drowns in the feed stops a human on a site,
 * so it must be distinguishable from a report at a glance.
 *
 * 'behover' is not accepted here: a purchase materialises through
 * worker-create-purchase, and letting it in through the message door would give
 * the same wish two homes.
 */
const MESSAGE_INTENTS = new Set(["klart", "fraga", "info"]);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  try {
    // Handle both JSON (text message) and FormData (voice message)
    const contentType = req.headers.get("content-type") || "";
    let token: string;
    let taskId: string | null;
    let message: string | null = null;
    let voiceBlob: Blob | null = null;
    let photoFile: File | null = null;
    let rawIntent: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      token = formData.get("token") as string;
      taskId = (formData.get("taskId") as string) || null;
      message = formData.get("message") as string | null;
      rawIntent = (formData.get("intent") as string) || null;
      const voiceFile = formData.get("voice") as File | null;
      if (voiceFile) voiceBlob = voiceFile;
      const photo = formData.get("photo") as File | null;
      if (photo && photo.size > 0) photoFile = photo;
    } else {
      const body = await req.json();
      token = body.token;
      taskId = body.taskId || null;
      message = body.message;
      rawIntent = body.intent || null;
    }

    if (!token) {
      return jsonResponse({ error: "token is required" }, 400, req);
    }
    // A photo IS a message. Requiring words is exactly the barrier this flow
    // exists to remove — on a site with a language gap the picture is the point.
    if (!message && !voiceBlob && !photoFile) {
      return jsonResponse({ error: "message, voice or photo is required" }, 400, req);
    }
    const intent = rawIntent && MESSAGE_INTENTS.has(rawIntent) ? rawIntent : null;

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Validate token
    const { data: tokenRecord } = await sb
      .from("worker_access_tokens")
      .select("project_id, assigned_task_ids, created_by_user_id, worker_name")
      .eq("token", token)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (!tokenRecord) {
      return jsonResponse({ error: "Invalid or expired token" }, 403, req);
    }

    const assignedIds: string[] = tokenRecord.assigned_task_ids || [];
    // No task is a valid answer: "the door code doesn't work" belongs to the
    // project, not to a task, and forcing a pick would be the form this flow
    // replaces. A task that IS named must still be one the worker was given.
    if (taskId && !assignedIds.includes(taskId)) {
      return jsonResponse({ error: "Task not assigned" }, 403, req);
    }

    // Upload voice recording if present
    let voiceUrl: string | null = null;
    if (voiceBlob) {
      const uniqueName = `${crypto.randomUUID()}.webm`;
      const storagePath = `projects/${tokenRecord.project_id}/voice/${uniqueName}`;
      const arrayBuffer = await voiceBlob.arrayBuffer();

      const { error: uploadError } = await sb.storage
        .from("project-files")
        .upload(storagePath, arrayBuffer, {
          contentType: "audio/webm",
          upsert: false,
        });

      if (!uploadError) {
        // The path travels in the comment text; get-worker-data signs it on the
        // way out, so the link cannot outlive the worker's access.
        voiceUrl = storagePath;
      }
    }

    // Upload the photo if present. Linked to the task when there is one, to the
    // project otherwise — both are existing linked_to_type values, so the
    // owner's normal photo surfaces pick it up without a new code path.
    let photoRow: { id: string; url: string; caption: string | null } | null = null;
    if (photoFile) {
      const ext = photoFile.name?.split(".").pop() || "jpg";
      const uniqueName = `${crypto.randomUUID()}.${ext}`;
      const linkedToType = taskId ? "task" : "project";
      const storagePath = `projects/${tokenRecord.project_id}/attachments/${linkedToType}/${uniqueName}`;
      const buf = await photoFile.arrayBuffer();
      const { error: photoUploadError } = await sb.storage
        .from("project-files")
        .upload(storagePath, buf, {
          contentType: photoFile.type || "image/jpeg",
          upsert: false,
        });
      if (photoUploadError) {
        console.error("Photo upload error:", photoUploadError);
        return jsonResponse({ error: "Failed to upload photo" }, 500, req);
      }
      // A "klart" photo documents finished work; anything else is context for
      // what is being said. Never 'after' by default — that would let an
      // ordinary question quietly count as proof the job is done.
      const { data: inserted, error: photoInsertError } = await sb
        .from("photos")
        .insert({
          url: storagePath,
          linked_to_type: linkedToType,
          linked_to_id: taskId || tokenRecord.project_id,
          uploaded_by_user_id: tokenRecord.created_by_user_id,
          caption: tokenRecord.worker_name,
          kind: intent === "klart" ? "after" : "during",
          source: "worker",
          mime_type: photoFile.type || "image/jpeg",
        })
        .select("id, url, caption")
        .single();
      if (photoInsertError) {
        console.error("Photo insert error:", photoInsertError);
        return jsonResponse({ error: "Failed to save photo record" }, 500, req);
      }
      photoRow = inserted;
    }

    // Insert as a comment on the task
    // Use created_by_user_id (project owner) for FK integrity,
    // but set author_display_name to worker name for correct attribution
    const { data: comment, error: insertError } = await sb
      .from("comments")
      .insert({
        content: message || (voiceUrl ? `🎤 ${voiceUrl}` : ""),
        entity_type: taskId ? "task" : "project",
        entity_id: taskId || tokenRecord.project_id,
        // Set task_id too: the OWNER's task comment thread (CommentsSection)
        // queries by task_id, so without this the worker's question never
        // threads under the task on the owner's side — it only surfaced via the
        // notification. entity_type/entity_id stays for the worker's own view.
        task_id: taskId,
        project_id: tokenRecord.project_id,
        created_by_user_id: tokenRecord.created_by_user_id,
        author_display_name: `${tokenRecord.worker_name} (worker)`,
        intent,
        // Only a question is owed an answer. A report and a note arrive
        // already settled, so they never sit in the owner's "waiting on me"
        // list — that list is only useful if everything in it is actionable.
        is_resolved: intent !== null && intent !== "fraga",
        images: photoRow
          ? [{ id: photoRow.id, url: photoRow.url, caption: photoRow.caption }]
          : undefined,
      })
      .select("id, content, created_at")
      .single();

    if (insertError) {
      console.error("Comment insert error:", insertError);
      return jsonResponse({ error: "Failed to send message" }, 500, req);
    }

    return jsonResponse({ success: true, comment, photo: photoRow }, 200, req);
  } catch (error) {
    console.error("worker-send-message error:", error);
    return jsonResponse({ error: (error as Error).message }, 500, req);
  }
});

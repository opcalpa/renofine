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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  try {
    // Handle both JSON (text message) and FormData (voice message)
    const contentType = req.headers.get("content-type") || "";
    let token: string;
    let taskId: string;
    let message: string | null = null;
    let voiceBlob: Blob | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      token = formData.get("token") as string;
      taskId = formData.get("taskId") as string;
      message = formData.get("message") as string | null;
      const voiceFile = formData.get("voice") as File | null;
      if (voiceFile) voiceBlob = voiceFile;
    } else {
      const body = await req.json();
      token = body.token;
      taskId = body.taskId;
      message = body.message;
    }

    if (!token || !taskId) {
      return jsonResponse({ error: "token and taskId are required" }, 400, req);
    }
    if (!message && !voiceBlob) {
      return jsonResponse({ error: "message or voice is required" }, 400, req);
    }

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
    if (!assignedIds.includes(taskId)) {
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
        const { data: urlData } = sb.storage
          .from("project-files")
          .getPublicUrl(storagePath);
        voiceUrl = urlData.publicUrl;
      }
    }

    // Build comment content
    let commentContent = "";
    const prefix = `💬 ${tokenRecord.worker_name}`;
    if (message) {
      commentContent = `${prefix}: ${message}`;
    }
    if (voiceUrl) {
      commentContent += commentContent ? `\n🎤 ${voiceUrl}` : `${prefix}: 🎤 ${voiceUrl}`;
    }

    // Insert as a comment on the task
    // Use created_by_user_id (project owner) for FK integrity,
    // but set author_display_name to worker name for correct attribution
    const { data: comment, error: insertError } = await sb
      .from("comments")
      .insert({
        content: message || (voiceUrl ? `🎤 ${voiceUrl}` : ""),
        entity_type: "task",
        entity_id: taskId,
        project_id: tokenRecord.project_id,
        created_by_user_id: tokenRecord.created_by_user_id,
        author_display_name: `${tokenRecord.worker_name} (worker)`,
      })
      .select("id, content, created_at")
      .single();

    if (insertError) {
      console.error("Comment insert error:", insertError);
      return jsonResponse({ error: "Failed to send message" }, 500, req);
    }

    return jsonResponse({ success: true, comment }, 200, req);
  } catch (error) {
    console.error("worker-send-message error:", error);
    return jsonResponse({ error: error.message }, 500, req);
  }
});

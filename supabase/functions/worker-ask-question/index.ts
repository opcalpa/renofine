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

// Worker taps a placed object on the instruction view and asks a question about
// it. The question is stored as a comment tagged to the drawing object
// (floor_map_shapes.id), mirroring how the in-app InlineCommentPopover writes —
// so it surfaces as a comment badge on that object in the owner's floor plan /
// elevation. Scoped to the worker's project token; no auth account needed.
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  try {
    const { token, drawingObjectId, message } = await req.json();

    if (!token || !drawingObjectId) {
      return jsonResponse({ error: "token and drawingObjectId are required" }, 400, req);
    }
    if (!message || !message.trim()) {
      return jsonResponse({ error: "message is required" }, 400, req);
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Validate token
    const { data: tokenRecord } = await sb
      .from("worker_access_tokens")
      .select("project_id, created_by_user_id, worker_name")
      .eq("token", token)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (!tokenRecord) {
      return jsonResponse({ error: "Invalid or expired token" }, 403, req);
    }

    // The object must belong to the worker's project — a token must never be
    // usable to comment on another project's drawing.
    const { data: shape } = await sb
      .from("floor_map_shapes")
      .select("id, project_id")
      .eq("id", drawingObjectId)
      .single();

    if (!shape || shape.project_id !== tokenRecord.project_id) {
      return jsonResponse({ error: "Object not found in this project" }, 403, req);
    }

    // Insert as a comment on the drawing object. Mirrors InlineCommentPopover:
    // drawing_object_id + project_id are what the badge/thread reads. Use
    // created_by_user_id (project owner) for FK integrity; author_display_name
    // carries the worker attribution.
    const { data: comment, error: insertError } = await sb
      .from("comments")
      .insert({
        content: message.trim(),
        drawing_object_id: drawingObjectId,
        project_id: tokenRecord.project_id,
        created_by_user_id: tokenRecord.created_by_user_id,
        author_display_name: `${tokenRecord.worker_name} (worker)`,
        is_resolved: false,
      })
      .select("id, content, created_at")
      .single();

    if (insertError) {
      console.error("Comment insert error:", insertError);
      return jsonResponse({ error: "Failed to post question" }, 500, req);
    }

    return jsonResponse({ success: true, comment }, 200, req);
  } catch (error) {
    console.error("worker-ask-question error:", error);
    return jsonResponse({ error: error.message }, 500, req);
  }
});

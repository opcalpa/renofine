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

interface ChecklistItem {
  id: string;
  title: string;
  completed: boolean;
}

interface Checklist {
  id: string;
  title: string;
  items: ChecklistItem[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  try {
    const { token, taskId, checklistId, itemId, completed } = await req.json();

    if (!token || !taskId || !checklistId || !itemId || typeof completed !== "boolean") {
      return jsonResponse({ error: "Missing required fields" }, 400, req);
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Validate token
    const { data: tokenRecord } = await sb
      .from("worker_access_tokens")
      .select("assigned_task_ids, can_toggle_checklist")
      .eq("token", token)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (!tokenRecord) {
      return jsonResponse({ error: "Invalid or expired token" }, 403, req);
    }

    if (!tokenRecord.can_toggle_checklist) {
      return jsonResponse({ error: "Checklist editing not allowed" }, 403, req);
    }

    const assignedIds: string[] = tokenRecord.assigned_task_ids || [];
    if (!assignedIds.includes(taskId)) {
      return jsonResponse({ error: "Task not assigned" }, 403, req);
    }

    // Fetch task checklists
    const { data: task } = await sb
      .from("tasks")
      .select("checklists")
      .eq("id", taskId)
      .single();

    if (!task) {
      return jsonResponse({ error: "Task not found" }, 404, req);
    }

    // Update the specific checklist item
    const checklists: Checklist[] = (task.checklists as Checklist[]) || [];
    let found = false;

    for (const cl of checklists) {
      if (cl.id === checklistId) {
        for (const item of cl.items) {
          if (item.id === itemId) {
            item.completed = completed;
            found = true;
            break;
          }
        }
        break;
      }
    }

    if (!found) {
      return jsonResponse({ error: "Checklist item not found" }, 404, req);
    }

    // Calculate progress from checklists
    let totalItems = 0;
    let completedItems = 0;
    for (const cl of checklists) {
      for (const item of cl.items) {
        totalItems++;
        if (item.completed) completedItems++;
      }
    }
    const progress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

    // Write back
    const { error: updateError } = await sb
      .from("tasks")
      .update({ checklists, progress })
      .eq("id", taskId);

    if (updateError) {
      return jsonResponse({ error: "Failed to update" }, 500, req);
    }

    return jsonResponse({ success: true, progress }, 200, req);
  } catch (error) {
    console.error("worker-toggle-checklist error:", error);
    return jsonResponse({ error: error.message }, 500, req);
  }
});

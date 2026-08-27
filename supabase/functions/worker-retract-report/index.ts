import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { checkRateLimit, rateLimitedBody } from "../_shared/rateLimit.ts";

/**
 * worker-retract-report — the ten seconds after Send.
 *
 * Sending a report should feel like sending a text message: thoughtless to
 * send, cheap to take back. That is the whole reason there is no confirmation
 * box before Send — the safety net lives AFTER, where it costs nothing when
 * the reading was right, which is most of the time.
 *
 * What it undoes, in the order the invariants demand:
 *   materials  → purchase_orders   (materials_po_invariant_check forbids the
 *                                   reverse; an order without lines is illegal)
 *   time_entries, comments, photos
 *   the task's status and progress, from what the report recorded it overwrote
 *
 * The report row itself is kept and stamped `retracted_at`. What someone said
 * and then withdrew is worth keeping, and a deleted id is an id that can come
 * back.
 *
 * Two refusals, both deliberate:
 *   - The builder already acted (approved hours, moved the order along). Their
 *     decision outranks the worker's undo; silently deleting an approved row
 *     would take money off someone's day.
 *   - The window has passed. Ten seconds in the UI, two minutes here, so a
 *     slow phone on site never loses a legitimate undo to a stopwatch.
 *
 * verify_jwt = false, like its worker siblings: the token in the link is the
 * gate. The report is re-checked against that token, so a token can only ever
 * retract its own report.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const RATE_LIMIT_SCOPE = "worker-retract-report";
const RATE_LIMIT_TIERS = { anon: 120, authenticated: 120 };

/** The UI offers ten seconds; the server is generous about a slow network. */
const RETRACT_WINDOW_MS = 2 * 60 * 1000;

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
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(req) });

  try {
    const rl = await checkRateLimit(req, RATE_LIMIT_SCOPE, RATE_LIMIT_TIERS, false);
    if (!rl.allowed) return jsonResponse(rateLimitedBody({ ok: false }), 429, req);

    const body = await req.json().catch(() => null);
    const token = String(body?.token ?? "");
    const reportId = String(body?.reportId ?? "");
    if (!token || !reportId) return jsonResponse({ error: "Token and reportId are required" }, 400, req);

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: tokenRecord } = await sb
      .from("worker_access_tokens")
      .select("id")
      .eq("token", token)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .single();
    if (!tokenRecord) return jsonResponse({ error: "Invalid or expired token" }, 403, req);

    // The report must belong to THIS token. Without this line a token could
    // retract a colleague's report by guessing an id.
    const { data: report } = await sb
      .from("field_reports")
      .select("id, task_id, created_at, retracted_at, task_prev_status, task_prev_progress")
      .eq("id", reportId)
      .eq("worker_token_id", tokenRecord.id)
      .single();
    if (!report) return jsonResponse({ error: "Report not found" }, 404, req);
    if (report.retracted_at) return jsonResponse({ ok: true, alreadyRetracted: true }, 200, req);

    if (Date.now() - new Date(report.created_at).getTime() > RETRACT_WINDOW_MS) {
      return jsonResponse({ error: "too_late" }, 409, req);
    }

    // ---- Has the builder already acted? Their decision wins. ----
    const { data: approvedHours } = await sb
      .from("time_entries")
      .select("id")
      .eq("report_id", reportId)
      .or("approved.eq.true,declined_at.not.is.null")
      .limit(1);
    if (approvedHours && approvedHours.length > 0) {
      return jsonResponse({ error: "builder_acted" }, 409, req);
    }

    const { data: reportMaterials } = await sb
      .from("materials")
      .select("id, purchase_order_id")
      .eq("report_id", reportId);
    const poIds = [...new Set((reportMaterials ?? []).map((m) => m.purchase_order_id).filter(Boolean))];
    if (poIds.length > 0) {
      const { data: movedOrders } = await sb
        .from("purchase_orders")
        .select("id")
        .in("id", poIds)
        .neq("status", "requested")
        .limit(1);
      if (movedOrders && movedOrders.length > 0) {
        return jsonResponse({ error: "builder_acted" }, 409, req);
      }
    }

    // ---- Undo, children before parents ----
    // Materials first: an order with no lines trips materials_po_invariant_check.
    const { error: matErr } = await sb.from("materials").delete().eq("report_id", reportId);
    if (matErr) {
      console.error("Retract materials error:", matErr);
      return jsonResponse({ error: "Failed to retract" }, 500, req);
    }
    if (poIds.length > 0) {
      const { error: poErr } = await sb.from("purchase_orders").delete().in("id", poIds);
      if (poErr) console.error("Retract PO error:", poErr);
    }

    const { error: timeErr } = await sb.from("time_entries").delete().eq("report_id", reportId);
    if (timeErr) console.error("Retract time error:", timeErr);

    // Photos are referenced by the comment, so free the comment first.
    const { data: comments } = await sb.from("comments").select("images").eq("report_id", reportId);
    const photoIds = (comments ?? [])
      .flatMap((c) => (Array.isArray(c.images) ? c.images : []))
      .map((img: { id?: string }) => img?.id)
      .filter(Boolean) as string[];

    const { error: comErr } = await sb.from("comments").delete().eq("report_id", reportId);
    if (comErr) console.error("Retract comment error:", comErr);

    if (photoIds.length > 0) {
      const { error: photoErr } = await sb.from("photos").delete().in("id", photoIds);
      if (photoErr) console.error("Retract photo error:", photoErr);
    }

    // ---- Put the work back where it stood ----
    if (report.task_id && (report.task_prev_status || report.task_prev_progress != null)) {
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (report.task_prev_status) update.status = report.task_prev_status;
      if (report.task_prev_progress != null) update.progress = report.task_prev_progress;
      const { error: taskErr } = await sb.from("tasks").update(update).eq("id", report.task_id);
      if (taskErr) console.error("Retract task error:", taskErr);
    }

    const { error: repErr } = await sb
      .from("field_reports")
      .update({ retracted_at: new Date().toISOString() })
      .eq("id", reportId);
    if (repErr) console.error("Retract stamp error:", repErr);

    return jsonResponse({ ok: true }, 200, req);
  } catch (err) {
    console.error("worker-retract-report error:", err);
    return jsonResponse({ error: "Unexpected error" }, 500, req);
  }
});

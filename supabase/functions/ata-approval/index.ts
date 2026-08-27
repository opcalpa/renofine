import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { checkRateLimit, rateLimitedBody } from "../_shared/rateLimit.ts";

/**
 * ata-approval — the customer approves an ÄTA without an account.
 *
 * Why this exists as a function at all: the approval page used to read and
 * write `ata_approval_tokens` directly as `anon`, under policies that were
 * `USING (true)`. That gave anyone with the anon key — which ships in every
 * browser bundle — the ability to LIST every approval token in the database
 * and then approve or reject any ÄTA in it. The link was never the gate.
 *
 * Now the token is the gate, and it is checked here with the service role.
 * The client sends the token; it never sees another project's row, and it
 * cannot write anything at all.
 *
 * Same shape as its worker siblings: verify_jwt = false, because the secret is
 * the token in the URL, not a JWT. That is also why the rate limit passes
 * trustJwt = false — on an unverified endpoint any caller can mint a fresh
 * `sub` per request, so an authenticated tier would be self-granted.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const RATE_LIMIT_SCOPE = "ata-approval";
const RATE_LIMIT_TIERS = { anon: 120, authenticated: 120 };

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
    if (!rl.allowed) return jsonResponse(rateLimitedBody({ error: "rate_limited" }), 429, req);

    const body = await req.json().catch(() => null);
    const token = String(body?.token ?? "");
    const action = String(body?.action ?? "load");
    if (!token) return jsonResponse({ error: "not_found" }, 404, req);

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Looked up BY TOKEN — never by id from the client, which is what made
    // enumeration possible before.
    const { data: tokenRow } = await sb
      .from("ata_approval_tokens")
      .select("id, task_id, project_id, customer_name, created_by_user_id, created_at, expires_at, used_at, response")
      .eq("token", token)
      .maybeSingle();

    if (!tokenRow) return jsonResponse({ error: "not_found" }, 404, req);

    const expired = tokenRow.expires_at ? new Date(tokenRow.expires_at) < new Date() : false;
    if (expired && !tokenRow.used_at) return jsonResponse({ error: "expired" }, 410, req);

    if (action === "load") {
      const [{ data: task }, { data: project }, { data: creator }] = await Promise.all([
        sb.from("tasks").select("id, title, description, budget").eq("id", tokenRow.task_id).maybeSingle(),
        sb.from("projects").select("name").eq("id", tokenRow.project_id).maybeSingle(),
        sb.from("profiles").select("name").eq("id", tokenRow.created_by_user_id).maybeSingle(),
      ]);
      // Only the fields the page renders. No token, no ids the caller could reuse.
      return jsonResponse({
        taskTitle: task?.title ?? "–",
        taskDescription: task?.description ?? null,
        budget: task?.budget ?? null,
        projectName: project?.name ?? "–",
        createdByName: creator?.name ?? "–",
        customerName: tokenRow.customer_name ?? null,
        createdAt: tokenRow.created_at,
        alreadyResponded: tokenRow.response,
      }, 200, req);
    }

    if (action === "respond") {
      const response = String(body?.response ?? "");
      if (response !== "approved" && response !== "rejected") {
        return jsonResponse({ error: "bad_response" }, 400, req);
      }
      // A used link is spent. Without this the customer could flip an ÄTA back
      // and forth after the builder has already acted on the answer.
      if (tokenRow.used_at || tokenRow.response) {
        return jsonResponse({ error: "already_used", alreadyResponded: tokenRow.response }, 409, req);
      }

      const rejectionReason = typeof body?.rejectionReason === "string"
        ? body.rejectionReason.slice(0, 1000).trim() || null
        : null;
      const now = new Date().toISOString();

      const { error: tokenErr } = await sb
        .from("ata_approval_tokens")
        .update({ response, used_at: now })
        .eq("id", tokenRow.id)
        .is("used_at", null);   // last guard against two taps racing
      if (tokenErr) {
        console.error("ÄTA token update error:", tokenErr);
        return jsonResponse({ error: "error" }, 500, req);
      }

      const taskUpdate: Record<string, unknown> = {
        ata_status: response,
        ata_approved_at: response === "approved" ? now : null,
        ata_rejection_reason: response === "rejected" ? rejectionReason : null,
        updated_at: now,
      };
      // Approval starts the work; a rejection leaves the plan alone.
      if (response === "approved") taskUpdate.status = "to_do";
      if (tokenRow.customer_name) taskUpdate.ata_approved_by_name = tokenRow.customer_name;

      const { error: taskErr } = await sb.from("tasks").update(taskUpdate).eq("id", tokenRow.task_id);
      if (taskErr) console.error("ÄTA task update error:", taskErr);

      return jsonResponse({ ok: true, response }, 200, req);
    }

    return jsonResponse({ error: "bad_action" }, 400, req);
  } catch (err) {
    console.error("ata-approval error:", err);
    return jsonResponse({ error: "error" }, 500, req);
  }
});

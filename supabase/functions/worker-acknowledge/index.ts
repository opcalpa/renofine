import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { checkRateLimit, rateLimitedBody } from "../_shared/rateLimit.ts";

/**
 * worker-acknowledge — "I have read the job."
 *
 * The builder's only signal used to be last_accessed_at: the link was opened.
 * Opened is not read, and read is not understood — which matters most exactly
 * where this product is used, when the instruction is in a language the reader
 * learned second.
 *
 * Set once. A re-open never clears it, and there is no way to un-confirm: the
 * fact that someone confirmed on Tuesday stays true on Wednesday.
 *
 * verify_jwt = false like its worker siblings — the token is the gate — so the
 * rate limit passes trustJwt = false and keys on IP for everyone.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const RATE_LIMIT_SCOPE = "worker-acknowledge";
const RATE_LIMIT_TIERS = { anon: 60, authenticated: 60 };

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
    const rl = await checkRateLimit(req, RATE_LIMIT_SCOPE, RATE_LIMIT_TIERS, false);
    if (!rl.allowed) return jsonResponse(rateLimitedBody({}), 429, req);

    const { token } = await req.json();
    if (!token || typeof token !== "string") {
      return jsonResponse({ error: "Token is required" }, 400, req);
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: tokenRecord } = await sb
      .from("worker_access_tokens")
      .select("id, acknowledged_at")
      .eq("token", token)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (!tokenRecord) return jsonResponse({ error: "Invalid or expired token" }, 403, req);

    // Idempotent: the first confirmation is the one that counts.
    if (tokenRecord.acknowledged_at) {
      return jsonResponse({ success: true, acknowledgedAt: tokenRecord.acknowledged_at }, 200, req);
    }

    const acknowledgedAt = new Date().toISOString();
    const { error } = await sb
      .from("worker_access_tokens")
      .update({ acknowledged_at: acknowledgedAt })
      .eq("id", tokenRecord.id);

    if (error) {
      console.error("Acknowledge update error:", error);
      return jsonResponse({ error: "Failed to confirm" }, 500, req);
    }

    return jsonResponse({ success: true, acknowledgedAt }, 200, req);
  } catch (error) {
    console.error("worker-acknowledge error:", error);
    return jsonResponse({ error: (error as Error).message }, 500, req);
  }
});

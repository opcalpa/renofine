import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { buildScopeSystemPrompt, validateScope } from "../_shared/renovationScope.ts";

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5002",
  "http://localhost:3000",
  "https://app.renofine.com",
  "https://renofine.com",
];

// Rate-limit config: max RATE_LIMIT_MAX calls per fingerprint within the window.
// Tuned for guest-mode wizard usage (a person tries 2-5 times) plus headroom.
const RATE_LIMIT_SCOPE = "parse-renovation-description";
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MINUTES = 60;

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

function getClientFingerprint(req: Request): string {
  // Cloudflare → cf-connecting-ip; Supabase Edge Functions in Fly → x-real-ip;
  // generic chained proxy → first IP in x-forwarded-for. Fall back to "unknown"
  // (which acts as a shared bucket — still better than no limit at all).
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf;
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}

function supabaseRestHeaders() {
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

function supabaseRestUrl(path: string): string {
  return `${Deno.env.get("SUPABASE_URL")!}/rest/v1/${path}`;
}

/**
 * Returns true if the request is allowed (under the cap), false if it should be rejected.
 * On any internal error, returns true ("fail open") — we'd rather serve a request than
 * block legitimate users due to a transient DB hiccup.
 */
async function checkRateLimit(fingerprint: string): Promise<{ allowed: boolean; count: number }> {
  try {
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString();
    const params = new URLSearchParams({
      select: "id",
      scope: `eq.${RATE_LIMIT_SCOPE}`,
      fingerprint: `eq.${fingerprint}`,
      created_at: `gte.${since}`,
    });
    const countRes = await fetch(`${supabaseRestUrl("edge_rate_limits")}?${params}`, {
      headers: { ...supabaseRestHeaders(), Prefer: "count=exact" },
    });
    if (!countRes.ok) return { allowed: true, count: 0 };
    const range = countRes.headers.get("content-range") || "";
    const count = parseInt(range.split("/")[1] || "0", 10) || 0;

    if (count >= RATE_LIMIT_MAX) return { allowed: false, count };

    // Record this call (fire-and-forget — don't block on the insert)
    fetch(supabaseRestUrl("edge_rate_limits"), {
      method: "POST",
      headers: supabaseRestHeaders(),
      body: JSON.stringify({ fingerprint, scope: RATE_LIMIT_SCOPE }),
    }).catch((e) => console.error("rate-limit insert failed:", e));

    return { allowed: true, count: count + 1 };
  } catch (err) {
    console.error("checkRateLimit failed (failing open):", err);
    return { allowed: true, count: 0 };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  try {
    // Rate-limit before parsing the body — cheap rejection for hammering callers.
    const fingerprint = getClientFingerprint(req);
    const rl = await checkRateLimit(fingerprint);
    if (!rl.allowed) {
      return jsonResponse(
        {
          error: "Rate limit exceeded",
          message: `Too many requests. Limit is ${RATE_LIMIT_MAX} per ${RATE_LIMIT_WINDOW_MINUTES} minutes.`,
        },
        429,
        req
      );
    }

    const { description, language } = await req.json();

    if (!description || typeof description !== "string") {
      return jsonResponse({ error: "description is required" }, 400, req);
    }

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      return jsonResponse({ error: "OpenAI API key not configured" }, 500, req);
    }

    const lang = language || "sv";

    // The prompt and the validation both live in _shared/renovationScope.ts —
    // classify-document runs the exact same extractor inside its single merged
    // call, and two copies of a prompt this long drift within a month.
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        messages: [
          { role: "system", content: buildScopeSystemPrompt(lang) },
          { role: "user", content: description },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI error:", errorText);
      return jsonResponse({ error: "AI service error" }, 502, req);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return jsonResponse({ error: "Empty AI response" }, 502, req);
    }

    return jsonResponse(validateScope(JSON.parse(content), description), 200, req);
  } catch (err) {
    console.error("parse-renovation-description error:", err);
    return jsonResponse({ error: "Internal error" }, 500, req);
  }
});

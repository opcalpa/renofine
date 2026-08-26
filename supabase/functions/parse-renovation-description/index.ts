import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { checkRateLimit, rateLimitedBody } from "../_shared/rateLimit.ts";
import { buildScopeSystemPrompt, validateScope } from "../_shared/renovationScope.ts";

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5002",
  "http://localhost:3000",
  "https://app.renofine.com",
  "https://renofine.com",
];

// Tuned for guest-mode wizard usage (a person tries 2-5 times) plus headroom.
const RATE_LIMIT_SCOPE = "parse-renovation-description";
// verify_jwt = false here, so the JWT cannot be trusted to name a caller
// (anyone could mint one with a fresh `sub` per request and walk past a
// per-user bucket). Both tiers are therefore IP-keyed and equal.
const RATE_LIMIT_TIERS = { anon: 20, authenticated: 20 };

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
    // Rate-limit before parsing the body — cheap rejection for hammering callers.
    const rl = await checkRateLimit(req, RATE_LIMIT_SCOPE, RATE_LIMIT_TIERS, false);
    if (!rl.allowed) {
      return jsonResponse(rateLimitedBody(), 429, req);
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

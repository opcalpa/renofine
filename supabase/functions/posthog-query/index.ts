import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Read-only proxy for PostHog HogQL queries.
// The PostHog personal API key stays server-side (Supabase edge secret).
// Auth: verify_jwt is enabled at deploy time (caller must present a valid
// project JWT). If POSTHOG_PROXY_SECRET is configured, an additional
// x-proxy-secret header must match (defense in depth).

const POSTHOG_API_KEY = Deno.env.get("POSTHOG_API_KEY");
const PROXY_SECRET = Deno.env.get("POSTHOG_PROXY_SECRET"); // optional extra gate
const POSTHOG_HOST = Deno.env.get("POSTHOG_HOST") ?? "https://eu.posthog.com";
const POSTHOG_PROJECT_ID = Deno.env.get("POSTHOG_PROJECT_ID") ?? "140317";

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
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-proxy-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

serve(async (req) => {
  const cors = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  // Optional shared-secret gate (on top of verify_jwt)
  if (PROXY_SECRET && req.headers.get("x-proxy-secret") !== PROXY_SECRET) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    if (!POSTHOG_API_KEY) {
      throw new Error("POSTHOG_API_KEY is not configured on this project");
    }

    const body = await req.json().catch(() => ({}));
    const query = body?.query;
    if (!query || typeof query !== "string") {
      throw new Error('Body must be { "query": "<HogQL string>" }');
    }

    const phRes = await fetch(
      `${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}/query/`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${POSTHOG_API_KEY}`,
        },
        body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
      },
    );

    const text = await phRes.text();
    return new Response(text, {
      status: phRes.status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: String((error as Error)?.message ?? error) }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});

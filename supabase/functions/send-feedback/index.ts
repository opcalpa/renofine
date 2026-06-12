import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5002',
  'http://localhost:3000',
  'https://app.renofine.com',
  'https://renofine.com',
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  // Auth check
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  try {
    if (!RESEND_API_KEY) {
      throw new Error("Missing RESEND_API_KEY");
    }

    const { message, email, type, pageUrl, userAgent, userId } = await req.json();

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      throw new Error("Message is required");
    }

    const replyTo = email && typeof email === "string" && email.includes("@") ? email : undefined;
    const feedbackType = type === "bug" ? "🐛 Bug Report" : type === "suggestion" ? "💡 Suggestion" : "💬 Feedback";

    // Persist to user_feedback table (best-effort, don't block email)
    try {
      const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await sb.from("user_feedback").insert({
        user_id: userId || null,
        email: replyTo || null,
        type: type === "bug" ? "bug" : type === "suggestion" ? "suggestion" : "other",
        message: message.trim(),
        page_url: pageUrl || null,
        user_agent: userAgent || null,
      });
    } catch (dbErr) {
      console.error("Failed to persist feedback to DB:", dbErr);
    }

    const contextRows = [
      replyTo ? `<p><strong>From:</strong> ${replyTo}</p>` : "<p><em>Anonymous (no email provided)</em></p>",
      userId ? `<p><strong>User ID:</strong> <code>${userId}</code></p>` : "",
      pageUrl ? `<p><strong>Page:</strong> <a href="${pageUrl}">${pageUrl}</a></p>` : "",
      userAgent ? `<p><strong>Browser:</strong> ${userAgent}</p>` : "",
    ].filter(Boolean).join("\n");

    const emailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>${feedbackType}</h2>
        ${contextRows}
        <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;" />
        <div style="white-space: pre-wrap; background: #f9f9f9; padding: 16px; border-radius: 8px;">
${message.trim()}
        </div>
        <p style="color: #999; font-size: 12px; margin-top: 16px;">Sent from Renofine chatbot at ${new Date().toISOString()}</p>
      </div>
    `;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Renofine Feedback <hello@renofine.com>",
        to: ["hello@renofine.com"],
        subject: `${feedbackType} — Renofine`,
        html: emailHtml,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text();
      throw new Error(`Resend API error: ${errorText}`);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("Error sending feedback:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 400 }
    );
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RESEND_API_KEY) {
  console.error("Missing env vars:", {
    url: !!SUPABASE_URL,
    role: !!SUPABASE_SERVICE_ROLE_KEY,
    resend: !!RESEND_API_KEY,
  });
}

interface RequestData {
  invitationId: string;
  quoteId: string;
}

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
    const { invitationId, quoteId }: RequestData = await req.json();

    if (!invitationId || !quoteId) {
      throw new Error("Missing invitationId or quoteId");
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Fetch invitation with project + inviter
    const { data: invitation, error: invError } = await supabase
      .from("project_invitations")
      .select(
        `
        *,
        project:projects(id, name),
        inviter:profiles!invited_by_user_id(name, email, company_name)
      `
      )
      .eq("id", invitationId)
      .single();

    if (invError || !invitation) {
      throw new Error(
        `Failed to fetch invitation: ${invError?.message}`
      );
    }

    // Fetch quote title
    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .select("title")
      .eq("id", quoteId)
      .single();

    if (quoteError || !quote) {
      throw new Error(`Failed to fetch quote: ${quoteError?.message}`);
    }

    const origin =
      req.headers.get("origin") || "https://app.renofine.com";
    const invitationUrl = `${origin}/invitation?token=${invitation.token}`;
    const companyName =
      invitation.inviter?.company_name ||
      invitation.inviter?.name ||
      "Renofine";
    const projectName = invitation.project?.name || "Projekt";

    const emailHtml = `
      <!DOCTYPE html>
      <html lang="sv">
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .container {
              background: #f9f9f9;
              border-radius: 8px;
              padding: 30px;
              margin: 20px 0;
            }
            .button {
              display: inline-block;
              padding: 14px 28px;
              background: #10b981;
              color: white !important;
              text-decoration: none;
              border-radius: 6px;
              font-weight: 600;
              font-size: 16px;
              margin: 20px 0;
            }
            .footer {
              text-align: center;
              color: #666;
              font-size: 14px;
              margin-top: 30px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Offert fr\u00e5n ${companyName}</h2>
            <p>Hej${invitation.invited_name ? ` ${invitation.invited_name}` : ""}!</p>
            <p><strong>${companyName}</strong> har skickat en offert f\u00f6r projektet <strong>${projectName}</strong>.</p>

            <p>Klicka p\u00e5 knappen nedan f\u00f6r att se offerten i detalj och svara:</p>

            <a href="${invitationUrl}" class="button">Se offert och svara</a>

            <p style="color: #666; font-size: 14px;">
              Eller kopiera l\u00e4nken:<br>
              <code style="background: #eee; padding: 4px 8px; border-radius: 4px; display: inline-block; margin-top: 5px; word-break: break-all;">${invitationUrl}</code>
            </p>
          </div>

          <div class="footer">
            <p>Du f\u00e5r detta mejl f\u00f6r att ${companyName} har skickat dig en offert via Renofine.</p>
          </div>
        </body>
      </html>
    `;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `${companyName} via Renofine <hello@renofine.com>`,
        to: [invitation.email],
        subject: `Offert fr\u00e5n ${companyName} \u2014 ${projectName}`,
        html: emailHtml,
        ...(invitation.inviter?.email ? { reply_to: invitation.inviter.email } : {}),
      }),
    });

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text();
      throw new Error(`Resend API error: ${errorText}`);
    }

    const resendData = await resendResponse.json();

    return new Response(
      JSON.stringify({ success: true, messageId: resendData.id }),
      {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error sending quote email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});

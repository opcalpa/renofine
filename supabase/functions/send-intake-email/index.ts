import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RESEND_API_KEY) {
  console.error("Missing environment variables:", {
    url: !!SUPABASE_URL,
    role: !!SUPABASE_SERVICE_ROLE_KEY,
    resend: !!RESEND_API_KEY,
  });
}

interface IntakeEmailData {
  intakeId: string;
  customerEmail: string;
  customerName?: string;
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
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  try {
    const { intakeId, customerEmail, customerName }: IntakeEmailData = await req.json();

    if (!intakeId || !customerEmail) {
      throw new Error("Missing required fields: intakeId and customerEmail");
    }

    // Create Supabase client with service role key
    const supabase = createClient(
      SUPABASE_URL!,
      SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Fetch intake request details
    const { data: intake, error: intakeError } = await supabase
      .from("customer_intake_requests")
      .select(`
        *,
        creator:profiles!customer_intake_requests_creator_id_fkey(name, company_name, email),
        project:projects(name)
      `)
      .eq("id", intakeId)
      .single();

    if (intakeError || !intake) {
      throw new Error(`Failed to fetch intake request: ${intakeError?.message}`);
    }

    // Get the origin for building URLs
    const origin = req.headers.get("origin") || "https://app.renofine.com";

    // Build intake form URL
    const intakeFormUrl = `${origin}/intake/${intake.token}`;

    // Company/builder name
    const builderName = intake.creator.company_name || intake.creator.name || "Renofine";
    const projectName = intake.project?.name;

    // Prepare email content
    const emailHtml = `
      <!DOCTYPE html>
      <html>
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
              margin: 20px 0;
            }
            .info-box {
              background: white;
              padding: 15px;
              border-radius: 6px;
              margin: 15px 0;
              border-left: 4px solid #10b981;
            }
            .footer {
              text-align: center;
              color: #666;
              font-size: 14px;
              margin-top: 30px;
            }
            .logo {
              font-weight: bold;
              font-size: 24px;
              color: #10b981;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="logo">🏠 ${builderName}</div>

            <h2>Berätta om ditt projekt</h2>

            <p>Hej${customerName ? ` ${customerName}` : ""}!</p>

            <p><strong>${builderName}</strong> vill hjälpa dig med din renovering${projectName ? ` (${projectName})` : ""}. För att kunna ge dig en bra offert behöver vi lite mer information om ditt projekt.</p>

            <div class="info-box">
              <strong>Vad händer härnäst?</strong>
              <ol style="margin: 10px 0; padding-left: 20px;">
                <li>Fyll i formuläret med information om din renovering</li>
                <li>${builderName} granskar dina önskemål</li>
                <li>Du får en detaljerad offert baserad på din beskrivning</li>
              </ol>
            </div>

            <p>Klicka på knappen nedan för att fylla i formuläret:</p>

            <a href="${intakeFormUrl}" class="button">Öppna formuläret</a>

            <p style="color: #666; font-size: 14px;">
              Eller kopiera denna länk: <br>
              <code style="background: #eee; padding: 4px 8px; border-radius: 4px; display: inline-block; margin-top: 5px; word-break: break-all;">${intakeFormUrl}</code>
            </p>
          </div>

          <div class="footer">
            <p>Länken är giltig i 7 dagar.</p>
            <p>Om du inte förväntat dig detta meddelande kan du ignorera det.</p>
            <p style="margin-top: 20px;">
              <small>Skickat via <a href="https://renofine.com" style="color: #10b981;">Renofine</a></small>
            </p>
          </div>
        </body>
      </html>
    `;

    // Send email via Resend
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `${builderName} via Renofine <hello@renofine.com>`,
        to: [customerEmail],
        subject: `${builderName} vill hjälpa dig med din renovering`,
        html: emailHtml,
        ...(intake.creator?.email ? { reply_to: intake.creator.email } : {}),
      }),
    });

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text();
      throw new Error(`Resend API error: ${errorText}`);
    }

    const resendData = await resendResponse.json();

    return new Response(
      JSON.stringify({
        success: true,
        messageId: resendData.id,
      }),
      {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error sending intake email:", error);
    return new Response(
      JSON.stringify({
        error: error.message,
      }),
      {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});

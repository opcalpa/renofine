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

interface InvitationData {
  invitationId: string;
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

// ---------------------------------------------------------------------------
// Email templates
// ---------------------------------------------------------------------------

function buildRfqEmail(
  invitation: Record<string, unknown>,
  invitationUrl: string
): { subject: string; html: string } {
  const project = invitation.project as { id: string; name: string };
  const inviter = invitation.inviter as { name: string; email: string };
  const perms = (invitation.permissions_snapshot || {}) as Record<string, unknown>;
  const personalMessage = perms.message as string | null;
  const inviterName = inviter.name || inviter.email;

  const subject = `Offertförfrågan: ${project.name} — Renofine`;

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#1a1a1a;max-width:560px;margin:0 auto;padding:20px;background:#fff}
  .card{background:#f8faf8;border:1px solid #e5e7eb;border-radius:12px;padding:28px;margin:16px 0}
  h1{font-size:20px;font-weight:600;margin:0 0 4px}
  .subtitle{color:#666;font-size:14px;margin:0 0 20px}
  .msg{background:#fff;border-left:3px solid #10b981;padding:12px 16px;border-radius:0 8px 8px 0;margin:16px 0;font-size:14px;color:#374151}
  .steps{margin:20px 0;padding:0;list-style:none;counter-reset:step}
  .steps li{position:relative;padding:0 0 12px 32px;font-size:14px;color:#374151}
  .steps li::before{counter-increment:step;content:counter(step);position:absolute;left:0;top:0;width:22px;height:22px;background:#10b981;color:#fff;border-radius:50%;font-size:12px;font-weight:600;text-align:center;line-height:22px}
  .btn{display:inline-block;padding:14px 32px;background:#10b981;color:#fff!important;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;margin:20px 0}
  .link{color:#666;font-size:12px;word-break:break-all;margin:8px 0}
  .footer{text-align:center;color:#999;font-size:12px;margin-top:28px;padding-top:16px;border-top:1px solid #e5e7eb}
</style></head><body>
<div class="card">
  <h1>Offertförfrågan</h1>
  <p class="subtitle">${inviterName} vill ha en offert på sitt renoveringsprojekt <strong>${project.name}</strong></p>
  ${personalMessage ? `<div class="msg">"${personalMessage}"<br><span style="color:#999;font-size:12px">— ${inviterName}</span></div>` : ""}
  <ol class="steps">
    <li>Klicka på länken nedan och logga in (eller skapa konto)</li>
    <li>Se hemägarens arbetsomfattning, rum och önskemål</li>
    <li>Skapa din offert baserat på underlaget</li>
    <li>Hemägaren kan godkänna eller ställa frågor direkt i appen</li>
  </ol>
  <a href="${invitationUrl}" class="btn">Visa offertförfrågan</a>
  <p class="link">${invitationUrl}</p>
</div>
<div class="footer">
  <p>Inbjudan gäller i 7 dagar.</p>
  <p>Renofine — Renovering, enklare.</p>
</div>
</body></html>`;

  return { subject, html };
}

function buildCoOwnerEmail(
  invitation: Record<string, unknown>,
  invitationUrl: string
): { subject: string; html: string } {
  const project = invitation.project as { id: string; name: string };
  const inviter = invitation.inviter as { name: string; email: string };
  const inviterName = inviter.name || inviter.email;

  const subject = `Du har bjudits in som delägare — ${project.name} — Renofine`;

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#1a1a1a;max-width:560px;margin:0 auto;padding:20px;background:#fff}
  .container{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:28px 24px;margin:20px 0}
  h2{color:#15803d;font-size:20px;margin-bottom:12px}
  .btn{display:inline-block;padding:14px 28px;background:#15803d;color:white!important;text-decoration:none;border-radius:8px;font-weight:600;margin:16px 0;font-size:16px}
  .link{word-break:break-all;color:#666;font-size:12px;margin-top:8px}
  .footer{text-align:center;color:#888;font-size:13px;margin-top:24px}
</style></head><body>
<div class="container">
  <h2>Delad projektledning — ${project.name}</h2>
  <p><strong>${inviterName}</strong> vill dela projektledningen med dig för renoveringen <strong>${project.name}</strong>.</p>
  <p>Som delägare får du <strong>samma rättigheter</strong> som projektägaren — full tillgång till alla funktioner, uppgifter, budget och filer.</p>
  <p>Ditt personnummer kan även användas för dubbelt ROT-avdrag.</p>
  <a href="${invitationUrl}" class="btn">Acceptera inbjudan</a>
  <p class="link">${invitationUrl}</p>
</div>
<div class="footer">
  <p>Inbjudan gäller i 7 dagar.</p>
  <p>Om du inte förväntade dig denna inbjudan kan du ignorera detta mejl.</p>
</div>
</body></html>`;

  return { subject, html };
}

function buildStandardEmail(
  invitation: Record<string, unknown>,
  invitationUrl: string
): { subject: string; html: string } {
  const project = invitation.project as { id: string; name: string };
  const inviter = invitation.inviter as { name: string; email: string };
  const inviterName = inviter.name || inviter.email;

  const subject = `You're invited to ${project.name} — Renofine`;

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px}
  .container{background:#f9f9f9;border-radius:8px;padding:30px;margin:20px 0}
  .button{display:inline-block;padding:12px 24px;background:#10b981;color:white!important;text-decoration:none;border-radius:6px;font-weight:600;margin:20px 0}
  .details{background:white;padding:15px;border-radius:6px;margin:15px 0}
  .footer{text-align:center;color:#666;font-size:14px;margin-top:30px}
</style></head><body>
<div class="container">
  <h2>Project Invitation — ${project.name}</h2>
  <p>Hi!</p>
  <p><strong>${inviterName}</strong> has invited you to collaborate on their renovation project: <strong>${project.name}</strong></p>
  <div class="details">
    <h3>Your Access Level</h3>
    <ul>
      <li><strong>Role:</strong> ${invitation.role || "viewer"}</li>
      <li><strong>Tasks:</strong> ${invitation.tasks_access || "view"}</li>
      <li><strong>Overview:</strong> ${invitation.overview_access || "view"}</li>
    </ul>
  </div>
  <p>Click the button below to accept the invitation:</p>
  <a href="${invitationUrl}" class="button">Accept Invitation</a>
  <p style="color:#666;font-size:14px">Or copy this link:<br>
    <code style="background:#eee;padding:4px 8px;border-radius:4px;display:inline-block;margin-top:5px">${invitationUrl}</code>
  </p>
</div>
<div class="footer">
  <p>This invitation will expire in 7 days.</p>
  <p>If you didn't expect this invitation, you can safely ignore this email.</p>
</div>
</body></html>`;

  return { subject, html };
}

function buildPlanningContributorEmail(
  invitation: Record<string, unknown>,
  invitationUrl: string
): { subject: string; html: string } {
  const project = invitation.project as { id: string; name: string };
  const inviter = invitation.inviter as { name: string; email: string };
  const inviterName = inviter.name || inviter.email;

  const subject = `Beskriv din renovering — ${project.name} — Renofine`;

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#1a1a1a;max-width:560px;margin:0 auto;padding:20px;background:#fff}
  .card{background:#f8faf8;border:1px solid #e5e7eb;border-radius:12px;padding:28px;margin:16px 0}
  h1{font-size:20px;font-weight:600;margin:0 0 4px}
  .subtitle{color:#666;font-size:14px;margin:0 0 20px}
  .steps{margin:20px 0;padding:0;list-style:none;counter-reset:step}
  .steps li{position:relative;padding:0 0 12px 32px;font-size:14px;color:#374151}
  .steps li::before{counter-increment:step;content:counter(step);position:absolute;left:0;top:0;width:22px;height:22px;background:#6366f1;color:#fff;border-radius:50%;font-size:12px;font-weight:600;text-align:center;line-height:22px}
  .btn{display:inline-block;padding:14px 32px;background:#6366f1;color:#fff!important;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;margin:20px 0}
  .link{color:#666;font-size:12px;word-break:break-all;margin:8px 0}
  .footer{text-align:center;color:#999;font-size:12px;margin-top:28px;padding-top:16px;border-top:1px solid #e5e7eb}
</style></head><body>
<div class="card">
  <h1>Beskriv din renovering</h1>
  <p class="subtitle"><strong>${inviterName}</strong> har bjudit in dig att beskriva vad som behöver göras i projektet <strong>${project.name}</strong></p>
  <ol class="steps">
    <li>Klicka på länken nedan och logga in (eller skapa konto)</li>
    <li>Lägg till vilka arbeten som behöver utföras</li>
    <li>Lägg till rum med mått</li>
    <li>Koppla ihop arbeten med rum — så kan din byggare ge dig en exakt offert</li>
  </ol>
  <a href="${invitationUrl}" class="btn">Börja planera</a>
  <p class="link">${invitationUrl}</p>
</div>
<div class="footer">
  <p>Inbjudan gäller i 7 dagar.</p>
  <p>Renofine — Renovering, enklare.</p>
</div>
</body></html>`;

  return { subject, html };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  try {
    const { invitationId }: InvitationData = await req.json();
    if (!invitationId) throw new Error("Missing invitationId");

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: invitation, error: invitationError } = await supabase
      .from("project_invitations")
      .select(
        `*, project:projects(id, name), inviter:profiles!invited_by_user_id(name, email, company_name)`
      )
      .eq("id", invitationId)
      .single();

    if (invitationError || !invitation) {
      throw new Error(
        `Failed to fetch invitation: ${invitationError?.message}`
      );
    }

    const origin =
      req.headers.get("origin") || "https://app.renofine.com";
    const invitationUrl = `${origin}/invitation?token=${invitation.token || invitation.invitation_token}`;

    // Detect invitation type
    const perms = (invitation.permissions_snapshot || {}) as Record<string, unknown>;
    const roleType = invitation.role_type || perms.role_type;

    const { subject, html } = roleType === "rfq_builder"
      ? buildRfqEmail(invitation, invitationUrl)
      : roleType === "planning_contributor"
        ? buildPlanningContributorEmail(invitation, invitationUrl)
        : roleType === "co_owner"
          ? buildCoOwnerEmail(invitation, invitationUrl)
          : buildStandardEmail(invitation, invitationUrl);

    const recipientEmail =
      invitation.invited_email || invitation.email;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `${invitation.inviter?.company_name || invitation.inviter?.name || "Renofine"} via Renofine <hello@renofine.com>`,
        to: [recipientEmail],
        subject,
        html,
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
    console.error("Error sending invitation:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      status: 400,
    });
  }
});

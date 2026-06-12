import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// SMS provider: 46elks (Swedish, simple API, good Nordic/EU coverage)
// Set these in Supabase Dashboard > Edge Functions > Secrets
const ELKS_API_USER = Deno.env.get("ELKS_API_USER");
const ELKS_API_PASSWORD = Deno.env.get("ELKS_API_PASSWORD");

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

// SMS messages per language — short, clear, with link placeholder
const SMS_TEMPLATES: Record<string, (ownerName: string, url: string) => string> = {
  en: (o, u) => `${o} shared work instructions with you. Open: ${u}`,
  sv: (o, u) => `${o} har delat arbetsinstruktioner med dig. Oppna: ${u}`,
  uk: (o, u) => `${o} надіслав вам робочі інструкції. Відкрити: ${u}`,
  pl: (o, u) => `${o} udostępnił Ci instrukcje pracy. Otwórz: ${u}`,
  ro: (o, u) => `${o} a partajat instrucțiuni de lucru. Deschide: ${u}`,
  lt: (o, u) => `${o} pasidalino darbo instrukcijomis. Atidaryti: ${u}`,
  et: (o, u) => `${o} jagas teiega tööjuhiseid. Ava: ${u}`,
  de: (o, u) => `${o} hat Arbeitsanweisungen mit Ihnen geteilt. Öffnen: ${u}`,
  fr: (o, u) => `${o} a partagé des instructions de travail. Ouvrir: ${u}`,
  es: (o, u) => `${o} compartió instrucciones de trabajo. Abrir: ${u}`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  try {
    const { tokenId } = await req.json();
    if (!tokenId) {
      return jsonResponse({ error: "tokenId is required" }, 400, req);
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch token record with owner name
    const { data: tokenRecord, error: tokenError } = await sb
      .from("worker_access_tokens")
      .select("id, token, worker_name, worker_phone, worker_language, project_id, created_by_user_id")
      .eq("id", tokenId)
      .single();

    if (tokenError || !tokenRecord) {
      return jsonResponse({ error: "Token not found" }, 404, req);
    }

    if (!tokenRecord.worker_phone) {
      return jsonResponse({ error: "No phone number on this token" }, 400, req);
    }

    // Get owner name
    const { data: ownerProfile } = await sb
      .from("profiles")
      .select("name")
      .eq("id", tokenRecord.created_by_user_id)
      .single();

    const ownerName = ownerProfile?.name || "Your project manager";
    const lang = tokenRecord.worker_language || "en";
    const url = `https://app.renofine.com/w/${tokenRecord.token}`;
    const template = SMS_TEMPLATES[lang] || SMS_TEMPLATES.en;
    const message = template(ownerName, url);

    // Check if SMS provider is configured
    if (!ELKS_API_USER || !ELKS_API_PASSWORD) {
      // Return the message for manual sending (WhatsApp, etc.)
      return jsonResponse({
        sent: false,
        reason: "sms_not_configured",
        message,
        phone: tokenRecord.worker_phone,
        url,
      }, 200, req);
    }

    // Send via 46elks
    const smsResponse = await fetch("https://api.46elks.com/a1/sms", {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        from: "Renofine",
        to: tokenRecord.worker_phone,
        message,
      }),
    });

    if (!smsResponse.ok) {
      const errorText = await smsResponse.text();
      console.error("46elks error:", errorText);
      return jsonResponse({
        sent: false,
        reason: "provider_error",
        message,
        phone: tokenRecord.worker_phone,
        url,
      }, 200, req);
    }

    const smsResult = await smsResponse.json();
    console.info("SMS sent:", smsResult.id, "to:", tokenRecord.worker_phone);

    return jsonResponse({
      sent: true,
      smsId: smsResult.id,
      phone: tokenRecord.worker_phone,
    }, 200, req);
  } catch (error) {
    console.error("send-worker-sms error:", error);
    return jsonResponse({ error: error.message }, 500, req);
  }
});

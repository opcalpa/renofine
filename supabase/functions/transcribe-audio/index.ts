import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * transcribe-audio — server-side speech-to-text for voice capture.
 *
 * The Web Speech API is missing on iOS Safari and inconsistent elsewhere, so
 * clients record audio with MediaRecorder (webm/opus on Android+desktop,
 * mp4/AAC on iOS) and post it here. We forward to OpenAI transcription and
 * return plain text. No DB access — but the caller must be an authenticated
 * user so this can't be used as an open transcription proxy.
 */

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5002",
  "http://localhost:3000",
  "https://app.renofine.com",
  "https://renofine.com",
];

const MAX_AUDIO_BYTES = 15 * 1024 * 1024; // ~15MB ≈ several minutes of opus
const PRIMARY_MODEL = "gpt-4o-mini-transcribe";
const FALLBACK_MODEL = "whisper-1";

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

async function verifyCaller(authHeader: string): Promise<boolean> {
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")!}/auth/v1/user`, {
    headers: {
      apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
      Authorization: authHeader,
    },
  });
  return res.ok;
}

async function transcribe(model: string, audio: File, language: string | null): Promise<Response> {
  const form = new FormData();
  form.append("model", model);
  form.append("file", audio, audio.name || "audio.webm");
  form.append("response_format", "json");
  if (language) form.append("language", language);
  return fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")!}` },
    body: form,
  });
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !(await verifyCaller(authHeader))) {
      return json({ error: "Unauthorized" }, 401);
    }

    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File) || audio.size === 0) {
      return json({ error: "Missing audio file" }, 400);
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      return json({ error: "Audio too large" }, 413);
    }
    // Whisper wants ISO-639-1; anything else degrades to auto-detect.
    const rawLang = String(form.get("language") ?? "").slice(0, 2).toLowerCase();
    const language = /^[a-z]{2}$/.test(rawLang) ? rawLang : null;

    let res = await transcribe(PRIMARY_MODEL, audio, language);
    if (!res.ok) {
      console.error(`transcribe-audio: ${PRIMARY_MODEL} failed (${res.status}), retrying with ${FALLBACK_MODEL}`);
      res = await transcribe(FALLBACK_MODEL, audio, language);
    }
    if (!res.ok) {
      const detail = await res.text();
      console.error(`transcribe-audio: both models failed: ${res.status} ${detail.slice(0, 300)}`);
      return json({ error: "Transcription failed" }, 502);
    }

    const data = await res.json();
    return json({ text: typeof data.text === "string" ? data.text.trim() : "" });
  } catch (err) {
    console.error("transcribe-audio error:", err);
    return json({ error: "Internal error" }, 500);
  }
});

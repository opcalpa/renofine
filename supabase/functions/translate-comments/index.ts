import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

  try {
    const { comments, targetLanguage } = await req.json();

    if (!comments || !Array.isArray(comments) || comments.length === 0) {
      return new Response(
        JSON.stringify({ error: "comments array is required" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    if (!targetLanguage) {
      return new Response(
        JSON.stringify({ error: "targetLanguage is required" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured" }),
        { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const languageNames: Record<string, string> = {
      en: "English", sv: "Swedish", de: "German", fr: "French",
      es: "Spanish", pl: "Polish", uk: "Ukrainian", ro: "Romanian",
      lt: "Lithuanian", et: "Estonian",
    };

    const targetName = languageNames[targetLanguage] || targetLanguage;

    const numberedComments = comments
      .map((c: { id: string; content: string }, i: number) => `[${i}] ${c.content}`)
      .join("\n---\n");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content: `You are a translator. Translate each numbered comment to ${targetName}. Preserve all @[Name](id) mention markers exactly as-is — do NOT translate text inside them. Return ONLY a JSON array of objects with "index" (number) and "translatedContent" (string). No markdown, no explanation.`,
          },
          {
            role: "user",
            content: numberedComments,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", errorText);
      return new Response(
        JSON.stringify({ error: "Translation API error" }),
        { status: 502, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content?.trim() || "[]";

    let parsed: { index: number; translatedContent: string }[];
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      console.error("Failed to parse OpenAI response:", rawContent);
      return new Response(
        JSON.stringify({ error: "Invalid translation response" }),
        { status: 502, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const translations = parsed.map((item) => ({
      id: comments[item.index]?.id,
      translatedContent: item.translatedContent,
    })).filter((t) => t.id);

    return new Response(
      JSON.stringify({ translations }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Translation failed" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});

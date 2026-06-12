import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  try {
    const { taskTitle, taskDescription, roomName, wallSpec, floorSpec, ceilingSpec, joinerySpec, dimensions, language } = await req.json();

    if (!taskTitle) {
      return jsonResponse({ error: "taskTitle is required" }, 400, req);
    }

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      return jsonResponse({ error: "OpenAI API key not configured" }, 500, req);
    }

    const lang = language || "sv";
    const langNames: Record<string, string> = {
      en: "English", sv: "Swedish", de: "German", fr: "French",
      es: "Spanish", pl: "Polish", uk: "Ukrainian", ro: "Romanian",
      lt: "Lithuanian", et: "Estonian",
    };
    const langName = langNames[lang] || "Swedish";

    // Build context from room specs
    const specLines: string[] = [];
    if (roomName) specLines.push(`Room: ${roomName}`);
    if (dimensions?.area_sqm) specLines.push(`Area: ${dimensions.area_sqm} m²`);

    if (wallSpec) {
      if (wallSpec.treatments?.length) specLines.push(`Wall treatments: ${wallSpec.treatments.join(", ")}`);
      if (wallSpec.main_color) specLines.push(`Wall color: ${wallSpec.main_color}`);
      if (wallSpec.has_accent_wall && wallSpec.accent_wall_color) specLines.push(`Accent wall color: ${wallSpec.accent_wall_color}`);
    }
    if (floorSpec) {
      if (floorSpec.material) specLines.push(`Floor: ${floorSpec.material}`);
      if (floorSpec.specification) specLines.push(`Floor spec: ${floorSpec.specification}`);
      if (floorSpec.skirting_type) specLines.push(`Skirting: ${floorSpec.skirting_type}`);
      if (floorSpec.skirting_color) specLines.push(`Skirting color: ${floorSpec.skirting_color}`);
    }
    if (ceilingSpec) {
      if (ceilingSpec.material) specLines.push(`Ceiling: ${ceilingSpec.material}`);
      if (ceilingSpec.color) specLines.push(`Ceiling color: ${ceilingSpec.color}`);
    }
    if (joinerySpec) {
      if (joinerySpec.door_type) specLines.push(`Door type: ${joinerySpec.door_type}`);
      if (joinerySpec.trim_type) specLines.push(`Trim type: ${joinerySpec.trim_type}`);
    }

    const roomContext = specLines.length > 0
      ? `\n\nRoom specifications:\n${specLines.join("\n")}`
      : "";

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: `You are a renovation project assistant. Generate a practical, step-by-step work checklist for a construction/renovation task.

Rules:
- Write in ${langName}
- 4-10 steps, ordered logically (preparation → execution → cleanup)
- Each step should be a clear, actionable instruction
- Include specific product names, color codes (NCS, RAL), and measurements from the room specs when relevant
- Include protection/masking steps at the beginning and cleanup at the end
- Do NOT include purchasing/ordering steps — only on-site work
- Return ONLY a JSON object with this exact structure (no markdown):
{
  "title": "Checklist title in ${langName}",
  "items": ["Step 1 text", "Step 2 text", ...]
}`,
          },
          {
            role: "user",
            content: `Task: ${taskTitle}${taskDescription ? `\nDescription: ${taskDescription}` : ""}${roomContext}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI error:", errorText);
      return jsonResponse({ error: "AI generation failed" }, 502, req);
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content?.trim() || "{}";
    const cleaned = rawContent.replace(/^```json?\s*\n?/i, "").replace(/\n?```\s*$/i, "");

    let parsed: { title: string; items: string[] };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse checklist:", cleaned);
      return jsonResponse({ error: "Invalid AI response" }, 502, req);
    }

    // Format as Renofine checklist structure
    const checklist = {
      id: crypto.randomUUID(),
      title: parsed.title || taskTitle,
      items: (parsed.items || []).map((text: string) => ({
        id: crypto.randomUUID(),
        title: text,
        completed: false,
      })),
    };

    return jsonResponse({ checklist }, 200, req);
  } catch (error) {
    console.error("generate-work-checklist error:", error);
    return jsonResponse({ error: error.message }, 500, req);
  }
});

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

const MAX_HISTORY_MESSAGES = 8;

// Lightweight Supabase REST helpers (avoids bundling @supabase/supabase-js)
function supabaseRestHeaders() {
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

function supabaseRestUrl(table: string): string {
  return `${Deno.env.get("SUPABASE_URL")!}/rest/v1/${table}`;
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  sv: "Swedish",
  de: "German",
  fr: "French",
  es: "Spanish",
  pl: "Polish",
  uk: "Ukrainian",
  ro: "Romanian",
  lt: "Lithuanian",
  et: "Estonian",
};

function buildSystemPrompt(language: string, userType?: string, projectCountry?: string): string {
  const langName = LANGUAGE_NAMES[language] || "English";
  const isContractor = userType === "contractor";
  const isSwedish = !projectCountry || projectCountry === "SE";

  const userContext = isContractor
    ? `The user is a PROFESSIONAL CONTRACTOR/TRADESPERSON using Renofine to manage client projects. Tailor your advice toward efficient project management, client communication, quoting, team coordination, and professional workflows.`
    : `The user is a HOMEOWNER using Renofine to plan and manage their own renovation. Tailor your advice toward understanding the renovation process, finding reliable contractors, managing costs,${isSwedish ? " ROT tax deductions," : ""} and making informed decisions.`;

  const smartTips = isContractor
    ? `SMART TIPS FOR CONTRACTORS:
   - "Set start and end dates on all tasks so they appear on the Timeline — great for showing clients the project schedule."
   - "Use AI Document Import to upload room descriptions (rumsbeskrivning) — it automatically creates rooms and tasks, saving hours of manual setup."
   - "Invite clients via 'Bjud in kund' to let them fill in their planning scope directly in your project."
   - "Use the Budget tab to track costs per category — helps when preparing quotes for similar projects."
   - "Link invoices to tasks for full traceability — makes invoicing and accounting easier."
   - "Send quote requests (offertförfrågningar) to multiple builders — the system clones the project scope automatically."
   - "Use the Chat tab to send status updates with photos — keeps clients informed and happy."
   - "Use keyboard shortcut Ctrl+S regularly in Space Planner to save your work."`
    : `SMART TIPS FOR HOMEOWNERS:
   - "Set start and end dates on all tasks so they appear on the Timeline — visual overview of your renovation schedule."${isSwedish ? `
   - "Upload invoices under Files and link them to tasks — helps when claiming ROT deductions."` : `
   - "Upload invoices under Files and link them to tasks — helps with cost tracking and documentation."`}
   - "Use AI Document Import to upload your room description (rumsbeskrivning) PDF — automatically creates rooms and tasks."
   - "Send quote requests (offertförfrågningar) to multiple builders with one click — they each get a copy of your scope."
   - "Import external quotes you've received and assign them to specific tasks for easy comparison."
   - "Use the Budget tab's saved views to track costs by category, room, or time period."
   - "The Chat tab shows all project activity — messages, status changes, and photos in one feed."
   - "In Space Planner, click a room to see linked tasks and purchase orders — everything is connected."`;

  return `You are "Renaida" — a friendly, slightly witty renovation assistant with a twinkle in the eye. You're like a personal R2D2 for renovation projects — helpful, reliable, and a bit charming. You are both a renovation/building expert AND a platform guide for the Renofine project management app.

${userContext}

Personality:
- Friendly and approachable, like a knowledgeable colleague
- Concise but warm — not robotic, not overly casual
- Occasionally use a light touch of humor when appropriate
- Use the user's first name if available in the conversation

Rules:
- ALWAYS respond in ${langName} (language code: ${language}), regardless of what language the user writes in
- Refer to yourself as "Renaida" when relevant
- Be factual and concrete
- Keep answers short and well-structured (use bullet points, bold, etc.)
- When questions concern legal requirements, mention relevant regulations${isSwedish ? " (BBR, PBL, Boverket for Sweden)" : " for the user's country"}
- End answers about laws/regulations with a short disclaimer about checking with local authorities${!isSwedish && projectCountry ? `\n- The user's project is located in country code "${projectCountry}" — adapt regulatory advice accordingly. Do NOT mention Swedish-specific programs like ROT/RUT unless the user explicitly asks.` : ""}

You can help with TWO areas:

1) RENOVATION & BUILDING EXPERTISE:
   Building techniques, building permits,${isSwedish ? " tax deductions (ROT)," : ""} material choices, project planning, regulations, insurance.

2) PLATFORM GUIDE — how to use the Renofine app effectively:

   PROJECTS & OVERVIEW:
   - Each project has an Overview tab with key stats, progress, timeline, and budget summary.
   - Smart contextual tips appear based on project phase and user type — guiding next steps.
   - The Overview includes a unified activity feed showing messages, status changes, and photos.

   PLANNING PHASE:
   - Homeowners start in a planning view where they list tasks and rooms (no pricing visible).
   - Builders can invite homeowners as "planning contributors" to collaborate on scope.
   - When ready, homeowners can send quote requests (RFQ/offertförfrågan) to multiple builders.
   - Each builder receives a cloned copy of the project scope to fill in their pricing independently.
   - Homeowners can also import external quotes received outside the app and assign them to tasks.

   TASKS & TIMELINE:
   - Tasks are created under the Tasks tab with kanban or table view.
   - Assign team members, set statuses (To Do, In Progress, Done, On Hold), add comments.
   - IMPORTANT: Tasks MUST have start/end dates to appear on the Timeline view.
   - The Timeline has zoom controls, grouping (by status/room/assignee/priority), and a reminder badge for unscheduled tasks.
   - Tasks can be linked to files, rooms, and purchase orders.

   CHAT & ACTIVITY FEED:
   - The Chat tab shows a unified feed: project comments, task updates, status changes, and photos.
   - Filter by All, Messages, Activity, or Photos.
   - Send direct messages to team members.
   - Homeowners see a filtered view (no pricing-related comments).

   FILES & AI DOCUMENT IMPORT:
   - Upload and manage project documents (PDFs, images, invoices).
   - AI Document Import: Upload room descriptions and automatically extract rooms + tasks.
   - Files can be linked to tasks for traceability.

   SPACE PLANNER (Floor Map):
   - Draw floor plans with walls, rooms, and objects.
   - AI Floor Plan Import: Upload a floor plan image for automatic room detection.
   - Rooms sync with the Rooms section and connect to tasks + purchases.
   - Elevation View for wall visualizations.
   - Keyboard shortcuts: Ctrl+Z undo, Ctrl+S save, Delete to remove.

   BUDGET & PURCHASES:
   - Budget tab tracks costs by category with visual dashboards.
   - Homeowners vs builders see different budget views.
   - Create purchase requests linked to tasks and rooms.
   - Track payment status and connect invoices.

   TEAM & SHARING:
   - Invite team members with roles: Owner, Admin, Member, Viewer, Client.
   - Builders can invite homeowners as planning contributors or clients.
   - Clients get a read-only view with filtered activity feed.

   QUOTES & INVOICES:
   - Create professional quotes with line items,${isSwedish ? " ROT deduction calculation," : ""} and PDF export.
   - Track quote status (draft, sent, accepted, declined).
   - Create invoices linked to accepted quotes.

   ${smartTips}`;
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
    const { messages, language = "en", userType, projectCountry } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "messages array is required" }),
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

    // Check cache for single-message requests (quick prompts)
    const isSingleMessage = messages.length === 1;
    if (isSingleMessage) {
      const cacheKey = `${language}:${userType || "default"}:${projectCountry || "none"}:${messages[0].content}`;

      // Look up cache via REST API
      const cacheRes = await fetch(
        `${supabaseRestUrl("help_bot_cache")}?cache_key=eq.${encodeURIComponent(cacheKey)}&select=response&limit=1`,
        { headers: supabaseRestHeaders() },
      );
      if (cacheRes.ok) {
        const rows = await cacheRes.json();
        if (rows.length > 0 && rows[0].response) {
          return new Response(
            JSON.stringify({ reply: rows[0].response }),
            { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
          );
        }
      }

      // Cache miss — call OpenAI and store result
      const reply = await callOpenAI(openaiApiKey, messages, language, userType, projectCountry);

      // Store in cache (fire-and-forget, don't block response)
      fetch(supabaseRestUrl("help_bot_cache"), {
        method: "POST",
        headers: { ...supabaseRestHeaders(), Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify({
          cache_key: cacheKey,
          response: reply,
          language,
          user_type: userType || null,
        }),
      }).catch(() => {});

      return new Response(
        JSON.stringify({ reply }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    // Multi-message conversation — trim to last N messages and call OpenAI
    const trimmedMessages = messages.slice(-MAX_HISTORY_MESSAGES);
    const reply = await callOpenAI(openaiApiKey, trimmedMessages, language, userType, projectCountry);

    return new Response(
      JSON.stringify({ reply }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Help bot failed" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});

async function callOpenAI(
  apiKey: string,
  messages: { role: string; content: string }[],
  language: string,
  userType?: string,
  projectCountry?: string,
): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.7,
      max_tokens: 1024,
      messages: [
        { role: "system", content: buildSystemPrompt(language, userType, projectCountry) },
        ...messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("OpenAI API error:", errorText);
    throw new Error("AI API error");
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

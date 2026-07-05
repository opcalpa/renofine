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

// RLS-scoped fetch AS THE CALLER (their JWT) — mirrors agent-route. Used for
// project-context injection so the bot can only see projects the user can.
function callerRestHeaders(authHeader: string) {
  return {
    apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
    Authorization: authHeader,
    "Content-Type": "application/json",
  };
}

interface ProjectCtx {
  name: string;
  rooms: string[];
  tasks: { title: string; status: string | null; progress: number | null; budget: number | null }[];
}

/** Fetch a compact project snapshot (RLS-scoped). Best-effort: null on any failure. */
async function fetchProjectContext(projectId: string, authHeader: string): Promise<ProjectCtx | null> {
  try {
    const headers = callerRestHeaders(authHeader);
    const [projRes, roomsRes, tasksRes] = await Promise.all([
      fetch(`${supabaseRestUrl("projects")}?id=eq.${projectId}&select=name&limit=1`, { headers }),
      fetch(`${supabaseRestUrl("rooms")}?project_id=eq.${projectId}&select=name&order=name.asc&limit=50`, { headers }),
      fetch(`${supabaseRestUrl("tasks")}?project_id=eq.${projectId}&select=title,status,progress,budget&order=created_at.desc&limit=100`, { headers }),
    ]);
    const proj = projRes.ok ? await projRes.json() : [];
    if (!proj.length) return null;
    const rooms = roomsRes.ok ? await roomsRes.json() : [];
    const tasks = tasksRes.ok ? await tasksRes.json() : [];
    return {
      name: proj[0].name,
      rooms: rooms.map((r: { name: string }) => r.name),
      tasks,
    };
  } catch {
    return null;
  }
}

/** Render the project snapshot as a prompt section — this is what makes answers
 *  feel like a consultant who knows THEIR project, not a generic FAQ bot. */
function buildProjectSection(ctx: ProjectCtx): string {
  const taskLines = ctx.tasks.slice(0, 60).map((t) => {
    const parts = [`"${t.title}"`, t.status ?? "", typeof t.progress === "number" ? `${t.progress}%` : ""];
    return `  - ${parts.filter(Boolean).join(" · ")}`;
  }).join("\n");
  const budgetTotal = ctx.tasks.reduce((sum, t) => sum + (typeof t.budget === "number" ? t.budget : 0), 0);
  return `
THE USER'S CURRENT PROJECT — "${ctx.name}" (use this to give SPECIFIC, situational advice; reference their actual rooms/tasks by name; sequence advice around what is already done vs not):
Rooms: ${ctx.rooms.length ? ctx.rooms.join(", ") : "(none yet)"}
Tasks (${ctx.tasks.length}):
${taskLines || "  (none yet)"}
${budgetTotal > 0 ? `Task budgets sum to ~${Math.round(budgetTotal)} (project currency).` : ""}
`;
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

function buildSystemPrompt(language: string, userType?: string, projectCountry?: string, userName?: string, projectSection?: string): string {
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
${userName ? `- The user's first name is "${userName.split(" ")[0]}" — address them by it naturally now and then` : "- You do NOT know the user's name. NEVER write a name placeholder like [Ditt namn], [Name] or similar — simply omit the name"}

Rules:
- ALWAYS respond in ${langName} (language code: ${language}), regardless of what language the user writes in
- Refer to yourself as "Renaida" when relevant
- Be factual and concrete
- Keep answers short and well-structured (use bullet points, bold, etc.)
- When questions concern legal requirements, mention relevant regulations${isSwedish ? " (BBR, PBL, Boverket for Sweden)" : " for the user's country"}
- End answers about laws/regulations with a short disclaimer about checking with local authorities${!isSwedish && projectCountry ? `\n- The user's project is located in country code "${projectCountry}" — adapt regulatory advice accordingly. Do NOT mention Swedish-specific programs like ROT/RUT unless the user explicitly asks.` : ""}

${projectSection ?? ""}
You can help with TWO areas:

1) RENOVATION & BUILDING EXPERTISE (your primary craft — answer like an experienced site manager, not a brochure):
   - SEQUENCING is your signature skill. Standard renovation order and WHY: rivning/demontering → stom-/konstruktionsändringar → el & VVS-dragning i vägg (rough-in) → ${isSwedish ? "tätskikt i våtrum (KRAV före ytskikt)" : "waterproofing in wet rooms (REQUIRED before surfaces)"} → golvvärme/avjämning → ytskikt (kakel/klinker, spackling, målning: tak → väggar → snickerier) → montering (kök/vitvaror/sanitet) → el-slutmontering (uttag, armaturer) → lister & finish → slutstädning/besiktning. When asked "what order", apply this to THEIR actual tasks if project context is present — point out anything in their plan that seems out of order.
   - ${isSwedish ? "SWEDISH WET-ROOM & TRADE RULES: tätskikt ska utföras enligt branschregler (BBV/GVK för våtrum, Säker Vatten för VVS) — rekommendera behörig våtrumsfirma för tätskikt och auktoriserad elinstallatör (Elsäkerhetsverket) för fasta el-arbeten; felaktigt utförande kan påverka försäkring och framtida försäljning. ROT-avdrag: 50% av arbetskostnaden 2025/2026 (takbelopp per person/år), endast arbete — inte material — och kräver att utföraren har F-skatt." : "Recommend certified/licensed trades for waterproofing, plumbing and fixed electrical work — regulations vary by country; incorrect work can void insurance."}
   - COST REALISM: give honest ballpark ranges when asked, always flagging that quotes vary — and that labor${isSwedish ? " (where ROT applies)" : ""} vs material split matters. Never invent exact prices as facts.
   - Building permits (${isSwedish ? "bygglov/anmälan — bärande väggar, våtrum ändrad planlösning, fasadändring" : "permits for structural changes"}), material choices, moisture/ventilation basics, insurance considerations.

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
    const { messages, language: rawLanguage = "en", userType, projectCountry, userName, projectId } = await req.json();
    // Browser-detected codes arrive as region variants ("sv-SE") — normalize so
    // the LANGUAGE_NAMES lookup doesn't silently fall back to English.
    const language = String(rawLanguage).slice(0, 2);

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

    // Expert mode (Taulant P3): when a project is open, inject its snapshot and
    // use the premium model — this is where the "tailored construction expert"
    // feel lives. Project-context answers are user-specific → NEVER cached.
    let projectSection: string | undefined;
    if (typeof projectId === "string" && projectId) {
      const ctx = await fetchProjectContext(projectId, authHeader);
      if (ctx) projectSection = buildProjectSection(ctx);
    }
    const model = projectSection ? "gpt-4o" : "gpt-4o-mini";

    // Check cache for single-message requests (quick prompts) — generic only;
    // project-context replies bypass the cache entirely.
    const isSingleMessage = messages.length === 1 && !projectSection;
    if (isSingleMessage) {
      // v2: cache-key bumped 2026-07-05 — earlier rows were cached from prompts
      // without the no-name-placeholder rule (a "[Ditt namn]" reply got cached).
      const cacheKey = `v2:${language}:${userType || "default"}:${projectCountry || "none"}:${messages[0].content}`;

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

      // Cache miss — call OpenAI and store result. Deliberately NO userName here:
      // cached replies are shared across users, so they must stay name-neutral
      // (the prompt's no-placeholder rule handles addressing gracefully).
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

    // Conversation (or project-context) path — not cached → safe to personalize
    // with the user's name and their project snapshot.
    const trimmedMessages = messages.slice(-MAX_HISTORY_MESSAGES);
    const reply = await callOpenAI(openaiApiKey, trimmedMessages, language, userType, projectCountry, typeof userName === "string" ? userName : undefined, projectSection, model);

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
  userName?: string,
  projectSection?: string,
  model = "gpt-4o-mini",
): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      max_tokens: 1024,
      messages: [
        { role: "system", content: buildSystemPrompt(language, userType, projectCountry, userName, projectSection) },
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

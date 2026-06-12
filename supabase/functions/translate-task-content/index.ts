import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English", sv: "Swedish", de: "German", fr: "French",
  es: "Spanish", pl: "Polish", uk: "Ukrainian", ro: "Romanian",
  lt: "Lithuanian", et: "Estonian",
};

interface ChecklistItem {
  id: string;
  title: string;
  completed: boolean;
}

interface Checklist {
  id: string;
  title: string;
  items: ChecklistItem[];
}

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  checklists: Checklist[] | null;
  room_id: string | null;
}

interface RoomRow {
  id: string;
  name: string;
  description: string | null;
}

interface RoomItemRow {
  id: string;
  title: string;
  detail: { notes?: string } | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  try {
    const { taskIds, targetLanguage } = await req.json();

    if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      return jsonResponse({ error: "taskIds array is required" }, 400, req);
    }
    if (!targetLanguage || typeof targetLanguage !== "string") {
      return jsonResponse({ error: "targetLanguage is required" }, 400, req);
    }

    if (targetLanguage === "en" || targetLanguage === "sv") {
      return jsonResponse({ translated: 0, skipped: "source language" }, 200, req);
    }

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      return jsonResponse({ error: "OpenAI API key not configured" }, 500, req);
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Identify tasks that still need translation for the target language.
    const { data: existingTasks } = await sb
      .from("task_translations")
      .select("task_id")
      .in("task_id", taskIds)
      .eq("language", targetLanguage);

    const cachedTaskIds = new Set((existingTasks || []).map((e) => e.task_id));
    const missingTaskIds = taskIds.filter((id: string) => !cachedTaskIds.has(id));

    // Always fetch tasks (even cached ones) so we can derive room ids for
    // the room-translation half. Cached tasks will be filtered out of the
    // OpenAI payload below.
    const { data: tasks } = await sb
      .from("tasks")
      .select("id, title, description, checklists, room_id")
      .in("id", taskIds);

    if (!tasks || tasks.length === 0) {
      return jsonResponse({ translated: 0, skipped: "no tasks found" }, 200, req);
    }

    const allTasks = tasks as TaskRow[];
    const tasksToTranslate = allTasks.filter((t) => missingTaskIds.includes(t.id));

    // Derive room ids referenced by the assigned tasks, then check which
    // already have a translation cached for the target language.
    const roomIdSet = new Set<string>();
    for (const t of allTasks) {
      if (t.room_id) roomIdSet.add(t.room_id);
    }
    const roomIds = Array.from(roomIdSet);

    let roomsToTranslate: RoomRow[] = [];
    if (roomIds.length > 0) {
      const { data: existingRooms } = await sb
        .from("room_translations")
        .select("room_id")
        .in("room_id", roomIds)
        .eq("language", targetLanguage);
      const cachedRoomIds = new Set((existingRooms || []).map((r) => r.room_id));
      const missingRoomIds = roomIds.filter((id) => !cachedRoomIds.has(id));

      if (missingRoomIds.length > 0) {
        const { data: rooms } = await sb
          .from("rooms")
          .select("id, name, description")
          .in("id", missingRoomIds);
        roomsToTranslate = (rooms as RoomRow[]) || [];
      }
    }

    // Placed room-items (objects shown on the worker mini-map) carry free-text
    // — a custom title and detail.notes — that also needs translating. Mirror the
    // room half: derive from the same assigned rooms, skip already-cached ones.
    let roomItemsToTranslate: RoomItemRow[] = [];
    if (roomIds.length > 0) {
      const { data: placedItems } = await sb
        .from("room_items")
        .select("id, title, detail")
        .in("room_id", roomIds)
        .not("floor_map_shape_id", "is", null);

      const candidates = (placedItems as RoomItemRow[] | null || []).filter(
        (ri) => (ri.title && ri.title.trim()) || (ri.detail?.notes && ri.detail.notes.trim()),
      );

      if (candidates.length > 0) {
        const { data: existingItems } = await sb
          .from("room_item_translations")
          .select("room_item_id")
          .in("room_item_id", candidates.map((c) => c.id))
          .eq("language", targetLanguage);
        const cachedItemIds = new Set((existingItems || []).map((e) => e.room_item_id));
        roomItemsToTranslate = candidates.filter((c) => !cachedItemIds.has(c.id));
      }
    }

    if (
      tasksToTranslate.length === 0 &&
      roomsToTranslate.length === 0 &&
      roomItemsToTranslate.length === 0
    ) {
      return jsonResponse({ translated: 0, skipped: "all cached" }, 200, req);
    }

    const targetName = LANGUAGE_NAMES[targetLanguage] || targetLanguage;

    const tasksPayload = tasksToTranslate.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description || "",
      checklistItems: (t.checklists || []).flatMap((cl) =>
        cl.items.map((item) => ({ checklistId: cl.id, itemId: item.id, title: item.title }))
      ),
    }));

    const roomsPayload = roomsToTranslate.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description || "",
    }));

    const roomItemsPayload = roomItemsToTranslate.map((ri) => ({
      id: ri.id,
      title: ri.title || "",
      notes: ri.detail?.notes || "",
    }));

    const prompt = JSON.stringify(
      { tasks: tasksPayload, rooms: roomsPayload, roomItems: roomItemsPayload },
      null,
      0,
    );

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content: `You translate renovation/construction work content to ${targetName}.

Rules:
- Translate tasks (title, description, checklistItems[].title), rooms (name, description) and roomItems (title, notes).
- NEVER translate product names, brand names, color codes (NCS, RAL, Pantone), material codes, or measurements.
- Keep the same JSON structure with three top-level arrays "tasks", "rooms" and "roomItems".
- Return ONLY a JSON object — no markdown, no explanation.

Input/output format:
{
  "tasks": [{ "id": "...", "title": "...", "description": "...", "checklistItems": [{"checklistId":"...","itemId":"...","title":"..."}] }],
  "rooms": [{ "id": "...", "name": "...", "description": "..." }],
  "roomItems": [{ "id": "...", "title": "...", "notes": "..." }]
}`,
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI error:", errorText);
      return jsonResponse({ error: "Translation API error" }, 502, req);
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content?.trim() || "{}";
    const cleaned = rawContent.replace(/^```json?\s*\n?/i, "").replace(/\n?```\s*$/i, "");

    let parsed: {
      tasks?: Array<{
        id: string;
        title: string;
        description: string;
        checklistItems: Array<{ checklistId: string; itemId: string; title: string }>;
      }>;
      rooms?: Array<{ id: string; name: string; description: string }>;
      roomItems?: Array<{ id: string; title: string; notes: string }>;
    };

    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse translation:", cleaned);
      return jsonResponse({ error: "Invalid translation response" }, 502, req);
    }

    const now = new Date().toISOString();

    // Task upserts — rebuild checklists with translated item titles
    const taskUpserts = (parsed.tasks || []).map((tr) => {
      const originalTask = tasksToTranslate.find((t) => t.id === tr.id);
      const originalChecklists = originalTask?.checklists || [];

      const translatedChecklists = originalChecklists.map((cl) => ({
        ...cl,
        items: cl.items.map((item) => {
          const translatedItem = tr.checklistItems?.find(
            (ti) => ti.checklistId === cl.id && ti.itemId === item.id
          );
          return { ...item, title: translatedItem?.title || item.title };
        }),
      }));

      return {
        task_id: tr.id,
        language: targetLanguage,
        title: tr.title,
        description: tr.description || null,
        checklists: translatedChecklists.length > 0 ? translatedChecklists : null,
        translated_at: now,
      };
    });

    const roomUpserts = (parsed.rooms || []).map((rr) => ({
      room_id: rr.id,
      language: targetLanguage,
      name: rr.name,
      description: rr.description || null,
      translated_at: now,
    }));

    const roomItemUpserts = (parsed.roomItems || []).map((ri) => ({
      room_item_id: ri.id,
      language: targetLanguage,
      title: ri.title || null,
      notes: ri.notes || null,
      translated_at: now,
    }));

    if (taskUpserts.length > 0) {
      const { error: taskUpsertError } = await sb
        .from("task_translations")
        .upsert(taskUpserts, { onConflict: "task_id,language" });
      if (taskUpsertError) {
        console.error("Task upsert error:", taskUpsertError);
        return jsonResponse({ error: "Failed to save task translations" }, 500, req);
      }
    }

    if (roomUpserts.length > 0) {
      const { error: roomUpsertError } = await sb
        .from("room_translations")
        .upsert(roomUpserts, { onConflict: "room_id,language" });
      if (roomUpsertError) {
        console.error("Room upsert error:", roomUpsertError);
        return jsonResponse({ error: "Failed to save room translations" }, 500, req);
      }
    }

    if (roomItemUpserts.length > 0) {
      const { error: roomItemUpsertError } = await sb
        .from("room_item_translations")
        .upsert(roomItemUpserts, { onConflict: "room_item_id,language" });
      if (roomItemUpsertError) {
        console.error("Room item upsert error:", roomItemUpsertError);
        return jsonResponse({ error: "Failed to save room item translations" }, 500, req);
      }
    }

    return jsonResponse(
      {
        translatedTasks: taskUpserts.length,
        translatedRooms: roomUpserts.length,
        translatedRoomItems: roomItemUpserts.length,
      },
      200,
      req,
    );
  } catch (error) {
    console.error("translate-task-content error:", error);
    return jsonResponse({ error: (error as Error).message }, 500, req);
  }
});

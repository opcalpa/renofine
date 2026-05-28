import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
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
    const { token } = await req.json();
    if (!token || typeof token !== "string") {
      return jsonResponse({ error: "Token is required" }, 400, req);
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Validate token
    const { data: tokenRecord, error: tokenError } = await sb
      .from("worker_access_tokens")
      .select("*")
      .eq("token", token)
      .is("revoked_at", null)
      .single();

    if (tokenError || !tokenRecord) {
      return jsonResponse({ error: "not_found" }, 404, req);
    }

    if (new Date(tokenRecord.expires_at) < new Date()) {
      return jsonResponse({ error: "expired" }, 410, req);
    }

    // 2. Update last_accessed_at (best-effort, don't block response)
    await sb.from("worker_access_tokens")
      .update({ last_accessed_at: new Date().toISOString() })
      .eq("id", tokenRecord.id);

    // 3. Fetch project name
    const { data: project } = await sb
      .from("projects")
      .select("name")
      .eq("id", tokenRecord.project_id)
      .single();

    // 4. Fetch assigned tasks
    const taskIds: string[] = tokenRecord.assigned_task_ids || [];
    if (taskIds.length === 0) {
      return jsonResponse({
        projectName: project?.name || "",
        workerName: tokenRecord.worker_name,
        language: tokenRecord.worker_language,
        welcomeMessage: tokenRecord.welcome_message || null,
        canUploadPhotos: tokenRecord.can_upload_photos,
        canToggleChecklist: tokenRecord.can_toggle_checklist,
        canCreatePurchases: tokenRecord.can_create_purchases ?? true,
        canLogReceipts: tokenRecord.can_log_receipts ?? false,
        tasks: [],
      }, 200, req);
    }

    const { data: tasks } = await sb
      .from("tasks")
      .select("id, title, description, status, progress, checklists, room_id")
      .in("id", taskIds);

    // 5. Fetch rooms for those tasks
    const roomIds = [...new Set((tasks || []).map((t) => t.room_id).filter(Boolean))];
    let roomsMap: Record<string, unknown> = {};
    if (roomIds.length > 0) {
      const { data: rooms } = await sb
        .from("rooms")
        .select("id, name, description, wall_color, ceiling_color, trim_color, wall_spec, floor_spec, ceiling_spec, joinery_spec, dimensions, ceiling_height_mm")
        .in("id", roomIds);
      for (const room of rooms || []) {
        roomsMap[room.id] = room;
      }
    }

    // 5b. Fetch floor plan shapes for the project (rooms + images, for mini-map)
    const { data: floorShapes } = await sb
      .from("floor_map_shapes")
      .select("id, shape_type, shape_data, room_id, color, stroke_color")
      .eq("project_id", tokenRecord.project_id)
      .in("shape_type", ["room", "image"]);

    const floorPlanShapes = (floorShapes || [])
      .filter((s) => s.shape_type === "room")
      .map((s) => ({
        id: s.id,
        roomId: s.room_id,
        points: (s.shape_data as Record<string, unknown>)?.points || [],
        color: s.color || "rgba(59, 130, 246, 0.2)",
        strokeColor: s.stroke_color || "rgba(41, 91, 172, 0.8)",
        name: roomsMap[s.room_id as string] ? (roomsMap[s.room_id as string] as Record<string, unknown>).name : null,
      }));

    // Pick the first/largest image as background for minimap
    const imageShapes = (floorShapes || []).filter((s) => s.shape_type === "image");
    const backgroundImage = imageShapes.length > 0
      ? {
          url: (imageShapes[0].shape_data as Record<string, unknown>)?.imageUrl as string || null,
          x: ((imageShapes[0].shape_data as Record<string, unknown>)?.points as Record<string, number>)?.x
            ?? ((imageShapes[0].shape_data as Record<string, unknown>)?.coordinates as Record<string, number>)?.x
            ?? 0,
          y: ((imageShapes[0].shape_data as Record<string, unknown>)?.points as Record<string, number>)?.y
            ?? ((imageShapes[0].shape_data as Record<string, unknown>)?.coordinates as Record<string, number>)?.y
            ?? 0,
        }
      : null;

    // 5c. Fetch room photos (reference/instruction images + categorized worker photos)
    let roomPhotosMap: Record<string, unknown[]> = {};
    if (roomIds.length > 0) {
      const { data: roomPhotos } = await sb
        .from("photos")
        .select("id, url, caption, source, linked_to_id")
        .eq("linked_to_type", "room")
        .in("linked_to_id", roomIds);
      for (const p of roomPhotos || []) {
        if (!roomPhotosMap[p.linked_to_id]) roomPhotosMap[p.linked_to_id] = [];
        roomPhotosMap[p.linked_to_id].push({
          id: p.id, url: p.url, caption: p.caption, source: p.source || "upload",
        });
      }
    }

    // 5d. Fetch materials for assigned tasks and their rooms
    let materialsByRoom: Record<string, unknown[]> = {};
    {
      const { data: materials } = await sb
        .from("materials")
        .select("id, name, quantity, unit, vendor_name, room_id, task_id")
        .eq("project_id", tokenRecord.project_id)
        .or(
          roomIds.length > 0
            ? `task_id.in.(${taskIds.join(",")}),room_id.in.(${roomIds.join(",")})`
            : `task_id.in.(${taskIds.join(",")})`
        );
      for (const m of materials || []) {
        const key = m.room_id || "__task__";
        if (!materialsByRoom[key]) materialsByRoom[key] = [];
        materialsByRoom[key].push({
          id: m.id, name: m.name, quantity: m.quantity, unit: m.unit, vendorName: m.vendor_name,
        });
      }
    }

    // 5e. Fetch translations for worker's language
    const workerLang = tokenRecord.worker_language;
    let translationsMap: Record<string, { title: string; description: string | null; checklists: unknown }> = {};
    let roomTranslationsMap: Record<string, { name: string; description: string | null }> = {};
    if (workerLang && workerLang !== "en" && workerLang !== "sv") {
      const { data: translations } = await sb
        .from("task_translations")
        .select("task_id, title, description, checklists")
        .in("task_id", taskIds)
        .eq("language", workerLang);
      for (const tr of translations || []) {
        translationsMap[tr.task_id] = { title: tr.title, description: tr.description, checklists: tr.checklists };
      }

      if (roomIds.length > 0) {
        const { data: roomTrs } = await sb
          .from("room_translations")
          .select("room_id, name, description")
          .in("room_id", roomIds)
          .eq("language", workerLang);
        for (const rtr of roomTrs || []) {
          roomTranslationsMap[rtr.room_id] = { name: rtr.name, description: rtr.description };
        }
      }

      // Apply room-name translations to floor-plan shapes built earlier so
      // the minimap labels also render in the worker's language.
      for (const shape of floorPlanShapes) {
        if (shape.roomId && roomTranslationsMap[shape.roomId]?.name) {
          shape.name = roomTranslationsMap[shape.roomId].name;
        }
      }
    }

    // 6. Fetch photos for tasks
    const { data: photos } = await sb
      .from("photos")
      .select("id, url, caption, source, linked_to_id, created_at")
      .eq("linked_to_type", "task")
      .in("linked_to_id", taskIds)
      .order("created_at", { ascending: false });

    const photosByTask: Record<string, unknown[]> = {};
    for (const photo of photos || []) {
      const tid = photo.linked_to_id;
      if (!photosByTask[tid]) photosByTask[tid] = [];
      photosByTask[tid].push({ id: photo.id, url: photo.url, caption: photo.caption, source: photo.source || "upload" });
    }

    // 6b. Fetch comments (messages) for assigned tasks
    const { data: comments } = await sb
      .from("comments")
      .select("id, content, created_at, author_display_name, created_by_user_id, entity_id, images")
      .eq("entity_type", "task")
      .in("entity_id", taskIds)
      .is("parent_comment_id", null)
      .order("created_at", { ascending: true })
      .limit(200);

    // Fetch author names for non-worker messages
    const authorIds = [...new Set((comments || []).map(c => c.created_by_user_id).filter(Boolean))];
    let authorNames: Record<string, string> = {};
    if (authorIds.length > 0) {
      const { data: authors } = await sb
        .from("profiles")
        .select("id, name")
        .in("id", authorIds);
      for (const a of authors || []) {
        authorNames[a.id] = a.name || "";
      }
    }

    const messagesByTask: Record<string, unknown[]> = {};
    for (const c of comments || []) {
      const tid = c.entity_id;
      if (!messagesByTask[tid]) messagesByTask[tid] = [];
      messagesByTask[tid].push({
        id: c.id,
        content: c.content,
        createdAt: c.created_at,
        authorName: c.author_display_name || authorNames[c.created_by_user_id] || "",
        isWorker: !!(c.author_display_name && c.author_display_name.includes("(worker)")),
        images: c.images || [],
      });
    }

    // 6c. Fetch instruction overrides for this worker token
    const { data: overrides } = await sb
      .from("worker_instruction_overrides")
      .select("task_id, description_override, checklist_override, photo_override")
      .eq("worker_token_id", tokenRecord.id);

    const overridesByTask: Record<string, { description: string | null; checklists: unknown; photoOverride: string[] | null }> = {};
    for (const o of overrides || []) {
      overridesByTask[o.task_id] = {
        description: o.description_override,
        checklists: o.checklist_override,
        photoOverride: o.photo_override as string[] | null,
      };
    }

    // 6c2. Fetch instruction images for this worker token, grouped by task
    const { data: instructionImagesRaw } = await sb
      .from("worker_invite_instruction_images")
      .select("task_id, photo_id, uploaded_url, description, sort_order")
      .eq("worker_token_id", tokenRecord.id)
      .order("sort_order", { ascending: true });

    const referencedPhotoIds = Array.from(
      new Set(
        (instructionImagesRaw || [])
          .map((i) => i.photo_id)
          .filter((id): id is string => !!id),
      ),
    );

    const referencedPhotosById: Record<string, { url: string; caption: string | null }> = {};
    if (referencedPhotoIds.length > 0) {
      const { data: refPhotos } = await sb
        .from("photos")
        .select("id, url, caption")
        .in("id", referencedPhotoIds);
      for (const p of refPhotos || []) {
        referencedPhotosById[p.id] = { url: p.url, caption: p.caption };
      }
    }

    const instructionImagesByTask: Record<string, Array<{ url: string; description: string }>> = {};
    for (const row of instructionImagesRaw || []) {
      const url = row.photo_id
        ? referencedPhotosById[row.photo_id]?.url
        : row.uploaded_url;
      if (!url) continue;
      if (!instructionImagesByTask[row.task_id]) instructionImagesByTask[row.task_id] = [];
      instructionImagesByTask[row.task_id].push({
        url,
        description: row.description,
      });
    }

    // 6d. Resolve before-photos per task (task-linked + room fallback)
    // Task-linked before-photos
    const { data: taskBeforePhotos } = await sb
      .from("photos")
      .select("id, url, caption, linked_to_id")
      .eq("linked_to_type", "task")
      .eq("source", "before")
      .in("linked_to_id", taskIds);

    const taskBeforeMap: Record<string, Array<{ id: string; url: string; caption: string | null }>> = {};
    for (const p of taskBeforePhotos || []) {
      if (!taskBeforeMap[p.linked_to_id]) taskBeforeMap[p.linked_to_id] = [];
      taskBeforeMap[p.linked_to_id].push({ id: p.id, url: p.url, caption: p.caption });
    }

    // Room-linked before-photos
    let roomBeforeMap: Record<string, Array<{ id: string; url: string; caption: string | null }>> = {};
    if (roomIds.length > 0) {
      const { data: roomBeforePhotos } = await sb
        .from("photos")
        .select("id, url, caption, linked_to_id")
        .eq("linked_to_type", "room")
        .eq("source", "before")
        .in("linked_to_id", roomIds);

      for (const p of roomBeforePhotos || []) {
        if (!roomBeforeMap[p.linked_to_id]) roomBeforeMap[p.linked_to_id] = [];
        roomBeforeMap[p.linked_to_id].push({ id: p.id, url: p.url, caption: p.caption });
      }
    }

    // 7. Assemble response (use translations when available)
    const workerTasks = (tasks || []).map((task) => {
      const room = task.room_id ? roomsMap[task.room_id] as Record<string, unknown> | undefined : null;
      const tr = translationsMap[task.id];
      const taskOverride = overridesByTask[task.id];

      // Resolve before-photos: task-linked first, then room-linked (deduplicated)
      const seenPhotoIds = new Set<string>();
      const resolvedBeforePhotos: Array<{ id: string; url: string; caption: string | null }> = [];

      for (const p of taskBeforeMap[task.id] || []) {
        resolvedBeforePhotos.push(p);
        seenPhotoIds.add(p.id);
      }
      if (task.room_id) {
        for (const p of roomBeforeMap[task.room_id] || []) {
          if (!seenPhotoIds.has(p.id)) {
            resolvedBeforePhotos.push(p);
          }
        }
      }

      // Apply photo override if set
      const photoOverride = taskOverride?.photoOverride;
      const filteredBeforePhotos = photoOverride
        ? resolvedBeforePhotos.filter((p) => photoOverride.includes(p.id))
        : resolvedBeforePhotos;

      return {
        id: task.id,
        title: tr?.title || task.title,
        description: taskOverride?.description ?? tr?.description ?? task.description,
        status: task.status,
        progress: task.progress || 0,
        checklists: taskOverride?.checklists || tr?.checklists || task.checklists || [],
        photos: photosByTask[task.id] || [],
        beforePhotos: filteredBeforePhotos,
        instructionImages: instructionImagesByTask[task.id] || [],
        messages: messagesByTask[task.id] || [],
        roomId: task.room_id || null,
        room: room
          ? {
              name: (task.room_id && roomTranslationsMap[task.room_id]?.name) || room.name,
              description: (task.room_id && roomTranslationsMap[task.room_id]?.description) || room.description || null,
              wallColor: room.wall_color || null,
              ceilingColor: room.ceiling_color || null,
              trimColor: room.trim_color || null,
              wallSpec: room.wall_spec || null,
              floorSpec: room.floor_spec || null,
              ceilingSpec: room.ceiling_spec || null,
              joinerySpec: room.joinery_spec || null,
              dimensions: room.dimensions || null,
              ceilingHeightMm: room.ceiling_height_mm || null,
              photos: roomPhotosMap[room.id] || [],
              materials: materialsByRoom[room.id] || [],
            }
          : null,
      };
    });

    return jsonResponse({
      projectName: project?.name || "",
      workerName: tokenRecord.worker_name,
      language: tokenRecord.worker_language,
      welcomeMessage: tokenRecord.welcome_message || null,
      canUploadPhotos: tokenRecord.can_upload_photos,
      canToggleChecklist: tokenRecord.can_toggle_checklist,
      canCreatePurchases: tokenRecord.can_create_purchases ?? true,
      canLogReceipts: tokenRecord.can_log_receipts ?? false,
      tasks: workerTasks,
      floorPlan: floorPlanShapes.length > 0 ? floorPlanShapes : null,
      floorPlanImage: backgroundImage,
    }, 200, req);
  } catch (error) {
    console.error("get-worker-data error:", error);
    return jsonResponse({ error: error.message }, 500, req);
  }
});

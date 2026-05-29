import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RoomInstruction, RoomTask, RoomMaterial, Photo, Checklist, FloorPlanShape } from "./types";

/**
 * Fetches and groups tasks by room for the authenticated builder view.
 * Only returns rooms where the builder has assigned tasks.
 */
export function useRoomInstructionsData(projectId: string, profileId: string | null) {
  const { data, isLoading } = useQuery({
    queryKey: ["room-instructions", projectId, profileId],
    enabled: !!profileId,
    queryFn: async () => {
      // Fetch assigned tasks
      const { data: tasks } = await supabase
        .from("tasks")
        .select("id, title, description, status, progress, checklists, room_id, room_ids")
        .eq("project_id", projectId)
        .eq("assigned_to_stakeholder_id", profileId!)
        .order("created_at");

      if (!tasks?.length) return { rooms: [] as RoomInstruction[] };

      // Collect unique room IDs
      const roomIdSet = new Set<string>();
      for (const t of tasks) {
        if (t.room_ids?.length) t.room_ids.forEach((id: string) => roomIdSet.add(id));
        else if (t.room_id) roomIdSet.add(t.room_id);
      }
      const roomIds = Array.from(roomIdSet);

      // Parallel fetches
      const [roomsRes, photosRes, materialsRes, taskPhotosRes, floorPlanRes] = await Promise.all([
        roomIds.length > 0
          ? supabase.from("rooms").select("id, name, wall_color, ceiling_color, trim_color, wall_spec, floor_spec, ceiling_spec, joinery_spec, dimensions, ceiling_height_mm").in("id", roomIds)
          : { data: [] },
        roomIds.length > 0
          ? supabase.from("photos").select("id, url, caption, source, linked_to_id").eq("linked_to_type", "room").in("linked_to_id", roomIds)
          : { data: [] },
        roomIds.length > 0
          ? supabase.from("materials").select("id, name, quantity, unit, vendor_name, room_id, task_id").eq("project_id", projectId).in("room_id", roomIds)
          : { data: [] },
        supabase.from("photos").select("id, url, caption, source, linked_to_id").eq("linked_to_type", "task").in("linked_to_id", tasks.map((t) => t.id)),
        supabase.from("floor_map_shapes").select("id, room_id, points, fill_color, stroke_color, name").eq("project_id", projectId).eq("shape_type", "room"),
      ]);

      const roomMap = new Map((roomsRes.data || []).map((r) => [r.id, r]));

      // Build floor plan shapes
      const floorPlanShapes: FloorPlanShape[] = (floorPlanRes.data || []).map((s) => ({
        id: s.id,
        roomId: s.room_id,
        points: Array.isArray(s.points) ? s.points as Array<{ x: number; y: number }> : [],
        color: s.fill_color || "#e5e7eb",
        strokeColor: s.stroke_color || "#9ca3af",
        name: s.name,
      }));

      // Categorize room photos: reference vs progress vs completed
      const roomRefPhotos = new Map<string, Photo[]>();
      const roomProgressPhotos = new Map<string, Photo[]>();
      const roomCompletedPhotos = new Map<string, Photo[]>();
      for (const p of (photosRes.data || [])) {
        const photo: Photo = { id: p.id, url: p.url, caption: p.caption, source: p.source || undefined };
        if (p.source === "worker_progress") {
          const arr = roomProgressPhotos.get(p.linked_to_id) || [];
          arr.push(photo);
          roomProgressPhotos.set(p.linked_to_id, arr);
        } else if (p.source === "worker_completed") {
          const arr = roomCompletedPhotos.get(p.linked_to_id) || [];
          arr.push(photo);
          roomCompletedPhotos.set(p.linked_to_id, arr);
        } else {
          const arr = roomRefPhotos.get(p.linked_to_id) || [];
          arr.push(photo);
          roomRefPhotos.set(p.linked_to_id, arr);
        }
      }
      const taskPhotoMap = new Map<string, Photo[]>();
      for (const p of (taskPhotosRes.data || [])) {
        const arr = taskPhotoMap.get(p.linked_to_id) || [];
        arr.push({ id: p.id, url: p.url, caption: p.caption, source: p.source || undefined });
        taskPhotoMap.set(p.linked_to_id, arr);
      }
      const materialsByRoom = new Map<string, RoomMaterial[]>();
      for (const m of (materialsRes.data || [])) {
        const key = m.room_id || "__none__";
        const arr = materialsByRoom.get(key) || [];
        arr.push({ id: m.id, name: m.name, quantity: m.quantity, unit: m.unit, vendorName: m.vendor_name });
        materialsByRoom.set(key, arr);
      }

      // Group tasks by room
      const roomTaskMap = new Map<string, RoomTask[]>();
      for (const t of tasks) {
        const ids = t.room_ids?.length ? t.room_ids : (t.room_id ? [t.room_id] : []);
        const checklists: Checklist[] = Array.isArray(t.checklists) ? t.checklists as Checklist[] : [];
        const roomTask: RoomTask = {
          id: t.id,
          title: t.title,
          description: t.description,
          status: t.status,
          progress: t.progress || 0,
          checklists,
          photos: taskPhotoMap.get(t.id) || [],
          instructionImages: [],
          messages: [],
        };
        for (const rid of ids) {
          const arr = roomTaskMap.get(rid) || [];
          arr.push(roomTask);
          roomTaskMap.set(rid, arr);
        }
        if (ids.length === 0) {
          const arr = roomTaskMap.get("__none__") || [];
          arr.push(roomTask);
          roomTaskMap.set("__none__", arr);
        }
      }

      // Build room instructions
      const rooms: RoomInstruction[] = [];
      for (const [rid, rtasks] of roomTaskMap) {
        const dbRoom = roomMap.get(rid);
        const totalItems = rtasks.reduce((sum, t) => sum + t.checklists.reduce((s, cl) => s + cl.items.length, 0), 0);
        const completedItems = rtasks.reduce((sum, t) => sum + t.checklists.reduce((s, cl) => s + cl.items.filter((i) => i.completed).length, 0), 0);
        // Fallback: count done tasks if no checklists
        const completedTasks = rtasks.filter((t) => t.status === "completed").length;

        rooms.push({
          id: rid,
          name: dbRoom?.name || "",
          wallColor: dbRoom?.wall_color || null,
          ceilingColor: dbRoom?.ceiling_color || null,
          trimColor: dbRoom?.trim_color || null,
          wallSpec: dbRoom?.wall_spec as RoomInstruction["wallSpec"],
          floorSpec: dbRoom?.floor_spec as RoomInstruction["floorSpec"],
          ceilingSpec: dbRoom?.ceiling_spec as RoomInstruction["ceilingSpec"],
          joinerySpec: dbRoom?.joinery_spec as RoomInstruction["joinerySpec"],
          dimensions: dbRoom?.dimensions as RoomInstruction["dimensions"],
          referencePhotos: roomRefPhotos.get(rid) || [],
          progressPhotos: roomProgressPhotos.get(rid) || [],
          completedPhotos: roomCompletedPhotos.get(rid) || [],
          tasks: rtasks,
          materials: materialsByRoom.get(rid) || [],
          progress: {
            completed: totalItems > 0 ? completedItems : completedTasks,
            total: totalItems > 0 ? totalItems : rtasks.length,
          },
        });
      }

      // Sort: rooms with work remaining first
      rooms.sort((a, b) => {
        const aPct = a.progress.total > 0 ? a.progress.completed / a.progress.total : 0;
        const bPct = b.progress.total > 0 ? b.progress.completed / b.progress.total : 0;
        return aPct - bPct;
      });

      return { rooms, floorPlanShapes };
    },
    staleTime: 30_000,
  });

  return { rooms: data?.rooms || [], floorPlanShapes: data?.floorPlanShapes || [], isLoading };
}

/**
 * Build RoomInstruction[] from already-fetched WorkerView data.
 * Groups flat task list by room.
 */
export function groupWorkerTasksByRoom(
  tasks: Array<{
    id: string;
    title: string;
    description: string | null;
    status: string;
    progress: number;
    checklists: Array<{ id: string; title: string; items: Array<{ id: string; title: string; completed: boolean }> }>;
    photos: Array<{ id: string; url: string; caption: string | null; source?: string }>;
    instructionImages?: Array<{ url: string; description: string }>;
    roomId: string | null;
    room: {
      name: string;
      wallColor?: string | null;
      ceilingColor?: string | null;
      trimColor?: string | null;
      wallSpec: unknown;
      floorSpec: unknown;
      ceilingSpec: unknown;
      joinerySpec: unknown;
      dimensions: { area_sqm?: number; ceiling_height_mm?: number } | null;
      ceilingHeightMm: number | null;
      photos?: Array<{ id: string; url: string; caption: string | null; source?: string }>;
      materials?: Array<{ id: string; name: string; quantity: number; unit: string; vendorName: string | null }>;
    } | null;
    requiresCompletionPhoto?: boolean;
  }>
): RoomInstruction[] {
  const map = new Map<string, { room: typeof tasks[0]["room"]; tasks: RoomTask[] }>();

  for (const t of tasks) {
    const key = t.roomId || "__none__";
    if (!map.has(key)) {
      map.set(key, { room: t.room, tasks: [] });
    }
    map.get(key)!.tasks.push({
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      progress: t.progress,
      checklists: t.checklists,
      photos: t.photos,
      instructionImages: t.instructionImages || [],
      messages: (t as unknown as { messages?: RoomTask["messages"] }).messages || [],
      requiresCompletionPhoto: t.requiresCompletionPhoto,
    });
  }

  const rooms: RoomInstruction[] = [];
  for (const [key, { room, tasks: rtasks }] of map) {
    const totalItems = rtasks.reduce((sum, t) => sum + t.checklists.reduce((s, cl) => s + cl.items.length, 0), 0);
    const completedItems = rtasks.reduce((sum, t) => sum + t.checklists.reduce((s, cl) => s + cl.items.filter((i) => i.completed).length, 0), 0);
    const completedTasks = rtasks.filter((t) => t.status === "completed").length;

    // Categorize room photos from edge function
    const roomPhotos = room?.photos || [];
    const refPhotos = roomPhotos.filter((p) => p.source !== "worker_progress" && p.source !== "worker_completed");
    const progPhotos = roomPhotos.filter((p) => p.source === "worker_progress");
    const compPhotos = roomPhotos.filter((p) => p.source === "worker_completed");

    rooms.push({
      id: key,
      name: room?.name || "",
      wallColor: room?.wallColor || null,
      ceilingColor: room?.ceilingColor || null,
      trimColor: room?.trimColor || null,
      wallSpec: room?.wallSpec as RoomInstruction["wallSpec"],
      floorSpec: room?.floorSpec as RoomInstruction["floorSpec"],
      ceilingSpec: room?.ceilingSpec as RoomInstruction["ceilingSpec"],
      joinerySpec: room?.joinerySpec as RoomInstruction["joinerySpec"],
      dimensions: room?.dimensions || null,
      referencePhotos: refPhotos,
      progressPhotos: progPhotos,
      completedPhotos: compPhotos,
      tasks: rtasks,
      materials: room?.materials || [],
      progress: {
        completed: totalItems > 0 ? completedItems : completedTasks,
        total: totalItems > 0 ? totalItems : rtasks.length,
      },
    });
  }

  rooms.sort((a, b) => {
    const aPct = a.progress.total > 0 ? a.progress.completed / a.progress.total : 0;
    const bPct = b.progress.total > 0 ? b.progress.completed / b.progress.total : 0;
    return aPct - bPct;
  });

  return rooms;
}

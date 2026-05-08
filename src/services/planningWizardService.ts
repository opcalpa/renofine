import { supabase } from "@/integrations/supabase/client";
import { workTypeToCostCenter, getWorkTypeLabel } from "./workTypeUtils";
import type { WorkType } from "./workTypeUtils";
import type { PlanningWizardData } from "@/components/project/overview/planning-wizard/types";
import { saveGuestRoom, saveGuestTask } from "./guestStorageService";
import {
  detectRecipeKey,
  suggestMaterialsMultiRoom,
  parseEstimationSettings,
  type RecipeRoom,
  type RecipeEstimationSettings,
} from "@/lib/materialRecipes";

/**
 * Populate an existing project with rooms and tasks from the planning wizard.
 * Follows the same pattern as createProjectFromGuidedSetup but operates on an
 * existing project (homeowner already created it).
 */
export async function populateProjectFromPlanningWizard(
  projectId: string,
  data: PlanningWizardData,
  profileId: string,
  translateWorkType?: (wt: WorkType) => string
): Promise<{ roomCount: number; taskCount: number }> {
  const wtLabel = (wt: WorkType) => translateWorkType?.(wt) ?? getWorkTypeLabel(wt);
  const roomNameToId = new Map<string, string>();
  let taskCount = 0;

  // 1. Create rooms with optional dimensions
  for (const room of data.rooms) {
    const dimensions: Record<string, number> = {};
    if (room.area_sqm) dimensions.area_sqm = room.area_sqm;
    if (room.width_m) dimensions.width_mm = Math.round(room.width_m * 1000);
    if (room.depth_m) dimensions.height_mm = Math.round(room.depth_m * 1000);

    const { data: created, error } = await supabase
      .from("rooms")
      .insert({
        project_id: projectId,
        name: room.name,
        ceiling_height_mm: room.ceiling_height_m ? Math.round(room.ceiling_height_m * 1000) : null,
        dimensions: Object.keys(dimensions).length > 0 ? dimensions : null,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Failed to create room:", error);
      continue;
    }
    roomNameToId.set(room.id, created.id);
  }

  // 2. Global work types → ONE task per type, linked to ALL applicable rooms via room_ids
  //    with checklist items per room for tracking
  for (const workType of data.globalWorkTypes) {
    const applicableRooms = data.rooms.filter((room) => {
      const excluded = data.roomSpecificWork[room.id]?.excludedGlobals ?? [];
      return !excluded.includes(workType);
    });
    if (applicableRooms.length === 0) continue;

    const roomIds = applicableRooms
      .map((r) => roomNameToId.get(r.id))
      .filter(Boolean) as string[];

    // Create checklist with one item per room
    const checklist = {
      id: crypto.randomUUID(),
      title: wtLabel(workType),
      items: applicableRooms.map((r) => ({
        id: crypto.randomUUID(),
        title: r.name,
        completed: false,
      })),
    };

    const { error } = await supabase.from("tasks").insert({
      project_id: projectId,
      room_id: roomIds[0], // primary room
      room_ids: roomIds,
      title: wtLabel(workType),
      description: applicableRooms.map((r) => r.name).join(", "),
      status: "planned",
      priority: "medium",
      cost_center: workTypeToCostCenter(workType),
      created_by_user_id: profileId,
      checklists: [checklist],
    });
    if (!error) taskCount++;
  }

  // 3. Room-specific work types → one task per room-workType combo
  for (const room of data.rooms) {
    const dbRoomId = roomNameToId.get(room.id);
    if (!dbRoomId) continue;

    const specific = data.roomSpecificWork[room.id];
    if (!specific) continue;

    // Room-specific work types (excluding globals)
    for (const workType of specific.workTypes) {
      if (data.globalWorkTypes.includes(workType)) continue; // already handled globally
      const { error } = await supabase.from("tasks").insert({
        project_id: projectId,
        room_id: dbRoomId,
        title: `${wtLabel(workType)} - ${room.name}`,
        status: "planned",
        priority: "medium",
        cost_center: workTypeToCostCenter(workType),
        created_by_user_id: profileId,
      });
      if (!error) taskCount++;
    }

    // Free-text description → general task for this room
    if (specific.description?.trim()) {
      const desc = specific.description.trim();
      const { error } = await supabase.from("tasks").insert({
        project_id: projectId,
        room_id: dbRoomId,
        title: room.name,
        description: desc,
        status: "planned",
        priority: "medium",
        cost_center: "other",
        created_by_user_id: profileId,
      });
      if (!error) taskCount++;
    }
  }

  // 4. Auto-generate material estimates for recipe-eligible tasks
  await autoGenerateMaterials(projectId, profileId);

  return { roomCount: data.rooms.length, taskCount };
}

/**
 * Guest-mode variant: populate a localStorage-backed project from the planning wizard.
 * Mirrors populateProjectFromPlanningWizard but uses guestStorageService helpers.
 * No materials auto-generation (guest model has no materials table) and no checklists
 * (GuestTask doesn't carry that field).
 */
export function populateGuestProjectFromPlanningWizard(
  projectId: string,
  data: PlanningWizardData,
  translateWorkType?: (wt: WorkType) => string
): { roomCount: number; taskCount: number } {
  const wtLabel = (wt: WorkType) => translateWorkType?.(wt) ?? getWorkTypeLabel(wt);
  const roomNameToId = new Map<string, string>();
  let taskCount = 0;

  // 1. Create rooms
  for (const room of data.rooms) {
    const saved = saveGuestRoom(projectId, {
      name: room.name,
      room_type: null,
      status: "existing",
      area_sqm: room.area_sqm ?? null,
      floor_number: null,
      notes: null,
      width_mm: room.width_m ? Math.round(room.width_m * 1000) : null,
      height_mm: room.depth_m ? Math.round(room.depth_m * 1000) : null,
      ceiling_height_mm: room.ceiling_height_m ? Math.round(room.ceiling_height_m * 1000) : null,
    });
    if (saved) roomNameToId.set(room.id, saved.id);
  }

  // 2. Global work types → ONE task per type (guest model can't link to multiple rooms,
  //    so we put applicable rooms in the description and link to the first one)
  for (const workType of data.globalWorkTypes) {
    const applicableRooms = data.rooms.filter((room) => {
      const excluded = data.roomSpecificWork[room.id]?.excludedGlobals ?? [];
      return !excluded.includes(workType);
    });
    if (applicableRooms.length === 0) continue;

    const primaryRoomId = roomNameToId.get(applicableRooms[0].id) ?? null;
    const saved = saveGuestTask(projectId, {
      room_id: primaryRoomId,
      title: wtLabel(workType),
      description: applicableRooms.map((r) => r.name).join(", "),
      status: "to_do",
      priority: "medium",
      due_date: null,
    });
    if (saved) taskCount++;
  }

  // 3. Room-specific work types → one task per room-workType combo
  for (const room of data.rooms) {
    const guestRoomId = roomNameToId.get(room.id);
    if (!guestRoomId) continue;

    const specific = data.roomSpecificWork[room.id];
    if (!specific) continue;

    for (const workType of specific.workTypes) {
      if (data.globalWorkTypes.includes(workType)) continue;
      const saved = saveGuestTask(projectId, {
        room_id: guestRoomId,
        title: `${wtLabel(workType)} - ${room.name}`,
        description: null,
        status: "to_do",
        priority: "medium",
        due_date: null,
      });
      if (saved) taskCount++;
    }

    if (specific.description?.trim()) {
      const saved = saveGuestTask(projectId, {
        room_id: guestRoomId,
        title: room.name,
        description: specific.description.trim(),
        status: "to_do",
        priority: "medium",
        due_date: null,
      });
      if (saved) taskCount++;
    }
  }

  return { roomCount: data.rooms.length, taskCount };
}

/**
 * Auto-generate planned material entries for tasks with detectable recipes
 * (painting, flooring, tiling) based on linked room dimensions.
 */
export async function autoGenerateMaterials(
  projectId: string,
  profileId: string
): Promise<void> {
  // Fetch tasks and rooms for this project
  const [tasksRes, roomsRes, profileRes] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, cost_center, room_id, room_ids")
      .eq("project_id", projectId),
    supabase
      .from("rooms")
      .select("id, dimensions, ceiling_height_mm")
      .eq("project_id", projectId),
    supabase
      .from("profiles")
      .select("estimation_settings")
      .eq("id", profileId)
      .single(),
  ]);

  const tasks = tasksRes.data || [];
  const rooms = roomsRes.data || [];
  const settings = parseEstimationSettings(
    (profileRes.data?.estimation_settings as Record<string, unknown>) ?? null
  );

  const roomMap = new Map(
    rooms.map((r) => [
      r.id,
      {
        dimensions: r.dimensions as RecipeRoom["dimensions"],
        ceiling_height_mm: r.ceiling_height_mm,
      } satisfies RecipeRoom,
    ])
  );

  for (const task of tasks) {
    const recipeKey = detectRecipeKey({
      cost_center: task.cost_center,
      title: task.title,
    });
    if (!recipeKey) continue;

    // Gather linked rooms
    const roomIds: string[] =
      task.room_ids && task.room_ids.length > 0
        ? task.room_ids
        : task.room_id
          ? [task.room_id]
          : [];

    const taskRooms = roomIds
      .map((id) => roomMap.get(id))
      .filter(Boolean) as RecipeRoom[];

    if (taskRooms.length === 0) continue;

    const suggestions = suggestMaterialsMultiRoom(
      { cost_center: task.cost_center, title: task.title },
      taskRooms,
      settings
    );

    for (const s of suggestions) {
      await supabase.from("materials").insert({
        project_id: projectId,
        task_id: task.id,
        room_id: roomIds[0] || null,
        name: s.nameFallback,
        quantity: s.quantity,
        unit: s.unit,
        price_per_unit: s.unitPrice,
        price_total: s.totalCost,
        status: "planned",
        created_by_user_id: profileId,
        description: s.formula,
      });
    }
  }
}

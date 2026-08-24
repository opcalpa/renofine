// ---------------------------------------------------------------------------
// RFQ Clone — copies a homeowner's project scope into a new builder project
// ---------------------------------------------------------------------------

import { supabase } from "@/integrations/supabase/client";
import { linkNewProjectToProperty } from "@/services/propertyService";

interface CloneResult {
  projectId: string;
  tasksCloned: number;
  roomsCloned: number;
}

/**
 * Clone a homeowner RFQ project into a new builder project.
 *
 * Copies: project metadata, rooms (with dimensions), tasks (scope only, no pricing).
 * The new project gets `source_rfq_project_id` pointing back to the original.
 * The builder is set as owner; the homeowner is added as a client share.
 */
export async function cloneRfqForBuilder(
  sourceProjectId: string,
  builderProfileId: string
): Promise<CloneResult> {
  // 1. Fetch source project
  const { data: source, error: projErr } = await supabase
    .from("projects")
    .select("name, description, address, postal_code, city, project_type, start_date, finish_goal_date, property_designation, owner_id")
    .eq("id", sourceProjectId)
    .single();

  if (projErr || !source) throw new Error("Could not read source project");

  // 2. Create builder's project
  const { data: newProject, error: createErr } = await supabase
    .from("projects")
    .insert({
      name: source.name,
      description: source.description,
      address: source.address,
      postal_code: source.postal_code,
      city: source.city,
      project_type: source.project_type,
      start_date: source.start_date,
      finish_goal_date: source.finish_goal_date,
      property_designation: source.property_designation,
      owner_id: builderProfileId,
      status: "planning",
      source_rfq_project_id: sourceProjectId,
    })
    .select("id")
    .single();

  if (createErr || !newProject) throw new Error("Could not create project");

  // The builder's clone is a project at the customer's address — give it its
  // own property in the builder's account (best effort).
  await linkNewProjectToProperty(newProject.id, {
    ownerProfileId: builderProfileId,
    address: source.address,
    postalCode: source.postal_code,
    city: source.city,
    propertyDesignation: source.property_designation,
    fallbackName: source.name,
  });
  const newProjectId = newProject.id;

  // 3. Clone rooms — map old IDs to new IDs for task linking
  const { data: rooms, error: roomReadErr } = await supabase
    .from("rooms")
    .select("id, name, dimensions, description, floor_plan_position")
    .eq("project_id", sourceProjectId)
    .order("created_at", { ascending: true });

  if (roomReadErr) {
    console.error("RFQ clone: failed to read rooms", roomReadErr);
  }

  const roomIdMap = new Map<string, string>();
  let roomsCloned = 0;

  if (rooms && rooms.length > 0) {
    for (const room of rooms) {
      const { data: newRoom, error: roomInsertErr } = await supabase
        .from("rooms")
        .insert({
          project_id: newProjectId,
          name: room.name,
          dimensions: room.dimensions,
          description: room.description,
          floor_plan_position: room.floor_plan_position,
        })
        .select("id")
        .single();

      if (roomInsertErr) {
        console.error("RFQ clone: failed to insert room", room.name, roomInsertErr);
      }
      if (newRoom) {
        roomIdMap.set(room.id, newRoom.id);
        roomsCloned++;
      }
    }
  }

  // 4. Clone tasks — scope only (title, description, room links, cost_center)
  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, description, room_id, room_ids, cost_center")
    .eq("project_id", sourceProjectId)
    .order("created_at", { ascending: true });

  let tasksCloned = 0;

  if (tasks && tasks.length > 0) {
    for (const task of tasks) {
      const newRoomId = task.room_id ? roomIdMap.get(task.room_id) ?? null : null;
      const newRoomIds = task.room_ids
        ? (task.room_ids as string[]).map((id) => roomIdMap.get(id) ?? id).filter(Boolean)
        : null;

      const { error: taskErr } = await supabase
        .from("tasks")
        .insert({
          project_id: newProjectId,
          created_by_user_id: builderProfileId,
          title: task.title,
          description: task.description,
          room_id: newRoomId,
          room_ids: newRoomIds,
          cost_center: task.cost_center,
          status: "to_do",
        });

      if (!taskErr) tasksCloned++;
    }
  }

  // 5. Homeowner is NOT added here — builder works privately.
  // When builder sends the quote, the existing quote-sending flow
  // (intakeService.inviteCustomerAsClient) adds the homeowner at that point.

  return { projectId: newProjectId, tasksCloned, roomsCloned };
}

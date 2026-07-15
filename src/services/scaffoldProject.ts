import { supabase } from "@/integrations/supabase/client";

/**
 * scaffoldProject — ONE documented engine for creating a whole project from
 * structured data (project + rooms + tasks + materials).
 *
 * WHY: project creation was scattered across ≥4 call sites (intakeService,
 * AIProjectImportModal, PlanningSmartImportDialog, QuoteReviewDialog), each
 * hand-rolling its own inserts + roomName→id resolution. That duplication is a
 * single-source-of-truth violation and blocks an agent (Renaida) from driving
 * project creation cleanly. This is the shared destination those callers — and a
 * future folder-ingest / Renaida-driven flow — all funnel into.
 *
 * CONTRACT: callers pass ALREADY-NORMALIZED values (e.g. costs ex VAT, final
 * task titles, pre-built `dimensions` objects). The engine owns the insert
 * mechanics + room→task resolution + a self-explaining `decisions[]` result — it
 * does NOT reinterpret the caller's domain choices. Behaviour matches the
 * existing insert shapes exactly, so migrating a call site is a no-op refactor.
 *
 * Errors: the project insert throws (a project that can't be created is fatal).
 * Room/task/material inserts are best-effort per row (logged + skipped), matching
 * the pre-existing behaviour of every current caller.
 */

export interface ScaffoldMaterialInput {
  name: string;
  description?: string | null;
  /** Total price, ex VAT (caller converts before passing). */
  priceTotalExVat?: number | null;
  /** Defaults to "planned". */
  status?: string;
}

export interface ScaffoldRoomInput {
  name: string;
  description?: string | null;
  ceilingHeightMm?: number | null;
  /** Pre-built dimensions object (callers use different key shapes). */
  dimensions?: Record<string, number> | null;
}

export interface ScaffoldTaskInput {
  /** Final title — the engine does NOT append room names or transform it. */
  title: string;
  description?: string | null;
  /** Resolved to room_id within this batch (case-insensitive). */
  roomName?: string | null;
  /** Defaults to "planned". */
  status?: string;
  /** Defaults to "medium". */
  priority?: string;
  costCenter?: string | null;
  taskCostType?: string | null;
  subcontractorCost?: number | null;
  hourlyRate?: number | null;
  estimatedHours?: number | null;
  materialEstimate?: number | null;
  budget?: number | null;
  rotEligible?: boolean;
  rotAmount?: number | null;
  /** Task-linked planned materials. */
  materials?: ScaffoldMaterialInput[];
}

export interface ScaffoldProjectInput {
  project: {
    name: string;
    description?: string | null;
    address?: string | null;
    postalCode?: string | null;
    city?: string | null;
    /** Defaults to "SE". */
    country?: string | null;
    /** Defaults to "planning". */
    status?: string;
    totalBudget?: number | null;
  };
  rooms: ScaffoldRoomInput[];
  tasks: ScaffoldTaskInput[];
  /** Materials not linked to any task. */
  standaloneMaterials?: ScaffoldMaterialInput[];
  /** Set profiles.onboarding_created_project = true after creation. */
  markOnboardingComplete?: boolean;
}

export interface ScaffoldDecision {
  kind: "project" | "room" | "task" | "material" | "skip";
  label: string;
}

export interface ScaffoldResult {
  projectId: string;
  /** roomName (lowercased) → room id, for callers that link files/materials after. */
  roomIds: Map<string, string>;
  taskIds: string[];
  materialCount: number;
  /** Self-explaining: what was created (and what was skipped, and why). */
  decisions: ScaffoldDecision[];
}

async function insertMaterial(
  projectId: string,
  taskId: string | null,
  roomId: string | null,
  mat: ScaffoldMaterialInput,
  creatorProfileId: string
): Promise<boolean> {
  const { error } = await supabase.from("materials").insert({
    project_id: projectId,
    task_id: taskId,
    room_id: roomId,
    name: mat.name,
    description: mat.description ?? null,
    price_total: mat.priceTotalExVat ?? null,
    status: mat.status ?? "planned",
    created_by_user_id: creatorProfileId,
  });
  if (error) {
    console.error("scaffoldProject: failed to create material:", error);
    return false;
  }
  return true;
}

export async function scaffoldProject(
  input: ScaffoldProjectInput,
  creatorProfileId: string
): Promise<ScaffoldResult> {
  const decisions: ScaffoldDecision[] = [];

  // 1. Create project (fatal on failure — mirrors every existing caller)
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      name: input.project.name,
      description: input.project.description ?? null,
      owner_id: creatorProfileId,
      address: input.project.address ?? null,
      postal_code: input.project.postalCode ?? null,
      city: input.project.city ?? null,
      country: input.project.country ?? "SE",
      status: input.project.status ?? "planning",
      total_budget: input.project.totalBudget ?? null,
    })
    .select("id")
    .single();

  if (projectError || !project) {
    console.error("scaffoldProject: failed to create project:", projectError);
    throw new Error(projectError?.message || "Failed to create project");
  }
  const projectId = project.id;
  decisions.push({ kind: "project", label: input.project.name });

  // 2. Create rooms (best-effort), building a name→id map
  const roomIds = new Map<string, string>();
  for (const room of input.rooms) {
    const { data, error } = await supabase
      .from("rooms")
      .insert({
        project_id: projectId,
        name: room.name,
        description: room.description ?? null,
        ceiling_height_mm: room.ceilingHeightMm ?? null,
        dimensions: room.dimensions ?? null,
      })
      .select("id")
      .single();

    if (error || !data) {
      console.error("scaffoldProject: failed to create room:", error);
      decisions.push({ kind: "skip", label: `Rum: ${room.name}` });
      continue;
    }
    roomIds.set(room.name.toLowerCase(), data.id);
    decisions.push({ kind: "room", label: room.name });
  }

  // 3. Create tasks (best-effort) + their linked materials
  const taskIds: string[] = [];
  let materialCount = 0;
  for (const task of input.tasks) {
    const roomId = task.roomName ? roomIds.get(task.roomName.toLowerCase()) ?? null : null;

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        project_id: projectId,
        room_id: roomId,
        title: task.title,
        description: task.description ?? null,
        status: task.status ?? "planned",
        priority: task.priority ?? "medium",
        created_by_user_id: creatorProfileId,
        cost_center: task.costCenter ?? null,
        task_cost_type: task.taskCostType ?? null,
        subcontractor_cost: task.subcontractorCost ?? null,
        hourly_rate: task.hourlyRate ?? null,
        estimated_hours: task.estimatedHours ?? null,
        material_estimate: task.materialEstimate ?? null,
        budget: task.budget ?? null,
        rot_eligible: task.rotEligible ?? false,
        rot_amount: task.rotAmount ?? null,
      })
      .select("id")
      .single();

    if (error || !data) {
      console.error("scaffoldProject: failed to create task:", error);
      decisions.push({ kind: "skip", label: `Arbete: ${task.title}` });
      continue;
    }
    taskIds.push(data.id);
    decisions.push({ kind: "task", label: task.title });

    for (const mat of task.materials ?? []) {
      if (await insertMaterial(projectId, data.id, roomId, mat, creatorProfileId)) {
        materialCount++;
        decisions.push({ kind: "material", label: mat.name });
      }
    }
  }

  // 4. Standalone materials (not linked to a task)
  for (const mat of input.standaloneMaterials ?? []) {
    if (await insertMaterial(projectId, null, null, mat, creatorProfileId)) {
      materialCount++;
      decisions.push({ kind: "material", label: mat.name });
    }
  }

  // 5. Mark onboarding step complete (best-effort)
  if (input.markOnboardingComplete) {
    await supabase
      .from("profiles")
      .update({ onboarding_created_project: true })
      .eq("id", creatorProfileId);
  }

  return { projectId, roomIds, taskIds, materialCount, decisions };
}

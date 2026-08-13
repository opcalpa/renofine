/**
 * Manual project activation — the single source (R3).
 *
 * "Activate" flips a project out of the planning phase into execution:
 *   1. projects.status → 'active'
 *   2. planned tasks → 'to_do' (so they surface on the kanban)
 *   3. materialize each planned task's material_items / material_estimate into
 *      real planned `materials` rows (skipping tasks that already have one)
 *   4. fold subcontractor (UE) sentinel materials into task fields — task-linked
 *      rows merge into subcontractor_cost, standalone rows become new task cards
 *      — then delete the sentinels.
 *
 * This was copy-pasted verbatim in PlanningTaskList.handleActivateProject and
 * HomeownerPlanningView.handleActivate (~130 lines each, drift risk). Both now
 * call this. Extraction is byte-for-byte (like importPurchaseOrder out of
 * applyProposals): the initial status update throws (a project that can't be
 * activated is fatal); the rest is best-effort, matching the original behavior.
 *
 * NOTE: this is the MANUAL activation. Quote-accept activation is a different
 * path (quoteService.createTasksFromQuote merges quote lines onto tasks) plus
 * the handle_quote_status_project_sync DB trigger — not consolidated here.
 */
import { supabase } from "@/integrations/supabase/client";

export async function activateProject(projectId: string): Promise<void> {
  const { error } = await supabase
    .from("projects")
    .update({ status: "active" })
    .eq("id", projectId);
  if (error) throw error;

  // Resolve the caller's profile id for created_by on any new rows.
  const { data: authData } = await supabase.auth.getUser();
  const { data: profileRow } = authData?.user
    ? await supabase.from("profiles").select("id").eq("user_id", authData.user.id).single()
    : { data: null };
  const creatorId = profileRow?.id ?? null;

  // Transition planned tasks to to_do so they appear in kanban
  const { data: plannedTasks } = await supabase
    .from("tasks")
    .select("id, title, material_estimate, material_items")
    .eq("project_id", projectId)
    .eq("status", "planned");

  if (plannedTasks && plannedTasks.length > 0) {
    await supabase
      .from("tasks")
      .update({ status: "to_do" })
      .in("id", plannedTasks.map((t) => t.id));

    // Create planned material rows for tasks with material_estimate but no existing planned materials
    const { data: existingMats } = await supabase
      .from("materials")
      .select("task_id, description")
      .eq("project_id", projectId)
      .eq("status", "planned")
      .not("task_id", "is", null);
    const tasksWithPlannedMat = new Set(
      (existingMats || []).filter((m) => m.description !== "__subcontractor__").map((m) => m.task_id)
    );

    const materialsToInsert: Record<string, unknown>[] = [];
    for (const task of plannedTasks) {
      if (tasksWithPlannedMat.has(task.id)) continue;
      const items = task.material_items as { amount: number; quantity?: number; unit?: string; unit_price?: number }[] | null;
      if (items && items.length > 0) {
        for (const item of items) {
          if (!item.amount || item.amount <= 0) continue;
          materialsToInsert.push({
            id: crypto.randomUUID(),
            name: `${task.title} — material`,
            quantity: item.quantity ?? 1,
            unit: item.unit ?? "st",
            price_per_unit: item.unit_price ?? item.amount,
            price_total: item.amount,
            task_id: task.id,
            project_id: projectId,
            status: "planned",
            exclude_from_budget: false,
            created_by_user_id: creatorId,
          });
        }
      } else if (task.material_estimate && task.material_estimate > 0) {
        materialsToInsert.push({
          id: crypto.randomUUID(),
          name: `${task.title} — material`,
          quantity: 1,
          unit: "st",
          price_per_unit: task.material_estimate,
          price_total: task.material_estimate,
          task_id: task.id,
          project_id: projectId,
          status: "planned",
          exclude_from_budget: false,
          created_by_user_id: creatorId,
        });
      }
    }
    if (materialsToInsert.length > 0) {
      await supabase.from("materials").insert(materialsToInsert);
    }
  }

  // Convert UE (subcontractor) material rows into proper task cards
  const { data: ueMaterials } = await supabase
    .from("materials")
    .select("id, name, task_id, price_total, markup_percent, room_id")
    .eq("project_id", projectId)
    .eq("status", "planned")
    .eq("description", "__subcontractor__");

  if (ueMaterials && ueMaterials.length > 0) {
    // Task-linked UE: merge cost into task's subcontractor_cost
    const taskLinked = ueMaterials.filter((m) => m.task_id);
    const costByTask = new Map<string, number>();
    for (const m of taskLinked) {
      const amount = (m.price_total || 0) * (1 + (m.markup_percent || 0) / 100);
      costByTask.set(m.task_id!, (costByTask.get(m.task_id!) || 0) + amount);
    }
    for (const [taskId, cost] of costByTask) {
      await supabase
        .from("tasks")
        .update({ subcontractor_cost: cost, task_cost_type: "subcontractor" })
        .eq("id", taskId);
    }

    // Standalone UE (no task_id): create new task cards
    const standalone = ueMaterials.filter((m) => !m.task_id);
    if (standalone.length > 0) {
      const newTasks = standalone.map((m) => ({
        id: crypto.randomUUID(),
        project_id: projectId,
        title: m.name,
        status: "to_do",
        priority: "medium",
        task_cost_type: "subcontractor",
        subcontractor_cost: (m.price_total || 0) * (1 + (m.markup_percent || 0) / 100),
        room_id: m.room_id ?? null,
        created_by_user_id: creatorId,
      }));
      await supabase.from("tasks").insert(newTasks);
    }

    // Delete all UE sentinel rows — their data is now on tasks
    await supabase
      .from("materials")
      .delete()
      .in("id", ueMaterials.map((m) => m.id));
  }
}

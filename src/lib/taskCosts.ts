// ============================================================================
// taskCosts.ts — bryggan mot task_costs
// ============================================================================
// Byggarens kostnadsbas och påslag bor i EN egen tabell (`task_costs`) med egen
// RLS, just för att RLS är radbaserad: låg de här fälten kvar på `tasks` följde
// de med varje rad ut till en inbjuden kund. Se migration
// 20260825120000_task_costs_boundary.sql.
//
// Den här filen finns för att gränsen ska kosta så lite som möjligt i UI:t.
// Konsumenter fortsätter läsa `task.markup_percent` som förut — hämtlagret
// hydrerar fälten via en PostgREST-embed, och skrivlagret delar upp en patch i
// "det som hör till tasks" och "det som hör till task_costs".
//
// Regel: lägg ALDRIG tillbaka ett kostnadsfält i en tasks-insert/update. Går
// den vägen tillbaka öppnas läckan igen, tyst.
// ============================================================================

import { supabase } from "@/integrations/supabase/client";

export const TASK_COST_FIELDS = [
  "subcontractor_cost",
  "markup_percent",
  "material_markup_percent",
  "labor_cost_percent",
] as const;

export type TaskCostField = (typeof TASK_COST_FIELDS)[number];
export type TaskCosts = Partial<Record<TaskCostField, number | null>>;

/**
 * Lägg till i valfri tasks-select för att få kostnadsfälten hydrerade:
 *   .select(`id, title, budget, ${TASK_COSTS_EMBED}`)
 * Saknar läsaren rätt att se kostnader returnerar embeden helt enkelt null —
 * RLS sköter det, inte klienten.
 */
export const TASK_COSTS_EMBED =
  "task_costs(subcontractor_cost,markup_percent,material_markup_percent,labor_cost_percent)";

type WithEmbed = Record<string, unknown> & {
  task_costs?: TaskCosts | TaskCosts[] | null;
};

/**
 * Platta ut embeden så raden ser ut som den gjorde när fälten låg på tasks.
 * PostgREST kan ge både objekt och enradig array beroende på hur relationen
 * detekteras — båda hanteras.
 */
export function flattenTaskCosts<T extends Record<string, unknown>>(row: T): T {
  const raw = (row as WithEmbed).task_costs;
  const costs: TaskCosts = Array.isArray(raw) ? (raw[0] ?? {}) : (raw ?? {});

  const out = { ...row } as WithEmbed;
  delete out.task_costs;

  for (const field of TASK_COST_FIELDS) {
    out[field] = costs[field] ?? null;
  }

  return out as unknown as T;
}

export function flattenTaskCostRows<T extends Record<string, unknown>>(
  rows: T[] | null | undefined,
): T[] {
  return (rows ?? []).map(flattenTaskCosts);
}

/**
 * Dela en task-patch i de två destinationerna. Anroparen skickar samma platta
 * objekt som förut och slipper veta att gränsen finns.
 */
export function splitTaskCostFields<T extends Record<string, unknown>>(
  patch: T,
): { taskPatch: Record<string, unknown>; costPatch: TaskCosts; hasCosts: boolean } {
  const taskPatch: Record<string, unknown> = {};
  const costPatch: TaskCosts = {};
  let hasCosts = false;

  for (const [key, value] of Object.entries(patch)) {
    if ((TASK_COST_FIELDS as readonly string[]).includes(key)) {
      costPatch[key as TaskCostField] = value as number | null;
      hasCosts = true;
    } else {
      taskPatch[key] = value;
    }
  }

  return { taskPatch, costPatch, hasCosts };
}

/**
 * Skriv kostnadsraden för ett arbete. Upsert, så första skrivningen skapar den.
 * Kastar inte — kostnaderna är aldrig värda att fälla hela sparningen, men
 * felet loggas så det inte försvinner tyst.
 */
export async function saveTaskCosts(
  taskId: string,
  projectId: string,
  costs: TaskCosts,
): Promise<boolean> {
  if (Object.keys(costs).length === 0) return true;

  const { error } = await supabase
    .from("task_costs")
    .upsert(
      { task_id: taskId, project_id: projectId, ...costs },
      { onConflict: "task_id" },
    );

  if (error) {
    console.error("Failed to save task costs:", error);
    return false;
  }
  return true;
}

/** Samma sak för många arbeten på en gång (aktivering, offert-synk, scaffold). */
export async function saveTaskCostsBulk(
  rows: Array<{ task_id: string; project_id: string } & TaskCosts>,
): Promise<boolean> {
  if (rows.length === 0) return true;

  const { error } = await supabase
    .from("task_costs")
    .upsert(rows, { onConflict: "task_id" });

  if (error) {
    console.error("Failed to save task costs (bulk):", error);
    return false;
  }
  return true;
}

/** Hämta kostnadsrader för en uppsättning arbeten, som en uppslagstabell. */
export async function fetchTaskCosts(
  taskIds: string[],
): Promise<Map<string, TaskCosts>> {
  const map = new Map<string, TaskCosts>();
  if (taskIds.length === 0) return map;

  const { data, error } = await supabase
    .from("task_costs")
    .select("task_id,subcontractor_cost,markup_percent,material_markup_percent,labor_cost_percent")
    .in("task_id", taskIds);

  if (error) {
    console.error("Failed to fetch task costs:", error);
    return map;
  }

  for (const row of (data ?? []) as Array<{ task_id: string } & TaskCosts>) {
    map.set(row.task_id, row);
  }
  return map;
}

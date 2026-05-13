// Cost-calculation helpers extracted from BudgetTab.tsx. Both roles compute the
// same row totals; only the display differs.

import type { BudgetRow } from "./types";

export function computeTaskEstimatedCost(
  task: {
    estimated_hours?: number | null;
    hourly_rate?: number | null;
    labor_cost_percent?: number | null;
    subcontractor_cost?: number | null;
    material_estimate?: number | null;
  },
  defaultLaborCostPercent: number,
  plannedMaterialCost?: number,
): number {
  const laborTotal = (task.estimated_hours || 0) * (task.hourly_rate || 0);
  const laborCost = laborTotal * ((task.labor_cost_percent ?? defaultLaborCostPercent) / 100);
  const ueCost = task.subcontractor_cost || 0;
  // Planned materials (from materials table) take priority; fall back to flat estimate for
  // tasks that predate the migration or were saved without creating materials rows.
  const materialCost = (plannedMaterialCost != null && plannedMaterialCost > 0)
    ? plannedMaterialCost
    : (task.material_estimate || 0);
  return laborCost + ueCost + materialCost;
}

/** Labor-only estimated cost for P&L view where materials are separate rows */
export function computeTaskLaborCost(
  task: {
    estimated_hours?: number | null;
    hourly_rate?: number | null;
    labor_cost_percent?: number | null;
    subcontractor_cost?: number | null;
  },
  defaultLaborCostPercent: number,
): number {
  const laborTotal = (task.estimated_hours || 0) * (task.hourly_rate || 0);
  const laborCost = laborTotal * ((task.labor_cost_percent ?? defaultLaborCostPercent) / 100);
  const ueCost = task.subcontractor_cost || 0;
  return laborCost + ueCost;
}

export const getEffectiveCost = (row: BudgetRow): number =>
  row.paid > 0 ? row.paid : row.estimatedCost;

export function computeMaterialBudget(
  task: { material_estimate?: number | null },
  plannedMaterialCost?: number,
): number {
  // Planned materials (from materials table) take priority; fall back to flat estimate.
  if (plannedMaterialCost != null && plannedMaterialCost > 0) return plannedMaterialCost;
  return task.material_estimate || 0;
}

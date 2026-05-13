// Persisted table prefs (column order, visible extras, sort, compact rows).
// Storage key is project-scoped today; if owner/contractor diverge on default
// columns we may want a per-role variant — for now the same key works since
// users typically stay in one role per project.

import type { ColumnKey } from "./types";

export interface BudgetTablePrefs {
  columnOrder: ColumnKey[];
  visibleExtras: ColumnKey[];
  sortKey: ColumnKey | null;
  sortDir: "asc" | "desc";
  compactRows?: boolean;
}

export const BUDGET_PREFS_KEY = (projectId: string): string =>
  `budget-table-prefs-${projectId}`;

export function loadBudgetPrefs(projectId: string): BudgetTablePrefs | null {
  try {
    const raw = localStorage.getItem(BUDGET_PREFS_KEY(projectId));
    if (!raw) return null;
    return JSON.parse(raw) as BudgetTablePrefs;
  } catch {
    return null;
  }
}

export function persistBudgetPrefs(projectId: string, prefs: BudgetTablePrefs): void {
  const key = BUDGET_PREFS_KEY(projectId);
  localStorage.setItem(key, JSON.stringify(prefs));
  import("@/hooks/usePersistedPreference").then(({ scheduleServerSync }) =>
    scheduleServerSync(key, prefs),
  );
}

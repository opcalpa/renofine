// Table prefs hook: column order (drag reorder), visible-extras, sort, compact
// rows. State persists to localStorage + server-synced via persistBudgetPrefs.
//
// Caller passes ALL_COLUMNS (computed in component because labels depend on
// i18n's `t()` and isBuilder). The hook reconciles its persisted column order
// against the latest ALL_COLUMNS — appending new columns at the end if the
// schema grew, dropping vanished ones — so language switches and new column
// additions stay backwards compatible.

import { useEffect, useRef, useState } from "react";
import type { ColumnDef, ColumnKey } from "./types";
import { loadBudgetPrefs, persistBudgetPrefs } from "./budgetPrefs";

export interface UseBudgetTablePrefsResult {
  columns: ColumnDef[];
  setColumns: React.Dispatch<React.SetStateAction<ColumnDef[]>>;
  visibleExtras: Set<ColumnKey>;
  setVisibleExtras: React.Dispatch<React.SetStateAction<Set<ColumnKey>>>;
  sortKey: ColumnKey | null;
  setSortKey: React.Dispatch<React.SetStateAction<ColumnKey | null>>;
  sortDir: "asc" | "desc";
  setSortDir: React.Dispatch<React.SetStateAction<"asc" | "desc">>;
  compactRows: boolean;
  setCompactRows: React.Dispatch<React.SetStateAction<boolean>>;
  dragCol: React.MutableRefObject<number | null>;
  dragOverCol: React.MutableRefObject<number | null>;
}

export function useBudgetTablePrefs(
  projectId: string,
  allColumns: ColumnDef[],
): UseBudgetTablePrefsResult {
  const budgetPrefs = useRef(loadBudgetPrefs(projectId));

  const [visibleExtras, setVisibleExtras] = useState<Set<ColumnKey>>(
    () => budgetPrefs.current?.visibleExtras
      ? new Set(budgetPrefs.current.visibleExtras)
      : new Set(),
  );

  const [columns, setColumns] = useState<ColumnDef[]>(() => {
    if (budgetPrefs.current?.columnOrder) {
      const ordered = budgetPrefs.current.columnOrder
        .map((key) => allColumns.find((c) => c.key === key))
        .filter((c): c is ColumnDef => c !== undefined);
      for (const col of allColumns) {
        if (!ordered.some((c) => c.key === col.key)) ordered.push(col);
      }
      return ordered;
    }
    return allColumns;
  });

  const dragCol = useRef<number | null>(null);
  const dragOverCol = useRef<number | null>(null);

  // Keep columns in sync when allColumns changes (language switch, role flip,
  // new column added to the schema).
  useEffect(() => {
    setColumns((prev) => {
      const keyOrder = prev.map((c) => c.key);
      const updated = keyOrder
        .map((key) => allColumns.find((c) => c.key === key))
        .filter((c): c is ColumnDef => c !== undefined);
      for (const col of allColumns) {
        if (!updated.some((c) => c.key === col.key)) updated.push(col);
      }
      return updated;
    });
  }, [allColumns]);

  const [sortKey, setSortKey] = useState<ColumnKey | null>(
    () => budgetPrefs.current?.sortKey ?? null,
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">(
    () => budgetPrefs.current?.sortDir ?? "asc",
  );

  const [compactRows, setCompactRows] = useState<boolean>(
    () => budgetPrefs.current?.compactRows ?? true,
  );

  // Auto-persist when any pref changes.
  useEffect(() => {
    persistBudgetPrefs(projectId, {
      columnOrder: columns.map((c) => c.key),
      visibleExtras: Array.from(visibleExtras),
      sortKey,
      sortDir,
      compactRows,
    });
  }, [columns, visibleExtras, sortKey, sortDir, compactRows, projectId]);

  return {
    columns,
    setColumns,
    visibleExtras,
    setVisibleExtras,
    sortKey,
    setSortKey,
    sortDir,
    setSortDir,
    compactRows,
    setCompactRows,
    dragCol,
    dragOverCol,
  };
}

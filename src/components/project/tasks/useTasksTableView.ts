import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  TaskColumnKey,
  TaskColumnDef,
  EXTRA_COLUMN_KEYS,
  DEFAULT_VISIBLE_EXTRAS,
} from "./tasksTableTypes";

const PREFS_KEY = (projectId: string, isMobile: boolean) =>
  `tasks-table-prefs-${projectId}${isMobile ? "_mobile" : ""}`;

const MOBILE_DEFAULT_VISIBLE_EXTRAS: TaskColumnKey[] = ["budget"];

interface TablePrefs {
  columnOrder: TaskColumnKey[];
  visibleExtras: TaskColumnKey[];
  sortKey: TaskColumnKey | null;
  sortDir: "asc" | "desc";
  compactRows: boolean;
}

function loadPrefs(projectId: string, isMobile: boolean): TablePrefs | null {
  try {
    const raw = localStorage.getItem(PREFS_KEY(projectId, isMobile));
    if (!raw) return null;
    return JSON.parse(raw) as TablePrefs;
  } catch {
    return null;
  }
}

function persistPrefs(projectId: string, isMobile: boolean, prefs: TablePrefs) {
  const key = PREFS_KEY(projectId, isMobile);
  localStorage.setItem(key, JSON.stringify(prefs));
  // Server sync via shared preference system
  import("@/hooks/usePersistedPreference").then(({ scheduleServerSync }) => scheduleServerSync(key, prefs));
}

export function useTasksTableView(projectId: string) {
  const { t, i18n } = useTranslation();

  const ALL_COLUMNS: TaskColumnDef[] = useMemo(
    () => [
      { key: "title", label: t("tasks.taskTitle"), width: "w-[300px]", editType: "none" },
      { key: "status", label: t("tasks.status"), width: "w-[130px]", editType: "select" },
      { key: "priority", label: t("tasks.priority"), width: "w-[100px]", editType: "select" },
      { key: "assignee", label: t("tasks.assignee"), width: "w-[150px]", extra: true, editType: "select", dbField: "assigned_to_stakeholder_id" },
      { key: "room", label: t("tasks.room"), width: "w-[120px]", extra: true, editType: "select", dbField: "room_id" },
      { key: "startDate", label: t("tasks.startDate"), width: "w-[140px]", extra: true, editType: "date", dbField: "start_date" },
      { key: "finishDate", label: t("tasks.finishDate"), width: "w-[140px]", extra: true, editType: "date", dbField: "finish_date" },
      { key: "dueDate", label: t("tasksTable.dueDate"), width: "w-[140px]", extra: true, editType: "date", dbField: "due_date" },
      { key: "progress", label: t("tasks.progress"), width: "w-[120px]", extra: true, editType: "progress" },
      { key: "budget", label: t("tasks.budget"), width: "w-[120px]", align: "right", extra: true, editType: "numeric" },
      { key: "paidAmount", label: t("tasksTable.paidAmount"), width: "w-[120px]", align: "right", extra: true, editType: "numeric", dbField: "paid_amount" },
      { key: "remaining", label: t("tasksTable.remaining"), width: "w-[120px]", align: "right", extra: true, editType: "none" },
      { key: "paymentStatus", label: t("tasksTable.paymentStatus"), width: "w-[140px]", extra: true, editType: "select", dbField: "payment_status" },
      { key: "costCenter", label: t("tasks.costCenter"), width: "w-[140px]", extra: true, editType: "select", dbField: "cost_center" },
      { key: "estimatedHours", label: t("tasksTable.estimatedHours"), width: "w-[110px]", align: "right", extra: true, editType: "numeric", dbField: "estimated_hours" },
      { key: "hourlyRate", label: t("tasksTable.hourlyRate"), width: "w-[110px]", align: "right", extra: true, editType: "numeric", dbField: "hourly_rate" },
      { key: "subcontractorCost", label: t("tasksTable.subcontractorCost"), width: "w-[130px]", align: "right", extra: true, editType: "numeric", dbField: "subcontractor_cost" },
      { key: "materialEstimate", label: t("tasksTable.materialEstimate"), width: "w-[130px]", align: "right", extra: true, editType: "numeric", dbField: "material_estimate" },
      { key: "markupPercent", label: t("tasksTable.markupPercent"), width: "w-[110px]", align: "right", extra: true, editType: "numeric", dbField: "markup_percent" },
      { key: "dependencies", label: t("tasks.dependencies", "Dependencies"), width: "w-[150px]", extra: true, editType: "none" },
      { key: "attachment", label: t("tasksTable.attachment", "Bilagor"), width: "w-[80px]", extra: true, editType: "none" },
      { key: "fileCategory", label: t("files.category", "Filkategori"), width: "w-[120px]", extra: true, editType: "none" },
      { key: "rotAmount", label: t("files.rotAmount", "ROT-avdrag"), width: "w-[120px]", align: "right", extra: true, editType: "numeric", dbField: "rot_amount" },
      { key: "supplier", label: t("budget.supplier", "Leverantör"), width: "w-[150px]", extra: true, editType: "none" },
      { key: "actions", label: t("common.actions"), width: "w-[60px]", editType: "none" },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, i18n.language]
  );

  // Restore saved prefs or use defaults (separate key for mobile vs desktop)
  const isMobile = useRef(typeof window !== "undefined" && window.innerWidth < 768).current;
  const saved = useRef(loadPrefs(projectId, isMobile));

  const [columns, setColumns] = useState<TaskColumnDef[]>(() => {
    if (saved.current?.columnOrder) {
      const ordered = saved.current.columnOrder
        .map((key) => ALL_COLUMNS.find((c) => c.key === key))
        .filter((c): c is TaskColumnDef => c !== undefined);
      for (const col of ALL_COLUMNS) {
        if (!ordered.some((c) => c.key === col.key)) ordered.push(col);
      }
      return ordered;
    }
    return ALL_COLUMNS;
  });

  // Column labels are frozen into state at mount; re-sync them (preserving the
  // user's order) whenever the language changes so headers follow the UI locale.
  useEffect(() => {
    setColumns((prev) => {
      let changed = false;
      const next = prev.map((c) => {
        const fresh = ALL_COLUMNS.find((a) => a.key === c.key);
        if (fresh && fresh.label !== c.label) {
          changed = true;
          return { ...c, label: fresh.label };
        }
        return c;
      });
      return changed ? next : prev;
    });
  }, [ALL_COLUMNS]);

  const [visibleExtras, setVisibleExtras] = useState<Set<TaskColumnKey>>(
    () => saved.current?.visibleExtras
      ? new Set(saved.current.visibleExtras)
      : new Set(isMobile ? MOBILE_DEFAULT_VISIBLE_EXTRAS : DEFAULT_VISIBLE_EXTRAS)
  );

  const [sortKey, setSortKey] = useState<TaskColumnKey | null>(
    () => saved.current?.sortKey ?? null
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">(
    () => saved.current?.sortDir ?? "asc"
  );
  const [compactRows, setCompactRows] = useState(
    () => saved.current?.compactRows ?? false
  );

  // Grouping
  type GroupByOption = "none" | "room" | "costCenter" | "status" | "assignee";
  const [groupBy, setGroupBy] = useState<GroupByOption>(() =>
    (localStorage.getItem(`tasks-groupby-${projectId}`) as GroupByOption) || "none"
  );
  const handleGroupByChange = useCallback((v: string) => {
    setGroupBy(v as GroupByOption);
    localStorage.setItem(`tasks-groupby-${projectId}`, v);
  }, [projectId]);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const toggleGroupCollapse = useCallback((key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  // Auto-persist on every change
  useEffect(() => {
    persistPrefs(projectId, isMobile, {
      columnOrder: columns.map((c) => c.key),
      visibleExtras: Array.from(visibleExtras),
      sortKey,
      sortDir,
      compactRows,
    });
  }, [columns, visibleExtras, sortKey, sortDir, compactRows, projectId, isMobile]);

  const visibleColumns = useMemo(
    () => columns.filter((c) => !c.extra || visibleExtras.has(c.key)),
    [columns, visibleExtras]
  );

  const toggleExtraColumn = useCallback((key: TaskColumnKey) => {
    setVisibleExtras((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleSort = useCallback(
    (key: TaskColumnKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("asc");
      }
    },
    [sortKey]
  );

  // Drag reorder
  const [dragColIdx, setDragColIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const handleDragStart = useCallback((idx: number) => {
    setDragColIdx(idx);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragColIdx(null);
    setDragOverIdx(null);
  }, []);

  const handleDrop = useCallback(() => {
    if (dragColIdx === null || dragOverIdx === null || dragColIdx === dragOverIdx) {
      setDragColIdx(null);
      setDragOverIdx(null);
      return;
    }
    const fromKey = visibleColumns[dragColIdx]?.key;
    const toKey = visibleColumns[dragOverIdx]?.key;
    if (!fromKey || !toKey) return;

    setColumns((prev) => {
      const reordered = [...prev];
      const fromIdx = reordered.findIndex((c) => c.key === fromKey);
      const toIdx = reordered.findIndex((c) => c.key === toKey);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const [moved] = reordered.splice(fromIdx, 1);
      reordered.splice(toIdx, 0, moved);
      return reordered;
    });
    setDragColIdx(null);
    setDragOverIdx(null);
  }, [dragColIdx, dragOverIdx, visibleColumns]);

  return {
    ALL_COLUMNS,
    columns,
    visibleColumns,
    visibleExtras,
    toggleExtraColumn,
    sortKey,
    sortDir,
    handleSort,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
    dragColIdx,
    dragOverIdx,
    compactRows,
    setCompactRows,
    groupBy,
    handleGroupByChange,
    collapsedGroups,
    toggleGroupCollapse,
  };
}

export type TasksTableViewState = ReturnType<typeof useTasksTableView>;

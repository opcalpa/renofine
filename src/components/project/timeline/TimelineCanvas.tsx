import React, { useRef, useCallback, useEffect, useState, useMemo } from "react";
import { Stage, Layer, Rect, Line, Text as KonvaText, Group, RegularPolygon } from "react-konva";
import { KonvaEventObject } from "konva/lib/Node";
import {
  parseISO,
  differenceInDays,
  addDays,
  format,
} from "date-fns";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { TimelineGrid } from "./TimelineGrid";
import { TimelineTaskBar } from "./TimelineTaskBar";
import { TimelineDependencyArrows } from "./TimelineDependencyArrows";
import { useTimelineStore } from "./store";
import { getCostCenterLabel } from "@/lib/costCenters";
import type {
  TimelineTask,
  TimelineDependency,
  TimelineMilestone,
  GroupRow,
  TaskPosition,
} from "./types";
import {
  dateToX,
  xToDate,
  ROW_HEIGHT,
  MIN_BAR_WIDTH,
  getDownstreamTasks,
} from "./utils";

interface TimelineCanvasProps {
  tasks: TimelineTask[];
  allTasks: TimelineTask[];
  dependencies: TimelineDependency[];
  rows: GroupRow[];
  totalRows: number;
  originDate: Date;
  daysToRender: number;
  projectStartDate?: string | null;
  projectFinishDate?: string | null;
  teamMembers?: Array<{ id: string; name: string }>;
  rooms?: Array<{ id: string; name: string }>;
  milestones?: TimelineMilestone[];
  selectedTaskIds?: Set<string>;
  onTaskClick: (taskId: string, nativeEvent?: MouseEvent) => void;
  onRefetch: () => void;
}

const GROUP_HEADER_BG = "#f1f5f9";
const GROUP_HEADER_TEXT = "#475569";

const CATEGORY_COLORS: Record<string, string> = {
  demolition: "#f59e0b", construction: "#78716c", electricity: "#3b82f6",
  plumbing: "#06b6d4", tiles: "#8b5cf6", floor: "#84cc16",
  paint: "#ec4899", carpentry: "#f97316", windows_doors: "#0ea5e9",
  inspection: "#14b8a6", cleanup: "#71717a", design: "#f472b6",
  // Legacy IDs still resolve
  kitchen: "#ef4444", bathrooms: "#6366f1", bathroom: "#6366f1",
  windows: "#0ea5e9", doors: "#a855f7",
};
const PRIORITY_COLORS: Record<string, string> = {
  low: "#94a3b8", medium: "#f59e0b", high: "#ef4444",
};

const TimelineCanvasComponent: React.FC<TimelineCanvasProps> = ({
  tasks,
  allTasks,
  dependencies,
  rows,
  totalRows,
  originDate,
  daysToRender,
  projectStartDate,
  projectFinishDate,
  teamMembers,
  rooms,
  milestones = [],
  selectedTaskIds,
  onTaskClick,
  onRefetch,
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);
  const [stageWidth, setStageWidth] = useState(800);

  const { panX, panY, pixelsPerDay, dragState } = useTimelineStore();

  // Resize state — tracked locally for real-time visual feedback
  const resizeRef = useRef<{
    taskId: string;
    side: "left" | "right";
    startPointerX: number;
    origStartDate: string;
    origFinishDate: string;
    origX: number;
    origWidth: number;
  } | null>(null);
  const [resizePreview, setResizePreview] = useState<{
    taskId: string;
    x: number;
    width: number;
  } | null>(null);

  // Height must fit every row. Rows are placed at their absolute rowIndex and
  // only the time (x) axis scrolls, so the canvas always spans all rows.
  // (The old "count horizontally-visible rows" height clipped bottom rows whose
  // bars happened to sit outside the current time window — the cut-off-on-mobile bug.)
  const MIN_VISIBLE_ROWS = 4;
  const stageHeight = useMemo(
    () => Math.max(totalRows * ROW_HEIGHT + 20, MIN_VISIBLE_ROWS * ROW_HEIGHT + 20),
    [totalRows],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setStageWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Touch gestures: single-finger pan + two-finger pinch-to-zoom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let lastX = 0;
    let lastDist = 0;

    const getTouchDist = (touches: TouchList) => {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        lastX = e.touches[0].clientX;
      } else if (e.touches.length === 2) {
        lastDist = getTouchDist(e.touches);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const store = useTimelineStore.getState();
      if (e.touches.length === 2 && lastDist > 0) {
        const newDist = getTouchDist(e.touches);
        const scale = newDist / lastDist;
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const rect = el.getBoundingClientRect();
        store.setZoom(store.pixelsPerDay * scale, midX - rect.left);
        lastDist = newDist;
      } else if (e.touches.length === 1) {
        const dx = e.touches[0].clientX - lastX;
        store.setPan(store.panX + dx, store.panY);
        lastX = e.touches[0].clientX;
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        lastDist = 0;
      } else if (e.touches.length === 1) {
        lastX = e.touches[0].clientX;
        lastDist = 0;
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  // Wheel handler: pan + zoom
  const handleWheel = useCallback(
    (evt: KonvaEventObject<WheelEvent>) => {
      evt.evt.preventDefault();
      const store = useTimelineStore.getState();

      if (evt.evt.ctrlKey || evt.evt.metaKey) {
        const pointer = evt.target.getStage()?.getPointerPosition();
        const anchorX = pointer?.x ?? stageWidth / 2;
        const zoomFactor = evt.evt.deltaY > 0 ? 0.9 : 1.1;
        store.setZoom(store.pixelsPerDay * zoomFactor, anchorX);
      } else {
        const dx = evt.evt.deltaX || evt.evt.deltaY;
        store.setPan(store.panX - dx, store.panY);
      }
    },
    [stageWidth]
  );

  // Build task positions for dependency arrows
  const taskPositions = useMemo(() => {
    const map = new Map<string, TaskPosition>();
    for (const row of rows) {
      if (row.type !== "task" || !row.task) continue;
      const task = row.task;
      if (!task.start_date || !task.finish_date) continue;

      const startDate = parseISO(task.start_date);
      const endDate = parseISO(task.finish_date);
      const xPos = dateToX(startDate, originDate, pixelsPerDay, panX);
      const days = Math.max(1, differenceInDays(endDate, startDate) + 1);
      const w = Math.max(MIN_BAR_WIDTH, days * pixelsPerDay);
      const yPos = row.rowIndex * ROW_HEIGHT;

      map.set(task.id, { x: xPos, y: yPos, width: w, taskId: task.id });
    }
    return map;
  }, [rows, originDate, pixelsPerDay, panX]);

  // Drag handlers
  const handleDragStart = useCallback(
    (_taskId: string, evt: KonvaEventObject<DragEvent>) => {
      const node = evt.target;
      node.y(node.y());
    },
    []
  );

  const handleDragMove = useCallback(
    (taskId: string, evt: KonvaEventObject<DragEvent>) => {
      const node = evt.target;
      const row = rows.find((r) => r.task?.id === taskId);
      if (row) {
        node.y(row.rowIndex * ROW_HEIGHT + 8);
      }
    },
    [rows]
  );

  // Save dates on drag end
  const handleDragEnd = useCallback(
    async (taskId: string, evt: KonvaEventObject<DragEvent>) => {
      const node = evt.target;
      const store = useTimelineStore.getState();

      // Calculate new start date from node position
      const newX = node.x();
      const newStartDate = xToDate(
        newX,
        originDate,
        store.pixelsPerDay,
        store.panX
      );

      const task = tasks.find((tt) => tt.id === taskId);
      if (!task?.start_date || !task?.finish_date) return;

      const origStart = parseISO(task.start_date);
      const origEnd = parseISO(task.finish_date);
      const duration = differenceInDays(origEnd, origStart);
      const newFinishDate = addDays(newStartDate, duration);

      const newStartStr = format(newStartDate, "yyyy-MM-dd");
      const newFinishStr = format(newFinishDate, "yyyy-MM-dd");

      // Skip if no change
      if (newStartStr === task.start_date && newFinishStr === task.finish_date) {
        return;
      }

      try {
        const { error } = await supabase
          .from("tasks")
          .update({ start_date: newStartStr, finish_date: newFinishStr })
          .eq("id", taskId);
        if (error) throw error;

        // Cascade dependent tasks — ONLY forward in time
        // Moving a predecessor backward should NOT pull dependents back
        // (the crew for the next job doesn't need to come earlier just
        // because the previous job can start sooner)
        const delta = differenceInDays(newStartDate, origStart);
        let cascadedCount = 0;
        if (delta > 0) {
          // Moving forward: push dependents whose start would now overlap
          const downstreamIds = getDownstreamTasks(taskId, dependencies);
          for (const dt of allTasks.filter((tt) =>
            downstreamIds.includes(tt.id)
          )) {
            if (dt.start_date && dt.finish_date) {
              const depStart = parseISO(dt.start_date);
              // Only push if the dependent starts before our new finish
              if (depStart <= newFinishDate) {
                const pushDays = differenceInDays(newFinishDate, depStart) + 1;
                const { error: ce } = await supabase
                  .from("tasks")
                  .update({
                    start_date: format(addDays(depStart, pushDays), "yyyy-MM-dd"),
                    finish_date: format(
                      addDays(parseISO(dt.finish_date), pushDays),
                      "yyyy-MM-dd"
                    ),
                  })
                  .eq("id", dt.id);
                if (!ce) cascadedCount++;
              }
            }
          }
        }

        toast({
          title: t("timeline.taskRescheduled", "Task rescheduled"),
          description:
            cascadedCount > 0
              ? `${task.title} → ${format(newStartDate, "MMM d")}. ${t("timeline.dependenciesCascaded", "Also moved {{count}} dependent task(s)", { count: cascadedCount })}`
              : `${task.title} → ${format(newStartDate, "MMM d, yyyy")}`,
        });

        onRefetch();
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : String(error);
        toast({
          title: "Error",
          description: message,
          variant: "destructive",
        });
      }
    },
    [tasks, allTasks, dependencies, originDate, onRefetch, toast, t]
  );

  const handleResizeStart = useCallback(
    (
      taskId: string,
      side: "left" | "right",
      evt: KonvaEventObject<MouseEvent>
    ) => {
      evt.cancelBubble = true;
      const stage = evt.target.getStage();
      const pointer = stage?.getPointerPosition();
      if (!pointer) return;

      const task = tasks.find((tt) => tt.id === taskId);
      if (!task?.start_date || !task?.finish_date) return;

      const pos = taskPositions.get(taskId);
      if (!pos) return;

      resizeRef.current = {
        taskId,
        side,
        startPointerX: pointer.x,
        origStartDate: task.start_date,
        origFinishDate: task.finish_date,
        origX: pos.x,
        origWidth: pos.width,
      };
    },
    [tasks, taskPositions]
  );

  const handleStageMouseMove = useCallback(
    (evt: KonvaEventObject<MouseEvent>) => {
      const resize = resizeRef.current;
      if (!resize) return;

      const stage = evt.target.getStage();
      const pointer = stage?.getPointerPosition();
      if (!pointer) return;

      const dx = pointer.x - resize.startPointerX;

      if (resize.side === "right") {
        const newWidth = Math.max(MIN_BAR_WIDTH, resize.origWidth + dx);
        setResizePreview({ taskId: resize.taskId, x: resize.origX, width: newWidth });
      } else {
        const newX = resize.origX + dx;
        const newWidth = Math.max(MIN_BAR_WIDTH, resize.origWidth - dx);
        setResizePreview({ taskId: resize.taskId, x: newX, width: newWidth });
      }
    },
    []
  );

  const handleStageMouseUp = useCallback(
    async () => {
      const resize = resizeRef.current;
      if (!resize) return;
      resizeRef.current = null;

      const store = useTimelineStore.getState();
      const preview = resizePreview;
      setResizePreview(null);
      if (!preview) return;

      // Calculate new dates from preview position
      const newStartDate = xToDate(preview.x, originDate, store.pixelsPerDay, store.panX);
      const daysSpan = Math.max(1, Math.round(preview.width / store.pixelsPerDay));
      const newFinishDate = addDays(newStartDate, daysSpan - 1);

      const newStartStr = format(newStartDate, "yyyy-MM-dd");
      const newFinishStr = format(newFinishDate, "yyyy-MM-dd");

      // Skip if no change
      if (newStartStr === resize.origStartDate && newFinishStr === resize.origFinishDate) return;

      try {
        const { error } = await supabase
          .from("tasks")
          .update({ start_date: newStartStr, finish_date: newFinishStr })
          .eq("id", resize.taskId);
        if (error) throw error;

        const task = tasks.find((tt) => tt.id === resize.taskId);

        // Cascade downstream tasks if finish date moved forward
        let cascadedCount = 0;
        const origFinish = parseISO(resize.origFinishDate);
        if (newFinishDate > origFinish) {
          const downstreamIds = getDownstreamTasks(resize.taskId, dependencies);
          for (const dt of allTasks.filter((tt) => downstreamIds.includes(tt.id))) {
            if (dt.start_date && dt.finish_date) {
              const depStart = parseISO(dt.start_date);
              if (depStart <= newFinishDate) {
                const pushDays = differenceInDays(newFinishDate, depStart) + 1;
                const { error: ce } = await supabase
                  .from("tasks")
                  .update({
                    start_date: format(addDays(depStart, pushDays), "yyyy-MM-dd"),
                    finish_date: format(addDays(parseISO(dt.finish_date), pushDays), "yyyy-MM-dd"),
                  })
                  .eq("id", dt.id);
                if (!ce) cascadedCount++;
              }
            }
          }
        }

        toast({
          title: t("timeline.taskDurationUpdated", "Task duration updated"),
          description: cascadedCount > 0
            ? `${task?.title ?? ""} → ${format(newStartDate, "MMM d")} – ${format(newFinishDate, "MMM d")}. ${t("timeline.dependenciesCascaded", { count: cascadedCount })}`
            : `${task?.title ?? ""} → ${format(newStartDate, "MMM d")} – ${format(newFinishDate, "MMM d, yyyy")}`,
        });

        onRefetch();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        toast({ title: "Error", description: message, variant: "destructive" });
      }
    },
    [resizePreview, tasks, originDate, onRefetch, toast, t]
  );

  return (
    <div
      ref={containerRef}
      className="w-full overflow-hidden konva-timeline-canvas"
      style={{ touchAction: "none" }}
    >
      <Stage
        width={stageWidth}
        height={stageHeight}
        onWheel={handleWheel}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
      >
        {/* Grid layer */}
        <Layer listening={false}>
          <TimelineGrid
            originDate={originDate}
            pixelsPerDay={pixelsPerDay}
            panX={panX}
            stageWidth={stageWidth}
            stageHeight={stageHeight}
            daysToRender={daysToRender}
            projectStartDate={projectStartDate}
            projectFinishDate={projectFinishDate}
          />
        </Layer>

        {/* Phase overlay layer */}
        {useTimelineStore.getState().showPhases && (
          <Layer listening={false}>
            {(() => {
              // Group tasks by cost_center to compute phase spans
              const phaseMap = new Map<string, { minDate: string; maxDate: string; color: string }>();
              const PHASE_COLORS: Record<string, string> = {
                demolition: "#f59e0b20", construction: "#78716c20",
                electricity: "#3b82f620", electrical: "#3b82f620",
                plumbing: "#06b6d420", tiles: "#8b5cf620", tiling: "#8b5cf620",
                floor: "#84cc1620", flooring: "#84cc1620",
                paint: "#ec489920", painting: "#ec489920",
                carpentry: "#f9731620", windows_doors: "#0ea5e920",
                inspection: "#14b8a620", cleanup: "#71717a20", design: "#f472b620",
                // Legacy
                kitchen: "#ef444420", bathrooms: "#6366f120", bathroom: "#6366f120",
                windows: "#0ea5e920", doors: "#a855f720",
                other: "#94a3b820",
              };
              for (const task of tasks) {
                if (!task.start_date || !task.finish_date) continue;
                const cc = (task as unknown as { cost_center?: string }).cost_center || "other";
                const existing = phaseMap.get(cc);
                if (!existing) {
                  phaseMap.set(cc, { minDate: task.start_date, maxDate: task.finish_date, color: PHASE_COLORS[cc] || PHASE_COLORS.other });
                } else {
                  if (task.start_date < existing.minDate) existing.minDate = task.start_date;
                  if (task.finish_date > existing.maxDate) existing.maxDate = task.finish_date;
                }
              }
              return Array.from(phaseMap.entries()).map(([cc, phase]) => {
                const x1 = dateToX(new Date(phase.minDate), originDate, pixelsPerDay, panX);
                const x2 = dateToX(new Date(phase.maxDate), originDate, pixelsPerDay, panX) + pixelsPerDay;
                if (x2 < 0 || x1 > stageWidth) return null;
                return (
                  <Group key={`phase-${cc}`}>
                    <Rect
                      x={x1}
                      y={0}
                      width={x2 - x1}
                      height={stageHeight}
                      fill={phase.color}
                      perfectDrawEnabled={false}
                    />
                    <KonvaText
                      x={Math.max(x1 + 4, 4)}
                      y={4}
                      text={getCostCenterLabel(cc) || cc.charAt(0).toUpperCase() + cc.slice(1)}
                      fontSize={10}
                      fontStyle="bold"
                      fill={phase.color.replace("20", "90")}
                      listening={false}
                    />
                  </Group>
                );
              });
            })()}
          </Layer>
        )}

        {/* Content layer (tasks + dependencies) */}
        <Layer>
          {rows.map((row) => {
            if (row.type === "group-header") {
              return (
                <Group key={`gh-${row.groupId}`} listening={false}>
                  <Rect
                    x={0}
                    y={row.rowIndex * ROW_HEIGHT}
                    width={stageWidth}
                    height={ROW_HEIGHT}
                    fill={GROUP_HEADER_BG}
                    perfectDrawEnabled={false}
                  />
                  <KonvaText
                    x={12}
                    y={row.rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2 - 7}
                    text={row.groupLabel}
                    fontSize={13}
                    fontStyle="bold"
                    fill={GROUP_HEADER_TEXT}
                  />
                </Group>
              );
            }

            if (!useTimelineStore.getState().showTasks) return null;

            const task = row.task;
            if (!task?.start_date || !task?.finish_date) return null;

            const pos = taskPositions.get(task.id);
            if (!pos) return null;

            const assignee = teamMembers?.find((m) => m.id === task.assigned_to_stakeholder_id);
            const room = rooms?.find((r) => r.id === task.room_id);

            // Use resize preview position if this task is being resized
            const rp = resizePreview?.taskId === task.id ? resizePreview : null;

            // Color by mode
            const colorByMode = useTimelineStore.getState().colorBy;
            const colorOverride = colorByMode === "category"
              ? (CATEGORY_COLORS[(task as unknown as { cost_center?: string }).cost_center || ""] || "#94a3b8")
              : colorByMode === "priority"
                ? (PRIORITY_COLORS[task.priority] || "#94a3b8")
                : undefined;

            return (
              <TimelineTaskBar
                key={task.id}
                taskId={task.id}
                title={task.title}
                status={task.status}
                progress={task.progress}
                colorOverride={colorOverride}
                isMultiSelected={selectedTaskIds?.has(task.id)}
                x={rp ? rp.x : pos.x}
                y={pos.y}
                width={rp ? rp.width : pos.width}
                isSelected={
                  useTimelineStore.getState().selectedTaskId === task.id
                }
                isDragging={dragState?.taskId === task.id}
                assigneeInitial={assignee?.name?.charAt(0)?.toUpperCase()}
                roomName={room?.name}
                onDragStart={handleDragStart}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
                onResizeStart={handleResizeStart}
                onClick={onTaskClick}
              />
            );
          })}

          <TimelineDependencyArrows
            dependencies={dependencies}
            taskPositions={taskPositions}
          />
        </Layer>

        {/* Milestone diamonds layer — on top of tasks so they're always visible */}
        {useTimelineStore.getState().showMilestones && milestones.length > 0 && (
          <Layer listening={false}>
            {(() => {
              const sorted = [...milestones].sort((a, b) => a.date.localeCompare(b.date));
              let lastX = -Infinity;
              let ySlot = 0;
              const DIAMOND_SIZE = 7;
              const Y_POSITIONS = [10, 24];

              return sorted.map((ms) => {
                const x = dateToX(parseISO(ms.date), originDate, pixelsPerDay, panX) + pixelsPerDay / 2;
                if (x < -100 || x > stageWidth + 100) return null;

                if (x - lastX < 80) {
                  ySlot = (ySlot + 1) % Y_POSITIONS.length;
                } else {
                  ySlot = 0;
                }
                lastX = x;
                const y = Y_POSITIONS[ySlot];
                const color = ms.color || "#6366f1";

                return (
                  <Group key={`ms-${ms.id}`}>
                    <Line
                      points={[x, y + DIAMOND_SIZE + 2, x, stageHeight]}
                      stroke={color}
                      strokeWidth={1}
                      dash={[4, 4]}
                      opacity={0.25}
                      perfectDrawEnabled={false}
                    />
                    <RegularPolygon
                      x={x}
                      y={y}
                      sides={4}
                      radius={DIAMOND_SIZE}
                      fill={color}
                      rotation={0}
                      perfectDrawEnabled={false}
                    />
                    <KonvaText
                      x={x + DIAMOND_SIZE + 4}
                      y={y - 5}
                      text={ms.title}
                      fontSize={10}
                      fontStyle="600"
                      fill={color}
                      listening={false}
                      opacity={0.85}
                    />
                  </Group>
                );
              });
            })()}
          </Layer>
        )}
      </Stage>
    </div>
  );
};

export const TimelineCanvas = React.memo(TimelineCanvasComponent);

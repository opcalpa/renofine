import React, { useMemo, useCallback, useEffect, useRef, useState } from "react";
import { parseISO, subDays, addDays, differenceInDays } from "date-fns";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { useTimelineData } from "./hooks/useTimelineData";
import { useTimelineLayout } from "./hooks/useTimelineLayout";
import { useTimelineStore } from "./store";
import { TimelineDateRuler } from "./TimelineDateRuler";
import { TimelineCanvas } from "./TimelineCanvas";
import { TimelineHoverCard } from "./TimelineHoverCard";
import { TimelineToolbar } from "./TimelineToolbar";
import { DEFAULT_PIXELS_PER_DAY, MIN_PIXELS_PER_DAY, MAX_PIXELS_PER_DAY, MOBILE_MIN_PIXELS_PER_DAY } from "./utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface KonvaTimelineProps {
  projectId: string;
  projectName?: string;
  projectStartDate?: string | null;
  projectFinishDate?: string | null;
  filteredTaskIds?: string[] | null;
  selectedTaskIds?: Set<string>;
  onTaskClick?: (taskId: string, nativeEvent?: MouseEvent) => void;
  onNavigateToRoom?: (roomId: string) => void;
  currency?: string | null;
  isDemo?: boolean;
  userType?: string | null;
}

export const KonvaTimeline: React.FC<KonvaTimelineProps> = ({
  projectId,
  projectName,
  filteredTaskIds,
  selectedTaskIds,
  onTaskClick,
}) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  const { tasks, allTasks, dependencies, milestones, teamMembers, rooms, projectStartDate, projectFinishDate, setProjectDates, loading, refetch } =
    useTimelineData(projectId, filteredTaskIds);

  const isMobile = useIsMobile();

  const {
    panX,
    pixelsPerDay,
    groupBy,
    selectedAssignee,
    collapsedGroups,
    setPan,
    setGroupBy,
    setSelectedAssignee,
  } = useTimelineStore();

  const { rows, totalRows } = useTimelineLayout({
    tasks,
    groupBy,
    selectedAssignee,
    collapsedGroups,
    rooms,
    teamMembers,
  });

  const unscheduledTasks = useMemo(
    () => allTasks.filter((tt) => !tt.start_date || !tt.finish_date),
    [allTasks]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setContainerWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const originDate = useMemo(() => {
    if (tasks.length === 0) return subDays(new Date(), 7);
    const starts = tasks
      .filter((tt) => tt.start_date)
      .map((tt) => parseISO(tt.start_date!));
    if (starts.length === 0) return subDays(new Date(), 7);
    const earliest = new Date(Math.min(...starts.map((d) => d.getTime())));
    return subDays(earliest, 30); // 30 days buffer before first task
  }, [tasks]);

  const daysToRender = useMemo(() => {
    // Render plenty of days in both directions so scrolling never hits blank space
    if (tasks.length === 0) return 180;
    const ends = tasks
      .filter((tt) => tt.finish_date)
      .map((tt) => parseISO(tt.finish_date!));
    if (ends.length === 0) return 180;
    const latest = new Date(Math.max(...ends.map((d) => d.getTime())));
    const taskSpan = differenceInDays(latest, originDate) + 14;
    return Math.max(taskSpan, 180); // Always at least 180 days (6 months)
  }, [tasks, originDate]);

  // Auto-center on first load — show task span, not today
  const hasAutocentered = useRef(false);
  useEffect(() => {
    if (hasAutocentered.current || loading || tasks.length === 0) return;
    hasAutocentered.current = true;
    showProjectSpan();
  }, [loading, tasks, originDate, pixelsPerDay, containerWidth, setPan]);

  // Show entire project span using project start/finish dates (±2 days margin)
  const showProjectSpan = useCallback(() => {
    // Prefer explicit project dates; fall back to task date range
    const earliest = projectStartDate
      ? subDays(parseISO(projectStartDate), 2)
      : (() => {
          const starts = tasks.filter(t => t.start_date).map(t => parseISO(t.start_date!));
          return starts.length > 0 ? subDays(new Date(Math.min(...starts.map(d => d.getTime()))), 2) : null;
        })();
    const latest = projectFinishDate
      ? addDays(parseISO(projectFinishDate), 2)
      : (() => {
          const ends = tasks.filter(t => t.finish_date).map(t => parseISO(t.finish_date!));
          return ends.length > 0 ? addDays(new Date(Math.max(...ends.map(d => d.getTime()))), 2) : null;
        })();
    if (!earliest || !latest) return;
    const span = Math.max(differenceInDays(latest, earliest) + 1, 7);
    // Read actual width from DOM to avoid stale containerWidth
    const actualWidth = containerRef.current?.clientWidth || containerWidth;
    // Calculate exact ppd to fit project in viewport. On phones, don't shrink
    // below a readable floor — instead anchor at the project start and show a
    // limited window (user can pinch-zoom out for the full span).
    const rawFitPpd = Math.max(1, actualWidth / span);
    const fitPpd = isMobile
      ? Math.max(rawFitPpd, MOBILE_MIN_PIXELS_PER_DAY)
      : rawFitPpd;
    // Set zoom + pan atomically
    const daysFromOrigin = differenceInDays(earliest, originDate);
    const panX = -(daysFromOrigin * fitPpd);
    useTimelineStore.setState({ pixelsPerDay: fitPpd, panX });
  }, [tasks, projectStartDate, projectFinishDate, originDate, containerWidth, isMobile]);

  const handleZoomIn = useCallback(() => {
    const s = useTimelineStore.getState();
    s.setZoom(s.pixelsPerDay * 1.25, containerWidth / 2);
  }, [containerWidth]);

  const handleZoomOut = useCallback(() => {
    const s = useTimelineStore.getState();
    s.setZoom(s.pixelsPerDay * 0.8, containerWidth / 2);
  }, [containerWidth]);

  const handleResetZoom = useCallback(() => {
    const s = useTimelineStore.getState();
    s.setZoom(DEFAULT_PIXELS_PER_DAY, containerWidth / 2);
  }, [containerWidth]);

  const handleToday = useCallback(() => {
    const s = useTimelineStore.getState();
    const today = new Date();
    const daysFromOrigin = differenceInDays(today, originDate);
    const centerX = -(daysFromOrigin * s.pixelsPerDay - containerWidth / 2);
    s.setPan(centerX, 0);
  }, [originDate, containerWidth]);

  const handlePanLeft = useCallback(() => {
    const s = useTimelineStore.getState();
    s.setPan(s.panX + s.pixelsPerDay * 7, s.panY);
  }, []);

  const handlePanRight = useCallback(() => {
    const s = useTimelineStore.getState();
    s.setPan(s.panX - s.pixelsPerDay * 7, s.panY);
  }, []);

  const handleTaskClick = useCallback(
    (taskId: string, nativeEvent?: MouseEvent) => {
      useTimelineStore.getState().setSelectedTaskId(taskId);
      onTaskClick?.(taskId, nativeEvent);
    },
    [onTaskClick]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (allTasks.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        {t("projectDetail.noScheduledTasks", "No scheduled tasks")}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full relative overflow-hidden">
      <TimelineToolbar
        projectId={projectId}
        unscheduledTasks={unscheduledTasks}
        projectStartDate={projectStartDate}
        projectFinishDate={projectFinishDate}
        onProjectDatesChange={setProjectDates}
        milestones={milestones}
        onMilestonesChange={refetch}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetZoom={handleResetZoom}
        onPanLeft={handlePanLeft}
        onPanRight={handlePanRight}
        onToday={handleToday}
        onShowProject={showProjectSpan}
        onTaskClick={onTaskClick}
      />

      <TimelineDateRuler
        originDate={originDate}
        pixelsPerDay={pixelsPerDay}
        panX={panX}
        stageWidth={containerWidth}
        daysToRender={daysToRender}
      />

      <TimelineCanvas
        tasks={tasks}
        allTasks={allTasks}
        dependencies={dependencies}
        rows={rows}
        totalRows={totalRows}
        originDate={originDate}
        daysToRender={daysToRender}
        projectStartDate={projectStartDate}
        projectFinishDate={projectFinishDate}
        teamMembers={teamMembers}
        rooms={rooms}
        milestones={milestones}
        selectedTaskIds={selectedTaskIds}
        onTaskClick={handleTaskClick}
        onRefetch={refetch}
      />

      <TimelineHoverCard tasks={allTasks} teamMembers={teamMembers} dependencies={dependencies} />
    </div>
  );
};

export default KonvaTimeline;

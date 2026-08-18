import React from "react";
import { Group, Rect, Line, Text as KonvaText } from "react-konva";
import { addDays, parseISO, format } from "date-fns";
import { useTranslation } from "react-i18next";
import { getDateLocale } from "@/lib/dateFnsLocale";
import { dateToX, isWeekend, isSameDay } from "./utils";

interface TimelineGridProps {
  originDate: Date;
  pixelsPerDay: number;
  panX: number;
  stageWidth: number;
  stageHeight: number;
  daysToRender: number;
  projectStartDate?: string | null;
  projectFinishDate?: string | null;
}

const WEEKEND_COLOR = "#f1f5f9";
const DAY_LINE_COLOR = "#e5e7eb";
const MONTH_LINE_COLOR = "#94a3b8";
const TODAY_LINE_COLOR = "#ef4444";

const PROJECT_START_COLOR = "#60a5fa"; // blue-400 — light blue
const PROJECT_FINISH_COLOR = "#4ade80"; // green-400 — clear green

const TimelineGridComponent: React.FC<TimelineGridProps> = ({
  originDate,
  pixelsPerDay,
  panX,
  stageWidth,
  stageHeight,
  daysToRender,
  projectStartDate,
  projectFinishDate,
}) => {
  const { t, i18n } = useTranslation();
  const locale = getDateLocale(i18n.language);
  const today = new Date();
  const elements: React.ReactNode[] = [];

  // Render only visible days — no limit, grid extends infinitely
  const firstVisibleDay = Math.floor(-panX / pixelsPerDay) - 1;
  const lastVisibleDay = Math.ceil((stageWidth - panX) / pixelsPerDay) + 1;
  const startDay = firstVisibleDay;
  const endDay = lastVisibleDay;

  // Background fill for full visible area
  elements.push(
    <Rect
      key="bg"
      x={0}
      y={0}
      width={stageWidth}
      height={stageHeight}
      fill="#ffffff"
      listening={false}
      perfectDrawEnabled={false}
    />
  );

  for (let i = startDay; i <= endDay; i++) {
    const date = addDays(originDate, i);
    const x = dateToX(date, originDate, pixelsPerDay, panX);

    // Weekend shading
    if (isWeekend(date)) {
      elements.push(
        <Rect
          key={`wk-${i}`}
          x={x}
          y={0}
          width={pixelsPerDay}
          height={stageHeight}
          fill={WEEKEND_COLOR}
          listening={false}
          perfectDrawEnabled={false}
        />
      );
    }

    // Day separator line
    const isFirstOfMonth = date.getDate() === 1;
    elements.push(
      <Line
        key={`dl-${i}`}
        points={[x, 0, x, stageHeight]}
        stroke={isFirstOfMonth ? MONTH_LINE_COLOR : DAY_LINE_COLOR}
        strokeWidth={isFirstOfMonth ? 2 : 0.5}
        listening={false}
        perfectDrawEnabled={false}
      />
    );

    // Today marker (rendered last below to be on top)
    if (isSameDay(date, today)) {
      // Subtle background column for today
      elements.push(
        <Rect
          key="today-bg"
          x={x}
          y={0}
          width={pixelsPerDay}
          height={stageHeight}
          fill="rgba(239, 68, 68, 0.04)"
          listening={false}
          perfectDrawEnabled={false}
        />
      );
      elements.push(
        <Line
          key="today"
          points={[x, 0, x, stageHeight]}
          stroke={TODAY_LINE_COLOR}
          strokeWidth={2}
          dash={[6, 3]}
          listening={false}
          perfectDrawEnabled={false}
        />
      );
    }
  }

  // Project start date marker
  if (projectStartDate) {
    const x = dateToX(parseISO(projectStartDate), originDate, pixelsPerDay, panX);
    if (x >= -2 && x <= stageWidth + 2) {
      elements.push(
        <Line
          key="proj-start"
          points={[x, 0, x, stageHeight]}
          stroke={PROJECT_START_COLOR}
          strokeWidth={2.5}
          dash={[6, 3]}
          listening={false}
          perfectDrawEnabled={false}
        />
      );
      elements.push(
        <KonvaText
          key="proj-start-label"
          x={x + 3}
          y={4}
          text={`${t("timeline.startDate")} ${format(parseISO(projectStartDate), "d MMM", { locale })}`}
          fontSize={10}
          fontStyle="bold"
          fill={PROJECT_START_COLOR}
          listening={false}
          perfectDrawEnabled={false}
        />
      );
    }
  }

  // Project finish/goal date marker
  if (projectFinishDate) {
    const x = dateToX(parseISO(projectFinishDate), originDate, pixelsPerDay, panX);
    if (x >= -2 && x <= stageWidth + 2) {
      elements.push(
        <Line
          key="proj-finish"
          points={[x, 0, x, stageHeight]}
          stroke={PROJECT_FINISH_COLOR}
          strokeWidth={2.5}
          dash={[6, 3]}
          listening={false}
          perfectDrawEnabled={false}
        />
      );
      elements.push(
        <KonvaText
          key="proj-finish-label"
          x={x + 3}
          y={4}
          text={`${t("timeline.goal")} ${format(parseISO(projectFinishDate), "d MMM", { locale })}`}
          fontSize={10}
          fontStyle="bold"
          fill={PROJECT_FINISH_COLOR}
          listening={false}
          perfectDrawEnabled={false}
        />
      );
    }
  }

  return <Group listening={false}>{elements}</Group>;
};

export const TimelineGrid = React.memo(TimelineGridComponent);

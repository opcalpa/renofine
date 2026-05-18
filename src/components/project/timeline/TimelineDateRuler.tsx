import React, { useMemo, useRef, useState, useEffect } from "react";
import { Stage, Layer, Rect, Line, Text as KonvaText, Group } from "react-konva";
import { addDays, format, getISOWeek, getDay } from "date-fns";
import { sv } from "date-fns/locale";
import { dateToX, RULER_HEIGHT, isWeekend } from "./utils";

interface TimelineDateRulerProps {
  originDate: Date;
  pixelsPerDay: number;
  panX: number;
  stageWidth: number;
  daysToRender: number;
}

const MONTH_ROW_H = 20;
const WEEK_ROW_H = 18;
const DAY_ROW_H = RULER_HEIGHT - MONTH_ROW_H - WEEK_ROW_H;
const BG_COLOR = "#ffffff";
const BORDER_COLOR = "#e2e8f0";
const MONTH_TEXT_COLOR = "#1e293b";
const WEEK_TEXT_COLOR = "#475569";
const WEEK_BG_EVEN = "#f8fafc";
const WEEK_BG_ODD = "#ffffff";
const DAY_TEXT_COLOR = "#64748b";
const WEEKEND_TEXT_COLOR = "#94a3b8";

const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TimelineDateRulerComponent: React.FC<TimelineDateRulerProps> = ({
  originDate,
  pixelsPerDay,
  panX,
  stageWidth,
  daysToRender,
}) => {
  // Render only visible days — extends infinitely in both directions
  const firstVisibleDay = Math.floor(-panX / pixelsPerDay) - 2;
  const lastVisibleDay = Math.ceil((Math.max(stageWidth, 2000) - panX) / pixelsPerDay) + 2;
  const startDay = firstVisibleDay;
  const endDay = lastVisibleDay;

  const elements = useMemo(() => {
    const items: React.ReactNode[] = [];
    const renderedMonths = new Set<string>();
    const renderedWeeks = new Set<number>();

    for (let i = startDay; i <= endDay; i++) {
      const date = addDays(originDate, i);
      const x = dateToX(date, originDate, pixelsPerDay, panX);
      const dayOfWeek = getDay(date);
      const weekend = isWeekend(date);

      // Month labels - Row 1 (clamped to viewport, no overlap)
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
      if (!renderedMonths.has(monthKey)) {
        renderedMonths.add(monthKey);
        const fullLabel = format(date, "MMMM yyyy", { locale: sv }).toUpperCase();
        const shortLabel = format(date, "MMM yy", { locale: sv }).toUpperCase();
        const monthStartX = x + 6;
        // Calculate where next month starts to prevent overlap
        const nextMonthDate = new Date(date.getFullYear(), date.getMonth() + 1, 1);
        const nextMonthX = dateToX(nextMonthDate, originDate, pixelsPerDay, panX);
        const colWidth = nextMonthX - Math.max(6, monthStartX);
        // Pick the widest label that fits the month column; skip entirely if
        // even the short form would collide with the next month (anti-overlap
        // guard — keeps labels readable at any zoom level).
        const approx = (s: string) => s.length * 7 + 12;
        const label =
          colWidth >= approx(fullLabel)
            ? fullLabel
            : colWidth >= approx(shortLabel)
              ? shortLabel
              : null;
        if (label) {
          const labelWidth = label.length * 7;
          // Clamp: don't go left of viewport (sticky), but don't overlap next month
          const clampedX = Math.max(6, Math.min(monthStartX, nextMonthX - labelWidth - 12));
          items.push(
            <KonvaText
              key={`m-${monthKey}`}
              x={clampedX}
              y={4}
              text={label}
              fontSize={11}
              fontStyle="bold"
              fill={MONTH_TEXT_COLOR}
              listening={false}
            />
          );
        }
      }

      // Week number blocks - Row 2
      const weekNum = getISOWeek(date);
      const weekKey = weekNum * 10000 + date.getFullYear();
      if (!renderedWeeks.has(weekKey) && dayOfWeek === 1) {
        renderedWeeks.add(weekKey);
        const weekWidth = pixelsPerDay * 7;
        items.push(
          <Rect
            key={`wb-${weekKey}`}
            x={x}
            y={MONTH_ROW_H}
            width={weekWidth}
            height={WEEK_ROW_H}
            fill={weekNum % 2 === 0 ? WEEK_BG_EVEN : WEEK_BG_ODD}
            listening={false}
            perfectDrawEnabled={false}
          />
        );
        items.push(
          <KonvaText
            key={`w-${weekKey}`}
            x={x + 4}
            y={MONTH_ROW_H + 3}
            text={`V${weekNum}`}
            fontSize={11}
            fontStyle="bold"
            fill={WEEK_TEXT_COLOR}
            listening={false}
          />
        );
      }

      // Day labels - Row 3
      if (pixelsPerDay >= 28) {
        const dayLabel =
          pixelsPerDay >= 50
            ? `${date.getDate()} ${DAY_ABBR[dayOfWeek]}`
            : `${date.getDate()}`;
        items.push(
          <KonvaText
            key={`d-${i}`}
            x={x + 3}
            y={MONTH_ROW_H + WEEK_ROW_H + 4}
            text={dayLabel}
            fontSize={10}
            fill={weekend ? WEEKEND_TEXT_COLOR : DAY_TEXT_COLOR}
            listening={false}
          />
        );
      }

      // Day separator lines in ruler (day row only)
      items.push(
        <Line
          key={`rl-${i}`}
          points={[x, MONTH_ROW_H + WEEK_ROW_H, x, RULER_HEIGHT]}
          stroke={BORDER_COLOR}
          strokeWidth={0.5}
          listening={false}
          perfectDrawEnabled={false}
        />
      );

      // Month boundary line (full height)
      if (date.getDate() === 1) {
        items.push(
          <Line
            key={`ml-${monthKey}`}
            points={[x, 0, x, RULER_HEIGHT]}
            stroke="#94a3b8"
            strokeWidth={1.5}
            listening={false}
            perfectDrawEnabled={false}
          />
        );
      }
    }

    return items;
  }, [startDay, endDay, originDate, pixelsPerDay, panX]);

  // Use own ResizeObserver for accurate width (parent may not re-render with updated width)
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [actualWidth, setActualWidth] = useState(stageWidth);
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setActualWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const effectiveWidth = Math.max(actualWidth, stageWidth);

  return (
    <div ref={wrapperRef} className="w-full border-b">
    <Stage width={effectiveWidth} height={RULER_HEIGHT}>
      <Layer>
        {/* Background */}
        <Rect
          x={0} y={0}
          width={stageWidth} height={RULER_HEIGHT}
          fill={BG_COLOR}
          listening={false}
        />
        {/* Row separators */}
        <Line
          points={[0, MONTH_ROW_H, stageWidth, MONTH_ROW_H]}
          stroke={BORDER_COLOR} strokeWidth={0.5}
          listening={false}
        />
        <Line
          points={[0, MONTH_ROW_H + WEEK_ROW_H, stageWidth, MONTH_ROW_H + WEEK_ROW_H]}
          stroke={BORDER_COLOR} strokeWidth={0.5}
          listening={false}
        />
        {/* Bottom border */}
        <Line
          points={[0, RULER_HEIGHT - 1, stageWidth, RULER_HEIGHT - 1]}
          stroke={BORDER_COLOR} strokeWidth={1}
          listening={false}
        />
        <Group listening={false}>{elements}</Group>
      </Layer>
    </Stage>
    </div>
  );
};

export const TimelineDateRuler = React.memo(TimelineDateRulerComponent);

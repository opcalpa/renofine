/**
 * Selection Preview Overlay
 *
 * Renders preview shapes during selection/drawing operations:
 * - Box selection rectangle
 * - Room/rectangle creation preview
 * - Circle creation preview
 * - Bezier curve creation preview
 */

import React from 'react';
import { Group, Rect, Circle, Path, Arrow, Text } from 'react-konva';
import { Tool } from '../types';
import { formatMeasurement } from '../utils/formatting';

interface SelectionPreviewOverlayProps {
  isBoxSelecting: boolean;
  selectionBox: { start: { x: number; y: number }; end: { x: number; y: number } } | null;
  activeTool: Tool;
  zoom: number;
  /** Scale for converting the preview box (pixels) to a real length. */
  pixelsPerMm?: number;
  unit?: 'mm' | 'cm' | 'm';
}

/**
 * Small dimension chip (white pill + green text) drawn at a point, counter-scaled
 * so it stays a constant size on screen. `rotation` lets the side label read vertically.
 */
const DimChip: React.FC<{ x: number; y: number; text: string; zoom: number; rotation?: number }> = ({
  x,
  y,
  text,
  zoom,
  rotation = 0,
}) => {
  const fontSize = 12 / zoom;
  const pad = 4 / zoom;
  const w = text.length * fontSize * 0.62 + pad * 2;
  const h = fontSize + pad * 1.5;
  return (
    <Group x={x} y={y} rotation={rotation} listening={false}>
      <Rect x={-w / 2} y={-h / 2} width={w} height={h} fill="rgba(255,255,255,0.92)" cornerRadius={3 / zoom} />
      <Text
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        text={text}
        fontSize={fontSize}
        fill="#0e9f6e"
        align="center"
        verticalAlign="middle"
      />
    </Group>
  );
};

export const SelectionPreviewOverlay: React.FC<SelectionPreviewOverlayProps> = ({
  isBoxSelecting,
  selectionBox,
  activeTool,
  zoom,
  pixelsPerMm,
  unit = 'm',
}) => {
  if (!isBoxSelecting || !selectionBox) return null;

  const strokeWidth = 2 / zoom;
  const dash = [4 / zoom, 2 / zoom];

  // Connector arrow preview
  if (activeTool === 'connector') {
    const start = selectionBox.start;
    const end = selectionBox.end;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (Math.sqrt(dx * dx + dy * dy) < 5) return null;
    return (
      <Arrow
        points={[start.x, start.y, end.x, end.y]}
        stroke="#6366f1"
        fill="#6366f1"
        strokeWidth={strokeWidth}
        dash={dash}
        pointerLength={10 / zoom}
        pointerWidth={8 / zoom}
        listening={false}
        perfectDrawEnabled={false}
      />
    );
  }

  // Box selection/room/rectangle preview
  if (activeTool !== 'bezier' && activeTool !== 'circle') {
    const isCreationTool = activeTool === 'room' || activeTool === 'rectangle';
    const minX = Math.min(selectionBox.start.x, selectionBox.end.x);
    const minY = Math.min(selectionBox.start.y, selectionBox.end.y);
    const wPx = Math.abs(selectionBox.end.x - selectionBox.start.x);
    const hPx = Math.abs(selectionBox.end.y - selectionBox.start.y);

    // Live width/height chips at the midpoints of the top and left edges, so the
    // numbers update in real time as the room/rectangle is dragged out.
    const showDims = isCreationTool && pixelsPerMm && pixelsPerMm > 0 && (wPx > 2 || hPx > 2);

    return (
      <Group listening={false}>
        <Rect
          x={minX}
          y={minY}
          width={wPx}
          height={hPx}
          stroke={isCreationTool ? '#10b981' : '#3b82f6'}
          fill={isCreationTool ? 'rgba(16, 185, 129, 0.1)' : undefined}
          strokeWidth={strokeWidth}
          dash={dash}
          listening={false}
        />
        {showDims && (
          <>
            <DimChip x={minX + wPx / 2} y={minY} zoom={zoom} text={formatMeasurement(wPx / pixelsPerMm!, unit)} />
            <DimChip
              x={minX}
              y={minY + hPx / 2}
              zoom={zoom}
              rotation={-90}
              text={formatMeasurement(hPx / pixelsPerMm!, unit)}
            />
          </>
        )}
      </Group>
    );
  }

  // Circle preview
  if (activeTool === 'circle') {
    return (
      <Circle
        x={(selectionBox.start.x + selectionBox.end.x) / 2}
        y={(selectionBox.start.y + selectionBox.end.y) / 2}
        radius={Math.max(
          Math.abs(selectionBox.end.x - selectionBox.start.x),
          Math.abs(selectionBox.end.y - selectionBox.start.y)
        ) / 2}
        stroke="#3b82f6"
        fill="rgba(147, 197, 253, 0.2)"
        strokeWidth={strokeWidth}
        dash={dash}
        listening={false}
      />
    );
  }

  // Bezier curve preview
  if (activeTool === 'bezier') {
    const start = selectionBox.start;
    const end = selectionBox.end;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < 10) return null;

    // Calculate control point preview
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    const perpX = -dy;
    const perpY = dx;
    const perpLength = Math.sqrt(perpX * perpX + perpY * perpY);
    const curveAmount = distance * 0.3;
    const controlX = midX + (perpX / perpLength) * curveAmount;
    const controlY = midY + (perpY / perpLength) * curveAmount;

    const pathData = `M ${start.x} ${start.y} Q ${controlX} ${controlY} ${end.x} ${end.y}`;

    return (
      <Group listening={false}>
        <Path
          data={pathData}
          stroke="#8b5cf6"
          strokeWidth={strokeWidth}
          dash={dash}
          fill="transparent"
        />
        {/* Control point indicator */}
        <Circle
          x={controlX}
          y={controlY}
          radius={4 / zoom}
          fill="#8b5cf6"
          opacity={0.5}
        />
        {/* Start point */}
        <Circle
          x={start.x}
          y={start.y}
          radius={3 / zoom}
          fill="white"
          stroke="#8b5cf6"
          strokeWidth={1 / zoom}
        />
        {/* End point */}
        <Circle
          x={end.x}
          y={end.y}
          radius={3 / zoom}
          fill="white"
          stroke="#8b5cf6"
          strokeWidth={1 / zoom}
        />
      </Group>
    );
  }

  return null;
};

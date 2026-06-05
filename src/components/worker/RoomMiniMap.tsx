/**
 * RoomMiniMap — renders a simplified floor plan SVG with one room highlighted.
 * Uses raw polygon points from floor_map_shapes (no Konva dependency).
 * Lightweight for mobile worker view.
 *
 * Three rendering modes (automatic):
 * 1. Background image + room polygons → image with colored room overlays
 * 2. Room polygons only → SVG minimap with highlighted room
 * 3. No data → renders nothing
 *
 * W1 (room-item instruction view): placed objects in the highlighted room are
 * drawn as tappable markers. Tapping one shows its logged info (title, install
 * status, qty, product link) and a per-category filter lets the worker focus on
 * one trade at a time — turning the drawing into an instruction.
 */
import { useMemo, useState } from "react";
import {
  CATEGORY_COLORS,
  CategoryFilterChips,
  ObjectInfoCard,
  type FloorPlanObject,
} from "./roomObjectShared";
import { ZoomPanSvg } from "./ZoomPanSvg";

export type { FloorPlanObject };

interface FloorPlanShape {
  id: string;
  roomId: string | null;
  points: Array<{ x: number; y: number }>;
  color: string;
  strokeColor: string;
  name: string | null;
}

interface FloorPlanImage {
  url: string;
  x: number;
  y: number;
}

interface RoomMiniMapProps {
  shapes: FloorPlanShape[];
  highlightRoomId: string | null;
  /** Background image from canvas (uploaded floor plan / architect drawing) */
  backgroundImage?: FloorPlanImage | null;
  /** Placed room-items (objects) across assigned rooms; filtered to the highlighted room. */
  objects?: FloorPlanObject[];
  /** Worker token — when set, the info card lets the worker ask a question (W3). */
  token?: string;
  className?: string;
}

function pointsToSvgPath(points: Array<{ x: number; y: number }>): string {
  if (points.length < 2) return "";
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ") + " Z";
}

function findCenter(points: Array<{ x: number; y: number }>): { x: number; y: number } {
  const x = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const y = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  return { x, y };
}

export function RoomMiniMap({
  shapes,
  highlightRoomId,
  backgroundImage,
  objects,
  token,
  className,
}: RoomMiniMapProps) {
  const validShapes = (shapes || []).filter(
    (s) => Array.isArray(s.points) && s.points.length >= 3
  );

  // Objects belonging to the room this card is about.
  const roomObjects = useMemo(
    () => (objects || []).filter((o) => o.roomId === highlightRoomId),
    [objects, highlightRoomId]
  );

  const presentCategories = useMemo(() => {
    const seen: string[] = [];
    for (const o of roomObjects) if (!seen.includes(o.category)) seen.push(o.category);
    return seen;
  }, [roomObjects]);

  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const visibleObjects = useMemo(
    () => roomObjects.filter((o) => !hiddenCategories.has(o.category)),
    [roomObjects, hiddenCategories]
  );

  const selected = useMemo(
    () => roomObjects.find((o) => o.id === selectedId) || null,
    [roomObjects, selectedId]
  );

  // Nothing to render
  if (validShapes.length === 0 && !backgroundImage?.url && roomObjects.length === 0) {
    return null;
  }

  // Bounding box of shapes + object markers (so markers never clip).
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const shape of validShapes) {
    for (const p of shape.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  for (const o of roomObjects) {
    if (o.x < minX) minX = o.x;
    if (o.y < minY) minY = o.y;
    if (o.x > maxX) maxX = o.x;
    if (o.y > maxY) maxY = o.y;
  }

  if (validShapes.length === 0 && roomObjects.length === 0 && backgroundImage) {
    minX = backgroundImage.x;
    minY = backgroundImage.y;
    maxX = backgroundImage.x + 10000;
    maxY = backgroundImage.y + 7000;
  }

  if (!Number.isFinite(minX)) return null;

  const width = maxX - minX || 1;
  const height = maxY - minY || 1;
  const padding = Math.max(width, height) * 0.1;
  const vbX = minX - padding;
  const vbY = minY - padding;
  const vbW = width + padding * 2;
  const vbH = height + padding * 2;

  const strokeScale = Math.max(vbW, vbH);
  const markerR = strokeScale * 0.035;

  return (
    <div className="space-y-2">
      {presentCategories.length > 1 && (
        <CategoryFilterChips
          categories={presentCategories}
          hidden={hiddenCategories}
          onToggle={(cat) =>
            setHiddenCategories((prev) => {
              const next = new Set(prev);
              if (next.has(cat)) next.delete(cat);
              else next.add(cat);
              return next;
            })
          }
        />
      )}

      <ZoomPanSvg viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`} className={className} maxHeight={168}>
        {backgroundImage?.url && (
          <image
            href={backgroundImage.url}
            x={backgroundImage.x}
            y={backgroundImage.y}
            width={width}
            height={height}
            preserveAspectRatio="xMidYMid meet"
            opacity={0.4}
          />
        )}

        {validShapes.map((shape) => {
          const isHighlighted = shape.roomId === highlightRoomId;
          return (
            <g key={shape.id}>
              <path
                d={pointsToSvgPath(shape.points)}
                fill={
                  isHighlighted
                    ? "rgba(34, 197, 94, 0.3)"
                    : backgroundImage?.url
                      ? "rgba(229, 231, 235, 0.15)"
                      : "rgba(229, 231, 235, 0.4)"
                }
                stroke={isHighlighted ? "#16a34a" : "#d1d5db"}
                strokeWidth={isHighlighted ? strokeScale * 0.005 : strokeScale * 0.003}
              />
              {shape.name && (
                <text
                  x={findCenter(shape.points).x}
                  y={findCenter(shape.points).y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={strokeScale * 0.035}
                  fontWeight={isHighlighted ? 600 : 400}
                  fill={isHighlighted ? "#15803d" : "#9ca3af"}
                  paintOrder="stroke"
                  stroke={backgroundImage?.url ? "rgba(255,255,255,0.8)" : "none"}
                  strokeWidth={backgroundImage?.url ? strokeScale * 0.008 : 0}
                >
                  {shape.name}
                </text>
              )}
            </g>
          );
        })}

        {visibleObjects.map((o) => {
          const color = CATEGORY_COLORS[o.category] || "#6b7280";
          const installed = o.installStatus === "installed";
          const isSelected = o.id === selectedId;
          return (
            <g
              key={o.id}
              style={{ cursor: "pointer" }}
              onClick={() => setSelectedId(isSelected ? null : o.id)}
            >
              <circle cx={o.x} cy={o.y} r={markerR * 1.9} fill="transparent" />
              <circle
                cx={o.x}
                cy={o.y}
                r={markerR}
                fill={installed ? color : "#ffffff"}
                stroke={color}
                strokeWidth={markerR * (isSelected ? 0.5 : 0.32)}
                opacity={0.95}
              />
              {isSelected && (
                <circle
                  cx={o.x}
                  cy={o.y}
                  r={markerR * 1.5}
                  fill="none"
                  stroke={color}
                  strokeWidth={markerR * 0.22}
                  opacity={0.6}
                />
              )}
            </g>
          );
        })}
      </ZoomPanSvg>

      {selected && <ObjectInfoCard object={selected} token={token} />}
    </div>
  );
}

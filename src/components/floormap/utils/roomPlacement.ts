/**
 * Room Placement Utility
 * Calculates grid positions for placing imported rooms on the canvas
 */

import { FloorMapShape, PolygonCoordinates } from '../types';
import { ExtractedRoom } from '@/services/aiDocumentService.types';

interface RoomPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const GAP_MM = 500; // 500mm gap between rooms
const MAX_ROW_WIDTH_MM = 20000; // 20m max width before wrapping
const DEFAULT_ROOM_SIZE_MM = 3000; // 3m default if no area specified
const MIN_ROOM_SIZE_MM = 2000; // 2m minimum room size

/**
 * Calculate bounding box of existing shapes
 */
function getExistingShapesBoundingBox(shapes: FloorMapShape[]): BoundingBox | null {
  if (shapes.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const shape of shapes) {
    const coords = shape.coordinates;

    if ('points' in coords) {
      // Polygon/Room
      const points = (coords as PolygonCoordinates).points;
      for (const point of points) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }
    } else if ('x1' in coords) {
      // Line/Wall
      const lineCoords = coords as { x1: number; y1: number; x2: number; y2: number };
      minX = Math.min(minX, lineCoords.x1, lineCoords.x2);
      minY = Math.min(minY, lineCoords.y1, lineCoords.y2);
      maxX = Math.max(maxX, lineCoords.x1, lineCoords.x2);
      maxY = Math.max(maxY, lineCoords.y1, lineCoords.y2);
    } else if ('left' in coords) {
      // Rectangle
      const rectCoords = coords as { left: number; top: number; width: number; height: number };
      minX = Math.min(minX, rectCoords.left);
      minY = Math.min(minY, rectCoords.top);
      maxX = Math.max(maxX, rectCoords.left + rectCoords.width);
      maxY = Math.max(maxY, rectCoords.top + rectCoords.height);
    } else if ('x' in coords && 'y' in coords) {
      // Symbol/Text
      const symbolCoords = coords as { x: number; y: number; width?: number; height?: number };
      minX = Math.min(minX, symbolCoords.x);
      minY = Math.min(minY, symbolCoords.y);
      maxX = Math.max(maxX, symbolCoords.x + (symbolCoords.width || 0));
      maxY = Math.max(maxY, symbolCoords.y + (symbolCoords.height || 0));
    } else if ('cx' in coords) {
      // Circle
      const circleCoords = coords as { cx: number; cy: number; radius: number };
      minX = Math.min(minX, circleCoords.cx - circleCoords.radius);
      minY = Math.min(minY, circleCoords.cy - circleCoords.radius);
      maxX = Math.max(maxX, circleCoords.cx + circleCoords.radius);
      maxY = Math.max(maxY, circleCoords.cy + circleCoords.radius);
    }
  }

  if (minX === Infinity) return null;

  return { minX, minY, maxX, maxY };
}

/**
 * Calculate room dimensions from estimated area in m²
 * Returns dimensions in mm
 */
function calculateRoomDimensions(estimatedAreaSqm: number | null): { width: number; height: number } {
  if (!estimatedAreaSqm || estimatedAreaSqm <= 0) {
    return { width: DEFAULT_ROOM_SIZE_MM, height: DEFAULT_ROOM_SIZE_MM };
  }

  // Convert m² to mm² and calculate side length for roughly square room
  const areaMm2 = estimatedAreaSqm * 1_000_000; // 1 m² = 1,000,000 mm²
  const sideLength = Math.sqrt(areaMm2);

  // Ensure minimum size
  const finalSize = Math.max(sideLength, MIN_ROOM_SIZE_MM);

  return { width: finalSize, height: finalSize };
}

/**
 * Calculate grid placements for rooms
 *
 * @param rooms - Rooms to place
 * @param existingShapes - Existing shapes on canvas
 * @param gridInterval - Grid snap interval in mm
 * @returns Map of room index to placement coordinates
 */
export function calculateGridPlacements(
  rooms: ExtractedRoom[],
  existingShapes: FloorMapShape[],
  gridInterval: number = 100
): Map<number, RoomPlacement> {
  const placements = new Map<number, RoomPlacement>();

  if (rooms.length === 0) return placements;

  // Find starting position (to the right of existing shapes, or at origin)
  const existingBounds = getExistingShapesBoundingBox(existingShapes);

  // Start 1m (1000mm) to the right of existing shapes, or at (1000, 1000) if empty
  const startX = existingBounds
    ? Math.ceil((existingBounds.maxX + 1000) / gridInterval) * gridInterval
    : 1000;
  const startY = existingBounds
    ? Math.ceil(existingBounds.minY / gridInterval) * gridInterval
    : 1000;

  let currentX = startX;
  let currentY = startY;
  let rowHeight = 0;

  for (let i = 0; i < rooms.length; i++) {
    const room = rooms[i];
    const { width, height } = calculateRoomDimensions(room.estimatedAreaSqm);

    // Snap dimensions to grid
    const snappedWidth = Math.ceil(width / gridInterval) * gridInterval;
    const snappedHeight = Math.ceil(height / gridInterval) * gridInterval;

    // Check if we need to wrap to next row
    if (currentX + snappedWidth > startX + MAX_ROW_WIDTH_MM && currentX !== startX) {
      currentX = startX;
      currentY += rowHeight + GAP_MM;
      rowHeight = 0;
    }

    // Place room
    placements.set(i, {
      x: currentX,
      y: currentY,
      width: snappedWidth,
      height: snappedHeight,
    });

    // Update position for next room
    currentX += snappedWidth + GAP_MM;
    rowHeight = Math.max(rowHeight, snappedHeight);
  }

  return placements;
}

/**
 * Create room polygon points from placement
 */
export function createRoomPoints(placement: RoomPlacement): { x: number; y: number }[] {
  const { x, y, width, height } = placement;

  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

/**
 * Whether a room has been placed on the floor-plan canvas, and its polygon.
 *
 * `floor_plan_position` is stored DOUBLE-NESTED — the polygon array lives at
 * `floor_plan_position.points.points` (placement writes `{ points: shape.coordinates }`
 * and `coordinates` is itself `{ points: [...] }`). Older/other writes may be flat
 * (`floor_plan_position.points` is the array). Accept both, otherwise every placed
 * room reads as un-placed (grey map-pin) instead of green + jump-to-canvas.
 */
export function getRoomPlacementPoints(
  room: { floor_plan_position?: unknown } | null | undefined
): { x: number; y: number }[] | null {
  const fpp = room?.floor_plan_position as { points?: unknown } | null | undefined;
  if (!fpp || typeof fpp !== "object") return null;

  const p = fpp.points as unknown;
  if (Array.isArray(p)) return p as { x: number; y: number }[];
  if (p && typeof p === "object" && Array.isArray((p as { points?: unknown }).points)) {
    return (p as { points: { x: number; y: number }[] }).points;
  }
  return null;
}

export function isRoomPlacedOnCanvas(
  room: { floor_plan_position?: unknown } | null | undefined
): boolean {
  const pts = getRoomPlacementPoints(room);
  return !!pts && pts.length > 0;
}

/**
 * Calculate area of room in square meters from polygon points
 */
export function calculateAreaFromPoints(points: { x: number; y: number }[]): number {
  if (points.length < 3) return 0;

  // Shoelace formula for polygon area
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  area = Math.abs(area) / 2;

  // Convert from mm² to m²
  return area / 1_000_000;
}

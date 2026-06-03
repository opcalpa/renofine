/**
 * Room Edge Snapping
 *
 * Magnetic snapping of a room's rectangular bounds to neighbouring rooms' edges.
 * This is what makes adjacent rooms share an exact boundary line — which in turn
 * lets the auto-wall dedup (generateWallsFromRooms) collapse two facing walls into
 * a single shared wall, so the plan reads like a real floor plan instead of loose
 * boxes with doubled outlines.
 *
 * Coordinates are in canvas world pixels (the same space room polygon points use).
 */

import type { FloorMapShape, PolygonCoordinates } from '../../types';

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Magnet range, scaled so it feels constant on screen regardless of zoom. */
const SNAP_SCREEN_PX = 16;

export const getEdgeSnapThreshold = (zoom: number): number =>
  SNAP_SCREEN_PX / Math.max(zoom, 0.0001);

/** Axis-aligned bounding box of a room polygon, or null if it has no points. */
export const getRoomBBox = (shape: FloorMapShape): BBox | null => {
  if (shape.type !== 'room') return null;
  const points = (shape.coordinates as PolygonCoordinates)?.points;
  if (!points || points.length < 2) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
};

/** Bounding boxes of every room on a plan, excluding the given shape ids. */
export const collectRoomBBoxes = (
  shapes: FloorMapShape[],
  planId: string | null,
  excludeIds: string[] = []
): BBox[] => {
  const exclude = new Set(excludeIds);
  const boxes: BBox[] = [];
  for (const s of shapes) {
    if (s.type !== 'room' || s.planId !== planId || exclude.has(s.id)) continue;
    const box = getRoomBBox(s);
    if (box) boxes.push(box);
  }
  return boxes;
};

/** Snap a single value to the nearest candidate within threshold (else unchanged). */
const snapValue = (value: number, candidates: number[], threshold: number): number => {
  let best = value;
  let bestDist = threshold;
  for (const c of candidates) {
    const d = Math.abs(value - c);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
};

/**
 * Snap each edge of a freshly-drawn rectangle independently to the nearest
 * neighbour edge line. Edges may move independently (the rectangle can change
 * size slightly) — exactly what you want when sketching a room against others.
 * Collapsing edges are rejected via minSize.
 */
export const snapRectEdgesToRooms = (
  rect: BBox,
  neighbors: BBox[],
  threshold: number,
  minSize = 1
): BBox => {
  if (neighbors.length === 0) return rect;
  const xs = neighbors.flatMap((n) => [n.minX, n.maxX]);
  const ys = neighbors.flatMap((n) => [n.minY, n.maxY]);

  const minX = snapValue(rect.minX, xs, threshold);
  const maxX = snapValue(rect.maxX, xs, threshold);
  const minY = snapValue(rect.minY, ys, threshold);
  const maxY = snapValue(rect.maxY, ys, threshold);

  return {
    minX,
    minY,
    // Reject an edge snap that would collapse the rectangle.
    maxX: maxX - minX >= minSize ? maxX : rect.maxX - (rect.minX - minX),
    maxY: maxY - minY >= minSize ? maxY : rect.maxY - (rect.minY - minY),
  };
};

/**
 * Compute a rigid translation nudge so that ONE of the rectangle's edges aligns
 * with the nearest neighbour edge on each axis (size preserved). Returns {dx, dy}
 * to add to the rectangle's position; 0 on an axis when nothing is within range.
 * Use for placing a room from the room list and for dragging an existing room.
 */
export const edgeSnapNudge = (
  rect: BBox,
  neighbors: BBox[],
  threshold: number
): { dx: number; dy: number } => {
  if (neighbors.length === 0) return { dx: 0, dy: 0 };
  const xs = neighbors.flatMap((n) => [n.minX, n.maxX]);
  const ys = neighbors.flatMap((n) => [n.minY, n.maxY]);

  // Best (smallest) nudge over both moving edges on an axis.
  const bestNudge = (edges: number[], candidates: number[]): number => {
    let nudge = 0;
    let bestDist = threshold;
    for (const e of edges) {
      for (const c of candidates) {
        const d = c - e;
        if (Math.abs(d) < bestDist) {
          bestDist = Math.abs(d);
          nudge = d;
        }
      }
    }
    return nudge;
  };

  return {
    dx: bestNudge([rect.minX, rect.maxX], xs),
    dy: bestNudge([rect.minY, rect.maxY], ys),
  };
};

/** Closest point on segment a→b to point p, plus the segment's unit direction. */
const projectOnSegment = (
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
): { point: { x: number; y: number }; dir: { x: number; y: number }; dist: number } => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  const point = { x: a.x + t * dx, y: a.y + t * dy };
  const len = Math.sqrt(len2) || 1;
  return { point, dir: { x: dx / len, y: dy / len }, dist: Math.hypot(p.x - point.x, p.y - point.y) };
};

/**
 * Model A door placement: snap a door/opening onto the nearest room edge (the
 * shared boundary that reads as the wall) within threshold. Returns line coords
 * of length `lengthPx` centred on the projection and aligned to the edge, or null
 * when no edge is close enough. No wall objects are touched — so no fragments.
 */
export const snapDoorToRoomEdge = (
  mid: { x: number; y: number },
  lengthPx: number,
  rooms: FloorMapShape[],
  planId: string | null,
  threshold: number
): { x1: number; y1: number; x2: number; y2: number } | null => {
  let best: { point: { x: number; y: number }; dir: { x: number; y: number } } | null = null;
  let bestDist = threshold;
  for (const room of rooms) {
    if (room.type !== 'room' || room.planId !== planId) continue;
    const pts = (room.coordinates as PolygonCoordinates)?.points;
    if (!pts || pts.length < 2) continue;
    for (let i = 0; i < pts.length; i++) {
      const proj = projectOnSegment(mid, pts[i], pts[(i + 1) % pts.length]);
      if (proj.dist < bestDist) {
        bestDist = proj.dist;
        best = { point: proj.point, dir: proj.dir };
      }
    }
  }
  if (!best) return null;
  const half = lengthPx / 2;
  return {
    x1: best.point.x - best.dir.x * half,
    y1: best.point.y - best.dir.y * half,
    x2: best.point.x + best.dir.x * half,
    y2: best.point.y + best.dir.y * half,
  };
};

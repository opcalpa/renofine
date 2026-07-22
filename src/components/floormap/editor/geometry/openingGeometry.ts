/**
 * Geometry for wall-hosted openings (doors/windows/sliding/passage).
 *
 * An opening stores no world geometry of its own: parentWallId +
 * positionOnWall (0–1, center) + metadata.widthMM. Everything renderable is
 * derived from the host wall here, so openings follow the wall automatically
 * when it moves.
 */

import { FloorMapShape, LineCoordinates } from '../../types';
import { formatWorldAsMm, mmToWorld } from '../core/units';

export interface Point {
  x: number;
  y: number;
}

export const OPENING_DEFAULT_WIDTH_MM: Record<string, number> = {
  door: 890, // Swedish M9
  window: 1200,
  sliding: 1590,
  passage: 900,
};

export interface WallFrame {
  a: Point;
  b: Point;
  length: number;
  /** Unit vector along the wall. */
  u: Point;
  /** Unit normal. */
  n: Point;
  halfThickness: number;
}

export function wallFrame(wall: FloorMapShape): WallFrame | null {
  if (!wall.coordinates || !('x1' in (wall.coordinates as object))) return null;
  const c = wall.coordinates as LineCoordinates;
  const length = Math.hypot(c.x2 - c.x1, c.y2 - c.y1);
  if (length === 0) return null;
  const u = { x: (c.x2 - c.x1) / length, y: (c.y2 - c.y1) / length };
  return {
    a: { x: c.x1, y: c.y1 },
    b: { x: c.x2, y: c.y2 },
    length,
    u,
    n: { x: -u.y, y: u.x },
    halfThickness: mmToWorld(wall.thicknessMM ?? 100) / 2,
  };
}

/** Project a world point onto a wall; returns t (0–1) and distance to the centerline. */
export function projectOntoWall(point: Point, frame: WallFrame): { t: number; distance: number } {
  const relX = point.x - frame.a.x;
  const relY = point.y - frame.a.y;
  const along = relX * frame.u.x + relY * frame.u.y;
  const t = along / frame.length;
  const clamped = Math.max(0, Math.min(1, t));
  const closest = {
    x: frame.a.x + frame.u.x * clamped * frame.length,
    y: frame.a.y + frame.u.y * clamped * frame.length,
  };
  return { t: clamped, distance: Math.hypot(point.x - closest.x, point.y - closest.y) };
}

/** Clamp positionOnWall so the whole opening stays on the wall. */
export function clampPosition(t: number, widthWorld: number, frame: WallFrame): number {
  const halfT = widthWorld / 2 / frame.length;
  if (frame.length <= widthWorld) return 0.5;
  return Math.max(halfT, Math.min(1 - halfT, t));
}

export interface OpeningPlacement {
  center: Point;
  /** Quad covering the wall body at the opening (for the graphic cut). */
  rect: Point[];
  /** Opening edge points on the centerline (start side, end side). */
  edgeStart: Point;
  edgeEnd: Point;
  widthWorld: number;
  frame: WallFrame;
}

export function openingPlacement(
  opening: Pick<FloorMapShape, 'positionOnWall' | 'metadata'>,
  wall: FloorMapShape
): OpeningPlacement | null {
  const frame = wallFrame(wall);
  if (!frame) return null;
  const widthWorld = mmToWorld((opening.metadata?.widthMM as number) ?? 900);
  const t = clampPosition(opening.positionOnWall ?? 0.5, widthWorld, frame);
  const center = {
    x: frame.a.x + frame.u.x * t * frame.length,
    y: frame.a.y + frame.u.y * t * frame.length,
  };
  const hw = widthWorld / 2;
  const ht = frame.halfThickness + 0.25; // slight overdraw so the cut fully covers the wall fill
  const { u, n } = frame;
  const rect = [
    { x: center.x - u.x * hw + n.x * ht, y: center.y - u.y * hw + n.y * ht },
    { x: center.x + u.x * hw + n.x * ht, y: center.y + u.y * hw + n.y * ht },
    { x: center.x + u.x * hw - n.x * ht, y: center.y + u.y * hw - n.y * ht },
    { x: center.x - u.x * hw - n.x * ht, y: center.y - u.y * hw - n.y * ht },
  ];
  return {
    center,
    rect,
    edgeStart: { x: center.x - u.x * hw, y: center.y - u.y * hw },
    edgeEnd: { x: center.x + u.x * hw, y: center.y + u.y * hw },
    widthWorld,
    frame,
  };
}

/**
 * Corner-distance readout while sliding/placing an opening: one guide from
 * each wall end to the nearest opening edge, labelled in mm. Rendered by the
 * OverlayLayer's snap-guide pass.
 */
export function openingCornerGuides(
  opening: Pick<FloorMapShape, 'positionOnWall' | 'metadata'>,
  wall: FloorMapShape
): { from: Point; to: Point; distanceLabel: string }[] {
  const placement = openingPlacement(opening, wall);
  if (!placement) return [];
  const { frame, edgeStart, edgeEnd } = placement;
  const startDist = Math.hypot(edgeStart.x - frame.a.x, edgeStart.y - frame.a.y);
  const endDist = Math.hypot(frame.b.x - edgeEnd.x, frame.b.y - edgeEnd.y);
  return [
    { from: frame.a, to: edgeStart, distanceLabel: formatWorldAsMm(startDist) },
    { from: edgeEnd, to: frame.b, distanceLabel: formatWorldAsMm(endDist) },
  ];
}

/** Nearest wall on the plan within a world-distance threshold. */
export function findNearestWall(
  point: Point,
  shapes: FloorMapShape[],
  planId: string | null,
  maxDistance: number
): { wall: FloorMapShape; t: number } | null {
  let best: { wall: FloorMapShape; t: number; distance: number } | null = null;
  for (const shape of shapes) {
    if (shape.type !== 'wall') continue;
    if (planId && shape.planId && shape.planId !== planId) continue;
    const frame = wallFrame(shape);
    if (!frame) continue;
    const { t, distance } = projectOntoWall(point, frame);
    if (distance < maxDistance && (!best || distance < best.distance)) {
      best = { wall: shape, t, distance };
    }
  }
  return best ? { wall: best.wall, t: best.t } : null;
}

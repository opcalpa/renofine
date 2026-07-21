/**
 * Wall graph — derived, never persisted.
 *
 * Walls are stored as centerline segments with thickness. This module merges
 * endpoints into junctions and computes a mitered outline polygon per wall so
 * corners and T-junctions render as clean joins instead of overlapping
 * rectangles. Memoized on the wall array identity (structural sharing from
 * the patch executor makes that cheap).
 */

import { FloorMapShape, LineCoordinates } from '../../types';
import { mmToWorld } from '../core/units';

export interface Point {
  x: number;
  y: number;
}

export interface Junction {
  id: string;
  at: Point;
  /** Wall ids + which end ('start' | 'end') meets here. */
  ends: { wallId: string; end: 'start' | 'end' }[];
}

export interface WallOutline {
  wallId: string;
  /** Quad polygon in world coords: [startLeft, endLeft, endRight, startRight]. */
  points: Point[];
}

export interface WallGraph {
  junctions: Junction[];
  junctionByWallEnd: Map<string, Junction>; // key `${wallId}:start|end`
  outlines: WallOutline[];
}

const JUNCTION_MERGE_EPS = 0.5; // world units

const isWallShape = (s: FloorMapShape): s is FloorMapShape & { coordinates: LineCoordinates } =>
  s.type === 'wall' && !!s.coordinates && 'x1' in (s.coordinates as object);

interface WallSeg {
  id: string;
  a: Point;
  b: Point;
  halfWidth: number; // world units
}

function buildJunctions(walls: WallSeg[]): Junction[] {
  const junctions: Junction[] = [];
  const find = (p: Point) =>
    junctions.find((j) => Math.hypot(j.at.x - p.x, j.at.y - p.y) < JUNCTION_MERGE_EPS);
  for (const wall of walls) {
    for (const end of ['start', 'end'] as const) {
      const p = end === 'start' ? wall.a : wall.b;
      let junction = find(p);
      if (!junction) {
        junction = { id: `j${junctions.length}`, at: { ...p }, ends: [] };
        junctions.push(junction);
      }
      junction.ends.push({ wallId: wall.id, end });
    }
  }
  return junctions;
}

/** Angle of the wall pointing AWAY from the junction. */
function outwardAngle(wall: WallSeg, end: 'start' | 'end'): number {
  const from = end === 'start' ? wall.a : wall.b;
  const to = end === 'start' ? wall.b : wall.a;
  return Math.atan2(to.y - from.y, to.x - from.x);
}

/**
 * Compute the two outline corner points where `wall` meets `junction`.
 * At a clean 2-wall corner the edges are intersected (miter); at free ends
 * and junctions of 3+ walls we fall back to a butt cap (no extension).
 */
function cornerPoints(
  wall: WallSeg,
  end: 'start' | 'end',
  junction: Junction,
  wallsById: Map<string, WallSeg>
): { left: Point; right: Point } {
  const at = junction.at;
  const theta = outwardAngle(wall, end); // direction away from junction
  const nx = -Math.sin(theta);
  const ny = Math.cos(theta);
  const hw = wall.halfWidth;

  const butt = {
    left: { x: at.x + nx * hw, y: at.y + ny * hw },
    right: { x: at.x - nx * hw, y: at.y - ny * hw },
  };

  const others = junction.ends.filter((e) => !(e.wallId === wall.id && e.end === end));
  if (others.length !== 1) return butt;

  const other = wallsById.get(others[0].wallId);
  if (!other) return butt;
  const phi = outwardAngle(other, others[0].end);

  // Nearly straight or fully overlapping — no miter needed/possible.
  let delta = phi - theta;
  while (delta <= -Math.PI) delta += 2 * Math.PI;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  if (Math.abs(Math.abs(delta) - Math.PI) < 0.05 || Math.abs(delta) < 0.05) return butt;

  const onx = -Math.sin(phi);
  const ony = Math.cos(phi);
  const ohw = other.halfWidth;

  // Intersect corresponding offset edges. Our left edge pairs with the other
  // wall's right edge (both bound the same region between the two walls).
  const intersect = (p1: Point, d1: Point, p2: Point, d2: Point): Point | null => {
    const det = d1.x * d2.y - d1.y * d2.x;
    if (Math.abs(det) < 1e-9) return null;
    const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / det;
    return { x: p1.x + d1.x * t, y: p1.y + d1.y * t };
  };

  const dir = { x: Math.cos(theta), y: Math.sin(theta) };
  const odir = { x: Math.cos(phi), y: Math.sin(phi) };
  const MITER_LIMIT = Math.max(hw, ohw) * 4;

  const clamp = (p: Point | null, fallback: Point): Point => {
    if (!p) return fallback;
    if (Math.hypot(p.x - at.x, p.y - at.y) > MITER_LIMIT) return fallback;
    return p;
  };

  const left = clamp(
    intersect(
      { x: at.x + nx * hw, y: at.y + ny * hw },
      dir,
      { x: at.x - onx * ohw, y: at.y - ony * ohw },
      odir
    ),
    butt.left
  );
  const right = clamp(
    intersect(
      { x: at.x - nx * hw, y: at.y - ny * hw },
      dir,
      { x: at.x + onx * ohw, y: at.y + ony * ohw },
      odir
    ),
    butt.right
  );
  return { left, right };
}

function computeGraph(shapes: FloorMapShape[], planId: string | null): WallGraph {
  const walls: WallSeg[] = shapes
    .filter((s) => isWallShape(s) && (!planId || s.planId === planId))
    .map((s) => {
      const c = s.coordinates as LineCoordinates;
      return {
        id: s.id,
        a: { x: c.x1, y: c.y1 },
        b: { x: c.x2, y: c.y2 },
        halfWidth: mmToWorld(s.thicknessMM ?? 100) / 2,
      };
    })
    .filter((w) => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) > JUNCTION_MERGE_EPS);

  const wallsById = new Map(walls.map((w) => [w.id, w]));
  const junctions = buildJunctions(walls);
  const junctionByWallEnd = new Map<string, Junction>();
  for (const junction of junctions) {
    for (const end of junction.ends) {
      junctionByWallEnd.set(`${end.wallId}:${end.end}`, junction);
    }
  }

  const outlines: WallOutline[] = walls.map((wall) => {
    const startJ = junctionByWallEnd.get(`${wall.id}:start`)!;
    const endJ = junctionByWallEnd.get(`${wall.id}:end`)!;
    const start = cornerPoints(wall, 'start', startJ, wallsById);
    const end = cornerPoints(wall, 'end', endJ, wallsById);
    // Wind the quad consistently: start.left/right are relative to the
    // outward-from-start direction; end corners are relative to the opposite
    // direction, so end.left pairs with start.right.
    return {
      wallId: wall.id,
      points: [start.left, end.right, end.left, start.right],
    };
  });

  return { junctions, junctionByWallEnd, outlines };
}

let cache: { shapes: FloorMapShape[]; planId: string | null; graph: WallGraph } | null = null;

export function getWallGraph(shapes: FloorMapShape[], planId: string | null): WallGraph {
  if (cache && cache.shapes === shapes && cache.planId === planId) return cache.graph;
  const graph = computeGraph(shapes, planId);
  cache = { shapes, planId, graph };
  return graph;
}

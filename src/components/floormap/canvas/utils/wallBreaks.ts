/**
 * Wall Breaks (Model A)
 *
 * Computes, at render time, how a room's outline-wall is broken by openings
 * (doors / windows / plain wall openings) sitting on its edges. This is a PURE
 * geometric computation — it never creates wall objects in the store, so it can't
 * leave behind the orphaned wall fragments the old wall-splitting system did.
 *
 * For each polygon edge it returns the visible wall sub-segments (the solid bits
 * between/around openings) and the opening gaps, each with a real length in mm so
 * both the wall lengths and the opening widths can be labelled.
 *
 * All coordinates are canvas world pixels.
 */

import type { FloorMapShape, LineCoordinates } from '../../types';

export interface WallSegment {
  x1: number; y1: number; x2: number; y2: number;
  lengthMm: number;
}
export interface OpeningGap extends WallSegment {}

const OPENING_TYPES = new Set(['door_line', 'window_line', 'sliding_door_line', 'opening_line']);

export const isOpeningShape = (s: FloorMapShape): boolean => OPENING_TYPES.has(s.type);

/**
 * @param points     room polygon vertices (px)
 * @param openings   opening shapes on the same plan
 * @param pixelsPerMm scale, to derive lengths in mm
 * @param tolerancePx perpendicular distance within which an opening counts as "on" an edge
 */
export const computeRoomWallBreaks = (
  points: { x: number; y: number }[],
  openings: FloorMapShape[],
  pixelsPerMm: number,
  tolerancePx: number
): { walls: WallSegment[]; gaps: OpeningGap[] } => {
  const walls: WallSegment[] = [];
  const gaps: OpeningGap[] = [];
  if (!points || points.length < 2) return { walls, gaps };
  const ppm = pixelsPerMm || 1;

  const openSegs = openings
    .filter(isOpeningShape)
    .map((o) => o.coordinates as LineCoordinates)
    .filter((c) => c && typeof c.x1 === 'number');

  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const elen = Math.hypot(ex, ey);
    if (elen < 1e-6) continue;
    const ux = ex / elen;
    const uy = ey / elen;

    const along = (p: { x: number; y: number }) => (p.x - a.x) * ux + (p.y - a.y) * uy;
    const perp = (p: { x: number; y: number }) => Math.abs((p.x - a.x) * uy - (p.y - a.y) * ux);

    // Opening spans (t-ranges along this edge) that lie on this edge line.
    const ranges: Array<[number, number]> = [];
    for (const c of openSegs) {
      const p1 = { x: c.x1, y: c.y1 };
      const p2 = { x: c.x2, y: c.y2 };
      if (perp(p1) > tolerancePx || perp(p2) > tolerancePx) continue;
      let t1 = along(p1);
      let t2 = along(p2);
      if (t1 > t2) [t1, t2] = [t2, t1];
      const s = Math.max(0, t1);
      const e = Math.min(elen, t2);
      if (e - s > 1) ranges.push([s, e]);
    }

    // Merge overlapping opening ranges.
    ranges.sort((r1, r2) => r1[0] - r2[0]);
    const merged: Array<[number, number]> = [];
    for (const r of ranges) {
      const last = merged[merged.length - 1];
      if (last && r[0] <= last[1] + 0.5) last[1] = Math.max(last[1], r[1]);
      else merged.push([r[0], r[1]]);
    }

    const at = (t: number) => ({ x: a.x + ux * t, y: a.y + uy * t });
    let cursor = 0;
    for (const [s, e] of merged) {
      if (s - cursor > 1) {
        const p = at(cursor);
        const q = at(s);
        walls.push({ x1: p.x, y1: p.y, x2: q.x, y2: q.y, lengthMm: (s - cursor) / ppm });
      }
      const gp = at(s);
      const gq = at(e);
      gaps.push({ x1: gp.x, y1: gp.y, x2: gq.x, y2: gq.y, lengthMm: (e - s) / ppm });
      cursor = e;
    }
    if (elen - cursor > 1) {
      const p = at(cursor);
      const q = at(elen);
      walls.push({ x1: p.x, y1: p.y, x2: q.x, y2: q.y, lengthMm: (elen - cursor) / ppm });
    }
  }

  return { walls, gaps };
};

/**
 * True if a point sits inside one of the opening gaps (so a corner post drawn
 * there would visibly poke through the opening). Uses a perpendicular tolerance
 * to match the post's half-thickness.
 */
export const isPointInGap = (
  p: { x: number; y: number },
  gaps: OpeningGap[],
  tolerancePx: number
): boolean => {
  for (const g of gaps) {
    const ex = g.x2 - g.x1;
    const ey = g.y2 - g.y1;
    const elen = Math.hypot(ex, ey);
    if (elen < 1e-6) continue;
    const ux = ex / elen;
    const uy = ey / elen;
    const t = (p.x - g.x1) * ux + (p.y - g.y1) * uy;
    const perp = Math.abs((p.x - g.x1) * uy - (p.y - g.y1) * ux);
    // Keep posts at the very ends of the gap (the jambs); only suppress ones
    // sitting inside the span.
    if (perp <= tolerancePx && t > tolerancePx && t < elen - tolerancePx) return true;
  }
  return false;
};

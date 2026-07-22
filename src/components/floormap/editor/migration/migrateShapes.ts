/**
 * Idempotent shape normalization run when the v2 editor loads a plan.
 *
 * Conservative scope while the legacy editor coexists (same world units):
 * - unwrap double-nested room polygons ({ points: { points: [...] } })
 * - drop shapes with missing/unusable coordinates (defensive)
 * - weld wall endpoints within a tiny epsilon so float noise from the old
 *   editor doesn't split junctions
 *
 * The px→mm canonicalization is intentionally NOT done here — it happens as
 * one migration when the legacy editor is deleted (both editors must agree
 * on units while they share rows).
 */

import { FloorMapShape, LineCoordinates } from '../../types';

const WELD_EPS = 1; // world units (= 10 mm at standard scale)

interface NestedPoints {
  points?: unknown;
}

function normalizeCoordinates(shape: FloorMapShape): FloorMapShape | null {
  const c = shape.coordinates as unknown;
  if (!c || typeof c !== 'object') return null;

  // Double-nested points bug: coordinates.points.points
  const withPoints = c as NestedPoints;
  if (
    withPoints.points &&
    !Array.isArray(withPoints.points) &&
    typeof withPoints.points === 'object' &&
    Array.isArray((withPoints.points as NestedPoints).points)
  ) {
    return {
      ...shape,
      coordinates: { points: (withPoints.points as NestedPoints).points } as FloorMapShape['coordinates'],
    };
  }
  return shape;
}

/** Snap wall endpoints that are almost-coincident onto each other. */
function weldWallEndpoints(shapes: FloorMapShape[]): FloorMapShape[] {
  const anchors: { x: number; y: number }[] = [];
  const snapPoint = (p: { x: number; y: number }) => {
    const hit = anchors.find((a) => Math.hypot(a.x - p.x, a.y - p.y) < WELD_EPS);
    if (hit) return hit;
    anchors.push(p);
    return p;
  };

  return shapes.map((shape) => {
    if (shape.type !== 'wall' || !shape.coordinates || !('x1' in (shape.coordinates as object))) {
      return shape;
    }
    const c = shape.coordinates as LineCoordinates;
    const a = snapPoint({ x: c.x1, y: c.y1 });
    const b = snapPoint({ x: c.x2, y: c.y2 });
    if (a.x === c.x1 && a.y === c.y1 && b.x === c.x2 && b.y === c.y2) return shape;
    return { ...shape, coordinates: { x1: a.x, y1: a.y, x2: b.x, y2: b.y } };
  });
}

export function migrateShapes(shapes: FloorMapShape[]): FloorMapShape[] {
  const normalized = shapes
    .map(normalizeCoordinates)
    .filter((s): s is FloorMapShape => s !== null);
  return weldWallEndpoints(normalized);
}

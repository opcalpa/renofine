/**
 * Shape bounds + point-mapping transforms shared by the select tool, the
 * selection commands, and the floating selection toolbar.
 */

import { FloorMapShape, LineCoordinates } from '../../types';
import { isUnifiedObjectShape, objectBounds } from '../objects/objectModel';

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function shapeBounds(shape: FloorMapShape): Bounds | null {
  // Library objects: footprint from the catalog definition, not the anchor points.
  if (isUnifiedObjectShape(shape)) {
    const b = objectBounds(shape);
    if (b) return b;
  }
  const c = shape.coordinates as Record<string, unknown>;
  if (!c) return null;
  if ('x1' in c) {
    const lc = shape.coordinates as LineCoordinates;
    return {
      minX: Math.min(lc.x1, lc.x2),
      minY: Math.min(lc.y1, lc.y2),
      maxX: Math.max(lc.x1, lc.x2),
      maxY: Math.max(lc.y1, lc.y2),
    };
  }
  if ('points' in c) {
    const points = c.points as Point[];
    if (!points?.length) return null;
    return {
      minX: Math.min(...points.map((p) => p.x)),
      minY: Math.min(...points.map((p) => p.y)),
      maxX: Math.max(...points.map((p) => p.x)),
      maxY: Math.max(...points.map((p) => p.y)),
    };
  }
  if ('left' in c) {
    const left = c.left as number;
    const top = c.top as number;
    return { minX: left, minY: top, maxX: left + (c.width as number), maxY: top + (c.height as number) };
  }
  if ('cx' in c) {
    const cx = c.cx as number;
    const cy = c.cy as number;
    const r = c.radius as number;
    return { minX: cx - r, minY: cy - r, maxX: cx + r, maxY: cy + r };
  }
  if ('x' in c) {
    const x = c.x as number;
    const y = c.y as number;
    return { minX: x, minY: y, maxX: x + ((c.width as number) || 0), maxY: y + ((c.height as number) || 0) };
  }
  return null;
}

export function unionBounds(shapes: FloorMapShape[]): Bounds | null {
  let acc: Bounds | null = null;
  for (const shape of shapes) {
    const b = shapeBounds(shape);
    if (!b) continue;
    acc = acc
      ? {
          minX: Math.min(acc.minX, b.minX),
          minY: Math.min(acc.minY, b.minY),
          maxX: Math.max(acc.maxX, b.maxX),
          maxY: Math.max(acc.maxY, b.maxY),
        }
      : b;
  }
  return acc;
}

export function boundsCenter(b: Bounds): Point {
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

/**
 * Map every coordinate point of a shape through `fn`. Rect/circle/text forms
 * are re-derived from their mapped corners, so the result stays axis-aligned —
 * callers therefore only pass axis-preserving transforms (90° turns, mirrors,
 * translations).
 */
export function mapShapePoints(
  shape: FloorMapShape,
  fn: (p: Point) => Point
): Partial<FloorMapShape> {
  const c = shape.coordinates as Record<string, unknown>;
  if (!c) return {};
  if ('x1' in c) {
    const lc = shape.coordinates as LineCoordinates;
    const a = fn({ x: lc.x1, y: lc.y1 });
    const b = fn({ x: lc.x2, y: lc.y2 });
    return { coordinates: { x1: a.x, y1: a.y, x2: b.x, y2: b.y } };
  }
  if ('points' in c) {
    const points = (c.points as Point[]).map((p) => fn({ x: p.x, y: p.y }));
    return { coordinates: { ...(c as object), points } as FloorMapShape['coordinates'] };
  }
  if ('left' in c) {
    const left = c.left as number;
    const top = c.top as number;
    const width = c.width as number;
    const height = c.height as number;
    const a = fn({ x: left, y: top });
    const b = fn({ x: left + width, y: top + height });
    return {
      coordinates: {
        ...(c as object),
        left: Math.min(a.x, b.x),
        top: Math.min(a.y, b.y),
        width: Math.abs(b.x - a.x),
        height: Math.abs(b.y - a.y),
      } as FloorMapShape['coordinates'],
    };
  }
  if ('cx' in c) {
    const p = fn({ x: c.cx as number, y: c.cy as number });
    return { coordinates: { ...(c as object), cx: p.x, cy: p.y } as FloorMapShape['coordinates'] };
  }
  if ('x' in c) {
    const x = c.x as number;
    const y = c.y as number;
    const width = (c.width as number) || 0;
    const height = (c.height as number) || 0;
    const a = fn({ x, y });
    const b = fn({ x: x + width, y: y + height });
    return {
      coordinates: {
        ...(c as object),
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        ...(width || height
          ? { width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) }
          : {}),
      } as FloorMapShape['coordinates'],
    };
  }
  return {};
}

/**
 * Multi-selection commands: rotate 90°, mirror, duplicate, align, distribute.
 *
 * Spread into the command registry in commands.ts so they share the same
 * executor/undo pipeline as every other edit. Openings are skipped by the
 * geometric transforms — they carry no world geometry and follow their host
 * wall; locked shapes are never touched.
 */

import { v4 as uuidv4 } from 'uuid';
import { FloorMapShape } from '../../types';
import { commit, getShapes } from './executor';
import { Patch, makeUpdatePatch } from './patches';
import { boundsCenter, mapShapePoints, shapeBounds, unionBounds, Point } from '../geometry/bounds';
import { isUnifiedObjectShape, objectPlacement } from '../objects/objectModel';
import { useFloorMapStore } from '../../store';

export interface SelectionRotateParams {
  ids: string[];
  /** Clockwise quarter turns; negative = counter-clockwise. Default 1. */
  quarterTurns?: number;
}

export interface SelectionMirrorParams {
  ids: string[];
  /** 'horizontal' flips left↔right, 'vertical' flips top↔bottom. */
  direction: 'horizontal' | 'vertical';
}

export interface SelectionDuplicateParams {
  ids: string[];
  /** World-unit offset for the copies. Default 30 (= 300 mm at standard scale). */
  offset?: Point;
}

export type AlignMode = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom';

export interface SelectionAlignParams {
  ids: string[];
  mode: AlignMode;
}

export interface SelectionDistributeParams {
  ids: string[];
  axis: 'horizontal' | 'vertical';
}

/** Shapes a geometric transform may touch. */
function transformable(shape: FloorMapShape, ids: Set<string>): boolean {
  return ids.has(shape.id) && !shape.locked && shape.type !== 'opening' && shape.type !== 'image';
}

/**
 * Group transforms move a library object's CENTER through `fn` (its
 * footprint comes from the catalog, so only placement translates) and detach
 * it from any wall; other shapes map every coordinate point.
 */
function transformPatches(
  ids: string[],
  fn: (p: Point) => Point,
  rotationDelta = 0
): Patch[] {
  const idSet = new Set(ids);
  const patches: Patch[] = [];
  for (const shape of getShapes()) {
    if (!transformable(shape, idSet)) continue;
    if (isUnifiedObjectShape(shape)) {
      const { center, rotation } = objectPlacement(shape);
      const moved = fn(center);
      const newRotation = ((rotation + rotationDelta) % 360 + 360) % 360;
      patches.push(
        makeUpdatePatch(shape, {
          rotation: newRotation,
          wallRelative: undefined,
          coordinates: {
            points: [
              { x: moved.x, y: moved.y },
              { x: moved.x + 1, y: moved.y + 1 },
            ],
          },
          metadata: { ...shape.metadata, placementX: moved.x, placementY: moved.y, rotation: newRotation },
        })
      );
      continue;
    }
    const updates = mapShapePoints(shape, fn);
    if (Object.keys(updates).length > 0) patches.push(makeUpdatePatch(shape, updates));
  }
  return patches;
}

function selectionCenter(ids: string[]): Point | null {
  const idSet = new Set(ids);
  const bounds = unionBounds(getShapes().filter((s) => transformable(s, idSet)));
  return bounds ? boundsCenter(bounds) : null;
}

export const selectionOps = {
  'selection.rotate'(params: SelectionRotateParams): void {
    const center = selectionCenter(params.ids);
    if (!center) return;
    const turns = ((params.quarterTurns ?? 1) % 4 + 4) % 4;
    if (turns === 0) return;
    const rotate = (p: Point): Point => {
      let x = p.x - center.x;
      let y = p.y - center.y;
      for (let i = 0; i < turns; i++) [x, y] = [-y, x];
      return { x: center.x + x, y: center.y + y };
    };
    commit('Rotera', transformPatches(params.ids, rotate, turns * 90));
  },

  'selection.mirror'(params: SelectionMirrorParams): void {
    const center = selectionCenter(params.ids);
    if (!center) return;
    const mirror = (p: Point): Point =>
      params.direction === 'horizontal'
        ? { x: 2 * center.x - p.x, y: p.y }
        : { x: p.x, y: 2 * center.y - p.y };
    commit('Spegla', transformPatches(params.ids, mirror));
  },

  'selection.duplicate'(params: SelectionDuplicateParams): string[] {
    const offset = params.offset ?? { x: 30, y: 30 };
    const idSet = new Set(params.ids);
    const originals = getShapes().filter((s) => idSet.has(s.id) && !s.locked);
    const idMap = new Map(originals.map((s) => [s.id, uuidv4()]));

    const patches: Patch[] = [];
    for (const original of originals) {
      // An opening only makes sense on its wall — copy it when the wall
      // comes along (remapped), silently skip it otherwise.
      if (original.type === 'opening') {
        if (!original.parentWallId || !idMap.has(original.parentWallId)) continue;
        patches.push({
          op: 'add',
          shape: {
            ...structuredClone(original),
            id: idMap.get(original.id)!,
            parentWallId: idMap.get(original.parentWallId)!,
          },
        });
        continue;
      }
      const copy: FloorMapShape = {
        ...structuredClone(original),
        id: idMap.get(original.id)!,
        ...mapShapePoints(original, (p) => ({ x: p.x + offset.x, y: p.y + offset.y })),
      };
      // A copied room shape must not point at the original's rooms row.
      delete copy.roomId;
      if (isUnifiedObjectShape(copy)) {
        // Placement is authoritative for objects — offset it too, and let the
        // copy start detached (it no longer sits flush against the wall).
        copy.metadata = {
          ...copy.metadata,
          placementX: ((copy.metadata?.placementX as number) || 0) + offset.x,
          placementY: ((copy.metadata?.placementY as number) || 0) + offset.y,
        };
        delete copy.wallRelative;
      }
      patches.push({ op: 'add', shape: copy });
    }
    if (patches.length === 0) return [];
    commit('Duplicera', patches);
    const newIds = patches.map((p) => (p.op === 'add' ? p.shape.id : '')).filter(Boolean);
    useFloorMapStore.getState().setSelectedShapeIds(newIds);
    return newIds;
  },

  'selection.align'(params: SelectionAlignParams): void {
    const idSet = new Set(params.ids);
    const shapes = getShapes().filter((s) => transformable(s, idSet));
    const total = unionBounds(shapes);
    if (!total || shapes.length < 2) return;
    const patches: Patch[] = [];
    for (const shape of shapes) {
      const b = shapeBounds(shape);
      if (!b) continue;
      let dx = 0;
      let dy = 0;
      switch (params.mode) {
        case 'left': dx = total.minX - b.minX; break;
        case 'right': dx = total.maxX - b.maxX; break;
        case 'centerX': dx = (total.minX + total.maxX) / 2 - (b.minX + b.maxX) / 2; break;
        case 'top': dy = total.minY - b.minY; break;
        case 'bottom': dy = total.maxY - b.maxY; break;
        case 'centerY': dy = (total.minY + total.maxY) / 2 - (b.minY + b.maxY) / 2; break;
      }
      if (dx === 0 && dy === 0) continue;
      const updates = mapShapePoints(shape, (p) => ({ x: p.x + dx, y: p.y + dy }));
      if (Object.keys(updates).length > 0) patches.push(makeUpdatePatch(shape, updates));
    }
    commit('Justera', patches);
  },

  'selection.distribute'(params: SelectionDistributeParams): void {
    const idSet = new Set(params.ids);
    const shapes = getShapes().filter((s) => transformable(s, idSet));
    if (shapes.length < 3) return;
    const horizontal = params.axis === 'horizontal';
    const entries = shapes
      .map((shape) => ({ shape, bounds: shapeBounds(shape) }))
      .filter((e): e is { shape: FloorMapShape; bounds: NonNullable<ReturnType<typeof shapeBounds>> } => !!e.bounds)
      .map((e) => ({
        ...e,
        center: horizontal ? (e.bounds.minX + e.bounds.maxX) / 2 : (e.bounds.minY + e.bounds.maxY) / 2,
      }))
      .sort((a, b) => a.center - b.center);
    if (entries.length < 3) return;

    const first = entries[0].center;
    const last = entries[entries.length - 1].center;
    const step = (last - first) / (entries.length - 1);
    const patches: Patch[] = [];
    entries.forEach((entry, i) => {
      const target = first + step * i;
      const delta = target - entry.center;
      if (Math.abs(delta) < 1e-9) return;
      const move = horizontal
        ? (p: Point) => ({ x: p.x + delta, y: p.y })
        : (p: Point) => ({ x: p.x, y: p.y + delta });
      const updates = mapShapePoints(entry.shape, move);
      if (Object.keys(updates).length > 0) patches.push(makeUpdatePatch(entry.shape, updates));
    });
    commit('Fördela', patches);
  },
};

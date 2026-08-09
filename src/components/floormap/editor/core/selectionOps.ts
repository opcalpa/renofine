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
import { worldToMm } from './units';
import { useFloorMapStore } from '../../store';

/** Structural shapes are never folded into a free-form group. */
const NON_GROUPABLE = new Set<FloorMapShape['type']>(['wall', 'room', 'opening', 'image']);

/** Free shapes whose fill/stroke/opacity the user can restyle from the toolbar. */
export const STYLABLE_TYPES = new Set<FloorMapShape['type']>([
  'rectangle',
  'triangle',
  'circle',
  'line',
  'polygon',
  'freehand',
  'text',
  'sticky_note',
  'bezier',
  'connector',
]);

/** A free shape / object that may be folded into an "eget objekt" group. */
export function isGroupable(shape: FloorMapShape): boolean {
  return !shape.locked && !NON_GROUPABLE.has(shape.type);
}

export interface SelectionGroupParams {
  ids: string[];
  /** Display name for the group; defaults to "Eget objekt". */
  name?: string;
}

export interface SelectionUngroupParams {
  ids: string[];
}

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
  /**
   * Fold the selected free shapes into one named "eget objekt" — they share a
   * groupId, the first becomes the leader carrying the name + measured bounds
   * (in mm) so the group reads as a single unit. Selecting any member later
   * selects the whole group. Walls/rooms/openings are excluded.
   */
  'selection.group'(params: SelectionGroupParams): string | null {
    const idSet = new Set(params.ids);
    const shapes = getShapes().filter((s) => idSet.has(s.id) && isGroupable(s));
    if (shapes.length < 2) return null;
    const groupId = uuidv4();
    const name = params.name?.trim() || 'Eget objekt';
    const bounds = unionBounds(shapes);
    const boundsWidth = bounds ? Math.round(worldToMm(bounds.maxX - bounds.minX)) : 0;
    const boundsHeight = bounds ? Math.round(worldToMm(bounds.maxY - bounds.minY)) : 0;

    const patches: Patch[] = shapes.map((shape, i) =>
      makeUpdatePatch(
        shape,
        i === 0
          ? {
              groupId,
              isGroupLeader: true,
              name,
              templateInfo: {
                templateId: groupId,
                templateName: name,
                boundsWidth,
                boundsHeight,
                originalWidth: boundsWidth,
                originalHeight: boundsHeight,
              },
            }
          : { groupId, isGroupLeader: false }
      )
    );
    commit('Gruppera', patches);
    useFloorMapStore.getState().setSelectedShapeIds(shapes.map((s) => s.id));
    return groupId;
  },

  /** Break every group touched by the selection back into loose shapes. */
  'selection.ungroup'(params: SelectionUngroupParams): void {
    const idSet = new Set(params.ids);
    const groupIds = new Set(
      getShapes()
        .filter((s) => idSet.has(s.id) && s.groupId)
        .map((s) => s.groupId as string)
    );
    if (groupIds.size === 0) return;
    const members = getShapes().filter((s) => s.groupId && groupIds.has(s.groupId));
    const patches = members.map((s) =>
      makeUpdatePatch(s, { groupId: undefined, isGroupLeader: undefined, templateInfo: undefined })
    );
    commit('Dela upp grupp', patches);
    useFloorMapStore.getState().setSelectedShapeIds(members.map((s) => s.id));
  },

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

  /**
   * Bring the selection to the front or send it to the back by rewriting
   * zIndex (both layers sort on it). Rooms are the floor base and stay put;
   * the selection keeps its own relative order.
   */
  /**
   * Set fill colour / stroke colour / opacity on the selected free shapes
   * (rectangles, circles, lines, text, freehand — never structural walls/rooms
   * or images/objects). Any subset of the three may be given.
   */
  'selection.setStyle'(params: {
    ids: string[];
    color?: string;
    strokeColor?: string;
    opacity?: number;
  }): void {
    const idSet = new Set(params.ids);
    const patches: Patch[] = [];
    for (const s of getShapes()) {
      if (!idSet.has(s.id) || s.locked || !STYLABLE_TYPES.has(s.type)) continue;
      const updates: Partial<FloorMapShape> = {};
      if (params.color !== undefined) updates.color = params.color;
      if (params.strokeColor !== undefined) updates.strokeColor = params.strokeColor;
      if (params.opacity !== undefined) updates.opacity = Math.max(0.05, Math.min(1, params.opacity));
      if (Object.keys(updates).length > 0) patches.push(makeUpdatePatch(s, updates));
    }
    if (patches.length) commit('Ändra stil', patches);
  },

  'selection.reorder'(params: { ids: string[]; mode: 'front' | 'back' }): void {
    const idSet = new Set(params.ids);
    const shapes = getShapes();
    const sel = shapes.filter((s) => idSet.has(s.id) && !s.locked && s.type !== 'room');
    if (sel.length === 0) return;
    const others = shapes.filter((s) => !idSet.has(s.id) && s.type !== 'room');
    const zs = others.map((s) => s.zIndex ?? 0);
    const maxZ = zs.length ? Math.max(...zs) : 0;
    const minZ = zs.length ? Math.min(...zs) : 0;
    const ordered = [...sel].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
    const patches: Patch[] = ordered.map((s, i) =>
      makeUpdatePatch(s, {
        zIndex: params.mode === 'front' ? maxZ + 1 + i : minZ - ordered.length + i,
      })
    );
    commit(params.mode === 'front' ? 'Flytta främst' : 'Flytta bakåt', patches);
  },
};

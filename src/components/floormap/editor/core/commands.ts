/**
 * Named editor commands with JSON-serializable params.
 *
 * This registry is the programmatic surface of the editor: UI tools call it,
 * and Renaida will call the same commands later. Every command validates its
 * params, builds patches, and commits them through the executor.
 */

import { v4 as uuidv4 } from 'uuid';
import { FloorMapShape, LineCoordinates } from '../../types';
import { getAdminDefaults } from '../../canvas/constants';
import { commit, getShapes, transaction } from './executor';
import { Patch, makeUpdatePatch } from './patches';
import { mmToWorld, worldToMm } from './units';
import {
  wallFrame,
  openingPlacement,
  projectOntoWall,
  clampPosition,
  OPENING_DEFAULT_WIDTH_MM,
} from '../geometry/openingGeometry';
import { useFloorMapStore } from '../../store';
import { selectionOps } from './selectionOps';
import {
  buildObjectShape,
  getObjectDef,
  isUnifiedObjectShape,
  objectPlacement,
} from '../objects/objectModel';
import { getUnifiedObjectById } from '../../objectLibrary';

export interface Point {
  x: number;
  y: number;
}

export const JUNCTION_EPSILON = 0.5; // world units (= 5 mm at standard scale)

export interface WallDrawParams {
  /** Polyline vertices in world coords; N points → N-1 wall segments. */
  points: Point[];
  thicknessMM?: number;
  heightMM?: number;
}

export interface ShapeMoveParams {
  ids: string[];
  dx: number;
  dy: number;
}

export interface JunctionMoveParams {
  at: Point;
  to: Point;
}

export interface ShapeDeleteParams {
  ids: string[];
}

export interface ShapeUpdateParams {
  id: string;
  updates: Partial<FloorMapShape>;
}

export interface WallSetLengthParams {
  id: string;
  lengthMM: number;
  /** Which endpoint stays fixed. Default 'start'. */
  anchor?: 'start' | 'end';
}

function planId(): string | undefined {
  return useFloorMapStore.getState().currentPlanId || undefined;
}

/**
 * Openings carry no world geometry — moving one slides it along its host
 * wall by projecting the moved center back onto the wall.
 */
function slideOpening(shape: FloorMapShape, dx: number, dy: number, shapes: FloorMapShape[]): Partial<FloorMapShape> {
  const wall = shapes.find((s) => s.id === shape.parentWallId);
  if (!wall) return {};
  const frame = wallFrame(wall);
  const placement = openingPlacement(shape, wall);
  if (!frame || !placement) return {};
  const moved = { x: placement.center.x + dx, y: placement.center.y + dy };
  const { t } = projectOntoWall(moved, frame);
  return { positionOnWall: clampPosition(t, placement.widthWorld, frame) };
}

function translateCoordinates(shape: FloorMapShape, dx: number, dy: number): Partial<FloorMapShape> {
  const c = shape.coordinates as Record<string, unknown>;
  if ('x1' in c) {
    const lc = shape.coordinates as LineCoordinates;
    return { coordinates: { x1: lc.x1 + dx, y1: lc.y1 + dy, x2: lc.x2 + dx, y2: lc.y2 + dy } };
  }
  if ('points' in c) {
    const points = (c.points as Point[]).map((p) => ({ x: p.x + dx, y: p.y + dy }));
    return { coordinates: { ...(c as object), points } as FloorMapShape['coordinates'] };
  }
  if ('left' in c) {
    return { coordinates: { ...(c as object), left: (c.left as number) + dx, top: (c.top as number) + dy } as FloorMapShape['coordinates'] };
  }
  if ('cx' in c) {
    return { coordinates: { ...(c as object), cx: (c.cx as number) + dx, cy: (c.cy as number) + dy } as FloorMapShape['coordinates'] };
  }
  if ('x' in c) {
    return { coordinates: { ...(c as object), x: (c.x as number) + dx, y: (c.y as number) + dy } as FloorMapShape['coordinates'] };
  }
  return {};
}

export function isWall(shape: FloorMapShape): boolean {
  return shape.type === 'wall' && !!(shape.coordinates as LineCoordinates) && 'x1' in (shape.coordinates as object);
}

export interface ShapeAddParams {
  shape: Omit<FloorMapShape, 'id' | 'planId'> & Partial<Pick<FloorMapShape, 'id' | 'planId'>>;
}

export interface OpeningAddParams {
  wallId: string;
  /** Center position along the wall, 0–1. */
  t: number;
  kind: NonNullable<FloorMapShape['openingKind']>;
  widthMM?: number;
}

export const commands = {
  ...selectionOps,

  'shape.add'(params: ShapeAddParams): FloorMapShape {
    const shape: FloorMapShape = {
      ...params.shape,
      id: params.shape.id ?? uuidv4(),
      planId: params.shape.planId ?? planId(),
    } as FloorMapShape;
    commit('Lägg till', [{ op: 'add', shape }]);
    return shape;
  },

  'wall.draw'(params: WallDrawParams): FloorMapShape[] {
    if (!params.points || params.points.length < 2) return [];
    const defaults = getAdminDefaults();
    const created: FloorMapShape[] = [];
    const patches: Patch[] = [];
    for (let i = 0; i < params.points.length - 1; i++) {
      const a = params.points[i];
      const b = params.points[i + 1];
      if (Math.hypot(b.x - a.x, b.y - a.y) < JUNCTION_EPSILON) continue;
      const wall: FloorMapShape = {
        id: uuidv4(),
        type: 'wall',
        coordinates: { x1: a.x, y1: a.y, x2: b.x, y2: b.y },
        thicknessMM: params.thicknessMM ?? defaults.wallThicknessMM,
        heightMM: params.heightMM ?? defaults.wallHeightMM,
        strokeColor: '#374151',
        planId: planId(),
        metadata: { lengthMM: Math.round(worldToMm(Math.hypot(b.x - a.x, b.y - a.y))) },
      };
      created.push(wall);
      patches.push({ op: 'add', shape: wall });
    }
    commit('Rita vägg', patches);
    return created;
  },

  'shape.move'(params: ShapeMoveParams): void {
    const shapes = getShapes();
    const ids = new Set(params.ids);
    const patches: Patch[] = [];
    for (const shape of shapes) {
      if (!ids.has(shape.id)) continue;
      if (shape.type === 'opening' && shape.parentWallId) {
        // When the host wall moves too, the opening rides along with it (the
        // derived-coordinate sync follows the wall) — sliding it as well
        // would move it double.
        if (ids.has(shape.parentWallId)) continue;
        const updates = slideOpening(shape, params.dx, params.dy, shapes);
        if (Object.keys(updates).length > 0) patches.push(makeUpdatePatch(shape, updates));
        continue;
      }
      if (isUnifiedObjectShape(shape)) {
        // Attached object whose host wall moves too: it follows via the
        // object sync pass — translating it as well would double-move it.
        if (shape.wallRelative?.wallId && ids.has(shape.wallRelative.wallId)) continue;
        const { center } = objectPlacement(shape);
        patches.push(
          makeUpdatePatch(shape, {
            // A free translation detaches it from any wall (sync would
            // otherwise yank it straight back).
            wallRelative: undefined,
            coordinates: {
              points: [
                { x: center.x + params.dx, y: center.y + params.dy },
                { x: center.x + params.dx + 1, y: center.y + params.dy + 1 },
              ],
            },
            metadata: {
              ...shape.metadata,
              placementX: center.x + params.dx,
              placementY: center.y + params.dy,
            },
          })
        );
        continue;
      }
      const updates = translateCoordinates(shape, params.dx, params.dy);
      if (Object.keys(updates).length > 0) patches.push(makeUpdatePatch(shape, updates));
    }
    commit('Flytta', patches);
  },

  'opening.add'(params: OpeningAddParams): FloorMapShape | null {
    const wall = getShapes().find((s) => s.id === params.wallId);
    if (!wall) return null;
    const frame = wallFrame(wall);
    if (!frame) return null;
    const widthMM = params.widthMM ?? OPENING_DEFAULT_WIDTH_MM[params.kind] ?? 900;
    const t = clampPosition(params.t, mmToWorld(widthMM), frame);
    const shape: FloorMapShape = {
      id: uuidv4(),
      type: 'opening',
      openingKind: params.kind,
      parentWallId: params.wallId,
      positionOnWall: t,
      openingDirection: 'left',
      coordinates: { x1: 0, y1: 0, x2: 0, y2: 0 }, // derived at render time from the wall
      planId: planId(),
      metadata: { widthMM },
    };
    commit('Placera öppning', [{ op: 'add', shape }]);
    return shape;
  },

  'object.place'(params: {
    definitionId: string;
    center: Point;
    rotation?: number;
    wallRelative?: FloorMapShape['wallRelative'] | null;
  }): FloorMapShape | null {
    const def = getUnifiedObjectById(params.definitionId);
    if (!def) return null;
    const shapes = getShapes();
    const maxZ = Math.max(0, ...shapes.filter((s) => s.type !== 'room').map((s) => s.zIndex ?? 0), 99);
    const shape = buildObjectShape(
      def,
      params.center,
      params.rotation ?? 0,
      planId(),
      params.wallRelative ?? null,
      maxZ + 1
    );
    commit('Placera objekt', [{ op: 'add', shape }]);
    useFloorMapStore.getState().setSelectedShapeIds([shape.id]);
    return shape;
  },

  /** Absolute move for a single object — used by the drag interaction so
   * wall capture/slide/release lands exactly where the snap computed. */
  'object.moveTo'(params: {
    id: string;
    center: Point;
    rotation: number;
    wallRelative?: FloorMapShape['wallRelative'] | null;
  }): void {
    const shape = getShapes().find((s) => s.id === params.id);
    if (!shape || !isUnifiedObjectShape(shape)) return;
    commit('Flytta objekt', [
      makeUpdatePatch(shape, {
        rotation: params.rotation,
        wallRelative: params.wallRelative ?? undefined,
        coordinates: {
          points: [
            { x: params.center.x, y: params.center.y },
            { x: params.center.x + 1, y: params.center.y + 1 },
          ],
        },
        metadata: {
          ...shape.metadata,
          placementX: params.center.x,
          placementY: params.center.y,
          rotation: params.rotation,
        },
      }),
    ]);
  },

  /** Rotate a single object in place around its own center. */
  'object.rotate'(params: { id: string; degrees: number }): void {
    const shape = getShapes().find((s) => s.id === params.id);
    if (!shape || !isUnifiedObjectShape(shape)) return;
    const def = getObjectDef(shape);
    if (def && !def.wallBehavior.canRotate) return;
    const { center } = objectPlacement(shape);
    const rotation = (((shape.rotation ?? 0) + params.degrees) % 360 + 360) % 360;
    commit('Rotera objekt', [
      makeUpdatePatch(shape, {
        rotation,
        // Manual rotation releases the wall hosting (never fight the user).
        wallRelative: undefined,
        metadata: { ...shape.metadata, placementX: center.x, placementY: center.y, rotation },
      }),
    ]);
  },

  'opening.setWidth'(params: { id: string; widthMM: number }): void {
    const shapes = getShapes();
    const shape = shapes.find((s) => s.id === params.id);
    if (!shape || shape.type !== 'opening' || !shape.parentWallId) return;
    const wall = shapes.find((s) => s.id === shape.parentWallId);
    const frame = wall ? wallFrame(wall) : null;
    if (!frame) return;
    const wallLengthMM = worldToMm(frame.length);
    const widthMM = Math.round(Math.max(300, Math.min(params.widthMM, wallLengthMM)));
    // Re-clamp the position so the resized opening still fits on the wall.
    const t = clampPosition(shape.positionOnWall ?? 0.5, mmToWorld(widthMM), frame);
    commit('Ändra öppningsbredd', [
      makeUpdatePatch(shape, {
        metadata: { ...shape.metadata, widthMM },
        positionOnWall: t,
      }),
    ]);
  },

  'opening.flip'(params: { id: string }): void {
    const shape = getShapes().find((s) => s.id === params.id);
    if (!shape || shape.type !== 'opening') return;
    commit('Vänd öppning', [
      makeUpdatePatch(shape, {
        openingDirection: shape.openingDirection === 'right' ? 'left' : 'right',
      }),
    ]);
  },

  'junction.move'(params: JunctionMoveParams): void {
    const shapes = getShapes();
    const patches: Patch[] = [];
    for (const shape of shapes) {
      if (!isWall(shape)) continue;
      const c = shape.coordinates as LineCoordinates;
      const touchesStart = Math.hypot(c.x1 - params.at.x, c.y1 - params.at.y) < JUNCTION_EPSILON;
      const touchesEnd = Math.hypot(c.x2 - params.at.x, c.y2 - params.at.y) < JUNCTION_EPSILON;
      if (!touchesStart && !touchesEnd) continue;
      patches.push(
        makeUpdatePatch(shape, {
          coordinates: {
            x1: touchesStart ? params.to.x : c.x1,
            y1: touchesStart ? params.to.y : c.y1,
            x2: touchesEnd ? params.to.x : c.x2,
            y2: touchesEnd ? params.to.y : c.y2,
          },
        })
      );
    }
    commit('Flytta hörn', patches);
  },

  'shape.delete'(params: ShapeDeleteParams): void {
    const shapes = getShapes();
    const ids = new Set(params.ids);
    const patches: Patch[] = shapes
      .filter((s) => ids.has(s.id) && !s.locked)
      .map((s) => ({ op: 'remove' as const, shape: s }));
    commit('Radera', patches);
    useFloorMapStore.getState().clearSelection();
  },

  'shape.update'(params: ShapeUpdateParams): void {
    const shape = getShapes().find((s) => s.id === params.id);
    if (!shape) return;
    commit('Ändra', [makeUpdatePatch(shape, params.updates)]);
  },

  'wall.setLength'(params: WallSetLengthParams): void {
    const shape = getShapes().find((s) => s.id === params.id);
    if (!shape || !isWall(shape)) return;
    const c = shape.coordinates as LineCoordinates;
    const length = Math.hypot(c.x2 - c.x1, c.y2 - c.y1);
    if (length === 0) return;
    const targetWorld = mmToWorld(params.lengthMM);
    const ux = (c.x2 - c.x1) / length;
    const uy = (c.y2 - c.y1) / length;
    const coordinates: LineCoordinates =
      params.anchor === 'end'
        ? { x1: c.x2 - ux * targetWorld, y1: c.y2 - uy * targetWorld, x2: c.x2, y2: c.y2 }
        : { x1: c.x1, y1: c.y1, x2: c.x1 + ux * targetWorld, y2: c.y1 + uy * targetWorld };
    commit('Sätt vägglängd', [
      makeUpdatePatch(shape, {
        coordinates,
        metadata: { ...shape.metadata, lengthMM: Math.round(params.lengthMM) },
      }),
    ]);
  },
};

export type CommandName = keyof typeof commands;
export type CommandParams<N extends CommandName> = Parameters<(typeof commands)[N]>[0];
export type CommandResult<N extends CommandName> = ReturnType<(typeof commands)[N]>;

/** Execute a named command. The single entry point for UI tools and Renaida. */
export function execute<N extends CommandName>(name: N, params: CommandParams<N>): CommandResult<N> {
  const handler = commands[name] as (p: CommandParams<N>) => CommandResult<N>;
  return handler(params);
}

export { transaction };

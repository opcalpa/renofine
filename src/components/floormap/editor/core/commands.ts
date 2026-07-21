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
import { useFloorMapStore } from '../../store';

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

export const commands = {
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
      const updates = translateCoordinates(shape, params.dx, params.dy);
      if (Object.keys(updates).length > 0) patches.push(makeUpdatePatch(shape, updates));
    }
    commit('Flytta', patches);
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

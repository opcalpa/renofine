/**
 * v2 model helpers for library objects (toilets, sofas, radiators, …).
 *
 * Storage stays in the legacy form so both editors and the elevation view
 * keep working against the same rows: type:'freehand' + metadata
 * {isUnifiedObject, unifiedObjectId, placementX/Y (world center), scale} +
 * shape.rotation (degrees) + wallRelative (mm) when wall-attached.
 * placementX/Y is kept authoritative for rendering/bounds in v2; an executor
 * sync pass re-derives it from wallRelative whenever the host wall moves.
 */

import { v4 as uuidv4 } from 'uuid';
import { FloorMapShape } from '../../types';
import {
  UnifiedObjectDefinition,
  getUnifiedObjectById,
} from '../../objectLibrary';
import { snapObjectToWall } from '../../canvas/utils/viewSync';
import { mmToWorld, worldPerMm, worldToMm } from '../core/units';

export interface Point {
  x: number;
  y: number;
}

export function isUnifiedObjectShape(shape: FloorMapShape): boolean {
  return !!shape.metadata?.isUnifiedObject && typeof shape.metadata?.unifiedObjectId === 'string';
}

export function getObjectDef(shape: FloorMapShape): UnifiedObjectDefinition | null {
  if (!isUnifiedObjectShape(shape)) return null;
  return getUnifiedObjectById(shape.metadata!.unifiedObjectId as string) ?? null;
}

/** Object center + rotation in world units, from the authoritative metadata. */
export function objectPlacement(shape: FloorMapShape): { center: Point; rotation: number } {
  return {
    center: {
      x: (shape.metadata?.placementX as number) || 0,
      y: (shape.metadata?.placementY as number) || 0,
    },
    // Fallback to the metadata copy for rows persisted while the top-level
    // rotation field was dropped by the save path (pre-2026-07 bug).
    rotation: shape.rotation ?? (shape.metadata?.rotation as number) ?? 0,
  };
}

/** Instance dimensions in mm — custom objects override the catalog defaults. */
export function objectDimensionsMM(shape: FloorMapShape): { width: number; depth: number } | null {
  const def = getObjectDef(shape);
  if (!def) return null;
  return {
    width: (shape.metadata?.customWidthMM as number) || def.dimensions.width,
    depth: (shape.metadata?.customDepthMM as number) || def.dimensions.depth,
  };
}

/** Footprint (width × depth) in world units, including the instance scale. */
export function objectFootprintWorld(shape: FloorMapShape): { w: number; d: number } | null {
  const dims = objectDimensionsMM(shape);
  if (!dims) return null;
  const scale = (shape.metadata?.scale as number) || 1;
  return {
    w: mmToWorld(dims.width) * scale,
    d: mmToWorld(dims.depth) * scale,
  };
}

/** Axis-aligned bounds of the (possibly rotated) footprint. */
export function objectBounds(
  shape: FloorMapShape
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const footprint = objectFootprintWorld(shape);
  if (!footprint) return null;
  const { center, rotation } = objectPlacement(shape);
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const halfW = (footprint.w * cos + footprint.d * sin) / 2;
  const halfH = (footprint.w * sin + footprint.d * cos) / 2;
  return {
    minX: center.x - halfW,
    minY: center.y - halfH,
    maxX: center.x + halfW,
    maxY: center.y + halfH,
  };
}

/**
 * Wall snap for a dragged/placed object. Wraps the legacy snapObjectToWall
 * (shared with v1 → identical wallRelative rows) with research-derived
 * thresholds: capture when the object's BACK edge is within `captureWorld`
 * of the wall, measured from the center via depth/2.
 */
export function trySnapObjectToWall(
  def: UnifiedObjectDefinition,
  center: Point,
  shapes: FloorMapShape[],
  planId: string | null,
  captureWorld: number,
  existing?: FloorMapShape['wallRelative']
): { center: Point; rotation: number; wallRelative: NonNullable<FloorMapShape['wallRelative']> } | null {
  if (!def.wallBehavior.attachesToWall) return null;
  const widthWorld = mmToWorld(def.dimensions.width);
  const depthWorld = mmToWorld(def.dimensions.depth);
  const walls = shapes.filter(
    (s) => s.type === 'wall' && (!planId || !s.planId || s.planId === planId)
  );
  if (walls.length === 0) return null;

  const temp: FloorMapShape = {
    id: 'ghost',
    type: 'freehand',
    coordinates: {
      x: center.x - widthWorld / 2,
      y: center.y - depthWorld / 2,
      width: widthWorld,
      height: depthWorld,
    },
    objectCategory: def.category,
    wallRelative: existing,
  } as FloorMapShape;

  const snapped = snapObjectToWall(temp, walls, depthWorld / 2 + captureWorld);
  if (!snapped?.wallRelative) return null;
  const c = snapped.coordinates as { x: number; y: number } | undefined;
  if (!c) return null;
  return {
    center: { x: c.x + widthWorld / 2, y: c.y + depthWorld / 2 },
    rotation: snapped.rotation ?? 0,
    // calculateWallAttachment works in its INPUT units (world px here), but
    // the wallRelative contract — v1's renderer and the elevation view —
    // stores millimeters. Convert the world-derived distances to mm.
    wallRelative: {
      wallId: snapped.wallRelative.wallId,
      distanceFromWallStart: worldToMm(snapped.wallRelative.distanceFromWallStart),
      perpendicularOffset: worldToMm(snapped.wallRelative.perpendicularOffset),
      width: def.dimensions.width,
      depth: def.dimensions.depth,
      height: existing?.height ?? def.dimensions.height,
      elevationBottom: existing?.elevationBottom ?? def.wallBehavior.defaultElevationMM,
    },
  };
}

/** World position + rotation derived from a wallRelative row (v1 formula). */
export function worldFromWallRelative(
  wallRelative: NonNullable<FloorMapShape['wallRelative']>,
  wall: FloorMapShape
): { center: Point; rotation: number } | null {
  const c = wall.coordinates as { x1: number; y1: number; x2: number; y2: number };
  if (typeof c?.x1 !== 'number') return null;
  const dx = c.x2 - c.x1;
  const dy = c.y2 - c.y1;
  const length = Math.hypot(dx, dy);
  if (length === 0) return null;
  const ux = dx / length;
  const uy = dy / length;
  const pxPerMm = worldPerMm();
  const along = (wallRelative.distanceFromWallStart + wallRelative.width / 2) * pxPerMm;
  const perp = (wallRelative.perpendicularOffset + wallRelative.depth / 2) * pxPerMm;
  return {
    center: {
      x: c.x1 + along * ux + perp * -uy,
      y: c.y1 + along * uy + perp * ux,
    },
    rotation: (Math.atan2(dy, dx) * 180) / Math.PI,
  };
}

/** Build a new object shape in the legacy storage form. */
export function buildObjectShape(
  def: UnifiedObjectDefinition,
  center: Point,
  rotation: number,
  planId: string | undefined,
  wallRelative: FloorMapShape['wallRelative'] | null,
  zIndex: number
): FloorMapShape {
  return {
    id: uuidv4(),
    type: 'freehand',
    planId,
    coordinates: {
      points: [
        { x: center.x, y: center.y },
        { x: center.x + 1, y: center.y + 1 },
      ],
    },
    strokeColor: '#374151',
    color: 'transparent',
    strokeWidth: 2,
    name: def.name,
    objectCategory: def.category,
    rotation,
    zIndex,
    ...(wallRelative ? { wallRelative } : {}),
    metadata: {
      isUnifiedObject: true,
      unifiedObjectId: def.id,
      placementX: center.x,
      placementY: center.y,
      scale: 1,
      rotation,
      elevationHeight: def.dimensions.height,
      elevationBottom: wallRelative?.elevationBottom ?? def.wallBehavior.defaultElevationMM,
      depth: def.dimensions.depth,
    },
  };
}

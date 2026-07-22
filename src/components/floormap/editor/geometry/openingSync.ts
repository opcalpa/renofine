/**
 * Derived-coordinate sync for wall-hosted openings.
 *
 * v2 openings carry no world geometry of their own (parentWallId +
 * positionOnWall + widthMM). The executor runs this after every edit that
 * touches walls or openings, writing the derived centerline segment into
 * `coordinates` — that is what the elevation view (and the legacy editor)
 * read, so both keep working without knowing about wall-hosting.
 */

import { FloorMapShape, LineCoordinates } from '../../types';
import { Patch, makeUpdatePatch } from '../core/patches';
import { openingPlacement } from './openingGeometry';

const EPSILON = 0.01; // world units

export function buildOpeningSyncPatches(shapes: FloorMapShape[]): Patch[] {
  const wallById = new Map(shapes.filter((s) => s.type === 'wall').map((s) => [s.id, s]));
  const patches: Patch[] = [];
  for (const shape of shapes) {
    if (shape.type !== 'opening' || !shape.parentWallId) continue;
    const wall = wallById.get(shape.parentWallId);
    if (!wall) continue;
    const placement = openingPlacement(shape, wall);
    if (!placement) continue;
    const { edgeStart, edgeEnd } = placement;
    const c = shape.coordinates as LineCoordinates;
    if (
      c &&
      Math.abs(c.x1 - edgeStart.x) < EPSILON &&
      Math.abs(c.y1 - edgeStart.y) < EPSILON &&
      Math.abs(c.x2 - edgeEnd.x) < EPSILON &&
      Math.abs(c.y2 - edgeEnd.y) < EPSILON
    ) {
      continue;
    }
    patches.push(
      makeUpdatePatch(shape, {
        coordinates: { x1: edgeStart.x, y1: edgeStart.y, x2: edgeEnd.x, y2: edgeEnd.y },
      })
    );
  }
  return patches;
}

const KIND_TO_LEGACY: Partial<Record<string, FloorMapShape['type']>> = {
  door: 'door_line',
  window: 'window_line',
  sliding: 'sliding_door_line',
};

/**
 * Present v2 openings as legacy line-typed shapes for consumers that predate
 * wall-hosting (the elevation view's door_line/window_line/sliding_door_line
 * filters). Passages are omitted on purpose — the legacy elevation never
 * rendered plain opening_line either.
 */
export function v2OpeningsAsLegacy(shapes: FloorMapShape[]): FloorMapShape[] {
  return shapes
    .filter((s) => s.type === 'opening' && s.openingKind && KIND_TO_LEGACY[s.openingKind])
    .map((s) => ({ ...s, type: KIND_TO_LEGACY[s.openingKind!]! }));
}

/**
 * Derived-placement sync for wall-attached library objects.
 *
 * Wall-attached objects store their true position as wallRelative (mm along
 * the wall — what v1 and the elevation view read). v2 renders and hit-tests
 * from metadata.placementX/Y, so whenever a host wall moves the executor
 * re-derives placement (and rotation) from wallRelative here, in the same
 * undo entry. Objects whose wall disappeared detach gracefully (wallRelative
 * dropped, placement kept).
 */

import { FloorMapShape } from '../../types';
import { Patch, makeUpdatePatch } from '../core/patches';
import { isUnifiedObjectShape, worldFromWallRelative } from '../objects/objectModel';

const EPSILON = 0.01;

export function buildObjectSyncPatches(shapes: FloorMapShape[]): Patch[] {
  const wallById = new Map(shapes.filter((s) => s.type === 'wall').map((s) => [s.id, s]));
  const patches: Patch[] = [];
  for (const shape of shapes) {
    if (!isUnifiedObjectShape(shape) || !shape.wallRelative?.wallId) continue;
    const wall = wallById.get(shape.wallRelative.wallId);
    if (!wall) {
      patches.push(makeUpdatePatch(shape, { wallRelative: undefined }));
      continue;
    }
    const derived = worldFromWallRelative(shape.wallRelative, wall);
    if (!derived) continue;
    const currentX = (shape.metadata?.placementX as number) || 0;
    const currentY = (shape.metadata?.placementY as number) || 0;
    const currentRotation = shape.rotation ?? 0;
    if (
      Math.abs(derived.center.x - currentX) < EPSILON &&
      Math.abs(derived.center.y - currentY) < EPSILON &&
      Math.abs(derived.rotation - currentRotation) < EPSILON
    ) {
      continue;
    }
    patches.push(
      makeUpdatePatch(shape, {
        rotation: derived.rotation,
        coordinates: {
          points: [
            { x: derived.center.x, y: derived.center.y },
            { x: derived.center.x + 1, y: derived.center.y + 1 },
          ],
        },
        metadata: {
          ...shape.metadata,
          placementX: derived.center.x,
          placementY: derived.center.y,
          rotation: derived.rotation,
        },
      })
    );
  }
  return patches;
}

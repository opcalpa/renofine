/**
 * Shared placement pipeline for library objects — used by BOTH click-to-place
 * (ObjectPlaceTool) and drag-and-drop from the object panel, so the two paths
 * can never diverge: same wall snap/auto-rotate, same room resolution, same
 * E3 room-items mirroring.
 */

import { useFloorMapStore } from '../../store';
import { FloorMapShape } from '../../types';
import { getUnifiedObjectById } from '../../objectLibrary';
import { execute } from '../core/commands';
import { mmToWorld } from '../core/units';
import { trySnapObjectToWall } from './objectModel';
import { findLinkedRoomAt, resolveRoomItemLinkage } from '../sync/roomItemSync';

export interface ObjectPlacement {
  center: { x: number; y: number };
  rotation: number;
  wallRelative: FloorMapShape['wallRelative'] | null;
}

/** Capture margin beyond the flush distance: max(20 screen px, 150 mm). */
export function objectCaptureMargin(): number {
  const zoom = useFloorMapStore.getState().viewState.zoom || 1;
  return Math.max(20 / zoom, mmToWorld(150));
}

/** Snap-aware placement for a definition at a world point. */
export function computeObjectPlacement(
  definitionId: string,
  world: { x: number; y: number },
  suppressSnap = false
): ObjectPlacement | null {
  const def = getUnifiedObjectById(definitionId);
  if (!def) return null;
  if (!suppressSnap) {
    const store = useFloorMapStore.getState();
    const snapped = trySnapObjectToWall(
      def,
      world,
      store.shapes,
      store.currentPlanId,
      objectCaptureMargin()
    );
    if (snapped) return snapped;
  }
  return { center: world, rotation: 0, wallRelative: null };
}

/**
 * Place an object (one undo step) and resolve its E3 room linkage.
 * Returns the placed shape, or null if the definition is unknown.
 */
export function placeObjectWithLinkage(
  definitionId: string,
  placement: ObjectPlacement
): FloorMapShape | null {
  const store = useFloorMapStore.getState();
  const def = getUnifiedObjectById(definitionId);
  if (!def) return null;

  // The room this placement belongs to — armed link's room wins, otherwise
  // the linked room whose polygon contains the drop point.
  const linkedRoomId =
    store.pendingItemLink?.roomId ??
    findLinkedRoomAt(placement.center, store.shapes, store.currentPlanId)?.roomId ??
    null;

  const shape = execute('object.place', {
    definitionId,
    center: placement.center,
    rotation: placement.rotation,
    wallRelative: placement.wallRelative,
    roomId: linkedRoomId,
  });
  if (shape) resolveRoomItemLinkage(shape, def);
  return shape;
}

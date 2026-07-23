/**
 * E3 linkage for v2 object placement — the canvas and the room-details list
 * are two views of the SAME room_items record.
 *
 *  - forward (E3.1): placement armed from a room's item list
 *    (store.pendingItemLink) → link that room_items row to the new shape.
 *  - reverse (E3.2): a work-relevant object dropped inside a linked room
 *    becomes that room's list entry (and thereby reaches Rumsdetaljer,
 *    arbetskort and the shared worker instructions via get-worker-data).
 *
 * Furniture/decor stays canvas-only — a sofa is layout, not a work item.
 */

import { toast } from 'sonner';
import i18n from '@/i18n/config';
import { useFloorMapStore } from '../../store';
import { FloorMapShape } from '../../types';
import { pointInPolygon, linkPlacedItemToShape, createRoomItemForPlacedShape } from '../../utils/roomItemLink';
import type { UnifiedObjectDefinition } from '../../objectLibrary';

/** Catalog categories that mirror into room_items (work items, not layout). */
const MIRRORED_CATEGORIES = new Set(['electrical', 'plumbing', 'kitchen', 'ventilation', 'appliance']);

/** Whether objects of this catalog category mirror into room_items. */
export function isMirroredCategory(category: string): boolean {
  return MIRRORED_CATEGORIES.has(category);
}

/** The linked room (rooms-table row) whose polygon contains the point. */
export function findLinkedRoomAt(
  point: { x: number; y: number },
  shapes: FloorMapShape[],
  planId: string | null
): FloorMapShape | null {
  return (
    shapes.find(
      (s) =>
        s.type === 'room' &&
        (!planId || s.planId === planId || !s.planId) &&
        !!s.roomId &&
        Array.isArray((s.coordinates as { points?: { x: number; y: number }[] })?.points) &&
        pointInPolygon(point, (s.coordinates as { points: { x: number; y: number }[] }).points)
    ) ?? null
  );
}

/**
 * Resolve the room_items linkage for a just-placed v2 object. Fire-and-forget:
 * failures surface as toasts but never block the placement itself.
 * Reads pendingItemLink from the store and consumes it when present.
 */
export function resolveRoomItemLinkage(shape: FloorMapShape, def: UnifiedObjectDefinition): void {
  const store = useFloorMapStore.getState();
  const planId = store.currentPlanId;
  const projectId = store.currentProjectId;
  const link = store.pendingItemLink;
  if (!planId) return;

  if (link) {
    store.setPendingItemPlacement(null);
    linkPlacedItemToShape(planId, store.shapes, link.itemId, shape.id)
      .then(() =>
        toast.success(i18n.t('roomItems.linkedToPlan', 'Objektet kopplat till ritningen'))
      )
      .catch((err) => {
        console.error('Failed to link room item to shape:', err);
        toast.error(i18n.t('roomItems.linkError', 'Kunde inte koppla objektet till posten'));
      });
    return;
  }

  if (shape.roomId && projectId && MIRRORED_CATEGORIES.has(def.category)) {
    createRoomItemForPlacedShape(planId, store.shapes, projectId, shape.roomId, shape, def.category)
      .then(() =>
        toast.success(i18n.t('roomItems.addedFromPlan', 'Tillagt i rummets objektlista'))
      )
      .catch((err) => console.error('Failed to create room item from placed shape:', err));
  }
}

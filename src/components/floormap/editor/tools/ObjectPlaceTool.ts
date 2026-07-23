/**
 * ObjectPlaceTool — place library objects with a live true-footprint ghost.
 *
 * Industry-consensus behavior (Floorplanner/RoomSketcher/SmartDraw/IKEA):
 * the object being placed is live under the cursor at real scale; wall-aligned
 * objects magnetically snap flush to the nearest wall AND auto-rotate their
 * back against it; hold Cmd/Ctrl to suppress snapping. Click places the
 * object and selects it. Escape (or placing) returns to the select tool.
 */

import { useFloorMapStore } from '../../store';
import { getUnifiedObjectById } from '../../objectLibrary';
import { BaseTool, ToolPointerEvent } from './BaseTool';
import { execute } from '../core/commands';
import { mmToWorld } from '../core/units';
import { trySnapObjectToWall } from '../objects/objectModel';
import { findLinkedRoomAt, resolveRoomItemLinkage } from '../sync/roomItemSync';
import { useEditorUiStore } from '../state/uiStore';

export class ObjectPlaceTool extends BaseTool {
  readonly id = 'object';

  private last: {
    center: { x: number; y: number };
    rotation: number;
    wallRelative: import('../../types').FloorMapShape['wallRelative'] | null;
  } | null = null;

  deactivate(): void {
    this.last = null;
    useEditorUiStore.getState().setObjectGhost(null);
    useEditorUiStore.getState().setSnapFeedback([], []);
  }

  /** Capture margin beyond the flush distance: max(20 screen px, 150 mm). */
  private captureMargin(): number {
    const zoom = useFloorMapStore.getState().viewState.zoom || 1;
    return Math.max(20 / zoom, mmToWorld(150));
  }

  onPointerMove(e: ToolPointerEvent): void {
    const store = useFloorMapStore.getState();
    const defId = store.pendingObjectId;
    if (!defId) return;
    const def = getUnifiedObjectById(defId);
    if (!def) return;

    let center = e.world;
    let rotation = 0;
    let wallRelative: import('../../types').FloorMapShape['wallRelative'] | null = null;

    if (!e.metaOrCtrl) {
      const snapped = trySnapObjectToWall(
        def,
        e.world,
        store.shapes,
        store.currentPlanId,
        this.captureMargin()
      );
      if (snapped) {
        center = snapped.center;
        rotation = snapped.rotation;
        wallRelative = snapped.wallRelative;
      }
    }

    this.last = { center, rotation, wallRelative };
    useEditorUiStore.getState().setObjectGhost({
      definitionId: def.id,
      center,
      rotation,
      widthWorld: mmToWorld(def.dimensions.width),
      depthWorld: mmToWorld(def.dimensions.depth),
      snapped: !!wallRelative,
    });
  }

  onPointerDown(e: ToolPointerEvent): void {
    if (e.button !== 0) return;
    const store = useFloorMapStore.getState();
    const defId = store.pendingObjectId;
    if (!defId) return;
    const def = getUnifiedObjectById(defId);
    const placement = this.last ?? { center: e.world, rotation: 0, wallRelative: null };

    // E3: the room this placement belongs to — armed link's room wins,
    // otherwise the linked room whose polygon contains the drop point.
    const linkedRoomId =
      store.pendingItemLink?.roomId ??
      findLinkedRoomAt(placement.center, store.shapes, store.currentPlanId)?.roomId ??
      null;

    const shape = execute('object.place', {
      definitionId: defId,
      center: placement.center,
      rotation: placement.rotation,
      wallRelative: placement.wallRelative,
      roomId: linkedRoomId,
    });
    if (shape && def) resolveRoomItemLinkage(shape, def);

    // Placed + selected (drop semantics) — return to the select tool.
    store.setPendingObjectId(null);
    useEditorUiStore.getState().setObjectGhost(null);
  }

  onKeyDown(e: KeyboardEvent): boolean {
    if (e.key === 'Escape') {
      useFloorMapStore.getState().setPendingObjectId(null);
      this.deactivate();
      return false; // let the controller switch back to select
    }
    return false;
  }
}

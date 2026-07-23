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
import { mmToWorld } from '../core/units';
import { trySnapObjectToWall } from '../objects/objectModel';
import { objectCaptureMargin, placeObjectWithLinkage } from '../objects/placeObject';
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

  private captureMargin(): number {
    return objectCaptureMargin();
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
    const placement = this.last ?? { center: e.world, rotation: 0, wallRelative: null };
    placeObjectWithLinkage(defId, placement);

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

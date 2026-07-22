/**
 * OpeningTool — place doors/windows/sliding doors/passages on walls.
 *
 * The cursor projects onto the nearest wall (ghost preview shows the exact
 * cut); a click places the opening there. One tool class per opening kind,
 * mapped from the legacy toolbar's door_line/window_line/... tool ids so the
 * existing toolbar drives it unchanged.
 */

import { FloorMapShape } from '../../types';
import { useFloorMapStore } from '../../store';
import { BaseTool, ToolPointerEvent } from './BaseTool';
import { execute } from '../core/commands';
import {
  findNearestWall,
  openingPlacement,
  OPENING_DEFAULT_WIDTH_MM,
} from '../geometry/openingGeometry';
import { useEditorUiStore } from '../state/uiStore';

const SNAP_DISTANCE_PX = 30;

export class OpeningTool extends BaseTool {
  constructor(
    readonly id: string,
    private kind: NonNullable<FloorMapShape['openingKind']>
  ) {
    super();
  }

  private hover: { wallId: string; t: number } | null = null;

  deactivate(): void {
    this.hover = null;
    useEditorUiStore.getState().setOpeningGhost(null);
  }

  onPointerMove(e: ToolPointerEvent): void {
    const store = useFloorMapStore.getState();
    const maxDistance = SNAP_DISTANCE_PX / store.viewState.zoom;
    const hit = findNearestWall(e.world, store.shapes, store.currentPlanId, maxDistance);
    if (!hit) {
      this.hover = null;
      useEditorUiStore.getState().setOpeningGhost(null);
      return;
    }
    this.hover = { wallId: hit.wall.id, t: hit.t };
    const widthMM = OPENING_DEFAULT_WIDTH_MM[this.kind];
    const placement = openingPlacement(
      { positionOnWall: hit.t, metadata: { widthMM } },
      hit.wall
    );
    useEditorUiStore
      .getState()
      .setOpeningGhost(placement ? { rect: placement.rect, valid: true } : null);
  }

  onPointerDown(e: ToolPointerEvent): void {
    if (e.button !== 0 || !this.hover) return;
    execute('opening.add', {
      wallId: this.hover.wallId,
      t: this.hover.t,
      kind: this.kind,
    });
  }

  onKeyDown(e: KeyboardEvent): boolean {
    if (e.key === 'Escape') {
      this.deactivate();
      return false; // let the controller switch back to select
    }
    return false;
  }
}

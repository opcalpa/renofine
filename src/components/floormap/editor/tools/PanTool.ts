/**
 * PanTool — drag to pan. Also used transiently while Space is held.
 */

import { useFloorMapStore } from '../../store';
import { BaseTool, ToolPointerEvent } from './BaseTool';
import { Point } from '../state/uiStore';

export class PanTool extends BaseTool {
  readonly id = 'pan';

  private lastScreen: Point | null = null;

  deactivate(): void {
    this.lastScreen = null;
  }

  onPointerDown(e: ToolPointerEvent): void {
    this.lastScreen = e.screen;
  }

  onPointerMove(e: ToolPointerEvent): void {
    if (!this.lastScreen) return;
    const store = useFloorMapStore.getState();
    store.setViewState({
      panX: store.viewState.panX + (e.screen.x - this.lastScreen.x),
      panY: store.viewState.panY + (e.screen.y - this.lastScreen.y),
    });
    this.lastScreen = e.screen;
  }

  onPointerUp(): void {
    this.lastScreen = null;
  }
}

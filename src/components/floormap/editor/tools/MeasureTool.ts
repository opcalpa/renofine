/**
 * MeasureTool (M) — click two points to lay down a measurement; measurements
 * stack up while the tool is active and clear when it deactivates. Purely
 * ephemeral (ui store only): never persisted, never in undo history.
 *
 * Snapping (endpoints, midpoints, grid, ortho with Shift) makes it precise
 * enough to check real distances, e.g. wall-to-wall clearances.
 */

import { BaseTool, ToolPointerEvent } from './BaseTool';
import { snap } from '../snapping/SnapEngine';
import { formatWorldAsMm } from '../core/units';
import { Point, useEditorUiStore } from '../state/uiStore';

export class MeasureTool extends BaseTool {
  readonly id = 'measure';

  private start: Point | null = null;
  private lastSnapped: Point | null = null;

  deactivate(): void {
    this.cancel();
    useEditorUiStore.getState().setMeasurements([]);
  }

  private ui() {
    return useEditorUiStore.getState();
  }

  onPointerMove(e: ToolPointerEvent): void {
    const result = snap({
      point: e.world,
      anchor: this.start ?? undefined,
      disabled: e.metaOrCtrl,
      forceOrtho: e.shiftKey,
    });
    this.lastSnapped = result.point;
    this.ui().setSnapFeedback(result.glyphs, result.guides);
    if (this.start) {
      const label = formatWorldAsMm(
        Math.hypot(result.point.x - this.start.x, result.point.y - this.start.y)
      );
      this.ui().setDraft([this.start], result.point, label);
    }
  }

  onPointerDown(e: ToolPointerEvent): void {
    if (e.button !== 0) return;
    const target = this.lastSnapped ?? e.world;
    if (!this.start) {
      this.start = { ...target };
      this.ui().setDraft([this.start], target, null);
      return;
    }
    if (Math.hypot(target.x - this.start.x, target.y - this.start.y) > 0.5) {
      const ui = this.ui();
      ui.setMeasurements([...ui.measurements, { from: this.start, to: { ...target } }]);
    }
    this.start = null;
    this.ui().setDraft([], null, null);
  }

  onKeyDown(e: KeyboardEvent): boolean {
    if (e.key === 'Escape') {
      // First Escape cancels the in-progress measurement, second clears the
      // laid-down ones; with nothing left, upstream switches back to select.
      if (this.start) {
        this.cancel();
        return true;
      }
      if (this.ui().measurements.length > 0) {
        this.ui().setMeasurements([]);
        return true;
      }
      return false;
    }
    return false;
  }

  private cancel(): void {
    this.start = null;
    this.lastSnapped = null;
    this.ui().setDraft([], null, null);
    this.ui().setSnapFeedback([], []);
  }
}

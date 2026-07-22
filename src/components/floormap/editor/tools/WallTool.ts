/**
 * WallTool — click-click polyline wall drawing.
 *
 * - Click places vertices; the rubber-band segment shows a live mm label.
 * - Type digits + Enter while drawing to commit the segment at an exact
 *   length in the current direction (type-to-dimension).
 * - Enter/double-click/Escape ends the chain; snapping back onto the start
 *   point closes it.
 */

import { BaseTool, ToolPointerEvent } from './BaseTool';
import { execute } from '../core/commands';
import { snap } from '../snapping/SnapEngine';
import { formatWorldAsMm, mmToWorld } from '../core/units';
import { Point, useEditorUiStore } from '../state/uiStore';

export class WallTool extends BaseTool {
  readonly id = 'wall';

  private points: Point[] = [];
  private lastSnapped: Point | null = null;
  private lastDownScreen: Point | null = null;
  private prevDownScreen: Point | null = null;

  deactivate(): void {
    this.finish();
  }

  private ui() {
    return useEditorUiStore.getState();
  }

  private updatePreview(cursor: Point | null) {
    const anchor = this.points[this.points.length - 1] ?? null;
    const label =
      anchor && cursor
        ? formatWorldAsMm(Math.hypot(cursor.x - anchor.x, cursor.y - anchor.y))
        : null;
    this.ui().setDraft(this.points, cursor, label);
  }

  onPointerMove(e: ToolPointerEvent): void {
    const anchor = this.points[this.points.length - 1];
    const result = snap({
      point: e.world,
      anchor,
      disabled: e.metaOrCtrl,
      forceOrtho: e.shiftKey,
    });
    this.lastSnapped = result.point;
    this.ui().setSnapFeedback(result.glyphs, result.guides);
    this.updatePreview(result.point);
  }

  onPointerDown(e: ToolPointerEvent): void {
    if (e.button !== 0) return;
    this.prevDownScreen = this.lastDownScreen;
    this.lastDownScreen = { ...e.screen };
    const target = this.lastSnapped ?? e.world;

    // Clicking the start point closes the loop.
    if (this.points.length >= 2) {
      const start = this.points[0];
      if (Math.hypot(target.x - start.x, target.y - start.y) < mmToWorld(50)) {
        this.points.push({ ...start });
        this.finish();
        return;
      }
    }

    this.points.push({ ...target });
    this.ui().setDimensionInput('');
    this.updatePreview(target);
  }

  onDoubleClick(): void {
    // Konva's double-click fires on two QUICK clicks even far apart, which
    // would cut fast polyline drawing short. Only treat it as "finish" when
    // both clicks landed on (nearly) the same spot.
    if (
      this.prevDownScreen &&
      this.lastDownScreen &&
      Math.hypot(
        this.lastDownScreen.x - this.prevDownScreen.x,
        this.lastDownScreen.y - this.prevDownScreen.y
      ) > 8
    ) {
      return;
    }
    // Drop the duplicate vertex the second click just added.
    if (this.points.length >= 2) this.points.pop();
    this.finish();
  }

  onKeyDown(e: KeyboardEvent): boolean {
    if (e.key === 'Escape') {
      // First Escape cancels the rubber-band chain; tool switch is handled
      // upstream when there is nothing to cancel.
      if (this.points.length > 0) {
        this.cancel();
        return true;
      }
      return false;
    }

    // Type-to-dimension: digits build up a mm value, Enter commits the
    // segment at that exact length along the current rubber-band direction.
    if (/^[0-9]$/.test(e.key) && this.points.length > 0) {
      this.ui().setDimensionInput(this.ui().dimensionInput + e.key);
      return true;
    }
    if (e.key === 'Backspace' && this.ui().dimensionInput.length > 0) {
      this.ui().setDimensionInput(this.ui().dimensionInput.slice(0, -1));
      return true;
    }
    if (e.key === 'Enter') {
      const input = this.ui().dimensionInput;
      const anchor = this.points[this.points.length - 1];
      if (input && anchor && this.lastSnapped) {
        const lengthMM = parseInt(input, 10);
        if (lengthMM > 0) {
          const dx = this.lastSnapped.x - anchor.x;
          const dy = this.lastSnapped.y - anchor.y;
          const dist = Math.hypot(dx, dy) || 1;
          const world = mmToWorld(lengthMM);
          const next = { x: anchor.x + (dx / dist) * world, y: anchor.y + (dy / dist) * world };
          this.points.push(next);
          this.lastSnapped = next;
          this.ui().setDimensionInput('');
          this.updatePreview(next);
          return true;
        }
      }
      // Enter with no pending dimension ends the chain.
      this.finish();
      return true;
    }
    return false;
  }

  private finish(): void {
    if (this.points.length >= 2) {
      execute('wall.draw', { points: this.points });
    }
    this.cancel();
  }

  private cancel(): void {
    this.points = [];
    this.lastSnapped = null;
    this.lastDownScreen = null;
    this.prevDownScreen = null;
    this.ui().clearDraft();
    this.ui().setSnapFeedback([], []);
  }
}

/**
 * RoomRectTool (R) — quick-path room drawing: drag a rectangle and it becomes
 * four walls; the closed loop then auto-creates the room via face detection
 * (walls stay the source of truth, per the v2 room model).
 */

import { BaseTool, ToolPointerEvent } from './BaseTool';
import { execute } from '../core/commands';
import { snap } from '../snapping/SnapEngine';
import { formatWorldAsMm } from '../core/units';
import { Point, useEditorUiStore } from '../state/uiStore';

export class RoomRectTool extends BaseTool {
  readonly id = 'room';

  private start: Point | null = null;

  deactivate(): void {
    this.cancel();
  }

  private ui() {
    return useEditorUiStore.getState();
  }

  onPointerDown(e: ToolPointerEvent): void {
    if (e.button !== 0) return;
    const result = snap({ point: e.world, disabled: e.metaOrCtrl });
    this.start = { ...result.point };
  }

  onPointerMove(e: ToolPointerEvent): void {
    const result = snap({
      point: e.world,
      anchor: this.start ?? undefined,
      disabled: e.metaOrCtrl,
    });
    this.ui().setSnapFeedback(result.glyphs, result.guides);
    if (!this.start) return;
    const p = result.point;
    const label = `${formatWorldAsMm(Math.abs(p.x - this.start.x))} × ${formatWorldAsMm(Math.abs(p.y - this.start.y))}`;
    // Preview the rectangle outline via the draft polyline
    this.ui().setDraft(
      [
        this.start,
        { x: p.x, y: this.start.y },
        p,
        { x: this.start.x, y: p.y },
        this.start,
      ],
      p,
      label
    );
  }

  onPointerUp(e: ToolPointerEvent): void {
    if (!this.start) return;
    const result = snap({ point: e.world, anchor: this.start, disabled: e.metaOrCtrl });
    const a = this.start;
    const b = result.point;
    this.cancel();
    // Ignore accidental clicks — require a footprint of at least 300 mm
    if (Math.abs(b.x - a.x) < 30 || Math.abs(b.y - a.y) < 30) return;
    execute('wall.draw', {
      points: [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }, a],
    });
  }

  onKeyDown(e: KeyboardEvent): boolean {
    if (e.key === 'Escape' && this.start) {
      this.cancel();
      return true;
    }
    return false;
  }

  private cancel(): void {
    this.start = null;
    this.ui().setDraft([], null, null);
    this.ui().setSnapFeedback([], []);
  }
}

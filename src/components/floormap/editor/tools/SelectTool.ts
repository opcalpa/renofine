/**
 * SelectTool v1 — click select, shift-click add/remove, marquee on empty
 * space, drag to move selection (junction-aware for walls), Delete to remove.
 */

import { LineCoordinates } from '../../types';
import { useFloorMapStore } from '../../store';
import { BaseTool, ToolPointerEvent } from './BaseTool';
import { execute } from '../core/commands';
import { beginGesture, endGesture } from '../core/executor';
import { snap } from '../snapping/SnapEngine';
import { mmToWorld } from '../core/units';
import { shapeBounds } from '../geometry/bounds';
import { openingCornerGuides } from '../geometry/openingGeometry';
import { Point, useEditorUiStore } from '../state/uiStore';

type DragMode =
  | { kind: 'none' }
  | { kind: 'maybe-marquee'; start: Point }
  | { kind: 'marquee'; start: Point }
  | { kind: 'move'; start: Point; last: Point; ids: string[] }
  | { kind: 'junction'; at: Point; wallIds: string[] };

export class SelectTool extends BaseTool {
  readonly id = 'select';

  private drag: DragMode = { kind: 'none' };

  deactivate(): void {
    this.drag = { kind: 'none' };
    useEditorUiStore.getState().setMarquee(null);
  }

  onPointerDown(e: ToolPointerEvent): void {
    if (e.button !== 0) return;
    const store = useFloorMapStore.getState();

    // Dimension label: open the inline length editor instead of selecting.
    if (e.hitName?.startsWith('dim:')) {
      useEditorUiStore.getState().setWallLengthEditId(e.hitName.slice(4));
      return;
    }

    // Junction handle: drag moves every wall endpoint meeting at that point.
    if (e.hitName?.startsWith('junction:')) {
      const [, xs, ys] = e.hitName.split(':');
      const at = { x: parseFloat(xs), y: parseFloat(ys) };
      const wallIds = store.shapes
        .filter((s) => s.type === 'wall' && s.coordinates && 'x1' in (s.coordinates as object))
        .filter((s) => {
          const c = s.coordinates as LineCoordinates;
          return (
            Math.hypot(c.x1 - at.x, c.y1 - at.y) < 1 || Math.hypot(c.x2 - at.x, c.y2 - at.y) < 1
          );
        })
        .map((s) => s.id);
      this.drag = { kind: 'junction', at, wallIds };
      beginGesture('Flytta hörn');
      return;
    }

    if (e.hitShape && !e.hitShape.locked) {
      const id = e.hitShape.id;
      const selected = store.selectedShapeIds;
      if (e.shiftKey) {
        store.setSelectedShapeIds(
          selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]
        );
      } else if (!selected.includes(id)) {
        store.setSelectedShapeIds([id]);
      }
      const ids = useFloorMapStore.getState().selectedShapeIds;
      this.drag = { kind: 'move', start: e.world, last: e.world, ids };
      beginGesture('Flytta');
      return;
    }

    // Empty space: begin (potential) marquee; plain click clears selection.
    if (!e.shiftKey) store.clearSelection();
    this.drag = { kind: 'maybe-marquee', start: e.world };
  }

  onPointerMove(e: ToolPointerEvent): void {
    const ui = useEditorUiStore.getState();

    if (this.drag.kind === 'maybe-marquee') {
      if (Math.hypot(e.world.x - this.drag.start.x, e.world.y - this.drag.start.y) > 2) {
        this.drag = { kind: 'marquee', start: this.drag.start };
      }
    }

    if (this.drag.kind === 'marquee') {
      ui.setMarquee({ start: this.drag.start, end: e.world });
      return;
    }

    if (this.drag.kind === 'junction') {
      const result = snap({
        point: e.world,
        disabled: e.metaOrCtrl,
        ignoreIds: this.drag.wallIds,
      });
      ui.setSnapFeedback(result.glyphs, result.guides);
      if (result.point.x === this.drag.at.x && result.point.y === this.drag.at.y) return;
      execute('junction.move', { at: this.drag.at, to: result.point });
      this.drag = { ...this.drag, at: result.point };
      return;
    }

    if (this.drag.kind === 'move') {
      // Move incrementally with grid-snapped delta from the last position;
      // the whole gesture becomes ONE undo entry via the transaction in onPointerUp.
      const result = snap({ point: e.world, disabled: e.metaOrCtrl, ignoreIds: this.drag.ids });
      const dx = result.point.x - this.drag.last.x;
      const dy = result.point.y - this.drag.last.y;
      if (dx === 0 && dy === 0) return;
      this.moveSelection(this.drag.ids, dx, dy);
      this.drag = { ...this.drag, last: result.point };
      this.updateOpeningGuides(this.drag.ids);
    }
  }

  /** Corner-distance readout while a single opening slides along its wall. */
  private updateOpeningGuides(ids: string[]): void {
    if (ids.length !== 1) return;
    const shapes = useFloorMapStore.getState().shapes;
    const opening = shapes.find((s) => s.id === ids[0]);
    if (opening?.type !== 'opening' || !opening.parentWallId) return;
    const wall = shapes.find((s) => s.id === opening.parentWallId);
    if (!wall) return;
    useEditorUiStore.getState().setSnapFeedback([], openingCornerGuides(opening, wall));
  }

  onPointerUp(e: ToolPointerEvent): void {
    const ui = useEditorUiStore.getState();
    const store = useFloorMapStore.getState();

    if (this.drag.kind === 'marquee') {
      const { start } = this.drag;
      const minX = Math.min(start.x, e.world.x);
      const maxX = Math.max(start.x, e.world.x);
      const minY = Math.min(start.y, e.world.y);
      const maxY = Math.max(start.y, e.world.y);
      const hitIds = store.shapes
        .filter((s) => s.planId === store.currentPlanId || !s.planId)
        .filter((s) => !s.locked && s.type !== 'image')
        .filter((s) => {
          const b = shapeBounds(s);
          return b && b.minX >= minX && b.maxX <= maxX && b.minY >= minY && b.maxY <= maxY;
        })
        .map((s) => s.id);
      const merged = e.shiftKey
        ? Array.from(new Set([...store.selectedShapeIds, ...hitIds]))
        : hitIds;
      store.setSelectedShapeIds(merged);
      ui.setMarquee(null);
    }

    if (this.drag.kind === 'move' || this.drag.kind === 'junction') {
      endGesture();
      ui.setSnapFeedback([], []);
    }
    this.drag = { kind: 'none' };
  }

  // v1 moves the selection rigidly; walls connected to unselected walls keep
  // their own endpoints. Junction-aware topology editing arrives with the
  // room phase.
  private moveSelection(ids: string[], dx: number, dy: number): void {
    execute('shape.move', { ids, dx, dy });
  }

  onDoubleClick(e: ToolPointerEvent): void {
    if (e.hitShape?.type !== 'room') return;
    // Linked rooms open the full room-details panel (same as the rooms
    // list); unlinked auto-rooms get the naming dialog first.
    if (e.hitShape.roomId) {
      useEditorUiStore.getState().setRoomDetailsRoomId(e.hitShape.roomId);
    } else {
      useEditorUiStore.getState().setNamingShapeId(e.hitShape.id);
    }
  }

  onKeyDown(e: KeyboardEvent): boolean {
    const store = useFloorMapStore.getState();
    if ((e.key === 'Delete' || e.key === 'Backspace') && store.selectedShapeIds.length > 0) {
      execute('shape.delete', { ids: store.selectedShapeIds });
      return true;
    }
    if (e.key === 'Escape' && store.selectedShapeIds.length > 0) {
      store.clearSelection();
      return true;
    }
    // F flips the hinge/side of a selected opening
    if (e.key.toLowerCase() === 'f' && store.selectedShapeIds.length === 1) {
      const shape = store.shapes.find((s) => s.id === store.selectedShapeIds[0]);
      if (shape?.type === 'opening') {
        execute('opening.flip', { id: shape.id });
        return true;
      }
    }
    // Arrow keys nudge the selection: 10 mm, Shift = 100 mm
    if (e.key.startsWith('Arrow') && store.selectedShapeIds.length > 0) {
      const step = mmToWorld(e.shiftKey ? 100 : 10);
      const delta: Record<string, { dx: number; dy: number }> = {
        ArrowLeft: { dx: -step, dy: 0 },
        ArrowRight: { dx: step, dy: 0 },
        ArrowUp: { dx: 0, dy: -step },
        ArrowDown: { dx: 0, dy: step },
      };
      const d = delta[e.key];
      if (d) {
        execute('shape.move', { ids: store.selectedShapeIds, ...d });
        return true;
      }
    }
    return false;
  }
}

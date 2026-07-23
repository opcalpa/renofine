/**
 * ToolController — one pointer/keyboard pipeline for the v2 editor.
 *
 * Normalizes stage events into ToolPointerEvents (world coords, modifiers,
 * hit shape) and forwards them to the active tool. Space temporarily swaps in
 * the pan tool, mirroring Figma.
 */

import Konva from 'konva';
import { KonvaEventObject } from 'konva/lib/Node';
import { FloorMapShape, Tool } from '../../types';
import { useFloorMapStore } from '../../store';
import { BaseTool, ToolPointerEvent } from './BaseTool';
import { SelectTool } from './SelectTool';
import { WallTool } from './WallTool';
import { PanTool } from './PanTool';
import { OpeningTool } from './OpeningTool';
import { MeasureTool } from './MeasureTool';
import { ObjectPlaceTool } from './ObjectPlaceTool';
import { undo, redo } from '../core/executor';
import { execute } from '../core/commands';
import { copySelection, cutSelection, pasteClipboard } from '../core/clipboard';

export class ToolController {
  private tools: Map<string, BaseTool> = new Map();
  private active: BaseTool;
  private spacePan: { previous: BaseTool } | null = null;

  constructor() {
    for (const tool of [
      new SelectTool(),
      new WallTool(),
      new PanTool(),
      new MeasureTool(),
      new ObjectPlaceTool(),
      // Legacy toolbar tool ids map straight onto the v2 opening tool.
      new OpeningTool('door_line', 'door'),
      new OpeningTool('window_line', 'window'),
      new OpeningTool('sliding_door_line', 'sliding'),
      new OpeningTool('opening_line', 'passage'),
    ]) {
      this.tools.set(tool.id, tool);
    }
    this.active = this.tools.get('select')!;
    this.active.activate();
  }

  /** Map store tools to v2 tools; unknown tools fall back to select. */
  setActiveTool(storeTool: Tool): void {
    const next = this.tools.get(storeTool) ?? this.tools.get('select')!;
    if (next === this.active) return;
    this.active.deactivate();
    this.active = next;
    this.active.activate();
  }

  dispose(): void {
    this.active.deactivate();
  }

  private toEvent(e: KonvaEventObject<MouseEvent | PointerEvent>, stage: Konva.Stage): ToolPointerEvent | null {
    const pointer = stage.getPointerPosition();
    if (!pointer) return null;
    const { viewState, shapes } = useFloorMapStore.getState();
    const world = {
      x: (pointer.x - viewState.panX) / viewState.zoom,
      y: (pointer.y - viewState.panY) / viewState.zoom,
    };

    // Hit shape via Konva node name convention: nodes carry shape id in `name`.
    let hitShape: FloorMapShape | null = null;
    const targetId = e.target?.name();
    if (targetId) {
      hitShape = shapes.find((s) => s.id === targetId) ?? null;
    }

    return {
      world,
      screen: pointer,
      shiftKey: e.evt.shiftKey,
      metaOrCtrl: e.evt.metaKey || e.evt.ctrlKey,
      altKey: e.evt.altKey,
      hitShape,
      hitName: targetId || null,
      button: e.evt.button ?? 0,
    };
  }

  onPointerDown(e: KonvaEventObject<MouseEvent | PointerEvent>, stage: Konva.Stage): void {
    const event = this.toEvent(e, stage);
    if (!event) return;
    // Clicking a dimension label opens an autofocused inline editor. Cancel
    // the pointerdown so the compat mousedown's default action (moving focus
    // to the page body) doesn't immediately blur-close that editor.
    if (event.hitName?.startsWith('dim:')) e.evt.preventDefault();
    this.active.onPointerDown(event);
  }

  onPointerMove(e: KonvaEventObject<MouseEvent | PointerEvent>, stage: Konva.Stage): void {
    const event = this.toEvent(e, stage);
    if (event) this.active.onPointerMove(event);
  }

  onPointerUp(e: KonvaEventObject<MouseEvent | PointerEvent>, stage: Konva.Stage): void {
    const event = this.toEvent(e, stage);
    if (event) this.active.onPointerUp(event);
  }

  onDoubleClick(e: KonvaEventObject<MouseEvent | PointerEvent>, stage: Konva.Stage): void {
    const event = this.toEvent(e, stage);
    if (event) this.active.onDoubleClick(event);
  }

  /** Returns true if the event was consumed. */
  onKeyDown(e: KeyboardEvent): boolean {
    // Don't steal keys from form fields.
    const target = e.target as HTMLElement | null;
    if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return false;
    if (target?.isContentEditable) return false;

    const store = useFloorMapStore.getState();
    const mod = e.metaKey || e.ctrlKey;

    // History
    if (mod && e.key.toLowerCase() === 'z') {
      if (e.shiftKey) redo();
      else undo();
      return true;
    }
    if (mod && e.key.toLowerCase() === 'y') {
      redo();
      return true;
    }

    // Clipboard + duplicate + select all
    if (mod && e.key.toLowerCase() === 'c') {
      return copySelection() > 0;
    }
    if (mod && e.key.toLowerCase() === 'x') {
      return cutSelection() > 0;
    }
    if (mod && e.key.toLowerCase() === 'v') {
      return pasteClipboard().length > 0;
    }
    if (mod && e.key.toLowerCase() === 'd') {
      if (store.selectedShapeIds.length === 0) return false;
      execute('selection.duplicate', { ids: store.selectedShapeIds });
      return true;
    }
    if (mod && e.key.toLowerCase() === 'a') {
      const ids = store.shapes
        .filter((s) => (s.planId === store.currentPlanId || !s.planId) && !s.locked && s.type !== 'image')
        .map((s) => s.id);
      store.setSelectedShapeIds(ids);
      return true;
    }

    // Space → transient pan
    if (e.key === ' ' && !this.spacePan) {
      this.spacePan = { previous: this.active };
      this.active.deactivate();
      this.active = this.tools.get('pan')!;
      this.active.activate();
      return true;
    }

    // Active tool gets first go at everything else.
    if (this.active.onKeyDown(e)) return true;

    // One-key tool shortcuts
    if (!mod && !e.altKey) {
      const toolByKey: Record<string, Tool> = {
        v: 'select',
        w: 'wall',
        h: 'pan',
        d: 'door_line',
        m: 'measure',
      };
      const tool = toolByKey[e.key.toLowerCase()];
      if (tool) {
        store.setActiveTool(tool);
        return true;
      }
      if (e.key === 'Escape') {
        store.setActiveTool('select');
        return true;
      }
    }
    return false;
  }

  onKeyUp(e: KeyboardEvent): void {
    if (e.key === ' ' && this.spacePan) {
      this.active.deactivate();
      this.active = this.spacePan.previous;
      this.active.activate();
      this.spacePan = null;
    }
  }
}

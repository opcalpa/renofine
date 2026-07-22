/**
 * Tool contract for the v2 editor.
 *
 * The ToolController normalizes pointer events (world coords, modifiers, hit
 * shape) and forwards them to the active tool. Tools keep their own
 * interaction state, write previews to the ui store, and commit changes
 * exclusively through editor commands.
 */

import { FloorMapShape } from '../../types';
import { Point } from '../state/uiStore';

export interface ToolPointerEvent {
  /** Pointer position in world coordinates. */
  world: Point;
  /** Raw screen position (stage-relative px). */
  screen: Point;
  shiftKey: boolean;
  metaOrCtrl: boolean;
  altKey: boolean;
  /** Topmost shape under the pointer, if any. */
  hitShape: FloorMapShape | null;
  /** Raw Konva node name under the pointer (e.g. "junction:x:y" handles). */
  hitName: string | null;
  /** Mouse button: 0 left, 1 middle, 2 right. */
  button: number;
}

export abstract class BaseTool {
  abstract readonly id: string;

  activate(): void {}
  deactivate(): void {}

  onPointerDown(_e: ToolPointerEvent): void {}
  onPointerMove(_e: ToolPointerEvent): void {}
  onPointerUp(_e: ToolPointerEvent): void {}
  onDoubleClick(_e: ToolPointerEvent): void {}
  /** Return true if the key was consumed. */
  onKeyDown(_e: KeyboardEvent): boolean {
    return false;
  }
}

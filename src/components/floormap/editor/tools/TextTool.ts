/**
 * TextTool (T) — click to place a text label; the inline editor (DOM input,
 * same pattern as WallLengthEditor) opens immediately for typing. Double-click
 * on an existing text in the select tool reopens the editor.
 */

import { v4 as uuidv4 } from 'uuid';
import { FloorMapShape } from '../../types';
import { useFloorMapStore } from '../../store';
import { BaseTool, ToolPointerEvent } from './BaseTool';
import { commands } from '../core/commands';
import { useEditorUiStore } from '../state/uiStore';

export class TextTool extends BaseTool {
  readonly id = 'text';

  onPointerDown(e: ToolPointerEvent): void {
    if (e.button !== 0) return;
    const shape: FloorMapShape = {
      id: uuidv4(),
      type: 'text',
      coordinates: { x: e.world.x, y: e.world.y },
      text: '',
      fontSize: 16,
      planId: useFloorMapStore.getState().currentPlanId || undefined,
    };
    commands['shape.add']({ shape });
    useFloorMapStore.getState().setSelectedShapeIds([shape.id]);
    useEditorUiStore.getState().setTextEditId(shape.id);
    // One label per activation — back to select for immediate adjust/move
    useFloorMapStore.getState().setActiveTool('select');
  }
}

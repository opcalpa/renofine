/**
 * In-editor clipboard (Cmd/Ctrl+C/X/V) for the v2 editor.
 *
 * Module-level, serialized-copy semantics: copy deep-clones the selected
 * shapes, paste re-materializes them with fresh ids through the normal
 * command pipeline (one undo entry). Openings paste only when their host
 * wall is part of the clipboard; copied room shapes drop their rooms-table
 * link so a paste never double-links a database row.
 */

import { v4 as uuidv4 } from 'uuid';
import { FloorMapShape } from '../../types';
import { useFloorMapStore } from '../../store';
import { commit, getShapes } from './executor';
import { Patch } from './patches';
import { mapShapePoints } from '../geometry/bounds';

let clipboard: FloorMapShape[] = [];
let pasteCount = 0;

const PASTE_OFFSET_WORLD = 30; // = 300 mm at standard scale

export function copySelection(): number {
  const { shapes, selectedShapeIds } = useFloorMapStore.getState();
  const idSet = new Set(selectedShapeIds);
  clipboard = structuredClone(shapes.filter((s) => idSet.has(s.id) && !s.locked));
  pasteCount = 0;
  return clipboard.length;
}

export function cutSelection(): number {
  const count = copySelection();
  if (count > 0) {
    const ids = clipboard.map((s) => s.id);
    commit(
      'Klipp ut',
      getShapes()
        .filter((s) => ids.includes(s.id))
        .map((s) => ({ op: 'remove' as const, shape: s }))
    );
    useFloorMapStore.getState().clearSelection();
  }
  return count;
}

export function pasteClipboard(): string[] {
  if (clipboard.length === 0) return [];
  pasteCount += 1;
  const offset = PASTE_OFFSET_WORLD * pasteCount;
  const planId = useFloorMapStore.getState().currentPlanId || undefined;
  const idMap = new Map(clipboard.map((s) => [s.id, uuidv4()]));

  const patches: Patch[] = [];
  for (const original of clipboard) {
    if (original.type === 'opening') {
      if (!original.parentWallId || !idMap.has(original.parentWallId)) continue;
      patches.push({
        op: 'add',
        shape: {
          ...structuredClone(original),
          id: idMap.get(original.id)!,
          parentWallId: idMap.get(original.parentWallId)!,
          planId,
        },
      });
      continue;
    }
    const copy: FloorMapShape = {
      ...structuredClone(original),
      id: idMap.get(original.id)!,
      planId,
      ...mapShapePoints(original, (p) => ({ x: p.x + offset, y: p.y + offset })),
    };
    delete copy.roomId;
    patches.push({ op: 'add', shape: copy });
  }
  if (patches.length === 0) return [];
  commit('Klistra in', patches);
  const newIds = patches.map((p) => (p.op === 'add' ? p.shape.id : '')).filter(Boolean);
  useFloorMapStore.getState().setSelectedShapeIds(newIds);
  return newIds;
}

export function clipboardSize(): number {
  return clipboard.length;
}

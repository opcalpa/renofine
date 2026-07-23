/**
 * Command executor with patch-based undo/redo history.
 *
 * The executor is the ONLY thing allowed to mutate `shapes` in the store when
 * the v2 editor is active. UI tools and (later) Renaida both go through
 * `execute()` / `transaction()`, so every change is undoable, labelled, and
 * expressible as data.
 */

import { useFloorMapStore } from '../../store';
import { FloorMapShape } from '../../types';
import { Patch, applyPatches, invertPatches } from './patches';
import { useEditorUiStore } from '../state/uiStore';
import { buildRoomReconcilePatches } from '../geometry/roomReconciler';
import { buildOpeningSyncPatches } from '../geometry/openingSync';
import { buildObjectSyncPatches } from '../geometry/objectSync';

export interface HistoryEntry {
  label: string;
  patches: Patch[];
}

const HISTORY_LIMIT = 100;

interface ExecutorState {
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  /** Non-null while inside a transaction: patches accumulate here. */
  pending: { label: string; patches: Patch[] } | null;
}

const state: ExecutorState = {
  undoStack: [],
  redoStack: [],
  pending: null,
};

function syncUiFlags() {
  useEditorUiStore.getState().setHistoryFlags(state.undoStack.length > 0, state.redoStack.length > 0);
}

function setShapes(shapes: FloorMapShape[]) {
  // Bypass the legacy snapshot history — the executor owns v2 history.
  useFloorMapStore.setState({ shapes });
}

export function getShapes(): FloorMapShape[] {
  return useFloorMapStore.getState().shapes;
}

function touchesWalls(patches: Patch[], shapes: FloorMapShape[]): boolean {
  const wallIds = new Set(shapes.filter((s) => s.type === 'wall').map((s) => s.id));
  return patches.some((p) =>
    p.op === 'update'
      ? wallIds.has(p.id) && p.after.coordinates !== undefined
      : p.shape.type === 'wall'
  );
}

function touchesOpenings(patches: Patch[], shapes: FloorMapShape[]): boolean {
  const openingIds = new Set(shapes.filter((s) => s.type === 'opening').map((s) => s.id));
  return patches.some((p) =>
    p.op === 'update' ? openingIds.has(p.id) : p.shape.type === 'opening'
  );
}

let reconciling = false;

/**
 * Apply patches as one undoable step (or accumulate into the open transaction).
 * Wall mutations trigger room reconciliation (auto-rooms from closed wall
 * loops) inside the same undo entry, so undo is always atomic.
 * Returns the patches for callers that need the result (e.g. created ids).
 */
export function commit(label: string, patches: Patch[]): Patch[] {
  if (patches.length === 0) return patches;
  setShapes(applyPatches(getShapes(), patches));

  let all = patches;
  const wallsTouched = !reconciling && touchesWalls(patches, getShapes());
  const openingsTouched = !reconciling && touchesOpenings(patches, getShapes());
  if (wallsTouched || openingsTouched) {
    reconciling = true;
    try {
      if (wallsTouched) {
        const roomPatches = buildRoomReconcilePatches(getShapes());
        if (roomPatches.length > 0) {
          setShapes(applyPatches(getShapes(), roomPatches));
          all = [...all, ...roomPatches];
        }
      }
      // Keep openings' derived world coordinates fresh (elevation view +
      // legacy editor read them) whenever walls or openings changed.
      const openingPatches = buildOpeningSyncPatches(getShapes());
      if (openingPatches.length > 0) {
        setShapes(applyPatches(getShapes(), openingPatches));
        all = [...all, ...openingPatches];
      }
      // Wall-attached library objects follow their wall the same way.
      if (wallsTouched) {
        const objectPatches = buildObjectSyncPatches(getShapes());
        if (objectPatches.length > 0) {
          setShapes(applyPatches(getShapes(), objectPatches));
          all = [...all, ...objectPatches];
        }
      }
    } finally {
      reconciling = false;
    }
  }

  if (state.pending) {
    state.pending.patches.push(...all);
  } else {
    pushEntry({ label, patches: all });
  }
  useEditorUiStore.getState().markDirty();
  return patches;
}

function pushEntry(entry: HistoryEntry) {
  state.undoStack.push(entry);
  if (state.undoStack.length > HISTORY_LIMIT) state.undoStack.shift();
  state.redoStack = [];
  syncUiFlags();
}

/**
 * Group several commits into one undo step. Nested transactions join the
 * outermost one. If `fn` throws, everything applied inside is rolled back.
 */
export function transaction<T>(label: string, fn: () => T): T {
  if (state.pending) return fn(); // already inside — join it
  state.pending = { label, patches: [] };
  try {
    const result = fn();
    const { patches } = state.pending;
    state.pending = null;
    if (patches.length > 0) pushEntry({ label, patches });
    return result;
  } catch (err) {
    const { patches } = state.pending;
    state.pending = null;
    if (patches.length > 0) setShapes(applyPatches(getShapes(), invertPatches(patches)));
    throw err;
  }
}

/**
 * Pointer-gesture variant of transaction(): open at drag start, flush at
 * drag end. Commits in between accumulate into one undo entry.
 */
export function beginGesture(label: string): void {
  if (state.pending) return; // nested — outer gesture/transaction wins
  state.pending = { label, patches: [] };
}

export function endGesture(): void {
  if (!state.pending) return;
  const { label, patches } = state.pending;
  state.pending = null;
  if (patches.length > 0) pushEntry({ label, patches });
}

export function undo(): HistoryEntry | null {
  const entry = state.undoStack.pop();
  if (!entry) return null;
  setShapes(applyPatches(getShapes(), invertPatches(entry.patches)));
  state.redoStack.push(entry);
  useFloorMapStore.getState().clearSelection();
  useEditorUiStore.getState().markDirty();
  syncUiFlags();
  return entry;
}

export function redo(): HistoryEntry | null {
  const entry = state.redoStack.pop();
  if (!entry) return null;
  setShapes(applyPatches(getShapes(), entry.patches));
  state.undoStack.push(entry);
  useFloorMapStore.getState().clearSelection();
  useEditorUiStore.getState().markDirty();
  syncUiFlags();
  return entry;
}

export function canUndo(): boolean {
  return state.undoStack.length > 0;
}

export function canRedo(): boolean {
  return state.redoStack.length > 0;
}

/** Reset history — called when a different plan's shapes are loaded. */
export function resetHistory() {
  state.undoStack = [];
  state.redoStack = [];
  state.pending = null;
  syncUiFlags();
}

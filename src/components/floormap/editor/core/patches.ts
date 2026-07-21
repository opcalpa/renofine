/**
 * Patch-based mutations for the floor map editor.
 *
 * Every command produces a list of patches. A patch is small (only the touched
 * shape / fields), reversible, and JSON-serializable — this replaces the old
 * whole-array-deep-clone history and doubles as the audit trail for
 * programmatic (Renaida) edits.
 */

import { FloorMapShape } from '../../types';

export type Patch =
  | { op: 'add'; shape: FloorMapShape }
  | { op: 'remove'; shape: FloorMapShape }
  | {
      op: 'update';
      id: string;
      before: Partial<FloorMapShape>;
      after: Partial<FloorMapShape>;
    };

/** Apply patches to a shapes array, returning a new array (structural sharing). */
export function applyPatches(shapes: FloorMapShape[], patches: Patch[]): FloorMapShape[] {
  let next = shapes;
  for (const patch of patches) {
    switch (patch.op) {
      case 'add':
        next = [...next, patch.shape];
        break;
      case 'remove':
        next = next.filter((s) => s.id !== patch.shape.id);
        break;
      case 'update':
        next = next.map((s) => (s.id === patch.id ? { ...s, ...patch.after } : s));
        break;
    }
  }
  return next;
}

/** Invert patches for undo. Order is reversed so sequences undo correctly. */
export function invertPatches(patches: Patch[]): Patch[] {
  return patches
    .slice()
    .reverse()
    .map((patch): Patch => {
      switch (patch.op) {
        case 'add':
          return { op: 'remove', shape: patch.shape };
        case 'remove':
          return { op: 'add', shape: patch.shape };
        case 'update':
          return { op: 'update', id: patch.id, before: patch.after, after: patch.before };
      }
    });
}

/**
 * Build an update patch capturing only the fields being changed.
 * `before` records the current value of each touched key (including
 * `undefined` for keys the shape did not have) so undo restores exactly.
 */
export function makeUpdatePatch(shape: FloorMapShape, updates: Partial<FloorMapShape>): Patch {
  const before: Partial<FloorMapShape> = {};
  for (const key of Object.keys(updates) as (keyof FloorMapShape)[]) {
    (before as Record<string, unknown>)[key] = shape[key];
  }
  return { op: 'update', id: shape.id, before, after: updates };
}

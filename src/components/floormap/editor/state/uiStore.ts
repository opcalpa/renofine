/**
 * Ephemeral editor UI state — never persisted, never in undo history.
 *
 * Holds in-progress interaction state (draft polylines, snap indicators,
 * marquee box, dimension input) so pointer-move previews never touch the
 * shapes array or trigger history.
 */

import { create } from 'zustand';

export interface Point {
  x: number;
  y: number;
}

export interface SnapGlyph {
  kind: 'endpoint' | 'midpoint' | 'grid' | 'ortho' | 'alignment';
  at: Point; // world coords
}

export interface SnapGuideLine {
  from: Point;
  to: Point;
  distanceLabel?: string;
}

interface EditorUiState {
  /** Wall polyline being drawn (committed vertices, world coords). */
  draftPoints: Point[];
  /** Current rubber-band endpoint (world coords). */
  draftCursor: Point | null;
  /** Live label for the segment being drawn, e.g. "2 400 mm". */
  draftLabel: string | null;
  /** Digits typed while drawing (type-to-dimension). */
  dimensionInput: string;

  snapGlyphs: SnapGlyph[];
  snapGuides: SnapGuideLine[];

  marquee: { start: Point; end: Point } | null;

  canUndo: boolean;
  canRedo: boolean;
  /** Bumped on every committed change — used by autosave. */
  dirtyCounter: number;

  setDraft: (points: Point[], cursor: Point | null, label: string | null) => void;
  clearDraft: () => void;
  setDimensionInput: (v: string) => void;
  setSnapFeedback: (glyphs: SnapGlyph[], guides: SnapGuideLine[]) => void;
  setMarquee: (m: { start: Point; end: Point } | null) => void;
  setHistoryFlags: (canUndo: boolean, canRedo: boolean) => void;
  markDirty: () => void;
}

export const useEditorUiStore = create<EditorUiState>((set) => ({
  draftPoints: [],
  draftCursor: null,
  draftLabel: null,
  dimensionInput: '',
  snapGlyphs: [],
  snapGuides: [],
  marquee: null,
  canUndo: false,
  canRedo: false,
  dirtyCounter: 0,

  setDraft: (points, cursor, label) =>
    set({ draftPoints: points, draftCursor: cursor, draftLabel: label }),
  clearDraft: () =>
    set({ draftPoints: [], draftCursor: null, draftLabel: null, dimensionInput: '' }),
  setDimensionInput: (v) => set({ dimensionInput: v }),
  setSnapFeedback: (glyphs, guides) => set({ snapGlyphs: glyphs, snapGuides: guides }),
  setMarquee: (m) => set({ marquee: m }),
  setHistoryFlags: (canUndo, canRedo) => set({ canUndo, canRedo }),
  markDirty: () => set((s) => ({ dirtyCounter: s.dirtyCounter + 1 })),
}));

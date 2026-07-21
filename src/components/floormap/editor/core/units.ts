/**
 * Unit conversion boundary for the v2 editor.
 *
 * Persisted shape coordinates are in "world units" (canvas px at zoom 1),
 * where 1 world unit = 1 / pixelsPerMm millimeters. This matches what the
 * legacy editor writes, so both editors can coexist against the same rows.
 * All editor logic that reasons about real-world sizes goes through these
 * helpers; full mm-canonicalization happens when the legacy editor is
 * deleted (one migration, one flip of these functions).
 */

import { useFloorMapStore } from '../../store';

export function worldPerMm(): number {
  return useFloorMapStore.getState().scaleSettings.pixelsPerMm || 0.1;
}

export function mmToWorld(mm: number): number {
  return mm * worldPerMm();
}

export function worldToMm(world: number): number {
  return world / worldPerMm();
}

/** Format a world-unit distance as a rounded mm label, e.g. "2 400 mm". */
export function formatWorldAsMm(world: number): string {
  const mm = Math.round(worldToMm(world));
  return `${mm.toLocaleString('sv-SE')} mm`;
}

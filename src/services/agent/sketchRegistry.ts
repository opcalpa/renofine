/**
 * In-memory registry for analyzed floor plans awaiting confirmation.
 *
 * A create_plan_sketch proposal carries only a key: the geometry (walls, rooms,
 * doors) is a large object that has no business inside a serializable action.
 * Same shape as documentCapture's attachment registry — registered when the
 * proposal is built, taken when it is applied.
 */

import type { AIConversionResult } from '@/services/aiVisionService';

const sketchRegistry = new Map<string, AIConversionResult>();

export function registerSketch(key: string, result: AIConversionResult): void {
  sketchRegistry.set(key, result);
}

/** Single-shot: taking a sketch removes it. */
export function takeSketch(key: string | undefined): AIConversionResult | undefined {
  if (!key) return undefined;
  const result = sketchRegistry.get(key);
  sketchRegistry.delete(key);
  return result;
}

export function clearSketches(): void {
  sketchRegistry.clear();
}

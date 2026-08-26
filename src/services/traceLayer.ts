/**
 * Trace a background layer that is already on the canvas.
 *
 * The existing AI import asks you to upload a picture, draw a calibration line
 * on it, and then drops a whole floor plan into a BRAND NEW plan, saved to the
 * database before you have seen it. Two things are wrong with that for a hand
 * sketch: the scale is guessed again from scratch, and undoing means deleting a
 * plan.
 *
 * This path assumes the drawing is already a layer (see UnderlayPicker) and,
 * crucially, that its scale has already been set (see CalibrateTool). Then the
 * pixel→millimetre ratio is not a guess at all — it falls straight out of the
 * layer's own geometry. A traced wall can be compared against a real measurement
 * instead of merely looking plausible.
 *
 * The result comes back SPLIT INTO STAGES so the caller can apply one kind of
 * thing at a time and ask before continuing. A hand sketch is the low-confidence
 * case; it must never arrive as one sweep you then have to clean up after.
 */

import { getFileUrl } from '@/lib/fileUrl';
import { analyzeFloorPlan, floorPlanResultToShapes } from '@/services/aiVisionService';
import { worldToMm } from '@/components/floormap/editor/core/units';
import { effectiveImageSize } from '@/components/floormap/editor/render/imageSize';
import type { FloorMapShape, ImageCoordinates } from '@/components/floormap/types';

export type TraceStageId = 'rooms' | 'walls' | 'details';

export interface TraceStage {
  id: TraceStageId;
  shapes: FloorMapShape[];
}

export interface TraceResult {
  stages: TraceStage[];
  /** True when the layer still carries the assumed span rather than a real one. */
  scaleWasGuessed: boolean;
}

/** Below this the layer has clearly never been calibrated — see CalibrateTool. */
const ASSUMED_SPAN_MM = 10000;
const GUESS_TOLERANCE_MM = 1;

async function layerAsFile(shape: FloorMapShape): Promise<File | null> {
  if (!shape.imageUrl) return null;
  const signed = await getFileUrl(shape.imageUrl);
  if (!signed) return null;
  const blob = await (await fetch(signed)).blob();
  const name = shape.name || 'ritning.png';
  return new File([blob], name, { type: blob.type || 'image/png' });
}

/**
 * Read the drawing behind a layer and return geometry placed ON that layer.
 *
 * Returns null when the layer cannot be read at all — the caller says so rather
 * than silently producing an empty plan.
 */
export async function analyzeLayer(shape: FloorMapShape): Promise<TraceResult | null> {
  const file = await layerAsFile(shape);
  if (!file) return null;

  let naturalWidth = 0;
  let naturalHeight = 0;
  try {
    const bmp = await createImageBitmap(file);
    naturalWidth = bmp.width;
    naturalHeight = bmp.height;
    bmp.close?.();
  } catch {
    return null;
  }
  if (!naturalWidth || !naturalHeight) return null;

  const c = shape.coordinates as ImageCoordinates;
  const size = effectiveImageSize(c, { width: naturalWidth, height: naturalHeight });
  if (!size.width) return null;

  // THE POINT OF CALIBRATING FIRST: the layer's on-canvas width already says how
  // many millimetres the drawing spans, so the ratio is measured, not assumed.
  const layerSpanMM = worldToMm(size.width);
  const ratio = layerSpanMM / naturalWidth;

  const result = await analyzeFloorPlan(file, ratio, naturalWidth, naturalHeight);

  // The model works in the picture's own frame; put the geometry where the
  // layer actually sits.
  const shapes = floorPlanResultToShapes(result, shape.planId ?? '', { x: c.x, y: c.y });

  const rooms = shapes.filter((s) => s.type === 'room');
  const walls = shapes.filter((s) => s.type === 'wall');
  const details = shapes.filter((s) => s.type !== 'room' && s.type !== 'wall');

  return {
    stages: [
      { id: 'rooms', shapes: rooms },
      { id: 'walls', shapes: walls },
      { id: 'details', shapes: details },
    ],
    // A layer straight out of the import still spans the assumed 10 m; saying so
    // is more useful than quietly tracing at the wrong scale.
    scaleWasGuessed: Math.abs(layerSpanMM - ASSUMED_SPAN_MM) < GUESS_TOLERANCE_MM,
  };
}

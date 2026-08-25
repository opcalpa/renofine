/**
 * The size a background image ACTUALLY occupies on the canvas.
 *
 * Uploads used to create the shape with width/height 0 and let the renderer
 * substitute the natural size (capped on the long edge) at draw time. That
 * fallback is fine for drawing, but anything that REASONS about the layer —
 * scale calibration above all — has to see the same number the eye sees.
 * Scaling a stored 0 gives 0, and the layer vanishes.
 *
 * So the fallback lives here, and both the renderer and the calibration path
 * read it from the same place.
 */

import type { ImageCoordinates } from '../../types';

/** Long-edge cap applied to a natural-size fallback. Matches uploadPlanImage. */
export const IMAGE_NATURAL_CAP = 800;

/** A stored dimension below this is treated as "never materialized". */
const USABLE_MIN = 10;

export interface NaturalSize {
  width: number;
  height: number;
}

export function effectiveImageSize(
  coordinates: Pick<ImageCoordinates, 'width' | 'height'>,
  natural: NaturalSize | null | undefined,
): NaturalSize {
  const { width, height } = coordinates;
  const stored = width >= USABLE_MIN && height >= USABLE_MIN;
  if (stored) return { width, height };

  if (!natural || !natural.width || !natural.height) {
    return { width: width || 0, height: height || 0 };
  }

  const scale = Math.min(1, IMAGE_NATURAL_CAP / Math.max(natural.width, natural.height));
  return { width: natural.width * scale, height: natural.height * scale };
}

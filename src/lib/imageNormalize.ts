import { heicToJpeg, isHeicFile } from "./heic";

/**
 * Prepare a photographed document for the reading model.
 *
 * WHY (Carl 2026-09-03, measured on his own 112-receipt pile):
 *
 *  1. `captureDocument` posted the RAW file bytes. Claude never receives image
 *     metadata — the docs say so outright — so a receipt lying sideways on a
 *     table was read sideways. On IMG_4047 (Hornbach, 496,80 kr) the reader
 *     answered "ICA, 841,85 kr, moms 168,37, 2025-01-20" at confidence 0.72,
 *     and a different wrong answer on the next run. Turned upright it returned
 *     Hornbach / 496,80 / 99,36 / 2026-01-16 with all six line items.
 *     A confident wrong number walks straight through review; that is what
 *     makes this worse than a failure.
 *
 *  2. EXIF cannot fix it. That same file's orientation tag said 180° while the
 *     paper needed 270°. The tag records how the CAMERA was held, not how the
 *     paper lay. Only looking at the text answers it — which is why the
 *     rotation comes back from the model (`image_rotation`) and is applied here.
 *
 *  3. Full resolution bought nothing. The reader runs on Claude Haiku 4.5,
 *     standard vision tier: anything over 1568 px on the long edge is
 *     downscaled server-side before the model sees it. Sending 4032 px iPhone
 *     originals meant 6.5× the pixels, 300 MB instead of 40 MB over the wire
 *     for one pile, and identical input to the model.
 *
 * Drawing through a canvas also applies the EXIF orientation (Chrome does this
 * by default) and re-encodes without it, so what leaves here is upright pixels
 * with no metadata left to be ignored.
 */

/**
 * Long-edge cap for the reading model. Claude Haiku 4.5 is standard-tier
 * vision: 1568 px / 1568 visual tokens. Raising this only helps if the reader
 * moves to a 4.7-or-later model (high-res tier, 2576 px).
 */
export const READER_MAX_DIM = 1568;

/** Degrees CLOCKWISE the image must turn for its text to sit upright. */
export type ImageRotation = 0 | 90 | 180 | 270;

export function isImageRotation(v: unknown): v is ImageRotation {
  return v === 0 || v === 90 || v === 180 || v === 270;
}

/**
 * Rotate and downscale one image for reading. Returns the ORIGINAL on any
 * failure — a receipt that cannot be normalised must still travel down the
 * pipeline, because losing the document is worse than reading it badly.
 */
export async function normalizeForReading(
  file: File,
  rotation: ImageRotation = 0,
  opts?: { maxDim?: number; quality?: number },
): Promise<File> {
  const maxDim = opts?.maxDim ?? READER_MAX_DIM;
  // 0.9, not the 0.82 the upload compressor uses: this image is read, not
  // looked at, and Anthropic's own guidance is that heavy JPEG artefacts are
  // what make small print unreadable.
  const quality = opts?.quality ?? 0.9;

  try {
    let input: File = file;
    if (isHeicFile(file)) {
      const jpg = await heicToJpeg(file);
      if (jpg === file) return file; // conversion failed — caller keeps the original
      input = jpg;
    }
    if (!(input.type || "").startsWith("image/")) return file;

    const img = new Image();
    const url = URL.createObjectURL(input);
    try {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("decode failed"));
        img.src = url;
      });

      // naturalWidth/Height are already EXIF-corrected by the browser.
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (!w || !h) return file;
      if (w > maxDim || h > maxDim) {
        const ratio = Math.min(maxDim / w, maxDim / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }

      const quarterTurn = rotation === 90 || rotation === 270;
      const canvas = document.createElement("canvas");
      canvas.width = quarterTurn ? h : w;
      canvas.height = quarterTurn ? w : h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;

      // Each branch maps the source's top-left corner to where a clockwise
      // turn of that many degrees would put it.
      if (rotation === 90) {
        ctx.translate(canvas.width, 0);
        ctx.rotate(Math.PI / 2);
      } else if (rotation === 180) {
        ctx.translate(canvas.width, canvas.height);
        ctx.rotate(Math.PI);
      } else if (rotation === 270) {
        ctx.translate(0, canvas.height);
        ctx.rotate(-Math.PI / 2);
      }
      ctx.drawImage(img, 0, 0, w, h);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
      );
      if (!blob) return file;

      return new File([blob], input.name.replace(/\.(heic|heif|png|webp)$/i, ".jpg"), {
        type: "image/jpeg",
        lastModified: file.lastModified,
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (e) {
    console.error("imageNormalize: failed for", file.name, e);
    return file;
  }
}

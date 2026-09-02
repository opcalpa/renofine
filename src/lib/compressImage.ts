import { heicToJpeg, isHeicFile } from "./heic";

/**
 * Compress an image file for upload.
 *
 * - Resizes to fit within maxDimension (default 1600px)
 * - Converts to JPEG at given quality (default 0.82)
 * - Only compresses if file is an image and exceeds minSize (default 200KB)
 * - Converts HEIC/HEIF to JPEG first (nothing else in the browser can read it)
 * - Returns original file unchanged for non-images or small files
 * - Never throws — returns original file on any error
 */
export async function compressImage(
  file: File | Blob,
  options?: {
    maxDimension?: number;
    quality?: number;
    minSize?: number;
  },
): Promise<File | Blob> {
  const maxDim = options?.maxDimension ?? 1600;
  const quality = options?.quality ?? 0.82;
  const minSize = options?.minSize ?? 50_000;

  // iPhone photos before anything else. Two traps, either one fatal:
  // a `.heic` from Finder usually has an EMPTY type, so the image guard below
  // would return it untouched; and `new Image()` cannot decode HEIC outside
  // WebKit, so the canvas path would throw into the catch and return the
  // original anyway. Both look like success and produce a file nothing
  // downstream can read (Carl 2026-09-02).
  //
  // The folder drop converts up front so one file keeps one identity end to
  // end; this is the safety net for every OTHER upload path.
  let input: File | Blob = file;
  if (isHeicFile(file)) {
    if (!(file instanceof File)) return file; // no name, no safe rename
    const jpg = await heicToJpeg(file);
    if (jpg === file) return file; // conversion failed — caller keeps the original
    input = jpg;
  }
  file = input;

  // Skip non-images
  const type = file instanceof File ? file.type : (file as Blob).type;
  if (!type?.startsWith("image/")) return file;

  // Skip small files
  if (file.size <= minSize) return file;

  // Skip SVGs (vector, no point compressing)
  if (type === "image/svg+xml") return file;

  try {
    const img = new Image();
    const url = URL.createObjectURL(file);

    try {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = url;
      });

      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
      );

      if (!blob) return file;
      return blob;
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    // On any error, return original file unmodified
    return file;
  }
}

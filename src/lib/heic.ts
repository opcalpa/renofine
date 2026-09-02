/**
 * HEIC → JPEG, in the browser.
 *
 * WHY (Carl 2026-09-02): an iPhone folder dropped on desktop lost every receipt
 * SILENTLY. Three separate things conspired, and each one alone was enough:
 *
 *  1. A `.heic` dragged from Finder often arrives with an EMPTY `file.type` in
 *     Chrome, so `compressImage`'s `type.startsWith("image/")` guard returned
 *     the file untouched before anything could look at it.
 *  2. Even with the right type, `new Image()` cannot decode HEIC outside
 *     WebKit — `onerror` fires, the catch returns the original, and nothing
 *     says so. (Safari CAN decode it, which is why the bug looked random.)
 *  3. `extractText` then posted the raw HEIC bytes labelled `image/jpeg`. The
 *     vision model got something it could not read, returned nothing, and the
 *     file was filed as "understood nothing".
 *
 * The result was the worst failure shape there is: the person believes their
 * receipts are in, and no number anywhere is wrong — they are simply absent.
 *
 * The decoder (`heic2any`, libheif compiled to wasm) is ~1 MB, so it is
 * imported DYNAMICALLY: a folder without HEIC never pays for it.
 *
 * The camera path (QuickReceiptCaptureModal) has carried its own copy of this
 * conversion since long before the folder drop existed. This module is the one
 * both should use; migrating that caller is a follow-up, not a reason to leave
 * the drop broken.
 */

/** HEIC is recognised by extension FIRST — the MIME type is often absent. */
export function isHeicFile(file: File | Blob): boolean {
  const type = (file.type || "").toLowerCase();
  if (type === "image/heic" || type === "image/heif") return true;
  const name = file instanceof File ? file.name.toLowerCase() : "";
  return name.endsWith(".heic") || name.endsWith(".heif");
}

/**
 * Convert one HEIC file to JPEG. Returns the ORIGINAL on any failure.
 *
 * Never throws: a receipt that cannot be converted must still travel down the
 * pipeline and be archived, so the person keeps the file even when the reading
 * of it fails. Failing loudly here would lose the document too.
 */
export async function heicToJpeg(file: File): Promise<File> {
  try {
    const { default: heic2any } = await import("heic2any");
    const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
    const blob = Array.isArray(out) ? out[0] : out;
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.(heic|heif)$/i, ".jpg"), {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } catch (e) {
    console.error("heic: conversion failed for", file.name, e);
    return file;
  }
}

/**
 * Convert every HEIC in a drop, leaving everything else untouched.
 *
 * Sequential on purpose: the decoder is wasm on the main thread, and running
 * fifty in parallel locks the tab. `onProgress` exists because a hundred
 * conversions is a visible wait that must not look like a freeze.
 *
 * Returns the list in its original ORDER, with converted files swapped in, plus
 * how many were converted so the caller can say it out loud.
 */
export async function convertHeicFiles(
  files: File[],
  onProgress?: (done: number, total: number, fileName: string) => void,
): Promise<{ files: File[]; converted: number; failed: number }> {
  const targets = files.filter(isHeicFile);
  if (targets.length === 0) return { files, converted: 0, failed: 0 };

  const swapped = new Map<File, File>();
  let done = 0;
  let failed = 0;
  for (const f of targets) {
    const jpg = await heicToJpeg(f);
    if (jpg === f) failed += 1;
    else swapped.set(f, jpg);
    done += 1;
    onProgress?.(done, targets.length, f.name);
  }
  return {
    files: files.map((f) => swapped.get(f) ?? f),
    converted: swapped.size,
    failed,
  };
}

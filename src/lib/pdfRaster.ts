/**
 * Rasterize the first page of a PDF to an image File.
 *
 * A floor plan is a floor plan whether it arrives as a photo or as a PDF, but
 * the vision pipeline only takes images. This renders page 1 to a canvas and
 * hands back a PNG so a drawing PDF can go through the exact same
 * process-floorplan path a photographed drawing does.
 *
 * pdfjs is loaded as a lazy chunk (shared promise), and teardown goes through
 * the LOADING TASK — in pdfjs v6 the resolved document proxy has no destroy().
 */

type PdfjsModule = typeof import('pdfjs-dist');

let pdfjsPromise: Promise<PdfjsModule> | null = null;
async function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import('pdfjs-dist');
      const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

export interface PdfRasterResult {
  /** Page 1 as a PNG file, named after the source. */
  file: File;
  /** Total pages in the document — callers say out loud when they read only one. */
  pageCount: number;
}

/**
 * Render page 1 at roughly `targetWidth` CSS pixels. Returns null when the file
 * isn't a readable PDF — callers treat rasterization as best-effort.
 */
export async function rasterizePdfFirstPage(
  file: File,
  targetWidth = 1600
): Promise<PdfRasterResult | null> {
  let task: ReturnType<PdfjsModule['getDocument']> | null = null;
  try {
    const pdfjs = await loadPdfjs();
    const data = new Uint8Array(await file.arrayBuffer());
    task = pdfjs.getDocument({ data });
    const doc = await task.promise;
    const pageCount = doc.numPages;

    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.max(0.1, Math.min(4, targetWidth / base.width));
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    // Drawings are line art on white — a transparent ground would read as black.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvas, canvasContext: ctx, viewport }).promise;

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png')
    );
    if (!blob) return null;

    const baseName = file.name.replace(/\.pdf$/i, '');
    return {
      file: new File([blob], `${baseName}.png`, { type: 'image/png' }),
      pageCount,
    };
  } catch (e) {
    console.error('rasterizePdfFirstPage failed', e);
    return null;
  } finally {
    // v6: destroy() is on the loading task, not the document proxy.
    void task?.destroy();
  }
}

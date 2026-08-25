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

/**
 * Read a PDF's embedded text locally, without a model call.
 *
 * Quotes and invoices out of any business system carry real text — sending
 * them to a vision model to be told what they say is paying for something the
 * file already contains. Only scanned paper genuinely needs the model, and it
 * gives itself away by returning (almost) nothing here.
 *
 * Returns '' when there is no usable text layer, so the caller falls back.
 */
export async function extractPdfTextLocally(file: File, maxChars = 20000): Promise<string> {
  try {
    const pdfjs = await loadPdfjs();
    const buffer = await file.arrayBuffer();
    const task = pdfjs.getDocument({ data: buffer });
    try {
      const doc = await task.promise;
      const parts: string[] = [];
      let chars = 0;
      // The classifier reads the opening anyway; a 200-page appendix is cost
      // without signal.
      const pages = Math.min(doc.numPages, 10);
      for (let i = 1; i <= pages && chars < maxChars; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const text = content.items
          .map((item) => (typeof item === 'object' && item && 'str' in item ? String(item.str) : ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (text) {
          parts.push(text);
          chars += text.length;
        }
      }
      const joined = parts.join('\n').slice(0, maxChars);
      // A handful of characters means a scan with a stray label on it, not a
      // text layer — let the model have it.
      return joined.length >= 120 ? joined : '';
    } finally {
      await task.destroy().catch(() => {});
    }
  } catch {
    return '';
  }
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

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import type {
  PDFDocumentProxy,
  PDFDocumentLoadingTask,
  RenderTask,
} from "pdfjs-dist";

/**
 * PDF preview rendered to canvas via pdfjs (lazy-loaded chunk). Replaces the
 * iframe approach whose `view=FitH` hint mobile browsers ignore — a landscape
 * floor plan on a portrait phone opened zoomed into a corner. Here 100 % zoom
 * = the WHOLE page fitted to the container; zoom scales up from that fit.
 */

type PdfjsModule = typeof import("pdfjs-dist");

let pdfjsPromise: Promise<PdfjsModule> | null = null;
async function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import("pdfjs-dist");
      const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

interface PdfCanvasPreviewProps {
  url: string;
  /** Zoom percent where 100 = whole page fitted to the container. */
  zoom: number;
  fileName?: string;
}

export function PdfCanvasPreview({ url, zoom, fileName }: PdfCanvasPreviewProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  // The loading task owns teardown in pdfjs v6 — the resolved document proxy
  // has no destroy(), only cleanup(). Destroying the task aborts the request
  // AND tears down the document + worker port.
  const taskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [containerKey, setContainerKey] = useState("");

  // Re-fit when the container resizes (mobile rotation, window resize).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setContainerKey(`${Math.round(e.contentRect.width)}x${Math.round(e.contentRect.height)}`);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Load the document (and reset to page 1) whenever the url changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setPage(1);
    setNumPages(0);
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const task = pdfjs.getDocument({ url });
        taskRef.current = task;
        const doc = await task.promise;
        if (cancelled) { void task.destroy(); return; }
        docRef.current = doc;
        setNumPages(doc.numPages);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
      // destroy() lives on the loading task, not the document proxy.
      void taskRef.current?.destroy();
      taskRef.current = null;
      docRef.current = null;
    };
  }, [url]);

  // Render the current page at fit-scale × zoom whenever inputs change.
  useEffect(() => {
    if (!numPages) return;
    let cancelled = false;
    (async () => {
      const doc = docRef.current;
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!doc || !canvas || !container) return;
      try {
        const pdfPage = await doc.getPage(page);
        if (cancelled) return;
        const base = pdfPage.getViewport({ scale: 1 });
        // Fit the WHOLE page inside the container at zoom 100.
        const pad = 16;
        const fit = Math.min(
          (container.clientWidth - pad) / base.width,
          (container.clientHeight - pad) / base.height,
        );
        const scale = Math.max(0.05, fit * (zoom / 100));
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = pdfPage.getViewport({ scale: scale * dpr });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width / dpr}px`;
        canvas.style.height = `${viewport.height / dpr}px`;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        renderTaskRef.current?.cancel();
        const task = pdfPage.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        await task.promise.catch(() => { /* cancelled render is fine */ });
        if (!cancelled) setLoading(false);
      } catch {
        if (!cancelled) { setError(true); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [numPages, page, zoom, containerKey]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        {t("files.pdfPreviewFailed", "Kunde inte visa PDF:en — ladda ner den istället.")}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-auto">
      <div className="flex items-center justify-center min-h-full min-w-full">
        {loading && (
          <Loader2 className="absolute h-6 w-6 animate-spin text-muted-foreground" aria-label={fileName} />
        )}
        <canvas ref={canvasRef} className="shadow-md rounded bg-white" />
      </div>

      {numPages > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-background/90 backdrop-blur border rounded-full px-2 py-1 shadow">
          <button
            type="button"
            className="p-1 disabled:opacity-30"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            aria-label={t("files.previousPage", "Föregående sida")}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-xs font-medium tabular-nums px-1">
            {t("files.pageOf", { defaultValue: "Sida {{page}}/{{total}}", page, total: numPages })}
          </span>
          <button
            type="button"
            className="p-1 disabled:opacity-30"
            onClick={() => setPage((p) => Math.min(numPages, p + 1))}
            disabled={page >= numPages}
            aria-label={t("files.nextPage", "Nästa sida")}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

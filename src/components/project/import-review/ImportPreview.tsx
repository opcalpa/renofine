import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Crop, Expand, FileText, MessageSquare, RotateCw, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useFileUrl } from '@/lib/fileUrl';
import type { ImportFileRow } from '@/services/agent/importSession';

/**
 * The original document, so the interpretation can be checked against it.
 *
 * Carl: "vore snyggt om man kunde få upp en liten eller större preview av
 * vardera dokument innan man godkänner, så användarna kan syna filtolkningen."
 * Without it, accepting an import is trusting a summary of a file you never
 * saw.
 */

function isImage(name: string, mime?: string): boolean {
  if (mime?.startsWith('image/')) return true;
  return /\.(jpe?g|png|gif|webp|heic|avif)$/i.test(name);
}

const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3];

/**
 * The image with rotate/zoom controls.
 *
 * A receipt is photographed however the table allowed — sideways is the normal
 * case, not the exception — and checking "14 995,00" against a sideways photo
 * is guesswork. Rotation is view-only (a quarter turn clockwise per press);
 * nothing is written back to the file.
 *
 * Crop draws a box over the image and shows only what it contains — a working
 * magnifier for the A4 with several receipts stapled to it, where the number
 * you need sits in one corner of the photo. It never rewrites the stored file:
 * the original stays the record, which is what a tax deduction needs.
 */
function ImageViewer({
  src,
  alt,
  comment,
  onComment,
  rotation,
  onRotation,
}: {
  src: string;
  alt: string;
  comment?: string;
  onComment?: (text: string) => void;
  /** Remembered per document by the page, so a turn survives leaving the row. */
  rotation: number | undefined;
  onRotation: (deg: number) => void;
}) {
  const { t } = useTranslation();
  const [fullscreen, setFullscreen] = useState(false);
  const [cropping, setCropping] = useState(false);
  const [crop, setCrop] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const cropDraft = useRef<{ x: number; y: number } | null>(null);
  const [commentOpen, setCommentOpen] = useState(false);
  const [zoomIdx, setZoomIdx] = useState(2); // 1x
  // Pan offset in screen pixels. A scaled image outgrows its layout box via
  // transform, which overflow-scroll cannot follow — so panning is part of the
  // same transform: drag to reach a corner of a zoomed receipt.
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

  // Zoom and crop are per-visit; the ROTATION is not — the page holds it per
  // document, so a receipt you turned upright stays upright when you come back
  // to it (Carl, 2026-09-02).
  useEffect(() => {
    setZoomIdx(2);
    setPan({ x: 0, y: 0 });
    setCrop(null);
    setCropping(false);
    setCommentOpen(false);
  }, [src]);

  /**
   * Stand a landscape photo up by default.
   *
   * WHAT THIS CANNOT KNOW (Carl, 2026-09-02): the photo itself is correctly
   * oriented — it is the RECEIPT INSIDE it that lies sideways on the table.
   * EXIF says nothing about that, and the aspect ratio cannot tell a quarter
   * turn clockwise from a quarter turn anti-clockwise. It is a coin flip, and
   * the first version called it wrong for all 56 of Carl's receipts (they came
   * out upside down).
   *
   * So: anti-clockwise, because that is what his real batch needed, and a
   * heuristic with evidence beats one without. One click corrects an outlier
   * and the turn is remembered.
   *
   * The durable fix is to stop guessing — the classifier already looks at the
   * image, so it can report which way the text runs. Backlog:
   * `tolken-rapporterar-bildens-orientering`.
   */
  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    if (rotation !== undefined) return;
    const img = e.currentTarget;
    onRotation(img.naturalWidth > img.naturalHeight ? 270 : 0);
  };

  const turn = rotation ?? 0;

  const zoom = ZOOM_STEPS[zoomIdx];
  const quarter = turn % 180 !== 0;
  const pannable = zoomIdx > 2;

  // Zooming back out re-centers: a pan that made sense at 3x strands the
  // image half off-screen at 1x.
  useEffect(() => {
    if (!pannable) setPan({ x: 0, y: 0 });
  }, [pannable]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!pannable) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setPan({ x: d.panX + (e.clientX - d.startX), y: d.panY + (e.clientY - d.startY) });
  };
  const endDrag = () => {
    dragRef.current = null;
  };

  /** Drag a box over the image; the frame then shows only what it contains. */
  const cropStart = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    cropDraft.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setCrop({ x: cropDraft.current.x, y: cropDraft.current.y, w: 0, h: 0 });
  };
  const cropMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = cropDraft.current;
    if (!start) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setCrop({
      x: Math.min(start.x, x),
      y: Math.min(start.y, y),
      w: Math.abs(x - start.x),
      h: Math.abs(y - start.y),
    });
  };
  const cropEnd = () => {
    cropDraft.current = null;
    // A stray click is not a crop — anything smaller than a fingertip is noise.
    setCrop((c) => (c && c.w > 24 && c.h > 24 ? c : null));
    setCropping(false);
  };

  return (
    <div className="relative rounded-lg border bg-muted/20">
      <div className="absolute right-2 top-2 z-10 flex gap-1 rounded-md border bg-background/90 p-1 shadow-sm backdrop-blur">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onRotation((turn + 90) % 360)}
          title={t('importReview.preview.rotate', 'Vrid ett kvarts varv')}
        >
          <RotateCw className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={zoomIdx >= ZOOM_STEPS.length - 1}
          onClick={() => setZoomIdx((i) => Math.min(i + 1, ZOOM_STEPS.length - 1))}
          title={t('importReview.preview.zoomIn', 'Zooma in')}
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={zoomIdx <= 0}
          onClick={() => setZoomIdx((i) => Math.max(i - 1, 0))}
          title={t('importReview.preview.zoomOut', 'Zooma ut')}
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="self-center px-1 font-mono text-[11px] tabular-nums text-muted-foreground">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          variant="ghost"
          size="icon"
          className={`h-7 w-7 ${cropping || crop ? 'bg-muted' : ''}`}
          onClick={() => {
            if (crop) setCrop(null);
            else setCropping((c) => !c);
          }}
          title={
            crop
              ? t('importReview.preview.cropClear', 'Visa hela bilden igen')
              : t('importReview.preview.crop', 'Beskär — dra en ruta över det du vill se')
          }
        >
          <Crop className="h-4 w-4" />
        </Button>
        {onComment && (
          <Button
            variant="ghost"
            size="icon"
            className={`h-7 w-7 ${comment ? 'text-primary' : ''}`}
            onClick={() => setCommentOpen((c) => !c)}
            title={t('importReview.preview.comment', 'Kommentera')}
          >
            <MessageSquare className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setFullscreen(true)}
          title={t('importReview.preview.fullscreen', 'Helskärm')}
        >
          <Expand className="h-4 w-4" />
        </Button>
      </div>
      <div
        className={`relative flex max-h-[60vh] min-h-[240px] items-center justify-center overflow-hidden p-2 ${
          cropping ? 'cursor-crosshair' : pannable ? (dragRef.current ? 'cursor-grabbing' : 'cursor-grab') : ''
        }`}
        onPointerDown={cropping ? cropStart : onPointerDown}
        onPointerMove={cropping ? cropMove : onPointerMove}
        onPointerUp={cropping ? cropEnd : endDrag}
        onPointerLeave={cropping ? cropEnd : endDrag}
        onPointerCancel={cropping ? cropEnd : endDrag}
        style={
          // A finished crop turns the frame into a window onto that region:
          // the image keeps its transform, the box decides what shows.
          crop && !cropping
            ? { clipPath: `inset(${crop.y}px calc(100% - ${crop.x + crop.w}px) calc(100% - ${crop.y + crop.h}px) ${crop.x}px)` }
            : undefined
        }
      >
        {cropping && crop && (
          <div
            className="pointer-events-none absolute z-20 border-2 border-primary bg-primary/10"
            style={{ left: crop.x, top: crop.y, width: crop.w, height: crop.h }}
          />
        )}
        <img
          src={src}
          alt={alt}
          onLoad={onImageLoad}
          draggable={false}
          className={`select-none object-contain ${dragRef.current ? '' : 'transition-transform duration-150'}`}
          style={{
            // translate FIRST so the drag moves in screen axes regardless of
            // how the image is rotated underneath.
            transform: `translate(${pan.x}px, ${pan.y}px) rotate(${turn}deg) scale(${zoom})`,
            // A quarter-turned image is constrained by the CONTAINER's width on
            // its (rotated) height — capping against the viewport keeps it in
            // frame instead of clipping at the pane edge.
            maxWidth: quarter ? '58vh' : '100%',
            maxHeight: '58vh',
          }}
        />
      </div>

      {cropping && !crop && (
        <p className="border-t bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
          {t('importReview.preview.cropHint', 'Dra en ruta över det du vill titta närmare på. Originalfilen ändras inte.')}
        </p>
      )}

      {commentOpen && onComment && (
        <div className="border-t bg-muted/40 p-2">
          <Textarea
            defaultValue={comment ?? ''}
            rows={2}
            placeholder={t('importReview.preview.commentPlaceholder', 'Skriv en notering om det här kvittot…')}
            className="text-xs"
            onBlur={(e) => onComment(e.target.value)}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t('importReview.preview.commentHint', 'Noteringen följer med inköpet när du trycker Genomför.')}
          </p>
        </div>
      )}

      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent size="6xl" className="max-h-[95vh] overflow-hidden p-2">
          <div className="flex max-h-[88vh] items-center justify-center overflow-auto">
            <img src={src} alt={alt} className="max-h-[86vh] max-w-full object-contain"
              style={{ transform: `rotate(${turn}deg)` }} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function isPdf(name: string, mime?: string): boolean {
  return mime === 'application/pdf' || /\.pdf$/i.test(name);
}

interface ImportPreviewProps {
  file: ImportFileRow | null;
  /**
   * A file that exists only in memory so far — a receipt whose order will own
   * it on accept, so it has no storage path to sign yet. Takes precedence over
   * `file`: clicking a purchase row must show THAT receipt.
   */
  attachment?: { file: File; label: string } | null;
  /** Note attached to the previewed purchase; travels with it on accept. */
  comment?: string;
  onComment?: (text: string) => void;
  /** Remembered rotation for the document on show; undefined = never turned. */
  rotation?: number;
  onRotation?: (deg: number) => void;
}

export function ImportPreview({
  file,
  attachment,
  comment,
  onComment,
  rotation,
  onRotation,
}: ImportPreviewProps) {
  const { t } = useTranslation();
  const url = useFileUrl(file?.storagePath);

  // Object URL for the in-memory receipt; revoked when the selection changes.
  /**
   * The object URL is kept together with the FILE it was made from.
   *
   * Held as a bare string, it lagged one render behind the selection: click a
   * new row and, until the effect ran, the page showed the PREVIOUS document's
   * image beside the new row's numbers. Carl hit exactly that (2026-09-02) —
   * a Byggmax row with a Hornbach receipt next to it — and it is the worst
   * possible bug on this screen, because the whole point of the image is to
   * check the numbers against it. A mismatched pair does not just fail to
   * help; it actively misleads.
   *
   * Pairing them means a stale URL can never be rendered: if the file the URL
   * belongs to is not the file we are showing, we show nothing yet.
   */
  const [preview, setPreview] = useState<{ url: string; file: File } | null>(null);
  useEffect(() => {
    if (!attachment) {
      setPreview(null);
      return;
    }
    const objectUrl = URL.createObjectURL(attachment.file);
    setPreview({ url: objectUrl, file: attachment.file });
    return () => URL.revokeObjectURL(objectUrl);
    // Keyed on the FILE, not the wrapper object: every edit to the session
    // rebuilds the row objects, and re-minting the URL each time made the
    // image blink on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachment?.file]);

  const attachmentUrl = preview && attachment && preview.file === attachment.file ? preview.url : null;

  // Attachment known but its URL not minted yet: show nothing rather than the
  // "pick a file" empty state, which reads as though the row has no document.
  if (attachment && !attachmentUrl) {
    return (
      <div className="flex h-full min-h-[240px] items-center justify-center rounded-lg border p-6">
        <p className="text-xs text-muted-foreground">{t('common.loading', 'Laddar…')}</p>
      </div>
    );
  }

  if (attachment && attachmentUrl) {
    const name = attachment.file.name || attachment.label;
    if (isPdf(name, attachment.file.type)) {
      return (
        <div className="overflow-hidden rounded-lg border bg-muted/20">
          <iframe
            src={`${attachmentUrl}#navpanes=0&scrollbar=1&view=FitH`}
            title={name}
            className="h-[60vh] w-full border-0"
          />
        </div>
      );
    }
    return (
      <ImageViewer
        src={attachmentUrl}
        alt={name}
        comment={comment}
        onComment={onComment}
        rotation={rotation}
        onRotation={onRotation ?? (() => {})}
      />
    );
  }

  if (!file) {
    return (
      <div className="flex h-full min-h-[240px] items-center justify-center rounded-lg border border-dashed p-6 text-center">
        <p className="text-xs text-muted-foreground">
          {t('importReview.preview.empty', 'Välj en fil för att se den som den ser ut.')}
        </p>
      </div>
    );
  }

  if (!file.storagePath) {
    return (
      <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 rounded-lg border p-6 text-center">
        <FileText className="h-8 w-8 text-muted-foreground" />
        <p className="text-xs font-medium">{file.name}</p>
        <p className="text-xs text-muted-foreground">
          {t('importReview.preview.notStored', 'Filen kunde inte sparas i Filer, så den går inte att visa här.')}
        </p>
      </div>
    );
  }

  if (!url) {
    return (
      <div className="flex h-full min-h-[240px] items-center justify-center rounded-lg border p-6">
        <p className="text-xs text-muted-foreground">{t('common.loading', 'Laddar…')}</p>
      </div>
    );
  }

  if (isPdf(file.name, file.mimeType)) {
    return (
      <div className="overflow-hidden rounded-lg border bg-muted/20">
        <iframe
          src={`${url}#navpanes=0&scrollbar=1&view=FitH`}
          title={file.name}
          className="h-[60vh] w-full border-0"
        />
      </div>
    );
  }

  if (isImage(file.name, file.mimeType)) {
    return (
      <ImageViewer
        src={url}
        alt={file.name}
        rotation={rotation}
        onRotation={onRotation ?? (() => {})}
      />
    );
  }

  return (
    <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 rounded-lg border p-6 text-center">
      <FileText className="h-8 w-8 text-muted-foreground" />
      <p className="text-xs font-medium">{file.name}</p>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-primary underline underline-offset-2"
      >
        {t('importReview.preview.openFile', 'Öppna filen')}
      </a>
    </div>
  );
}

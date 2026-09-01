import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, RotateCw, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
 * nothing is written back to the file. Crop and comments are a later slice
 * (backlog: `granskningens-bildyta-crop-kommentarer-autovrid`).
 */
function ImageViewer({ src, alt }: { src: string; alt: string }) {
  const { t } = useTranslation();
  const [rotation, setRotation] = useState(0);
  const [zoomIdx, setZoomIdx] = useState(2); // 1x

  // A new document starts upright at 1x — carried-over rotation would make a
  // straight photo look crooked.
  useEffect(() => {
    setRotation(0);
    setZoomIdx(2);
  }, [src]);

  const zoom = ZOOM_STEPS[zoomIdx];
  const quarter = rotation % 180 !== 0;

  return (
    <div className="relative rounded-lg border bg-muted/20">
      <div className="absolute right-2 top-2 z-10 flex gap-1 rounded-md border bg-background/90 p-1 shadow-sm backdrop-blur">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setRotation((r) => (r + 90) % 360)}
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
      </div>
      <div className="flex max-h-[60vh] min-h-[240px] items-center justify-center overflow-auto p-2">
        <img
          src={src}
          alt={alt}
          className="object-contain transition-transform duration-150"
          style={{
            transform: `rotate(${rotation}deg) scale(${zoom})`,
            // A quarter-turned image is constrained by the CONTAINER's width on
            // its (rotated) height — capping against the viewport keeps it in
            // frame instead of clipping at the pane edge.
            maxWidth: quarter ? '58vh' : '100%',
            maxHeight: '58vh',
          }}
        />
      </div>
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
}

export function ImportPreview({ file, attachment }: ImportPreviewProps) {
  const { t } = useTranslation();
  const url = useFileUrl(file?.storagePath);

  // Object URL for the in-memory receipt; revoked when the selection changes.
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!attachment) {
      setAttachmentUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(attachment.file);
    setAttachmentUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [attachment]);

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
    return <ImageViewer src={attachmentUrl} alt={name} />;
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
    return <ImageViewer src={url} alt={file.name} />;
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

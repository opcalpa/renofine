import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText } from 'lucide-react';
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
    return (
      <div className="flex max-h-[60vh] items-center justify-center overflow-auto rounded-lg border bg-muted/20 p-2">
        <img src={attachmentUrl} alt={name} className="max-h-[58vh] max-w-full object-contain" />
      </div>
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
      <div className="flex max-h-[60vh] items-center justify-center overflow-auto rounded-lg border bg-muted/20 p-2">
        <img src={url} alt={file.name} className="max-h-[58vh] max-w-full object-contain" />
      </div>
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

/**
 * A folder dropped onto a home (P4): read it, propose, then wait.
 *
 * Three steps, and the order is the promise:
 *   1. read   — file names first, then the opening of documents whose name
 *               said nothing. No writes, no project touched.
 *   2. review — every guess shown and editable (ReviewDocumentsDialog, the
 *               same one the address page's upload button uses).
 *   3. save   — only after "Spara", and the result names what did not make it.
 *
 * Unrelated files are expected here, not exceptional. Anything unrecognised
 * stays `other` and is saved anyway: an unfiled document is still the person's
 * document, and losing it would be a far worse answer than Övrigt.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  planPropertyFolderIngest,
  type PropertyIngestPlan,
} from '@/services/propertyFolderIngest';
import {
  uploadPropertyDocument,
  type PropertyDocumentCategory,
} from '@/services/propertyDocumentService';
import { ReviewDocumentsDialog, type ReviewedDocument } from './ReviewDocumentsDialog';

interface Props {
  propertyId: string | null;
  propertyName: string;
  files: File[];
  onOpenChange: (open: boolean) => void;
  /** Called after a save so the address page can refresh its list. */
  onSaved?: () => void;
}

export function PropertyFolderDropDialog({
  propertyId,
  propertyName,
  files,
  onOpenChange,
  onSaved,
}: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [plan, setPlan] = useState<PropertyIngestPlan | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const open = !!propertyId && files.length > 0;

  useEffect(() => {
    if (!open) {
      setPlan(null);
      setProgress(null);
      return;
    }
    let cancelled = false;
    setPlan(null);
    planPropertyFolderIngest(files, (done, total) => {
      if (!cancelled) setProgress(total > 0 ? { done, total } : null);
    })
      .then((result) => {
        if (!cancelled) {
          setPlan(result);
          setProgress(null);
        }
      })
      .catch((e) => {
        console.error('PropertyFolderDropDialog: read failed', e);
        if (cancelled) return;
        // A failed read is not a reason to lose the drop — fall back to file
        // names only, which is what the address page's own button does.
        setPlan({
          guesses: files.map((file) => ({ file, category: 'other' as PropertyDocumentCategory, recognised: false })),
          fromName: 0,
          fromText: 0,
          unrecognised: files.length,
          oversized: 0,
          notRead: 0,
        });
        setProgress(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, files]);

  const handleConfirm = async (reviewed: ReviewedDocument[]) => {
    if (!propertyId) return;
    setSaving(true);
    let saved = 0;
    for (const row of reviewed) {
      const result = await uploadPropertyDocument({
        propertyId,
        file: row.file,
        category: row.category,
        displayName: row.displayName,
      });
      if (result) saved += 1;
    }
    setSaving(false);
    onOpenChange(false);
    onSaved?.();

    const failed = reviewed.length - saved;
    const notes: string[] = [];
    if (failed > 0) {
      notes.push(
        t('folderDrop.property.failed', {
          count: failed,
          defaultValue: '{{count}} kunde inte sparas — försök igen.',
        })
      );
    }
    // No silent caps: anything the read pass skipped is said out loud, even
    // though the file itself was saved.
    if (plan && plan.notRead > 0) {
      notes.push(
        t('folderDrop.property.notRead', {
          count: plan.notRead,
          defaultValue: '{{count}} dokument hann jag inte läsa igenom — de ligger under Övrigt.',
        })
      );
    }
    if (plan && plan.oversized > 0) {
      notes.push(
        t('folderDrop.property.oversized', {
          count: plan.oversized,
          defaultValue: '{{count}} filer var för stora för att läsas — de är sparade ändå.',
        })
      );
    }

    toast({
      title: t('folderDrop.property.saved', {
        count: saved,
        address: propertyName,
        defaultValue: '{{count}} dokument sparade på {{address}}',
      }),
      description: notes.length > 0 ? notes.join(' ') : undefined,
      variant: failed > 0 ? 'destructive' : undefined,
    });
  };

  // Both of these are memoised for the same reason: ReviewDocumentsDialog
  // re-derives its rows whenever they change, so a fresh array or arrow on
  // every render would make that loop forever.
  const guessFor = useCallback(
    (file: File) => plan?.guesses.find((g) => g.file === file)?.category ?? 'other',
    [plan]
  );
  const reviewFiles = useMemo(() => plan?.guesses.map((g) => g.file) ?? [], [plan]);

  if (!open) return null;

  // Reading phase — its own small dialog rather than a spinner inside the
  // review list, so nothing half-guessed is ever on screen.
  if (!plan) {
    return (
      <Dialog open onOpenChange={(o) => !o && onOpenChange(false)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>
              {t('folderDrop.property.reading', 'Läser igenom mappen…')}
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {progress
              ? t('folderDrop.property.readingProgress', {
                  done: progress.done,
                  total: progress.total,
                  defaultValue: 'Dokument {{done}} av {{total}}',
                })
              : t('folderDrop.property.readingNames', 'Tittar på filnamnen')}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <ReviewDocumentsDialog
      files={reviewFiles}
      guessFor={guessFor}
      open
      onOpenChange={(o) => !o && onOpenChange(false)}
      onConfirm={handleConfirm}
      saving={saving}
    />
  );
}

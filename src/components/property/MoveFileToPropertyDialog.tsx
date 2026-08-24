/**
 * "Det här hörde inte hit" — move one project file to the home (P4).
 *
 * A misfiled document gets a MOVE, never a delete. Someone who drops a folder
 * and finds their köpekontrakt sitting under a bathroom renovation needs one
 * click to put it right; making them delete and re-upload is how documents get
 * lost, and a purchase agreement is not a file you can re-download.
 *
 * A document lives in exactly one place, so the original is removed once the
 * copy is safely on the address. If that removal fails the result says so
 * plainly rather than leaving two copies to drift apart in silence.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  uploadPropertyDocument,
  type PropertyDocumentCategory,
} from '@/services/propertyDocumentService';
import { ReviewDocumentsDialog, type ReviewedDocument } from './ReviewDocumentsDialog';

export interface MovableProjectFile {
  name: string;
  /** Full storage key inside the `project-files` bucket. */
  path: string;
}

interface Props {
  file: MovableProjectFile | null;
  propertyId: string | null;
  propertyName: string;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful move so the file list can drop the row. */
  onMoved?: () => void;
}

export function MoveFileToPropertyDialog({
  file,
  propertyId,
  propertyName,
  onOpenChange,
  onMoved,
}: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [downloaded, setDownloaded] = useState<File[] | null>(null);
  const [saving, setSaving] = useState(false);

  const open = !!file && !!propertyId;

  useEffect(() => {
    if (!open || !file) {
      setDownloaded(null);
      return;
    }
    let cancelled = false;
    setDownloaded(null);
    (async () => {
      const { data, error } = await supabase.storage.from('project-files').download(file.path);
      if (cancelled) return;
      if (error || !data) {
        console.error('MoveFileToPropertyDialog: download failed', error);
        toast({
          title: t('files.moveToProperty.readFailed', 'Filen kunde inte hämtas'),
          variant: 'destructive',
        });
        onOpenChange(false);
        return;
      }
      setDownloaded([new File([data], file.name, { type: data.type || undefined })]);
    })();
    return () => {
      cancelled = true;
    };
    // `file` is the identity of this dialog; the callbacks are stable enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, file?.path]);

  const handleConfirm = async (reviewed: ReviewedDocument[]) => {
    if (!propertyId || !file) return;
    const row = reviewed[0];
    if (!row) return;

    setSaving(true);
    const saved = await uploadPropertyDocument({
      propertyId,
      file: row.file,
      category: row.category as PropertyDocumentCategory,
      displayName: row.displayName,
    });

    if (!saved) {
      setSaving(false);
      toast({
        title: t('files.moveToProperty.failed', 'Dokumentet kunde inte flyttas'),
        variant: 'destructive',
      });
      return;
    }

    // The copy is safe; now the original goes. Only after, never before.
    const { error: removeError } = await supabase.storage
      .from('project-files')
      .remove([file.path]);
    setSaving(false);
    onOpenChange(false);
    onMoved?.();

    if (removeError) {
      console.error('MoveFileToPropertyDialog: original not removed', removeError);
      toast({
        title: t('files.moveToProperty.movedName', {
          address: propertyName,
          defaultValue: 'Sparad på {{address}}',
        }),
        description: t(
          'files.moveToProperty.originalLeft',
          'Originalet ligger kvar i Filer — ta bort det när du vill.'
        ),
      });
      return;
    }

    toast({
      title: t('files.moveToProperty.movedName', {
        address: propertyName,
        defaultValue: 'Sparad på {{address}}',
      }),
    });
  };

  if (!open) return null;

  if (!downloaded) {
    return (
      <Dialog open onOpenChange={(o) => !o && onOpenChange(false)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{t('files.moveToProperty.preparing', 'Hämtar filen…')}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {file?.name}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <ReviewDocumentsDialog
      files={downloaded}
      open
      onOpenChange={(o) => !o && onOpenChange(false)}
      onConfirm={handleConfirm}
      saving={saving}
    />
  );
}

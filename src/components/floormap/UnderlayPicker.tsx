/**
 * Pick a drawing the project ALREADY holds and put it under the canvas.
 *
 * The planner could only ever upload a NEW image, so a plan that arrived with
 * the folder import — or sits under the address's papers — had to be downloaded
 * and uploaded again before it could be traced. Nothing was missing except the
 * path from one to the other.
 *
 * PDFs are offered too: the canvas renders images, so the chosen page is
 * rasterized and that PNG becomes the layer. Multi-page drawings ask which
 * page rather than silently taking the first.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, ImageIcon, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getFileUrl } from '@/lib/fileUrl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { isPdf, storedPdfPageCount } from './utils/uploadPlanImage';

export interface UnderlayCandidate {
  path: string;
  name: string;
  folder: string;
  isPdf: boolean;
  thumbnailUrl?: string;
}

interface Props {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chosen file plus, for a multi-page PDF, the page the person picked. */
  onPick: (file: UnderlayCandidate, pageNumber: number) => void;
}

/** Storage holds no "is this a drawing" flag — the extension is what we have. */
function isCandidate(name: string, mime: string): boolean {
  return mime.startsWith('image/') || mime === 'application/pdf' || /\.(png|jpe?g|webp|pdf)$/i.test(name);
}


/**
 * "Which page?" — asked wherever a multi-page drawing arrives, so page 1 is
 * never taken silently. Tracing the cover sheet is a very quiet failure.
 */
export const PageChoice = ({
  name,
  pageCount,
  onPick,
  onCancel,
}: {
  name: string;
  pageCount: number;
  onPick: (page: number) => void;
  onCancel: () => void;
}) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-3" data-testid="underlay-page-picker">
      <p className="text-sm text-muted-foreground">
        {t('floormap.underlayPicker.pagePrompt', '"{{name}}" har {{count}} sidor. Vilken vill du lägga in?', {
          name,
          count: pageCount,
        })}
      </p>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: pageCount }, (_, i) => i + 1).map((page) => (
          <Button
            key={page}
            variant="outline"
            size="sm"
            data-testid={`underlay-page-${page}`}
            onClick={() => onPick(page)}
          >
            {t('floormap.underlayPicker.page', 'Sida {{page}}', { page })}
          </Button>
        ))}
      </div>
      <Button variant="ghost" size="sm" onClick={onCancel}>
        {t('common.cancel', 'Avbryt')}
      </Button>
    </div>
  );
};

/** The page question on its own, for a PDF picked from disk rather than the project. */
export const UnderlayPageDialog = ({
  open,
  name,
  pageCount,
  onPick,
  onCancel,
}: {
  open: boolean;
  name: string;
  pageCount: number;
  onPick: (page: number) => void;
  onCancel: () => void;
}) => {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent size="lg" data-testid="underlay-page-dialog">
        <DialogHeader>
          <DialogTitle>{t('floormap.underlayPicker.pageTitle', 'Vilken sida?')}</DialogTitle>
        </DialogHeader>
        <PageChoice name={name} pageCount={pageCount} onPick={onPick} onCancel={onCancel} />
      </DialogContent>
    </Dialog>
  );
};

export const UnderlayPicker = ({ projectId, open, onOpenChange, onPick }: Props) => {
  const { t } = useTranslation();
  const [files, setFiles] = useState<UnderlayCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  /** A PDF awaiting its page choice; null while browsing. */
  const [pending, setPending] = useState<{ file: UnderlayCandidate; pageCount: number } | null>(null);
  const [checkingPages, setCheckingPages] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const found: UnderlayCandidate[] = [];

    const walk = async (path: string, folder: string) => {
      const { data, error } = await supabase.storage
        .from('project-files')
        .list(path, { sortBy: { column: 'name', order: 'asc' } });
      if (error || !data) return;

      for (const item of data) {
        if (item.name === '.emptyFolderPlaceholder') continue;
        const fullPath = `${path}/${item.name}`;
        const mime = (item.metadata as Record<string, unknown>)?.mimetype as string | undefined;

        if (!mime) {
          // No metadata means it is a folder, not a zero-byte file.
          await walk(fullPath, folder ? `${folder}/${item.name}` : item.name);
          continue;
        }
        if (!isCandidate(item.name, mime)) continue;

        found.push({
          path: fullPath,
          name: item.name,
          folder: folder || t('floormap.underlayPicker.root', 'Projektets rot'),
          isPdf: isPdf({ type: mime, name: item.name }),
        });
      }
    };

    await walk(`projects/${projectId}`, '');

    // Thumbnails only for images, and only once the list is known — a project
    // with fifty photos should not fire fifty signing requests before the
    // person sees anything.
    setFiles(found);
    setLoading(false);

    const withThumbs = await Promise.all(
      found.map(async (f) =>
        f.isPdf
          ? f
          : { ...f, thumbnailUrl: (await getFileUrl(f.path, {
              transform: { width: 160, height: 120, resize: 'cover' },
            })) ?? undefined }
      )
    );
    setFiles(withThumbs);
  }, [projectId, t]);

  useEffect(() => {
    if (!open) {
      setPending(null);
      setCheckingPages(null);
      return;
    }
    void load();
  }, [open, load]);

  const choose = async (file: UnderlayCandidate) => {
    if (!file.isPdf) {
      onPick(file, 1);
      return;
    }
    setCheckingPages(file.path);
    const pageCount = await storedPdfPageCount(file.path, file.name);
    setCheckingPages(null);
    if (pageCount <= 1) {
      onPick(file, 1);
      return;
    }
    setPending({ file, pageCount });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="3xl" className="max-h-[85vh] overflow-y-auto" data-testid="underlay-picker">
        <DialogHeader>
          <DialogTitle>
            {t('floormap.underlayPicker.title', 'Välj ritning ur projektets filer')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'floormap.underlayPicker.description',
              'Läggs under canvasen att kalkera på. Sätt skalan efteråt med Kalibrera skala.'
            )}
          </DialogDescription>
        </DialogHeader>

        {pending ? (
          <PageChoice
            name={pending.file.name}
            pageCount={pending.pageCount}
            onPick={(page) => onPick(pending.file, page)}
            onCancel={() => setPending(null)}
          />
        ) : loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('common.loading', 'Laddar…')}
          </div>
        ) : files.length === 0 ? (
          <p className="py-8 text-sm text-muted-foreground">
            {t(
              'floormap.underlayPicker.empty',
              'Inga bilder eller PDF:er i projektet ännu. Ladda upp en ritning under Filer först.'
            )}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {files.map((file) => (
              <button
                key={file.path}
                type="button"
                data-testid="underlay-candidate"
                className={cn(
                  'flex flex-col overflow-hidden rounded-lg border text-left transition-colors hover:border-primary',
                  checkingPages === file.path && 'opacity-60'
                )}
                onClick={() => void choose(file)}
              >
                <div className="flex h-24 items-center justify-center bg-muted/40">
                  {checkingPages === file.path ? (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  ) : file.thumbnailUrl ? (
                    <img
                      src={file.thumbnailUrl}
                      alt={file.name}
                      className="h-full w-full object-cover"
                    />
                  ) : file.isPdf ? (
                    <FileText className="h-6 w-6 text-muted-foreground" />
                  ) : (
                    <ImageIcon className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <div className="px-2 py-1.5">
                  <p className="truncate text-xs font-medium">{file.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{file.folder}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

/**
 * "Vad ska hända med filerna?" — shown when a folder is dropped on a project
 * page. Two honest destinations: let Renaida read them into the project's data
 * (rooms/tasks/purchases/plans), or just file them in the archive.
 */

import { useTranslation } from 'react-i18next';
import { FolderArchive, Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export type DropTargetChoice = 'renaida' | 'files';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileCount: number;
  onChoose: (choice: DropTargetChoice) => void;
}

export function DropTargetChoiceDialog({ open, onOpenChange, fileCount, onChoose }: Props) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>
            {t('folderDrop.target.title', '{{count}} filer släppta', { count: fileCount })}
          </DialogTitle>
          <DialogDescription>
            {t('folderDrop.target.description', 'Vad vill du att jag gör med dem?')}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <Button
            variant="outline"
            className="h-auto justify-start gap-3 py-4 text-left"
            onClick={() => { onChoose('renaida'); onOpenChange(false); }}
          >
            <Sparkles className="h-5 w-5 shrink-0 text-primary" />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">{t('folderDrop.target.renaida', 'Läs in med Renaida')}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {t('folderDrop.target.renaidaHint', 'Kvitton blir inköp, offerter blir arbeten, ritningar hamnar i planritaren. Filerna sparas också.')}
              </span>
            </span>
          </Button>
          <Button
            variant="outline"
            className="h-auto justify-start gap-3 py-4 text-left"
            onClick={() => { onChoose('files'); onOpenChange(false); }}
          >
            <FolderArchive className="h-5 w-5 shrink-0 text-primary" />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">{t('folderDrop.target.files', 'Bara spara i Filer')}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {t('folderDrop.target.filesHint', 'Sorteras i rätt mapp — inget läggs till i projektets data.')}
              </span>
            </span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

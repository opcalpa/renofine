/**
 * "Några av de här verkar höra till bostaden" (P4).
 *
 * A dropped folder is mixed by nature — the bathroom quote sits next to the
 * köpekontrakt, because that is how people keep their files. The engine can
 * tell which is which, but where they should LAND is not its call: some people
 * want the purchase agreement on the address, some want everything about this
 * renovation in one folder, and both are right.
 *
 * So it asks, once, with both answers equally easy. Whichever is chosen, the
 * files are kept: they are never dropped for being in the wrong pile. Nothing
 * here has touched the project — these documents were already held out of the
 * draft, so neither answer changes a single room, task or amount.
 */

import { useTranslation } from 'react-i18next';
import { House, FolderInput } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PROPERTY_DOC_CATEGORIES } from '@/services/propertyDocumentService';
import type { PropertyDocCandidate } from '@/services/ingestProjectFolder';

interface Props {
  candidates: PropertyDocCandidate[];
  /** The address they would go to. */
  propertyName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPutOnProperty: () => void;
  onKeepInProject: () => void;
  saving?: boolean;
}

export function HomePapersFoundDialog({
  candidates,
  propertyName,
  open,
  onOpenChange,
  onPutOnProperty,
  onKeepInProject,
  saving = false,
}: Props) {
  const { t } = useTranslation();

  const labelFor = (value: string) =>
    PROPERTY_DOC_CATEGORIES.find((c) => c.value === value)?.labelKey;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[85vh] overflow-y-auto" data-sentry-block>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <House className="h-5 w-5 text-primary" />
            {t('folderDrop.homePapers.title', {
              count: candidates.length,
              defaultValue: '{{count}} filer ser ut att höra till bostaden',
            })}
          </DialogTitle>
          <DialogDescription>
            {t('folderDrop.homePapers.body', {
              address: propertyName,
              defaultValue:
                'De handlar om hemmet, inte om det här arbetet — sådana papper brukar behövas långt efter att renoveringen är klar. Vill du lägga dem på {{address}} i stället?',
            })}
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-1 py-1 text-sm">
          {candidates.map((c, i) => {
            const key = labelFor(c.category);
            return (
              <li
                key={`${c.file.name}-${i}`}
                className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate">{c.file.name}</span>
                {key && (
                  <span className="shrink-0 text-xs text-muted-foreground">{t(key)}</span>
                )}
              </li>
            );
          })}
        </ul>

        <p className="text-xs text-muted-foreground">
          {t(
            'folderDrop.homePapers.note',
            'Ingetdera svaret ändrar något i projektet — de här filerna har inte lagts till som rum, arbeten eller inköp.'
          )}
        </p>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={onKeepInProject} disabled={saving}>
            <FolderInput className="mr-2 h-4 w-4" />
            {t('folderDrop.homePapers.keep', 'Behåll i projektet')}
          </Button>
          <Button onClick={onPutOnProperty} disabled={saving}>
            <House className="mr-2 h-4 w-4" />
            {t('folderDrop.homePapers.move', {
              address: propertyName,
              defaultValue: 'Lägg på {{address}}',
            })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * "Importer" — the list of readings this project has had.
 *
 * WHY (Carl, 2026-09-02): he dropped 56 receipts, reviewed part of them, and
 * then had no way back. There was no list, no menu item, nothing in Files — the
 * only door was a floating toast that appeared once on project load, and only
 * for the single import the local journal happened to be holding.
 *
 * A reading costs real money in model calls, so the run it produced is a thing
 * the person owns and must be able to return to. This page is that door. It
 * also answers the question the toast never could: "what happened to the batch
 * I dropped last week?" — including when the answer is "you discarded it".
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, FileStack, Loader2, AlertTriangle, Check, Trash2 } from 'lucide-react';
import {
  listImportRuns,
  loadImportRun,
  finishImportRun,
  receiptImagesAreLocal,
  type ImportRunSummary,
} from '@/services/agent/importRuns';
import type { ImportSession } from '@/services/agent/importSession';

interface Props {
  projectId: string;
  /** Open a run in the review page. */
  onOpen: (session: ImportSession, imagesMissing: boolean) => void;
  onBack: () => void;
}

/** Dates are shown in the person's locale, not as an ISO string. */
function formatWhen(iso: string, locale: string): string {
  const d = new Date(iso);
  return d.toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ImportRunsPage({ projectId, onOpen, onBack }: Props) {
  const { t, i18n } = useTranslation();
  const [runs, setRuns] = useState<ImportRunSummary[] | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void listImportRuns(projectId).then(setRuns);
  }, [projectId]);

  useEffect(refresh, [refresh]);

  const handleOpen = useCallback(
    async (run: ImportRunSummary) => {
      setOpening(run.id);
      try {
        const session = await loadImportRun(run.id);
        if (!session) return;
        // The blobs live in the browser that did the reading. Opened anywhere
        // else the review is intact but the receipt photos are not, and the
        // person has to be told BEFORE they start accepting rows they believe
        // they checked against an image.
        onOpen(session, !receiptImagesAreLocal(session));
      } finally {
        setOpening(null);
      }
    },
    [onOpen],
  );

  const handleDiscard = useCallback(
    async (run: ImportRunSummary) => {
      await finishImportRun(run.id, 'discarded');
      refresh();
    },
    [refresh],
  );

  return (
    <div className="h-full bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            {t('importRuns.back', 'Filer')}
          </Button>
        </div>

        <div>
          <h2 className="text-xl font-semibold">{t('importRuns.title', 'Importer')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              'importRuns.lead',
              'Varje mapp du har släppt på projektet, och vad läsningen hittade. En import som du inte hunnit svara på ligger kvar här tills du gör det.',
            )}
          </p>
        </div>

        {runs === null ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('common.loading', 'Laddar…')}
          </div>
        ) : runs.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <FileStack className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">
                {t('importRuns.emptyTitle', 'Inga importer än')}
              </p>
              <p className="max-w-md text-sm text-muted-foreground">
                {t(
                  'importRuns.emptyBody',
                  'Släpp en mapp med kvitton, ritningar eller offerter på projektet, så dyker läsningen upp här.',
                )}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {runs.map((run) => (
              <Card key={run.id} className={run.status === 'discarded' ? 'opacity-60' : undefined}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">
                        {formatWhen(run.createdAt, i18n.language)}
                      </span>
                      {run.status === 'reviewing' && (
                        <Badge variant="default">
                          {t('importRuns.status.reviewing', 'Väntar på dig')}
                        </Badge>
                      )}
                      {run.status === 'applied' && (
                        <Badge variant="secondary" className="gap-1">
                          <Check className="h-3 w-3" />
                          {t('importRuns.status.applied', 'Genomförd')}
                        </Badge>
                      )}
                      {run.status === 'discarded' && (
                        <Badge variant="outline">
                          {t('importRuns.status.discarded', 'Kastad')}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t('importRuns.summary', '{{files}} filer lästa · {{purchases}} inköp · {{changes}} ändringar', {
                        files: run.filesRead,
                        purchases: run.purchaseCount,
                        changes: run.proposalCount,
                      })}
                      {run.status === 'applied' && run.appliedCount !== null
                        ? ` · ${t('importRuns.appliedCount', '{{count}} genomförda', { count: run.appliedCount })}`
                        : ''}
                    </p>
                    {run.flaggedCount > 0 && run.status !== 'discarded' && (
                      <p className="flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-500">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        {t('importRuns.flagged', '{{count}} rader behöver din blick', {
                          count: run.flaggedCount,
                        })}
                      </p>
                    )}
                    {run.folderLabel && (
                      <p className="truncate text-xs text-muted-foreground">
                        {t('importRuns.folder', 'Filerna ligger i {{folder}}', {
                          folder: run.folderLabel.replace(/^\//, ''),
                        })}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 gap-2">
                    {run.status !== 'discarded' && (
                      <Button
                        size="sm"
                        variant={run.status === 'reviewing' ? 'default' : 'outline'}
                        onClick={() => void handleOpen(run)}
                        disabled={opening === run.id}
                      >
                        {opening === run.id && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                        {run.status === 'reviewing'
                          ? t('importRuns.resume', 'Fortsätt granska')
                          : t('importRuns.view', 'Öppna')}
                      </Button>
                    )}
                    {run.status === 'reviewing' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void handleDiscard(run)}
                        title={t('importRuns.discard', 'Kasta importen')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The way in, shown at the top of Files.
 *
 * Deliberately absent until the project has actually had an import: a person
 * who has never dropped a folder should not be handed a button to a list of
 * nothing. Once there IS a reading waiting, the badge is the point — that is
 * the state Carl was in when he could not find his way back.
 */
export function ImportRunsEntry({
  projectId,
  onOpen,
  reloadKey,
}: {
  projectId: string;
  onOpen: () => void;
  /** Bump to re-count after an import is created, applied or discarded. */
  reloadKey?: number;
}) {
  const { t } = useTranslation();
  const [runs, setRuns] = useState<ImportRunSummary[]>([]);

  useEffect(() => {
    void listImportRuns(projectId).then(setRuns);
  }, [projectId, reloadKey]);

  if (runs.length === 0) return null;
  const waiting = runs.filter((r) => r.status === 'reviewing').length;

  return (
    <div className="bg-background px-6 pt-6">
      <div className="mx-auto flex max-w-7xl justify-end">
        <Button variant={waiting > 0 ? 'default' : 'outline'} size="sm" onClick={onOpen} className="gap-1.5">
          <FileStack className="h-4 w-4" />
          {t('importRuns.title', 'Importer')}
          {waiting > 0 && (
            <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[11px]">
              {t('importRuns.waitingBadge', '{{count}} väntar', { count: waiting })}
            </Badge>
          )}
        </Button>
      </div>
    </div>
  );
}

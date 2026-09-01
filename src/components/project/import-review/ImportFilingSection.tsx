import { useTranslation } from 'react-i18next';
import { FolderOpen } from 'lucide-react';
import { filingSummary, type ImportSession } from '@/services/agent/importSession';

/**
 * Where the dropped files end up in Files.
 *
 * The sorting was always there — every classified file goes to /Kvitton,
 * /Offerter, /Ritningar and so on. It just happened silently after the review,
 * so the person had no way to know it had, or to disagree. A drop that moves a
 * hundred of someone's files should say where it put them BEFORE they accept
 * it; that is the same promise the rooms and tasks already make.
 *
 * The counts follow the person's own changes, so moving a file here updates the
 * picture immediately rather than at the end.
 */

/** "/Kvitton" → "Kvitton"; "" is the project's own root, which needs a name. */
export function folderLabel(folder: string, rootLabel: string): string {
  return folder ? folder.replace(/^\//, '') : rootLabel;
}

interface ImportFilingSectionProps {
  session: ImportSession;
  /**
   * 'footer' condenses the whole summary to one line for the Files tab's
   * footer row (Design handoff v2): the aggregate stays visible while the
   * per-file folder picker lives on the rows themselves. Dropping the
   * aggregate would break the promise that a drop says WHERE it put a
   * hundred of someone's files before they accept it.
   */
  variant?: 'section' | 'footer';
}

export function ImportFilingSection({ session, variant = 'section' }: ImportFilingSectionProps) {
  const { t } = useTranslation();
  const summary = filingSummary(session);
  if (summary.length === 0) return null;

  const rootLabel = t('importReview.filing.root', 'Projektets rot');

  if (variant === 'footer') {
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <FolderOpen className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 truncate">
          {t('importReview.filing.footerLabel', 'Hamnar i:')}{' '}
          {summary
            .map(({ folder, count }) => `${folderLabel(folder, rootLabel)} ${count}`)
            .join(' · ')}
        </span>
      </span>
    );
  }

  return (
    <section>
      <header className="mb-1.5 flex items-baseline gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t('importReview.filing.title', 'Var filerna hamnar')}
        </h3>
      </header>
      <p className="mb-2 text-[11px] text-muted-foreground">
        {t(
          'importReview.filing.hint',
          'Filerna är sorterade efter vad de är. Vill du flytta någon, ändra mappen vid filen i listan.'
        )}
      </p>
      <ul className="space-y-0.5">
        {summary.map(({ folder, count }) => (
          <li
            key={folder || '__root__'}
            className="flex items-center gap-2 rounded-md px-2 py-1 text-xs"
          >
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{folderLabel(folder, rootLabel)}</span>
            <span className="tabular-nums text-muted-foreground">
              {t('importReview.filing.count', '{{count}} filer', { count })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

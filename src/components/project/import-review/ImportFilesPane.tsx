import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Image as ImageIcon, Home, AlertCircle, Sparkles, CheckCheck, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CATEGORY_FOLDERS } from '@/services/smartUploadService';
import {
  destinationFolder,
  type ImportFileKind,
  type ImportFileRow,
  type ImportSession,
} from '@/services/agent/importSession';
import { folderLabel } from './ImportFilingSection';

/**
 * The files, grouped by what they actually did to the project.
 *
 * "Jag läste 100 filer" tells you nothing you can act on. Four piles do: what
 * changed the project, what was only filed, what belongs to the home rather
 * than the renovation, and what could not be read at all. Selecting a file
 * previews the original and highlights the rows it produced — which is how you
 * check whether the app read it right.
 */

const GROUPS: Array<{ kind: ImportFileKind; labelKey: string; fallback: string; hint: string }> = [
  {
    kind: 'interpreted',
    labelKey: 'importReview.files.interpreted',
    fallback: 'Gav projektet något',
    hint: 'importReview.files.interpretedHint',
  },
  {
    kind: 'alreadyImported',
    labelKey: 'importReview.files.alreadyImported',
    fallback: 'Fanns redan — lästes inte om',
    hint: 'importReview.files.alreadyImportedHint',
  },
  {
    kind: 'filed',
    labelKey: 'importReview.files.filed',
    fallback: 'Bara sparade i Filer',
    hint: 'importReview.files.filedHint',
  },
  {
    kind: 'homePaper',
    labelKey: 'importReview.files.homePapers',
    fallback: 'Hör till bostaden',
    hint: 'importReview.files.homePapersHint',
  },
  {
    kind: 'unreadable',
    labelKey: 'importReview.files.unreadable',
    fallback: 'Kunde inte läsas',
    hint: 'importReview.files.unreadableHint',
  },
];

function FileKindIcon({ kind, name }: { kind: ImportFileKind; name: string }) {
  if (kind === 'alreadyImported') return <CheckCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
  if (kind === 'homePaper') return <Home className="h-3.5 w-3.5 shrink-0 text-amber-600" />;
  if (kind === 'unreadable') return <AlertCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
  if (kind === 'interpreted') return <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />;
  return /\.(jpe?g|png|gif|webp|heic)$/i.test(name) ? (
    <ImageIcon className="h-3.5 w-3.5 shrink-0 text-blue-500" />
  ) : (
    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
  );
}

interface ImportFilesPaneProps {
  session: ImportSession;
  selectedFileId: string | null;
  onSelectFile: (file: ImportFileRow) => void;
  /** One-line summary of what a file produced ("2 rum · 3 arbeten"). */
  describeFile: (file: ImportFileRow) => string;
  /** Move one archived file to another folder in Files. */
  onMoveFile: (fileId: string, folder: string) => void;
}

export function ImportFilesPane({
  session,
  selectedFileId,
  onSelectFile,
  describeFile,
  onMoveFile,
}: ImportFilesPaneProps) {
  const { t } = useTranslation();
  const rootLabel = t('importReview.filing.root', 'Projektets rot');

  // The known category folders, plus whatever this drop actually used — that is
  // how the dated import folder shows up as a destination without being
  // hard-coded anywhere.
  const folderOptions = useMemo(() => {
    const used = session.files
      .map((f) => destinationFolder(f))
      .filter((f): f is string => f !== undefined);
    return [...new Set([...Object.values(CATEGORY_FOLDERS), ...used])].sort((a, b) =>
      a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)
    );
  }, [session.files]);

  return (
    <div className="space-y-4">
      {GROUPS.map((group) => {
        const files = session.files.filter((f) => f.kind === group.kind);
        // The unreadable pile is a count, not a list of rows we can preview.
        const extra =
          group.kind === 'unreadable' ? session.outcome.unreadableCount : 0;
        if (files.length === 0 && extra === 0) return null;

        return (
          <section key={group.kind}>
            <header className="mb-1.5 flex items-baseline gap-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t(group.labelKey, group.fallback)}
              </h3>
              <span className="text-xs tabular-nums text-muted-foreground">
                {files.length + extra}
              </span>
            </header>

            {files.length === 0 ? (
              <p className="px-2 text-xs text-muted-foreground">
                {t('importReview.files.unreadableOnly', '{{count}} filer gick inte att läsa.', { count: extra })}
              </p>
            ) : (
              <ul className="space-y-0.5">
                {files.map((file) => {
                  const selected = file.id === selectedFileId;
                  const folder = destinationFolder(file);
                  return (
                    <li key={file.id}>
                      <button
                        type="button"
                        onClick={() => onSelectFile(file)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                          selected ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-muted'
                        )}
                      >
                        <FileKindIcon kind={file.kind} name={file.name} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs" title={file.name}>
                            {file.name}
                          </span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {describeFile(file)}
                          </span>
                        </span>
                      </button>
                      {folder !== undefined && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="ml-7 flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              title={t('importReview.filing.move', 'Flytta till en annan mapp')}
                            >
                              <FolderOpen className="h-3 w-3 shrink-0" />
                              <span className="truncate">{folderLabel(folder, rootLabel)}</span>
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                            {folderOptions.map((option) => (
                              <DropdownMenuItem
                                key={option || '__root__'}
                                onSelect={() => onMoveFile(file.id, option)}
                                className={cn('text-xs', option === folder && 'font-medium')}
                              >
                                {folderLabel(option, rootLabel)}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

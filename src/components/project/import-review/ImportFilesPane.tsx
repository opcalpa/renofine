import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FileText,
  Image as ImageIcon,
  Home,
  AlertCircle,
  Sparkles,
  CheckCheck,
  ChevronRight,
  FolderOpen,
  Plus,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
 * "Jag läste 100 filer" tells you nothing you can act on. Five piles do: what
 * changed the project, what was recognised from before, what was only filed,
 * what belongs to the home rather than the renovation, and what could not be
 * read at all. Selecting a file previews the original and highlights the rows
 * it produced — which is how you check whether the app read it right.
 *
 * The piles COLLAPSE, and that is not decoration. With 39 interpreted files the
 * other four groups sat below 39 rows of scrolling, so a pane built to say
 * "here are five answers" only ever showed one (Carl, 2026-09-03). Closed, the
 * whole shape of a drop fits on one screen.
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
  /**
   * Move files to another folder in Files. One id or fifty — the batch is the
   * point: the per-file picker meant moving 39 misfiled photos one dropdown at
   * a time (Carl, 2026-09-03).
   */
  onMoveFiles: (fileIds: string[], folder: string) => void;
  /**
   * Turn a file the reader could not place into a purchase by hand.
   *
   * "Other" stays the right default — a document we did not recognise WITH
   * CONFIDENCE must never be guessed at. What was missing was the way back:
   * the person can read the receipt perfectly well, and had no way to say so
   * (Carl, 2026-09-01).
   */
  onLiftToPurchase?: (file: ImportFileRow) => void;
}

export function ImportFilesPane({
  session,
  selectedFileId,
  onSelectFile,
  describeFile,
  onMoveFiles,
  onLiftToPurchase,
}: ImportFilesPaneProps) {
  const { t } = useTranslation();
  const rootLabel = t('importReview.filing.root', 'Projektets rot');

  const groups = useMemo(
    () =>
      GROUPS.map((group) => ({
        ...group,
        files: session.files.filter((f) => f.kind === group.kind),
        // The unreadable pile is a count, not a list of rows we can preview.
        extra: group.kind === 'unreadable' ? session.outcome.unreadableCount : 0,
      })).filter((g) => g.files.length > 0 || g.extra > 0),
    [session.files, session.outcome.unreadableCount]
  );

  /**
   * Which piles are open. A drop with a single pile opens it — hiding the only
   * thing there is behind a click would be a worse pane, not a tidier one.
   */
  const [open, setOpen] = useState<Set<ImportFileKind>>(
    () => new Set(groups.length === 1 ? groups.map((g) => g.kind) : [])
  );
  const toggleGroup = (kind: ImportFileKind) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });

  /**
   * Files ticked for a batch move. Only files that HAVE a place in storage can
   * be ticked — a receipt still owned by its purchase has no path to move yet.
   */
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const movable = (file: ImportFileRow) => destinationFolder(file) !== undefined;
  const togglePick = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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

  const movePicked = (folder: string) => {
    onMoveFiles([...picked], folder);
    setPicked(new Set());
  };

  return (
    <div className="space-y-2">
      {/*
        The batch bar only exists while something is ticked, and it says the
        count out loud: a move that reaches rows scrolled out of view is the
        fastest way to lose trust in this screen.
      */}
      {picked.size > 0 && (
        <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-lg border bg-background/95 px-3 py-2 shadow-sm backdrop-blur">
          <span className="text-xs font-medium tabular-nums">
            {t('importReview.files.picked', '{{count}} valda', { count: picked.size })}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs">
                <FolderOpen className="h-3 w-3" />
                {t('importReview.files.movePicked', 'Flytta till mapp')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
              {folderOptions.map((option) => (
                <DropdownMenuItem
                  key={option || '__root__'}
                  className="text-xs"
                  onSelect={() => movePicked(option)}
                >
                  {folderLabel(option, rootLabel)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs text-muted-foreground"
            onClick={() => setPicked(new Set())}
          >
            <X className="h-3 w-3" />
            {t('common.cancel', 'Avbryt')}
          </Button>
        </div>
      )}

      {groups.map((group) => {
        const isOpen = open.has(group.kind);
        const movableFiles = group.files.filter(movable);
        const allPicked =
          movableFiles.length > 0 && movableFiles.every((f) => picked.has(f.id));
        const somePicked = movableFiles.some((f) => picked.has(f.id));
        const holdsSelection = group.files.some((f) => f.id === selectedFileId);

        return (
          <section key={group.kind} className="rounded-lg border">
            <header className="flex items-center gap-2 px-2 py-1.5">
              {/* Ticking the whole pile is the batch move's real entry point:
                  "everything the reader could not place goes to /Kvitton". */}
              {movableFiles.length > 0 && (
                <Checkbox
                  className="h-3.5 w-3.5"
                  checked={allPicked ? true : somePicked ? 'indeterminate' : false}
                  onCheckedChange={() =>
                    setPicked((prev) => {
                      const next = new Set(prev);
                      for (const f of movableFiles) {
                        if (allPicked) next.delete(f.id);
                        else next.add(f.id);
                      }
                      return next;
                    })
                  }
                  aria-label={t('importReview.files.pickGroup', 'Välj alla i gruppen')}
                />
              )}
              <button
                type="button"
                onClick={() => toggleGroup(group.kind)}
                className="flex min-w-0 flex-1 items-baseline gap-2 rounded text-left"
                aria-expanded={isOpen}
              >
                <ChevronRight
                  className={cn(
                    'h-3.5 w-3.5 shrink-0 self-center text-muted-foreground transition-transform',
                    isOpen && 'rotate-90'
                  )}
                />
                <h3 className="min-w-0 truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t(group.labelKey, group.fallback)}
                </h3>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {group.files.length + group.extra}
                </span>
                {/* The pile holding the previewed file, so a closed pane still
                    says where the document on the right came from. */}
                {holdsSelection && !isOpen && (
                  <span className="h-1.5 w-1.5 shrink-0 self-center rounded-full bg-primary" />
                )}
              </button>
            </header>

            {isOpen && (
              <div className="border-t px-2 pb-2 pt-1.5">
                {group.files.length === 0 ? (
                  <p className="px-2 text-xs text-muted-foreground">
                    {t('importReview.files.unreadableOnly', '{{count}} filer gick inte att läsa.', {
                      count: group.extra,
                    })}
                  </p>
                ) : (
                  <ul className="space-y-0.5">
                    {group.files.map((file) => {
                      const selected = file.id === selectedFileId;
                      const folder = destinationFolder(file);
                      return (
                        <li key={file.id}>
                          <div className="flex items-center gap-2">
                            {folder !== undefined && (
                              <Checkbox
                                className="h-3.5 w-3.5 shrink-0"
                                checked={picked.has(file.id)}
                                onCheckedChange={() => togglePick(file.id)}
                                aria-label={t('importReview.files.pickFile', 'Välj filen')}
                              />
                            )}
                            <button
                              type="button"
                              onClick={() => onSelectFile(file)}
                              className={cn(
                                'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
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
                          </div>
                          {folder !== undefined && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  className="ml-12 flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
                                    onSelect={() => onMoveFiles([file.id], option)}
                                    className={cn('text-xs', option === folder && 'font-medium')}
                                  >
                                    {folderLabel(option, rootLabel)}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                          {onLiftToPurchase && (file.kind === 'filed' || file.kind === 'unreadable') && (
                            <button
                              type="button"
                              onClick={() => onLiftToPurchase(file)}
                              className="ml-12 mt-0.5 flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-primary transition-colors hover:bg-primary/10"
                            >
                              <Plus className="h-3 w-3 shrink-0" />
                              {t('importReview.files.liftToPurchase', 'Lägg till som inköp')}
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

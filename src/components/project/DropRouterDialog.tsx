/**
 * "Vad ska jag göra med den här mappen?" — the router Carl asked for.
 *
 * A dropped folder can mean three things, and the app cannot tell which from
 * the files alone: start a NEW project from it, fold it into an EXISTING one,
 * or — the third door (P4) — file it under the HOME, because köpekontrakt and
 * besiktningsprotokoll belong to the address and outlive every renovation on
 * it. Asking is cheaper than guessing wrong in either direction.
 *
 * The project picker lists what RLS lets the user reach (demo projects
 * excluded — public_demo is readable by everyone). The address picker is shown
 * to homeowners only, matching how the address list itself is gated.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderInput, FolderPlus, FolderSymlink, House, Loader2, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { isDemoProject } from '@/services/demoProjectService';
import { normalizeStatus } from '@/lib/projectStatus';
import {
  listMyPropertiesWithCounts,
  propertyLabel,
  compareByResidence,
  type PropertyWithProjectCount,
} from '@/services/propertyService';
import type { DroppedFile } from '@/lib/dropTree';

export type DropRoute =
  | { kind: 'new' }
  | { kind: 'existing'; projectId: string; projectName: string }
  | { kind: 'property'; propertyId: string; propertyName: string };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: DroppedFile[];
  onRoute: (route: DropRoute) => void;
  /** Guests have no server projects — the picker is skipped for them. */
  isGuest?: boolean;
  /** Addresses are a homeowner surface in v1, same as the address list. */
  isContractor?: boolean;
}

interface PickerProject {
  id: string;
  name: string;
}

/** Above this many rows the list needs a filter to stay usable. */
const FILTER_ABOVE = 8;

/** The dropped folder's own name, derived from the relative paths. */
export function droppedFolderName(files: DroppedFile[]): string | null {
  const first = files.find((f) => f.relativePath.includes('/'));
  if (!first) return null;
  return first.relativePath.split('/')[0] || null;
}

export function DropRouterDialog({
  open,
  onOpenChange,
  files,
  onRoute,
  isGuest = false,
  isContractor = false,
}: Props) {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<PickerProject[] | null>(null);
  const [properties, setProperties] = useState<PropertyWithProjectCount[] | null>(null);
  const [picking, setPicking] = useState<'project' | 'property' | null>(null);
  const [filter, setFilter] = useState('');

  const folderName = useMemo(() => droppedFolderName(files), [files]);
  const showAddresses = !isGuest && !isContractor;

  // Addresses: every one the user can reach, most-lived-in first. Unlike the
  // project picker this does NOT hide addresses without live projects — a home
  // you have never renovated still has papers, and that is the whole point.
  useEffect(() => {
    if (!open) return;
    if (!showAddresses) {
      setProperties([]);
      return;
    }
    let cancelled = false;
    listMyPropertiesWithCounts().then((rows) => {
      if (!cancelled) setProperties([...rows].sort(compareByResidence));
    });
    return () => { cancelled = true; };
  }, [open, showAddresses]);

  useEffect(() => {
    if (!open) {
      setPicking(null);
      setFilter('');
      return;
    }
    if (isGuest) {
      setProjects([]);
      return;
    }
    let cancelled = false;
    (async () => {
      // No owner filter: `projects.owner_id` is a PROFILE id, and this compared
      // it to the AUTH user id — two different uuids — so the list came back
      // empty for everyone and the dialog silently skipped the question. RLS
      // already scopes this to what the user may reach, which is also what
      // brings in projects shared through an address (S4 admin).
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, status, project_type')
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(50);
      if (cancelled) return;
      if (error || !data) {
        setProjects([]);
        return;
      }
      setProjects(
        data
          .filter((p) => !isDemoProject(p.project_type))
          // Completed projects stay in the picker on purpose (Skiva 3): late
          // receipts, the archive and new detail sketches all land there.
          // Only cancelled projects are a dead end.
          .filter((p) => normalizeStatus(p.status) !== 'cancelled')
          .map((p) => ({ id: p.id, name: p.name }))
      );
    })();
    return () => { cancelled = true; };
  }, [open, isGuest]);

  // Only one possible answer → don't ask. Both lists have to be empty: an
  // account with no projects but one address still has a real choice to make.
  useEffect(() => {
    if (
      open &&
      projects !== null &&
      properties !== null &&
      projects.length === 0 &&
      properties.length === 0
    ) {
      onRoute({ kind: 'new' });
      onOpenChange(false);
    }
  }, [open, projects, properties, onRoute, onOpenChange]);

  const fileCount = files.length;
  const loading = projects === null || properties === null;

  const matches = (haystack: string) =>
    haystack.toLowerCase().includes(filter.trim().toLowerCase());
  const shownProjects = (projects ?? []).filter((p) => matches(p.name));
  const shownProperties = (properties ?? []).filter((p) => matches(propertyLabel(p)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderInput className="h-5 w-5 text-primary" />
            {folderName
              ? t('folderDrop.router.titleNamed', '"{{folder}}" — {{count}} filer', { folder: folderName, count: fileCount })
              : t('folderDrop.router.title', '{{count}} filer släppta', { count: fileCount })}
          </DialogTitle>
          <DialogDescription>
            {t('folderDrop.router.description', 'Vad vill du att jag gör med dem?')}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : picking === null ? (
          <div className="grid gap-3">
            <Button
              variant="outline"
              className="h-auto justify-start gap-3 py-4 text-left"
              onClick={() => { onRoute({ kind: 'new' }); onOpenChange(false); }}
            >
              <FolderPlus className="h-5 w-5 shrink-0 text-primary" />
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">{t('folderDrop.router.newProject', 'Skapa nytt projekt')}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {t('folderDrop.router.newProjectHint', 'Renaida läser filerna och föreslår rum, arbeten och inköp.')}
                </span>
              </span>
            </Button>
            {(projects ?? []).length > 0 && (
              <Button
                variant="outline"
                className="h-auto justify-start gap-3 py-4 text-left"
                onClick={() => setPicking('project')}
              >
                <FolderSymlink className="h-5 w-5 shrink-0 text-primary" />
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">{t('folderDrop.router.existingProject', 'Lägg till i befintligt projekt')}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {t('folderDrop.router.existingProjectHint', 'Du får godkänna varje förslag innan något läggs till.')}
                  </span>
                </span>
              </Button>
            )}
            {/* The third door (P4). Papers about the home, not about a job —
                they stay with the address long after the renovation is done. */}
            {(properties ?? []).length > 0 && (
              <Button
                variant="outline"
                className="h-auto justify-start gap-3 py-4 text-left"
                onClick={() => setPicking('property')}
              >
                <House className="h-5 w-5 shrink-0 text-primary" />
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">{t('folderDrop.router.property', 'Spara på bostaden')}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {t('folderDrop.router.propertyHint', 'Köpehandlingar, besiktning, frågelista — pappren om hemmet. De rör inga projekt.')}
                  </span>
                </span>
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-2">
            <p className="text-sm text-muted-foreground">
              {picking === 'project'
                ? t('folderDrop.router.pickProject', 'Vilket projekt?')
                : t('folderDrop.router.pickProperty', 'Vilken bostad?')}
            </p>
            {/* A backfilled account can carry dozens of addresses; scrolling
                past them to find one is not a picker, it is a haystack. */}
            {(picking === 'project' ? (projects ?? []).length : (properties ?? []).length) > FILTER_ABOVE && (
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="pl-8"
                  placeholder={t('common.search', 'Sök')}
                  autoFocus
                />
              </div>
            )}
            <div className="grid max-h-[45vh] gap-2 overflow-y-auto">
              {picking === 'project'
                ? shownProjects.map((p) => (
                    <Button
                      key={p.id}
                      variant="outline"
                      className="justify-start"
                      onClick={() => {
                        onRoute({ kind: 'existing', projectId: p.id, projectName: p.name });
                        onOpenChange(false);
                      }}
                    >
                      {p.name}
                    </Button>
                  ))
                : shownProperties.map((p) => (
                    <Button
                      key={p.id}
                      variant="outline"
                      className="h-auto justify-start py-2.5 text-left"
                      onClick={() => {
                        onRoute({
                          kind: 'property',
                          propertyId: p.id,
                          propertyName: propertyLabel(p),
                        });
                        onOpenChange(false);
                      }}
                    >
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate font-medium">{propertyLabel(p)}</span>
                        {p.liveProjectCount > 0 && (
                          <span className="text-xs font-normal text-muted-foreground">
                            {t('addresses.picker.projectCount', { count: p.liveProjectCount })}
                          </span>
                        )}
                      </span>
                    </Button>
                  ))}
              {(picking === 'project' ? shownProjects : shownProperties).length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  {t('common.noResults', 'Inga träffar')}
                </p>
              )}
            </div>
            <Button variant="ghost" size="sm" className="mt-1" onClick={() => { setPicking(null); setFilter(''); }}>
              {t('common.back', 'Tillbaka')}
            </Button>
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
}

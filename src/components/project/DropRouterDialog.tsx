/**
 * "Vad ska jag göra med den här mappen?" — the router Carl asked for.
 *
 * Shown after a folder is dropped on a page that could mean either thing:
 * create a NEW project from it, or fold it into an EXISTING one. The picker
 * lists only projects the user may write to (demo projects excluded — see the
 * demo-visibility rule: public_demo is RLS-readable by everyone).
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderInput, FolderPlus, FolderSymlink, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { isDemoProject } from '@/services/demoProjectService';
import { isProjectEditable, normalizeStatus } from '@/lib/projectStatus';
import type { DroppedFile } from '@/lib/dropTree';

export type DropRoute =
  | { kind: 'new' }
  | { kind: 'existing'; projectId: string; projectName: string };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: DroppedFile[];
  onRoute: (route: DropRoute) => void;
  /** Guests have no server projects — the picker is skipped for them. */
  isGuest?: boolean;
}

interface PickerProject {
  id: string;
  name: string;
}

/** The dropped folder's own name, derived from the relative paths. */
export function droppedFolderName(files: DroppedFile[]): string | null {
  const first = files.find((f) => f.relativePath.includes('/'));
  if (!first) return null;
  return first.relativePath.split('/')[0] || null;
}

export function DropRouterDialog({ open, onOpenChange, files, onRoute, isGuest = false }: Props) {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<PickerProject[] | null>(null);
  const [picking, setPicking] = useState(false);

  const folderName = useMemo(() => droppedFolderName(files), [files]);

  useEffect(() => {
    if (!open) {
      setPicking(false);
      return;
    }
    if (isGuest) {
      setProjects([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setProjects([]);
        return;
      }
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, status, project_type')
        .eq('owner_id', user.id)
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
          .filter((p) => isProjectEditable(normalizeStatus(p.status)))
          .map((p) => ({ id: p.id, name: p.name }))
      );
    })();
    return () => { cancelled = true; };
  }, [open, isGuest]);

  // Nothing to fold into → don't ask a question with one possible answer.
  useEffect(() => {
    if (open && projects !== null && projects.length === 0) {
      onRoute({ kind: 'new' });
      onOpenChange(false);
    }
  }, [open, projects, onRoute, onOpenChange]);

  const fileCount = files.length;

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

        {projects === null ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : !picking ? (
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
            <Button
              variant="outline"
              className="h-auto justify-start gap-3 py-4 text-left"
              onClick={() => setPicking(true)}
            >
              <FolderSymlink className="h-5 w-5 shrink-0 text-primary" />
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">{t('folderDrop.router.existingProject', 'Lägg till i befintligt projekt')}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {t('folderDrop.router.existingProjectHint', 'Du får godkänna varje förslag innan något läggs till.')}
                </span>
              </span>
            </Button>
          </div>
        ) : (
          <div className="grid gap-2">
            {projects.map((p) => (
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
            ))}
            <Button variant="ghost" size="sm" className="mt-1" onClick={() => setPicking(false)}>
              {t('common.back', 'Tillbaka')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

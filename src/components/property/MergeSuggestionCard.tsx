/**
 * "These look like the same home — merge them?" (S5)
 *
 * The problem it solves is a number that is wrong without looking wrong: two
 * addresses for one flat means the address summary shows part of what was
 * spent, with nothing on screen admitting it. A duplicate is easy to create —
 * "Storg. 5" one year, "Storgatan 5" the next — and impossible to notice,
 * because each page looks complete on its own.
 *
 * It only ever proposes. The merge deletes an address and cannot be undone by a
 * button (the way back is re-assigning projects from project settings), so the
 * confirmation says exactly what will move.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Merge, MapPin } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  findMergeGroupFor,
  mergeProperties,
  propertyLabel,
  hasRealAddress,
  type PropertyWithProjectCount,
} from '@/services/propertyService';

interface Props {
  propertyId: string;
  /** Owner-only: the database refuses a merge from anyone else. */
  canMerge: boolean;
  onMerged: (survivingPropertyId: string) => void;
}

/** How much of an address a property actually knows. */
function completeness(p: PropertyWithProjectCount): number {
  return (
    Number(hasRealAddress(p)) * 4 +
    Number(Boolean(p.postal_code)) +
    Number(Boolean(p.city)) +
    Number(Boolean(p.property_designation))
  );
}

/**
 * Which address should survive by default: the most completely filled in one.
 * It is both the likelier spelling ("Storgatan 5" over "Storg. 5") and the one
 * that will collect future projects, since grouping reads the address fields.
 * Length breaks the last tie for the same reason — an abbreviation is short.
 */
function defaultKeeper(group: PropertyWithProjectCount[]): string {
  const ranked = [...group].sort((a, b) => {
    const complete = completeness(b) - completeness(a);
    if (complete !== 0) return complete;
    const projects = b.liveProjectCount - a.liveProjectCount;
    if (projects !== 0) return projects;
    return (b.address ?? b.name).length - (a.address ?? a.name).length;
  });
  return ranked[0].id;
}

export function MergeSuggestionCard({ propertyId, canMerge, onMerged }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [group, setGroup] = useState<PropertyWithProjectCount[] | null>(null);
  const [keeperId, setKeeperId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [merging, setMerging] = useState(false);

  useEffect(() => {
    if (!canMerge) return;
    let cancelled = false;
    findMergeGroupFor(propertyId).then((found) => {
      if (cancelled) return;
      setGroup(found);
      setKeeperId(found ? defaultKeeper(found) : null);
    });
    return () => {
      cancelled = true;
    };
  }, [propertyId, canMerge]);

  if (!canMerge || !group || group.length < 2 || !keeperId) return null;

  const keeper = group.find((p) => p.id === keeperId);
  const losers = group.filter((p) => p.id !== keeperId);
  const movingProjects = losers.reduce((sum, p) => sum + p.liveProjectCount, 0);

  const handleMerge = async () => {
    if (!keeper) return;
    setMerging(true);

    let moved = 0;
    for (const loser of losers) {
      const result = await mergeProperties(loser.id, keeper.id);
      if (result === null) {
        setMerging(false);
        setConfirming(false);
        toast({
          title: t('addresses.merge.failed', 'Adresserna kunde inte slås ihop'),
          variant: 'destructive',
        });
        return;
      }
      moved += result;
    }

    setMerging(false);
    setConfirming(false);
    toast({
      title: t('addresses.merge.done', 'Adresserna är ihopslagna'),
      description: t('addresses.merge.doneDetail', {
        count: moved,
        name: propertyLabel(keeper),
        defaultValue: `{{count}} projekt ligger nu på ${propertyLabel(keeper)}.`,
      }),
    });

    // The page may have just deleted itself out from under the user.
    if (keeper.id !== propertyId) navigate(`/addresses/${keeper.id}`, { replace: true });
    else onMerged(keeper.id);
  };

  return (
    <section className="rounded-xl border border-amber-300/70 bg-amber-50/60 p-4 dark:border-amber-500/30 dark:bg-amber-500/10 print:hidden">
      <header className="flex items-start gap-2.5">
        <Merge className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">
            {t('addresses.merge.title', 'Ser ut att vara samma bostad')}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              'addresses.merge.body',
              'Renoveringarna ligger på var sin adress, så ingen av sidorna visar hela summan för bostaden. Välj vilken adress som ska behållas — projekten flyttas dit.'
            )}
          </p>
        </div>
      </header>

      <RadioGroup
        value={keeperId}
        onValueChange={setKeeperId}
        className="mt-3 space-y-1.5"
      >
        {group.map((p) => (
          <div key={p.id} className="flex items-center gap-2.5 rounded-lg bg-background/70 px-3 py-2">
            <RadioGroupItem value={p.id} id={`keep-${p.id}`} />
            <Label htmlFor={`keep-${p.id}`} className="min-w-0 flex-1 cursor-pointer font-normal">
              <span className="flex items-center gap-1.5 truncate text-sm font-medium">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                {propertyLabel(p)}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {t('addresses.list.projectCount', { count: p.liveProjectCount })}
                {!hasRealAddress(p) && <> · {t('addresses.noAddressSet', 'ingen adress angiven')}</>}
                {p.id === propertyId && <> · {t('addresses.merge.thisPage', 'sidan du är på')}</>}
              </span>
            </Label>
          </div>
        ))}
      </RadioGroup>

      <div className="mt-3 flex items-center justify-end">
        <Button size="sm" onClick={() => setConfirming(true)}>
          <Merge className="mr-1.5 h-3.5 w-3.5" />
          {t('addresses.merge.action', 'Slå ihop till en adress')}
        </Button>
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('addresses.merge.confirmTitle', 'Slå ihop adresserna?')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('addresses.merge.confirmBody', {
                count: movingProjects,
                name: keeper ? propertyLabel(keeper) : '',
                defaultValue: `{{count}} projekt flyttas till ${keeper ? propertyLabel(keeper) : ''}, och de andra adresserna tas bort. Projekten och deras innehåll rörs inte — men det går inte att ångra med en knapp, utan genom att flytta projekten tillbaka i projektinställningarna.`,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={merging}>
              {t('common.cancel', 'Avbryt')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleMerge} disabled={merging}>
              {merging
                ? t('addresses.merge.merging', 'Slår ihop…')
                : t('addresses.merge.action', 'Slå ihop till en adress')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

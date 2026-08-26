/**
 * "Din plan" inside the guest's own project.
 *
 * The plan is shown once when the wizard finishes, and PostHog caught a guest
 * coming back two days later to a project that no longer said anything about
 * cost, ROT or order — so they left again. This card is the way back to it:
 * the headline numbers where the project lives, and the full plan one tap away.
 *
 * It recomputes from localStorage rather than storing a snapshot, so a guest
 * who adds a room sees the plan move. A stored plan would go stale silently,
 * which is the one thing a number on this screen must never do.
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PiggyBank, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RenovationPlanView } from '@/components/onboarding/RenovationPlanView';
import { buildRenovationPlan, detectPlanWorkType, type PlanInput } from '@/lib/renovationPlan';
import type { GuestRoom, GuestTask } from '@/types/guest.types';

interface Props {
  projectId: string;
  rooms: GuestRoom[];
  tasks: GuestTask[];
}

function formatSek(value: number): string {
  return new Intl.NumberFormat('sv-SE').format(Math.round(value));
}

export function GuestPlanCard({ projectId, rooms, tasks }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const input: PlanInput = useMemo(() => {
    const roomNameById = new Map(rooms.map((r) => [r.id, r.name]));
    return {
      rooms: rooms.map((r) => ({
        name: r.name,
        areaSqm: r.area_sqm ?? null,
        widthM: r.width_mm ? r.width_mm / 1000 : null,
        depthM: r.height_mm ? r.height_mm / 1000 : null,
        ceilingHeightMm: r.ceiling_height_mm ?? null,
      })),
      tasks: tasks.map((task) => ({
        workType: detectPlanWorkType(task.title),
        label: task.title,
        roomName: task.room_id ? roomNameById.get(task.room_id) ?? null : null,
      })),
      userType: 'homeowner',
    };
  }, [rooms, tasks]);

  const plan = useMemo(() => buildRenovationPlan(input), [input]);

  // Nothing to plan yet — an empty card would just be another empty state.
  if (tasks.length === 0 || rooms.length === 0 || plan.totalHigh <= 0) return null;

  return (
    <>
      <div className="rounded-xl border bg-gradient-to-br from-primary/5 to-transparent p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              {t('renovationPlan.title', 'Din renoveringsplan')}
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {formatSek(plan.totalLow)}–{formatSek(plan.totalHigh)} kr
              <span className="ml-2 align-middle text-xs font-normal text-muted-foreground">
                {plan.incVat
                  ? t('renovationPlan.incVat', 'ink. moms')
                  : t('renovationPlan.exVat', 'ex. moms')}
              </span>
            </div>
            {plan.rotHigh > 0 && (
              <div className="mt-1 flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
                <PiggyBank className="h-3.5 w-3.5" />
                {t('renovationPlan.rotShort', {
                  defaultValue: 'ROT ger tillbaka ca {{amount}} kr',
                  amount: formatSek(plan.rotHigh),
                })}
              </div>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            {t('renovationPlan.showFull', 'Visa hela planen')}
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="2xl" className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('renovationPlan.title', 'Din renoveringsplan')}</DialogTitle>
          </DialogHeader>
          <RenovationPlanView
            input={input}
            isGuest
            projectId={projectId}
            onOpenProject={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

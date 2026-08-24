/**
 * "Start from a drawing of an earlier renovation in this home" (S6).
 *
 * Walls do not move between renovations. The second project in a flat used to
 * start from an empty canvas, and someone redrew rooms that were already drawn
 * — the exact work the address entity exists to save.
 *
 * The copy is a snapshot, never a shared layer: last year's plan is a record of
 * last year's renovation, and this year's edits must not rewrite it. That is
 * also why it says "copy" and not "link".
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, History, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  listInheritablePlans,
  copyPlanToProject,
  type InheritablePlan,
} from '@/services/planInheritance';
import type { FloorMapPlan } from './types';

interface Props {
  projectId: string;
  /** Fires with the new plan once the copy is on disk. */
  onInherited: (plan: FloorMapPlan) => void;
  onError: (message: string) => void;
}

export function InheritPlanSection({ projectId, onInherited, onError }: Props) {
  const { t } = useTranslation();
  const [plans, setPlans] = useState<InheritablePlan[] | null>(null);
  const [copyingPlanId, setCopyingPlanId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listInheritablePlans(projectId).then((rows) => {
      if (!cancelled) setPlans(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (!plans || plans.length === 0) return null;

  const handleInherit = async (plan: InheritablePlan) => {
    setCopyingPlanId(plan.planId);
    const copied = await copyPlanToProject(plan.planId, projectId, plan.projectName || plan.planName);
    setCopyingPlanId(null);

    if (!copied) {
      onError(t('floormap.inherit.failed', 'Ritningen kunde inte kopieras'));
      return;
    }
    onInherited(copied);
  };

  return (
    <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
      <div className="flex items-start gap-2">
        <History className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {t('floormap.inherit.title', 'Utgå från en tidigare ritning')}
          </p>
          <p className="text-xs text-muted-foreground">
            {t(
              'floormap.inherit.body',
              'Väggarna står kvar mellan renoveringar. Kopian blir din egen — den tidigare ritningen ändras inte.'
            )}
          </p>
        </div>
      </div>

      <ul className="space-y-1.5">
        {plans.map((plan) => (
          <li
            key={plan.planId}
            className="flex items-center gap-2 rounded-md bg-background px-2.5 py-1.5"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">
                {plan.projectName || plan.planName}
              </span>
              <span className="block text-xs text-muted-foreground">
                {plan.projectDate && <>{plan.projectDate} · </>}
                {plan.roomCount > 0
                  ? t('floormap.inherit.rooms', {
                      count: plan.roomCount,
                      defaultValue: '{{count}} rum',
                    })
                  : t('floormap.inherit.shapes', {
                      count: plan.shapeCount,
                      defaultValue: '{{count}} objekt',
                    })}
              </span>
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={copyingPlanId !== null}
              onClick={() => handleInherit(plan)}
            >
              {copyingPlanId === plan.planId ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <>
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  {t('floormap.inherit.action', 'Kopiera hit')}
                </>
              )}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

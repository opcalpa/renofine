/**
 * "Din renoveringsplan" — what the guest gets back the moment the wizard is done.
 *
 * This screen replaces the old finish state ("Projekt skapat" + a five-step
 * tour of an empty project). It exists because the wizard's output used to
 * equal its input: rooms named after the rooms you typed, tasks named after the
 * trades you picked. Everything that makes an account worth creating — cost
 * range, ROT, trade order, what you forgot, what a builder will ask — is
 * computed here from the same draft, and shown BEFORE the ask.
 *
 * The whole plan is deterministic (`lib/renovationPlan.ts`). The single model
 * call is the critic, and it is strictly additive: it refines "what did I
 * forget" when it answers, and the deterministic list stands when it does not.
 * That way the screen costs nothing per visitor and still renders in full when
 * the rate limiter says no.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  HelpCircle,
  Loader2,
  PiggyBank,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { analytics, AnalyticsEvents } from '@/lib/analytics';
import { buildRenovationPlan, type PlanInput, type RenovationPlan } from '@/lib/renovationPlan';
import { fetchCriticFlags, type CriticFlagSuggestion } from '@/services/renaidaProjectIntake';

interface Props {
  input: PlanInput;
  /** Guests are asked to save the plan; signed-in users just open the project. */
  isGuest: boolean;
  projectId: string;
  onOpenProject: () => void;
}

function formatSek(value: number): string {
  return new Intl.NumberFormat('sv-SE').format(Math.round(value));
}

export function RenovationPlanView({ input, isGuest, projectId, onOpenProject }: Props) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const plan: RenovationPlan = useMemo(() => buildRenovationPlan(input), [input]);

  const [criticFlags, setCriticFlags] = useState<CriticFlagSuggestion[] | null>(null);
  const [criticLoading, setCriticLoading] = useState(true);

  useEffect(() => {
    analytics.capture(AnalyticsEvents.GUEST_PLAN_SHOWN, {
      is_guest: isGuest,
      room_count: plan.rooms.length,
      work_type_count: plan.workTypes.length,
      total_low: plan.totalLow,
      total_high: plan.totalHigh,
      user_type: input.userType,
    });
    // Fire once per plan screen, not on every critic state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    // ONE model call, already rate-limited server-side. Failure is silent by
    // design — the deterministic list below is a complete answer on its own.
    fetchCriticFlags({
      projectType: input.userType,
      rooms: input.rooms.map((r) => ({ name: r.name, areaSqm: r.areaSqm ?? null })),
      tasks: input.tasks.map((task) => ({
        workType: task.workType ?? 'annat',
        roomName: task.roomName,
        title: task.label,
      })),
      language: i18n.language?.slice(0, 2) || 'sv',
      userType: input.userType,
    })
      .then((flags) => {
        if (!cancelled) setCriticFlags(flags);
      })
      .finally(() => {
        if (!cancelled) setCriticLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = () => {
    analytics.capture(AnalyticsEvents.GUEST_PLAN_CTA_CLICKED, {
      is_guest: isGuest,
      cta: isGuest ? 'save_plan' : 'open_project',
      total_high: plan.totalHigh,
    });
    if (isGuest) {
      navigate(`/auth?mode=signup&redirect=${encodeURIComponent(`/projects/${projectId}`)}`);
      return;
    }
    onOpenProject();
  };

  const handleSecondary = () => {
    analytics.capture(AnalyticsEvents.GUEST_PLAN_CTA_CLICKED, { is_guest: isGuest, cta: 'open_project' });
    onOpenProject();
  };

  // The model's flags win when it answered; the deterministic list stands in
  // when it did not. Never both — two lists of "what you forgot" read as noise.
  const missingItems: Array<{ label: string; reason: string | null; roomName: string | null }> =
    criticFlags && criticFlags.length > 0
      ? criticFlags.map((f) => ({ label: f.label, reason: f.reason ?? null, roomName: f.roomName }))
      : plan.missing.map((m) => ({
          label: t(`renovationPlan.missing.${m.key}.label`),
          reason: t(`renovationPlan.missing.${m.key}.reason`),
          roomName: m.roomName,
        }));

  return (
    <div className="space-y-6">
      {/* Headline: the number they came for */}
      <div className="rounded-xl border bg-gradient-to-br from-primary/5 to-transparent p-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4 text-primary" />
          {t('renovationPlan.title', 'Din renoveringsplan')}
        </div>
        <div className="mt-2 text-3xl font-semibold tabular-nums">
          {formatSek(plan.totalLow)}–{formatSek(plan.totalHigh)} kr
          <span className="ml-2 align-middle text-sm font-normal text-muted-foreground">
            {plan.incVat
              ? t('renovationPlan.incVat', 'ink. moms')
              : t('renovationPlan.exVat', 'ex. moms')}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('renovationPlan.headlineDesc', {
            defaultValue: 'Uppskattat spann för {{rooms}} rum, {{weeks}} veckors arbete.',
            rooms: plan.rooms.length,
            weeks: plan.totalWeeks,
          })}
        </p>
      </div>

      {/* ROT — the number a homeowner never computes themselves */}
      {plan.rotHigh > 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-900 dark:text-emerald-200">
            <PiggyBank className="h-4 w-4" />
            {t('renovationPlan.rotTitle', 'ROT-avdrag')}
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-emerald-900 dark:text-emerald-200">
            {formatSek(plan.rotLow)}–{formatSek(plan.rotHigh)} kr
          </div>
          <p className="mt-1 text-sm text-emerald-800/80 dark:text-emerald-300/80">
            {plan.rotCapped
              ? t('renovationPlan.rotCapped', '30 % av arbetskostnaden. Taket är 50 000 kr per person och år.')
              : t('renovationPlan.rotDesc', '30 % av arbetskostnaden inklusive moms — det du får tillbaka.')}
          </p>
        </div>
      )}

      {/* Per room */}
      {plan.rooms.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">{t('renovationPlan.perRoom', 'Rum för rum')}</h3>
          <ul className="divide-y rounded-lg border">
            {plan.rooms.map((room) => (
              <li key={room.name} className="flex items-baseline justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {room.name || t('renovationPlan.wholeProperty', 'Hela bostaden')}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {room.areaSqm} m²
                    {room.areaAssumed && ` · ${t('renovationPlan.assumedArea', 'antagen yta')}`}
                    {room.hours > 0 && ` · ~${room.hours} h`}
                  </div>
                </div>
                <div className="shrink-0 text-right tabular-nums text-sm">
                  {formatSek(room.low)}–{formatSek(room.high)} kr
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Trade order as weeks */}
      {plan.phases.length > 0 && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <CalendarRange className="h-4 w-4 text-muted-foreground" />
            {t('renovationPlan.orderTitle', 'Ordningen yrkena kommer i')}
          </h3>
          <ol className="space-y-1.5">
            {plan.phases.map((phase) => (
              <li key={phase.key} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                <Badge variant="secondary" className="shrink-0 tabular-nums">
                  {phase.startWeek === phase.endWeek
                    ? t('renovationPlan.week', { defaultValue: 'v {{n}}', n: phase.startWeek })
                    : t('renovationPlan.weekRange', {
                        defaultValue: 'v {{from}}–{{to}}',
                        from: phase.startWeek,
                        to: phase.endWeek,
                      })}
                </Badge>
                <span className="text-sm">{t(`renovationPlan.phase.${phase.key}`)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* What you probably forgot */}
      <section className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          {t('renovationPlan.missingTitle', 'Det här glöms oftast bort')}
        </h3>
        {criticLoading ? (
          <div className="flex items-center gap-2 rounded-lg border px-3 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('renovationPlan.checking', 'Renaida granskar planen…')}
          </div>
        ) : missingItems.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
            <CheckCircle2 className="h-4 w-4" />
            {t('renovationPlan.nothingMissing', 'Inget kritiskt saknas — planen håller ihop.')}
          </div>
        ) : (
          <ul className="space-y-1.5">
            {missingItems.map((item, i) => (
              <li key={`${item.label}-${i}`} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/20">
                <div className="text-sm font-medium">
                  {item.label}
                  {item.roomName && (
                    <span className="ml-1 font-normal text-muted-foreground">· {item.roomName}</span>
                  )}
                </div>
                {item.reason && <div className="text-xs text-muted-foreground">{item.reason}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* What a builder will ask */}
      {plan.builderQuestions.length > 0 && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <HelpCircle className="h-4 w-4 text-muted-foreground" />
            {input.userType === 'contractor'
              ? t('renovationPlan.questionsTitleContractor', 'Det här behöver du fråga kunden')
              : t('renovationPlan.questionsTitle', 'Det här frågar en byggare dig')}
          </h3>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {plan.builderQuestions.map((key) => (
              <li key={key} className="flex gap-2">
                <span aria-hidden>·</span>
                <span>{t(`renovationPlan.question.${key}`)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Assumptions — every number it could not know, said out loud */}
      <p className="text-xs leading-relaxed text-muted-foreground">
        {plan.assumptions.map((key) => t(`renovationPlan.assumption.${key}`)).join(' ')}
      </p>

      {/* The ask, where the value is */}
      <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row-reverse sm:items-center">
        <Button onClick={handleSave} size="lg" className="gap-2">
          {isGuest ? (
            <>
              {t('renovationPlan.savePlan', 'Spara planen')}
              <ArrowRight className="h-4 w-4" />
            </>
          ) : (
            <>
              {t('renovationPlan.openProject', 'Öppna projektet')}
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
        {isGuest && (
          <Button variant="ghost" onClick={handleSecondary}>
            {t('renovationPlan.continueWithout', 'Fortsätt utan konto')}
          </Button>
        )}
      </div>
      {isGuest && (
        <p className="-mt-4 text-xs text-muted-foreground sm:text-right">
          {t('renovationPlan.saveHint', 'Planen ligger bara i den här webbläsaren tills du sparar den.')}
        </p>
      )}
    </div>
  );
}

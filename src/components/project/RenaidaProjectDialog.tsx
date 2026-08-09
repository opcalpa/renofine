/**
 * RenaidaProjectDialog — Renaida-led project creation (Phase 1).
 *
 * A leading, conditional conversation (left) where the project is born bit by
 * bit as a live preview (right) grows with each answer. Fully localized: all
 * copy comes from renaidaFlow.* i18n keys and task titles derive from the
 * (language-neutral) work type via the intake.workType.* labels. Role-gated
 * framing for homeowner vs contractor. Same draft feeds scaffoldProject.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowRight, Home, Hammer, Wallet, MapPin, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { scaffoldProject } from '@/services/scaffoldProject';
import type { WorkType } from '@/services/workTypeUtils';
import {
  emptyDraft,
  nextStep,
  applyAnswer,
  toScaffoldInput,
  taskTitle,
  PROJECT_TYPES,
  type ProjectDraft,
  type ProjectTypeId,
  type Step,
  type Answer,
  type UserType,
} from '@/services/renaidaProjectFlow';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Gates the framing (homeowner vs contractor). Defaults to homeowner. */
  userType?: UserType;
}

interface Turn {
  message: string;
  answerLabel: string;
}

export function RenaidaProjectDialog({ open, onOpenChange, userType = 'homeowner' }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<ProjectDraft>(emptyDraft());
  const [turns, setTurns] = useState<Turn[]>([]);
  const [multiSel, setMultiSel] = useState<string[]>([]);
  const [fieldValue, setFieldValue] = useState('');
  const [creating, setCreating] = useState(false);
  const convRef = useRef<HTMLDivElement>(null);

  /** Localized work-type label — the seam that keeps task titles translated. */
  const labelFor = useMemo(
    () => (wt: WorkType) => t(`intake.workType.${wt}`, wt),
    [t]
  );

  const roomLabel = draft.rooms[0]?.name;
  const step = useMemo(() => nextStep(draft, userType, roomLabel), [draft, userType, roomLabel]);
  const complete = !step;

  useEffect(() => {
    if (open) {
      setDraft(emptyDraft());
      setTurns([]);
      setMultiSel([]);
      setFieldValue('');
      setCreating(false);
    }
  }, [open]);

  useEffect(() => {
    convRef.current?.scrollTo({ top: convRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns.length, step?.id]);

  const messageOf = (s: Step) => t(s.messageKey, { ...(s.messageVars ?? {}) });

  const submit = (s: Step, answer: Answer, answerLabel: string) => {
    // The 'type' step seeds a localized room + project name into the draft.
    let labels: { roomName?: string; projectName?: string } | undefined;
    if (s.id === 'type' && answer.kind === 'chips') {
      const id = answer.ids[0] as ProjectTypeId;
      const meta = PROJECT_TYPES[id];
      if (meta) labels = { roomName: t(meta.roomNameKey), projectName: t(meta.nameKey) };
    }
    setTurns((tn) => [...tn, { message: messageOf(s), answerLabel }]);
    setDraft((d) => applyAnswer(s, answer, d, labels));
    setMultiSel([]);
    setFieldValue('');
  };

  const onChipSingle = (s: Step, id: string, label: string) =>
    submit(s, { kind: 'chips', ids: [id], labels: [label] }, label);

  const onMultiContinue = (s: Step) => {
    if (s.input.kind !== 'chips') return;
    const chosen = s.input.options.filter((o) => multiSel.includes(o.id));
    const labels = chosen.map((o) => t(o.labelKey));
    submit(s, { kind: 'chips', ids: chosen.map((o) => o.id), labels }, labels.join(', '));
  };

  const onFieldSubmit = (s: Step) => {
    if (s.input.kind === 'number') {
      const n = parseInt(fieldValue.replace(/\s/g, ''), 10);
      if (!Number.isFinite(n)) return;
      submit(s, { kind: 'number', value: n }, `${n.toLocaleString('sv-SE')} ${s.input.unit ?? ''}`.trim());
    } else if (s.input.kind === 'text') {
      if (!fieldValue.trim()) return;
      submit(s, { kind: 'text', value: fieldValue.trim() }, fieldValue.trim());
    }
  };

  const onSkip = (s: Step) => {
    const key = 'skipKey' in s.input ? s.input.skipKey : undefined;
    submit(s, { kind: 'skip' }, key ? t(key) : t('renaidaFlow.skip.skip'));
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error(t('renaidaFlow.err.notLoggedIn', 'Du behöver vara inloggad för att skapa projektet'));
        setCreating(false);
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();
      if (!profile) {
        toast.error(t('renaidaFlow.err.noProfile', 'Kunde inte hitta din profil'));
        setCreating(false);
        return;
      }
      const result = await scaffoldProject(toScaffoldInput(draft, labelFor), profile.id);
      toast.success(t('renaidaFlow.err.created', 'Projektet är skapat! 🎉'));
      onOpenChange(false);
      navigate(`/projects/${result.projectId}`);
    } catch (err) {
      console.error('RenaidaProjectDialog: create failed', err);
      toast.error(t('renaidaFlow.err.failed', 'Kunde inte skapa projektet'));
      setCreating(false);
    }
  };

  const room = draft.rooms[0];
  const taskCount = draft.tasks.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl gap-0 overflow-hidden p-0 sm:h-[640px]">
        <div className="grid h-full grid-cols-1 md:grid-cols-[1fr_minmax(280px,340px)]">
          {/* ── Conversation ── */}
          <div className="flex min-h-0 flex-col border-r">
            <div className="flex items-center gap-2 border-b px-5 py-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <div className="text-sm font-semibold">{t('renaidaFlow.ui.title')}</div>
                <div className="text-[11px] text-muted-foreground">{t('renaidaFlow.ui.tagline')}</div>
              </div>
            </div>

            <div ref={convRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {turns.map((turn, i) => (
                <div key={i} className="space-y-2">
                  <RenaidaBubble>{turn.message}</RenaidaBubble>
                  <div className="flex justify-end">
                    <span className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
                      {turn.answerLabel}
                    </span>
                  </div>
                </div>
              ))}

              {step && (
                <div className="space-y-3 animate-in fade-in slide-in-from-bottom-1">
                  <RenaidaBubble>{messageOf(step)}</RenaidaBubble>
                  <StepInputView
                    step={step}
                    multiSel={multiSel}
                    setMultiSel={setMultiSel}
                    fieldValue={fieldValue}
                    setFieldValue={setFieldValue}
                    onChipSingle={onChipSingle}
                    onMultiContinue={onMultiContinue}
                    onFieldSubmit={onFieldSubmit}
                    onSkip={onSkip}
                  />
                </div>
              )}

              {complete && (
                <div className="space-y-3 animate-in fade-in slide-in-from-bottom-1">
                  <RenaidaBubble>{t('renaidaFlow.complete')}</RenaidaBubble>
                  <Button className="w-full" onClick={handleCreate} disabled={creating}>
                    {creating ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="mr-2 h-4 w-4" />
                    )}
                    {t('renaidaFlow.ui.create')}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* ── Live preview ── */}
          <div className="hidden min-h-0 flex-col bg-muted/30 md:flex">
            <div className="border-b px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('renaidaFlow.ui.growing')}
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t('renaidaFlow.ui.section.project')}
                </div>
                <div className="mt-0.5 text-base font-semibold">
                  {draft.projectName || (
                    <span className="text-muted-foreground/60">{t('renaidaFlow.ui.namePending')}</span>
                  )}
                </div>
                {draft.address && (
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" /> {draft.address}
                  </div>
                )}
              </div>

              {room && (
                <PreviewSection icon={<Home className="h-3.5 w-3.5" />} label={t('renaidaFlow.ui.section.rooms')}>
                  <div className="flex items-center justify-between rounded-md bg-background px-2.5 py-1.5 text-sm animate-in fade-in slide-in-from-bottom-1">
                    <span>{room.name}</span>
                    {room.areaSqm ? <span className="text-xs text-muted-foreground">{room.areaSqm} m²</span> : null}
                  </div>
                </PreviewSection>
              )}

              {taskCount > 0 && (
                <PreviewSection
                  icon={<Hammer className="h-3.5 w-3.5" />}
                  label={`${t('renaidaFlow.ui.section.tasks')} (${taskCount})`}
                >
                  <div className="space-y-1.5">
                    {draft.tasks.map((task, i) => (
                      <div
                        key={task.workType + i}
                        className="rounded-md bg-background px-2.5 py-1.5 text-sm animate-in fade-in slide-in-from-bottom-1"
                        style={{ animationDelay: `${i * 40}ms` }}
                      >
                        {taskTitle(task, labelFor)}
                      </div>
                    ))}
                  </div>
                </PreviewSection>
              )}

              {draft.totalBudget ? (
                <PreviewSection icon={<Wallet className="h-3.5 w-3.5" />} label={t('renaidaFlow.ui.section.budget')}>
                  <div className="rounded-md bg-background px-2.5 py-1.5 text-sm animate-in fade-in slide-in-from-bottom-1">
                    {draft.totalBudget.toLocaleString('sv-SE')} kr
                  </div>
                </PreviewSection>
              ) : null}

              {!room && taskCount === 0 && (
                <div className="pt-8 text-center text-sm text-muted-foreground/70">
                  {t('renaidaFlow.ui.emptyPreview')}
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Sub-views ────────────────────────────────────────────────────────────

function RenaidaBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Sparkles className="h-3 w-3" />
      </span>
      <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-muted px-3 py-2 text-sm">{children}</div>
    </div>
  );
}

function PreviewSection({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      {children}
    </div>
  );
}

function StepInputView({
  step,
  multiSel,
  setMultiSel,
  fieldValue,
  setFieldValue,
  onChipSingle,
  onMultiContinue,
  onFieldSubmit,
  onSkip,
}: {
  step: Step;
  multiSel: string[];
  setMultiSel: (ids: string[]) => void;
  fieldValue: string;
  setFieldValue: (v: string) => void;
  onChipSingle: (step: Step, id: string, label: string) => void;
  onMultiContinue: (step: Step) => void;
  onFieldSubmit: (step: Step) => void;
  onSkip: (step: Step) => void;
}) {
  const { t } = useTranslation();

  if (step.input.kind === 'chips') {
    const { options, multi, skipKey } = step.input;
    if (!multi) {
      return (
        <div className="flex flex-wrap gap-2 pl-8">
          {options.map((o) => (
            <button
              key={o.id}
              onClick={() => onChipSingle(step, o.id, t(o.labelKey))}
              className="rounded-full border bg-background px-3.5 py-1.5 text-sm transition-colors hover:border-primary hover:bg-primary/5"
            >
              {t(o.labelKey)}
            </button>
          ))}
        </div>
      );
    }
    return (
      <div className="space-y-2.5 pl-8">
        <div className="flex flex-wrap gap-2">
          {options.map((o) => {
            const on = multiSel.includes(o.id);
            return (
              <button
                key={o.id}
                onClick={() => setMultiSel(on ? multiSel.filter((x) => x !== o.id) : [...multiSel, o.id])}
                className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                  on
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'bg-background hover:border-primary hover:bg-primary/5'
                }`}
              >
                {on && <Check className="mr-1 inline h-3 w-3" />}
                {t(o.labelKey)}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => onMultiContinue(step)} disabled={multiSel.length === 0}>
            {t('renaidaFlow.ui.continue')} <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
          {skipKey && (
            <Button size="sm" variant="ghost" onClick={() => onSkip(step)}>
              {t(skipKey)}
            </Button>
          )}
        </div>
      </div>
    );
  }

  const unit = step.input.kind === 'number' ? step.input.unit : undefined;
  const placeholderKey = step.input.placeholderKey;
  const skipKey = step.input.skipKey;
  return (
    <div className="flex items-center gap-2 pl-8">
      <div className="relative flex-1">
        <Input
          autoFocus
          type={step.input.kind === 'number' ? 'number' : 'text'}
          inputMode={step.input.kind === 'number' ? 'numeric' : undefined}
          placeholder={placeholderKey ? t(placeholderKey) : undefined}
          value={fieldValue}
          onChange={(e) => setFieldValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onFieldSubmit(step);
          }}
          className={unit ? 'pr-10' : undefined}
        />
        {unit && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {unit}
          </span>
        )}
      </div>
      <Button size="sm" onClick={() => onFieldSubmit(step)} disabled={!fieldValue.trim()}>
        <ArrowRight className="h-3.5 w-3.5" />
      </Button>
      {skipKey && (
        <Button size="sm" variant="ghost" onClick={() => onSkip(step)}>
          {t(skipKey)}
        </Button>
      )}
    </div>
  );
}

/**
 * RenaidaProjectDialog — Phase 0 of the Renaida-led project creation.
 *
 * A leading, conditional conversation (left) where the project is born bit by
 * bit as a live preview (right) grows with each answer — instead of asking the
 * user to describe everything in one freetext box. Deterministic flow for now
 * (see renaidaProjectFlow.ts); the same draft feeds the shared scaffoldProject
 * engine on finish.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowRight, Home, Hammer, Wallet, MapPin, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { scaffoldProject } from '@/services/scaffoldProject';
import {
  emptyDraft,
  nextStep,
  applyAnswer,
  toScaffoldInput,
  type ProjectDraft,
  type Step,
  type Answer,
} from '@/services/renaidaProjectFlow';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Turn {
  message: string;
  answerLabel: string;
}

export function RenaidaProjectDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<ProjectDraft>(emptyDraft());
  const [turns, setTurns] = useState<Turn[]>([]);
  const [multiSel, setMultiSel] = useState<string[]>([]);
  const [fieldValue, setFieldValue] = useState('');
  const [creating, setCreating] = useState(false);
  const convRef = useRef<HTMLDivElement>(null);

  const step = useMemo(() => nextStep(draft), [draft]);
  const complete = !step;

  // Fresh start each time it opens.
  useEffect(() => {
    if (open) {
      setDraft(emptyDraft());
      setTurns([]);
      setMultiSel([]);
      setFieldValue('');
      setCreating(false);
    }
  }, [open]);

  // Keep the newest message in view.
  useEffect(() => {
    convRef.current?.scrollTo({ top: convRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns.length, step?.id]);

  const submit = (step: Step, answer: Answer, answerLabel: string) => {
    setTurns((t) => [...t, { message: step.message, answerLabel }]);
    setDraft((d) => applyAnswer(step, answer, d));
    setMultiSel([]);
    setFieldValue('');
  };

  const onChipSingle = (step: Step, id: string, label: string) =>
    submit(step, { kind: 'chips', ids: [id], labels: [label] }, label);

  const onMultiContinue = (step: Step) => {
    if (step.input.kind !== 'chips') return;
    const labels = step.input.options.filter((o) => multiSel.includes(o.id)).map((o) => o.label);
    submit(step, { kind: 'chips', ids: multiSel, labels }, labels.join(', '));
  };

  const onFieldSubmit = (step: Step) => {
    if (step.input.kind === 'number') {
      const n = parseInt(fieldValue.replace(/\s/g, ''), 10);
      if (!Number.isFinite(n)) return;
      submit(step, { kind: 'number', value: n }, `${n.toLocaleString('sv-SE')} ${step.input.unit ?? ''}`.trim());
    } else if (step.input.kind === 'text') {
      if (!fieldValue.trim()) return;
      submit(step, { kind: 'text', value: fieldValue.trim() }, fieldValue.trim());
    }
  };

  const onSkip = (step: Step) => {
    const label = ('skipLabel' in step.input && step.input.skipLabel) || 'Hoppa över';
    submit(step, { kind: 'skip' }, label);
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Du behöver vara inloggad för att skapa projektet');
        setCreating(false);
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();
      if (!profile) {
        toast.error('Kunde inte hitta din profil');
        setCreating(false);
        return;
      }
      const result = await scaffoldProject(toScaffoldInput(draft), profile.id);
      toast.success('Projektet är skapat! 🎉');
      onOpenChange(false);
      navigate(`/projects/${result.projectId}`);
    } catch (err) {
      console.error('RenaidaProjectDialog: create failed', err);
      toast.error('Kunde inte skapa projektet');
      setCreating(false);
    }
  };

  const taskCount = draft.tasks.length;
  const room = draft.rooms[0];

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
                <div className="text-sm font-semibold">Skapa med Renaida</div>
                <div className="text-[11px] text-muted-foreground">
                  Beta — svara på några frågor så bygger vi projektet ihop
                </div>
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
                  <RenaidaBubble>{step.message}</RenaidaBubble>
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
                  <RenaidaBubble>
                    Perfekt — då har jag allt jag behöver. Ditt projekt är redo att skapas. Du kan
                    justera allt efteråt.
                  </RenaidaBubble>
                  <Button className="w-full" onClick={handleCreate} disabled={creating}>
                    {creating ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="mr-2 h-4 w-4" />
                    )}
                    Skapa projektet
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* ── Live preview ── */}
          <div className="hidden min-h-0 flex-col bg-muted/30 md:flex">
            <div className="border-b px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Ditt projekt växer fram
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Projekt</div>
                <div className="mt-0.5 text-base font-semibold">
                  {draft.projectName || <span className="text-muted-foreground/60">Namnges snart…</span>}
                </div>
                {draft.address && (
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" /> {draft.address}
                  </div>
                )}
              </div>

              {room && (
                <PreviewSection icon={<Home className="h-3.5 w-3.5" />} label="Rum">
                  <div className="flex items-center justify-between rounded-md bg-background px-2.5 py-1.5 text-sm animate-in fade-in slide-in-from-bottom-1">
                    <span>{room.name}</span>
                    {room.areaSqm ? (
                      <span className="text-xs text-muted-foreground">{room.areaSqm} m²</span>
                    ) : null}
                  </div>
                </PreviewSection>
              )}

              {taskCount > 0 && (
                <PreviewSection
                  icon={<Hammer className="h-3.5 w-3.5" />}
                  label={`Arbeten (${taskCount})`}
                >
                  <div className="space-y-1.5">
                    {draft.tasks.map((t, i) => (
                      <div
                        key={t.title}
                        className="rounded-md bg-background px-2.5 py-1.5 text-sm animate-in fade-in slide-in-from-bottom-1"
                        style={{ animationDelay: `${i * 40}ms` }}
                      >
                        {t.title}
                      </div>
                    ))}
                  </div>
                </PreviewSection>
              )}

              {draft.totalBudget ? (
                <PreviewSection icon={<Wallet className="h-3.5 w-3.5" />} label="Budget">
                  <div className="rounded-md bg-background px-2.5 py-1.5 text-sm animate-in fade-in slide-in-from-bottom-1">
                    {draft.totalBudget.toLocaleString('sv-SE')} kr
                  </div>
                </PreviewSection>
              ) : null}

              {!room && taskCount === 0 && (
                <div className="pt-8 text-center text-sm text-muted-foreground/70">
                  Svara på Renaidas frågor så dyker rum, arbeten och budget upp här.
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
  if (step.input.kind === 'chips') {
    const { options, multi, skipLabel } = step.input;
    if (!multi) {
      return (
        <div className="flex flex-wrap gap-2 pl-8">
          {options.map((o) => (
            <button
              key={o.id}
              onClick={() => onChipSingle(step, o.id, o.label)}
              className="rounded-full border bg-background px-3.5 py-1.5 text-sm transition-colors hover:border-primary hover:bg-primary/5"
            >
              {o.label}
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
                {o.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => onMultiContinue(step)} disabled={multiSel.length === 0}>
            Fortsätt <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
          {skipLabel && (
            <Button size="sm" variant="ghost" onClick={() => onSkip(step)}>
              {skipLabel}
            </Button>
          )}
        </div>
      </div>
    );
  }

  // number / text
  const unit = step.input.kind === 'number' ? step.input.unit : undefined;
  return (
    <div className="flex items-center gap-2 pl-8">
      <div className="relative flex-1">
        <Input
          autoFocus
          type={step.input.kind === 'number' ? 'number' : 'text'}
          inputMode={step.input.kind === 'number' ? 'numeric' : undefined}
          placeholder={step.input.placeholder}
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
      {step.input.skipLabel && (
        <Button size="sm" variant="ghost" onClick={() => onSkip(step)}>
          {step.input.skipLabel}
        </Button>
      )}
    </div>
  );
}

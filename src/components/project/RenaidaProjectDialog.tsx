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
import {
  Sparkles, ArrowRight, Home, Hammer, Wallet, MapPin, Loader2, Check, Camera,
  MessageSquare, FileText, PenTool, X, RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DictationTextarea } from '@/components/shared/DictationTextarea';
import { supabase } from '@/integrations/supabase/client';
import { createGuestProjectFromGuidedSetup, canCreateGuestProject } from '@/services/guestStorageService';
import { compressImage } from '@/lib/compressImage';
import { analytics, AnalyticsEvents, ProjectCreationMethod } from '@/lib/analytics';
import { scaffoldProject } from '@/services/scaffoldProject';
import { parseProjectDescription, fetchAddonSuggestions } from '@/services/renaidaProjectIntake';
import type { WorkType } from '@/services/workTypeUtils';
import {
  emptyDraft,
  nextStep,
  applyAnswer,
  toScaffoldInput,
  taskTitle,
  seedDraftFromParse,
  deterministicAddons,
  applyAddonWorkTypes,
  PROJECT_TYPES,
  type ProjectDraft,
  type ProjectTypeId,
  type Step,
  type Answer,
  type UserType,
  type Provenance,
} from '@/services/renaidaProjectFlow';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Gates the framing (homeowner vs contractor). Defaults to homeowner. */
  userType?: UserType;
  /** Guests create local (localStorage) projects and can't use server voice. */
  isGuest?: boolean;
}

/** Read a file as base64 (data-URI prefix stripped) for edge-function upload. */
function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

interface Turn {
  message: string;
  answerLabel: string;
}

export function RenaidaProjectDialog({ open, onOpenChange, userType = 'homeowner', isGuest = false }: Props) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<ProjectDraft>(emptyDraft());
  const [turns, setTurns] = useState<Turn[]>([]);
  const [multiSel, setMultiSel] = useState<string[]>([]);
  const [fieldValue, setFieldValue] = useState('');
  const [creating, setCreating] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [addonOptions, setAddonOptions] = useState<
    Array<{ id: string; label: string; workTypes: WorkType[] }> | null
  >(null);
  const [addonsLoading, setAddonsLoading] = useState(false);
  const convRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // ── Phase-3 funnel instrumentation ──
  // Refs (not state) so firing analytics never triggers re-renders. `snapshot`
  // mirrors the latest draft each render so the close/abandon effect can read
  // fresh values without stale-closure bugs.
  const describeUsedRef = useRef(false);
  const addonsSelectedRef = useRef(0);
  const createdRef = useRef(false);
  const prevOpenRef = useRef(false);
  const completedFiredRef = useRef(false);
  const addonsShownFiredRef = useRef(false);
  const snapshotRef = useRef({ stepId: 'type' as string, rooms: 0, tasks: 0 });

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
      setParsing(false);
      setAddonOptions(null);
      setAddonsLoading(false);
      describeUsedRef.current = false;
      addonsSelectedRef.current = 0;
      createdRef.current = false;
      completedFiredRef.current = false;
      addonsShownFiredRef.current = false;
      snapshotRef.current = { stepId: 'type', rooms: 0, tasks: 0 };
    }
  }, [open]);

  // Keep a fresh snapshot for the abandon event (runs every render, no deps).
  useEffect(() => {
    snapshotRef.current = {
      stepId: step?.id ?? 'complete',
      rooms: draft.rooms.length,
      tasks: draft.tasks.length,
    };
  });

  // Funnel: dialog opened → started; closed without creating → abandoned.
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      analytics.capture(AnalyticsEvents.RENAIDA_PROJECT_STARTED, { user_type: userType });
    } else if (!open && prevOpenRef.current) {
      if (!createdRef.current) {
        const s = snapshotRef.current;
        analytics.capture(AnalyticsEvents.RENAIDA_PROJECT_ABANDONED, {
          user_type: userType,
          last_step: s.stepId,
          room_count: s.rooms,
          task_count: s.tasks,
          describe_used: describeUsedRef.current,
        });
      }
    }
    prevOpenRef.current = open;
  }, [open, userType]);

  // Funnel: reached the end of the conversation (ready to create).
  useEffect(() => {
    if (!open || !complete || completedFiredRef.current) return;
    if (draft.rooms.length === 0 && draft.tasks.length === 0) return;
    completedFiredRef.current = true;
    analytics.capture(AnalyticsEvents.RENAIDA_PROJECT_COMPLETED, {
      user_type: userType,
      room_count: draft.rooms.length,
      task_count: draft.tasks.length,
      has_budget: Boolean(draft.totalBudget),
      has_address: Boolean(draft.address),
      describe_used: describeUsedRef.current,
      addons_selected: addonsSelectedRef.current,
    });
  }, [open, complete, draft, userType]);

  // When we reach the add-ons step, fetch LLM suggestions once; fall back to
  // the curated list if the function returns nothing.
  useEffect(() => {
    if (step?.id !== 'addons' || addonOptions !== null || addonsLoading || !draft.projectType) return;
    let cancelled = false;
    setAddonsLoading(true);
    fetchAddonSuggestions({
      projectType: draft.projectType,
      rooms: draft.rooms.map((r) => r.name),
      existingWorkTypes: [...new Set(draft.tasks.map((t) => t.workType))],
      language: i18n.language,
      userType,
    })
      .then((llm) => {
        if (cancelled) return;
        const source = llm.length > 0 ? 'llm' : 'deterministic';
        if (llm.length > 0) {
          setAddonOptions(llm.map((s, i) => ({ id: `llm-${i}`, label: s.label, workTypes: [s.workType] })));
        } else {
          const type = draft.projectType!;
          setAddonOptions(
            deterministicAddons(type).map((a) => ({ id: a.id, label: t(a.labelKey), workTypes: a.workTypes }))
          );
        }
        if (!addonsShownFiredRef.current) {
          addonsShownFiredRef.current = true;
          analytics.capture(AnalyticsEvents.RENAIDA_PROJECT_ADDONS_SHOWN, {
            user_type: userType,
            source,
            project_type: draft.projectType,
          });
        }
      })
      .finally(() => {
        if (!cancelled) setAddonsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [step?.id, addonOptions, addonsLoading, draft.projectType, draft.rooms, draft.tasks, i18n.language, userType, t]);

  const messageOf = (s: Step) => t(s.messageKey, { ...(s.messageVars ?? {}) });

  /**
   * Jumpstart core: any modality (typed, dictated, or photographed) converges
   * to text → the same LLM parse → the same draft seeder. `answerLabel` is what
   * shows in the transcript as the user's turn.
   */
  const seedFromDescription = async (
    s: Step,
    text: string,
    via: 'text' | 'photo',
    answerLabel: string
  ) => {
    const parsed = await parseProjectDescription(text, i18n.language);
    describeUsedRef.current = true;
    analytics.capture(AnalyticsEvents.RENAIDA_PROJECT_DESCRIBE_USED, {
      user_type: userType,
      parsed: Boolean(parsed),
      via,
    });
    setFieldValue('');
    setTurns((tn) => [...tn, { message: messageOf(s), answerLabel }]);

    if (parsed) {
      const seeded = seedDraftFromParse(parsed, applyAnswer(s, { kind: 'skip' }, draft), {
        defaultName: t('renaidaFlow.name.other'),
        sourceKind: via === 'photo' ? 'photo' : 'describe',
      });
      if (seeded) {
        setDraft(seeded);
        setTurns((tn) => [
          ...tn,
          {
            message: t('renaidaFlow.seeded', {
              rooms: seeded.rooms.length,
              tasks: seeded.tasks.length,
            }),
            answerLabel: '',
          },
        ]);
        return;
      }
    }
    // Nothing usable → fall back to the guided questions.
    setDraft((d) => applyAnswer(s, { kind: 'skip' }, d));
    setTurns((tn) => [...tn, { message: t('renaidaFlow.couldntParse'), answerLabel: '' }]);
  };

  /** Free-text jumpstart (typed or dictated — voice fills the same field). */
  const onDescribeSubmit = async (s: Step) => {
    const text = fieldValue.trim();
    if (!text || parsing) return;
    setParsing(true);
    await seedFromDescription(s, text, 'text', text);
    setParsing(false);
  };

  /** OCR one image → its extracted text ('' on any failure). */
  const extractPhotoText = async (file: File): Promise<string> => {
    try {
      const compressed = await compressImage(file, { maxDimension: 1600 });
      const base64 = await fileToBase64(compressed);
      const { data, error } = await supabase.functions.invoke('extract-document-text', {
        body: {
          fileBase64: base64,
          mimeType: (compressed as Blob).type || file.type || 'image/jpeg',
          fileName: file.name,
        },
      });
      if (error) return '';
      return ((data as { text?: string } | null)?.text ?? '').trim();
    } catch {
      return '';
    }
  };

  /**
   * Photo jumpstart: OCR one or several images in parallel, feed the combined
   * text through the same parser. Lets a beginner snap a few phone photos
   * (a room, a scribbled sketch, a paper quote) and get a drafted project.
   */
  const onPhotosSelect = async (s: Step, files: FileList | null) => {
    const list = files ? Array.from(files) : [];
    if (list.length === 0 || parsing) return;
    setParsing(true);
    try {
      const texts = await Promise.all(list.map(extractPhotoText));
      const readCount = texts.filter(Boolean).length;
      const combined = texts.filter(Boolean).join('\n\n');
      if (!combined) {
        toast.error(
          t('renaidaFlow.photoUnreadable', 'Kunde inte läsa fotot — prova igen, skriv eller prata.')
        );
        return;
      }
      const label =
        readCount > 1
          ? `📷 ${t('renaidaFlow.photosAdded', '{{count}} foton tolkade', { count: readCount })}`
          : `📷 ${t('renaidaFlow.photoAdded', 'Foto tolkat')}`;
      await seedFromDescription(s, combined, 'photo', label);
    } catch (err) {
      console.error('RenaidaProjectDialog: photo extract failed', err);
      toast.error(t('renaidaFlow.photoFailed', 'Kunde inte tolka fotot'));
    } finally {
      setParsing(false);
    }
  };

  useEffect(() => {
    convRef.current?.scrollTo({ top: convRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns.length, step?.id]);

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

  const onAddonsContinue = (s: Step) => {
    const chosen = (addonOptions ?? []).filter((o) => multiSel.includes(o.id));
    if (chosen.length === 0) return;
    setTurns((tn) => [...tn, { message: messageOf(s), answerLabel: chosen.map((o) => o.label).join(', ') }]);
    setDraft((d) => applyAddonWorkTypes(d, chosen.map((o) => o.workTypes)));
    addonsSelectedRef.current = chosen.length;
    setMultiSel([]);
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
      // Guests get a local (localStorage) project — same conversational birth,
      // migrated to their account on signup. No server scaffold / profile.
      if (isGuest) {
        if (!canCreateGuestProject()) {
          toast.error(t('guest.projectLimit', 'Gästläge är begränsat till några projekt.'));
          setCreating(false);
          return;
        }
        const result = createGuestProjectFromGuidedSetup({
          projectName: draft.projectName?.trim() || t('renaidaFlow.name.other'),
          address: draft.address,
          rooms: draft.rooms.map((r) => ({
            name: r.name,
            area_sqm: r.areaSqm ?? undefined,
            ceiling_height_mm: r.ceilingHeightMm ?? undefined,
          })),
          tasks: draft.tasks
            .filter((task) => !task.excluded)
            .map((task) => ({
              workTypeLabel: taskTitle(task, labelFor),
              roomName: task.roomName,
            })),
        });
        if (!result) {
          toast.error(t('guest.projectLimit', 'Gästläge är begränsat till några projekt.'));
          setCreating(false);
          return;
        }
        createdRef.current = true;
        // Guests can't activate — keep them out of the activation funnel (no project_created).
        toast.success(t('renaidaFlow.err.created', 'Projektet är skapat! 🎉'));
        onOpenChange(false);
        navigate(`/projects/${result.projectId}`);
        return;
      }

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
      createdRef.current = true;
      analytics.capture(AnalyticsEvents.PROJECT_CREATED, {
        creation_method: ProjectCreationMethod.RENAIDA_DIALOG,
        user_type: userType,
        room_count: draft.rooms.length,
        task_count: draft.tasks.length,
        has_budget: Boolean(draft.totalBudget),
        has_address: Boolean(draft.address),
        describe_used: describeUsedRef.current,
        addons_selected: addonsSelectedRef.current,
      });
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
  const taskCount = draft.tasks.filter((tk) => !tk.excluded).length;

  /** Reversibly include/exclude a task during review (source-chip panel). */
  const toggleTaskExcluded = (index: number) => {
    setDraft((d) => ({
      ...d,
      tasks: d.tasks.map((tk, i) => (i === index ? { ...tk, excluded: !tk.excluded } : tk)),
    }));
  };

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
                  {turn.message && <RenaidaBubble>{turn.message}</RenaidaBubble>}
                  {turn.answerLabel && (
                    <div className="flex justify-end">
                      <span className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
                        {turn.answerLabel}
                      </span>
                    </div>
                  )}
                </div>
              ))}

              {step && (
                <div className="space-y-3 animate-in fade-in slide-in-from-bottom-1">
                  <RenaidaBubble>{messageOf(step)}</RenaidaBubble>
                  {step.id === 'describe' ? (
                    <div className="space-y-2 pl-8">
                      <DictationTextarea
                        autoFocus
                        hideVoice={isGuest}
                        minHeightClass="min-h-[92px]"
                        placeholder={
                          step.input.kind === 'text' && step.input.placeholderKey
                            ? t(step.input.placeholderKey)
                            : undefined
                        }
                        value={fieldValue}
                        disabled={parsing}
                        onChange={setFieldValue}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onDescribeSubmit(step);
                        }}
                      />
                      <div className="flex items-center gap-2">
                        <Button size="sm" onClick={() => onDescribeSubmit(step)} disabled={!fieldValue.trim() || parsing}>
                          {parsing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                          {parsing ? t('renaidaFlow.parsing') : t('renaidaFlow.ui.continue')}
                        </Button>
                        <input
                          ref={photoInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            void onPhotosSelect(step, e.target.files);
                            e.target.value = '';
                          }}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => photoInputRef.current?.click()}
                          disabled={parsing}
                          title={t('renaidaFlow.photo', 'Fota anteckning/underlag')}
                        >
                          <Camera className="h-3.5 w-3.5 sm:mr-1" />
                          <span className="hidden sm:inline">{t('renaidaFlow.photo', 'Foto')}</span>
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => onSkip(step)} disabled={parsing}>
                          {step.input.kind === 'text' && step.input.skipKey
                            ? t(step.input.skipKey)
                            : t('renaidaFlow.skip.skip')}
                        </Button>
                      </div>
                    </div>
                  ) : step.id === 'addons' ? (
                    <div className="space-y-2.5 pl-8">
                      {addonsLoading || addonOptions === null ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          {t('renaidaFlow.suggesting')}
                        </div>
                      ) : (
                        <>
                          <div className="flex flex-wrap gap-2">
                            {addonOptions.map((o) => {
                              const on = multiSel.includes(o.id);
                              return (
                                <button
                                  key={o.id}
                                  onClick={() =>
                                    setMultiSel(on ? multiSel.filter((x) => x !== o.id) : [...multiSel, o.id])
                                  }
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
                            <Button size="sm" onClick={() => onAddonsContinue(step)} disabled={multiSel.length === 0}>
                              {t('renaidaFlow.ui.continue')} <ArrowRight className="ml-1 h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => onSkip(step)}>
                              {t('renaidaFlow.skip.none')}
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
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
                  )}
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
                  <div className="flex items-center justify-between gap-2 rounded-md bg-background px-2.5 py-1.5 text-sm animate-in fade-in slide-in-from-bottom-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <SourceChip source={room.source} />
                      <span className="truncate">{room.name}</span>
                    </span>
                    {room.areaSqm ? <span className="flex-shrink-0 text-xs text-muted-foreground">{room.areaSqm} m²</span> : null}
                  </div>
                </PreviewSection>
              )}

              {draft.tasks.length > 0 && (
                <PreviewSection
                  icon={<Hammer className="h-3.5 w-3.5" />}
                  label={`${t('renaidaFlow.ui.section.tasks')} (${taskCount})`}
                >
                  <div className="space-y-1.5">
                    {draft.tasks.map((task, i) => (
                      <div
                        key={task.workType + i}
                        className={`group flex items-center justify-between gap-2 rounded-md bg-background px-2.5 py-1.5 text-sm animate-in fade-in slide-in-from-bottom-1 ${
                          task.excluded ? 'opacity-50' : ''
                        }`}
                        style={{ animationDelay: `${i * 40}ms` }}
                      >
                        <span className={`flex min-w-0 items-center gap-1.5 ${task.excluded ? 'line-through' : ''}`}>
                          <SourceChip source={task.source} />
                          <span className="truncate">{taskTitle(task, labelFor)}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleTaskExcluded(i)}
                          className="flex-shrink-0 text-muted-foreground/50 transition-opacity hover:text-foreground md:opacity-0 md:group-hover:opacity-100"
                          title={task.excluded ? t('renaidaFlow.include', 'Ta med igen') : t('renaidaFlow.exclude', 'Ta bort')}
                          aria-label={task.excluded ? t('renaidaFlow.include', 'Ta med igen') : t('renaidaFlow.exclude', 'Ta bort')}
                        >
                          {task.excluded ? <RotateCcw className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                        </button>
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

/** Tiny provenance icon — shows where a draft line came from (hover for detail). */
function SourceChip({ source }: { source?: Provenance }) {
  const { t } = useTranslation();
  if (!source) return null;
  const map = {
    answer: { Icon: MessageSquare, key: 'renaidaFlow.source.answer', fb: 'Ditt svar' },
    describe: { Icon: MessageSquare, key: 'renaidaFlow.source.describe', fb: 'Din beskrivning' },
    photo: { Icon: Camera, key: 'renaidaFlow.source.photo', fb: 'Från foto' },
    document: { Icon: FileText, key: 'renaidaFlow.source.document', fb: 'Från dokument' },
    floorplan: { Icon: PenTool, key: 'renaidaFlow.source.floorplan', fb: 'Från ritning' },
    suggestion: { Icon: Sparkles, key: 'renaidaFlow.source.suggestion', fb: 'Renaidas förslag' },
  } as const;
  const m = map[source.kind];
  if (!m) return null;
  const base = t(m.key, m.fb);
  const label = source.fileName ? `${base}: ${source.fileName}` : base;
  const { Icon } = m;
  return (
    <span title={label} aria-label={label} className="flex-shrink-0 text-muted-foreground/50">
      <Icon className="h-3 w-3" />
    </span>
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

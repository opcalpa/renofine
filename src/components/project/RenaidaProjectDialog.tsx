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
  MessageSquare, FileText, PenTool, X, RotateCcw, FolderUp, User, Calculator,
  ShieldAlert, Pencil, Play, ClipboardList, ShoppingCart, ChevronDown, CalendarCheck,
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
import { activateProject } from '@/services/activateProject';
import {
  parseProjectDescription,
  fetchAddonSuggestions,
  fetchCriticFlags,
  type CriticFlagSuggestion,
} from '@/services/renaidaProjectIntake';
import {
  ingestProjectFolder,
  CONFIRM_ABOVE,
  type ArchiveEntry,
  type PendingSketch,
  type PropertyDocCandidate,
} from '@/services/ingestProjectFolder';
import { uploadToCategoryFolder, ensureCategoryFolder } from '@/services/smartUploadService';
import { importPurchaseOrder, type ImportPurchaseAction } from '@/services/agent/importPurchaseOrder';
import { floorPlanResultToShapes } from '@/services/aiVisionService';
import { findOrCreateClientByName } from '@/services/intakeService';
import { createPlanInDB, saveShapesForPlan } from '@/components/floormap/utils/plans';
import { readDroppedItems } from '@/lib/dropTree';
import { parseEstimationSettings } from '@/lib/materialRecipes';
import type { WorkType } from '@/services/workTypeUtils';
import {
  emptyDraft,
  nextStep,
  applyAnswer,
  toScaffoldInput,
  taskTitle,
  updateDraftRoom,
  renameDraftTask,
  seedDraftFromParse,
  deterministicAddons,
  applyAddonWorkTypes,
  applyCriticFlags,
  unattributedTaskCount,
  assignUnattributedTasks,
  estimateDraftCalc,
  type CalcProfileDefaults,
  PROJECT_TYPES,
  type ProjectDraft,
  type ProjectTypeId,
  type Step,
  type Answer,
  type UserType,
  type Provenance,
  type DraftTask,
  type DraftRoom,
  type WorkTypeLabeller,
} from '@/services/renaidaProjectFlow';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Gates the framing (homeowner vs contractor). Defaults to homeowner. */
  userType?: UserType;
  /** Guests create local (localStorage) projects and can't use server voice. */
  isGuest?: boolean;
  /**
   * Co-existence: when set, Renaida POPULATES this already-existing project
   * (rooms/tasks fold in via scaffold's existingProjectId path) instead of
   * creating a new one — the same conversational flow, a different destination.
   */
  existingProjectId?: string;
  /** Called after an existing project was populated (parent refreshes). */
  onPopulated?: () => void;
  /**
   * Skiva 1: a folder dropped OUTSIDE the dialog (page-level drop zone). The
   * dialog opens straight into the folder ingest instead of asking the user to
   * drop again — same engine, a different entry point. A fresh draft is forced
   * so the drop never folds into a half-finished restored conversation.
   */
  initialDroppedFiles?: File[];
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
  // #4: seeded objects shown as chips under the confirmation bubble so the
  // user sees exactly what was added (fully editable in the review step).
  chips?: { rooms: string[]; tasks: string[] };
}

// #3: curated material shopping-list suggestions per work type (names via i18n).
// Only the consumer-buyable surface trades — the rest the user free-adds.
const WORK_TYPE_MATERIAL_KEYS: Partial<Record<WorkType, string[]>> = {
  kakel: ['renaidaFlow.material.tiles', 'renaidaFlow.material.adhesive', 'renaidaFlow.material.grout', 'renaidaFlow.material.waterproofing'],
  malning: ['renaidaFlow.material.paint', 'renaidaFlow.material.primer', 'renaidaFlow.material.filler'],
  golv: ['renaidaFlow.material.floor', 'renaidaFlow.material.skirting', 'renaidaFlow.material.underlay'],
};

export function RenaidaProjectDialog({ open, onOpenChange, userType = 'homeowner', isGuest = false, existingProjectId, onPopulated, initialDroppedFiles }: Props) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<ProjectDraft>(emptyDraft());
  // #1: persist the in-progress draft so closing the dialog mid-flow doesn't
  // lose everything (parity with the old PlanningWizard). Keyed per target.
  const storageKey = `renaida-draft-v1-${existingProjectId ?? 'new'}`;
  const clearSavedDraft = () => {
    try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
  };
  const [turns, setTurns] = useState<Turn[]>([]);
  const [multiSel, setMultiSel] = useState<string[]>([]);
  const [fieldValue, setFieldValue] = useState('');
  const [creating, setCreating] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [gapAddingRoom, setGapAddingRoom] = useState(false);
  // Fully-extracted receipts from a dropped folder → real POs at creation (inc 3).
  const pendingPurchasesRef = useRef<ImportPurchaseAction[]>([]);
  // Analyzed floor-plan images → sketches in the planner at creation (Fas D).
  const pendingSketchesRef = useRef<PendingSketch[]>([]);
  // Skiva 2: the dropped originals, filed into the project's archive at creation.
  const archiveFilesRef = useRef<ArchiveEntry[]>([]);
  /**
   * Files from the drop that read as the HOME's papers (P4). They never touch
   * the draft. At creation they are filed under Files like everything else, so
   * nothing is lost — "Flytta till bostaden" in the file menu is the one-click
   * way to put them where they belong once the address exists.
   */
  const propertyDocsRef = useRef<PropertyDocCandidate[]>([]);
  // Skiva 3: a folder drop happened → offer the "already finished?" choice at
  // the confirm step. `retroSuggested` only decides how the question is FRAMED;
  // the flag itself is never set without an explicit answer.
  const [folderIngested, setFolderIngested] = useState(false);
  const [retroSuggested, setRetroSuggested] = useState(false);
  // Skiva 5: a big drop takes minutes — say where we are, and ask before
  // spending the calls when the folder is large.
  const [ingestProgress, setIngestProgress] = useState<{ done: number; total: number } | null>(null);
  const [confirmLarge, setConfirmLarge] = useState<{ step: Step; files: File[] } | null>(null);
  // Contractor post-birth: offer to prefill a customer quote from the new tasks.
  const [postCreate, setPostCreate] = useState<{
    projectId: string;
    taskIds: string[];
    profileId: string;
    customerName?: string;
  } | null>(null);
  const [quoteBusy, setQuoteBusy] = useState(false);
  // Homeowner post-birth (#9): choose to keep planning or activate right away.
  const [postCreateActivate, setPostCreateActivate] = useState<{ projectId: string } | null>(null);
  const [activateBusy, setActivateBusy] = useState(false);
  const [materialInput, setMaterialInput] = useState('');
  // Cautious, optional labor-time & material-quantity estimate (homeowner).
  const [showEstimate, setShowEstimate] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [measures, setMeasures] = useState<Record<string, { area: string; ceiling: string }>>({});
  const [estimateSummary, setEstimateSummary] = useState<string[] | null>(null);
  const [addonOptions, setAddonOptions] = useState<
    Array<{ id: string; label: string; workTypes: WorkType[] }> | null
  >(null);
  const [addonsLoading, setAddonsLoading] = useState(false);
  // Fas C+ critic: null = not fetched yet; [] never renders (the step is
  // silently auto-skipped when the check comes back clean or fails).
  const [criticOptions, setCriticOptions] = useState<
    Array<CriticFlagSuggestion & { id: string }> | null
  >(null);
  const [criticLoading, setCriticLoading] = useState(false);
  const convRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // ── Phase-3 funnel instrumentation ──
  // Refs (not state) so firing analytics never triggers re-renders. `snapshot`
  // mirrors the latest draft each render so the close/abandon effect can read
  // fresh values without stale-closure bugs.
  const describeUsedRef = useRef(false);
  const addonsSelectedRef = useRef(0);
  const criticAcceptedRef = useRef(0);
  const createdRef = useRef(false);
  const prevOpenRef = useRef(false);
  // Skiva 1: guards the one-shot auto-ingest of page-dropped files.
  const autoIngestedRef = useRef(false);
  const completedFiredRef = useRef(false);
  const addonsShownFiredRef = useRef(false);
  const addonsFetchedRef = useRef(false);
  const criticShownFiredRef = useRef(false);
  const criticFetchedRef = useRef(false);
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
      // Restore an in-progress draft if one was saved (closed mid-flow); else
      // start fresh. Only restore drafts with real content. A page-level folder
      // drop always starts fresh — it's a new intent, not a resumed one.
      let restored = false;
      try {
        const raw = (initialDroppedFiles?.length ?? 0) > 0 ? null : localStorage.getItem(storageKey);
        if (raw) {
          const saved = JSON.parse(raw) as { draft?: ProjectDraft; turns?: Turn[] };
          if (saved?.draft && ((saved.draft.rooms?.length ?? 0) > 0 || (saved.draft.tasks?.length ?? 0) > 0)) {
            setDraft(saved.draft);
            setTurns(saved.turns ?? []);
            restored = true;
          }
        }
      } catch { /* ignore corrupt draft */ }
      if (!restored) {
        setDraft(emptyDraft());
        setTurns([]);
      }
      setMultiSel([]);
      setFieldValue('');
      setCreating(false);
      setParsing(false);
      setIngesting(false);
      setDragActive(false);
      setGapAddingRoom(false);
      pendingPurchasesRef.current = [];
      pendingSketchesRef.current = [];
      archiveFilesRef.current = [];
      propertyDocsRef.current = [];
      setFolderIngested(false);
      setRetroSuggested(false);
      setIngestProgress(null);
      setConfirmLarge(null);
      setPostCreate(null);
      setQuoteBusy(false);
      setPostCreateActivate(null);
      setActivateBusy(false);
      setAddonOptions(null);
      setAddonsLoading(false);
      setCriticOptions(null);
      setCriticLoading(false);
      describeUsedRef.current = false;
      addonsSelectedRef.current = 0;
      criticAcceptedRef.current = 0;
      createdRef.current = false;
      completedFiredRef.current = false;
      addonsShownFiredRef.current = false;
      addonsFetchedRef.current = false;
      criticShownFiredRef.current = false;
      criticFetchedRef.current = false;
      snapshotRef.current = { stepId: 'type', rooms: 0, tasks: 0 };
      autoIngestedRef.current = false;
    }
  }, [open]);

  // Skiva 1: a folder dropped on the page opens the dialog straight into the
  // ingest. Runs once per open, only from the first (describe) step so the
  // engine's "mark describe answered" contract holds.
  useEffect(() => {
    if (!open || autoIngestedRef.current) return;
    const files = initialDroppedFiles;
    if (!files || files.length === 0) return;
    if (step?.id !== 'describe' || ingesting || parsing) return;
    autoIngestedRef.current = true;
    void runFolderIngest(step, files);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialDroppedFiles, step?.id]);

  // Keep a fresh snapshot for the abandon event (runs every render, no deps).
  useEffect(() => {
    snapshotRef.current = {
      stepId: step?.id ?? 'complete',
      rooms: draft.rooms.length,
      tasks: draft.tasks.length,
    };
  });

  // #1: persist the draft whenever it changes (until the project is created).
  useEffect(() => {
    if (!open || createdRef.current) return;
    const hasContent = draft.rooms.length > 0 || draft.tasks.length > 0 || turns.length > 0;
    if (hasContent) {
      try { localStorage.setItem(storageKey, JSON.stringify({ draft, turns })); } catch { /* ignore quota */ }
    }
  }, [open, draft, turns, storageKey]);

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
      critic_accepted: criticAcceptedRef.current,
    });
  }, [open, complete, draft, userType]);

  // When we reach the add-ons step, fetch LLM suggestions once; fall back to
  // the curated list if the function returns nothing. Fetch-once is guarded by
  // a REF, not state: the old `cancelled`+loading-in-deps pattern self-cancelled
  // the effect the moment setAddonsLoading(true) re-rendered — the response was
  // then thrown away and the spinner hung forever (no skip button in that
  // state), hard-blocking the flow whenever the network took more than an
  // instant. Same fix as the critic effect below.
  useEffect(() => {
    if (step?.id !== 'addons' || addonsFetchedRef.current || !draft.projectType) return;
    addonsFetchedRef.current = true;
    setAddonsLoading(true);
    fetchAddonSuggestions({
      projectType: draft.projectType,
      rooms: draft.rooms.map((r) => r.name),
      existingWorkTypes: [...new Set(draft.tasks.map((t) => t.workType))],
      language: i18n.language,
      userType,
    })
      .then((llm) => {
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
        setAddonsLoading(false);
      });
  }, [step?.id, draft.projectType, draft.rooms, draft.tasks, i18n.language, userType, t]);

  // Fas C+ critic: when the flow reaches the final 'critic' step, run ONE
  // expert pass over the merged draft. A clean (or failed — fail-open) check
  // silently answers the step with a small reassurance line; the question only
  // ever renders when there are concrete flags to show. Fetch-once is guarded
  // by a REF, not state — a state guard in the deps array would self-cancel
  // the effect the moment the loading flag flips.
  useEffect(() => {
    if (step?.id !== 'critic' || criticFetchedRef.current || !draft.projectType) return;
    criticFetchedRef.current = true;
    const s = step;
    setCriticLoading(true);
    fetchCriticFlags({
      projectType: draft.projectType,
      rooms: draft.rooms.map((r) => ({ name: r.name, areaSqm: r.areaSqm ?? null })),
      tasks: draft.tasks
        .filter((tk) => !tk.excluded)
        .map((tk) => ({ workType: tk.workType, roomName: tk.roomName, title: tk.customTitle ?? null })),
      language: i18n.language,
      userType,
    })
      .then((rawFlags) => {
        // Deterministic hedge on top of the prompt: never show a flag whose
        // label already exists as a task title (the LLM occasionally re-flags
        // semantically-covered work).
        const existingTitles = new Set(
          draft.tasks.filter((tk) => tk.customTitle).map((tk) => tk.customTitle!.toLowerCase())
        );
        const flags = rawFlags.filter((f) => !existingTitles.has(f.label.toLowerCase()));
        if (flags.length === 0) {
          setTurns((tn) => [
            ...tn,
            {
              message: t('renaidaFlow.critic.allGood', 'Jag dubbelkollade planen mot liknande projekt — ser komplett ut. ✓'),
              answerLabel: '',
            },
          ]);
          setDraft((d) => applyAnswer(s, { kind: 'skip' }, d));
          return;
        }
        setCriticOptions(flags.map((f, i) => ({ ...f, id: `critic-${i}` })));
        if (!criticShownFiredRef.current) {
          criticShownFiredRef.current = true;
          analytics.capture(AnalyticsEvents.RENAIDA_PROJECT_CRITIC_SHOWN, {
            user_type: userType,
            project_type: draft.projectType,
            flag_count: flags.length,
          });
        }
      })
      .finally(() => {
        setCriticLoading(false);
      });
  }, [step, draft, i18n.language, userType, t]);

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
            chips: {
              rooms: seeded.rooms.map((r) => r.name),
              tasks: seeded.tasks.map((tk) => taskTitle(tk, labelFor)),
            },
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

  /**
   * Folder ingest (Fas C): drop a whole project folder → the engine routes each
   * file (photos, quotes, specs, receipts) → everything that carries scope folds
   * into the SAME draft with per-file provenance; receipts/plans are just
   * counted and pointed at their proper flow. Desktop wedge — mobile keeps the
   * photo button. Guests use it too (the extract/parse endpoints pass anon-JWT).
   */
  const runFolderIngest = async (s: Step, files: File[], confirmed = false) => {
    if (files.length === 0 || ingesting || parsing) return;
    // Cost guard: a large folder means many model calls — ask first.
    if (!confirmed && files.length > CONFIRM_ABOVE) {
      setConfirmLarge({ step: s, files });
      return;
    }
    setConfirmLarge(null);
    setIngesting(true);
    setIngestProgress({ done: 0, total: files.length });
    try {
      const base = applyAnswer(s, { kind: 'skip' }, draft); // marks 'describe' answered
      const outcome = await ingestProjectFolder(files, base, i18n.language, {
        collectPurchases: !isGuest,
        isContractor: userType === 'contractor',
        onProgress: (done, total) => setIngestProgress({ done, total }),
      });
      pendingPurchasesRef.current = outcome.pendingPurchases;
      pendingSketchesRef.current = isGuest ? [] : outcome.pendingSketches;
      // Skiva 2: guests own no storage, so nothing is filed for them.
      archiveFilesRef.current = isGuest ? [] : outcome.archiveFiles;
      propertyDocsRef.current = isGuest ? [] : outcome.propertyDocuments;
      describeUsedRef.current = true;
      analytics.capture(AnalyticsEvents.RENAIDA_PROJECT_DESCRIBE_USED, {
        user_type: userType,
        parsed: outcome.roomsAdded > 0 || outcome.tasksAdded > 0,
        via: 'folder',
      });

      const label = `📁 ${t('renaidaFlow.folder.dropped', '{{count}} filer släppta', {
        count: outcome.filesSeen,
      })}`;
      setTurns((tn) => [...tn, { message: messageOf(s), answerLabel: label }]);

      const gotSomething =
        outcome.roomsAdded > 0 ||
        outcome.tasksAdded > 0 ||
        outcome.receiptCount > 0 ||
        outcome.pendingSketches.length > 0 ||
        outcome.floorplanCount > 0;
      if (!gotSomething) {
        setDraft(base);
        // A folder of nothing but köpekontrakt and besiktningsprotokoll is not
        // a failed read — it is a folder that belongs on the address. Say which
        // one it is instead of the same blank shrug for both.
        const onlyHomePapers =
          outcome.propertyDocuments.length > 0 &&
          outcome.propertyDocuments.length >= outcome.filesRead - outcome.ignoredCount;
        setTurns((tn) => [
          ...tn,
          {
            message: onlyHomePapers
              ? t(
                  'renaidaFlow.folder.onlyHomePapers',
                  '{{count}} av filerna ser ut att höra till bostaden — köpehandlingar och liknande — inte till en renovering. Släpp mappen på "Till bostaden" i stället, så hamnar de på adressen.',
                  { count: outcome.propertyDocuments.length }
                )
              : t('renaidaFlow.folder.nothing', 'Hittade inget att lägga in — skriv, prata eller fota istället.'),
            answerLabel: '',
          },
        ]);
        return;
      }

      let next = outcome.draft;
      if (!next.projectName) next = { ...next, projectName: t('renaidaFlow.name.other') };

      // Skiva 3: the documents date the project. Purely derived here — whether
      // the project IS retro is decided by the user at the confirm step.
      const docDates = outcome.pendingPurchases
        .map((a) => a.documentDate)
        .filter((d): d is string => !!d)
        .sort();
      if (docDates.length > 0) {
        next = { ...next, retroStartDate: docDates[0], retroEndDate: docDates[docDates.length - 1] };
      }
      setDraft(next);
      setFolderIngested(true);

      // Frames the question, never answers it: a receipt-heavy drop whose
      // newest document is months old smells like a finished renovation.
      const newest = docDates.length > 0 ? new Date(docDates[docDates.length - 1]) : null;
      const monthsOld = newest
        ? (Date.now() - newest.getTime()) / (1000 * 60 * 60 * 24 * 30)
        : 0;
      const taskCountNow = next.tasks.filter((tk) => !tk.excluded).length;
      setRetroSuggested(
        outcome.receiptCount > 0 && (monthsOld > 3 || outcome.receiptCount >= taskCountNow)
      );

      const lines: string[] = [
        t('renaidaFlow.folder.summary', 'Jag läste {{files}} filer → {{rooms}} rum och {{tasks}} arbeten.', {
          files: outcome.filesRead,
          rooms: next.rooms.length,
          tasks: next.tasks.filter((tk) => !tk.excluded).length,
        }),
      ];
      if (outcome.receiptCount > 0) {
        lines.push(
          outcome.pendingPurchases.length > 0
            ? t('renaidaFlow.folder.receiptsImport', '{{count}} kvitton/fakturor — skapas som inköp när du skapar projektet.', {
                count: outcome.receiptCount,
              })
            : t('renaidaFlow.folder.receipts', '{{count}} kvitton/fakturor — ladda upp dem som inköp inne i projektet.', {
                count: outcome.receiptCount,
              })
        );
      }
      // Sketches materialize at birth for logged-in users; guests (no DB) get
      // their analyzed plans folded into the plain counted line instead.
      const sketchCount = isGuest ? 0 : outcome.pendingSketches.length;
      const countedPlans = outcome.floorplanCount + (isGuest ? outcome.pendingSketches.length : 0);
      if (sketchCount > 0) {
        lines.push(
          t('renaidaFlow.folder.sketches', '{{count}} ritning(ar) — jag ritar en grovskiss i planritaren när projektet skapas.', {
            count: sketchCount,
          })
        );
      }
      if (countedPlans > 0) {
        lines.push(
          t('renaidaFlow.folder.floorplans', '{{count}} ritning(ar) — öppna dem i planritaren efter att projektet skapats.', {
            count: countedPlans,
          })
        );
      }
      if (outcome.propertyDocuments.length > 0) {
        lines.push(
          t(
            'renaidaFlow.folder.homePapers',
            '{{count}} filer ser ut att höra till bostaden, inte till renoveringen — de sparas i Filer utan att påverka projektet, och kan flyttas till adressen därifrån.',
            { count: outcome.propertyDocuments.length }
          )
        );
      }
      // Inert by default (P4): a file we could not place changes nothing, and
      // the person hears that from us rather than discovering it later.
      if (outcome.notUnderstoodCount > 0) {
        lines.push(
          t(
            'renaidaFlow.folder.notUnderstood',
            '{{count}} filer visste jag inte vad de var — de ligger under Övrigt i Filer och rör inget i projektet.',
            { count: outcome.notUnderstoodCount }
          )
        );
      }
      if (outcome.photosFiledCount > 0) {
        lines.push(
          t(
            'renaidaFlow.folder.photosFiled',
            '{{count}} bilder sparade i Filer utan att tolkas.',
            { count: outcome.photosFiledCount }
          )
        );
      }
      if (outcome.unreadableCount > 0) {
        lines.push(
          t('renaidaFlow.folder.unreadable', '{{count}} filer kunde jag inte läsa.', {
            count: outcome.unreadableCount,
          })
        );
      }
      // Skiva 5: no silent caps — anything we chose not to read is said out loud.
      if (outcome.oversizedCount > 0) {
        lines.push(
          t('renaidaFlow.folder.oversized', '{{count}} filer var för stora (över 20 MB) — de hoppade jag över.', {
            count: outcome.oversizedCount,
          })
        );
      }
      if (outcome.truncated) {
        lines.push(
          t('renaidaFlow.folder.truncated', 'Mappen innehöll fler filer än jag läser åt gången — jag tog de första {{count}}.', {
            count: outcome.filesRead,
          })
        );
      }
      if (outcome.skippedPlanPages > 0) {
        lines.push(
          t('renaidaFlow.folder.extraPlanPages', 'En ritning hade flera sidor — jag läste första sidan ({{count}} sidor olästa).', {
            count: outcome.skippedPlanPages,
          })
        );
      }
      setTurns((tn) => [...tn, { message: lines.join(' '), answerLabel: '' }]);
    } catch (err) {
      console.error('RenaidaProjectDialog: folder ingest failed', err);
      toast.error(t('renaidaFlow.folder.failed', 'Kunde inte läsa mappen'));
    } finally {
      setIngesting(false);
      setIngestProgress(null);
    }
  };

  const onFolderDrop = async (s: Step, e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (ingesting || parsing) return;
    const dropped = await readDroppedItems(e.dataTransfer);
    await runFolderIngest(s, dropped.map((d) => d.file));
  };

  // Keep the latest bubble + the action buttons in view. Deferred to the next
  // frame so the just-rendered turn (and the final "create" block) is laid out
  // before we measure scrollHeight.
  useEffect(() => {
    const el = convRef.current;
    if (!el) return;
    const raf = requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(raf);
  }, [turns.length, step?.id, complete, postCreate]);

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

  const onChipSingle = (s: Step, id: string, label: string) => {
    submit(s, { kind: 'chips', ids: [id], labels: [label] }, label);
    // E1: on "suggest calc", enrich the draft from the builder's PROFILE rates
    // (source of truth: default_hourly_rate + estimation_settings) — async, so
    // it runs after the sync answer; fail-open to engine defaults.
    if (s.id === 'calc' && id === 'suggest') void runCalcSuggestion();
  };

  const runCalcSuggestion = async () => {
    let defaults: CalcProfileDefaults = { defaultHourlyRate: null, settings: {} };
    try {
      if (!isGuest) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: p } = await supabase
            .from('profiles')
            .select('default_hourly_rate, estimation_settings')
            .eq('user_id', user.id)
            .maybeSingle();
          if (p) {
            defaults = {
              defaultHourlyRate: p.default_hourly_rate ?? null,
              settings: parseEstimationSettings(
                p.estimation_settings as Record<string, unknown> | null
              ),
            };
          }
        }
      }
    } catch (e) {
      console.error('RenaidaProjectDialog: profile rates fetch failed', e);
    }
    setDraft((d) => estimateDraftCalc(d, defaults));
  };

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

  const onCriticContinue = (s: Step) => {
    const chosen = (criticOptions ?? []).filter((o) => multiSel.includes(o.id));
    if (chosen.length === 0) return;
    setTurns((tn) => [...tn, { message: messageOf(s), answerLabel: chosen.map((o) => o.label).join(', ') }]);
    setDraft((d) => applyCriticFlags(d, chosen));
    criticAcceptedRef.current = chosen.length;
    setMultiSel([]);
  };

  // Gap fill (Fas C inc 2): attribute the "which room?" answer for tasks the
  // ingest couldn't place. Skipping keeps them project-wide.
  const resolveGap = (s: Step, roomName: string | null, answerLabel: string) => {
    setTurns((tn) => [...tn, { message: messageOf(s), answerLabel }]);
    setDraft((d) => assignUnattributedTasks(d, roomName));
    setGapAddingRoom(false);
    setMultiSel([]);
    setFieldValue('');
  };
  const onGapRoom = (s: Step, roomName: string) => resolveGap(s, roomName, roomName);
  const onGapNewRoom = (s: Step) => {
    const name = fieldValue.trim();
    if (name) resolveGap(s, name, name);
  };
  const onGapSkip = (s: Step) =>
    resolveGap(s, null, t('renaidaFlow.gap.projectWide', 'Lämna projektövergripande'));

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
        clearSavedDraft();
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
      const result = await scaffoldProject(toScaffoldInput(draft, labelFor, { existingProjectId }), profile.id);
      createdRef.current = true;
      clearSavedDraft();

      // Inc 3: turn folder-dropped receipts into real purchase orders now that
      // the project exists. Best-effort per purchase — a failed order must not
      // sink the freshly-created project.
      const purchases = pendingPurchasesRef.current;
      if (purchases.length > 0) {
        let created = 0;
        for (const action of purchases) {
          try {
            await importPurchaseOrder(result.projectId, profile.id, action);
            created++;
          } catch (e) {
            console.error('RenaidaProjectDialog: purchase import failed', e);
          }
        }
        if (created > 0) {
          toast.success(
            t('renaidaFlow.folder.purchasesCreated', '{{count}} inköp skapade från dina kvitton.', {
              count: created,
            })
          );
        }
      }

      // Fas D: materialize analyzed floor plans as rough sketches in the
      // planner. Best-effort — a failed sketch must not sink the project.
      const sketches = pendingSketchesRef.current;
      if (sketches.length > 0) {
        let drawn = 0;
        for (const sketch of sketches) {
          try {
            const plan = await createPlanInDB(
              result.projectId,
              t('renaidaFlow.folder.sketchPlanName', 'Grovskiss – {{file}}', { file: sketch.fileName })
            );
            if (!plan) continue;
            const shapes = floorPlanResultToShapes(sketch.result, plan.id);
            if (shapes.length > 0 && (await saveShapesForPlan(plan.id, shapes))) drawn++;
          } catch (e) {
            console.error('RenaidaProjectDialog: sketch materialization failed', e);
          }
        }
        if (drawn > 0) {
          toast.success(
            t('renaidaFlow.folder.sketchesCreated', '{{count}} grovskiss(er) ritade i planritaren.', {
              count: drawn,
            })
          );
        }
      }

      // Skiva 2: file the dropped originals into the project's archive. The
      // extraction consumed their CONTENT; the user still expects the FILES.
      // Best-effort per file — a failed upload must not sink the project.
      // Home papers ride along into Files as `other`: they added nothing to the
      // project, but dropping them on the floor would be worse than filing them
      // in the honest place. Moving them to the address is one click from there.
      const archives = [
        ...archiveFilesRef.current,
        ...propertyDocsRef.current.map((c) => ({ file: c.file, category: 'other' as const })),
      ];
      if (archives.length > 0) {
        let filed = 0;
        try {
          for (const cat of new Set(archives.map((a) => a.category))) {
            await ensureCategoryFolder(result.projectId, cat);
          }
          for (const entry of archives) {
            const path = await uploadToCategoryFolder(result.projectId, entry.file, entry.category);
            if (path) filed++;
          }
        } catch (e) {
          console.error('RenaidaProjectDialog: archiving dropped files failed', e);
        }
        if (filed > 0) {
          toast.success(
            t('renaidaFlow.folder.filesArchived', '{{count}} filer sparade i Filer.', { count: filed })
          );
        }
      }

      // Populate-existing (co-existence): the project already existed, so this
      // is NOT a creation (no project_created event, no quote-offer/navigation —
      // the parent surface already shows the project). Refresh it and close.
      if (existingProjectId) {
        analytics.capture(AnalyticsEvents.RENAIDA_PROJECT_COMPLETED, {
          user_type: userType,
          mode: 'populate_existing',
          room_count: draft.rooms.length,
          task_count: draft.tasks.length,
        });
        toast.success(t('renaidaFlow.populated', 'Klart! Jag har lagt till det i ditt projekt. 🎉'));
        onOpenChange(false);
        onPopulated?.();
        return;
      }

      analytics.capture(AnalyticsEvents.PROJECT_CREATED, {
        creation_method: ProjectCreationMethod.RENAIDA_DIALOG,
        user_type: userType,
        room_count: draft.rooms.length,
        task_count: draft.tasks.length,
        has_budget: Boolean(draft.totalBudget),
        has_address: Boolean(draft.address),
        describe_used: describeUsedRef.current,
        addons_selected: addonsSelectedRef.current,
        purchases_imported: pendingPurchasesRef.current.length,
        sketches_imported: pendingSketchesRef.current.length,
      });
      toast.success(t('renaidaFlow.err.created', 'Projektet är skapat! 🎉'));

      // Skiva 3: a retro project is already finished — quoting it or activating
      // it would be nonsense. Land the user straight in its summary instead.
      if (draft.retrospective) {
        onOpenChange(false);
        navigate(`/projects/${result.projectId}`);
        setCreating(false);
        return;
      }

      // Proactive contractor help (K1): the project was born with tasks — offer
      // to prefill a customer quote from them (same prepopulate deep-link as
      // CreateQuoteDialog; /quotes/new is contractor-gated in the router).
      if (userType === 'contractor' && result.taskIds.length > 0) {
        analytics.capture(AnalyticsEvents.RENAIDA_QUOTE_OFFER, {
          action: 'shown',
          task_count: result.taskIds.length,
        });
        setPostCreate({
          projectId: result.projectId,
          taskIds: result.taskIds,
          profileId: profile.id,
          customerName: draft.customerName,
        });
        setCreating(false);
        return;
      }

      // #9 homeowner fork: offer to keep planning or activate the project right
      // away, instead of always landing in planning.
      setPostCreateActivate({ projectId: result.projectId });
      setCreating(false);
    } catch (err) {
      console.error('RenaidaProjectDialog: create failed', err);
      toast.error(t('renaidaFlow.err.failed', 'Kunde inte skapa projektet'));
      setCreating(false);
    }
  };

  const onActivateChoice = async (choice: 'activate' | 'plan') => {
    if (!postCreateActivate || activateBusy) return;
    const { projectId } = postCreateActivate;
    if (choice === 'plan') {
      onOpenChange(false);
      navigate(`/projects/${projectId}?tab=planning`);
      return;
    }
    setActivateBusy(true);
    try {
      await activateProject(projectId);
      toast.success(t('renaidaFlow.activate.done', 'Projektet är aktiverat! 🚀'));
      onOpenChange(false);
      navigate(`/projects/${projectId}`);
    } catch (err) {
      console.error('RenaidaProjectDialog: activate failed', err);
      toast.error(t('renaidaFlow.activate.failed', 'Kunde inte aktivera projektet'));
      setActivateBusy(false);
    }
  };

  const onQuoteOffer = async (choice: 'quote' | 'review' | 'decline') => {
    if (!postCreate || quoteBusy) return;
    analytics.capture(AnalyticsEvents.RENAIDA_QUOTE_OFFER, {
      action: choice === 'quote' ? 'accepted' : choice === 'review' ? 'review_calc' : 'declined',
      task_count: postCreate.taskIds.length,
      has_customer: Boolean(postCreate.customerName),
    });
    if (choice === 'decline') {
      onOpenChange(false);
      navigate(`/projects/${postCreate.projectId}`);
      return;
    }
    // R1: "granska kalkylen" — the builder's summary+edit surface IS the
    // planning table (hours × rate, markups, materials). Renaida filled it;
    // he reviews/adjusts there and generates the quote from its footer.
    if (choice === 'review') {
      onOpenChange(false);
      navigate(`/projects/${postCreate.projectId}?tab=planning`);
      return;
    }
    // Pre-address the quote to the customer the builder already named: find or
    // create the client, pass its id (CreateQuoteV2 reads ?clientId=). Best-effort.
    setQuoteBusy(true);
    let clientParam = '';
    if (postCreate.customerName) {
      try {
        const clientId = await findOrCreateClientByName(postCreate.profileId, postCreate.customerName);
        if (clientId) clientParam = `&clientId=${clientId}`;
      } catch (e) {
        console.error('RenaidaProjectDialog: client prefill failed', e);
      }
    }
    onOpenChange(false);
    navigate(
      `/quotes/new?projectId=${postCreate.projectId}&prepopulate=true&taskIds=${postCreate.taskIds.join(',')}${clientParam}`
    );
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

  /** Inline-edit a room's name/area during review (Fas B inc3). */
  const editRoom = (index: number, updates: { name?: string; areaSqm?: number | null }) => {
    setDraft((d) => updateDraftRoom(d, index, updates));
  };

  // #3: planned-material shopping list (names only). Suggest from the tasks'
  // work types; the user edits/adds. Amounts come later (typed or from a receipt).
  const suggestedMaterials = useMemo(() => {
    const names = new Set<string>();
    for (const task of draft.tasks) {
      if (task.excluded) continue;
      (WORK_TYPE_MATERIAL_KEYS[task.workType] ?? []).forEach((k) => names.add(t(k)));
    }
    return Array.from(names);
  }, [draft.tasks, t]);

  // Pre-fill the suggestions once, when the flow completes (undefined = untouched).
  useEffect(() => {
    if (complete && draft.plannedMaterials === undefined) {
      setDraft((d) => ({ ...d, plannedMaterials: suggestedMaterials }));
    }
  }, [complete, draft.plannedMaterials, suggestedMaterials]);

  const removeMaterial = (name: string) =>
    setDraft((d) => ({ ...d, plannedMaterials: (d.plannedMaterials ?? []).filter((m) => m !== name) }));
  const addMaterial = (name: string) => {
    const n = name.trim();
    if (!n) return;
    setDraft((d) => ((d.plannedMaterials ?? []).includes(n) ? d : { ...d, plannedMaterials: [...(d.plannedMaterials ?? []), n] }));
    setMaterialInput('');
  };

  // Prefill measurement inputs from the draft rooms when the estimate opens.
  useEffect(() => {
    if (showEstimate && Object.keys(measures).length === 0 && draft.rooms.length > 0) {
      const init: Record<string, { area: string; ceiling: string }> = {};
      for (const r of draft.rooms) {
        init[r.name] = {
          area: r.areaSqm != null ? String(r.areaSqm) : '',
          ceiling: r.ceilingHeightMm != null ? String(r.ceilingHeightMm / 1000) : '2.4',
        };
      }
      setMeasures(init);
    }
  }, [showEstimate, draft.rooms, measures]);

  // Cautious estimate: the engine derives wall area from area + ceiling (square
  // assumption), so pure m² + ceiling is enough — dimensions just refine it.
  // Homeowner-facing → keep labor time + quantities, drop kronor (no amounts).
  const runHomeownerEstimate = async () => {
    setEstimating(true);
    let defaults: CalcProfileDefaults = { defaultHourlyRate: null, settings: {} };
    try {
      if (!isGuest) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: p } = await supabase
            .from('profiles')
            .select('default_hourly_rate, estimation_settings')
            .eq('user_id', user.id)
            .maybeSingle();
          if (p) {
            defaults = {
              defaultHourlyRate: p.default_hourly_rate ?? null,
              settings: parseEstimationSettings(p.estimation_settings as Record<string, unknown> | null),
            };
          }
        }
      }
    } catch (e) {
      console.error('RenaidaProjectDialog: estimate rates fetch failed', e);
    }

    const rooms = draft.rooms.map((r) => {
      const m = measures[r.name];
      if (!m) return r;
      const area = parseFloat((m.area || '').replace(',', '.'));
      const ceilingM = parseFloat((m.ceiling || '').replace(',', '.'));
      return {
        ...r,
        areaSqm: Number.isFinite(area) && area > 0 ? area : r.areaSqm,
        ceilingHeightMm: Number.isFinite(ceilingM) && ceilingM > 0 ? Math.round(ceilingM * 1000) : r.ceilingHeightMm,
      };
    });
    const estimated = estimateDraftCalc({ ...draft, rooms }, defaults);
    const tasks = estimated.tasks.map((t) => ({ ...t, materialEstimateSek: null, hourlyRateSek: null }));
    setDraft({ ...estimated, rooms, tasks });
    setEstimateSummary(
      tasks
        .filter((t) => t.estimatedHours && t.estimatedHours > 0)
        .map((t) => `${taskTitle(t, labelFor)} · ≈ ${t.estimatedHours} h`)
    );
    setEstimating(false);
  };

  /** Inline-edit a task title during review — writes customTitle. */
  const editTaskTitle = (index: number, title: string) => {
    setDraft((d) => renameDraftTask(d, index, title));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="5xl" className="grid-rows-1 gap-0 overflow-hidden p-0 h-[88vh] sm:h-[640px] md:p-0 md:h-[680px]">
        <div className="grid h-full min-h-0 grid-rows-1 grid-cols-1 md:grid-cols-[1fr_minmax(280px,340px)]">
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
                  {turn.chips && (turn.chips.rooms.length > 0 || turn.chips.tasks.length > 0) && (
                    <div className="ml-8 flex flex-wrap gap-1.5">
                      {turn.chips.rooms.map((name, ri) => (
                        <span key={`r-${ri}`} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                          <Home className="h-3 w-3" /> {name}
                        </span>
                      ))}
                      {turn.chips.tasks.map((title, ti) => (
                        <span key={`t-${ti}`} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          <Hammer className="h-3 w-3" /> {title}
                        </span>
                      ))}
                    </div>
                  )}
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
                    <div
                      className={`space-y-2 rounded-lg pl-8 transition-colors ${
                        dragActive ? 'bg-primary/5 ring-2 ring-dashed ring-primary/50' : ''
                      }`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (!ingesting && !parsing) setDragActive(true);
                      }}
                      onDragLeave={() => setDragActive(false)}
                      onDrop={(e) => void onFolderDrop(step, e)}
                    >
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
                        disabled={parsing || ingesting}
                        onChange={setFieldValue}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onDescribeSubmit(step);
                        }}
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => onDescribeSubmit(step)}
                          disabled={!fieldValue.trim() || parsing || ingesting}
                        >
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
                          disabled={parsing || ingesting}
                          title={t('renaidaFlow.photo', 'Fota anteckning/underlag')}
                        >
                          <Camera className="h-3.5 w-3.5 sm:mr-1" />
                          <span className="hidden sm:inline">{t('renaidaFlow.photo', 'Foto')}</span>
                        </Button>
                        {/* Folder ingest — desktop wedge; hidden on phones (no folder DnD). */}
                        <input
                          ref={(el) => {
                            folderInputRef.current = el;
                            if (el) {
                              el.setAttribute('webkitdirectory', '');
                              el.setAttribute('directory', '');
                            }
                          }}
                          type="file"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            void runFolderIngest(step, Array.from(e.target.files ?? []));
                            e.target.value = '';
                          }}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="hidden sm:inline-flex"
                          onClick={() => folderInputRef.current?.click()}
                          disabled={parsing || ingesting}
                          title={t('renaidaFlow.folder.button', 'Släpp en projektmapp')}
                        >
                          {ingesting ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <FolderUp className="h-3.5 w-3.5 sm:mr-1" />
                          )}
                          <span className="hidden sm:inline">
                            {ingesting
                              ? t('renaidaFlow.folder.ingesting', 'Läser mappen…')
                              : t('renaidaFlow.folder.button', 'Mapp')}
                          </span>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onSkip(step)}
                          disabled={parsing || ingesting}
                        >
                          {step.input.kind === 'text' && step.input.skipKey
                            ? t(step.input.skipKey)
                            : t('renaidaFlow.skip.skip')}
                        </Button>
                      </div>
                      {/* Skiva 5: a big folder takes minutes — show where we are. */}
                      {ingesting && ingestProgress && ingestProgress.total > 0 && (
                        <div className="space-y-1">
                          <div className="h-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full bg-primary transition-[width] duration-300"
                              style={{ width: `${Math.round((ingestProgress.done / ingestProgress.total) * 100)}%` }}
                            />
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {t('renaidaFlow.folder.progress', 'Läser fil {{done}} av {{total}} …', ingestProgress)}
                          </p>
                        </div>
                      )}

                      {/* Cost guard: many files = many model calls. Ask first. */}
                      {confirmLarge && !ingesting && (
                        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                          <p className="text-sm">
                            {t('renaidaFlow.folder.confirmLarge', 'Mappen innehåller {{count}} filer — att läsa alla tar någon minut. Kör jag igång?', {
                              count: confirmLarge.files.length,
                            })}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              onClick={() => void runFolderIngest(confirmLarge.step, confirmLarge.files, true)}
                            >
                              {t('renaidaFlow.folder.confirmLargeYes', 'Ja, läs mappen')}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setConfirmLarge(null)}>
                              {t('common.cancel', 'Avbryt')}
                            </Button>
                          </div>
                        </div>
                      )}

                      <p className="hidden text-[11px] text-muted-foreground/70 sm:block">
                        {t('renaidaFlow.folder.hint', 'Har du redan underlag? Släpp hela projektmappen här (offerter, foton, anteckningar).')}
                      </p>
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
                  ) : step.id === 'critic' ? (
                    <div className="space-y-2.5 pl-8">
                      {criticLoading || criticOptions === null ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          {t('renaidaFlow.critic.checking', 'Renaida dubbelkollar planen…')}
                        </div>
                      ) : (
                        <>
                          <div className="flex flex-col gap-2">
                            {criticOptions.map((o) => {
                              const on = multiSel.includes(o.id);
                              return (
                                <button
                                  key={o.id}
                                  onClick={() =>
                                    setMultiSel(on ? multiSel.filter((x) => x !== o.id) : [...multiSel, o.id])
                                  }
                                  className={`rounded-lg border px-3.5 py-2 text-left text-sm transition-colors ${
                                    on
                                      ? 'border-primary bg-primary/10'
                                      : 'bg-background hover:border-primary hover:bg-primary/5'
                                  }`}
                                >
                                  <span className={`flex items-center gap-1.5 font-medium ${on ? 'text-primary' : ''}`}>
                                    {on ? (
                                      <Check className="h-3 w-3 flex-shrink-0" />
                                    ) : (
                                      <ShieldAlert className="h-3 w-3 flex-shrink-0 text-amber-500" />
                                    )}
                                    {o.label}
                                    {o.roomName && (
                                      <span className="font-normal text-muted-foreground">· {o.roomName}</span>
                                    )}
                                  </span>
                                  {o.reason && (
                                    <span className="mt-0.5 block text-xs text-muted-foreground">{o.reason}</span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button size="sm" onClick={() => onCriticContinue(step)} disabled={multiSel.length === 0}>
                              {t('renaidaFlow.critic.add', 'Lägg till')} <ArrowRight className="ml-1 h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => onSkip(step)}>
                              {t('renaidaFlow.critic.looksGood', 'Ser bra ut ändå')}
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  ) : step.id === 'gapRoom' ? (
                    <div className="space-y-2.5 pl-8">
                      <div className="flex flex-wrap gap-2">
                        {draft.rooms.map((r) => (
                          <button
                            key={r.name}
                            onClick={() => onGapRoom(step, r.name)}
                            className="rounded-full border bg-background px-3.5 py-1.5 text-sm transition-colors hover:border-primary hover:bg-primary/5"
                          >
                            {r.name}
                          </button>
                        ))}
                        {!gapAddingRoom && (
                          <button
                            onClick={() => setGapAddingRoom(true)}
                            className="rounded-full border border-dashed px-3.5 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                          >
                            {t('renaidaFlow.gap.newRoom', '+ Nytt rum')}
                          </button>
                        )}
                      </div>
                      {gapAddingRoom && (
                        <div className="flex items-center gap-2">
                          <Input
                            autoFocus
                            placeholder={t('renaidaFlow.gap.newRoomPh', 'Rummets namn')}
                            value={fieldValue}
                            onChange={(e) => setFieldValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') onGapNewRoom(step);
                            }}
                          />
                          <Button size="sm" onClick={() => onGapNewRoom(step)} disabled={!fieldValue.trim()}>
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => onGapSkip(step)}>
                        {t('renaidaFlow.gap.projectWide', 'Lämna projektövergripande')}
                      </Button>
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

              {postCreate && (
                <div className="space-y-3 animate-in fade-in slide-in-from-bottom-1">
                  <RenaidaBubble>
                    {postCreate.customerName
                      ? t('renaidaFlow.quoteOffer.messageNamed', 'Projektet är skapat! 🎉 Vill du att jag förbereder en offert till {{customer}} av arbetena?', {
                          customer: postCreate.customerName,
                        })
                      : t('renaidaFlow.quoteOffer.message', 'Projektet är skapat! 🎉 Vill du att jag förbereder en offert till din kund av arbetena?')}
                  </RenaidaBubble>
                  <div className="flex flex-col gap-2 pl-8 sm:flex-row sm:flex-wrap">
                    <Button onClick={() => onQuoteOffer('quote')} disabled={quoteBusy}>
                      {quoteBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                      {t('renaidaFlow.quoteOffer.accept', 'Direkt till offert')}
                    </Button>
                    <Button variant="outline" onClick={() => onQuoteOffer('review')} disabled={quoteBusy}>
                      <Calculator className="mr-2 h-4 w-4" />
                      {t('renaidaFlow.quoteOffer.review', 'Granska & justera kalkylen')}
                    </Button>
                    <Button variant="ghost" onClick={() => onQuoteOffer('decline')} disabled={quoteBusy}>
                      {t('renaidaFlow.quoteOffer.decline', 'Öppna projektet')}
                    </Button>
                  </div>
                </div>
              )}

              {postCreateActivate && (
                <div className="space-y-3 animate-in fade-in slide-in-from-bottom-1">
                  <RenaidaBubble>
                    {t('renaidaFlow.activateFork.message', 'Projektet är skapat! 🎉 Vill du fortsätta planera det, eller aktivera det direkt så arbetet kan börja?')}
                  </RenaidaBubble>
                  <div className="flex flex-col gap-2 pl-8 sm:flex-row sm:flex-wrap">
                    <Button onClick={() => onActivateChoice('activate')} disabled={activateBusy}>
                      {activateBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                      {t('renaidaFlow.activateFork.activate', 'Aktivera projektet direkt')}
                    </Button>
                    <Button variant="outline" onClick={() => onActivateChoice('plan')} disabled={activateBusy}>
                      <ClipboardList className="mr-2 h-4 w-4" />
                      {t('renaidaFlow.activateFork.plan', 'Fortsätt planera')}
                    </Button>
                  </div>
                </div>
              )}

              {complete && !postCreate && !postCreateActivate && (
                <div className="space-y-3 animate-in fade-in slide-in-from-bottom-1">
                  <RenaidaBubble>{t('renaidaFlow.complete')}</RenaidaBubble>

                  {/* Mobile review — the side preview panel is desktop-only, so
                      surface the draft here (with source chips + remove) so phone
                      users can verify and adjust before the project is created. */}
                  <div className="space-y-3 rounded-lg border bg-muted/30 p-3 md:hidden">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {t('renaidaFlow.ui.review', 'Granska innan du skapar')}
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{draft.projectName}</div>
                      {draft.customerName && (
                        <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <User className="h-3 w-3" /> {draft.customerName}
                        </div>
                      )}
                      {draft.address && (
                        <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3" /> {draft.address}
                        </div>
                      )}
                    </div>
                    {draft.rooms.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          <Home className="h-3 w-3" /> {t('renaidaFlow.ui.section.rooms')}
                        </div>
                        {draft.rooms.map((r, i) => (
                          <EditableRoomRow key={`${r.name}-${i}`} room={r} onUpdate={(u) => editRoom(i, u)} />
                        ))}
                      </div>
                    )}
                    {draft.tasks.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          <Hammer className="h-3 w-3" /> {t('renaidaFlow.ui.section.tasks')} ({taskCount})
                        </div>
                        <TaskReviewList tasks={draft.tasks} labelFor={labelFor} onToggle={toggleTaskExcluded} onRename={editTaskTitle} />
                      </div>
                    )}
                    {draft.totalBudget ? (
                      <div className="rounded-md bg-background px-2.5 py-1.5 text-sm">
                        {draft.totalBudget.toLocaleString('sv-SE')} kr
                      </div>
                    ) : null}
                  </div>

                  {/* Skiva 3: retro projects. Asked, never inferred — a wrong
                      guess would silently mark a live project finished. Guests
                      never see it: their create path is the local-storage one,
                      which has no status/receipts, so the question would be
                      a promise nothing keeps. */}
                  {folderIngested && !isGuest && (
                    <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                      <div className="flex items-center gap-1.5 text-sm font-medium">
                        <CalendarCheck className="h-4 w-4 text-primary shrink-0" />
                        {retroSuggested
                          ? t('renaidaFlow.retro.ask', 'Det här ser ut som en renovering som redan är gjord — stämmer det?')
                          : t('renaidaFlow.retro.askNeutral', 'Är det här ett pågående projekt?')}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t('renaidaFlow.retro.hint', 'Ett genomfört projekt skapas som avslutat: arbetena läggs in som klara och du får en sammanställning av kvitton och ROT — bra inför deklaration eller försäljning.')}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={draft.retrospective ? 'outline' : 'default'}
                          onClick={() => setDraft((d) => ({ ...d, retrospective: false }))}
                        >
                          {t('renaidaFlow.retro.ongoing', 'Pågående projekt')}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={draft.retrospective ? 'default' : 'outline'}
                          onClick={() => setDraft((d) => ({ ...d, retrospective: true }))}
                        >
                          {t('renaidaFlow.retro.done', 'Redan genomfört')}
                        </Button>
                      </div>
                      {draft.retrospective && draft.retroStartDate && (
                        <p className="text-xs text-muted-foreground">
                          {t('renaidaFlow.retro.dated', 'Jag daterar projektet {{from}} – {{to}} utifrån dina dokument.', {
                            from: draft.retroStartDate,
                            to: draft.retroEndDate ?? draft.retroStartDate,
                          })}
                        </p>
                      )}
                    </div>
                  )}

                  {/* #3: optional planned material shopping list — suggested from
                      the tasks, editable, no amounts. Visible on all viewports. */}
                  <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      <ShoppingCart className="h-4 w-4 text-primary shrink-0" />
                      {t('renaidaFlow.materials.title', 'Ska vi planera några materialinköp?')}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('renaidaFlow.materials.hint', 'Förslag utifrån arbetena — lägg till eller ta bort. Belopp fyller du i senare, eller när du fotar kvittot.')}
                    </p>
                    {(draft.plannedMaterials?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {draft.plannedMaterials!.map((name) => (
                          <span key={name} className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs">
                            {name}
                            <button type="button" onClick={() => removeMaterial(name)} className="text-muted-foreground hover:text-foreground" aria-label={t('common.remove', 'Ta bort')}>
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Input
                        value={materialInput}
                        onChange={(e) => setMaterialInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addMaterial(materialInput); } }}
                        placeholder={t('renaidaFlow.materials.addPlaceholder', 'Lägg till material…')}
                        className="h-8 text-sm"
                      />
                      <Button type="button" variant="outline" size="sm" onClick={() => addMaterial(materialInput)} disabled={!materialInput.trim()}>
                        {t('renaidaFlow.materials.add', 'Lägg till')}
                      </Button>
                    </div>
                  </div>

                  {/* Cautious optional estimate (homeowner). The engine derives
                      wall area from area + ceiling, so m² + ceiling suffices. */}
                  {userType !== 'contractor' && (
                    <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                      <button
                        type="button"
                        onClick={() => setShowEstimate((v) => !v)}
                        className="flex w-full items-center gap-1.5 text-left text-sm font-medium"
                      >
                        <Calculator className="h-4 w-4 shrink-0 text-primary" />
                        {t('renaidaFlow.estimate.title', 'Vill du att jag räknar ut arbetstid & materialmängd?')}
                        <ChevronDown className={`ml-auto h-4 w-4 shrink-0 transition-transform ${showEstimate ? 'rotate-180' : ''}`} />
                      </button>
                      {showEstimate && (
                        <div className="space-y-2">
                          <p className="text-xs text-muted-foreground">
                            {t('renaidaFlow.estimate.hint', 'Ange yta och takhöjd per rum — helt frivilligt. Detaljerna finjusterar du sen inne i projektet.')}
                          </p>
                          {draft.rooms.map((r) => (
                            <div key={r.name} className="flex items-center gap-1.5 text-sm">
                              <span className="min-w-0 flex-1 truncate">{r.name}</span>
                              <Input
                                value={measures[r.name]?.area ?? ''}
                                onChange={(e) => setMeasures((m) => ({ ...m, [r.name]: { area: e.target.value, ceiling: m[r.name]?.ceiling ?? '2.4' } }))}
                                inputMode="decimal"
                                className="h-8 w-16 text-sm"
                                aria-label={t('renaidaFlow.estimate.area', 'Yta (m²)')}
                              />
                              <span className="text-xs text-muted-foreground">m²</span>
                              <Input
                                value={measures[r.name]?.ceiling ?? ''}
                                onChange={(e) => setMeasures((m) => ({ ...m, [r.name]: { area: m[r.name]?.area ?? '', ceiling: e.target.value } }))}
                                inputMode="decimal"
                                className="h-8 w-16 text-sm"
                                aria-label={t('renaidaFlow.estimate.ceiling', 'Takhöjd (m)')}
                              />
                              <span className="text-xs text-muted-foreground">{t('renaidaFlow.estimate.ceilingUnit', 'm tak')}</span>
                            </div>
                          ))}
                          <Button type="button" size="sm" onClick={runHomeownerEstimate} disabled={estimating}>
                            {estimating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Calculator className="mr-2 h-4 w-4" />}
                            {t('renaidaFlow.estimate.run', 'Beräkna')}
                          </Button>
                          {estimateSummary && estimateSummary.length > 0 && (
                            <div className="space-y-0.5 rounded-md bg-background p-2 text-xs">
                              {estimateSummary.map((line, i) => (
                                <div key={i}>{line}</div>
                              ))}
                              <div className="pt-1 text-muted-foreground">
                                {t('renaidaFlow.estimate.adjustNote', 'Uppskattat — finjustera fritt inne i projektet.')}
                              </div>
                            </div>
                          )}
                          {estimateSummary && estimateSummary.length === 0 && (
                            <div className="rounded-md bg-background p-2 text-xs text-muted-foreground">
                              {t('renaidaFlow.estimate.none', 'Jag kunde inte uppskatta de här arbetena automatiskt — det gör du enkelt i projektet.')}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

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
                {draft.customerName && (
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <User className="h-3 w-3" /> {draft.customerName}
                  </div>
                )}
                {draft.address && (
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" /> {draft.address}
                  </div>
                )}
              </div>

              {draft.rooms.length > 0 && (
                <PreviewSection icon={<Home className="h-3.5 w-3.5" />} label={t('renaidaFlow.ui.section.rooms')}>
                  <div className="space-y-2">
                    {draft.rooms.map((r, i) => (
                      <EditableRoomRow key={`${r.name}-${i}`} room={r} onUpdate={(u) => editRoom(i, u)} />
                    ))}
                  </div>
                </PreviewSection>
              )}

              {draft.tasks.length > 0 && (
                <PreviewSection
                  icon={<Hammer className="h-3.5 w-3.5" />}
                  label={`${t('renaidaFlow.ui.section.tasks')} (${taskCount})`}
                >
                  <TaskReviewList tasks={draft.tasks} labelFor={labelFor} onToggle={toggleTaskExcluded} onRename={editTaskTitle} />
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
    critic: { Icon: ShieldAlert, key: 'renaidaFlow.source.critic', fb: 'Renaidas koll' },
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

/** Editable room row (name + area) with source chip — shared by the desktop
 *  side-panel and the mobile review so both stay identical (Fas B inc3). */
function EditableRoomRow({
  room,
  onUpdate,
}: {
  room: DraftRoom;
  onUpdate: (updates: { name?: string; areaSqm?: number | null }) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(room.name);
  const [area, setArea] = useState(room.areaSqm != null ? String(room.areaSqm) : '');

  // Re-sync when the draft changes underneath us (e.g. rename propagated)
  useEffect(() => {
    if (editing) return;
    setName(room.name);
    setArea(room.areaSqm != null ? String(room.areaSqm) : '');
  }, [room.name, room.areaSqm, editing]);

  const commit = () => {
    const trimmedArea = area.trim();
    const parsed = trimmedArea === '' ? null : Number(trimmedArea.replace(',', '.'));
    onUpdate({
      name,
      areaSqm: parsed === null ? null : Number.isFinite(parsed) ? parsed : room.areaSqm,
    });
    setEditing(false);
  };

  const cancel = () => {
    setName(room.name);
    setArea(room.areaSqm != null ? String(room.areaSqm) : '');
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 rounded-md bg-background px-2 py-1.5">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel(); }}
          className="h-8 flex-1 text-sm"
          autoFocus
          aria-label={t('renaidaFlow.ui.section.rooms', 'Rum')}
        />
        <Input
          value={area}
          onChange={(e) => setArea(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel(); }}
          className="h-8 w-14 text-right text-sm"
          inputMode="decimal"
          placeholder="m²"
          aria-label="m²"
        />
        <button
          type="button"
          onClick={commit}
          className="flex-shrink-0 rounded p-1 text-primary hover:bg-primary/10"
          aria-label={t('common.save', 'Spara')}
        >
          <Check className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="group flex items-center justify-between gap-2 rounded-md bg-background px-2.5 py-1.5 text-sm">
      <span className="flex min-w-0 items-center gap-1.5">
        <SourceChip source={room.source} />
        <span className="truncate">{room.name}</span>
      </span>
      <span className="flex flex-shrink-0 items-center gap-2">
        {room.areaSqm ? <span className="text-xs text-muted-foreground">{room.areaSqm} m²</span> : null}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-muted-foreground/50 transition-opacity hover:text-foreground md:opacity-0 md:group-hover:opacity-100"
          title={t('common.edit', 'Redigera')}
          aria-label={t('common.edit', 'Redigera')}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </span>
    </div>
  );
}

/** Task rows with source chip + reversible include/exclude + inline title edit —
 *  shared by the desktop side-panel and the mobile review (so both stay identical). */
function TaskReviewList({
  tasks,
  labelFor,
  onToggle,
  onRename,
}: {
  tasks: DraftTask[];
  labelFor: WorkTypeLabeller;
  onToggle: (index: number) => void;
  onRename?: (index: number, title: string) => void;
}) {
  const { t } = useTranslation();
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

  const startEdit = (index: number) => {
    setEditValue(taskTitle(tasks[index], labelFor));
    setEditingIndex(index);
  };
  const commitEdit = (index: number) => {
    onRename?.(index, editValue);
    setEditingIndex(null);
  };

  return (
    <div className="space-y-1.5">
      {tasks.map((task, i) => {
        if (editingIndex === i && onRename) {
          return (
            <div key={task.workType + i} className="flex items-center gap-1.5 rounded-md bg-background px-2 py-1.5">
              <Input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEdit(i);
                  if (e.key === 'Escape') setEditingIndex(null);
                }}
                className="h-8 flex-1 text-sm"
                autoFocus
                aria-label={t('renaidaFlow.ui.section.tasks', 'Arbeten')}
              />
              <button
                type="button"
                onClick={() => commitEdit(i)}
                className="flex-shrink-0 rounded p-1 text-primary hover:bg-primary/10"
                aria-label={t('common.save', 'Spara')}
              >
                <Check className="h-4 w-4" />
              </button>
            </div>
          );
        }
        return (
        <div
          key={task.workType + i}
          className={`group flex items-center justify-between gap-2 rounded-md bg-background px-2.5 py-1.5 text-sm animate-in fade-in slide-in-from-bottom-1 ${
            task.excluded ? 'opacity-50' : ''
          }`}
          style={{ animationDelay: `${i * 40}ms` }}
        >
          <span className={`flex min-w-0 flex-col ${task.excluded ? 'line-through' : ''}`}>
            <span className="flex min-w-0 items-center gap-1.5">
              <SourceChip source={task.source} />
              <span className="truncate">{taskTitle(task, labelFor)}</span>
            </span>
            {/* E1: suggested calc — hours × the builder's own rate (+ material).
                Shown with the formula so he can judge it at a glance; the
                planning table is where he edits. */}
            {!task.excluded && task.estimatedHours != null && (
              <span className="truncate text-[11px] text-muted-foreground" title={task.calcNote ?? undefined}>
                ≈ {task.estimatedHours} h
                {task.hourlyRateSek != null &&
                  ` · ${Math.round(task.estimatedHours * task.hourlyRateSek).toLocaleString('sv-SE')} kr`}
                {task.materialEstimateSek != null &&
                  ` + ${task.materialEstimateSek.toLocaleString('sv-SE')} kr ${t('renaidaFlow.calc.material', 'material')}`}
              </span>
            )}
          </span>
          <span className="flex flex-shrink-0 items-center gap-1">
            {onRename && !task.excluded && (
              <button
                type="button"
                onClick={() => startEdit(i)}
                className="text-muted-foreground/50 transition-opacity hover:text-foreground md:opacity-0 md:group-hover:opacity-100"
                title={t('common.edit', 'Redigera')}
                aria-label={t('common.edit', 'Redigera')}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => onToggle(i)}
              className="text-muted-foreground/50 transition-opacity hover:text-foreground md:opacity-0 md:group-hover:opacity-100"
              title={task.excluded ? t('renaidaFlow.include', 'Ta med igen') : t('renaidaFlow.exclude', 'Ta bort')}
              aria-label={task.excluded ? t('renaidaFlow.include', 'Ta med igen') : t('renaidaFlow.exclude', 'Ta bort')}
            >
              {task.excluded ? <RotateCcw className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
            </button>
          </span>
        </div>
        );
      })}
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

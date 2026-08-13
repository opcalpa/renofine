/**
 * Renaida-led project creation — conditional flow (Phase 1).
 *
 * A leading, conditional question flow that builds a project draft bit by bit
 * instead of one freetext box. The flow is language-neutral: steps carry i18n
 * KEYS (not baked strings) and chips carry option ids + labelKeys, so the whole
 * conversation localizes into any locale. Task titles are derived from the
 * (language-neutral) work type via a caller-supplied label resolver.
 *
 * Role-gating: nextStep(draft, userType) varies the framing for homeowner vs
 * contractor. The deterministic tree is also the fallback/backbone for the LLM
 * jumpstart (see renaidaProjectIntake.ts) — the LLM seeds the draft from free
 * text and this tree then asks only what is still missing.
 */

import type { WorkType } from './workTypeUtils';
import { workTypeToCostCenter, getWorkTypes } from './workTypeUtils';
import type { ScaffoldProjectInput } from './scaffoldProject';
import type { AIParsedResult } from '@/components/project/overview/planning-wizard/types';
import {
  estimateTaskMultiRoom,
  detectWorkType,
  type RecipeEstimationSettings,
  type RecipeRoom,
} from '@/lib/materialRecipes';

export type ProjectTypeId = 'bathroom' | 'kitchen' | 'laundry' | 'basement' | 'paint' | 'floor' | 'other';
export type UserType = 'homeowner' | 'contractor';

/** Where a draft line came from — powers the source chip + per-row review. */
export type ProvenanceKind =
  | 'answer'
  | 'describe'
  | 'photo'
  | 'document'
  | 'floorplan'
  | 'suggestion'
  | 'critic';

export interface Provenance {
  kind: ProvenanceKind;
  /** Originating file, when the line came from an upload/photo. */
  fileName?: string;
  confidence?: number;
}

export interface DraftRoom {
  name: string;
  areaSqm?: number | null;
  ceilingHeightMm?: number | null;
  source?: Provenance;
}

export interface DraftTask {
  /** Language-neutral — the title is derived from this + roomName at render time. */
  workType: WorkType;
  roomName: string | null;
  costCenter: string;
  source?: Provenance;
  /** Reversibly excluded during review — kept in the draft, skipped at creation. */
  excluded?: boolean;
  /**
   * Explicit title that overrides the workType-derived one. Used for contractor
   * overhead line items (establishment, scaffolding, cleaning…) that are real
   * quote lines but not room trades — they share workType 'annat' yet must stay
   * distinct, so they carry their own name.
   */
  customTitle?: string;
  /**
   * Preserved line price (K4): a contractor's own quote-PDF dropped in the birth
   * folder becomes priced tasks so the post-birth quote offer (K1) prefills their
   * ACTUAL prices — CreateQuoteV2 uses task.budget as the line's unit price.
   */
  budgetSek?: number | null;
  /**
   * E1 contractor calc suggestion (never forced — the calc step opts in): labor
   * hours from the estimation engine (profile productivity rates × room area),
   * the builder's own default hourly rate, and a material cost from the recipe.
   * All land as prefilled EDITABLE cells in the planning table via scaffold.
   */
  estimatedHours?: number | null;
  hourlyRateSek?: number | null;
  materialEstimateSek?: number | null;
  /** Human-readable formula ("32 m² vägg × 10 m²/h") — explainability seed (E2). */
  calcNote?: string | null;
}

export interface ProjectDraft {
  projectType?: ProjectTypeId;
  /** User-entered/derived name; may be undefined until named. */
  projectName?: string;
  /** Contractor-only: the client this job is for (feeds the post-birth quote). */
  customerName?: string;
  address?: string;
  rooms: DraftRoom[];
  tasks: DraftTask[];
  totalBudget?: number | null;
  /**
   * E1 contractor calc level: 'suggest' = Renaida prefills hours/rates/material
   * from the estimation engine; 'self' = builder does the math himself (empty
   * cells). Never forced — chosen in the calc step.
   */
  calcLevel?: 'suggest' | 'self';
  /** Step ids already answered (incl. skipped) — drives the conditional flow. */
  answered: string[];
}

export const emptyDraft = (): ProjectDraft => ({ rooms: [], tasks: [], answered: [] });

/** Resolves a work type to a localized label (caller passes an i18n-backed fn). */
export type WorkTypeLabeller = (workType: WorkType) => string;

/** Localized task title from language-neutral parts. */
export function taskTitle(task: DraftTask, labelFor: WorkTypeLabeller): string {
  if (task.customTitle) return task.customTitle;
  const label = labelFor(task.workType);
  return task.roomName ? `${label} – ${task.roomName}` : label;
}

/** Cross-cutting overhead a builder often quotes separately (any project type). */
const CONTRACTOR_OVERHEAD: Chip[] = [
  { id: 'establishment', labelKey: 'renaidaFlow.overhead.establishment' },
  { id: 'demolitionRemoval', labelKey: 'renaidaFlow.overhead.demolitionRemoval' },
  { id: 'scaffolding', labelKey: 'renaidaFlow.overhead.scaffolding' },
  { id: 'cleaning', labelKey: 'renaidaFlow.overhead.cleaning' },
  { id: 'ataBuffer', labelKey: 'renaidaFlow.overhead.ataBuffer' },
];

// ── Steps (i18n keys, not strings) ─────────────────────────────────────────

export interface Chip {
  id: string;
  labelKey: string;
}

export type StepInput =
  | { kind: 'chips'; options: Chip[]; multi?: boolean; skipKey?: string }
  | { kind: 'text'; placeholderKey?: string; skipKey?: string }
  | { kind: 'number'; placeholderKey?: string; unit?: string; skipKey?: string };

export interface Step {
  id: string;
  /** i18n key for Renaida's line. */
  messageKey: string;
  /** Interpolation vars for the message (already localized where needed). */
  messageVars?: Record<string, string>;
  input: StepInput;
}

export type Answer =
  | { kind: 'chips'; ids: string[]; labels: string[] }
  | { kind: 'text'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'skip' };

// ── Domain mapping (language-neutral) ──────────────────────────────────────

/** Project type → the room it seeds + its default name key. */
const PROJECT_TYPES: Record<ProjectTypeId, { roomNameKey: string; nameKey: string }> = {
  bathroom: { roomNameKey: 'renaidaFlow.room.bathroom', nameKey: 'renaidaFlow.name.bathroom' },
  kitchen: { roomNameKey: 'renaidaFlow.room.kitchen', nameKey: 'renaidaFlow.name.kitchen' },
  laundry: { roomNameKey: 'renaidaFlow.room.laundry', nameKey: 'renaidaFlow.name.laundry' },
  basement: { roomNameKey: 'renaidaFlow.room.basement', nameKey: 'renaidaFlow.name.basement' },
  paint: { roomNameKey: 'renaidaFlow.room.generic', nameKey: 'renaidaFlow.name.paint' },
  floor: { roomNameKey: 'renaidaFlow.room.generic', nameKey: 'renaidaFlow.name.floor' },
  other: { roomNameKey: 'renaidaFlow.room.generic', nameKey: 'renaidaFlow.name.other' },
};

const TYPE_CHIPS: Chip[] = [
  { id: 'bathroom', labelKey: 'renaidaFlow.type.bathroom' },
  { id: 'kitchen', labelKey: 'renaidaFlow.type.kitchen' },
  { id: 'laundry', labelKey: 'renaidaFlow.type.laundry' },
  { id: 'basement', labelKey: 'renaidaFlow.type.basement' },
  { id: 'paint', labelKey: 'renaidaFlow.type.paint' },
  { id: 'floor', labelKey: 'renaidaFlow.type.floor' },
  { id: 'other', labelKey: 'renaidaFlow.type.other' },
];

/** Scope chip → the work types (= tasks) it expands into, per project type. */
interface ScopeChip {
  id: string;
  labelKey: string;
  workTypes: WorkType[];
}

const SCOPE_BY_TYPE: Record<ProjectTypeId, ScopeChip[]> = {
  bathroom: [
    { id: 'total', labelKey: 'renaidaFlow.scope.total', workTypes: ['rivning', 'vvs', 'el', 'kakel', 'malning', 'golv'] },
    { id: 'surfaces', labelKey: 'renaidaFlow.scope.tiles', workTypes: ['kakel'] },
    { id: 'fixtures', labelKey: 'renaidaFlow.scope.fixtures', workTypes: ['vvs'] },
    { id: 'paint', labelKey: 'renaidaFlow.scope.paint', workTypes: ['malning'] },
    { id: 'floor', labelKey: 'renaidaFlow.scope.newFloor', workTypes: ['golv'] },
    { id: 'electrical', labelKey: 'renaidaFlow.scope.electrical', workTypes: ['el'] },
  ],
  kitchen: [
    { id: 'total', labelKey: 'renaidaFlow.scope.total', workTypes: ['rivning', 'snickeri', 'vvs', 'el', 'kakel', 'malning', 'golv'] },
    { id: 'cabinets', labelKey: 'renaidaFlow.scope.cabinets', workTypes: ['snickeri'] },
    { id: 'appliances', labelKey: 'renaidaFlow.scope.appliances', workTypes: ['vvs'] },
    { id: 'splash', labelKey: 'renaidaFlow.scope.splash', workTypes: ['kakel'] },
    { id: 'paint', labelKey: 'renaidaFlow.scope.paint', workTypes: ['malning'] },
    { id: 'floor', labelKey: 'renaidaFlow.scope.newFloor', workTypes: ['golv'] },
  ],
  paint: [
    { id: 'walls', labelKey: 'renaidaFlow.scope.walls', workTypes: ['malning'] },
    { id: 'ceiling', labelKey: 'renaidaFlow.scope.ceiling', workTypes: ['malning'] },
    { id: 'trim', labelKey: 'renaidaFlow.scope.trim', workTypes: ['malning', 'snickeri'] },
  ],
  laundry: [
    { id: 'total', labelKey: 'renaidaFlow.scope.total', workTypes: ['rivning', 'vvs', 'el', 'kakel', 'malning', 'golv'] },
    { id: 'fixtures', labelKey: 'renaidaFlow.scope.fixtures', workTypes: ['vvs'] },
    { id: 'surfaces', labelKey: 'renaidaFlow.scope.tiles', workTypes: ['kakel'] },
    { id: 'floor', labelKey: 'renaidaFlow.scope.newFloor', workTypes: ['golv'] },
    { id: 'cabinets', labelKey: 'renaidaFlow.scope.cabinets', workTypes: ['snickeri'] },
    { id: 'electrical', labelKey: 'renaidaFlow.scope.electrical', workTypes: ['el'] },
  ],
  basement: [
    { id: 'convert', labelKey: 'renaidaFlow.scope.convert', workTypes: ['rivning', 'snickeri', 'el', 'malning', 'golv'] },
    { id: 'moisture', labelKey: 'renaidaFlow.scope.moisture', workTypes: ['vvs', 'rivning'] },
    { id: 'surfaces', labelKey: 'renaidaFlow.scope.paint', workTypes: ['malning'] },
    { id: 'floor', labelKey: 'renaidaFlow.scope.newFloor', workTypes: ['golv'] },
    { id: 'electrical', labelKey: 'renaidaFlow.scope.electrical', workTypes: ['el'] },
  ],
  floor: [
    { id: 'wood', labelKey: 'renaidaFlow.scope.wood', workTypes: ['golv'] },
    { id: 'vinyl', labelKey: 'renaidaFlow.scope.vinyl', workTypes: ['golv'] },
    { id: 'tile', labelKey: 'renaidaFlow.scope.tileFloor', workTypes: ['golv', 'kakel'] },
  ],
  other: (['rivning', 'snickeri', 'el', 'vvs', 'kakel', 'malning', 'golv', 'fonster_dorrar', 'tak', 'fasad'] as WorkType[]).map(
    (wt) => ({ id: wt, labelKey: `intake.workType.${wt}`, workTypes: [wt] })
  ),
};

/**
 * Commonly-forgotten add-ons suggested per project type after scope — the
 * "smart conditional suggestions based on your choices" step. Each maps to the
 * extra work it implies. (LLM-generated dynamic add-ons are a later slice; this
 * curated set is the backbone/fallback and ships without an edge deploy.)
 */
interface AddonChip {
  id: string;
  labelKey: string;
  workTypes: WorkType[];
}

const ADDONS_BY_TYPE: Partial<Record<ProjectTypeId, AddonChip[]>> = {
  bathroom: [
    { id: 'underfloor', labelKey: 'renaidaFlow.addon.underfloorHeat', workTypes: ['el', 'golv'] },
    { id: 'towel', labelKey: 'renaidaFlow.addon.towelRail', workTypes: ['vvs'] },
    { id: 'niche', labelKey: 'renaidaFlow.addon.showerNiche', workTypes: ['kakel'] },
    { id: 'moveDrain', labelKey: 'renaidaFlow.addon.moveDrain', workTypes: ['rivning', 'vvs'] },
    { id: 'spots', labelKey: 'renaidaFlow.addon.spotlights', workTypes: ['el'] },
    { id: 'vanity', labelKey: 'renaidaFlow.addon.vanity', workTypes: ['snickeri'] },
  ],
  kitchen: [
    { id: 'island', labelKey: 'renaidaFlow.addon.island', workTypes: ['snickeri'] },
    { id: 'dishwasher', labelKey: 'renaidaFlow.addon.dishwasher', workTypes: ['vvs'] },
    { id: 'hood', labelKey: 'renaidaFlow.addon.rangeHood', workTypes: ['vvs', 'el'] },
    { id: 'movePlumbing', labelKey: 'renaidaFlow.addon.movePlumbing', workTypes: ['vvs', 'rivning'] },
    { id: 'spots', labelKey: 'renaidaFlow.addon.spotlights', workTypes: ['el'] },
  ],
  laundry: [
    { id: 'dryingCabinet', labelKey: 'renaidaFlow.addon.dryingCabinet', workTypes: ['el', 'snickeri'] },
    { id: 'utilitySink', labelKey: 'renaidaFlow.addon.utilitySink', workTypes: ['vvs'] },
    { id: 'underfloor', labelKey: 'renaidaFlow.addon.underfloorHeat', workTypes: ['el', 'golv'] },
  ],
  basement: [
    { id: 'addBathroom', labelKey: 'renaidaFlow.addon.addBathroom', workTypes: ['vvs', 'kakel', 'el'] },
    { id: 'spots', labelKey: 'renaidaFlow.addon.spotlights', workTypes: ['el'] },
  ],
  paint: [
    { id: 'trim', labelKey: 'renaidaFlow.addon.trimPaint', workTypes: ['snickeri'] },
    { id: 'wallpaper', labelKey: 'renaidaFlow.addon.wallpaper', workTypes: ['malning'] },
  ],
  floor: [
    { id: 'skirting', labelKey: 'renaidaFlow.addon.skirting', workTypes: ['snickeri'] },
    { id: 'underfloor', labelKey: 'renaidaFlow.addon.underfloorHeat', workTypes: ['el', 'golv'] },
  ],
};

const SCOPE_MESSAGE_KEY: Record<ProjectTypeId, string> = {
  bathroom: 'renaidaFlow.q.scope.bathroom',
  kitchen: 'renaidaFlow.q.scope.kitchen',
  laundry: 'renaidaFlow.q.scope.laundry',
  basement: 'renaidaFlow.q.scope.basement',
  paint: 'renaidaFlow.q.scope.paint',
  floor: 'renaidaFlow.q.scope.floor',
  other: 'renaidaFlow.q.scope.other',
};

// ── Conditional flow ───────────────────────────────────────────────────────

const answered = (draft: ProjectDraft, id: string) => draft.answered.includes(id);

/**
 * The next question, or null when the draft has enough to create the project.
 * `roomLabel` localizes the seeded room name for interpolation; `userType`
 * gates the framing.
 */
export function nextStep(
  draft: ProjectDraft,
  userType?: UserType | null,
  roomLabel?: string
): Step | null {
  // Optional free-text jumpstart: describe the project in your own words and
  // the LLM seeds the draft (handled specially by the UI); skip to be guided.
  if (!answered(draft, 'describe') && !draft.projectType) {
    return {
      id: 'describe',
      messageKey: userType === 'contractor' ? 'renaidaFlow.q.describe.contractor' : 'renaidaFlow.q.describe.homeowner',
      input: { kind: 'text', placeholderKey: 'renaidaFlow.ph.describe', skipKey: 'renaidaFlow.skip.guideMe' },
    };
  }
  if (!draft.projectType) {
    return {
      id: 'type',
      messageKey: userType === 'contractor' ? 'renaidaFlow.q.type.contractor' : 'renaidaFlow.q.type.homeowner',
      input: { kind: 'chips', options: TYPE_CHIPS },
    };
  }
  if (!answered(draft, 'scope')) {
    return {
      id: 'scope',
      messageKey: SCOPE_MESSAGE_KEY[draft.projectType],
      input: { kind: 'chips', options: SCOPE_BY_TYPE[draft.projectType], multi: true },
    };
  }
  // Contractor-only (the ONE essential role divergence woven into the shared
  // tree, not a parallel flow): a builder works FOR a client. Capturing the
  // customer here feeds the post-birth quote offer. Homeowners never see it.
  if (userType === 'contractor' && !answered(draft, 'customer')) {
    return {
      id: 'customer',
      messageKey: 'renaidaFlow.q.customer',
      input: { kind: 'text', placeholderKey: 'renaidaFlow.ph.customer', skipKey: 'renaidaFlow.skip.noCustomer' },
    };
  }
  // Smart add-ons: only once scope produced tasks and the type has suggestions.
  const addons = draft.projectType ? ADDONS_BY_TYPE[draft.projectType] : undefined;
  if (draft.projectType && draft.tasks.length > 0 && addons && !answered(draft, 'addons')) {
    return {
      id: 'addons',
      messageKey: 'renaidaFlow.q.addons',
      input: {
        kind: 'chips',
        options: addons.map((a) => ({ id: a.id, labelKey: a.labelKey })),
        multi: true,
        skipKey: 'renaidaFlow.skip.none',
      },
    };
  }
  // Contractor overhead (K3): pro line items builders quote separately —
  // establishment, demolition/removal, scaffolding, cleaning, change-order
  // buffer. Same tree, contractor-only, once there's work to quote. Homeowners
  // never see it. These are 'annat'/other-cost tasks with their own titles.
  if (userType === 'contractor' && draft.tasks.length > 0 && !answered(draft, 'overhead')) {
    return {
      id: 'overhead',
      messageKey: 'renaidaFlow.q.overhead',
      input: { kind: 'chips', options: CONTRACTOR_OVERHEAD, multi: true, skipKey: 'renaidaFlow.skip.none' },
    };
  }
  // Gap fill (Fas C inc 2): a folder/photo/description can produce work types
  // with no room (parsed globalWorkTypes) — "6 photos I couldn't place". Ask
  // which room they belong to, but ONLY when there's genuine ambiguity (2+
  // rooms) — with a single room the answer is obvious and a question is just
  // friction, and it keeps the single-room describe flow unchanged. Bespoke UI
  // reads draft.rooms. Asked once (marked answered on any resolution incl. skip).
  if (unattributedTaskCount(draft) > 0 && draft.rooms.length >= 2 && !answered(draft, 'gapRoom')) {
    return {
      id: 'gapRoom',
      messageKey: 'renaidaFlow.q.gapRoom',
      messageVars: { count: String(unattributedTaskCount(draft)) },
      input: { kind: 'chips', options: [], skipKey: 'renaidaFlow.gap.projectWide' },
    };
  }
  if (!answered(draft, 'size')) {
    return {
      id: 'size',
      messageKey: 'renaidaFlow.q.size',
      messageVars: { room: roomLabel ?? draft.rooms[0]?.name ?? '' },
      input: { kind: 'number', placeholderKey: 'renaidaFlow.ph.size', unit: 'm²', skipKey: 'renaidaFlow.skip.dontKnow' },
    };
  }
  // E1 contractor calc opt-in: builders think in labor hours × rate + material —
  // offer to prefill that calc from THEIR profile rates and the room area. Only
  // asked when the estimate can actually compute something (a room with a known
  // area backing at least one task), and never for homeowners. Suggestions are
  // prefilled EDITABLE cells, never forced ("smart = bonus, inte tvång").
  if (userType === 'contractor' && calcEligibleTaskCount(draft) > 0 && !answered(draft, 'calc')) {
    return {
      id: 'calc',
      messageKey: 'renaidaFlow.q.calc',
      input: {
        kind: 'chips',
        options: [
          { id: 'suggest', labelKey: 'renaidaFlow.calc.suggest' },
          { id: 'self', labelKey: 'renaidaFlow.calc.self' },
        ],
      },
    };
  }
  if (!answered(draft, 'address')) {
    return {
      id: 'address',
      messageKey: 'renaidaFlow.q.address',
      input: { kind: 'text', placeholderKey: 'renaidaFlow.ph.address', skipKey: 'renaidaFlow.skip.skip' },
    };
  }
  if (!answered(draft, 'budget')) {
    return {
      id: 'budget',
      messageKey: userType === 'contractor' ? 'renaidaFlow.q.budget.contractor' : 'renaidaFlow.q.budget.homeowner',
      input: { kind: 'number', placeholderKey: 'renaidaFlow.ph.budget', unit: 'kr', skipKey: 'renaidaFlow.skip.noBudget' },
    };
  }
  // Fas C+ "missing-something" critic — the LAST question before birth: one
  // expert pass over the fully-merged draft that flags commonly-forgotten
  // prerequisites ("totalrenovering utan rivning?", "badrum utan tätskikt?").
  // Bespoke UI: the dialog fetches LLM flags and silently auto-answers this
  // step when the check comes back clean or fails (fail-open) — the question
  // only ever appears when there is something concrete to show.
  if (draft.tasks.length > 0 && !answered(draft, 'critic')) {
    return {
      id: 'critic',
      messageKey: 'renaidaFlow.q.critic',
      input: { kind: 'chips', options: [], multi: true, skipKey: 'renaidaFlow.critic.looksGood' },
    };
  }
  return null;
}

/**
 * Apply an answer to the draft, returning a new draft. `roomLabel`/`nameLabel`
 * supply localized strings the draft should store (seeded room name, default
 * project name) — callers resolve them via i18n.
 */
export function applyAnswer(
  step: Step,
  answer: Answer,
  draft: ProjectDraft,
  labels?: { roomName?: string; projectName?: string }
): ProjectDraft {
  const next: ProjectDraft = { ...draft, rooms: [...draft.rooms], tasks: [...draft.tasks], answered: [...draft.answered] };
  if (!next.answered.includes(step.id)) next.answered.push(step.id);

  switch (step.id) {
    case 'type': {
      if (answer.kind !== 'chips' || !answer.ids[0]) break;
      const id = answer.ids[0] as ProjectTypeId;
      if (!PROJECT_TYPES[id]) break;
      next.projectType = id;
      next.projectName = labels?.projectName ?? answer.labels[0];
      next.rooms = [{ name: labels?.roomName ?? answer.labels[0], source: { kind: 'answer' } }];
      break;
    }
    case 'scope': {
      if (answer.kind !== 'chips' || !next.projectType) break;
      const chips = SCOPE_BY_TYPE[next.projectType];
      const roomName = next.rooms[0]?.name ?? null;
      const workTypes = new Set<WorkType>();
      for (const id of answer.ids) {
        chips.find((c) => c.id === id)?.workTypes.forEach((wt) => workTypes.add(wt));
      }
      next.tasks = [...workTypes].map((wt) => ({
        workType: wt,
        roomName,
        costCenter: workTypeToCostCenter(wt),
        source: { kind: 'answer' as const },
      }));
      break;
    }
    case 'addons': {
      if (answer.kind !== 'chips' || !next.projectType) break;
      const addons = ADDONS_BY_TYPE[next.projectType] ?? [];
      const roomName = next.rooms[0]?.name ?? null;
      const existing = new Set(next.tasks.map((t) => `${t.workType}:${t.roomName ?? ''}`));
      for (const id of answer.ids) {
        addons
          .find((a) => a.id === id)
          ?.workTypes.forEach((wt) => {
            const key = `${wt}:${roomName ?? ''}`;
            if (existing.has(key)) return;
            existing.add(key);
            next.tasks.push({ workType: wt, roomName, costCenter: workTypeToCostCenter(wt), source: { kind: 'suggestion' } });
          });
      }
      break;
    }
    case 'size': {
      if (answer.kind === 'number' && next.rooms[0]) {
        next.rooms = [{ ...next.rooms[0], areaSqm: answer.value }];
      }
      break;
    }
    case 'customer': {
      if (answer.kind === 'text' && answer.value.trim()) next.customerName = answer.value.trim();
      break;
    }
    case 'overhead': {
      if (answer.kind !== 'chips') break;
      // The localized labels ARE the titles (overhead items have no room/trade).
      const existing = new Set(
        next.tasks.filter((t) => t.customTitle).map((t) => t.customTitle!.toLowerCase())
      );
      answer.ids.forEach((_id, i) => {
        const title = (answer.labels[i] ?? '').trim();
        if (!title || existing.has(title.toLowerCase())) return;
        existing.add(title.toLowerCase());
        next.tasks.push({
          workType: 'annat',
          roomName: null,
          costCenter: workTypeToCostCenter('annat'),
          customTitle: title,
          source: { kind: 'suggestion' },
        });
      });
      break;
    }
    case 'calc': {
      if (answer.kind === 'chips' && answer.ids[0]) {
        next.calcLevel = answer.ids[0] === 'suggest' ? 'suggest' : 'self';
      }
      break;
    }
    case 'address': {
      if (answer.kind === 'text' && answer.value.trim()) {
        next.address = answer.value.trim();
        next.projectName = `${next.projectName ?? ''} – ${answer.value.trim()}`.replace(/^ – /, '');
      }
      break;
    }
    case 'budget': {
      if (answer.kind === 'number') next.totalBudget = answer.value;
      break;
    }
  }
  return next;
}

export const isComplete = (draft: ProjectDraft, userType?: UserType | null): boolean =>
  nextStep(draft, userType) === null;

/** Curated add-on options for a type (the fallback when the LLM has none). */
export function deterministicAddons(
  type: ProjectTypeId
): Array<{ id: string; labelKey: string; workTypes: WorkType[] }> {
  return ADDONS_BY_TYPE[type] ?? [];
}

/**
 * Apply chosen add-ons (resolved to work types) to the draft — used by the UI
 * for both LLM-suggested and curated add-ons. Marks 'addons' answered and adds
 * deduped tasks against the first room.
 */
export function applyAddonWorkTypes(draft: ProjectDraft, workTypesList: WorkType[][]): ProjectDraft {
  const next: ProjectDraft = { ...draft, tasks: [...draft.tasks], answered: [...draft.answered] };
  if (!next.answered.includes('addons')) next.answered.push('addons');
  const roomName = next.rooms[0]?.name ?? null;
  const existing = new Set(next.tasks.map((t) => `${t.workType}:${t.roomName ?? ''}`));
  for (const wts of workTypesList) {
    for (const wt of wts) {
      const key = `${wt}:${roomName ?? ''}`;
      if (existing.has(key)) continue;
      existing.add(key);
      next.tasks.push({ workType: wt, roomName, costCenter: workTypeToCostCenter(wt), source: { kind: 'suggestion' } });
    }
  }
  return next;
}

/**
 * A "did you forget this?" flag from the Fas C+ critic — the specific missing
 * item is the point ("Tätskikt"), so the label rides along as the task title
 * rather than collapsing into its work type.
 */
export interface CriticFlag {
  label: string;
  workType: WorkType;
  /** Room the flag concerns, when the critic named one of the draft's rooms. */
  roomName?: string | null;
  /** Short "why this matters" line shown under the chip. */
  reason?: string;
}

/**
 * Apply accepted critic flags (Fas C+). Each becomes a task carrying the
 * flag's own label as customTitle, deduped by title, room-scoped to the named
 * room when it exists in the draft (else the first room). Marks 'critic'
 * answered.
 */
export function applyCriticFlags(draft: ProjectDraft, flags: CriticFlag[]): ProjectDraft {
  const next: ProjectDraft = { ...draft, tasks: [...draft.tasks], answered: [...draft.answered] };
  if (!next.answered.includes('critic')) next.answered.push('critic');
  const existingTitles = new Set(
    next.tasks.filter((t) => t.customTitle).map((t) => t.customTitle!.toLowerCase())
  );
  for (const flag of flags) {
    const title = flag.label.trim();
    if (!title || existingTitles.has(title.toLowerCase())) continue;
    existingTitles.add(title.toLowerCase());
    const matchedRoom = flag.roomName
      ? next.rooms.find((r) => r.name.toLowerCase() === flag.roomName!.trim().toLowerCase())
      : undefined;
    next.tasks.push({
      workType: flag.workType,
      roomName: matchedRoom?.name ?? next.rooms[0]?.name ?? null,
      costCenter: workTypeToCostCenter(flag.workType),
      customTitle: title,
      source: { kind: 'critic' },
    });
  }
  return next;
}

/** Tasks with no room (project-wide) that a gap-fill step could attribute.
 *  Overhead line items (customTitle) are project-wide by design — never asked. */
export const unattributedTaskCount = (draft: ProjectDraft): number =>
  draft.tasks.filter((t) => t.roomName == null && !t.excluded && !t.customTitle).length;

/**
 * Resolve the gap-fill step (Fas C inc 2): attribute every unattributed task
 * to `roomName` (or leave them project-wide when null). Creates the room if it
 * is new, canonicalizes against existing rooms, and dedupes so an orphan that
 * would collide with an already-attributed task is dropped rather than doubled.
 * Marks 'gapRoom' answered so the step is asked exactly once.
 */
export function assignUnattributedTasks(
  draft: ProjectDraft,
  roomName: string | null
): ProjectDraft {
  const next: ProjectDraft = {
    ...draft,
    rooms: [...draft.rooms],
    tasks: [...draft.tasks],
    answered: [...draft.answered],
  };
  if (!next.answered.includes('gapRoom')) next.answered.push('gapRoom');

  const target = roomName?.trim();
  if (!target) return next; // "keep project-wide" — tasks stay unattributed.

  const key = (name: string) => name.toLowerCase();
  let canon = next.rooms.find((r) => key(r.name) === key(target))?.name;
  if (!canon) {
    canon = target;
    next.rooms.push({ name: target, source: { kind: 'answer' } });
  }

  const attributed = new Set(
    next.tasks.filter((t) => t.roomName != null).map((t) => `${t.workType}:${t.roomName}`)
  );
  next.tasks = next.tasks.reduce<DraftTask[]>((acc, t) => {
    // Keep attributed tasks and overhead (project-wide by design) untouched.
    if (t.roomName != null || t.customTitle) {
      acc.push(t);
      return acc;
    }
    const k = `${t.workType}:${canon}`;
    if (attributed.has(k)) return acc; // orphan merges into the existing task
    attributed.add(k);
    acc.push({ ...t, roomName: canon });
    return acc;
  }, []);
  return next;
}

/** Map the accumulated draft onto the shared scaffoldProject engine's input. */
export function toScaffoldInput(
  draft: ProjectDraft,
  labelFor: WorkTypeLabeller,
  opts?: { existingProjectId?: string }
): ScaffoldProjectInput {
  // Populate-existing mode (co-existence): fold the draft into a project that
  // already exists (scaffold ignores `project` + leaves onboarding untouched).
  const existingProjectId = opts?.existingProjectId;
  return {
    ...(existingProjectId
      ? { existingProjectId }
      : {
          project: {
            name: draft.projectName?.trim() || 'Nytt projekt',
            address: draft.address ?? null,
            country: 'SE',
            status: 'planning',
            totalBudget: draft.totalBudget ?? null,
          },
        }),
    rooms: draft.rooms.map((r) => ({
      name: r.name,
      ceilingHeightMm: r.ceilingHeightMm ?? null,
      dimensions: r.areaSqm ? { area_sqm: r.areaSqm } : null,
    })),
    tasks: draft.tasks
      .filter((t) => !t.excluded)
      .map((t) => ({
        title: taskTitle(t, labelFor),
        roomName: t.roomName,
        costCenter: t.costCenter,
        budget: t.budgetSek ?? null,
        // E1: the suggested calc lands as prefilled editable cells in the
        // planning table; E2: the formula travels as structured provenance
        // (estimate_meta) — the table shows it and marks edits as overridden.
        estimatedHours: t.estimatedHours ?? null,
        hourlyRate: t.hourlyRateSek ?? null,
        materialEstimate: t.materialEstimateSek ?? null,
        estimateMeta: t.calcNote
          ? { source: 'renaida_calc', formula: t.calcNote, overridden: false }
          : null,
      })),
    markOnboardingComplete: true,
  };
}

/** Exposed for the LLM jumpstart to build tasks from parsed work types. */
export { SCOPE_BY_TYPE, PROJECT_TYPES };

/**
 * Seed the draft from an LLM-parsed description (the free-text jumpstart).
 * Pure mapping — the network call lives in renaidaProjectIntake.ts. Returns
 * null when nothing usable was found so the caller falls back to the guided
 * questions. Marks the steps the LLM already covered as answered.
 */
export function seedDraftFromParse(
  parsed: AIParsedResult,
  base: ProjectDraft,
  opts: { defaultName: string; sourceKind?: ProvenanceKind }
): ProjectDraft | null {
  const known = new Set<WorkType>(getWorkTypes().map((w) => w.value));
  const source: Provenance = { kind: opts.sourceKind ?? 'describe' };

  const rooms: DraftRoom[] = [
    ...parsed.rooms.map((r) => ({ name: r.name, source })),
    ...(parsed.otherSpaces ?? []).map((r) => ({ name: r.name, source })),
  ];
  // A single-room project can adopt the whole-property area as its own.
  if (rooms.length === 1 && parsed.totalAreaSqm) rooms[0].areaSqm = parsed.totalAreaSqm;

  const tasks: DraftTask[] = [];
  const seen = new Set<string>();
  const addTask = (wt: WorkType, roomName: string | null) => {
    if (!known.has(wt)) return;
    const key = `${wt}:${roomName ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    tasks.push({ workType: wt, roomName, costCenter: workTypeToCostCenter(wt), source });
  };
  parsed.globalWorkTypes.forEach((wt) => addTask(wt, null));
  parsed.rooms.forEach((r) => r.suggestedWorkTypes.forEach((wt) => addTask(wt, r.name)));

  if (rooms.length === 0 && tasks.length === 0) return null;

  const answered = new Set([...base.answered, 'describe', 'scope']);
  if (rooms.length === 1 && rooms[0].areaSqm) answered.add('size');

  return {
    ...base,
    projectType: 'other',
    projectName: base.projectName ?? opts.defaultName,
    rooms: rooms.length ? rooms : base.rooms,
    tasks,
    answered: [...answered],
  };
}

/**
 * Merge an LLM-parsed result INTO an existing draft (folder ingest, Fas C).
 * Unlike seedDraftFromParse (which replaces), this ADDS to whatever the draft
 * already holds — deduping rooms by name and tasks by workType:roomName — and
 * stamps each newly-added line with its file provenance. Folding one file's
 * parse after another this way is how a whole dropped folder becomes one draft
 * without any source clobbering another. Pure, so it is unit-testable.
 */
export function mergeParseIntoDraft(
  parsed: AIParsedResult,
  draft: ProjectDraft,
  opts: { sourceKind: ProvenanceKind; fileName?: string }
): ProjectDraft {
  const known = new Set<WorkType>(getWorkTypes().map((w) => w.value));
  const source: Provenance = { kind: opts.sourceKind, fileName: opts.fileName };

  const next: ProjectDraft = {
    ...draft,
    rooms: [...draft.rooms],
    tasks: [...draft.tasks],
    answered: [...draft.answered],
  };

  const roomKey = (name: string) => name.trim().toLowerCase();
  // Map lowercased name → the canonical display name already in the draft, so a
  // differently-cased room in a later file ("kök" vs "Kök") folds into the same
  // room AND its tasks reference the name that actually exists in the room list.
  const canonical = new Map<string, string>();
  next.rooms.forEach((r) => canonical.set(roomKey(r.name), r.name));
  const addRoom = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || canonical.has(roomKey(trimmed))) return;
    canonical.set(roomKey(trimmed), trimmed);
    next.rooms.push({ name: trimmed, source });
  };
  parsed.rooms.forEach((r) => addRoom(r.name));
  (parsed.otherSpaces ?? []).forEach((r) => addRoom(r.name));
  const canonRoom = (name: string | null): string | null =>
    name == null ? null : canonical.get(roomKey(name)) ?? name.trim();

  const taskSeen = new Set(next.tasks.map((t) => `${t.workType}:${t.roomName ?? ''}`));
  const addTask = (wt: WorkType, roomName: string | null) => {
    if (!known.has(wt)) return;
    const key = `${wt}:${roomName ?? ''}`;
    if (taskSeen.has(key)) return;
    taskSeen.add(key);
    next.tasks.push({ workType: wt, roomName, costCenter: workTypeToCostCenter(wt), source });
  };
  parsed.globalWorkTypes.forEach((wt) => addTask(wt, null));
  parsed.rooms.forEach((r) => r.suggestedWorkTypes.forEach((wt) => addTask(wt, canonRoom(r.name))));

  // The first usable ingest fixes the project shape so the flow skips the
  // type/scope questions and only asks for what a folder can't give (size,
  // address, budget). Never override a type the user already chose.
  if (!next.projectType && (next.rooms.length > 0 || next.tasks.length > 0)) {
    next.projectType = 'other';
  }
  if (!next.answered.includes('describe')) next.answered.push('describe');
  // Only skip the scope question when the ingest actually yielded tasks — a
  // rooms-only source (e.g. a floor-plan sketch) still needs "what's being
  // done?" answered, otherwise the project is born without any work.
  if (next.tasks.length > 0 && !next.answered.includes('scope')) next.answered.push('scope');
  return next;
}

/** One priced line from a contractor's own quote-PDF (K4). */
export interface QuoteLine {
  /** The line's work description — becomes the task's own title. */
  title: string;
  /** Preserved price in SEK (rides through to the sellable quote via K1). */
  priceSek: number;
}

/**
 * Fold a contractor's own quote line items into the draft as priced tasks (K4).
 * Each line becomes a named cost task (workType 'annat', like K3 overhead) that
 * carries its ORIGINAL price — so the post-birth quote offer (K1) prefills the
 * contractor's actual pricing instead of a re-estimate. Deduped on title so a
 * quote dropped alongside its own restated copy doesn't double up. The lines are
 * project-wide (no room), so the room gap-fill leaves them alone by design.
 */
export function mergeQuoteLinesIntoDraft(
  lines: QuoteLine[],
  draft: ProjectDraft,
  opts: { fileName?: string }
): ProjectDraft {
  const source: Provenance = { kind: 'document', fileName: opts.fileName };
  const next: ProjectDraft = {
    ...draft,
    rooms: [...draft.rooms],
    tasks: [...draft.tasks],
    answered: [...draft.answered],
  };
  const seen = new Set(
    next.tasks.filter((t) => t.customTitle).map((t) => t.customTitle!.trim().toLowerCase())
  );
  for (const line of lines) {
    const title = line.title.trim();
    if (!title || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    next.tasks.push({
      workType: 'annat',
      roomName: null,
      costCenter: workTypeToCostCenter('annat'),
      customTitle: title,
      budgetSek: line.priceSek > 0 ? line.priceSek : null,
      source,
    });
  }
  if (!next.projectType && next.tasks.length > 0) next.projectType = 'other';
  if (!next.answered.includes('describe')) next.answered.push('describe');
  if (next.tasks.length > 0 && !next.answered.includes('scope')) next.answered.push('scope');
  return next;
}

// ---------------------------------------------------------------------------
// E1: contractor calc suggestion — Renaida fills, the planning table owns truth
// ---------------------------------------------------------------------------

/**
 * Builder-profile defaults feeding the calc suggestion. The SOURCE OF TRUTH is
 * profiles.default_hourly_rate + profiles.estimation_settings (edited on the
 * Profile page, parsed by parseEstimationSettings) — Renaida never keeps her
 * own copy of the builder's rates.
 */
export interface CalcProfileDefaults {
  defaultHourlyRate: number | null;
  settings: Partial<RecipeEstimationSettings>;
}

/**
 * A draft room the estimation engine can work with. Wall-area work (paint/tile)
 * needs a perimeter we don't have at birth — assume a square room (perimeter =
 * 4·√area). Honest for a rough estimate; Fas D floor-plan geometry refines it.
 */
function draftRoomToRecipeRoom(room: DraftRoom): RecipeRoom | null {
  const area = room.areaSqm ?? null;
  if (!area || area <= 0) return null;
  const sideMm = Math.sqrt(area) * 1000;
  return {
    dimensions: { area_sqm: area, perimeter_mm: 4 * sideMm },
    ceiling_height_mm: room.ceilingHeightMm ?? null,
  };
}

/** Tasks the calc suggestion could actually estimate (drives the calc step). */
export function calcEligibleTaskCount(draft: ProjectDraft): number {
  const rooms = new Map<string, RecipeRoom>();
  for (const r of draft.rooms) {
    const rec = draftRoomToRecipeRoom(r);
    if (rec) rooms.set(r.name.trim().toLowerCase(), rec);
  }
  if (rooms.size === 0) return 0;
  return draft.tasks.filter(
    (t) =>
      !t.excluded &&
      t.budgetSek == null && // K4 real prices are never re-estimated
      t.roomName != null &&
      rooms.has(t.roomName.trim().toLowerCase()) &&
      // Only count work the engine actually recognizes (paint/floor/tile/…)
      detectWorkType({ cost_center: t.costCenter, title: t.customTitle ?? '' }) != null
  ).length;
}

/**
 * Prefill the builder calc on the draft: labor hours from the estimation engine
 * (productivity rates × room area), the builder's own hourly rate, material cost
 * from the recipe, and a human-readable formula (calcNote) for explainability.
 * Pure — the caller fetches profile defaults and decides when to apply (only on
 * calcLevel 'suggest'). Tasks it can't estimate are left untouched; K4-priced
 * and excluded tasks are never touched.
 */
export function estimateDraftCalc(
  draft: ProjectDraft,
  profile: CalcProfileDefaults
): ProjectDraft {
  const rooms = new Map<string, RecipeRoom>();
  for (const r of draft.rooms) {
    const rec = draftRoomToRecipeRoom(r);
    if (rec) rooms.set(r.name.trim().toLowerCase(), rec);
  }
  if (rooms.size === 0) return draft;

  const tasks = draft.tasks.map((t) => {
    if (t.excluded || t.budgetSek != null || t.roomName == null) return t;
    const room = rooms.get(t.roomName.trim().toLowerCase());
    if (!room) return t;
    const est = estimateTaskMultiRoom(
      { cost_center: t.costCenter, title: t.customTitle ?? '' },
      [room],
      profile.settings
    );
    if (!est || est.estimatedHours <= 0) return t;

    const materialTotal =
      (est.material?.totalCost ?? 0) +
      est.extraMaterials.reduce((s, m) => s + (m.totalCost ?? 0), 0);
    const areaLabel = est.areaType === 'wall' ? 'm² vägg' : 'm² golv';
    const noteParts = [
      `${est.totalAreaSqm} ${areaLabel} ÷ ${est.productivityRate} m²/h ≈ ${est.estimatedHours} h`,
    ];
    if (est.material?.formula) noteParts.push(est.material.formula);

    return {
      ...t,
      estimatedHours: est.estimatedHours,
      hourlyRateSek: profile.defaultHourlyRate,
      materialEstimateSek: materialTotal > 0 ? Math.round(materialTotal) : null,
      calcNote: noteParts.join(' · '),
    };
  });

  return { ...draft, tasks };
}

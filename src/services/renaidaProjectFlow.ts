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

export type ProjectTypeId = 'bathroom' | 'kitchen' | 'paint' | 'floor' | 'other';
export type UserType = 'homeowner' | 'contractor';

export interface DraftRoom {
  name: string;
  areaSqm?: number | null;
  ceilingHeightMm?: number | null;
}

export interface DraftTask {
  /** Language-neutral — the title is derived from this + roomName at render time. */
  workType: WorkType;
  roomName: string | null;
  costCenter: string;
}

export interface ProjectDraft {
  projectType?: ProjectTypeId;
  /** User-entered/derived name; may be undefined until named. */
  projectName?: string;
  address?: string;
  rooms: DraftRoom[];
  tasks: DraftTask[];
  totalBudget?: number | null;
  /** Step ids already answered (incl. skipped) — drives the conditional flow. */
  answered: string[];
}

export const emptyDraft = (): ProjectDraft => ({ rooms: [], tasks: [], answered: [] });

/** Resolves a work type to a localized label (caller passes an i18n-backed fn). */
export type WorkTypeLabeller = (workType: WorkType) => string;

/** Localized task title from language-neutral parts. */
export function taskTitle(task: DraftTask, labelFor: WorkTypeLabeller): string {
  const label = labelFor(task.workType);
  return task.roomName ? `${label} – ${task.roomName}` : label;
}

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
  paint: { roomNameKey: 'renaidaFlow.room.generic', nameKey: 'renaidaFlow.name.paint' },
  floor: { roomNameKey: 'renaidaFlow.room.generic', nameKey: 'renaidaFlow.name.floor' },
  other: { roomNameKey: 'renaidaFlow.room.generic', nameKey: 'renaidaFlow.name.other' },
};

const TYPE_CHIPS: Chip[] = [
  { id: 'bathroom', labelKey: 'renaidaFlow.type.bathroom' },
  { id: 'kitchen', labelKey: 'renaidaFlow.type.kitchen' },
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
  floor: [
    { id: 'wood', labelKey: 'renaidaFlow.scope.wood', workTypes: ['golv'] },
    { id: 'vinyl', labelKey: 'renaidaFlow.scope.vinyl', workTypes: ['golv'] },
    { id: 'tile', labelKey: 'renaidaFlow.scope.tileFloor', workTypes: ['golv', 'kakel'] },
  ],
  other: (['rivning', 'snickeri', 'el', 'vvs', 'kakel', 'malning', 'golv', 'fonster_dorrar', 'tak', 'fasad'] as WorkType[]).map(
    (wt) => ({ id: wt, labelKey: `intake.workType.${wt}`, workTypes: [wt] })
  ),
};

const SCOPE_MESSAGE_KEY: Record<ProjectTypeId, string> = {
  bathroom: 'renaidaFlow.q.scope.bathroom',
  kitchen: 'renaidaFlow.q.scope.kitchen',
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
  if (!answered(draft, 'size')) {
    return {
      id: 'size',
      messageKey: 'renaidaFlow.q.size',
      messageVars: { room: roomLabel ?? draft.rooms[0]?.name ?? '' },
      input: { kind: 'number', placeholderKey: 'renaidaFlow.ph.size', unit: 'm²', skipKey: 'renaidaFlow.skip.dontKnow' },
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
      next.rooms = [{ name: labels?.roomName ?? answer.labels[0] }];
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
      }));
      break;
    }
    case 'size': {
      if (answer.kind === 'number' && next.rooms[0]) {
        next.rooms = [{ ...next.rooms[0], areaSqm: answer.value }];
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

/** Map the accumulated draft onto the shared scaffoldProject engine's input. */
export function toScaffoldInput(draft: ProjectDraft, labelFor: WorkTypeLabeller): ScaffoldProjectInput {
  return {
    project: {
      name: draft.projectName?.trim() || 'Nytt projekt',
      address: draft.address ?? null,
      country: 'SE',
      status: 'planning',
      totalBudget: draft.totalBudget ?? null,
    },
    rooms: draft.rooms.map((r) => ({
      name: r.name,
      ceilingHeightMm: r.ceilingHeightMm ?? null,
      dimensions: r.areaSqm ? { area_sqm: r.areaSqm } : null,
    })),
    tasks: draft.tasks.map((t) => ({
      title: taskTitle(t, labelFor),
      roomName: t.roomName,
      costCenter: t.costCenter,
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
  opts: { defaultName: string }
): ProjectDraft | null {
  const known = new Set<WorkType>(getWorkTypes().map((w) => w.value));

  const rooms: DraftRoom[] = [
    ...parsed.rooms.map((r) => ({ name: r.name })),
    ...(parsed.otherSpaces ?? []).map((r) => ({ name: r.name })),
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
    tasks.push({ workType: wt, roomName, costCenter: workTypeToCostCenter(wt) });
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

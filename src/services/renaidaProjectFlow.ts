/**
 * Renaida-led project creation — deterministic conversational flow (Phase 0).
 *
 * A leading, conditional question flow that builds a project draft bit by bit
 * instead of asking the user to describe everything in one freetext box. Each
 * answered question mutates the draft; the UI materializes the draft live.
 *
 * This is the seam where Phase 1 will swap the deterministic `nextStep()` for
 * an LLM that generates the next question + suggestions from the draft. The
 * draft → scaffoldProject mapping stays the same either way, so the whole flow
 * is just a human-friendly front-end over the scaffold engine's command surface.
 */

import type { WorkType } from './workTypeUtils';
import { workTypeToCostCenter } from './workTypeUtils';
import type { ScaffoldProjectInput } from './scaffoldProject';

export type ProjectTypeId = 'bathroom' | 'kitchen' | 'paint' | 'floor' | 'other';

export interface DraftRoom {
  name: string;
  areaSqm?: number | null;
  ceilingHeightMm?: number | null;
}

export interface DraftTask {
  title: string;
  roomName: string | null;
  costCenter: string;
  workType: WorkType;
}

export interface ProjectDraft {
  projectType?: ProjectTypeId;
  projectName?: string;
  address?: string;
  rooms: DraftRoom[];
  tasks: DraftTask[];
  totalBudget?: number | null;
  /** Step ids already answered (incl. skipped) — drives the conditional flow. */
  answered: string[];
}

export const emptyDraft = (): ProjectDraft => ({ rooms: [], tasks: [], answered: [] });

// ── Steps ────────────────────────────────────────────────────────────────

export interface Chip {
  id: string;
  label: string;
  hint?: string;
}

export type StepInput =
  | { kind: 'chips'; options: Chip[]; multi?: boolean; skipLabel?: string }
  | { kind: 'text'; placeholder?: string; skipLabel?: string }
  | { kind: 'number'; placeholder?: string; unit?: string; skipLabel?: string };

export interface Step {
  id: string;
  /** Renaida's line (Swedish — the product's primary language). */
  message: string;
  input: StepInput;
}

export type Answer =
  | { kind: 'chips'; ids: string[]; labels: string[] }
  | { kind: 'text'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'skip' };

// ── Swedish labels + domain mapping ────────────────────────────────────────

const WORK_TYPE_LABEL_SV: Record<WorkType, string> = {
  rivning: 'Rivning',
  el: 'El',
  vvs: 'VVS',
  kakel: 'Kakel & klinker',
  snickeri: 'Snickeri',
  malning: 'Målning',
  golv: 'Golv',
  kok: 'Kök',
  badrum: 'Badrum',
  fonster_dorrar: 'Fönster & dörrar',
  fasad: 'Fasad',
  tak: 'Tak',
  tradgard: 'Trädgård',
  annat: 'Annat',
};

const PROJECT_TYPES: Array<{ id: ProjectTypeId; label: string; roomName: string; projectName: string }> = [
  { id: 'bathroom', label: 'Badrum', roomName: 'Badrum', projectName: 'Badrumsrenovering' },
  { id: 'kitchen', label: 'Kök', roomName: 'Kök', projectName: 'Köksrenovering' },
  { id: 'paint', label: 'Måla om', roomName: 'Rum', projectName: 'Måla om' },
  { id: 'floor', label: 'Nytt golv', roomName: 'Rum', projectName: 'Golvbyte' },
  { id: 'other', label: 'Annat', roomName: 'Rum', projectName: 'Renoveringsprojekt' },
];

/** Scope chip → the work types (= tasks) it expands into, per project type. */
const SCOPE_BY_TYPE: Record<ProjectTypeId, { message: string; chips: Array<{ id: string; label: string; workTypes: WorkType[] }> }> = {
  bathroom: {
    message: 'Vad ska göras i badrummet? Välj det som ingår — jag lägger till arbetena åt dig.',
    chips: [
      { id: 'total', label: 'Totalrenovering', workTypes: ['rivning', 'vvs', 'el', 'kakel', 'malning', 'golv'] },
      { id: 'surfaces', label: 'Kakel & klinker', workTypes: ['kakel'] },
      { id: 'fixtures', label: 'Porslin & blandare', workTypes: ['vvs'] },
      { id: 'paint', label: 'Måla om', workTypes: ['malning'] },
      { id: 'floor', label: 'Nytt golv', workTypes: ['golv'] },
      { id: 'electrical', label: 'El (belysning/uttag)', workTypes: ['el'] },
    ],
  },
  kitchen: {
    message: 'Vad ska göras i köket?',
    chips: [
      { id: 'total', label: 'Totalrenovering', workTypes: ['rivning', 'snickeri', 'vvs', 'el', 'kakel', 'malning', 'golv'] },
      { id: 'cabinets', label: 'Stommar & luckor', workTypes: ['snickeri'] },
      { id: 'appliances', label: 'Vitvaror & VVS', workTypes: ['vvs'] },
      { id: 'splash', label: 'Stänkskydd/kakel', workTypes: ['kakel'] },
      { id: 'paint', label: 'Måla om', workTypes: ['malning'] },
      { id: 'floor', label: 'Nytt golv', workTypes: ['golv'] },
    ],
  },
  paint: {
    message: 'Vad ska målas?',
    chips: [
      { id: 'walls', label: 'Väggar', workTypes: ['malning'] },
      { id: 'ceiling', label: 'Tak', workTypes: ['malning'] },
      { id: 'trim', label: 'Foder & snickerier', workTypes: ['malning', 'snickeri'] },
    ],
  },
  floor: {
    message: 'Vilken typ av golv?',
    chips: [
      { id: 'wood', label: 'Trä/parkett', workTypes: ['golv'] },
      { id: 'vinyl', label: 'Vinyl/laminat', workTypes: ['golv'] },
      { id: 'tile', label: 'Klinker', workTypes: ['golv', 'kakel'] },
    ],
  },
  other: {
    message: 'Vilka arbeten ingår? Välj alla som gäller.',
    chips: (['rivning', 'snickeri', 'el', 'vvs', 'kakel', 'malning', 'golv', 'fonster_dorrar', 'tak', 'fasad'] as WorkType[]).map(
      (wt) => ({ id: wt, label: WORK_TYPE_LABEL_SV[wt], workTypes: [wt] })
    ),
  },
};

// ── Conditional flow ───────────────────────────────────────────────────────

const answered = (draft: ProjectDraft, id: string) => draft.answered.includes(id);

/** The next question, or null when the draft has enough to create the project. */
export function nextStep(draft: ProjectDraft): Step | null {
  if (!draft.projectType) {
    return {
      id: 'type',
      message: 'Hej! Jag är Renaida — jag hjälper dig skapa projektet steg för steg. Vad vill du börja med?',
      input: { kind: 'chips', options: PROJECT_TYPES.map((p) => ({ id: p.id, label: p.label })) },
    };
  }
  if (!answered(draft, 'scope')) {
    const scope = SCOPE_BY_TYPE[draft.projectType];
    return {
      id: 'scope',
      message: scope.message,
      input: { kind: 'chips', options: scope.chips.map((c) => ({ id: c.id, label: c.label })), multi: true },
    };
  }
  if (!answered(draft, 'size')) {
    const room = draft.rooms[0]?.name ?? 'rummet';
    return {
      id: 'size',
      message: `Hur stort är ${room.toLowerCase()}? Ungefärlig yta räcker — den hjälper till att uppskatta material och tid.`,
      input: { kind: 'number', placeholder: 't.ex. 6', unit: 'm²', skipLabel: 'Vet inte än' },
    };
  }
  if (!answered(draft, 'address')) {
    return {
      id: 'address',
      message: 'Var ligger projektet? (Adress är valfritt — men gör det lättare att hålla isär flera projekt.)',
      input: { kind: 'text', placeholder: 't.ex. Storgatan 5, Stockholm', skipLabel: 'Hoppa över' },
    };
  }
  if (!answered(draft, 'budget')) {
    return {
      id: 'budget',
      message: 'Har du en ungefärlig budget i tankarna? Den blir en riktlinje du kan justera när som helst.',
      input: { kind: 'number', placeholder: 't.ex. 150000', unit: 'kr', skipLabel: 'Ingen budget än' },
    };
  }
  return null;
}

/** Apply an answer to the draft, returning a new draft. */
export function applyAnswer(step: Step, answer: Answer, draft: ProjectDraft): ProjectDraft {
  const next: ProjectDraft = { ...draft, rooms: [...draft.rooms], tasks: [...draft.tasks], answered: [...draft.answered] };
  if (!next.answered.includes(step.id)) next.answered.push(step.id);

  switch (step.id) {
    case 'type': {
      if (answer.kind !== 'chips' || !answer.ids[0]) break;
      const type = PROJECT_TYPES.find((p) => p.id === answer.ids[0]);
      if (!type) break;
      next.projectType = type.id;
      next.projectName = type.projectName;
      next.rooms = [{ name: type.roomName }];
      break;
    }
    case 'scope': {
      if (answer.kind !== 'chips' || !next.projectType) break;
      const scope = SCOPE_BY_TYPE[next.projectType];
      const roomName = next.rooms[0]?.name ?? null;
      const workTypes = new Set<WorkType>();
      for (const id of answer.ids) {
        scope.chips.find((c) => c.id === id)?.workTypes.forEach((wt) => workTypes.add(wt));
      }
      next.tasks = [...workTypes].map((wt) => ({
        title: roomName ? `${WORK_TYPE_LABEL_SV[wt]} – ${roomName}` : WORK_TYPE_LABEL_SV[wt],
        roomName,
        costCenter: workTypeToCostCenter(wt),
        workType: wt,
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
        // Refine the project name with the address for easier disambiguation.
        const base = PROJECT_TYPES.find((p) => p.id === next.projectType)?.projectName ?? 'Projekt';
        next.projectName = `${base} – ${answer.value.trim()}`;
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

export const isComplete = (draft: ProjectDraft): boolean => nextStep(draft) === null;

/** Map the accumulated draft onto the shared scaffoldProject engine's input. */
export function toScaffoldInput(draft: ProjectDraft): ScaffoldProjectInput {
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
      title: t.title,
      roomName: t.roomName,
      costCenter: t.costCenter,
    })),
    markOnboardingComplete: true,
  };
}

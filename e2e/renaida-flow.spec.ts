import { test, expect } from '@playwright/test';
import {
  emptyDraft,
  nextStep,
  applyAnswer,
  toScaffoldInput,
  seedDraftFromParse,
} from '../src/services/renaidaProjectFlow';
import type { AIParsedResult } from '../src/components/project/overview/planning-wizard/types';

/**
 * Unit-style checks for the deterministic Renaida project-creation flow.
 * Pure logic (no browser) — the flow's only runtime dependency is the pure
 * workType→costCenter map; the scaffoldProject import is type-only.
 */

test('bathroom total renovation → room, tasks with cost centers, budget, name', () => {
  let d = emptyDraft();

  let s = nextStep(d)!;
  expect(s.id).toBe('describe');
  d = applyAnswer(s, { kind: 'skip' }, d); // deterministic path — skip the free-text jumpstart

  s = nextStep(d)!;
  expect(s.id).toBe('type');
  d = applyAnswer(s, { kind: 'chips', ids: ['bathroom'], labels: ['Badrum'] }, d);
  expect(d.rooms[0].name).toBe('Badrum');

  s = nextStep(d)!;
  expect(s.id).toBe('scope');
  d = applyAnswer(s, { kind: 'chips', ids: ['total'], labels: ['Totalrenovering'] }, d);
  expect(d.tasks.length).toBeGreaterThanOrEqual(5);
  expect(d.tasks.every((t) => t.roomName === 'Badrum')).toBe(true);

  s = nextStep(d)!;
  expect(s.id).toBe('addons');
  d = applyAnswer(s, { kind: 'chips', ids: ['vanity'], labels: ['Kommod'] }, d); // → snickeri
  expect(d.tasks.some((t) => t.workType === 'snickeri')).toBe(true);

  s = nextStep(d)!;
  expect(s.id).toBe('size');
  d = applyAnswer(s, { kind: 'number', value: 6 }, d);
  expect(d.rooms[0].areaSqm).toBe(6);

  s = nextStep(d)!;
  expect(s.id).toBe('address');
  d = applyAnswer(s, { kind: 'text', value: 'Storgatan 5' }, d);
  expect(d.address).toBe('Storgatan 5');

  s = nextStep(d)!;
  expect(s.id).toBe('budget');
  d = applyAnswer(s, { kind: 'number', value: 150000 }, d);

  expect(nextStep(d)).toBeNull();

  const input = toScaffoldInput(d, (wt) => wt);
  expect(input.project?.name).toContain('Storgatan 5');
  expect(input.project?.totalBudget).toBe(150000);
  expect(input.rooms[0].dimensions).toEqual({ area_sqm: 6 });
  expect(input.tasks.length).toBe(d.tasks.length);
  // Cost centers resolved from the work-type map (e.g. VVS → plumbing).
  expect(input.tasks.some((t) => t.costCenter === 'plumbing')).toBe(true);
  expect(input.tasks.some((t) => t.costCenter === 'tiling')).toBe(true);
});

test('scope drives conditional task set (surfaces only → one tiling task)', () => {
  let d = emptyDraft();
  d = applyAnswer(nextStep(d)!, { kind: 'skip' }, d); // describe
  d = applyAnswer(nextStep(d)!, { kind: 'chips', ids: ['bathroom'], labels: ['Badrum'] }, d);
  d = applyAnswer(nextStep(d)!, { kind: 'chips', ids: ['surfaces'], labels: ['Kakel & klinker'] }, d);
  expect(d.tasks.length).toBe(1);
  expect(d.tasks[0].costCenter).toBe('tiling');
});

test('optional steps can be skipped and the draft still completes', () => {
  let d = emptyDraft();
  d = applyAnswer(nextStep(d)!, { kind: 'skip' }, d); // describe
  d = applyAnswer(nextStep(d)!, { kind: 'chips', ids: ['paint'], labels: ['Måla om'] }, d);
  d = applyAnswer(nextStep(d)!, { kind: 'chips', ids: ['walls'], labels: ['Väggar'] }, d);
  d = applyAnswer(nextStep(d)!, { kind: 'skip' }, d); // addons
  d = applyAnswer(nextStep(d)!, { kind: 'skip' }, d); // size
  d = applyAnswer(nextStep(d)!, { kind: 'skip' }, d); // address
  d = applyAnswer(nextStep(d)!, { kind: 'skip' }, d); // budget
  expect(nextStep(d)).toBeNull();

  const input = toScaffoldInput(d, (wt) => wt);
  expect(input.rooms[0].dimensions).toBeNull();
  expect(input.project?.totalBudget).toBeNull();
  expect(input.tasks.length).toBeGreaterThanOrEqual(1);
});

test('LLM jumpstart: parsed description seeds rooms + tasks and skips covered steps', () => {
  const parsed: AIParsedResult = {
    totalAreaSqm: 6,
    rooms: [{ nameKey: 'bathroom', name: 'Badrum', suggestedWorkTypes: ['kakel', 'vvs'] }],
    otherSpaces: [],
    globalWorkTypes: ['malning'],
  } as AIParsedResult;

  const seeded = seedDraftFromParse(parsed, emptyDraft(), { defaultName: 'Renoveringsprojekt' });
  expect(seeded).not.toBeNull();
  const d = seeded!;
  expect(d.rooms.length).toBe(1);
  expect(d.rooms[0].areaSqm).toBe(6); // single room adopts the whole-property area
  expect(d.tasks.length).toBe(3); // global painting + per-room tiling & plumbing
  expect(d.tasks.some((t) => t.workType === 'malning' && t.roomName === null)).toBe(true);
  expect(d.tasks.some((t) => t.workType === 'kakel' && t.roomName === 'Badrum')).toBe(true);
  // The steps the LLM covered are marked answered → only the gaps remain.
  expect(d.answered).toEqual(expect.arrayContaining(['describe', 'scope', 'size']));
  expect(nextStep(d, 'homeowner', d.rooms[0].name)!.id).toBe('address');

  const input = toScaffoldInput(d, (wt) => wt);
  expect(input.rooms[0].dimensions).toEqual({ area_sqm: 6 });
  expect(input.tasks.length).toBe(3);
});

test('add-on suggestions are conditional on type and add extra tasks (deduped)', () => {
  let d = emptyDraft();
  d = applyAnswer(nextStep(d)!, { kind: 'skip' }, d); // describe
  d = applyAnswer(nextStep(d)!, { kind: 'chips', ids: ['bathroom'], labels: ['Badrum'] }, d);
  d = applyAnswer(nextStep(d)!, { kind: 'chips', ids: ['paint'], labels: ['Måla om'] }, d); // scope → malning only
  const before = d.tasks.length;

  const s = nextStep(d)!;
  expect(s.id).toBe('addons');
  // underfloor → el + golv, vanity → snickeri = 3 new tasks
  d = applyAnswer(s, { kind: 'chips', ids: ['underfloor', 'vanity'], labels: ['Golvvärme', 'Kommod'] }, d);
  expect(d.tasks.length).toBe(before + 3);
  expect(d.tasks.some((t) => t.workType === 'snickeri')).toBe(true);
  expect(d.tasks.some((t) => t.workType === 'el')).toBe(true);

  // Applying the same add-on again is deduped (no duplicate tasks).
  const d2 = applyAnswer(s, { kind: 'chips', ids: ['underfloor'], labels: ['Golvvärme'] }, d);
  expect(d2.tasks.length).toBe(d.tasks.length);
});

test('LLM jumpstart returns null when nothing usable was parsed', () => {
  const parsed = { totalAreaSqm: null, rooms: [], otherSpaces: [], globalWorkTypes: [] } as AIParsedResult;
  expect(seedDraftFromParse(parsed, emptyDraft(), { defaultName: 'x' })).toBeNull();
});

import { test, expect } from '@playwright/test';
import {
  emptyDraft,
  nextStep,
  applyAnswer,
  toScaffoldInput,
} from '../src/services/renaidaProjectFlow';

/**
 * Unit-style checks for the deterministic Renaida project-creation flow.
 * Pure logic (no browser) — the flow's only runtime dependency is the pure
 * workType→costCenter map; the scaffoldProject import is type-only.
 */

test('bathroom total renovation → room, tasks with cost centers, budget, name', () => {
  let d = emptyDraft();

  let s = nextStep(d)!;
  expect(s.id).toBe('type');
  d = applyAnswer(s, { kind: 'chips', ids: ['bathroom'], labels: ['Badrum'] }, d);
  expect(d.rooms[0].name).toBe('Badrum');

  s = nextStep(d)!;
  expect(s.id).toBe('scope');
  d = applyAnswer(s, { kind: 'chips', ids: ['total'], labels: ['Totalrenovering'] }, d);
  expect(d.tasks.length).toBeGreaterThanOrEqual(5);
  expect(d.tasks.every((t) => t.roomName === 'Badrum')).toBe(true);

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
  d = applyAnswer(nextStep(d)!, { kind: 'chips', ids: ['bathroom'], labels: ['Badrum'] }, d);
  d = applyAnswer(nextStep(d)!, { kind: 'chips', ids: ['surfaces'], labels: ['Kakel & klinker'] }, d);
  expect(d.tasks.length).toBe(1);
  expect(d.tasks[0].costCenter).toBe('tiling');
});

test('optional steps can be skipped and the draft still completes', () => {
  let d = emptyDraft();
  d = applyAnswer(nextStep(d)!, { kind: 'chips', ids: ['paint'], labels: ['Måla om'] }, d);
  d = applyAnswer(nextStep(d)!, { kind: 'chips', ids: ['walls'], labels: ['Väggar'] }, d);
  d = applyAnswer(nextStep(d)!, { kind: 'skip' }, d); // size
  d = applyAnswer(nextStep(d)!, { kind: 'skip' }, d); // address
  d = applyAnswer(nextStep(d)!, { kind: 'skip' }, d); // budget
  expect(nextStep(d)).toBeNull();

  const input = toScaffoldInput(d, (wt) => wt);
  expect(input.rooms[0].dimensions).toBeNull();
  expect(input.project?.totalBudget).toBeNull();
  expect(input.tasks.length).toBeGreaterThanOrEqual(1);
});

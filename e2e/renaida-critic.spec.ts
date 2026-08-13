import { test, expect } from '@playwright/test';
import {
  emptyDraft,
  nextStep,
  applyAnswer,
  applyCriticFlags,
  toScaffoldInput,
  taskTitle,
  type ProjectDraft,
  type CriticFlag,
} from '../src/services/renaidaProjectFlow';

/**
 * Fas C+ "missing-something" critic — pure flow logic (no browser, no LLM).
 * The critic is the LAST step before birth: it only appears when the draft has
 * tasks, a skip marks it answered, and accepted flags become customTitle tasks
 * with 'critic' provenance, deduped by title and room-scoped when possible.
 */

/** Walk a fresh draft up to (but not past) the critic step. */
function draftAtCritic(): ProjectDraft {
  let d = emptyDraft();
  d = applyAnswer(nextStep(d)!, { kind: 'skip' }, d); // describe
  d = applyAnswer(nextStep(d)!, { kind: 'chips', ids: ['bathroom'], labels: ['Badrum'] }, d);
  d = applyAnswer(nextStep(d)!, { kind: 'chips', ids: ['surfaces'], labels: ['Kakel'] }, d); // scope
  d = applyAnswer(nextStep(d)!, { kind: 'skip' }, d); // addons
  d = applyAnswer(nextStep(d)!, { kind: 'number', value: 6 }, d); // size
  d = applyAnswer(nextStep(d)!, { kind: 'skip' }, d); // address
  d = applyAnswer(nextStep(d)!, { kind: 'skip' }, d); // budget
  return d;
}

test('critic is the last step before completion, once, and skippable', () => {
  let d = draftAtCritic();
  const s = nextStep(d)!;
  expect(s.id).toBe('critic');

  d = applyAnswer(s, { kind: 'skip' }, d);
  expect(d.answered).toContain('critic');
  expect(nextStep(d)).toBeNull(); // asked once — never loops
});

test('critic never appears when the draft has no tasks', () => {
  const d = emptyDraft();
  // Fresh draft → the flow starts at describe, not critic.
  expect(nextStep(d)!.id).toBe('describe');
  // Even a fully-answered draft without tasks skips the critic gate.
  const answeredAll: ProjectDraft = {
    ...emptyDraft(),
    answered: ['describe', 'type', 'scope', 'addons', 'size', 'address', 'budget'],
    projectType: 'bathroom',
  };
  expect(nextStep(answeredAll)).toBeNull();
});

test('accepted flags become customTitle tasks with critic provenance', () => {
  const d = draftAtCritic();
  const flags: CriticFlag[] = [
    { label: 'Tätskikt', workType: 'kakel', roomName: 'Badrum', reason: 'Krävs i våtrum' },
    { label: 'Rivning', workType: 'rivning' },
  ];
  const next = applyCriticFlags(d, flags);

  expect(next.answered).toContain('critic');
  const added = next.tasks.filter((t) => t.source?.kind === 'critic');
  expect(added.length).toBe(2);

  const tatskikt = added.find((t) => t.customTitle === 'Tätskikt')!;
  expect(tatskikt.workType).toBe('kakel');
  expect(tatskikt.roomName).toBe('Badrum'); // named room matched
  expect(tatskikt.costCenter).toBe('tiling');

  const rivning = added.find((t) => t.customTitle === 'Rivning')!;
  expect(rivning.roomName).toBe('Badrum'); // no room named → falls back to first room

  // The flag's own label IS the task title (the specific item is the point).
  expect(taskTitle(tatskikt, (wt) => wt)).toBe('Tätskikt');

  // Flow completes and the tasks ride into the scaffold.
  expect(nextStep(next)).toBeNull();
  const input = toScaffoldInput(next, (wt) => wt);
  expect(input.tasks.some((t) => t.title === 'Tätskikt')).toBe(true);
});

test('flags dedupe by title (case-insensitive) and ignore empty labels', () => {
  const d = draftAtCritic();
  const once = applyCriticFlags(d, [
    { label: 'Tätskikt', workType: 'kakel' },
    { label: 'tätskikt', workType: 'vvs' }, // same title, different case → dropped
    { label: '   ', workType: 'el' }, // empty → dropped
  ]);
  expect(once.tasks.filter((t) => t.source?.kind === 'critic').length).toBe(1);

  // Re-applying the same flag on a draft that already has it is a no-op.
  const twice = applyCriticFlags(once, [{ label: 'TÄTSKIKT', workType: 'kakel' }]);
  expect(twice.tasks.filter((t) => t.source?.kind === 'critic').length).toBe(1);
});

test('unknown room names fall back to the first room, roomless drafts to null', () => {
  const d = draftAtCritic();
  const next = applyCriticFlags(d, [{ label: 'Ventilation', workType: 'annat', roomName: 'Källaren' }]);
  expect(next.tasks.find((t) => t.customTitle === 'Ventilation')!.roomName).toBe('Badrum');

  const roomless: ProjectDraft = { ...emptyDraft(), tasks: [], rooms: [] };
  const flagged = applyCriticFlags(roomless, [{ label: 'Rivning', workType: 'rivning' }]);
  expect(flagged.tasks[0].roomName).toBeNull();
});

test('excluded critic rows are reversible and skipped at scaffold (Fas B review)', () => {
  const d = draftAtCritic();
  let next = applyCriticFlags(d, [{ label: 'Tätskikt', workType: 'kakel' }]);
  const idx = next.tasks.findIndex((t) => t.customTitle === 'Tätskikt');
  next = { ...next, tasks: next.tasks.map((t, i) => (i === idx ? { ...t, excluded: true } : t)) };

  const input = toScaffoldInput(next, (wt) => wt);
  expect(input.tasks.some((t) => t.title === 'Tätskikt')).toBe(false);
  // Still in the draft — the exclusion is reversible, exactly like Fas B rows.
  expect(next.tasks.some((t) => t.customTitle === 'Tätskikt')).toBe(true);
});

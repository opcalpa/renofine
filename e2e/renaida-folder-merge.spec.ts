import { test, expect } from '@playwright/test';
import {
  emptyDraft,
  mergeParseIntoDraft,
  unattributedTaskCount,
  assignUnattributedTasks,
  nextStep,
  toScaffoldInput,
  type ProjectDraft,
} from '../src/services/renaidaProjectFlow';
import type { AIParsedResult } from '../src/components/project/overview/planning-wizard/types';

/**
 * Unit-style checks for Fas C folder ingest — the pure fold that turns many
 * parsed files into one draft. The network side (ingestProjectFolder) is not
 * exercised here; this proves the merge dedupes and keeps provenance.
 */

const parsed = (
  rooms: Array<{ name: string; work: string[] }>,
  global: string[] = [],
  totalAreaSqm: number | null = null
): AIParsedResult => ({
  propertyType: null,
  floors: null,
  totalAreaSqm,
  rooms: rooms.map((r) => ({ nameKey: r.name, name: r.name, suggestedWorkTypes: r.work as never })),
  otherSpaces: [],
  globalWorkTypes: global as never,
  summary: '',
});

test('two files fold into one draft — rooms/tasks deduped, provenance kept', () => {
  let d: ProjectDraft = emptyDraft();

  // File 1 — a quote PDF: kitchen with carpentry + plumbing.
  d = mergeParseIntoDraft(parsed([{ name: 'Kök', work: ['snickeri', 'vvs'] }]), d, {
    sourceKind: 'document',
    fileName: 'offert.pdf',
  });
  // File 2 — a scope doc: kitchen again (dup) + a new bathroom.
  d = mergeParseIntoDraft(
    parsed([
      { name: 'kök', work: ['vvs', 'el'] }, // 'kök' dedupes vs 'Kök'; vvs dup, el new
      { name: 'Badrum', work: ['kakel'] },
    ]),
    d,
    { sourceKind: 'document', fileName: 'arbetsbeskrivning.pdf' }
  );

  // Rooms: Kök + Badrum (case-insensitive dedupe collapsed the two kitchens).
  expect(d.rooms.map((r) => r.name)).toEqual(['Kök', 'Badrum']);

  // Tasks deduped by workType:roomName.
  const keys = d.tasks.map((t) => `${t.workType}:${t.roomName}`).sort();
  expect(keys).toEqual(['el:Kök', 'kakel:Badrum', 'snickeri:Kök', 'vvs:Kök'].sort());

  // Provenance survives per source file.
  expect(d.rooms.find((r) => r.name === 'Kök')?.source?.fileName).toBe('offert.pdf');
  expect(d.rooms.find((r) => r.name === 'Badrum')?.source?.fileName).toBe('arbetsbeskrivning.pdf');
  expect(d.tasks.find((t) => t.workType === 'el')?.source?.fileName).toBe('arbetsbeskrivning.pdf');

  // The ingest fixed the shape so the flow skips type/scope and asks the rest.
  expect(d.projectType).toBe('other');
  expect(nextStep(d)!.id).toBe('size');

  const input = toScaffoldInput(d, (wt) => wt);
  expect(input.rooms).toHaveLength(2);
  expect(input.tasks).toHaveLength(4);
});

test('merge preserves a room the user already chose (no clobber)', () => {
  let d: ProjectDraft = emptyDraft();
  // User picked bathroom via chips first.
  const type = nextStep(d)!; // describe
  d = { ...d, answered: [...d.answered, 'describe'] };
  d = mergeParseIntoDraft(parsed([{ name: 'Tvättstuga', work: ['vvs'] }]), d, {
    sourceKind: 'photo',
  });
  expect(d.rooms.some((r) => r.name === 'Tvättstuga')).toBe(true);
  expect(d.rooms.find((r) => r.name === 'Tvättstuga')?.source?.kind).toBe('photo');
  expect(type.id).toBe('describe');
});

test('gap fill: global work types + 2+ rooms → flow asks which room', () => {
  let d: ProjectDraft = emptyDraft();
  // A scope doc yields two rooms + two project-wide tasks (no room) → ambiguous.
  d = mergeParseIntoDraft(
    parsed(
      [
        { name: 'Badrum', work: ['kakel'] },
        { name: 'Kök', work: ['snickeri'] },
      ],
      ['rivning', 'malning']
    ),
    d,
    { sourceKind: 'photo' }
  );
  expect(unattributedTaskCount(d)).toBe(2); // rivning + malning have no room

  // The flow surfaces the gap step before finishing.
  const s = nextStep(d)!;
  expect(s.id).toBe('gapRoom');
  expect(s.messageVars?.count).toBe('2');

  // Attribute them to Badrum.
  d = assignUnattributedTasks(d, 'Badrum');
  expect(unattributedTaskCount(d)).toBe(0);
  expect(d.tasks.filter((t) => t.roomName === 'Badrum').map((t) => t.workType).sort()).toEqual(
    ['kakel', 'malning', 'rivning'].sort()
  );
  // Gap answered → flow moves on (not the gap step again).
  expect(nextStep(d)!.id).not.toBe('gapRoom');
});

test('gap fill: a single room is unambiguous → no gap step, stays project-wide', () => {
  let d: ProjectDraft = emptyDraft();
  d = mergeParseIntoDraft(parsed([{ name: 'Badrum', work: ['kakel'] }], ['malning']), d, {
    sourceKind: 'photo',
  });
  expect(unattributedTaskCount(d)).toBe(1);
  // Only one room → no ambiguity → flow proceeds to size, not gapRoom.
  expect(nextStep(d)!.id).toBe('size');
});

test('gap fill: assigning to a new room creates it; dedupe drops a collision', () => {
  let d: ProjectDraft = emptyDraft();
  // 'kakel' exists in Badrum AND as a project-wide task → collision on assign.
  d = mergeParseIntoDraft(parsed([{ name: 'Badrum', work: ['kakel'] }], ['kakel', 'el']), d, {
    sourceKind: 'document',
    fileName: 'scope.txt',
  });
  expect(unattributedTaskCount(d)).toBe(2); // kakel(global) + el(global)

  d = assignUnattributedTasks(d, 'Tvättstuga');
  // New room created.
  expect(d.rooms.some((r) => r.name === 'Tvättstuga')).toBe(true);
  // Both globals attributed to Tvättstuga; no collision here (Badrum≠Tvättstuga).
  expect(d.tasks.filter((t) => t.roomName === 'Tvättstuga').map((t) => t.workType).sort()).toEqual(
    ['el', 'kakel'].sort()
  );
});

test('gap fill: assigning to a room that already has the task dedupes the orphan', () => {
  let d: ProjectDraft = emptyDraft();
  d = mergeParseIntoDraft(parsed([{ name: 'Kök', work: ['el'] }], ['el', 'vvs']), d, {
    sourceKind: 'photo',
  });
  // Assign the two globals (el, vvs) to Kök — 'el:Kök' already exists → drop it.
  d = assignUnattributedTasks(d, 'kök'); // case-insensitive → canonical 'Kök'
  const koksTasks = d.tasks.filter((t) => t.roomName === 'Kök').map((t) => t.workType).sort();
  expect(koksTasks).toEqual(['el', 'vvs'].sort()); // exactly one 'el', not two
});

test('gap fill: skip keeps tasks project-wide but still advances', () => {
  let d: ProjectDraft = emptyDraft();
  d = mergeParseIntoDraft(parsed([{ name: 'Hall', work: ['golv'] }], ['malning']), d, {
    sourceKind: 'document',
    fileName: 'a.pdf',
  });
  d = assignUnattributedTasks(d, null); // "keep project-wide"
  expect(unattributedTaskCount(d)).toBe(1); // still unattributed
  expect(d.answered).toContain('gapRoom');
  expect(nextStep(d)!.id).not.toBe('gapRoom'); // asked once, won't loop
});

test('empty parse leaves the draft shape untouched but marks answered', () => {
  let d: ProjectDraft = emptyDraft();
  d = mergeParseIntoDraft(parsed([], []), d, { sourceKind: 'document', fileName: 'blank.pdf' });
  expect(d.rooms).toHaveLength(0);
  expect(d.tasks).toHaveLength(0);
  // No rooms/tasks → projectType stays undefined (flow still needs a type).
  expect(d.projectType).toBeUndefined();
  expect(d.answered).toContain('describe');
});

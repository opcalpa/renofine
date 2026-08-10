import { test, expect } from '@playwright/test';
import {
  emptyDraft,
  mergeParseIntoDraft,
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

test('empty parse leaves the draft shape untouched but marks answered', () => {
  let d: ProjectDraft = emptyDraft();
  d = mergeParseIntoDraft(parsed([], []), d, { sourceKind: 'document', fileName: 'blank.pdf' });
  expect(d.rooms).toHaveLength(0);
  expect(d.tasks).toHaveLength(0);
  // No rooms/tasks → projectType stays undefined (flow still needs a type).
  expect(d.projectType).toBeUndefined();
  expect(d.answered).toContain('describe');
});

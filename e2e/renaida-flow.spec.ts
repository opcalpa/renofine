import { test, expect } from '@playwright/test';
import {
  emptyDraft,
  nextStep,
  applyAnswer,
  toScaffoldInput,
  seedDraftFromParse,
  deterministicAddons,
  applyAddonWorkTypes,
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

test('contractor sees the customer step; homeowner never does (single tree)', () => {
  // Homeowner: type → scope → (addons) → … no customer step ever.
  let h = emptyDraft();
  h = applyAnswer(nextStep(h, 'homeowner')!, { kind: 'skip' }, h); // describe
  h = applyAnswer(nextStep(h, 'homeowner')!, { kind: 'chips', ids: ['paint'], labels: ['Måla om'] }, h); // type=paint (no addons? paint has addons)
  // Walk to completion, asserting 'customer' never appears for a homeowner.
  let guard = 0;
  let s = nextStep(h, 'homeowner');
  while (s && guard++ < 20) {
    expect(s.id).not.toBe('customer');
    h = applyAnswer(s, { kind: 'skip' }, h);
    s = nextStep(h, 'homeowner');
  }

  // Contractor: after scope, the customer step appears; the answer is stored.
  let c = emptyDraft();
  c = applyAnswer(nextStep(c, 'contractor')!, { kind: 'skip' }, c); // describe
  c = applyAnswer(nextStep(c, 'contractor')!, { kind: 'chips', ids: ['bathroom'], labels: ['Badrum'] }, c); // type
  c = applyAnswer(nextStep(c, 'contractor')!, { kind: 'chips', ids: ['tiles'], labels: ['Kakel'] }, c); // scope
  const cs = nextStep(c, 'contractor')!;
  expect(cs.id).toBe('customer');
  c = applyAnswer(cs, { kind: 'text', value: 'Anna Svensson' }, c);
  expect(c.customerName).toBe('Anna Svensson');
  // Asked once — the step does not reappear.
  let g2 = 0;
  let s2 = nextStep(c, 'contractor');
  while (s2 && g2++ < 20) {
    expect(s2.id).not.toBe('customer');
    c = applyAnswer(s2, { kind: 'skip' }, c);
    s2 = nextStep(c, 'contractor');
  }
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

test('applyAddonWorkTypes (LLM/curated apply path) adds deduped tasks + marks answered', () => {
  let d = emptyDraft();
  d = applyAnswer(nextStep(d)!, { kind: 'skip' }, d); // describe
  d = applyAnswer(nextStep(d)!, { kind: 'chips', ids: ['bathroom'], labels: ['Badrum'] }, d);
  d = applyAnswer(nextStep(d)!, { kind: 'chips', ids: ['paint'], labels: ['Måla om'] }, d); // malning
  const before = d.tasks.length;

  // Simulate an LLM suggestion resolving to snickeri + a duplicate malning.
  const d2 = applyAddonWorkTypes(d, [['snickeri'], ['malning']]);
  expect(d2.answered).toContain('addons');
  expect(d2.tasks.length).toBe(before + 1); // snickeri added, malning deduped
  expect(d2.tasks.some((t) => t.workType === 'snickeri')).toBe(true);

  // Curated fallback list is exposed and non-empty for a bathroom.
  expect(deterministicAddons('bathroom').length).toBeGreaterThan(0);
  expect(deterministicAddons('other').length).toBe(0);
});

test('LLM jumpstart returns null when nothing usable was parsed', () => {
  const parsed = { totalAreaSqm: null, rooms: [], otherSpaces: [], globalWorkTypes: [] } as AIParsedResult;
  expect(seedDraftFromParse(parsed, emptyDraft(), { defaultName: 'x' })).toBeNull();
});

test('new vertical: laundry total → wet-room tasks + curated add-ons, completes', () => {
  let d = emptyDraft();
  d = applyAnswer(nextStep(d)!, { kind: 'skip' }, d); // describe
  d = applyAnswer(nextStep(d)!, { kind: 'chips', ids: ['laundry'], labels: ['Tvättstuga'] }, d);
  expect(d.rooms[0].name).toBe('Tvättstuga');

  d = applyAnswer(nextStep(d)!, { kind: 'chips', ids: ['total'], labels: ['Totalrenovering'] }, d);
  expect(d.tasks.some((t) => t.costCenter === 'plumbing')).toBe(true);
  expect(d.tasks.some((t) => t.costCenter === 'tiling')).toBe(true);

  // Laundry has its own curated add-ons (drying cabinet, utility sink).
  const addonIds = deterministicAddons('laundry').map((a) => a.id);
  expect(addonIds).toContain('dryingCabinet');
  expect(addonIds).toContain('utilitySink');

  const s = nextStep(d)!;
  expect(s.id).toBe('addons');
  d = applyAnswer(s, { kind: 'skip' }, d);
  d = applyAnswer(nextStep(d)!, { kind: 'skip' }, d); // size
  d = applyAnswer(nextStep(d)!, { kind: 'skip' }, d); // address
  d = applyAnswer(nextStep(d)!, { kind: 'skip' }, d); // budget
  expect(nextStep(d)).toBeNull();
});

test('new vertical: basement convert → living-space trades', () => {
  let d = emptyDraft();
  d = applyAnswer(nextStep(d)!, { kind: 'skip' }, d); // describe
  d = applyAnswer(nextStep(d)!, { kind: 'chips', ids: ['basement'], labels: ['Källare'] }, d);
  expect(d.rooms[0].name).toBe('Källare');

  d = applyAnswer(nextStep(d)!, { kind: 'chips', ids: ['convert'], labels: ['Inreda till boyta'] }, d);
  // Converting a basement pulls in demolition, joinery, electrical, paint and flooring.
  const centers = new Set(d.tasks.map((t) => t.costCenter));
  expect(centers.has('demolition')).toBe(true);
  expect(centers.has('carpentry')).toBe(true);
  expect(centers.has('electrical')).toBe(true);
  expect(d.tasks.length).toBe(5);
});

test('provenance: each line is stamped with its source (answer / suggestion)', () => {
  let d = emptyDraft();
  d = applyAnswer(nextStep(d)!, { kind: 'skip' }, d); // describe
  d = applyAnswer(nextStep(d)!, { kind: 'chips', ids: ['bathroom'], labels: ['Badrum'] }, d);
  expect(d.rooms[0].source?.kind).toBe('answer');
  d = applyAnswer(nextStep(d)!, { kind: 'chips', ids: ['total'], labels: ['Totalrenovering'] }, d);
  expect(d.tasks.every((t) => t.source?.kind === 'answer')).toBe(true);

  const before = d.tasks.length;
  d = applyAnswer(nextStep(d)!, { kind: 'chips', ids: ['vanity'], labels: ['Kommod'] }, d); // add-on → snickeri
  expect(d.tasks.slice(before).every((t) => t.source?.kind === 'suggestion')).toBe(true);
});

test('provenance: photo/describe seed stamps the modality as source', () => {
  const parsed: AIParsedResult = {
    totalAreaSqm: 6,
    rooms: [{ nameKey: 'bathroom', name: 'Badrum', suggestedWorkTypes: ['kakel'] }],
    otherSpaces: [],
    globalWorkTypes: ['malning'],
  } as AIParsedResult;
  const seeded = seedDraftFromParse(parsed, emptyDraft(), { defaultName: 'x', sourceKind: 'photo' })!;
  expect(seeded.rooms[0].source?.kind).toBe('photo');
  expect(seeded.tasks.every((t) => t.source?.kind === 'photo')).toBe(true);
});

test('review: excluded tasks stay in the draft but are skipped at creation', () => {
  let d = emptyDraft();
  d = applyAnswer(nextStep(d)!, { kind: 'skip' }, d); // describe
  d = applyAnswer(nextStep(d)!, { kind: 'chips', ids: ['paint'], labels: ['Måla om'] }, d);
  d = applyAnswer(nextStep(d)!, { kind: 'chips', ids: ['walls'], labels: ['Väggar'] }, d);
  expect(d.tasks.length).toBe(1);

  d = { ...d, tasks: d.tasks.map((t, i) => (i === 0 ? { ...t, excluded: true } : t)) };
  expect(d.tasks.length).toBe(1); // still present for restore
  expect(toScaffoldInput(d, (wt) => wt).tasks.length).toBe(0); // but not created
});

test('expert add-on: relocating the floor drain adds demolition + plumbing', () => {
  let d = emptyDraft();
  d = applyAnswer(nextStep(d)!, { kind: 'skip' }, d); // describe
  d = applyAnswer(nextStep(d)!, { kind: 'chips', ids: ['bathroom'], labels: ['Badrum'] }, d);
  // Surfaces-only scope → just tiling, so the add-on's effect is unambiguous.
  d = applyAnswer(nextStep(d)!, { kind: 'chips', ids: ['surfaces'], labels: ['Kakel'] }, d);
  expect(d.tasks.map((t) => t.workType)).toEqual(['kakel']);

  const s = nextStep(d)!;
  expect(s.id).toBe('addons');
  expect(deterministicAddons('bathroom').map((a) => a.id)).toContain('moveDrain');
  d = applyAnswer(s, { kind: 'chips', ids: ['moveDrain'], labels: ['Flytta golvbrunn'] }, d);
  expect(d.tasks.some((t) => t.workType === 'rivning')).toBe(true);
  expect(d.tasks.some((t) => t.workType === 'vvs')).toBe(true);
});

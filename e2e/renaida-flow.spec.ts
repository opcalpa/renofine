import { test, expect } from '@playwright/test';
import {
  emptyDraft,
  nextStep,
  applyAnswer,
  toScaffoldInput,
  seedDraftFromParse,
  deterministicAddons,
  applyAddonWorkTypes,
  taskTitle,
  unattributedTaskCount,
  estimateDraftCalc,
  calcEligibleTaskCount,
  updateDraftRoom,
  renameDraftTask,
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

  // Fas C+: the final missing-something check (UI auto-skips it when clean).
  s = nextStep(d)!;
  expect(s.id).toBe('critic');
  d = applyAnswer(s, { kind: 'skip' }, d);

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
  d = applyAnswer(nextStep(d)!, { kind: 'skip' }, d); // critic
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

test('contractor overhead step adds titled other-cost tasks; gap ignores them', () => {
  let c = emptyDraft();
  c = applyAnswer(nextStep(c, 'contractor')!, { kind: 'skip' }, c); // describe
  c = applyAnswer(nextStep(c, 'contractor')!, { kind: 'chips', ids: ['bathroom'], labels: ['Badrum'] }, c); // type
  c = applyAnswer(nextStep(c, 'contractor')!, { kind: 'chips', ids: ['surfaces'], labels: ['Kakel'] }, c); // scope → kakel
  c = applyAnswer(nextStep(c, 'contractor')!, { kind: 'text', value: 'Anna' }, c); // customer

  // Bathroom has add-ons → that step comes first; skip it to reach overhead.
  let s = nextStep(c, 'contractor')!;
  if (s.id === 'addons') {
    c = applyAnswer(s, { kind: 'skip' }, c);
    s = nextStep(c, 'contractor')!;
  }
  expect(s.id).toBe('overhead');

  const before = c.tasks.length;
  c = applyAnswer(
    s,
    { kind: 'chips', ids: ['establishment', 'scaffolding'], labels: ['Etablering', 'Ställning'] },
    c
  );
  expect(c.tasks.length).toBe(before + 2);
  const overhead = c.tasks.filter((t) => t.customTitle);
  expect(overhead.map((t) => t.customTitle).sort()).toEqual(['Etablering', 'Ställning'].sort());
  // Overhead is 'annat'/other cost, project-wide, titled by itself.
  expect(overhead.every((t) => t.workType === 'annat' && t.roomName === null)).toBe(true);
  expect(taskTitle(overhead[0], (w) => w)).toBe(overhead[0].customTitle);

  // Overhead must NOT be seen as an unattributed task by the gap step.
  expect(unattributedTaskCount(c)).toBe(0);
  const after = nextStep(c, 'contractor');
  if (after) expect(after.id).not.toBe('gapRoom');

  // Re-applying the same overhead is deduped.
  const c2 = applyAnswer(s, { kind: 'chips', ids: ['establishment'], labels: ['Etablering'] }, c);
  expect(c2.tasks.filter((t) => t.customTitle === 'Etablering').length).toBe(1);
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
  d = applyAnswer(nextStep(d)!, { kind: 'skip' }, d); // critic
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

test('co-existence: toScaffoldInput populates an existing project (no project meta)', () => {
  let d = emptyDraft();
  d = applyAnswer(nextStep(d, 'homeowner')!, { kind: 'skip' }, d); // describe
  d = applyAnswer(nextStep(d, 'homeowner')!, { kind: 'chips', ids: ['bathroom'], labels: ['Badrum'] }, d);
  d = applyAnswer(nextStep(d, 'homeowner')!, { kind: 'chips', ids: ['surfaces'], labels: ['Kakel'] }, d);

  // New-project mode (default): carries project meta, no existingProjectId.
  const asNew = toScaffoldInput(d, (wt) => wt);
  expect(asNew.project).toBeTruthy();
  expect(asNew.existingProjectId).toBeUndefined();

  // Populate-existing mode: existingProjectId set, project meta omitted, same rooms/tasks.
  const asExisting = toScaffoldInput(d, (wt) => wt, { existingProjectId: 'proj-123' });
  expect(asExisting.existingProjectId).toBe('proj-123');
  expect(asExisting.project).toBeUndefined();
  expect(asExisting.rooms).toEqual(asNew.rooms);
  expect(asExisting.tasks).toEqual(asNew.tasks);
  expect(asExisting.tasks.length).toBeGreaterThan(0);
});

test('E1 calc: contractor opt-in after size; homeowner never sees it', () => {
  // Contractor: bathroom + paint scope + a real room area → calc step appears.
  let c = emptyDraft();
  c = applyAnswer(nextStep(c, 'contractor')!, { kind: 'skip' }, c); // describe
  c = applyAnswer(nextStep(c, 'contractor')!, { kind: 'chips', ids: ['bathroom'], labels: ['Badrum'] }, c); // type
  c = applyAnswer(nextStep(c, 'contractor')!, { kind: 'chips', ids: ['paint'], labels: ['Målning'] }, c); // scope
  c = applyAnswer(nextStep(c, 'contractor')!, { kind: 'skip' }, c); // customer
  c = applyAnswer(nextStep(c, 'contractor')!, { kind: 'skip' }, c); // addons
  c = applyAnswer(nextStep(c, 'contractor')!, { kind: 'skip' }, c); // overhead
  const size = nextStep(c, 'contractor')!;
  expect(size.id).toBe('size');
  c = applyAnswer(size, { kind: 'number', value: 12 }, c);

  expect(calcEligibleTaskCount(c)).toBeGreaterThan(0);
  const calc = nextStep(c, 'contractor')!;
  expect(calc.id).toBe('calc');
  c = applyAnswer(calc, { kind: 'chips', ids: ['suggest'], labels: ['Föreslå kalkyl'] }, c);
  expect(c.calcLevel).toBe('suggest');
  // Asked once, never again.
  expect(nextStep(c, 'contractor')!.id).not.toBe('calc');

  // Homeowner: same walk (paint + size answered) → calc never appears.
  let h = emptyDraft();
  h = applyAnswer(nextStep(h, 'homeowner')!, { kind: 'skip' }, h); // describe
  h = applyAnswer(nextStep(h, 'homeowner')!, { kind: 'chips', ids: ['bathroom'], labels: ['Badrum'] }, h); // type
  h = applyAnswer(nextStep(h, 'homeowner')!, { kind: 'chips', ids: ['paint'], labels: ['Målning'] }, h); // scope
  let guard = 0;
  let s = nextStep(h, 'homeowner');
  while (s && guard++ < 20) {
    expect(s.id).not.toBe('calc');
    h = applyAnswer(s, s.id === 'size' ? { kind: 'number', value: 12 } : { kind: 'skip' }, h);
    s = nextStep(h, 'homeowner');
  }
});

test('E1 calc: estimateDraftCalc fills hours/rate/material with formula; K4 prices untouched', () => {
  let c = emptyDraft();
  c = applyAnswer(nextStep(c, 'contractor')!, { kind: 'skip' }, c); // describe
  c = applyAnswer(nextStep(c, 'contractor')!, { kind: 'chips', ids: ['bathroom'], labels: ['Badrum'] }, c); // type
  c = applyAnswer(nextStep(c, 'contractor')!, { kind: 'chips', ids: ['paint'], labels: ['Målning'] }, c); // scope
  c = applyAnswer(nextStep(c, 'contractor')!, { kind: 'skip' }, c); // customer
  c = applyAnswer(nextStep(c, 'contractor')!, { kind: 'skip' }, c); // addons
  c = applyAnswer(nextStep(c, 'contractor')!, { kind: 'skip' }, c); // overhead
  c = applyAnswer(nextStep(c, 'contractor')!, { kind: 'number', value: 12 }, c); // size → 12 m²
  // A K4-priced quote line rides along — must never be re-estimated.
  c = {
    ...c,
    tasks: [...c.tasks, {
      workType: 'annat' as const,
      roomName: 'Badrum',
      costCenter: 'other',
      customTitle: 'Rivning enligt offert',
      budgetSek: 8000,
    }],
  };

  const enriched = estimateDraftCalc(c, { defaultHourlyRate: 600, settings: {} });
  const paint = enriched.tasks.find((t) => t.workType === 'malning')!;
  // 12 m² square room → perimeter ~13.86 m × 2.4 m ceiling ≈ 33.3 m² wall.
  expect(paint.estimatedHours).toBeGreaterThan(0);
  expect(paint.hourlyRateSek).toBe(600);
  expect(paint.materialEstimateSek).toBeGreaterThan(0); // paint recipe
  expect(paint.calcNote).toContain('m² vägg');

  // K4 line untouched — the builder's real price is never re-estimated.
  const k4 = enriched.tasks.find((t) => t.customTitle === 'Rivning enligt offert')!;
  expect(k4.estimatedHours).toBeUndefined();
  expect(k4.budgetSek).toBe(8000);

  // The calc lands in the scaffold: hours/rate/material + formula as provenance.
  const input = toScaffoldInput(enriched, (wt) => wt);
  const st = input.tasks.find((t) => t.title.startsWith('malning'))!;
  expect(st.estimatedHours).toBe(paint.estimatedHours);
  expect(st.hourlyRate).toBe(600);
  expect(st.materialEstimate).toBe(paint.materialEstimateSek);
  expect(st.estimateMeta).toEqual({
    source: 'renaida_calc',
    formula: paint.calcNote,
    overridden: false,
  });
});

test('E1 calc: no area or unrecognized work → step never appears', () => {
  // Area skipped → nothing to estimate → no calc step.
  let c = emptyDraft();
  c = applyAnswer(nextStep(c, 'contractor')!, { kind: 'skip' }, c); // describe
  c = applyAnswer(nextStep(c, 'contractor')!, { kind: 'chips', ids: ['bathroom'], labels: ['Badrum'] }, c); // type
  c = applyAnswer(nextStep(c, 'contractor')!, { kind: 'chips', ids: ['paint'], labels: ['Målning'] }, c); // scope
  c = applyAnswer(nextStep(c, 'contractor')!, { kind: 'skip' }, c); // customer
  c = applyAnswer(nextStep(c, 'contractor')!, { kind: 'skip' }, c); // addons
  c = applyAnswer(nextStep(c, 'contractor')!, { kind: 'skip' }, c); // overhead
  c = applyAnswer(nextStep(c, 'contractor')!, { kind: 'skip' }, c); // size SKIPPED
  expect(calcEligibleTaskCount(c)).toBe(0);
  let guard = 0;
  let s = nextStep(c, 'contractor');
  while (s && guard++ < 10) {
    expect(s.id).not.toBe('calc');
    c = applyAnswer(s, { kind: 'skip' }, c);
    s = nextStep(c, 'contractor');
  }
});

test('Fas B inc3 inline-edit: renaming a room re-points its tasks; area updates; task customTitle wins', () => {
  const labelFor = (w: string) => ({ carpentry: 'Snickeri', electrical: 'El', paint: 'Målning' }[w] ?? w);

  let d = emptyDraft();
  d = { ...d, rooms: [{ name: 'Rum' }], tasks: [
    { workType: 'carpentry' as never, roomName: 'Rum', costCenter: 'labor' },
    { workType: 'paint' as never, roomName: 'Rum', costCenter: 'labor' },
  ] };
  // Derived titles follow the room name
  expect(taskTitle(d.tasks[0], labelFor)).toBe('Snickeri – Rum');

  // Rename the room → tasks referencing it follow
  d = updateDraftRoom(d, 0, { name: 'Kök', areaSqm: 12 });
  expect(d.rooms[0].name).toBe('Kök');
  expect(d.rooms[0].areaSqm).toBe(12);
  expect(d.tasks[0].roomName).toBe('Kök');
  expect(taskTitle(d.tasks[0], labelFor)).toBe('Snickeri – Kök');

  // Empty name is rejected (keeps previous), area can be cleared to null
  d = updateDraftRoom(d, 0, { name: '   ', areaSqm: null });
  expect(d.rooms[0].name).toBe('Kök');
  expect(d.rooms[0].areaSqm).toBeNull();

  // Task title override wins; empty reverts to derived
  d = renameDraftTask(d, 0, 'Specialsnickeri köksö');
  expect(taskTitle(d.tasks[0], labelFor)).toBe('Specialsnickeri köksö');
  d = renameDraftTask(d, 0, '  ');
  expect(d.tasks[0].customTitle).toBeUndefined();
  expect(taskTitle(d.tasks[0], labelFor)).toBe('Snickeri – Kök');
});

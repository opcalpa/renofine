/**
 * The renovation plan — the value a guest gets back BEFORE creating an account.
 *
 * WHY this exists: 90 days of PostHog showed 36 guests completing the whole
 * personalisation (describe → AI parse → rooms → work types → local project)
 * and 0 of them creating an account. The diagnosis was `output ≈ input`: the
 * guest wrote "kitchen and bathroom, tiling and electrical" and got back rooms
 * named Kitchen and Bathroom and tasks named Tiling and Electrical. Everything
 * that makes Renofine worth an account — what it costs, what ROT gives back,
 * what order the trades come in, what a builder will ask — lives in the engines
 * but was never shown at the moment the guest was done.
 *
 * This module is that surplus, and it is DETERMINISTIC on purpose: no model
 * call, no network, no React. A hallucinated price is worse than no price, and
 * a plan that costs a token per visitor cannot be put on the landing page.
 * The one optional model call (the "what did I forget" critic) lives in the
 * view and always has the deterministic fallback below to fall back to.
 *
 * Every number it cannot know is ASSUMED OUT LOUD (`assumptions`), because a
 * confident wrong number is the fastest way to lose the trust this screen is
 * built to earn.
 */

import type { WorkType } from '@/services/workTypeUtils';

// ---------------------------------------------------------------------------
// Input — deliberately the wizard's own vocabulary, so no caller translates
// ---------------------------------------------------------------------------

export interface PlanRoomInput {
  name: string;
  areaSqm?: number | null;
  /** Meters, as the wizard collects them. Used when areaSqm is absent. */
  widthM?: number | null;
  depthM?: number | null;
  ceilingHeightMm?: number | null;
}

export interface PlanTaskInput {
  /** null when the work type could not be resolved — costed as "annat". */
  workType: WorkType | null;
  label: string;
  /** null means the whole property (the wizard's WHOLE_PROPERTY_KEY). */
  roomName: string | null;
}

export interface PlanInput {
  rooms: PlanRoomInput[];
  tasks: PlanTaskInput[];
  userType: 'homeowner' | 'contractor';
}

// ---------------------------------------------------------------------------
// Rates — the same order of magnitude as GuestTaskEstimateSheet's tables,
// extended to the full intake vocabulary. Swedish market, SEK, ex VAT.
// ---------------------------------------------------------------------------

/** [low, high] SEK per hour. */
const HOURLY_RATE: Record<WorkType, [number, number]> = {
  rivning: [350, 500],
  el: [500, 800],
  vvs: [500, 800],
  kakel: [450, 700],
  snickeri: [450, 700],
  malning: [350, 550],
  golv: [400, 600],
  kok: [450, 700],
  badrum: [450, 750],
  fonster_dorrar: [450, 700],
  fasad: [400, 650],
  tak: [450, 750],
  tradgard: [350, 550],
  annat: [400, 600],
};

/**
 * Square metres one person covers per hour. Wall-area trades (paint, tile) are
 * measured against wall area; the rest against floor area — same split as the
 * guest estimate sheet.
 */
const SQM_PER_HOUR: Record<WorkType, number> = {
  rivning: 8,
  el: 3,
  vvs: 2,
  kakel: 3,
  snickeri: 4,
  malning: 7,
  golv: 5,
  kok: 1.5,
  badrum: 1.5,
  fonster_dorrar: 6,
  fasad: 6,
  tak: 6,
  tradgard: 8,
  annat: 5,
};

/**
 * Hours a trade takes in a room NO MATTER how small it is.
 *
 * Pure area-scaling was the first version and it was badly wrong: a 6 m²
 * bathroom came out at 14 hours and 23 000 kr for a full gut-and-rebuild, which
 * is roughly a sixth of the real figure. A trade entering a room brings setup,
 * protection, prerequisites and a minimum scope that does not shrink with the
 * floor. Area only starts driving the number once the room is big enough to
 * exceed that floor — which is exactly how a builder quotes it.
 */
const MIN_HOURS_PER_ROOM: Record<WorkType, number> = {
  rivning: 12,
  el: 16,
  vvs: 32,
  kakel: 55,
  snickeri: 12,
  malning: 10,
  golv: 10,
  kok: 40,
  badrum: 40,
  fonster_dorrar: 6,
  fasad: 40,
  tak: 40,
  tradgard: 8,
  annat: 4,
};

/** Material SEK per m² of the measured surface. 0 = labour-dominated trade. */
const MATERIAL_PER_SQM: Record<WorkType, number> = {
  rivning: 0,
  el: 250,
  vvs: 400,
  kakel: 550,
  snickeri: 500,
  malning: 40,
  golv: 350,
  kok: 2500,
  badrum: 1500,
  fonster_dorrar: 1200,
  fasad: 400,
  tak: 500,
  tradgard: 300,
  annat: 200,
};

/** Material a trade needs at all, before area scaling. Same reasoning as hours. */
const MIN_MATERIAL: Record<WorkType, number> = {
  rivning: 0,
  el: 3000,
  vvs: 8000,
  kakel: 8000,
  snickeri: 4000,
  malning: 500,
  golv: 2000,
  kok: 40000,
  badrum: 20000,
  fonster_dorrar: 4000,
  fasad: 10000,
  tak: 20000,
  tradgard: 2000,
  annat: 500,
};

/**
 * Finish level is the single biggest cost driver a plan cannot know — the same
 * bathroom is budget tiles or Italian stone. The high end therefore doubles the
 * material, and the range is presented as a range rather than a number.
 */
const PREMIUM_FINISH_FACTOR = 2;

const WALL_TRADES = new Set<WorkType>(['malning', 'kakel']);

/**
 * Typical Swedish room sizes (m²), used ONLY when the guest gave no dimensions
 * — which is the normal case, since the wizard never asks for them. Always
 * surfaced as an assumption rather than passed off as a measurement.
 */
const TYPICAL_AREA_SQM: Array<{ pattern: RegExp; sqm: number }> = [
  { pattern: /kök|kok|kitchen/i, sqm: 12 },
  { pattern: /badrum|bathroom|wc|dusch|shower/i, sqm: 6 },
  { pattern: /vardagsrum|living/i, sqm: 25 },
  { pattern: /sovrum|bedroom|barnrum|kids/i, sqm: 14 },
  { pattern: /hall|entré|entre|hallway|korridor/i, sqm: 8 },
  { pattern: /tvättstuga|tvattstuga|laundry/i, sqm: 6 },
  { pattern: /kontor|office/i, sqm: 10 },
  { pattern: /källare|kallare|basement/i, sqm: 30 },
  { pattern: /vind|attic|loft/i, sqm: 25 },
  { pattern: /garage|carport/i, sqm: 20 },
  { pattern: /balkong|balcony|uteplats|patio|terrass/i, sqm: 10 },
  { pattern: /förråd|forrad|storage/i, sqm: 5 },
];

const DEFAULT_AREA_SQM = 15;
const DEFAULT_CEILING_MM = 2400;

/** ROT: 30 % of labour INC VAT, capped per person and year (Skatteverket). */
const ROT_RATE = 0.3;
const VAT_RATE = 0.25;
const ROT_CAP_PER_PERSON = 50000;

/** ROT does not apply to these — new-build-ish or outside the home. */
const ROT_INELIGIBLE = new Set<WorkType>(['tradgard']);

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export interface PlanRoomCost {
  name: string;
  areaSqm: number;
  /** True when the area is a typical value, not something the guest gave. */
  areaAssumed: boolean;
  workTypes: WorkType[];
  hours: number;
  low: number;
  high: number;
}

export interface PlanPhase {
  /** Phase key for i18n: `renovationPlan.phase.<key>`. */
  key: string;
  workTypes: WorkType[];
  startWeek: number;
  endWeek: number;
}

export interface PlanMissingItem {
  /** i18n key under `renovationPlan.missing.<key>` — label + reason. */
  key: string;
  workType: WorkType;
  roomName: string | null;
}

export interface RenovationPlan {
  rooms: PlanRoomCost[];
  /**
   * Every amount is INC VAT for homeowners and EX VAT for contractors — the
   * figure each of them actually deals in (project rule, see CLAUDE.md). Which
   * one this plan carries is stated in `incVat`, never left to the reader.
   */
  totalLow: number;
  totalHigh: number;
  laborLow: number;
  laborHigh: number;
  materialLow: number;
  materialHigh: number;
  incVat: boolean;
  /** ROT on the LOW labour estimate — never oversell the deduction. */
  rotLow: number;
  rotHigh: number;
  rotCapped: boolean;
  totalWeeks: number;
  phases: PlanPhase[];
  /** i18n keys under `renovationPlan.question.<key>`. */
  builderQuestions: string[];
  /** Deterministic "you probably forgot" — the fallback for the critic call. */
  missing: PlanMissingItem[];
  /** i18n keys under `renovationPlan.assumption.<key>`. */
  assumptions: string[];
  workTypes: WorkType[];
}

// ---------------------------------------------------------------------------
// Trade order — the sequence a site actually runs in
// ---------------------------------------------------------------------------

const PHASE_ORDER: Array<{ key: string; types: WorkType[] }> = [
  { key: 'demolition', types: ['rivning'] },
  { key: 'installations', types: ['el', 'vvs'] },
  { key: 'shell', types: ['fonster_dorrar', 'fasad', 'tak'] },
  { key: 'wetwork', types: ['kakel', 'badrum'] },
  { key: 'carpentry', types: ['snickeri', 'kok'] },
  { key: 'surfaces', types: ['malning', 'golv'] },
  { key: 'outdoor', types: ['tradgard', 'annat'] },
];

/** One person, a normal working week. Used to turn hours into weeks. */
const HOURS_PER_WEEK = 38;

/** Rooms where water gets on the floor — drives waterproofing and ventilation. */
const WET_ROOM = /badrum|bathroom|wc|dusch|shower|tvättstuga|tvattstuga|laundry/i;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function typicalArea(roomName: string): number {
  for (const { pattern, sqm } of TYPICAL_AREA_SQM) {
    if (pattern.test(roomName)) return sqm;
  }
  return DEFAULT_AREA_SQM;
}

function resolveArea(room: PlanRoomInput): { sqm: number; assumed: boolean } {
  if (room.areaSqm && room.areaSqm > 0) return { sqm: room.areaSqm, assumed: false };
  if (room.widthM && room.depthM && room.widthM > 0 && room.depthM > 0) {
    return { sqm: Math.round(room.widthM * room.depthM * 10) / 10, assumed: false };
  }
  return { sqm: typicalArea(room.name), assumed: true };
}

/** Wall area from floor area, assuming a square-ish room. */
function wallArea(floorSqm: number, ceilingMm: number): number {
  const side = Math.sqrt(Math.max(floorSqm, 1));
  return Math.round(side * 4 * (ceilingMm / 1000) * 10) / 10;
}

function round100(n: number): number {
  return Math.round(n / 100) * 100;
}

/**
 * Title → work type, in the plan's own vocabulary.
 *
 * `materialRecipes.detectWorkType` exists but answers in a DIFFERENT vocabulary
 * ("painting"/"tiling", the recipe keys) than the one the wizard and this engine
 * speak ("malning"/"kakel", the intake keys). Translating between them at every
 * call site is how a third vocabulary gets born, so callers that only have a
 * title — a guest project read back from localStorage, say — resolve it here.
 */
const TITLE_PATTERNS: Array<{ pattern: RegExp; type: WorkType }> = [
  { pattern: /riv(ning)?|demoli|bortforsl/i, type: 'rivning' },
  { pattern: /\bel\b|elinstall|elcentral|belysning|electric/i, type: 'el' },
  { pattern: /vvs|rör|ror\b|plumb|avlopp|vatten|ventilation/i, type: 'vvs' },
  { pattern: /kakel|klinker|plattsätt|plattsatt|tile|tätskikt|tatskikt|waterproof/i, type: 'kakel' },
  { pattern: /snickeri|carpent|list(er)?\b|garderob|inredning/i, type: 'snickeri' },
  { pattern: /mål|mal(ning|a)\b|paint|spackl|tapets/i, type: 'malning' },
  { pattern: /golv|floor|parkett|linoleum|matta/i, type: 'golv' },
  { pattern: /kök|kok\b|kitchen|vitvar/i, type: 'kok' },
  { pattern: /badrum|bathroom|dusch|shower|wc\b/i, type: 'badrum' },
  { pattern: /fönster|fonster|dörr|dorr|window|door/i, type: 'fonster_dorrar' },
  { pattern: /fasad|facade|puts/i, type: 'fasad' },
  { pattern: /tak\b|roof|yttertak/i, type: 'tak' },
  { pattern: /trädgård|tradgard|garden|altan|uteplats|landscap/i, type: 'tradgard' },
];

export function detectPlanWorkType(title: string): WorkType | null {
  for (const { pattern, type } of TITLE_PATTERNS) {
    if (pattern.test(title)) return type;
  }
  return null;
}

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

export function buildRenovationPlan(input: PlanInput): RenovationPlan {
  const rooms = input.rooms.length > 0 ? input.rooms : [{ name: '' }];

  const resolved = rooms.map((room) => {
    const { sqm, assumed } = resolveArea(room);
    return {
      name: room.name,
      floorSqm: sqm,
      wallSqm: wallArea(sqm, room.ceilingHeightMm ?? DEFAULT_CEILING_MM),
      assumed,
    };
  });

  const byRoom = new Map<string, { hours: number; low: number; high: number; types: Set<WorkType> }>();
  for (const room of resolved) {
    byRoom.set(room.name, { hours: 0, low: 0, high: 0, types: new Set() });
  }

  let laborLow = 0;
  let laborHigh = 0;
  let materialLow = 0;
  let materialHigh = 0;
  let rotEligibleLaborLow = 0;
  let rotEligibleLaborHigh = 0;
  let totalHours = 0;
  const usedTypes = new Set<WorkType>();

  for (const task of input.tasks) {
    const type: WorkType = task.workType ?? 'annat';
    usedTypes.add(type);

    // A whole-property task is costed across every room, matching how the
    // wizard's matrix means it ("paint the whole apartment", not one room).
    const targets = task.roomName
      ? resolved.filter((r) => r.name === task.roomName)
      : resolved;
    if (targets.length === 0) continue;

    for (const room of targets) {
      const area = WALL_TRADES.has(type) ? room.wallSqm : room.floorSqm;
      const hours = Math.max(MIN_HOURS_PER_ROOM[type], Math.round((area / SQM_PER_HOUR[type]) * 2) / 2);
      const [rateLow, rateHigh] = HOURLY_RATE[type];
      const low = hours * rateLow;
      const high = hours * rateHigh;
      const material = Math.max(MIN_MATERIAL[type], area * MATERIAL_PER_SQM[type]);

      laborLow += low;
      laborHigh += high;
      materialLow += material;
      materialHigh += material * PREMIUM_FINISH_FACTOR;
      totalHours += hours;
      if (!ROT_INELIGIBLE.has(type)) {
        rotEligibleLaborLow += low;
        rotEligibleLaborHigh += high;
      }

      const bucket = byRoom.get(room.name);
      if (bucket) {
        bucket.hours += hours;
        bucket.low += low + material;
        bucket.high += high + material * PREMIUM_FINISH_FACTOR;
        bucket.types.add(type);
      }
    }
  }

  // A homeowner pays inc VAT and a contractor quotes ex VAT — the same amount
  // shown in the wrong one is the difference between a plan they trust and one
  // that is 25 % off. Applied once, here, so no view can forget it.
  const incVat = input.userType === 'homeowner';
  const vat = (n: number) => (incVat ? n * (1 + VAT_RATE) : n);

  const roomCosts: PlanRoomCost[] = resolved
    .map((room) => {
      const bucket = byRoom.get(room.name);
      return {
        name: room.name,
        areaSqm: room.floorSqm,
        areaAssumed: room.assumed,
        workTypes: bucket ? Array.from(bucket.types) : [],
        hours: bucket ? Math.round(bucket.hours) : 0,
        low: round100(vat(bucket?.low ?? 0)),
        high: round100(vat(bucket?.high ?? 0)),
      };
    })
    .filter((r) => r.high > 0);

  // ROT is 30 % of labour INC VAT — the deduction the homeowner actually gets
  // back. Contractors see the same number because it is what they quote.
  const rawRotLow = rotEligibleLaborLow * (1 + VAT_RATE) * ROT_RATE;
  const rawRotHigh = rotEligibleLaborHigh * (1 + VAT_RATE) * ROT_RATE;
  const rotCapped = rawRotHigh > ROT_CAP_PER_PERSON;

  const assumptions: string[] = [];
  if (resolved.some((r) => r.assumed)) assumptions.push('typicalAreas');
  assumptions.push('finishLevel');
  assumptions.push(incVat ? 'incVat' : 'exVat');
  if (rotCapped) assumptions.push('rotCap');

  return {
    rooms: roomCosts,
    totalLow: round100(vat(laborLow + materialLow)),
    totalHigh: round100(vat(laborHigh + materialHigh)),
    laborLow: round100(vat(laborLow)),
    laborHigh: round100(vat(laborHigh)),
    materialLow: round100(vat(materialLow)),
    materialHigh: round100(vat(materialHigh)),
    incVat,
    rotLow: round100(Math.min(rawRotLow, ROT_CAP_PER_PERSON)),
    rotHigh: round100(Math.min(rawRotHigh, ROT_CAP_PER_PERSON)),
    rotCapped,
    totalWeeks: Math.max(1, Math.ceil(totalHours / HOURS_PER_WEEK)),
    phases: buildPhases(usedTypes, totalHours),
    builderQuestions: builderQuestions(
      usedTypes,
      input.userType,
      resolved.some((r) => WET_ROOM.test(r.name))
    ),
    missing: missingWork(input.tasks, usedTypes),
    assumptions,
    workTypes: Array.from(usedTypes),
  };
}

/**
 * Trades laid out in the order a site runs them, with week numbers derived from
 * each phase's share of the total hours. Phases with no work are dropped, so a
 * paint-only job shows one phase rather than seven mostly-empty ones.
 */
function buildPhases(used: Set<WorkType>, totalHours: number): PlanPhase[] {
  const active = PHASE_ORDER.map((phase) => ({
    key: phase.key,
    workTypes: phase.types.filter((t) => used.has(t)),
  })).filter((p) => p.workTypes.length > 0);

  if (active.length === 0) return [];

  // Weight each phase by the hours its trades take on an average room, so a
  // demolition week never reads as long as a full tiling phase.
  const weights = active.map((p) =>
    p.workTypes.reduce((sum, t) => sum + 1 / SQM_PER_HOUR[t], 0)
  );
  const weightSum = weights.reduce((a, b) => a + b, 0) || 1;
  const totalWeeks = Math.max(active.length, Math.ceil(totalHours / HOURS_PER_WEEK));

  let cursor = 1;
  return active.map((phase, i) => {
    const isLast = i === active.length - 1;
    const span = isLast
      ? Math.max(1, totalWeeks - cursor + 1)
      : Math.max(1, Math.round((weights[i] / weightSum) * totalWeeks));
    const startWeek = cursor;
    const endWeek = cursor + span - 1;
    cursor = endWeek + 1;
    return { key: phase.key, workTypes: phase.workTypes, startWeek, endWeek };
  });
}

/**
 * What a builder asks before quoting. Deterministic per trade — these are the
 * questions that decide the price, and knowing them in advance is exactly the
 * kind of head start a first-time renovator has no other way to get.
 */
const QUESTIONS_BY_TYPE: Partial<Record<WorkType, string[]>> = {
  rivning: ['wasteDisposal'],
  el: ['fuseBox', 'certifiedElectrician'],
  vvs: ['pipeAge', 'waterShutoff'],
  // Waterproofing is a WET-ROOM question, not a tiling one — a kitchen
  // backsplash needs no våtrumsintyg, and asking for one there is the kind of
  // small wrongness that costs the trust this screen exists to earn.
  kakel: ['substrate'],
  badrum: ['waterproofingCert', 'ventilation'],
  snickeri: ['measurements'],
  kok: ['applianceDelivery', 'measurements'],
  malning: ['surfaceCondition'],
  golv: ['subfloorLevel'],
  fonster_dorrar: ['buildingPermit'],
  fasad: ['buildingPermit', 'scaffolding'],
  tak: ['buildingPermit', 'scaffolding'],
};

const ALWAYS_ASKED = ['accessAndKeys', 'livingThere', 'startDate'];

function builderQuestions(
  used: Set<WorkType>,
  userType: 'homeowner' | 'contractor',
  hasWetRoom: boolean
): string[] {
  const keys = new Set<string>();
  for (const type of used) {
    for (const q of QUESTIONS_BY_TYPE[type] ?? []) keys.add(q);
  }
  if (hasWetRoom && (used.has('kakel') || used.has('vvs'))) keys.add('waterproofingCert');
  // A contractor is the one ASKING these — they get the trade-specific list
  // without the "will you be living here" household questions.
  if (userType === 'homeowner') {
    for (const q of ALWAYS_ASKED) keys.add(q);
  }
  return Array.from(keys).slice(0, 6);
}

/**
 * The deterministic "you probably forgot" list — prerequisites that cause water
 * damage, failed inspections or redone work when skipped. This is the fallback
 * the plan shows when the model critic is unavailable or rate-limited, and it
 * is the reason the screen never depends on a model call to be worth reading.
 */
function missingWork(tasks: PlanTaskInput[], used: Set<WorkType>): PlanMissingItem[] {
  const out: PlanMissingItem[] = [];
  const hasWaterproofing = tasks.some((t) => /tätskikt|tatskikt|waterproof|fuktspärr|fuktsparr/i.test(t.label));

  // Tiling or bathroom work in a wet room without waterproofing is the single
  // most expensive omission a layperson makes.
  const wetRoomTask = tasks.find(
    (t) => t.roomName && WET_ROOM.test(t.roomName) && (t.workType === 'kakel' || t.workType === 'badrum')
  );
  if (wetRoomTask && !hasWaterproofing) {
    out.push({ key: 'waterproofing', workType: 'kakel', roomName: wetRoomTask.roomName });
  }

  // Rebuilding without demolition planned means the demolition happens anyway,
  // unbudgeted, on the first day.
  const rebuilds: WorkType[] = ['kakel', 'kok', 'badrum', 'golv'];
  if (!used.has('rivning') && rebuilds.some((t) => used.has(t))) {
    out.push({ key: 'demolition', workType: 'rivning', roomName: null });
  }

  // Wet room work with no ventilation trade is a failed inspection waiting.
  if ((used.has('badrum') || (used.has('kakel') && tasks.some((t) => t.roomName && WET_ROOM.test(t.roomName)))) && !used.has('vvs')) {
    out.push({ key: 'ventilation', workType: 'vvs', roomName: null });
  }

  return out.slice(0, 3);
}

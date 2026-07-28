/**
 * Single source of truth for the WORK / TRADE category axis — the trade a placed
 * object belongs to (electrical / plumbing / kitchen / ventilation / appliance).
 * This is the axis shared by `room_items.category`, the canvas→room_items mirror,
 * the per-category canvas filter, and the worker-view marker colours/labels. It
 * used to be hand-copied in five places with drift (worker colours missed
 * `kitchen`; the mirror set used `appliance` while the object library emits
 * `appliances`); those consumers now derive from here.
 *
 * Two neighbouring axes are deliberately NOT merged in:
 *  - the object-LIBRARY palette (`objectLibrary/types.ts`) is a superset that also
 *    holds layout-only kinds (furniture, doors, windows, custom). Its trade
 *    members normalise onto the ids below via `objectAliases`.
 *  - labour work-types for estimation (`materialRecipes.ts`: painting, sanding,
 *    tiling …) are a surface/labour axis with no placed object; they bridge to
 *    this axis only where they coincide (electrical, plumbing).
 */

export interface WorkCategoryDef {
  /** Canonical trade id — equals the value stored in `room_items.category`. */
  id: string;
  labelKey: string;
  /** Swedish fallback for the label. */
  fallback: string;
  /** Marker / accent colour, shared by the canvas and the worker view. */
  color: string;
  /** Object-library category ids that normalise onto this trade. */
  objectAliases?: string[];
}

export const WORK_CATEGORIES: WorkCategoryDef[] = [
  { id: 'electrical', labelKey: 'roomItems.catElectrical', fallback: 'El-objekt', color: '#f59e0b', objectAliases: ['lighting'] },
  { id: 'plumbing', labelKey: 'roomItems.catPlumbing', fallback: 'VVS', color: '#3b82f6' },
  { id: 'kitchen', labelKey: 'roomItems.catKitchen', fallback: 'Köksobjekt', color: '#10b981' },
  { id: 'ventilation', labelKey: 'roomItems.catVentilation', fallback: 'Ventilation', color: '#06b6d4', objectAliases: ['hvac'] },
  { id: 'appliance', labelKey: 'roomItems.catAppliance', fallback: 'Vitvaror', color: '#a855f7', objectAliases: ['appliances'] },
];

const BY_ID = new Map(WORK_CATEGORIES.map((c) => [c.id, c] as const));
const ALIAS_TO_ID = new Map<string, string>();
for (const c of WORK_CATEGORIES) {
  ALIAS_TO_ID.set(c.id, c.id);
  for (const a of c.objectAliases ?? []) ALIAS_TO_ID.set(a, c.id);
}

/**
 * Canonical trade id for any raw / object-library category, or null when the
 * category is layout-only (furniture, doors, windows, custom, …). `electrical*`
 * subtypes collapse to `electrical`.
 */
export function normalizeWorkCategory(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const base = raw.startsWith('electrical') ? 'electrical' : raw;
  return ALIAS_TO_ID.get(base) ?? null;
}

/** Whether a category is a work item that mirrors into `room_items`. */
export function isWorkCategory(raw: string | null | undefined): boolean {
  return normalizeWorkCategory(raw) != null;
}

/** Marker / accent colour for a category (grey fallback for unknown/layout). */
export function workCategoryColor(raw: string | null | undefined): string {
  const id = normalizeWorkCategory(raw);
  return (id ? BY_ID.get(id)?.color : undefined) ?? '#6b7280';
}

export function workCategoryDef(id: string): WorkCategoryDef | undefined {
  return BY_ID.get(id);
}

// --- Derived views for existing consumers (shapes kept identical) -----------

/** room-details list + task summary categories, in display order. */
export const ROOM_ITEM_CATEGORIES = WORK_CATEGORIES.map((c) => ({ value: c.id, labelKey: c.labelKey }));

/** category → marker colour (worker view). */
export const WORK_CATEGORY_COLORS: Record<string, string> = Object.fromEntries(
  WORK_CATEGORIES.map((c) => [c.id, c.color])
);

/** category → i18n label key. */
export const WORK_CATEGORY_LABEL_KEYS: Record<string, string> = Object.fromEntries(
  WORK_CATEGORIES.map((c) => [c.id, c.labelKey])
);

/** category → [i18n key, Swedish fallback], for canvas filter toggles. */
export const WORK_CATEGORY_LABELS: Record<string, [string, string]> = Object.fromEntries(
  WORK_CATEGORIES.map((c) => [c.id, [c.labelKey, c.fallback]])
);

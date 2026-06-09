// =============================================================================
// Work type utilities — shared across intake, planning, and onboarding
// Extracted to avoid circular imports between service files.
// =============================================================================

export type WorkType =
  | "rivning"
  | "el"
  | "vvs"
  | "kakel"
  | "snickeri"
  | "malning"
  | "golv"
  | "kok"
  | "badrum"
  | "fonster_dorrar"
  | "fasad"
  | "tak"
  | "tradgard"
  | "annat";

export type RoomPriority = "high" | "medium" | "low";

export type PropertyType = "villa" | "lagenhet" | "radhus" | "fritidshus" | "annat";

/**
 * Maps work_type to cost_center enum value
 */
export function workTypeToCostCenter(workType: WorkType): string {
  const mapping: Record<WorkType, string> = {
    rivning: "demolition",
    el: "electrical",
    vvs: "plumbing",
    kakel: "tiling",
    snickeri: "carpentry",
    malning: "painting",
    golv: "flooring",
    kok: "kitchen",
    badrum: "bathroom",
    fonster_dorrar: "windows_doors",
    fasad: "facade",
    tak: "roofing",
    tradgard: "landscaping",
    annat: "other",
  };
  return mapping[workType] || "other";
}

/**
 * Get i18n key for work type label.
 * Use with t(`intake.workType.${workType}`) in components.
 * This function returns a fallback label for non-i18n contexts.
 */
export function getWorkTypeLabel(workType: WorkType): string {
  const fallbacks: Record<WorkType, string> = {
    rivning: "Demolition",
    el: "Electrical",
    vvs: "Plumbing",
    kakel: "Tiling",
    snickeri: "Carpentry",
    malning: "Painting",
    golv: "Flooring",
    kok: "Kitchen",
    badrum: "Bathroom",
    fonster_dorrar: "Windows/Doors",
    fasad: "Facade",
    tak: "Roofing",
    tradgard: "Garden",
    annat: "Other",
  };
  return fallbacks[workType] || workType;
}

/**
 * Emoji for each work type — mirrors the room icons so the guided wizard
 * feels consistent across steps. `annat` falls back to a generic hammer.
 */
const WORK_TYPE_ICONS: Record<WorkType, string> = {
  rivning: "🧨",
  el: "⚡",
  vvs: "🚰",
  kakel: "🧱",
  snickeri: "🪚",
  malning: "🎨",
  golv: "🪵",
  kok: "🍳",
  badrum: "🛁",
  fonster_dorrar: "🪟",
  fasad: "🏠",
  tak: "🪜",
  tradgard: "🌳",
  annat: "🔨",
};

/**
 * Get emoji for a work type. Falls back to a generic hammer.
 */
export function getWorkTypeIcon(workType: WorkType): string {
  return WORK_TYPE_ICONS[workType] || "🔨";
}

/**
 * Get all available work types with labels and icons
 */
export function getWorkTypes(): Array<{ value: WorkType; label: string; icon: string }> {
  const types: WorkType[] = [
    "rivning",
    "el",
    "vvs",
    "kakel",
    "snickeri",
    "malning",
    "golv",
    "kok",
    "badrum",
    "fonster_dorrar",
    "fasad",
    "tak",
    "tradgard",
    "annat",
  ];
  return types.map((t) => ({ value: t, label: getWorkTypeLabel(t), icon: getWorkTypeIcon(t) }));
}

/**
 * Room suggestions with i18n keys.
 * `nameKey` maps to `intake.room.<key>` in locale files.
 * Components use t(`intake.room.${r.nameKey}`) for display.
 */
export function getRoomSuggestions(): Array<{ nameKey: string; icon: string }> {
  return [
    { nameKey: "kitchen", icon: "🍳" },
    { nameKey: "bathroom", icon: "🛁" },
    { nameKey: "livingRoom", icon: "🛋️" },
    { nameKey: "bedroom", icon: "🛏️" },
    { nameKey: "wcShower", icon: "🚿" },
    { nameKey: "laundry", icon: "👕" },
    { nameKey: "hallway", icon: "🚪" },
    { nameKey: "office", icon: "💼" },
    { nameKey: "kidsRoom", icon: "🧸" },
    { nameKey: "balcony", icon: "🌿" },
    { nameKey: "basement", icon: "🏚️" },
    { nameKey: "attic", icon: "🏠" },
    { nameKey: "garage", icon: "🚗" },
    { nameKey: "patio", icon: "☀️" },
  ];
}

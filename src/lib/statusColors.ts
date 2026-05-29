/**
 * Unified status color palette for task and material statuses.
 *
 * Design: Only the status badge/button is colored, not the full row.
 * Green = done, Blue = active, Amber = needs attention,
 * Purple = billing, Gray = paused, Red = rejected/cancelled.
 */

/** Badge classes: bg + text + border (for outline badges and select triggers) */
const STATUS_COLORS: Record<string, string> = {
  // Task statuses
  to_do:        "bg-amber-100 text-amber-700 border-amber-200",
  in_progress:  "bg-blue-100 text-blue-700 border-blue-200",
  awaiting_review: "bg-violet-100 text-violet-700 border-violet-200",
  completed:    "bg-emerald-100 text-emerald-700 border-emerald-200",
  done:         "bg-emerald-100 text-emerald-700 border-emerald-200",
  on_hold:      "bg-gray-100 text-gray-500 border-gray-200",
  blocked:      "bg-red-100 text-red-700 border-red-200",
  cancelled:    "bg-red-100 text-red-600 border-red-200",

  // Material / purchase statuses
  planned:      "bg-indigo-100 text-indigo-600 border-indigo-200",
  submitted:    "bg-amber-100 text-amber-700 border-amber-200",
  approved:     "bg-blue-100 text-blue-700 border-blue-200",
  billed:       "bg-purple-100 text-purple-700 border-purple-200",
  paid:         "bg-emerald-100 text-emerald-700 border-emerald-200",
  paused:       "bg-gray-100 text-gray-500 border-gray-200",
  declined:     "bg-red-100 text-red-700 border-red-200",
  ordered:      "bg-indigo-100 text-indigo-700 border-indigo-200",
  delivered:    "bg-teal-100 text-teal-700 border-teal-200",
};

const FALLBACK = "bg-slate-100 text-slate-600 border-slate-200";

/** Returns Tailwind classes for a status badge (bg, text, border). */
export function getStatusBadgeColor(status: string): string {
  return STATUS_COLORS[status] || FALLBACK;
}

/** Solid bg color for timeline bars / kanban headers. */
const STATUS_SOLID: Record<string, string> = {
  to_do:        "bg-amber-500",
  in_progress:  "bg-blue-500",
  awaiting_review: "bg-violet-500",
  completed:    "bg-emerald-500",
  done:         "bg-emerald-500",
  on_hold:      "bg-gray-400",
  blocked:      "bg-red-500",
  cancelled:    "bg-red-400",
  submitted:    "bg-amber-500",
  approved:     "bg-blue-500",
  billed:       "bg-purple-500",
  paid:         "bg-emerald-500",
  paused:       "bg-gray-400",
  declined:     "bg-red-500",
  planned:      "bg-indigo-400",
  discovery:    "bg-indigo-400",
  ideas:        "bg-violet-400",
};

/** Returns a solid Tailwind bg class (for timeline bars, etc.). */
export function getStatusSolidColor(status: string): string {
  return STATUS_SOLID[status] || "bg-gray-400";
}

/**
 * Map a free-text floor material to a representative tint colour, so the floor
 * plan can hint the floor finish per room (E4 — surface/paint filter). This is a
 * soft visual cue; the exact material text is shown as the room's surface label.
 * Matching is loose (substring, case-insensitive) and covers the common Swedish
 * and English renovation terms. Returns null when nothing matches.
 */
const MATERIAL_TINTS: Array<[RegExp, string]> = [
  [/ek|oak/i, "#d8b98a"],
  [/ask|ash/i, "#e6d5b8"],
  [/furu|pine|tall/i, "#e7cfa0"],
  [/bok|beech/i, "#dcb892"],
  [/valnöt|valnot|walnut/i, "#7a563a"],
  [/parkett|lamell|laminat|trägolv|tragolv|wood|trä|tra(?![a-z])/i, "#cdab78"],
  [/klinker|kakel|tile|flis/i, "#e0ddd8"],
  [/marmor|marble/i, "#ecebe7"],
  [/granit|sten|stone/i, "#c9c6c2"],
  [/betong|concrete|microcement|mikrocement/i, "#cfcdca"],
  [/vinyl|plast|pvc/i, "#ddd9d2"],
  [/linoleum|lino/i, "#d6cbb2"],
  [/matta|carpet|textil/i, "#cbc4b6"],
  [/kork|cork/i, "#d8b48a"],
];

/** Whether a string looks like a usable CSS colour (hex, rgb(), or named). */
function isCssColor(value: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) || /^rgba?\(/i.test(value);
}

/**
 * Resolve a floor-finish tint for a room from its floor_spec.
 * Prefers a material match, then a skirting colour, else null.
 */
export function resolveFloorTint(
  material?: string | null,
  skirtingColor?: string | null
): string | null {
  if (material) {
    for (const [re, color] of MATERIAL_TINTS) {
      if (re.test(material)) return color;
    }
  }
  if (skirtingColor && isCssColor(skirtingColor)) return skirtingColor;
  return null;
}

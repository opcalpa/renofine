/**
 * Floor-finish patterns (E4/P1) — the visual layer on top of the material tint.
 *
 * A small library of industry-standard hatch tiles (herringbone, planks,
 * tile grid, …) resolved from the room's floor_spec (material + free-text
 * specification). Tiles are authored as SVG in WORLD units (10 px = 100 mm)
 * with neutral dark strokes on transparency, so they read on top of any tint
 * and stay scale-true when the canvas zooms.
 */

export type FloorPatternId =
  | 'herringbone'
  | 'plank'
  | 'tileGrid'
  | 'largeTile'
  | 'speckle'
  | 'textile';

/** Loose Swedish/English matching, mirroring resolveFloorTint's approach. */
export function resolveFloorPattern(
  material?: string | null,
  specification?: string | null
): FloorPatternId | null {
  const spec = `${material ?? ''} ${specification ?? ''}`;
  if (/fiskben|herringbone|chevron/i.test(spec)) return 'herringbone';
  if (/storformat|marmor|granit|sten|stone|marble/i.test(spec)) return 'largeTile';
  if (/klinker|kakel|tile|flis/i.test(spec)) return 'tileGrid';
  if (/parkett|lamell|laminat|trägolv|tragolv|plank|bräd|brad|wood|trä|tra(?![a-z])/i.test(spec))
    return 'plank';
  if (/betong|concrete|microcement|mikrocement/i.test(spec)) return 'speckle';
  if (/matta|carpet|textil/i.test(spec)) return 'textile';
  return null;
}

/**
 * Wall-finish pattern from the per-wall surface instruction (P2): tiled walls
 * (kakel/klinker) and stone/concrete read as their material in the elevation.
 * Painted/plastered walls return null — the generic brick hatch stays.
 */
export function resolveWallPattern(
  material?: string | null,
  treatment?: string | null
): FloorPatternId | null {
  const spec = `${material ?? ''} ${treatment ?? ''}`;
  if (/kakel|klinker|tile|flis|mosaik/i.test(spec)) return 'tileGrid';
  if (/storformat|marmor|granit|sten|stone|marble/i.test(spec)) return 'largeTile';
  if (/betong|concrete|microcement|mikrocement/i.test(spec)) return 'speckle';
  return null;
}

const STROKE = 'rgba(31, 41, 55, 0.16)';

/** Tile SVGs in world px (10 px = 100 mm). */
const TILE_SVGS: Record<FloorPatternId, string> = {
  // 600×150 mm planks, joints staggered over two rows
  plank: `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="30">
    <g stroke="${STROKE}" stroke-width="1" fill="none">
      <path d="M0,15 H60 M0,30 H60"/>
      <path d="M30,0 V15 M0,15 V30 M60,15 V30"/>
    </g></svg>`,
  // Classic 45° herringbone, 400×100 mm staves
  herringbone: `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40">
    <g stroke="${STROKE}" stroke-width="1" fill="none">
      <path d="M0,20 L20,0 M0,40 L40,0 M20,40 L40,20"/>
      <path d="M0,0 L20,20 M0,20 L20,40 M20,0 L40,20 M20,40 L40,60"/>
    </g></svg>`,
  // 300×300 mm klinker grid
  tileGrid: `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30">
    <path d="M0,0 H30 M0,0 V30" stroke="${STROKE}" stroke-width="1" fill="none"/></svg>`,
  // 600×600 mm large-format stone
  largeTile: `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60">
    <path d="M0,0 H60 M0,0 V60" stroke="${STROKE}" stroke-width="1.2" fill="none"/></svg>`,
  // Concrete/microcement speckle
  speckle: `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40">
    <g fill="rgba(31,41,55,0.12)">
      <circle cx="8" cy="12" r="0.9"/><circle cx="24" cy="6" r="0.7"/>
      <circle cx="33" cy="21" r="0.9"/><circle cx="14" cy="30" r="0.7"/>
      <circle cx="29" cy="35" r="0.8"/><circle cx="4" cy="26" r="0.6"/>
    </g></svg>`,
  // Carpet/textile dot weave
  textile: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12">
    <g fill="rgba(31,41,55,0.10)">
      <circle cx="3" cy="3" r="0.8"/><circle cx="9" cy="9" r="0.8"/>
    </g></svg>`,
};

const imageCache = new Map<FloorPatternId, HTMLImageElement>();
const loadListeners = new Set<() => void>();

/** Subscribe to "a pattern tile finished loading" (for render invalidation). */
export function onPatternLoad(cb: () => void): () => void {
  loadListeners.add(cb);
  return () => loadListeners.delete(cb);
}

/**
 * The tile image for a pattern — starts loading on first request and returns
 * null until ready (listeners fire when it is).
 */
export function getPatternImage(id: FloorPatternId): HTMLImageElement | null {
  const cached = imageCache.get(id);
  if (cached) return cached.complete ? cached : null;
  const img = new Image();
  img.onload = () => loadListeners.forEach((cb) => cb());
  img.src = `data:image/svg+xml;utf8,${encodeURIComponent(TILE_SVGS[id])}`;
  imageCache.set(id, img);
  return img.complete ? img : null;
}

/**
 * Auto-match a scanned receipt/invoice against the project's PLANNED materials
 * (Renaida's downstream layer, backlog renaida-material-receipt-match).
 *
 * The Renaida material step (#3) seeds a shopping list of "planned" materials
 * with no amounts. When a receipt later lands in the panel, we match its lines
 * against that list so the real purchase CONSUMES the planned budget line
 * (source_material_id) instead of double-counting a fresh order beside it.
 *
 * The matcher is a pure function over already-fetched data — no network, so it
 * is unit-testable and fails open (no matches → today's plain import). The
 * supabase fetch lives in documentCapture (its only caller) to keep this module
 * import-free of the client.
 */
export interface PlannedMaterial {
  id: string;
  name: string;
  taskId: string | null;
  roomId: string | null;
  /** Planned amount (price_total) if the estimate gave one — may be null. */
  plannedAmount: number | null;
}

export interface LineMatch {
  /** Index into the action's lineItems (or -1 for the single bulk fallback row). */
  lineIndex: number;
  plannedId: string;
  plannedName: string;
  taskId: string | null;
  roomId: string | null;
  /** 0..1 — >= MATCH_STRONG is pre-accepted, below is a suggestion to confirm. */
  score: number;
}

/** Below this a candidate is ignored entirely. */
export const MATCH_MIN = 0.15;
/** At/above this the match is confident enough to pre-select before Genomför. */
export const MATCH_STRONG = 0.4;

// Swedish + shopping noise words that carry no matching signal.
const STOPWORDS = new Set([
  "och", "for", "för", "med", "till", "per", "st", "styck", "mm", "cm", "kr",
  "sek", "inkl", "moms", "rot", "avdrag", "rabatt", "frakt", "artikel", "art",
  "nr", "vit", "svart", "grå", "gra", "st.", "pkt", "pak", "paket", "brun",
]);

function normalizeTokens(name: string): string[] {
  return (name || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

/**
 * Similarity between a receipt line and a planned-material name. A single shared
 * category word ("kakel", "klinker", "spackel") is usually the right signal —
 * the receipt line is a specific product, the plan is a category — so a shared
 * significant token counts strongly, with a Dice bonus for broader overlap and
 * a substring bonus when one whole name sits inside the other.
 */
export function scoreNameMatch(lineDesc: string, plannedName: string): number {
  const a = normalizeTokens(lineDesc);
  const b = normalizeTokens(plannedName);
  if (!a.length || !b.length) return 0;

  const setA = new Set(a);
  const setB = new Set(b);
  let shared = 0;
  for (const tok of setA) if (setB.has(tok)) shared += 1;

  // Substring overlap (kakel ⊂ golvkakel) catches compound Swedish words that
  // don't tokenize to the same token — a whole category word embedded in a
  // product name is as strong a signal as an exact shared token.
  let substr = 0;
  for (const ta of setA) {
    if (setB.has(ta)) continue;
    for (const tb of setB) {
      if (ta === tb) continue;
      if (ta.length >= 4 && tb.includes(ta)) { substr += 1; break; }
      if (tb.length >= 4 && ta.includes(tb)) { substr += 1; break; }
    }
  }

  const overlap = shared + substr;
  if (overlap === 0) return 0;
  // Any real overlap floors at 0.2 (a shared category word usually IS the match);
  // broader token overlap (Dice) and multiple overlaps push it toward strong.
  const dice = (2 * shared) / (setA.size + setB.size);
  const base = Math.max(0.2, dice);
  const extra = Math.min(0.2, (overlap - 1) * 0.15);
  return Math.min(1, base + extra);
}

/** Best planned material for one receipt line, or null below MATCH_MIN. */
function bestMatch(
  lineDesc: string,
  planned: PlannedMaterial[],
): { pm: PlannedMaterial; score: number } | null {
  let best: { pm: PlannedMaterial; score: number } | null = null;
  for (const pm of planned) {
    const score = scoreNameMatch(lineDesc, pm.name);
    if (score >= MATCH_MIN && (!best || score > best.score)) best = { pm, score };
  }
  return best;
}

export interface DocumentLike {
  vendorName: string;
  lineItems: { description: string }[];
}

/**
 * Match every line of an extracted document to the planned materials. Each
 * planned material is claimed by at most one line (its best), so a shopping
 * list of distinct items maps 1:1. Returns matches keyed by lineIndex; when the
 * document has no line items, the vendor name is matched as a single bulk row
 * (lineIndex -1).
 */
export function matchDocumentToPlanned(
  doc: DocumentLike,
  planned: PlannedMaterial[],
): LineMatch[] {
  if (!planned.length) return [];
  const claimed = new Set<string>();
  const matches: LineMatch[] = [];

  const lines = doc.lineItems.length
    ? doc.lineItems.map((li, i) => ({ desc: li.description, index: i }))
    : [{ desc: doc.vendorName, index: -1 }];

  // Highest-scoring lines pick first so a strong match isn't stolen by a weak one.
  const scored = lines
    .map((l) => ({ ...l, best: bestMatch(l.desc, planned) }))
    .filter((l) => l.best)
    .sort((x, y) => (y.best!.score - x.best!.score));

  for (const l of scored) {
    // Re-resolve best among still-unclaimed planned materials.
    const avail = planned.filter((pm) => !claimed.has(pm.id));
    const best = bestMatch(l.desc, avail);
    if (!best) continue;
    claimed.add(best.pm.id);
    matches.push({
      lineIndex: l.index,
      plannedId: best.pm.id,
      plannedName: best.pm.name,
      taskId: best.pm.taskId,
      roomId: best.pm.roomId,
      score: best.score,
    });
  }
  return matches;
}

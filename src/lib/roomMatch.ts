/**
 * Room-name matching — one engine, used everywhere rooms are compared.
 *
 * Dropping a folder on a project used to invent rooms the home does not have:
 * an apartment with "Badrum" and "Gäst WC" got proposals for `Badrum 1`,
 * `Badrum 2`, `WC`, `WC/Dusch` and `Gäst-WC`, because the only rule was an
 * exact lowercased string compare. Three drawings that each saw one bathroom
 * became three bathrooms.
 *
 * The rules here are deliberately narrow. Punctuation and a trailing ordinal
 * are spelling, so `Gäst-WC` = `Gäst WC` and `Badrum 1` = `Badrum` — those
 * merge on their own. Anything that needs domain knowledge (is `WC/Dusch` the
 * same as `Badrum`?) is only ever offered as a SUGGESTION. A room too many is
 * one delete; a wrongly merged room silently loses work.
 *
 * Used by:
 *  - `renaidaProjectFlow.mergeParseIntoDraft` — folding many documents together
 *  - `agent/ingestToProposals` — matching a draft against a project's rooms
 *  - `agent/applyProposals` — resolving a task's room name at write time
 */

/** A room name split into its stem and an optional trailing ordinal. */
export interface RoomNameParts {
  /** Punctuation-normalised, lowercased, ordinal removed. */
  stem: string;
  /** Normalised ordinal ("1", "2", …) or null when the name carried none. */
  ordinal: string | null;
}

const ROMAN: Record<string, string> = { i: '1', ii: '2', iii: '3', iv: '4', v: '5' };

/** Lowercase, turn separators into spaces, collapse whitespace. */
function normalizePunctuation(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[-_/\\.,:;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Split a room name into stem + trailing ordinal.
 *
 * The ordinal must be its own final word, and stripping it must leave
 * something behind — so "WC" keeps its name and "Rum 1" becomes ("rum", "1").
 */
export function parseRoomName(name: string | null | undefined): RoomNameParts {
  const cleaned = normalizePunctuation(name ?? '');
  if (!cleaned) return { stem: '', ordinal: null };

  const words = cleaned.split(' ');
  if (words.length < 2) return { stem: cleaned, ordinal: null };

  const last = words[words.length - 1];
  let ordinal: string | null = null;

  if (/^\d{1,2}$/.test(last)) {
    ordinal = String(parseInt(last, 10));
  } else if (ROMAN[last]) {
    ordinal = ROMAN[last];
  }

  if (!ordinal) return { stem: cleaned, ordinal: null };

  // "nr 3" / "no 3" — the marker is part of the ordinal, not the stem.
  let rest = words.slice(0, -1);
  if (rest.length > 1 && /^(nr|no)$/.test(rest[rest.length - 1])) {
    rest = rest.slice(0, -1);
  }

  const stem = rest.join(' ').trim();
  // Stripping must not consume the whole name ("1" alone stays "1").
  if (!stem) return { stem: cleaned, ordinal: null };

  return { stem, ordinal };
}

/**
 * The canonical key for a room name: punctuation-normalised, ordinal removed.
 * `Badrum 1`, `badrum` and `Bad-rum`… no: only `Badrum 1` and `Badrum` share
 * this key. Use `fullRoomKey` when the ordinal must be respected.
 */
export function normalizeRoomName(name: string | null | undefined): string {
  return parseRoomName(name).stem;
}

/** Key that keeps the ordinal, so `Sovrum 1` ≠ `Sovrum 2`. */
export function fullRoomKey(name: string | null | undefined): string {
  const { stem, ordinal } = parseRoomName(name);
  return ordinal ? `${stem} ${ordinal}` : stem;
}

/** Same room beyond doubt — same stem AND same ordinal (both may be absent). */
export function sameRoom(a: string | null | undefined, b: string | null | undefined): boolean {
  const keyA = fullRoomKey(a);
  return keyA !== '' && keyA === fullRoomKey(b);
}

function editDistanceWithin(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      row.push(v);
      if (v < best) best = v;
    }
    if (best > max) return false;
    prev = row;
  }
  return prev[b.length] <= max;
}

/** True when one name's words are a subset of the other's ("WC" ⊂ "Gäst WC"). */
function wordsContained(a: string, b: string): boolean {
  const wordsA = a.split(' ').filter(Boolean);
  const wordsB = b.split(' ').filter(Boolean);
  if (wordsA.length === 0 || wordsB.length === 0) return false;
  if (wordsA.length === wordsB.length) return false;
  const [short, long] = wordsA.length < wordsB.length ? [wordsA, wordsB] : [wordsB, wordsA];
  const pool = new Set(long);
  return short.every((w) => w.length >= 2 && pool.has(w));
}

/**
 * Close enough to be worth ASKING about — never close enough to merge on its
 * own. One typo, or one name contained in the other.
 */
export function similarRoom(a: string | null | undefined, b: string | null | undefined): boolean {
  const stemA = normalizeRoomName(a);
  const stemB = normalizeRoomName(b);
  if (!stemA || !stemB || stemA === stemB) return false;
  if (wordsContained(stemA, stemB)) return true;
  // A single typo, only on names long enough for it not to be a different word.
  return stemA.length >= 5 && stemB.length >= 5 && editDistanceWithin(stemA, stemB, 1);
}

export interface RoomLike {
  id: string;
  name: string;
}

export interface RoomMatch<T extends RoomLike = RoomLike> {
  /** Safe to merge into without asking. */
  exact?: T;
  /** Offer these in a dropdown — the person decides. */
  similar: T[];
}

/**
 * Match one incoming name against rooms that already exist.
 *
 * A stem match only counts as exact when there is exactly ONE candidate: a
 * project holding both `Sovrum 1` and `Sovrum 2` must not silently swallow a
 * plain `Sovrum` — that is a question, not a fact.
 */
export function matchRoom<T extends RoomLike>(name: string, existing: T[]): RoomMatch<T> {
  const key = fullRoomKey(name);
  if (!key) return { similar: [] };

  const full = existing.find((r) => fullRoomKey(r.name) === key);
  if (full) return { exact: full, similar: [] };

  const stem = normalizeRoomName(name);
  const sameStem = existing.filter((r) => normalizeRoomName(r.name) === stem);
  if (sameStem.length === 1) return { exact: sameStem[0], similar: [] };
  if (sameStem.length > 1) return { similar: sameStem };

  return { similar: existing.filter((r) => similarRoom(r.name, name)) };
}

/** A room already folded into a draft, with the file it came from. */
export interface DraftRoomLike {
  name: string;
  /** Originating file — two rooms from the SAME file are never merged. */
  fileName?: string;
}

/**
 * Where an incoming room should fold into a draft being built from many files,
 * or null when it is genuinely new.
 *
 * The file matters. `Sovrum 1` and `Sovrum 2` listed by the SAME drawing are
 * two bedrooms and must stay two. `Badrum 1` from one drawing and `Badrum`
 * from the contract are one bathroom described twice — those merge.
 */
export function findMergeTarget(
  incoming: DraftRoomLike,
  existing: DraftRoomLike[]
): number | null {
  const key = fullRoomKey(incoming.name);
  if (!key) return null;

  const fullIdx = existing.findIndex((r) => fullRoomKey(r.name) === key);
  if (fullIdx !== -1) return fullIdx;

  // Stem match, but only across DIFFERENT files and only when unambiguous.
  const stem = normalizeRoomName(incoming.name);
  const candidates: number[] = [];
  existing.forEach((r, i) => {
    if (normalizeRoomName(r.name) !== stem) return;
    if (r.fileName && incoming.fileName && r.fileName === incoming.fileName) return;
    candidates.push(i);
  });

  return candidates.length === 1 ? candidates[0] : null;
}

/**
 * The name to show for a merged room: prefer the one without an ordinal, so a
 * home with one bathroom ends up called "Badrum", not "Badrum 1".
 */
export function preferredRoomName(a: string, b: string): string {
  const partsA = parseRoomName(a);
  const partsB = parseRoomName(b);
  if (partsA.ordinal && !partsB.ordinal) return b;
  if (!partsA.ordinal && partsB.ordinal) return a;
  return a;
}

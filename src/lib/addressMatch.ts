/**
 * Are two addresses the same home? (S5)
 *
 * The backfill grouped projects only on an EXACT address key, on purpose: a
 * wrong grouping lies with numbers on the address summary. Everything looser
 * lives here, and it never groups anything — it only proposes, and a person
 * confirms.
 *
 * The comparison runs on whatever the property presents as its address: the
 * street address when it has one, otherwise its name — because the backfill
 * named address-less properties after their project, and in real data that
 * name is usually still a street ("Rindögatan", "Furusundsgatan 14").
 */

/** Names that say nothing about WHICH home this is. Never proposed. */
const GENERIC_LABELS = new Set([
  'min renovering',
  'mitt projekt',
  'my renovation',
  'my project',
  'new project',
  'nytt projekt',
  'projekt',
  'project',
  'renovering',
  'renovation',
  'mein umbau',
  'mein projekt',
  'ma renovation',
  'mon projet',
  'mi reforma',
  'mi proyecto',
  'demo',
  'test',
  'hem',
  'hemma',
  'home',
]);

export interface AddressParts {
  /** Lowercased, punctuation-free, whitespace-collapsed. */
  normalized: string;
  /** The non-numeric part — the street, effectively. */
  street: string;
  /** Every digit group, in order. */
  numbers: string[];
}

export function normalizeAddressText(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[.,;:/\\()[\]{}"'’`|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseAddress(value: string | null | undefined): AddressParts {
  const normalized = normalizeAddressText(value);
  const numbers = normalized.match(/\d+/g) ?? [];
  const street = normalized.replace(/\d+/g, ' ').replace(/\s+/g, ' ').trim();
  return { normalized, street, numbers };
}

/** A label too generic (or too short) to say which home it is. */
export function isGenericLabel(value: string | null | undefined): boolean {
  const parts = parseAddress(value);
  if (!parts.normalized) return true;
  if (GENERIC_LABELS.has(parts.normalized)) return true;
  if (GENERIC_LABELS.has(parts.street)) return true;
  // A street shorter than four letters carries no evidence — "Loll", "Hus".
  return parts.street.replace(/\s/g, '').length < 4;
}

/** Classic Levenshtein, bailing out as soon as it exceeds `max`. */
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

function streetsLookSame(a: string, b: string): boolean {
  const sa = a.replace(/\s/g, '');
  const sb = b.replace(/\s/g, '');
  if (!sa || !sb) return false;
  if (sa === sb) return true;

  // "storg" ↔ "storgatan", "rindögatan" ↔ "rindögatan 27" once numbers are
  // stripped. An abbreviation is a prefix of what it abbreviates, which beats a
  // dictionary of Swedish street suffixes that would age badly.
  const [shorter, longer] = sa.length <= sb.length ? [sa, sb] : [sb, sa];
  if (shorter.length >= 4 && longer.startsWith(shorter)) return true;

  // "valevägen" ↔ "valvägen" — one typo, on a name long enough that one typo
  // cannot turn it into a different street.
  if (shorter.length >= 6 && editDistanceWithin(sa, sb, 1)) return true;

  return false;
}

export interface MatchableAddress {
  address?: string | null;
  name?: string | null;
  postal_code?: string | null;
  city?: string | null;
}

/** What a property presents as its address: street when set, else its name. */
export function addressLabelForMatch(p: MatchableAddress): string {
  const addr = (p.address ?? '').trim();
  return addr || (p.name ?? '').trim();
}

/**
 * Do these two look like the same home?
 *
 * Deliberately strict about contradictions (different house number, postal code
 * or city ⇒ never a match) and lenient only about how the same street was
 * typed. False positives here end as a merged cost history, so the bar is
 * "worth asking about", not "probably".
 */
export function looksLikeSameAddress(a: MatchableAddress, b: MatchableAddress): boolean {
  const la = addressLabelForMatch(a);
  const lb = addressLabelForMatch(b);
  if (isGenericLabel(la) || isGenericLabel(lb)) return false;

  const pa = parseAddress(la);
  const pb = parseAddress(lb);

  // A different house number is a different home, however alike the street is.
  if (pa.numbers.length > 0 && pb.numbers.length > 0) {
    if (pa.numbers.join(' ') !== pb.numbers.join(' ')) return false;
  }

  const postalA = normalizeAddressText(a.postal_code).replace(/\s/g, '');
  const postalB = normalizeAddressText(b.postal_code).replace(/\s/g, '');
  if (postalA && postalB && postalA !== postalB) return false;

  const cityA = normalizeAddressText(a.city);
  const cityB = normalizeAddressText(b.city);
  if (cityA && cityB && cityA !== cityB) return false;

  return streetsLookSame(pa.street, pb.street);
}

/**
 * Group properties that look like the same home (union-find over the pairs).
 * Only groups of two or more come back, largest first.
 */
export function groupSimilarAddresses<T extends MatchableAddress>(items: T[]): T[][] {
  const parent = items.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (i: number, j: number) => {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) parent[rj] = ri;
  };

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (looksLikeSameAddress(items[i], items[j])) union(i, j);
    }
  }

  const groups = new Map<number, T[]>();
  items.forEach((item, i) => {
    const root = find(i);
    const bucket = groups.get(root);
    if (bucket) bucket.push(item);
    else groups.set(root, [item]);
  });

  return [...groups.values()].filter((g) => g.length > 1).sort((a, b) => b.length - a.length);
}

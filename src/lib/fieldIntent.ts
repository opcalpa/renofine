/**
 * What the composer still needs to read out of what a worker typed.
 *
 * The four-intent vocabulary that used to live here moved to the server with
 * grammar v2 (`supabase/functions/_shared/fieldReport.ts`): a report is read
 * once, server-side, so the worker's receipt and the builder's inbox can never
 * disagree about what was understood. Voice arrives there as audio anyway.
 *
 * What stays here is the one courtesy the composer performs while typing:
 * "10 penslar" fills the quantity and the product before either is asked for.
 */

/**
 * The four kinds a report can carry. The server is the authority (see
 * `_shared/fieldReport.ts`); this mirrors it for the inbox's labels.
 */
export const FIELD_INTENTS = ['klart', 'behover', 'fraga', 'info'] as const;
export type FieldIntent = (typeof FIELD_INTENTS)[number];

export interface ParsedNeed {
  /** The first standalone number, when there is one. */
  quantity: number | null;
  /** What is left after the quantity and any buy-verb are removed. */
  name: string;
}

/** Buy-verbs in the languages the worker view already speaks. */
const BUY_VERBS =
  /\b(k[öo]p(er|a|t)?|kup(i[ćc]|uj[eę])?|beh[öo]ver|need|potrzebuj[eę]|treba|купити|купую|потрібно|nevoie|cump[ăa]r|reikia|vaja)\b/giu;

export function parseNeed(text: string): ParsedNeed {
  const raw = (text || '').trim();
  if (!raw) return { quantity: null, name: '' };

  // First standalone number wins. Bounded so "10x" and "10 st" both work, but
  // a phone number or a date inside the sentence does not become a quantity.
  const match = raw.match(/(?:^|\s)(\d{1,4})(?:\s*(?:st|stk|szt|pcs|x)\b)?/i);
  const quantity = match ? parseInt(match[1], 10) : null;

  const name = raw
    .replace(match ? match[0] : '', ' ')
    .replace(BUY_VERBS, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return { quantity: quantity && quantity > 0 ? quantity : null, name };
}

/**
 * The grammar of a message from the site.
 *
 * Every message from the field is one input — a photo, a line of text, a voice
 * note, or any mix — plus ONE intent. The intent is written as what the
 * RECEIVER must do, not as what the content is, because a painter on a ladder
 * knows what they want from you but not what Renofine calls it:
 *
 *   klart   → nothing, it is a report
 *   behover → approve a purchase
 *   fraga   → answer / decide
 *   info    → read
 *
 * Four rather than three: the question is the only one that BLOCKS the sender,
 * and it is the one that most reliably drowns when everything is "other".
 *
 * The icon carries the meaning across the language gap: 🛒 means the same to a
 * Polish painter and a Swedish project manager without a word being translated.
 * The label is translated on top of it, never instead of it.
 *
 * The same four are used in both directions — the open path (drop something in
 * and get asked) and the structured path (press the button) resolve to exactly
 * these values, so there is one mechanic to learn, maintain and measure.
 */

export const FIELD_INTENTS = ['klart', 'behover', 'fraga', 'info'] as const;
export type FieldIntent = (typeof FIELD_INTENTS)[number];

export interface FieldIntentMeta {
  intent: FieldIntent;
  /** Language-independent. Same glyph on the sender's and receiver's screen. */
  icon: string;
  labelKey: string;
  labelFallback: string;
  /** What the receiver must do — shown to the sender as reassurance. */
  promiseKey: string;
  promiseFallback: string;
}

export const FIELD_INTENT_META: Record<FieldIntent, FieldIntentMeta> = {
  klart: {
    intent: 'klart',
    icon: '✅',
    labelKey: 'field.intent.klart',
    labelFallback: 'Klart',
    promiseKey: 'field.promise.klart',
    promiseFallback: 'Rapporteras som utfört arbete.',
  },
  behover: {
    intent: 'behover',
    icon: '🛒',
    labelKey: 'field.intent.behover',
    labelFallback: 'Behövs',
    promiseKey: 'field.promise.behover',
    promiseFallback: 'Skickas för godkännande.',
  },
  fraga: {
    intent: 'fraga',
    icon: '❓',
    labelKey: 'field.intent.fraga',
    labelFallback: 'Fråga',
    promiseKey: 'field.promise.fraga',
    promiseFallback: 'Du får svar.',
  },
  info: {
    intent: 'info',
    icon: '💬',
    labelKey: 'field.intent.info',
    labelFallback: 'Info',
    promiseKey: 'field.promise.info',
    promiseFallback: 'Läses av projektledaren.',
  },
};

/**
 * A quantity and a product read straight out of what the person wrote.
 *
 * Deliberately deterministic and tried FIRST, before any model call: "Kup 10
 * pędzli" and "10 penslar" are the actual messages, and a regex answers them
 * for nothing. The model is the fallback for a photo with no usable words —
 * not the default path.
 */
export interface ParsedNeed {
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

/**
 * A guess at the intent from what was typed — a SUGGESTION only.
 *
 * Never applied silently: a message reclassified behind the sender's back is
 * worse than one filed under the wrong heading, because they cannot see it
 * happen. The composer pre-selects nothing on the strength of this; it only
 * nudges the chip.
 */
export function guessIntent(text: string): FieldIntent | null {
  const raw = (text || '').trim();
  if (!raw) return null;
  if (/[?？]/.test(raw)) return 'fraga';
  if (BUY_VERBS.test(raw)) {
    BUY_VERBS.lastIndex = 0;
    return 'behover';
  }
  BUY_VERBS.lastIndex = 0;
  return null;
}

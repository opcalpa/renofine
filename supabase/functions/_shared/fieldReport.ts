/**
 * Reading a report from site.
 *
 * A tradesperson says everything in one breath — "8 timmar, kaklet 70 %,
 * behöver mer fog, kommer sent imorgon" — and should not have to sort it into
 * four separate flows first. This reads the parts out of what they said.
 *
 * It lives server-side, and ONLY server-side, on purpose: voice arrives here
 * as audio, and the sender's "Skickat: fråga · 10 × penslar · 8 h" line is
 * rendered from this result. One parser means the worker's receipt and the
 * builder's inbox can never disagree about what was understood.
 *
 * Order of work, cheapest first:
 *   1. Regex over the text. Hours, percent, quantity+product and question
 *      marks are the same shapes in every language the worker view speaks,
 *      so the common report costs nothing.
 *   2. One model call, only when the text carries more than the regex caught.
 *
 * Nothing here decides anything irreversible. Hours and purchases arrive
 * unapproved and wait for the builder, so a misreading costs a correction,
 * never money.
 */

export type ReportPartKind = 'note' | 'question' | 'done' | 'progress' | 'hours' | 'purchase';

export interface ReportPart {
  kind: ReportPartKind;
  /** hours: total hours. progress: 0–100. purchase: quantity. */
  value?: number;
  /** purchase: what to buy. */
  name?: string;
  /** How this part was arrived at — an agent must explain its own decisions. */
  reason: string;
}

export interface ParsedReport {
  parts: ReportPart[];
  source: 'regex' | 'model' | 'explicit';
}

/**
 * Buy-verbs in the languages the worker view speaks.
 *
 * Lookarounds, not \b: a word boundary counts only A-Z0-9_, so a verb ending
 * in a non-ASCII letter never matched. "potrzebuję" and "потрібно" — the two
 * languages most likely to need this — silently fell through for weeks.
 */
const BUY_VERBS =
  /(?<!\p{L})(k[öo]p(er|a|t)?|kup(i[ćc]|uj[eę])?|beh[öo]ver|beh[öo]vs|need|potrzebuj[eę]|treba|brakuje|купити|купую|потрібно|nevoie|cump[ăa]r|reikia|vaja)(?!\p{L})/giu;

/**
 * "8 h", "8 tim", "8 godzin", "8 год", "8 ore", "8 val", "8 tundi".
 * `(?!\p{L})` instead of `\b` throughout — see the note on BUY_VERBS.
 */
const HOURS =
  /(\d{1,2}(?:[.,]\d)?)\s*(h|tim(mar|me)?|godz(in|iny)?|год(ин|ини)?|ore|val|tund(i|e)?|hour(s)?)(?!\p{L})/giu;

/** "2 man", "2 personer", "2 osoby", "2 люди" — multiplies the hours. */
const CREW =
  /(\d{1,2})\s*(man|pers(on|oner|ony|oane)?|osob(y|ę|a)?|люд(ей|и)|arbetare|worker(s)?)(?!\p{L})/giu;

const PERCENT = /(\d{1,3})\s*%/g;

/** Words that make a sentence a question even without a question mark. */
const QUESTION_WORDS =
  /(?<!\p{L})(kan|ska|f[åa]r|vilken|vilket|vilka|hur|n[äa]r|varf[öo]r|czy|jak(i|a|ie)?|kiedy|dlaczego|чи|як|коли|чому|which|what|when|why|how|should|can)(?!\p{L})/iu;

const DONE_WORDS =
  /(?<!\p{L})(klar(t|a)?|f[äa]rdig(t|a)?|gotow(e|y|a)|sko[nń]czone|готово|зроблено|done|finished|gata|baigta|valmis)(?!\p{L})/iu;

/**
 * Words that put the finishing in the future. "Blir klart imorgon" is a plan,
 * not a report, and must never hand work off for review.
 */
const FUTURE_WORDS =
  /(?<!\p{L})(imorgon|i\s?morgon|blir|ska|kommer\s+att|n[äa]sta\s+vecka|jutro|b[eę]dzie|завтра|буде|tomorrow|will\s+be|next\s+week|m[âa]ine|rytoj|homme)(?!\p{L})/iu;

function firstNumber(re: RegExp, text: string): { value: number; match: string } | null {
  re.lastIndex = 0;
  const m = re.exec(text);
  re.lastIndex = 0;
  if (!m) return null;
  const value = parseFloat(m[1].replace(',', '.'));
  return Number.isFinite(value) ? { value, match: m[0] } : null;
}

/**
 * Quantity + product, e.g. "Kup 10 pędzli" → 10 × "pędzli".
 * Mirrors parseNeed in src/lib/fieldIntent.ts, which the composer already uses.
 */
export function parseNeed(text: string): { quantity: number | null; name: string } {
  const raw = (text || '').trim();
  if (!raw) return { quantity: null, name: '' };
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
 * Split on the separators people actually use between thoughts in one message:
 * newlines, commas, semicolons and " och "/" and "/" i ". Keeps each clause
 * whole so a number in one clause never attaches to a product in another.
 */
function clauses(text: string): string[] {
  return text
    .split(
      // Sentence enders only when a space or the end follows, so "8.5 h" stays
      // one number. Without this, "behöver 5 säckar fog. Vilken fog?" made the
      // question part of the product name.
      /[\n;,]+|[.!?]+(?=\s|$)|\s+(?:och|and|oraz|i|та|și|ir|ja)\s+/giu
    )
    .map((c) => c.trim())
    .filter(Boolean);
}

/**
 * Read the report deterministically. `explicit` carries what the worker ticked
 * in the composer — always believed, never overridden: a person who ticked
 * "Klart" said so, and no regex gets to disagree.
 */
export function parseReport(
  text: string,
  explicit: { done?: boolean; progress?: number | null; hours?: number | null; purchase?: { quantity: number | null; name: string } | null } = {}
): ParsedReport {
  const raw = (text || '').trim();
  const parts: ReportPart[] = [];
  const seen = new Set<ReportPartKind>();

  const add = (part: ReportPart) => {
    if (seen.has(part.kind)) return;
    seen.add(part.kind);
    parts.push(part);
  };

  // 1. What the worker ticked wins outright.
  if (explicit.done) add({ kind: 'done', reason: 'ticked by the worker' });
  if (explicit.progress != null && explicit.progress >= 0 && explicit.progress <= 100) {
    add({ kind: 'progress', value: explicit.progress, reason: 'ticked by the worker' });
  }
  if (explicit.hours != null && explicit.hours > 0) {
    add({ kind: 'hours', value: explicit.hours, reason: 'ticked by the worker' });
  }
  if (explicit.purchase && (explicit.purchase.quantity || explicit.purchase.name)) {
    add({
      kind: 'purchase',
      value: explicit.purchase.quantity ?? undefined,
      name: explicit.purchase.name,
      reason: 'ticked by the worker',
    });
  }

  if (!raw) {
    if (parts.length === 0) add({ kind: 'note', reason: 'nothing but a photo' });
    return { parts, source: parts.some((p) => p.reason === 'ticked by the worker') ? 'explicit' : 'regex' };
  }

  // 2. Read the rest out of the words.
  if (!seen.has('hours')) {
    const h = firstNumber(HOURS, raw);
    if (h && h.value > 0 && h.value <= 24) {
      const crew = firstNumber(CREW, raw);
      // "2 man 8 h" is 16 hours of work, and the note has to say so — a total
      // with no explanation is a number the builder cannot check.
      const total = crew && crew.value > 1 ? h.value * crew.value : h.value;
      add({
        kind: 'hours',
        value: total,
        reason: crew && crew.value > 1
          ? `${crew.value} × ${h.value} h from "${crew.match.trim()} ${h.match.trim()}"`
          : `from "${h.match.trim()}"`,
      });
    }
  }

  if (!seen.has('progress')) {
    const p = firstNumber(PERCENT, raw);
    if (p && p.value >= 0 && p.value <= 100) {
      add({ kind: 'progress', value: p.value, reason: `from "${p.match.trim()}"` });
    }
  }

  if (!seen.has('purchase')) {
    for (const clause of clauses(raw)) {
      BUY_VERBS.lastIndex = 0;
      if (!BUY_VERBS.test(clause)) continue;
      BUY_VERBS.lastIndex = 0;
      const need = parseNeed(clause);
      if (need.name) {
        add({ kind: 'purchase', value: need.quantity ?? undefined, name: need.name, reason: `from "${clause}"` });
        break;
      }
    }
  }

  // A completion claim read out of words is the one guess that costs
  // something — it hands the work off for review. Three guards, all learned
  // from real sentences:
  //   "Är det klart?"            — a question is not a report
  //   "kaklet är 70 % klart"     — the word describes the percentage
  //   "blir klart imorgon"       — a plan, not a report
  const progressBelowDone = parts.find((p) => p.kind === 'progress' && (p.value ?? 0) < 100);
  if (
    !seen.has('done') &&
    DONE_WORDS.test(raw) &&
    !/[?？]/.test(raw) &&
    !progressBelowDone &&
    !FUTURE_WORDS.test(raw)
  ) {
    add({ kind: 'done', reason: 'said so in the text' });
  }

  // 3. The text itself. A question owes the receiver an answer; anything else
  //    is a note. This is the part that used to be a button.
  const isQuestion = /[?？]/.test(raw) || QUESTION_WORDS.test(raw);
  add({
    kind: isQuestion ? 'question' : 'note',
    reason: isQuestion ? 'question mark or question word' : 'plain text',
  });

  return { parts, source: seen.size > 1 ? 'regex' : 'regex' };
}

/**
 * Whether the text plausibly carries more than the regex found — the only
 * case worth a model call. Cheap heuristic: several clauses, but only the
 * text part came out of them.
 */
export function needsModelPass(text: string, parsed: ParsedReport): boolean {
  const raw = (text || '').trim();
  if (raw.length < 25) return false;
  const structural = parsed.parts.filter((p) => p.kind !== 'note' && p.kind !== 'question');
  return structural.length === 0 && clauses(raw).length >= 2;
}

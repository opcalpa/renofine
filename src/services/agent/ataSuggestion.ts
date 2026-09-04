/**
 * Budgetvakten — ask about ÄTA exactly when a cost passes what was agreed.
 *
 * WHY (Carl, 2026-09-04): a homeowner accepts a quote, that becomes the budget,
 * and ordinary invoices land inside it. Then the renovation is nearly done, the
 * budget is eaten, and more work turns out to be necessary — arriving as
 * perfectly ordinary invoices and receipts with nothing on the paper saying
 * ÄTA. Marked in the moment, the budget still tells a true story afterwards
 * ("the agreement held at 1 000 000, and 300 000 was added, here is which").
 * Reconstructed six months later, nobody can say which of 23 invoices was extra.
 *
 * THE SIGNAL IS ARITHMETIC ON OUR OWN DATA, never a model's judgement. Every
 * unmeasured model signal tried this same day turned out to lie: confidence
 * came back a constant 0.95 across 47 files, a quotation was fabricated on a
 * paper that did not contain the word, and `text_is_upright` answered `true`
 * for a sideways page. `contract_value` is maintained by a database trigger
 * over accepted quotes — it cannot invent anything.
 *
 * IT ASKS, IT NEVER TICKS. The final invoice for work that was always included
 * also arrives last, so "past the budget" is not the same as "extra work". A
 * silently wrong booking is worse than no help at all, so the person gets the
 * number and makes the call.
 */

/**
 * PURE ON PURPOSE — no imports with side effects.
 *
 * The decision is the feature, so it has to be testable without a browser, a
 * database or an env file. Pulling in the Supabase client for the lookup put
 * `import.meta.env` in the module graph and the whole spec file stopped being
 * collectable; the IO lives in `ataBudgetContext.ts` instead. Keep it that way.
 */

/** One purchase row as the guard needs to see it. */
export interface AtaCandidateRow {
  proposalId: string;
  /** What this row will book. */
  total: number;
  /** Document date, ISO. Null sorts last — an undated row cannot be placed. */
  date: string | null;
  /** Already marked ÄTA — outside the agreement, so it consumes none of it. */
  bookAsAta: boolean;
  /** The person already answered "ingår i avtalet" for this row. */
  dismissed: boolean;
}

export interface AtaBudgetContext {
  /**
   * Sum of accepted quotes. `null` means no accepted quote exists — and then
   * there is no agreement to be outside of, so the guard stays silent. That is
   * why a retro project (papers imported for a job already done) never sees it.
   */
  contractValue: number | null;
  /** What the project has already committed inside the budget, before this batch. */
  committedBefore: number;
}

export interface AtaSuggestion {
  proposalId: string;
  /** How far past the agreed sum this row takes the project. Always > 0. */
  overBy: number;
  /** The agreed sum, so the chip can name it rather than just warn. */
  contractValue: number;
}

/**
 * Which rows to ask about, and by how much each one is over.
 *
 * Walks the batch in document order, because that is how it actually happened:
 * the question belongs on the rows that chronologically came after the money
 * ran out, not on whichever row the list happens to show first.
 *
 * Rows already marked ÄTA are skipped AND do not consume the agreement — they
 * are by definition outside it, and letting them eat the budget would drag
 * every later row over the line for the wrong reason.
 */
export function suggestAta(
  rows: AtaCandidateRow[],
  ctx: AtaBudgetContext,
): AtaSuggestion[] {
  const contractValue = ctx.contractValue;
  // No agreement, or a meaningless one: nothing to be outside of. Silence is
  // the correct behaviour, not a fallback.
  if (contractValue === null || !(contractValue > 0)) return [];

  // Undated rows last: placing them early would make them push dated rows over
  // a line they did not really cross.
  const ordered = [...rows].sort((a, b) => {
    if (a.date && b.date) return a.date.localeCompare(b.date);
    if (a.date) return -1;
    if (b.date) return 1;
    return 0;
  });

  const out: AtaSuggestion[] = [];
  let running = ctx.committedBefore;
  for (const row of ordered) {
    if (row.bookAsAta) continue;
    running += row.total;
    if (running <= contractValue) continue;
    // Dismissed rows still CONSUME the agreement — "ingår i avtalet" means it
    // is part of it — they just stop being asked about.
    if (row.dismissed) continue;
    out.push({
      proposalId: row.proposalId,
      overBy: Math.round((running - contractValue) * 100) / 100,
      contractValue,
    });
  }
  return out;
}

/**
 * Rank the money family from what the classifier SAW, not from what it decided.
 *
 * WHY (Carl, 2026-09-04): his Beijer följesedel was classified `invoice`, and
 * the model justified it with the word "Faktura" — a word that appears nowhere
 * on the paper. Tightening the prompt changed nothing; measured, the same image
 * turned upright came back `delivery_note` with a real quotation.
 *
 * Two lessons went into this file.
 *
 * 1. WORD-SPOTTING CANNOT WORK HERE. A följesedel legitimately refers to an
 *    invoice in its own small print — payment terms, dröjsmålsränta,
 *    F-skattebevis, bankgiro are pre-printed on every form a supplier owns.
 *    Looking for "faktura" anywhere on the page finds it on a delivery note
 *    every time (Carl's own observation, and it is the reason this ranks
 *    structure instead).
 *
 * 2. A DELIVERY NOTE IS STRUCTURALLY DIFFERENT, not verbally different. It
 *    lists what ARRIVED: quantities, article numbers, often no prices at all,
 *    and no sum to pay. An invoice or receipt is ABOUT money: a total, VAT, a
 *    way to pay. "Följesedeln innehåller ju sällan flera belopp, moms osv."
 *
 * So the model is asked only for observations it can actually make, and the
 * ranking happens here, in code we can read and test — the same division of
 * labour that fixed the receipt angles: ask what it saw, decide ourselves.
 */

import type { DocumentType } from "./smartUploadService";

/** What the classifier reports seeing. Every field may be absent. */
export interface DocumentSignals {
  /** The document's own printed heading, quoted. */
  heading?: string | null;
  /** Did the text run the normal way in the image as given? */
  text_is_upright?: boolean | null;
  /** A sum to PAY is printed ("Att betala"), not merely a line total. */
  has_payable_total?: boolean | null;
  /** A VAT amount is printed — not just a VAT registration number. */
  has_vat?: boolean | null;
  has_invoice_number?: boolean | null;
  has_due_date?: boolean | null;
  has_payment_reference?: boolean | null;
  amount_count?: "none" | "one" | "few" | "many" | null;
}

/** The family where a wrong answer books money. Everything else is left alone. */
const MONEY_FAMILY: ReadonlySet<DocumentType> = new Set<DocumentType>([
  "invoice",
  "receipt",
  "delivery_note",
]);

/**
 * Heading words, matched against the HEADING FIELD only — never the whole page.
 * That distinction is the entire point: the words below appear in the body of
 * documents that are not of that type.
 */
const HEADING_WORDS: ReadonlyArray<{ type: DocumentType; words: string[] }> = [
  { type: "delivery_note", words: ["följesedel", "foljesedel", "packsedel", "leveranssedel", "lastorder", "plocksedel"] },
  { type: "invoice", words: ["faktura"] },
  { type: "receipt", words: ["kvitto", "kassakvitto"] },
];

function headingSays(heading: string | null | undefined): DocumentType | null {
  if (!heading) return null;
  const h = heading.toLowerCase();
  // Delivery-note words are checked first on purpose: a följesedel's heading
  // block often carries BOTH ("FÖLJESEDEL … PACKSEDEL, LASTORDER"), while an
  // invoice heading does not borrow theirs.
  for (const { type, words } of HEADING_WORDS) {
    if (words.some((w) => h.includes(w))) return type;
  }
  return null;
}

export interface RankedType {
  type: DocumentType;
  /** Why we landed here — shown to no one, but it is what makes this debuggable. */
  reason: string;
  /** True when the ranking DISAGREED with the model and overruled it. */
  overruled: boolean;
}

/**
 * Decide the money-family type from observations.
 *
 * Deliberately narrow: it only ever moves a document between invoice, receipt
 * and delivery_note. It never invents a type outside that family and never
 * touches a classification that was not in it, because outside the family the
 * structural signals say nothing useful and a confident override would be the
 * same mistake in a new place.
 *
 * Returns the model's own answer whenever the observations are missing or do
 * not disagree — absence of evidence is not evidence here.
 */
export function rankDocumentType(
  modelType: DocumentType,
  signals: DocumentSignals | null | undefined,
): RankedType {
  const keep = (reason: string): RankedType => ({ type: modelType, reason, overruled: false });
  if (!signals) return keep("no signals");
  if (!MONEY_FAMILY.has(modelType)) return keep("not in the money family");

  const heading = headingSays(signals.heading);
  const noMoneyShape = signals.has_payable_total === false && signals.has_vat === false;
  const moneyShape = signals.has_payable_total === true || signals.has_vat === true;

  // The heading is the document naming ITSELF. It beats the small print, which
  // is what the model kept reading instead.
  if (heading && heading !== modelType) {
    // …unless the page contradicts the heading outright. A "FÖLJESEDEL" that
    // does carry a sum to pay and VAT is a combined delivery note/invoice, and
    // the money reading is the one with consequences.
    if (heading === "delivery_note" && moneyShape) {
      return keep("heading says delivery note but the page has a payable total/VAT");
    }
    return { type: heading, reason: `heading says "${signals.heading}"`, overruled: true };
  }

  // No heading to go on: fall back to shape. A paper with no sum to pay and no
  // VAT is not a bill, whatever it was called.
  if (!heading && noMoneyShape && modelType !== "delivery_note") {
    return {
      type: "delivery_note",
      reason: "no payable total and no VAT — not a bill",
      overruled: true,
    };
  }

  // The mirror case, kept narrow: only when BOTH money markers are present, so
  // a receipt without VAT (a small shop slip) is not dragged around.
  if (
    !heading &&
    modelType === "delivery_note" &&
    signals.has_payable_total === true &&
    signals.has_vat === true
  ) {
    const billish = signals.has_invoice_number === true || signals.has_due_date === true;
    return {
      type: billish ? "invoice" : "receipt",
      reason: "a payable total and VAT — this is a bill",
      overruled: true,
    };
  }

  return keep(heading ? "heading agrees" : "signals agree");
}

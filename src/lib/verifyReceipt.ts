/**
 * Arithmetic that checks a read receipt against itself.
 *
 * WHY (Carl, 2026-09-02): "även 'korrekta' kvitton har felaktigheter". The
 * model reads the fields and nobody checks them. But a Swedish receipt is a
 * small closed system — net + VAT = gross, VAT is one of three legal rates,
 * the lines add up to the total, a receipt has no invoice number — and every
 * one of those is verifiable without a second model call, for free, in code.
 *
 * The point is NOT to correct the model. It is to say WHICH field to look at.
 * A row that says "check the VAT" is worth ten rows that say "check this".
 *
 * TWO COPIES ON PURPOSE. Deno (edge) and Vite (client) cannot import each
 * other's modules, and this logic must run in both places: on extraction, so
 * the check travels with the document, and on every hand-correction, so a
 * value the person just fixed stops being flagged the moment they fix it.
 * `supabase/functions/_shared/verifyReceipt.ts` is the twin — change both.
 */

/** Swedish VAT rates. Construction and materials are 25 %; 12/6 appear on mixed receipts. */
const VAT_RATES = [0.25, 0.12, 0.06];

export type ReceiptIssueCode =
  | 'line_sum_mismatch'
  | 'vat_rate_off'
  | 'total_looks_net'
  | 'vat_exceeds_total'
  | 'missing_total'
  | 'missing_vendor'
  | 'missing_date'
  | 'date_in_future'
  | 'date_implausible'
  | 'printed_total_differs'
  | 'invoice_number_on_receipt'
  | 'low_confidence';

export interface ReceiptIssue {
  code: ReceiptIssueCode;
  /** Which field the person should look at first. */
  field: 'total' | 'vat' | 'date' | 'vendor' | 'lines' | 'docNo' | 'all';
  /** Severity: 'check' asks for a glance, 'blocking' means the row cannot be trusted. */
  level: 'check' | 'blocking';
  /** Numbers the UI can put in a sentence. Never a pre-built sentence — i18n. */
  detail?: Record<string, number | string>;
}

export interface VerifiableReceipt {
  vendor_name: string | null;
  total_amount: number | null;
  vat_amount: number | null;
  purchase_date: string | null;
  invoice_number: string | null;
  document_type?: string;
  line_items: { total: number | null }[];
  confidence?: number | null;
  /** The total EXACTLY as printed on the document, if the model could read it. */
  total_printed?: string | null;
}

/** Digits out of a printed amount: "2 549,00 kr" → 2549. */
function parsePrinted(s: string): number | null {
  const cleaned = s.replace(/[^\d,.-]/g, '').replace(/\s/g, '');
  if (!cleaned) return null;
  // Swedish decimal comma; a dot is a thousands separator unless it has 1–2 trailing digits.
  const normalised = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned;
  const n = Number(normalised);
  return Number.isFinite(n) ? n : null;
}

export function verifyReceipt(r: VerifiableReceipt): ReceiptIssue[] {
  const issues: ReceiptIssue[] = [];
  const total = r.total_amount;

  // ── The fields the whole row depends on ───────────────────────────────
  if (total == null || total <= 0) {
    issues.push({ code: 'missing_total', field: 'total', level: 'blocking' });
  }
  if (!r.vendor_name?.trim()) {
    issues.push({ code: 'missing_vendor', field: 'vendor', level: 'blocking' });
  }
  if (!r.purchase_date) {
    issues.push({ code: 'missing_date', field: 'date', level: 'check' });
  }

  // ── The parsed total against the printed one ──────────────────────────
  // The strongest check there is: the model wrote down what it SAW, and the
  // number it reported has to match. A transposition ("2 549" read as "2 594")
  // survives every other test here.
  if (total != null && r.total_printed) {
    const printed = parsePrinted(r.total_printed);
    if (printed != null && Math.abs(printed - total) > 0.5) {
      issues.push({
        code: 'printed_total_differs',
        field: 'total',
        level: 'blocking',
        detail: { printed, parsed: total },
      });
    }
  }

  // ── VAT ───────────────────────────────────────────────────────────────
  if (total != null && total > 0 && r.vat_amount != null && r.vat_amount > 0) {
    if (r.vat_amount >= total) {
      issues.push({
        code: 'vat_exceeds_total',
        field: 'vat',
        level: 'blocking',
        detail: { vat: r.vat_amount, total },
      });
    } else {
      // Swedish receipts print a GROSS total, so the net is total − VAT and the
      // rate is VAT / net. Anything more than half a percent off a legal rate
      // means one of the two numbers was misread.
      const net = total - r.vat_amount;
      const rate = net > 0 ? r.vat_amount / net : 0;
      const nearest = VAT_RATES.reduce((best, cand) =>
        Math.abs(cand - rate) < Math.abs(best - rate) ? cand : best
      );
      if (Math.abs(rate - nearest) > 0.005) {
        // Before calling it a misread: does the VAT sit at a legal rate against
        // the total ITSELF? Then nothing was misread — the total is a NET
        // figure. Carl's IMG_4076 (2026-09-03) read 2 544 with 636 in VAT:
        // 33,3 % against the net, exactly 25 % against the total. Saying "the
        // VAT is wrong" sends him to check the one number that is right.
        const rateOnTotal = r.vat_amount / total;
        const netMatch = VAT_RATES.find((v) => Math.abs(rateOnTotal - v) <= 0.005);
        if (netMatch) {
          issues.push({
            code: 'total_looks_net',
            field: 'total',
            level: 'check',
            detail: { gross: Math.round((total + r.vat_amount) * 100) / 100, rate: netMatch * 100 },
          });
        } else {
          issues.push({
            code: 'vat_rate_off',
            field: 'vat',
            level: 'check',
            detail: { rate: Math.round(rate * 1000) / 10, expected: nearest * 100 },
          });
        }
      }
    }
  }

  // ── The lines against the total ───────────────────────────────────────
  //
  // A builders' merchant prints BOTH prices per row — "Enhetspris (exkl.moms)"
  // and "(inkl.moms)" — while the total at the bottom is gross. Read off the
  // ex-VAT column, the rows then sum to the NET, and the receipt is perfectly
  // consistent. Four of the five warnings on Carl's first batch (2026-09-03)
  // were this and nothing else: 1746/349,20 with rows at 1397, 640,60/128,12
  // at 512, 3178/635,60 at 2542 — every one of them net to the öre.
  //
  // Flagging those trains the person to ignore the flag, which is worse than
  // having no flag at all. Rows that add up to either basis are silent.
  if (total != null && r.line_items.length > 1) {
    const sum = r.line_items.reduce((s, li) => s + (li.total ?? 0), 0);
    const net = r.vat_amount != null && r.vat_amount > 0 ? total - r.vat_amount : null;
    const matchesGross = Math.abs(sum - total) <= 1;
    const matchesNet = net != null && Math.abs(sum - net) <= 1;
    if (sum > 0 && !matchesGross && !matchesNet) {
      issues.push({
        code: 'line_sum_mismatch',
        field: 'lines',
        level: 'check',
        detail: { sum: Math.round(sum), total },
      });
    }
  }

  // ── Dates ─────────────────────────────────────────────────────────────
  if (r.purchase_date) {
    const d = new Date(`${r.purchase_date}T12:00:00`);
    if (Number.isNaN(d.getTime())) {
      issues.push({ code: 'date_implausible', field: 'date', level: 'check' });
    } else {
      const now = Date.now();
      if (d.getTime() > now + 86_400_000) {
        issues.push({ code: 'date_in_future', field: 'date', level: 'check' });
      } else if (d.getFullYear() < 2000) {
        issues.push({ code: 'date_implausible', field: 'date', level: 'check' });
      }
    }
  }

  // ── Type consistency ──────────────────────────────────────────────────
  // A cash receipt has no invoice number. Seeing one usually means the
  // document was an invoice and got filed as the wrong kind.
  if (r.document_type === 'receipt' && r.invoice_number?.trim()) {
    issues.push({ code: 'invoice_number_on_receipt', field: 'docNo', level: 'check' });
  }

  if (typeof r.confidence === 'number' && r.confidence < 0.6) {
    issues.push({
      code: 'low_confidence',
      field: 'all',
      level: 'check',
      detail: { confidence: Math.round(r.confidence * 100) },
    });
  }

  return issues;
}

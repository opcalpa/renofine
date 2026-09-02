/**
 * A second reading of the same pile of receipts, brought in as a table.
 *
 * WHY (Carl, 2026-09-02): the reader gets 83 % of the fields and only 39 % of
 * the rows come back with nothing to check. Another model, given the same
 * photos in a browser chat, produces a different set of mistakes. Where two
 * independent readings AGREE the odds both are right are high; where they
 * DISAGREE you know exactly which row to open. That is worth more than either
 * reading alone, and it costs us nothing to run.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: an imported file never writes anything.
 * It produces agreements and disagreements. A CSV can contain anything at all —
 * rows that were never in the folder, amounts from a different project, a
 * hallucinated vendor — so our reading stays the default everywhere and the
 * person picks, row by row.
 */

export interface CsvRow {
  vendor: string | null;
  docNumber: string | null;
  date: string | null;
  total: number | null;
  vat: number | null;
  /** 1-based line in the file, so a bad row can be pointed at. */
  line: number;
}

export type CsvColumn = 'vendor' | 'docNumber' | 'date' | 'total' | 'vat' | 'ignore';

/** Header names we recognise without asking, Swedish and English. */
const HEADER_HINTS: Record<Exclude<CsvColumn, 'ignore'>, RegExp> = {
  vendor: /^(leverant|s[äa]ljare|butik|vendor|supplier|merchant|store)/i,
  docNumber: /(kvittonr|kvitto.?nr|fakturanr|faktura.?nr|verifikat|receipt.?no|invoice.?no|number|nummer)/i,
  date: /^(datum|ink[öo]psdatum|date|purchase)/i,
  total: /(totalbelopp|total|belopp|summa|brutto|amount|sum)/i,
  vat: /^(moms|vat|mervärdesskatt)/i,
};

/** Split one CSV line, honouring quotes. Handles `,` and `;`. */
function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQuotes = !inQuotes;
    } else if (ch === sep && !inQuotes) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** Whichever separator produces more columns on the header row wins. */
function detectSeparator(header: string): string {
  return splitLine(header, ';').length > splitLine(header, ',').length ? ';' : ',';
}

/**
 * A Swedish amount: "1 234,50", "1.234,50 kr", "1234.50". Returns null rather
 * than a wrong number — an unparseable amount must not become 0.
 */
export function parseAmount(raw: string): number | null {
  const s = raw.replace(/[^\d,.\-]/g, '').trim();
  if (!s) return null;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  let normalised = s;
  if (hasComma && hasDot) {
    // Whichever comes last is the decimal mark.
    normalised =
      s.lastIndexOf(',') > s.lastIndexOf('.')
        ? s.replace(/\./g, '').replace(',', '.')
        : s.replace(/,/g, '');
  } else if (hasComma) {
    // A comma with exactly three digits after it is a thousands separator.
    normalised = /,\d{3}$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  }
  const n = Number(normalised);
  return Number.isFinite(n) ? n : null;
}

/** A date in any of the shapes a chat model tends to emit → YYYY-MM-DD. */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const dotted = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (dotted) return `${dotted[3]}-${dotted[2].padStart(2, '0')}-${dotted[1].padStart(2, '0')}`;
  const compact = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  return null;
}

export interface ParsedCsv {
  /** Header cells exactly as they appear, for the column mapper. */
  headers: string[];
  /** Our guess at what each column is; the person can override. */
  guess: CsvColumn[];
  /** Raw cells per data row, so remapping never needs a re-read. */
  cells: string[][];
}

export function parseCsv(text: string): ParsedCsv | null {
  const lines = text
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  if (lines.length < 2) return null;
  const sep = detectSeparator(lines[0]);
  const headers = splitLine(lines[0], sep);
  const guess: CsvColumn[] = headers.map((h) => {
    for (const [col, re] of Object.entries(HEADER_HINTS)) {
      if (re.test(h)) return col as CsvColumn;
    }
    return 'ignore';
  });
  // VAT before total: "Moms" matches the total pattern too ("belopp"), and a
  // column claimed twice is worse than one left unmapped.
  const seen = new Set<CsvColumn>();
  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === 'ignore') continue;
    if (seen.has(guess[i])) guess[i] = 'ignore';
    else seen.add(guess[i]);
  }
  return { headers, guess, cells: lines.slice(1).map((l) => splitLine(l, sep)) };
}

export function rowsFromCsv(parsed: ParsedCsv, mapping: CsvColumn[]): CsvRow[] {
  const idx = (col: CsvColumn) => mapping.indexOf(col);
  const vI = idx('vendor');
  const nI = idx('docNumber');
  const dI = idx('date');
  const tI = idx('total');
  const mI = idx('vat');
  return parsed.cells
    .map((c, i) => ({
      vendor: vI >= 0 ? c[vI]?.trim() || null : null,
      docNumber: nI >= 0 ? c[nI]?.trim() || null : null,
      date: dI >= 0 ? parseDate(c[dI] ?? '') : null,
      total: tI >= 0 ? parseAmount(c[tI] ?? '') : null,
      vat: mI >= 0 ? parseAmount(c[mI] ?? '') : null,
      line: i + 2,
    }))
    .filter((r) => r.vendor || r.total != null || r.docNumber);
}

/* ── Matching ─────────────────────────────────────────────────────────── */

export interface MatchTarget {
  id: string;
  vendor: string;
  total: number;
  date: string | null;
  docNumber: string | null;
  /** Our VAT, so a differing VAT is a difference rather than a silent gap. */
  vat: number | null;
}

export interface FieldDiff {
  field: 'vendor' | 'total' | 'vat' | 'date' | 'docNumber';
  ours: string | number | null;
  theirs: string | number | null;
}

export interface CsvMatch {
  row: CsvRow;
  /** Our purchase this row is about, or null when the file names one we never saw. */
  targetId: string | null;
  /** How the match was made — shown so a weak match can be doubted. */
  via: 'docNumber' | 'vendorAmount' | 'vendorDateAmount' | 'vendorDateOnly' | null;
  /** Fields where the two readings disagree. Empty means they agree. */
  diffs: FieldDiff[];
}

const normVendor = (s: string | null) =>
  (s ?? '').toLowerCase().replace(/\b(ab|as|oy|a\/s|inc|ltd)\b/g, '').replace(/[^a-z0-9åäö]/g, '');
const normDoc = (s: string | null) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Pair every CSV row with one of our purchases, strongest evidence first.
 *
 * A document number is an identifier and beats everything. Vendor plus an
 * exact amount is next. Vendor plus date plus an amount within a percent is
 * last — good enough to pair, weak enough that the UI names how it matched.
 * Each of our purchases can be claimed only once, so two CSV rows cannot both
 * point at the same order.
 */
export function matchCsvRows(rows: CsvRow[], targets: MatchTarget[]): CsvMatch[] {
  const claimed = new Set<string>();
  const find = (row: CsvRow): { t: MatchTarget; via: CsvMatch['via'] } | null => {
    const free = targets.filter((t) => !claimed.has(t.id));
    if (row.docNumber) {
      const byDoc = free.find(
        (t) => t.docNumber && normDoc(t.docNumber) === normDoc(row.docNumber)
      );
      if (byDoc) return { t: byDoc, via: 'docNumber' };
    }
    if (row.vendor && row.total != null) {
      const v = normVendor(row.vendor);
      const byAmount = free.find(
        (t) => normVendor(t.vendor) === v && Math.abs(t.total - row.total!) <= 1
      );
      if (byAmount) return { t: byAmount, via: 'vendorAmount' };
      if (row.date) {
        const loose = free.find(
          (t) =>
            normVendor(t.vendor) === v &&
            t.date === row.date &&
            Math.abs(t.total - row.total!) / Math.max(t.total, 1) <= 0.01
        );
        if (loose) return { t: loose, via: 'vendorDateAmount' };
      }
    }
    // Last resort, WITHOUT the amount. The whole point of a second reading is
    // to catch a misread amount — and keying every tier on the amount made
    // exactly that case unmatchable, so it surfaced as "only in the file"
    // instead of as the disagreement it is (found in test, 2026-09-02).
    //
    // Only when the vendor and date pick out ONE order: two receipts from the
    // same shop on the same day would otherwise be paired by a coin toss.
    if (row.vendor && row.date) {
      const v = normVendor(row.vendor);
      const sameDay = free.filter((t) => normVendor(t.vendor) === v && t.date === row.date);
      if (sameDay.length === 1) return { t: sameDay[0], via: 'vendorDateOnly' };
    }
    return null;
  };

  return rows.map((row) => {
    const hit = find(row);
    if (!hit) return { row, targetId: null, via: null, diffs: [] };
    claimed.add(hit.t.id);
    const diffs: FieldDiff[] = [];
    if (row.vendor && normVendor(row.vendor) !== normVendor(hit.t.vendor)) {
      diffs.push({ field: 'vendor', ours: hit.t.vendor, theirs: row.vendor });
    }
    if (row.total != null && Math.abs(row.total - hit.t.total) > 0.5) {
      diffs.push({ field: 'total', ours: hit.t.total, theirs: row.total });
    }
    if (row.date && hit.t.date && row.date !== hit.t.date) {
      diffs.push({ field: 'date', ours: hit.t.date, theirs: row.date });
    }
    if (row.docNumber && normDoc(row.docNumber) !== normDoc(hit.t.docNumber)) {
      diffs.push({ field: 'docNumber', ours: hit.t.docNumber, theirs: row.docNumber });
    }
    // A VAT we never read at all is a difference worth surfacing: the file
    // supplies a number where we had a blank, and that is the cheapest kind
    // of improvement this whole comparison can offer.
    if (row.vat != null && (hit.t.vat == null || Math.abs(row.vat - hit.t.vat) > 0.5)) {
      diffs.push({ field: 'vat', ours: hit.t.vat, theirs: row.vat });
    }
    return { row, targetId: hit.t.id, via: hit.via, diffs };
  });
}

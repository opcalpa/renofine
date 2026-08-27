/**
 * Reading a table someone pasted.
 *
 * A firm leaving Bygglet has no export file: Bygglet publishes no CSV export,
 * and their terms put the burden of extraction on the customer. What such a
 * person actually has in hand is rows selected in Excel or dragged over a
 * screen — which paste as tab-separated text. So the import that fits reality
 * is a box you paste into, not a file picker.
 *
 * Deliberately dependency-free and free of any Supabase import: this module is
 * pure so it can be reasoned about and tested on its own. (Pulling the client
 * into a parsing helper broke that helper's tests twice before.)
 */

export type ClientField = "name" | "email" | "phone" | "address" | "postal_code" | "city" | "skip";

export interface ParsedRow {
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
}

export interface ParsedTable {
  columns: ClientField[];
  rows: ParsedRow[];
  /** Rows that carried no usable name — reported, never silently dropped. */
  skipped: number;
  hadHeader: boolean;
}

/** Header words in the languages a Swedish firm's export is likely to use. */
const HEADERS: Record<string, ClientField> = {
  namn: "name", kund: "name", kundnamn: "name", name: "name", customer: "name", företag: "name", foretag: "name",
  "e-post": "email", epost: "email", email: "email", mail: "email", "e-mail": "email",
  telefon: "phone", tel: "phone", mobil: "phone", phone: "phone", mobile: "phone",
  adress: "address", gatuadress: "address", address: "address", street: "address",
  postnummer: "postal_code", postnr: "postal_code", "post nr": "postal_code", zip: "postal_code", postcode: "postal_code",
  ort: "city", stad: "city", postort: "city", city: "city",
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Swedish postal codes are five digits, often written "123 45". */
const POSTAL = /^\d{3}\s?\d{2}$/;
/** Phone: mostly digits, with the punctuation people actually type. */
const PHONE = /^[+()\d][\d\s\-()]{5,}$/;

function splitDelimiter(text: string): string {
  // Tab first: that is what a spreadsheet selection pastes as, and a name like
  // "Ek, Anna AB" would otherwise be torn in half by a comma.
  if (text.includes("\t")) return "\t";
  if (text.includes(";")) return ";";
  return ",";
}

function classify(value: string): ClientField | null {
  const v = value.trim();
  if (!v) return null;
  if (EMAIL.test(v)) return "email";
  if (POSTAL.test(v)) return "postal_code";
  if (PHONE.test(v) && (v.match(/\d/g) ?? []).length >= 6) return "phone";
  return null;
}

/**
 * Work out what each column is.
 *
 * A header row wins outright — it is the user telling us. Without one we look
 * at the VALUES down each column and take the majority, because guessing from
 * position ("column two is always email") is wrong the moment someone's export
 * is ordered differently.
 */
function inferColumns(cells: string[][], hadHeader: boolean, headerRow: string[]): ClientField[] {
  const width = Math.max(...cells.map((r) => r.length), headerRow.length);
  const cols: ClientField[] = [];

  for (let c = 0; c < width; c++) {
    if (hadHeader) {
      const key = (headerRow[c] ?? "").trim().toLowerCase();
      const mapped = HEADERS[key];
      if (mapped) { cols.push(mapped); continue; }
    }
    const votes: Partial<Record<ClientField, number>> = {};
    for (const row of cells) {
      const kind = classify(row[c] ?? "");
      if (kind) votes[kind] = (votes[kind] ?? 0) + 1;
    }
    const winner = (Object.entries(votes) as [ClientField, number][])
      .sort((a, b) => b[1] - a[1])[0];
    cols.push(winner && winner[1] > 0 ? winner[0] : "skip");
  }

  // Whatever is left over: the first unclassified column is the name, the next
  // is the address. Those are the two that no pattern can recognise, and a
  // register without names is not a register.
  const unresolved = cols.map((c, i) => (c === "skip" ? i : -1)).filter((i) => i >= 0);
  if (!cols.includes("name") && unresolved.length > 0) cols[unresolved.shift()!] = "name";
  if (!cols.includes("address") && unresolved.length > 0) cols[unresolved.shift()!] = "address";
  if (!cols.includes("city") && unresolved.length > 0) cols[unresolved.shift()!] = "city";
  return cols;
}

export function parsePastedClients(text: string): ParsedTable {
  // Trim the line and a leading empty cell disappears with it: "\tanna@x.se"
  // becomes one cell, and a row whose NAME was blank turns into a client called
  // anna@x.se. Drop blank lines, keep the shape, trim the cells instead.
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { columns: [], rows: [], skipped: 0, hadHeader: false };

  const delim = splitDelimiter(text);
  const cells = lines.map((l) => l.split(delim).map((c) => c.trim().replace(/^"(.*)"$/, "$1")));

  const first = cells[0];
  const hadHeader = first.some((c) => HEADERS[c.trim().toLowerCase()] !== undefined);
  const body = hadHeader ? cells.slice(1) : cells;

  const columns = inferColumns(body, hadHeader, hadHeader ? first : []);

  const rows: ParsedRow[] = [];
  let skipped = 0;
  for (const row of body) {
    const pick = (f: ClientField) => {
      const i = columns.indexOf(f);
      const v = i >= 0 ? (row[i] ?? "").trim() : "";
      return v || null;
    };
    const name = pick("name");
    if (!name) { skipped++; continue; }
    rows.push({
      name,
      email: pick("email"),
      phone: pick("phone"),
      address: pick("address"),
      postal_code: pick("postal_code"),
      city: pick("city"),
    });
  }

  return { columns, rows, skipped, hadHeader };
}

/**
 * SIE4 Export Service
 *
 * Generates SIE4 files (Swedish standard for accounting data exchange).
 * Compatible with Fortnox, Visma, Björn Lundén, Hogia, and all Swedish
 * accounting software.
 *
 * Format spec: https://sie.se/format/
 * Character encoding: CP437 (IBM PC) — we output UTF-8 and let user convert if needed.
 */

import { supabase } from "@/integrations/supabase/client";
import { formatLocalDate } from "@/lib/dateUtils";

// BAS-kontoplan (Swedish standard chart of accounts)
const ACCOUNTS = {
  KUNDFORDRINGAR: "1510",       // Kundfordringar
  BANK: "1930",                 // Företagskonto
  FORSALJNING_TJANSTER: "3010", // Försäljning tjänster (ex moms)
  FORSALJNING_VAROR: "3020",    // Försäljning varor (ex moms)
  FORSALJNING_OMVAND: "3231",   // Försäljning byggtjänster, omvänd skattskyldighet
  ROT_FORDRAN: "1513",          // ROT-fordran på Skatteverket
} as const;

/**
 * Utgående moms har ETT konto per sats. Att bokföra 12 %-moms på 2610 är fel
 * även om summan råkar stämma — och det var oundvikligt så länge exporten
 * antog 25 %.
 */
const VAT_ACCOUNTS: Record<number, { account: string; label: string }> = {
  25: { account: "2610", label: "Utgående moms 25%" },
  12: { account: "2620", label: "Utgående moms 12%" },
  6: { account: "2630", label: "Utgående moms 6%" },
};

/** En rad i dokumentets lagrade momsuppdelning. */
interface VatBucket {
  rate: number;
  net: number;
  vat: number;
}

function parseVatBreakdown(raw: unknown): VatBucket[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((b) => b as Record<string, unknown>)
    .filter((b) => b && typeof b === "object")
    .map((b) => ({
      rate: Number(b.rate ?? 0),
      net: Number(b.net ?? 0),
      vat: Number(b.vat ?? 0),
    }))
    .filter((b) => Number.isFinite(b.rate) && Number.isFinite(b.net));
}

interface SieCompanyInfo {
  name: string;
  orgNumber: string;
  address?: string;
  postalCode?: string;
  city?: string;
}

interface SieInvoice {
  id: string;
  invoiceNumber: string;
  date: string;
  dueDate: string | null;
  totalAmount: number;
  totalRotDeduction: number;
  status: string;
  paidAmount: number;
  paidAt: string | null;
  items: SieInvoiceItem[];
  /** Lagrad moms — summan av radernas härledda moms, aldrig omräknad här. */
  vatTotal: number;
  /** Underlag och moms per sats. Det är detta en verifikation ska bokföra. */
  vatBreakdown: VatBucket[];
  reverseCharge: boolean;
  buyerVatNumber: string | null;
}

interface SieInvoiceItem {
  description: string;
  totalPrice: number;
  isRotEligible: boolean;
  rotDeduction: number;
}

function formatSieDate(dateStr: string): string {
  return dateStr.replace(/-/g, "").slice(0, 8);
}

function sieString(value: string): string {
  // SIE strings are quoted
  return `"${value.replace(/"/g, '""')}"`;
}

function generateVerification(
  verNum: number,
  date: string,
  description: string,
  rows: { account: string; amount: number }[]
): string {
  const lines: string[] = [];
  lines.push(`#VER "" ${verNum} ${formatSieDate(date)} ${sieString(description)}`);
  lines.push("{");
  for (const row of rows) {
    // #TRANS account {} amount
    lines.push(`  #TRANS ${row.account} {} ${row.amount.toFixed(2)}`);
  }
  lines.push("}");
  return lines.join("\n");
}

export interface SieSkippedInvoice {
  invoiceNumber: string;
  reason: "noLines";
}

export async function generateSie4Export(
  profileId: string,
  year: number
): Promise<{ content: string; filename: string; skipped: SieSkippedInvoice[] }> {
  // 1. Fetch company info
  const { data: profile } = await supabase
    .from("profiles")
    .select("name, company_name, org_number, company_address, company_postal_code, company_city")
    .eq("id", profileId)
    .single();

  const company: SieCompanyInfo = {
    name: (profile as Record<string, unknown>)?.company_name as string || profile?.name || "Företag",
    orgNumber: (profile as Record<string, unknown>)?.org_number as string || "",
    address: (profile as Record<string, unknown>)?.company_address as string || "",
    postalCode: (profile as Record<string, unknown>)?.company_postal_code as string || "",
    city: (profile as Record<string, unknown>)?.company_city as string || "",
  };

  // 2. Fetch invoices for the year (sent or paid)
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, invoice_number, created_at, due_date, total_amount, total_rot_deduction, status, paid_amount, paid_at, vat_total, vat_breakdown, reverse_charge, buyer_vat_number")
    .eq("creator_id", profileId)
    .in("status", ["sent", "paid", "partially_paid"])
    .gte("created_at", startDate)
    .lte("created_at", endDate + "T23:59:59")
    .order("created_at");

  if (!invoices || invoices.length === 0) {
    return {
      content: "",
      filename: `SIE4_${company.name.replace(/\s/g, "_")}_${year}.se`,
      skipped: [],
    };
  }

  // 3. Fetch items for all invoices
  const invoiceIds = invoices.map((inv) => inv.id);
  const { data: allItems } = await supabase
    .from("invoice_items")
    .select("invoice_id, description, total_price, is_rot_eligible, rot_deduction")
    .in("invoice_id", invoiceIds);

  const itemsByInvoice = new Map<string, SieInvoiceItem[]>();
  for (const item of allItems || []) {
    const arr = itemsByInvoice.get(item.invoice_id) || [];
    arr.push({
      description: item.description || "",
      totalPrice: item.total_price || 0,
      isRotEligible: item.is_rot_eligible || false,
      rotDeduction: item.rot_deduction || 0,
    });
    itemsByInvoice.set(item.invoice_id, arr);
  }

  // En faktura utan rader har ingen känd moms. Att bokföra den som 0 % vore att
  // gissa i ett underlag som går till Skatteverket — den hoppas över och
  // rapporteras i stället tillbaka till användaren.
  const skipped: SieSkippedInvoice[] = [];
  const exportable = invoices.filter((inv) => {
    const has = (itemsByInvoice.get(inv.id) || []).length > 0;
    if (!has) skipped.push({ invoiceNumber: inv.invoice_number || inv.id.slice(0, 8), reason: "noLines" });
    return has;
  });

  const sieInvoices: SieInvoice[] = exportable.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoice_number || "–",
    date: inv.created_at.split("T")[0],
    dueDate: inv.due_date,
    totalAmount: inv.total_amount || 0,
    totalRotDeduction: inv.total_rot_deduction || 0,
    status: inv.status || "sent",
    paidAmount: inv.paid_amount || 0,
    paidAt: inv.paid_at?.split("T")[0] || null,
    items: itemsByInvoice.get(inv.id) || [],
    vatTotal: Number(inv.vat_total ?? 0),
    vatBreakdown: parseVatBreakdown(inv.vat_breakdown),
    reverseCharge: !!inv.reverse_charge,
    buyerVatNumber: inv.buyer_vat_number ?? null,
  }));

  // 4. Build SIE4 file
  const lines: string[] = [];

  // Header
  lines.push("#FLAGGA 0");
  lines.push(`#FORMAT PC8`);
  lines.push(`#SIETYP 4`);
  lines.push(`#PROGRAM "Renofine" "1.0"`);
  lines.push(`#GEN ${formatSieDate(formatLocalDate(new Date()))}`);
  lines.push(`#FNAMN ${sieString(company.name)}`);
  if (company.orgNumber) {
    lines.push(`#ORGNR ${sieString(company.orgNumber)}`);
  }
  if (company.address) {
    lines.push(`#ADRESS ${sieString(company.address)} ${sieString(company.postalCode || "")} ${sieString(company.city || "")}`);
  }

  // Fiscal year
  lines.push(`#RAR 0 ${year}0101 ${year}1231`);

  // Chart of accounts (only accounts we use)
  lines.push(`#KONTO ${ACCOUNTS.KUNDFORDRINGAR} ${sieString("Kundfordringar")}`);
  lines.push(`#KONTO ${ACCOUNTS.BANK} ${sieString("Företagskonto / checkkonto")}`);
  lines.push(`#KONTO ${ACCOUNTS.FORSALJNING_TJANSTER} ${sieString("Försäljning tjänster")}`);
  lines.push(`#KONTO ${ACCOUNTS.FORSALJNING_VAROR} ${sieString("Försäljning varor")}`);
  if (sieInvoices.some((inv) => inv.reverseCharge)) {
    lines.push(
      `#KONTO ${ACCOUNTS.FORSALJNING_OMVAND} ${sieString("Försäljning byggtjänster, omvänd skattskyldighet")}`
    );
  }
  // Ett momskonto per sats som faktiskt förekommer.
  const usedRates = new Set<number>();
  for (const inv of sieInvoices) {
    for (const bucket of inv.vatBreakdown) {
      if (bucket.vat !== 0 && VAT_ACCOUNTS[bucket.rate]) usedRates.add(bucket.rate);
    }
  }
  for (const rate of Array.from(usedRates).sort((a, b) => b - a)) {
    const acc = VAT_ACCOUNTS[rate];
    lines.push(`#KONTO ${acc.account} ${sieString(acc.label)}`);
  }
  lines.push(`#KONTO ${ACCOUNTS.ROT_FORDRAN} ${sieString("ROT-avdrag fordran Skatteverket")}`);

  // Verifications (one per invoice)
  let verNum = 1;

  for (const inv of sieInvoices) {
    const netAmount = inv.totalAmount; // ex moms
    // Momsen LÄSES, den räknas inte om. Förut antog exporten 25 % på allt,
    // vilket gjorde varje 12/6/0 %-faktura och varje omvänd faktura felbokförd.
    const vat = inv.vatTotal;
    const grossAmount = netAmount + vat;
    const rotDeduction = inv.totalRotDeduction || 0;
    const customerOwes = grossAmount - rotDeduction;

    // Verification: Invoice created
    const invoiceRows: { account: string; amount: number }[] = [
      { account: ACCOUNTS.KUNDFORDRINGAR, amount: customerOwes },
    ];

    if (rotDeduction > 0) {
      invoiceRows.push({ account: ACCOUNTS.ROT_FORDRAN, amount: rotDeduction });
    }

    // Intäkten: omvänd byggmoms har eget konto, annars vanlig tjänsteförsäljning.
    const revenueAccount = inv.reverseCharge
      ? ACCOUNTS.FORSALJNING_OMVAND
      : ACCOUNTS.FORSALJNING_TJANSTER;

    // En verifikationsrad per momssats — det är vad en verifikation kräver, och
    // vad momsdeklarationen sedan läser.
    const buckets = inv.vatBreakdown.length > 0
      ? inv.vatBreakdown
      : [{ rate: 25, net: netAmount, vat }];

    for (const bucket of buckets) {
      if (bucket.net !== 0) {
        invoiceRows.push({ account: revenueAccount, amount: -bucket.net });
      }
      if (bucket.vat !== 0) {
        const acc = VAT_ACCOUNTS[bucket.rate];
        if (acc) invoiceRows.push({ account: acc.account, amount: -bucket.vat });
      }
    }

    lines.push("");
    lines.push(generateVerification(
      verNum++,
      inv.date,
      `Faktura ${inv.invoiceNumber}`,
      invoiceRows
    ));

    // Verification: Payment received (if paid)
    if (inv.status === "paid" && inv.paidAt) {
      lines.push("");
      lines.push(generateVerification(
        verNum++,
        inv.paidAt,
        `Betalning ${inv.invoiceNumber}`,
        [
          { account: ACCOUNTS.BANK, amount: customerOwes },
          { account: ACCOUNTS.KUNDFORDRINGAR, amount: -customerOwes },
        ]
      ));
    }

    // ROT payment from Skatteverket (if paid and has ROT)
    if (inv.status === "paid" && inv.paidAt && rotDeduction > 0) {
      lines.push("");
      lines.push(generateVerification(
        verNum++,
        inv.paidAt,
        `ROT-utbetalning Skatteverket ${inv.invoiceNumber}`,
        [
          { account: ACCOUNTS.BANK, amount: rotDeduction },
          { account: ACCOUNTS.ROT_FORDRAN, amount: -rotDeduction },
        ]
      ));
    }
  }

  const content = sieInvoices.length > 0 ? lines.join("\n") + "\n" : "";
  const filename = `SIE4_${company.name.replace(/[^a-zA-Z0-9åäöÅÄÖ]/g, "_")}_${year}.se`;

  return { content, filename, skipped };
}

/**
 * SIE4 deklarerar `#FORMAT PC8`, alltså IBM PC 8-bit (CP437). Filen skrevs
 * tidigare som UTF-8 ändå, vilket gör att "Björn Lundén" blir "BjÃ¶rn LundÃ©n"
 * första gången någon importerar den. Vi skriver därför riktig CP437.
 */
const CP437: Record<string, number> = {
  "Ç": 128, "ü": 129, "é": 130, "â": 131, "ä": 132, "à": 133, "å": 134, "ç": 135,
  "ê": 136, "ë": 137, "è": 138, "ï": 139, "î": 140, "ì": 141, "Ä": 142, "Å": 143,
  "É": 144, "æ": 145, "Æ": 146, "ô": 147, "ö": 148, "ò": 149, "û": 150, "ù": 151,
  "ÿ": 152, "Ö": 153, "Ü": 154, "ø": 155, "£": 156, "Ø": 157, "×": 158, "ƒ": 159,
  "á": 160, "í": 161, "ó": 162, "ú": 163, "ñ": 164, "Ñ": 165, "ª": 166, "º": 167,
  "¿": 168, "½": 171, "¼": 172, "¡": 173, "«": 174, "»": 175, "°": 248, "·": 250,
  "²": 253, "–": 45, "—": 45, "\u201d": 34, "\u201c": 34,
};

export function encodeCp437(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const code = ch.charCodeAt(0);
    if (code < 128) {
      out[i] = code;
    } else if (CP437[ch] != null) {
      out[i] = CP437[ch];
    } else {
      out[i] = 63; // "?" — hellre en synlig lucka än en trasig fil
    }
  }
  return out;
}

export function downloadSieFile(content: string, filename: string) {
  // text/plain utan charset: filen ÄR CP437, och att påstå UTF-8 vore att ljuga
  // för importprogrammet.
  const bytes = encodeCp437(content);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

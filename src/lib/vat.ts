/**
 * vat.ts — momsen räknas EN gång och sparas, aldrig om vid visning.
 *
 * Fram till nu läste kvittotolkningen ut momsen och kastade den vid spar, och
 * varje yta som ville visa moms räknade `subtotal * 0.25` på nytt. Det gör
 * varje 12/6/0 %-rad fel och gör SIE4 omöjlig — en verifikation kräver konto,
 * netto och moms, inte en gissning vid rendering.
 *
 * Rena funktioner, inga beroenden: samma matematik ska kunna köras i en edge
 * function och i en export utan att dra in klienten.
 */

/** Satser Skatteverket känner igen. Bygg är 25 %; 0 % vid undantag/omvänd. */
export const VAT_RATES = [25, 12, 6, 0] as const;
export type VatRate = (typeof VAT_RATES)[number];

export interface VatSplit {
  /** Momsunderlag — beloppet exklusive moms. */
  net: number;
  /** Momsbeloppet som ingår i bruttot. */
  vat: number;
  /** Satsen, eller null när ingen enskild sats förklarar dokumentet. */
  rate: VatRate | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Momsen som ingår i ett bruttobelopp vid en känd sats. */
export function vatFromGross(gross: number, rate: VatRate): number {
  return round2((gross * rate) / (100 + rate));
}

/** Bruttot av ett nettobelopp vid en känd sats. */
export function grossFromNet(net: number, rate: VatRate): number {
  return round2(net * (1 + rate / 100));
}

/**
 * Vilken ENDA sats förklarar det utlästa momsbeloppet?
 *
 * Toleransen täcker öresavrundning och OCR-brus. Träffar ingen sats returneras
 * null — ett kvitto med blandade satser ska inte tvingas in i en sats, för då
 * blir varje rad fel även om summan råkar stämma.
 */
export function inferVatRate(gross: number, vat: number): VatRate | null {
  if (!(gross > 0) || !Number.isFinite(vat) || vat < 0) return null;
  const tolerance = Math.max(1, gross * 0.005);
  let best: VatRate | null = null;
  let bestDiff = Infinity;
  for (const rate of VAT_RATES) {
    const diff = Math.abs(vatFromGross(gross, rate) - vat);
    if (diff <= tolerance && diff < bestDiff) {
      best = rate;
      bestDiff = diff;
    }
  }
  return best;
}

/**
 * Dela upp ett dokuments bruttobelopp i underlag + moms utifrån den utlästa
 * momsen. Returnerar null när momsen inte är känd — null betyder "vet ej", och
 * det är en annan sak än 0 kr moms.
 */
export function splitDocumentVat(
  gross: number,
  extractedVat: number | null | undefined,
): VatSplit | null {
  if (extractedVat == null || !Number.isFinite(extractedVat)) return null;
  if (!Number.isFinite(gross) || !(gross > 0)) return null;
  const vat = round2(extractedVat);
  if (vat < 0 || vat >= gross) return null;
  return { net: round2(gross - vat), vat, rate: inferVatRate(gross, vat) };
}

/**
 * Momsen per rad — bara när en enda sats förklarar hela dokumentet. Vid
 * blandade satser lämnas raderna tomma: att smeta ut momsen proportionellt
 * summerar rätt men ljuger på varje enskild rad, och raden är vad bokföringen
 * läser.
 */
export function lineVat(
  lineGross: number | null | undefined,
  rate: VatRate | null,
): { vat_rate: number | null; vat_amount: number | null } {
  if (rate == null || lineGross == null || !Number.isFinite(lineGross)) {
    return { vat_rate: null, vat_amount: null };
  }
  return { vat_rate: rate, vat_amount: vatFromGross(lineGross, rate) };
}

/**
 * Momsfälten för en inköpsorder, redo att spridas in i en insert.
 *
 * `gross` är dokumentets utskrivna totalsumma. ROT-avdraget sänker vad kunden
 * betalar men inte momsunderlaget, så momsen ska alltid räknas på bruttot —
 * även när orderns `total` lagras netto efter ROT.
 */
export function purchaseVatFields(
  gross: number,
  extractedVat: number | null | undefined,
): { vat_amount: number | null; net_amount: number | null; vat_rate: VatRate | null } {
  const split = splitDocumentVat(gross, extractedVat);
  if (!split) return { vat_amount: null, net_amount: null, vat_rate: null };
  return { vat_amount: split.vat, net_amount: split.net, vat_rate: split.rate };
}

/** Momsen på ett NETTObelopp vid en känd sats (offert/faktura räknar ex moms). */
export function vatFromNet(net: number, rate: VatRate): number {
  return round2((net * rate) / 100);
}

/**
 * Ett sparat dokuments moms = summan av radernas LAGRADE moms.
 *
 * `vat_amount` är en härledd kolumn i databasen och finns därför på varje rad
 * som hämtats med `select("*")`. Saknas den — en vy som väljer kolumner
 * explicit och inte fått med den — faller vi tillbaka på 25 %, vilket är exakt
 * vad dokumentet visade före den här ändringen. Fallbacken finns för att ingen
 * siffra ska röra sig bakåt, den är inte modellen.
 */
export function documentVat(
  items: Array<{ total_price?: number | null; vat_amount?: number | null }>,
): number {
  return round2(
    items.reduce(
      (sum, i) => sum + (i.vat_amount ?? (i.total_price ?? 0) * 0.25),
      0,
    ),
  );
}

/**
 * Momsen på ett UTKAST som ännu inte sparats. Varje rad bär sin egen sats så att
 * en 0 %-rad (omvänd betalningsskyldighet, undantag) blir rätt redan i
 * förhandsvisningen — inte först när dokumentet sparats.
 */
export function draftVat(items: Array<{ net: number; vatRate?: number | null }>): number {
  return round2(
    items.reduce((sum, i) => sum + (i.net * (i.vatRate ?? 25)) / 100, 0),
  );
}

/**
 * Etiketten på momsraden. En enda sats skrivs ut ("Moms 25 %"); vid flera satser
 * skrivs ingen siffra alls, för då är varje enskild procentsats en lögn.
 *
 * Fram till nu satt siffran i själva översättningen ("Moms 25%", och i tyskan
 * "MwSt. 19%" som aldrig stämde med räkningen). Satsen hör till dokumentet, inte
 * till språket.
 */
export function vatLabel(base: string, rates: Array<number | null | undefined>): string {
  const uniq = Array.from(new Set(rates.map((r) => (r == null ? 25 : Number(r)))));
  return uniq.length === 1 ? `${base} ${uniq[0]} %` : base;
}

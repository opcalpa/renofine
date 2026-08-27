/**
 * reverseCharge.ts — omvänd betalningsskyldighet (omvänd byggmoms), reglerna på
 * ETT ställe.
 *
 * Skatteverket kräver att BÅDA villkoren är uppfyllda:
 *   1. Tjänsten är en byggtjänst enligt momslagen, utförd i Sverige.
 *   2. KÖPAREN är en beskattningsbar person som inte bara tillfälligt säljer
 *      sådana byggtjänster (eller mellanmansregeln).
 *
 * Villkor 2 handlar om kunden, inte om oss — därför läser vi
 * `clients.sells_construction`. Villkor 1 kan koden inte avgöra åt användaren:
 * bedömningen görs PER DOKUMENT ("dominerar byggtjänsten följer materialraderna
 * med"), och en ren varuleverans saknar byggtjänst. Därför är villkor 1 en
 * uttrycklig bekräftelse från den som skriver dokumentet, inte en gissning ur
 * radernas text.
 *
 * Databasen har samma regler som grindar (migration 20260827130000). De här
 * funktionerna finns för att användaren ska få ett begripligt svar INNAN hen
 * trycker spara, inte för att vara den enda kontrollen.
 */

/** Texten som måste stå på fakturan. Ordalydelsen är Skatteverkets. */
export const REVERSE_CHARGE_NOTE = "Omvänd betalningsskyldighet";

export interface ReverseChargeCheck {
  /** Får rutan över huvud taget visas? */
  available: boolean;
  /** Varför inte — nyckel för översättning. */
  unavailableReason?: "clientNotConstructionSeller" | "noClient";
}

/**
 * Får omvänd betalningsskyldighet ERBJUDAS för den här kunden?
 * Aldrig mot en hemägare: en privatperson säljer inte byggtjänster, och ett fel
 * åt det hållet är en faktura utan moms som Skatteverket underkänner.
 */
export function reverseChargeAvailability(
  client: { sells_construction?: boolean | null } | null | undefined,
): ReverseChargeCheck {
  if (!client) return { available: false, unavailableReason: "noClient" };
  if (!client.sells_construction) {
    return { available: false, unavailableReason: "clientNotConstructionSeller" };
  }
  return { available: true };
}

export type ReverseChargeProblem =
  | "missingBuyerVatNumber"
  | "rotConflict"
  | "serviceNotConfirmed";

/**
 * Vad som saknas innan dokumentet får lämna huset.
 *
 * ROT och omvänd byggmoms utesluter varandra — ROT är för privatpersoner,
 * omvänd byggmoms kräver en byggtjänstsäljande köpare. Kryssas båda ska det bli
 * ett felmeddelande, aldrig en tyst prioritering.
 */
export function reverseChargeProblems(input: {
  enabled: boolean;
  buyerVatNumber?: string | null;
  anyRotEligible: boolean;
  constructionServiceConfirmed: boolean;
}): ReverseChargeProblem[] {
  if (!input.enabled) return [];
  const problems: ReverseChargeProblem[] = [];
  if (!input.constructionServiceConfirmed) problems.push("serviceNotConfirmed");
  if (input.anyRotEligible) problems.push("rotConflict");
  if (!input.buyerVatNumber || input.buyerVatNumber.trim() === "") {
    problems.push("missingBuyerVatNumber");
  }
  return problems;
}

/**
 * Ett svenskt momsregistreringsnummer är SE + tio siffror + 01
 * (organisationsnumret utan bindestreck). Vi normaliserar men vägrar inte ett
 * utländskt format — en köpare kan vara registrerad i ett annat EU-land.
 */
export function normalizeVatNumber(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

/** Ser numret ut som ett svenskt momsnummer? Används för en varning, ingen spärr. */
export function looksLikeSwedishVatNumber(raw: string): boolean {
  return /^SE\d{12}$/.test(normalizeVatNumber(raw));
}

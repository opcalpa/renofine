/**
 * rot.ts — ROT räknas EN gång, med taket, och samma matematik överallt.
 *
 * Fram till nu räknade sju ytor `rotEligibleTotal * 1.25 * 0.3` var för sig och
 * ingen av dem kände till årstaket. Över 133 333 kr arbetskostnad ex moms fick
 * kunden ett slutpris som inte går att uppnå — och upptäckte det först vid
 * deklarationen. Taket fanns redan i systemet (`rot_yearly_limits`,
 * `project_rot_persons`) och tillämpades i budgetvyerna, bara inte på de papper
 * som faktiskt går till kunden.
 *
 * Rena funktioner, inga beroenden — samma skäl som `vat.ts`: matematiken ska
 * kunna köras i en edge function och i en export utan att dra in klienten.
 * Kapaciteten hämtas separat (se `services/rotCapacityService.ts`).
 */

/** Skatteverket: 30 % av arbetskostnaden inklusive moms. */
export const ROT_RATE = 0.3;

/** Arbete är alltid 25 % moms; avdraget räknas på beloppet INKLUSIVE moms. */
const ROT_VAT_MULTIPLIER = 1.25;

/** Skatteverkets tak per person och år, när `rot_yearly_limits` saknar året. */
export const ROT_DEFAULT_YEARLY_LIMIT = 50000;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Avdraget på en arbetskostnad ex moms, UTAN tak. */
export function rotFromLaborNet(laborNet: number): number {
  return round2(laborNet * ROT_VAT_MULTIPLIER * ROT_RATE);
}

export interface RotPerson {
  name?: string | null;
  personnummer?: string | null;
  /** Satt när personen redan förbrukat en del av året. */
  custom_yearly_limit?: number | null;
}

export interface RotCapacity {
  /** Hushållets samlade ROT-utrymme i kronor. */
  totalLimit: number;
  /** Antal personer utrymmet bygger på — skrivs ut på dokumentet. */
  personCount: number;
}

/**
 * Hushållets ROT-utrymme.
 *
 * Personer dedupliceras på personnummer (samma person kan stå på flera rader),
 * och var och en bidrar med sitt eget tak när ett sådant är satt. Utan
 * registrerade personer antas EN person med årets tak — ett medvetet
 * konservativt antagande: gissar vi fel underskattar vi avdraget, och kunden
 * betalar för mycket i stället för att få ett papper som inte går att lösa in.
 */
export function rotCapacity(
  persons: RotPerson[] | null | undefined,
  defaultLimit: number = ROT_DEFAULT_YEARLY_LIMIT,
): RotCapacity {
  const unique = new Map<string, RotPerson>();
  for (const p of persons ?? []) {
    const key = p.personnummer || p.name || "";
    if (!key || unique.has(key)) continue;
    unique.set(key, p);
  }
  const totalLimit = [...unique.values()].reduce(
    (sum, p) => sum + (p.custom_yearly_limit ?? defaultLimit),
    0,
  );
  return {
    totalLimit: totalLimit || defaultLimit,
    personCount: Math.max(unique.size, 1),
  };
}

/** Kapaciteten som gäller när projektets personer inte är kända. */
export const DEFAULT_ROT_CAPACITY: RotCapacity = {
  totalLimit: ROT_DEFAULT_YEARLY_LIMIT,
  personCount: 1,
};

export interface CappedRot extends RotCapacity {
  /** Vad raderna summerar till innan taket. */
  uncapped: number;
  /** Vad dokumentet får dra av — aldrig mer än `totalLimit`. */
  deduction: number;
  /** Sant när taket faktiskt bet, dvs. dokumentet måste förklara sig. */
  isCapped: boolean;
}

/**
 * Lägg taket på ett redan summerat avdrag.
 *
 * Taket är en egenskap hos hushållet och året, inte hos en rad — det går
 * därför inte att tillämpa per offertrad, bara på summan.
 */
export function capRot(
  uncapped: number,
  capacity: RotCapacity = DEFAULT_ROT_CAPACITY,
): CappedRot {
  const safe = Math.max(0, round2(uncapped));
  const limit = Math.max(0, capacity.totalLimit);
  return {
    uncapped: safe,
    deduction: Math.min(safe, limit),
    isCapped: safe > limit,
    totalLimit: limit,
    personCount: capacity.personCount,
  };
}

/** Summera radernas avdrag och lägg taket. Radens eget `rot_deduction` vinner
 *  när det finns sparat; annars räknas det ur nettot. */
export function capRotForItems(
  items: { net: number; isRotEligible?: boolean | null; rotDeduction?: number | null }[],
  capacity: RotCapacity = DEFAULT_ROT_CAPACITY,
): CappedRot {
  const uncapped = items.reduce((sum, i) => {
    if (typeof i.rotDeduction === "number") return sum + i.rotDeduction;
    return i.isRotEligible ? sum + rotFromLaborNet(i.net) : sum;
  }, 0);
  return capRot(uncapped, capacity);
}

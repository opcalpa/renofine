/**
 * What ROT asks for at THIS home — one engine, one answer (P2).
 *
 * Verified against skatteverket.se on 2026-08-24:
 *   • rotavdrag covers "hens småhus, ägarlägenhet eller bostadsrätt", and the
 *     customer "måste äga bostaden under den period som arbetet utförs".
 *     A "hyrd bostad" gives no rotavdrag at all.
 *   • småhus / ägarlägenhet → "Fastighetsbeteckningen"
 *   • bostadsrätt           → "Bostadsrättsföreningens organisationsnummer och
 *                              lägenhetsnummer (vanligen fyra siffror)"
 *
 * Before this, the app only knew `property_designation` — so a bostadsrätt
 * owner, likely most of the Stockholm users, was shown a field they cannot
 * fill in and no hint that something else applies to them.
 *
 * Everything here REPORTS what Skatteverket asks for. Nothing here advises:
 * the copy this drives says "Skatteverket ber om…", never "du ska…".
 */

import type { PropertyRow, Tenure } from '@/services/propertyService';

export type RotIdentifierKey = 'property_designation' | 'brf_org_number' | 'apartment_number';

export interface RotIdentifier {
  key: RotIdentifierKey;
  labelKey: string;
  /** Where the person can actually find this. */
  hintKey: string;
  value: string | null;
}

export type RotEligibility =
  /** The home is owned — ROT applies, and identifiers are known. */
  | 'eligible'
  /** A rental. ROT requires owning the home, so no identifiers are asked for. */
  | 'not_applicable'
  /** Nobody has said yet. Ask before showing fields that may not apply. */
  | 'unknown';

export interface RotIdentifierStatus {
  tenure: Tenure | null;
  eligibility: RotEligibility;
  /** What Skatteverket asks for at this home. Empty unless eligible. */
  required: RotIdentifier[];
  /** The subset still blank. */
  missing: RotIdentifier[];
  complete: boolean;
}

type PropertyIdentifierFields = Pick<
  PropertyRow,
  'tenure' | 'property_designation' | 'brf_org_number' | 'apartment_number'
>;

const clean = (v: string | null | undefined): string | null => v?.trim() || null;

/**
 * @param property   the address the project sits on, or null when it has none
 * @param fallbackDesignation `projects.property_designation` — the field that
 *   existed before addresses did. Read as a fallback, never written to: the
 *   address is the single place these belong now (write-through rule, §6 of
 *   the address plan), and duplicating the new fields onto the project would
 *   recreate the split that plan removed.
 */
export function rotIdentifierStatus(
  property: PropertyIdentifierFields | null,
  fallbackDesignation?: string | null
): RotIdentifierStatus {
  const tenure = property?.tenure ?? null;
  const designation = clean(property?.property_designation) ?? clean(fallbackDesignation);

  if (tenure === 'hyresratt') {
    return { tenure, eligibility: 'not_applicable', required: [], missing: [], complete: false };
  }

  if (tenure === null) {
    return { tenure, eligibility: 'unknown', required: [], missing: [], complete: false };
  }

  const required: RotIdentifier[] =
    tenure === 'bostadsratt'
      ? [
          {
            key: 'brf_org_number',
            labelKey: 'rot.tenure.brfOrgNumber',
            hintKey: 'rot.tenure.brfOrgNumberHint',
            value: clean(property?.brf_org_number),
          },
          {
            key: 'apartment_number',
            labelKey: 'rot.tenure.apartmentNumber',
            hintKey: 'rot.tenure.apartmentNumberHint',
            value: clean(property?.apartment_number),
          },
        ]
      : [
          {
            key: 'property_designation',
            labelKey: 'rot.propertyDesignation',
            hintKey: 'rot.tenure.designationHint',
            value: designation,
          },
        ];

  const missing = required.filter((r) => !r.value);
  return { tenure, eligibility: 'eligible', required, missing, complete: missing.length === 0 };
}

/** The three answers, in the order they are offered. */
export const TENURE_OPTIONS: { value: Tenure; labelKey: string }[] = [
  { value: 'bostadsratt', labelKey: 'rot.tenure.bostadsratt' },
  { value: 'aganderatt', labelKey: 'rot.tenure.aganderatt' },
  { value: 'hyresratt', labelKey: 'rot.tenure.hyresratt' },
];

/**
 * Profession options for the "contractor" role.
 *
 * The values match the existing `contractor_role` enum in Postgres
 * (project_invitations.contractor_role and project_shares.contractor_role),
 * so saving them requires no schema change.
 */
export const PROFESSION_KEYS = [
  "carpenter",
  "electrician",
  "plumber",
  "painter",
  "designer",
  "architect",
  "general_contractor",
  "supplier",
  "other",
] as const;

export type ProfessionKey = (typeof PROFESSION_KEYS)[number];

export const isProfessionKey = (v: unknown): v is ProfessionKey =>
  typeof v === "string" && (PROFESSION_KEYS as readonly string[]).includes(v);

export const getProfessionLabel = (
  value: string | null | undefined,
  t: (key: string, fallback?: string) => string,
): string | null => {
  if (!value || value === "other") return null;
  if (!isProfessionKey(value)) return null;
  return t(`professions.${value}`, value);
};

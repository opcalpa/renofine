import type { FeatureAccess } from "../FeatureAccessEditor";

export type InvitePath = "worker" | "member";

export const PROFESSION_KEYS = [
  "carpenter",
  "electrician",
  "plumber",
  "painter",
  "tiler",
  "hvac",
  "general_contractor",
  "architect",
  "supplier",
  "customer",
  "auditor",
  "agent",
  "broker",
  "other",
] as const;

export type ProfessionKey = (typeof PROFESSION_KEYS)[number];

export type PackagePreset = "insyn" | "aktiv" | "custom";

export interface MemberAccessConfig {
  preset: PackagePreset;
  onlyAssigned: boolean;
  access: FeatureAccess;
}

export interface WorkerAccessConfig {
  taskIds: string[];
  canProposePurchases: boolean;
  canLogPurchases: boolean;
}

export interface ContactInfo {
  name: string;
  email: string;
  phone: string;
  language?: string;
  welcomeMessage?: string;
}

export type WizardStep = 1 | 2 | 3;

export interface InviteWizardState {
  step: WizardStep;
  path: InvitePath;
  profession: ProfessionKey | null;
  memberAccess: MemberAccessConfig;
  workerAccess: WorkerAccessConfig;
  contact: ContactInfo;
}

import type { FeatureAccess } from "../FeatureAccessEditor";
import type { TaskOverride } from "../WorkerInviteFields";

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

export interface InstructionImage {
  /** Temp local id (React key + identifier before insert). */
  localId: string;
  /** "existing" = reference to photos.id; "upload" = new file. */
  source: "existing" | "upload";
  /** Set when source = "existing". */
  photoId?: string;
  /** Set when source = "upload" (resolved after upload during submit). */
  uploadedUrl?: string;
  /** File pending upload — kept only in wizard state, not serialized. */
  file?: File;
  /** Preview URL (object URL for uploads, photo URL for existing). */
  previewUrl: string;
  /** Owner-authored instruction shown to the worker. */
  description: string;
}

export interface WorkerAccessConfig {
  taskIds: string[];
  canProposePurchases: boolean;
  canLogPurchases: boolean;
  /** Per-task customizations (description/checklist/photos). Empty Map = use defaults. */
  taskOverrides: Map<string, TaskOverride>;
  /** Per-task instruction images (selected existing + uploaded). */
  instructionImages: Map<string, InstructionImage[]>;
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

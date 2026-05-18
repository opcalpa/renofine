import type { TaskOverride } from "../WorkerInviteFields";

/** Who the invited person is — the wizard's first (human) question. */
export type InvitePersona = "worker" | "client" | "member" | "pm" | "reviewer";

/** PM sub-type — purely a label, no functional access difference. */
export type PmSubType = "co_owner" | "pm_hired";

/** Economy visibility mode. Maps deterministically onto FeatureAccess. */
export type EconomyMode = "none" | "own" | "full";

/** What slice of the project a member/PM can act on. */
export type ScopeRule = "assigned" | "all" | "by_room" | "by_tag";

export interface ScopeConfig {
  rule: ScopeRule;
  /** Set when rule = "by_room". */
  roomIds?: string[];
  /** Set when rule = "by_tag". */
  tags?: string[];
}

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
  persona: InvitePersona;
  /** Label only — does not affect access. Used for member/PM. */
  profession: ProfessionKey | null;
  /** Economy mode (member: none/own, pm: none/own/full). */
  mode: EconomyMode;
  /** Task/purchase scope for member/PM. */
  scope: ScopeConfig;
  /** Only set when persona = "pm". */
  pmSubType: PmSubType | null;
  /** ISO timestamp when the share auto-expires, or null = permanent. */
  expiresAt: string | null;
  workerAccess: WorkerAccessConfig;
  contact: ContactInfo;
}

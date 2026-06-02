import type { WorkType } from "@/services/intakeService";

export interface PlanningWizardRoom {
  id: string;
  name: string;
  nameKey?: string; // maps to getRoomSuggestions() for icon lookup
  width_m?: number;
  depth_m?: number;
  area_sqm?: number;
  ceiling_height_m?: number;
  aiSuggested?: boolean;
}

export interface RoomSpecificWork {
  description: string;
  workTypes: WorkType[];
  excludedGlobals: WorkType[]; // global work types excluded for this specific room
  /**
   * AI-supplied task titles per workType, when available. Used at task-creation time
   * to give specific names ("Riva befintligt kök") instead of generic ones ("Rivning - Kök").
   * Missing keys fall back to the generic naming.
   */
  taskTitles?: Partial<Record<WorkType, string>>;
}

export type AIPropertyType = "apartment" | "villa" | "townhouse" | "summerhouse" | "other";

export interface AIParsedResult {
  propertyType: AIPropertyType | null;
  floors: number | null;
  totalAreaSqm: number | null;
  rooms: Array<{
    nameKey: string;
    name: string;
    suggestedWorkTypes: WorkType[];
    taskTitles?: Partial<Record<WorkType, string>>;
  }>;
  otherSpaces: Array<{ nameKey: string; name: string }>;
  globalWorkTypes: WorkType[];
  globalTaskTitles?: Partial<Record<WorkType, string>>;
  summary: string;
}

export interface PlanningWizardData {
  // Step 1
  description: string;
  aiParsed: AIParsedResult | null;

  // Step 2 — confirmed AI object-level summary (editable)
  propertyType: AIPropertyType | null;
  floors: number | null;
  totalAreaSqm: number | undefined;
  rooms: PlanningWizardRoom[];
  otherSpaces: PlanningWizardRoom[];

  // Step 3 — global work types applied to ALL rooms
  globalWorkTypes: WorkType[];

  // Step 4 — per-room specific work
  roomSpecificWork: Record<string, RoomSpecificWork>;
}

export interface PlanningStepProps {
  formData: PlanningWizardData;
  updateFormData: (updates: Partial<PlanningWizardData>) => void;
}

export const TOTAL_STEPS = 3;

export const INITIAL_FORM_DATA: PlanningWizardData = {
  description: "",
  aiParsed: null,
  propertyType: null,
  floors: null,
  totalAreaSqm: undefined,
  rooms: [],
  otherSpaces: [],
  globalWorkTypes: [],
  roomSpecificWork: {},
};

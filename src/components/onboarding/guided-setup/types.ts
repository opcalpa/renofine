import type { WorkType } from "@/services/intakeService";

export interface WizardRoom {
  id: string;
  name: string;
  width_m?: number;    // Length in meters (maps to width_mm in DB)
  depth_m?: number;    // Depth/width in meters (maps to height_mm in DB)
  area_sqm?: number;
  ceiling_height_mm: number;
}

export interface WizardWorkType {
  id: string;
  type: "predefined" | "custom";
  value: WorkType | null;
  label: string;
}

export type TaskMatrix = Record<string, Set<string>>;
export const WHOLE_PROPERTY_KEY = "__whole__";

export interface GuidedFormData {
  projectName: string;
  address: string;
  postalCode: string;
  city: string;
  rooms: WizardRoom[];
  workTypes: WizardWorkType[];
  matrix: TaskMatrix;
}

export interface StepProps {
  formData: GuidedFormData;
  updateFormData: (updates: Partial<GuidedFormData>) => void;
}

export const INITIAL_FORM_DATA: GuidedFormData = {
  projectName: "",
  address: "",
  postalCode: "",
  city: "",
  rooms: [],
  workTypes: [],
  matrix: {},
};

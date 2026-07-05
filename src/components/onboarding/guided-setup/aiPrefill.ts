import type { AIParsedResult } from "@/components/project/overview/planning-wizard/types";
import type { WorkType } from "@/services/intakeService";
import { getWorkTypes } from "@/services/intakeService";
import {
  WHOLE_PROPERTY_KEY,
  type GuidedFormData,
  type TaskMatrix,
  type WizardRoom,
  type WizardWorkType,
} from "./types";

/**
 * Map a parse-renovation-description result onto the guided setup form.
 * Rooms keep their AI-given names, work types become predefined selections
 * (id = work type value, mirroring WorkTypesStep), and the matrix links
 * room-specific work to its room and global work to the whole property.
 */
export function aiResultToGuidedData(
  parsed: AIParsedResult,
  labelFor: (workType: WorkType) => string
): Pick<GuidedFormData, "rooms" | "workTypes" | "matrix"> {
  const knownValues = new Set<WorkType>(getWorkTypes().map((w) => w.value));

  const rooms: WizardRoom[] = parsed.rooms.map((r) => ({
    id: crypto.randomUUID(),
    name: r.name,
    ceiling_height_mm: 2400,
  }));
  // Spaces the AI discovered but that have no planned work — still part of the home.
  const otherRooms: WizardRoom[] = (parsed.otherSpaces ?? []).map((r) => ({
    id: crypto.randomUUID(),
    name: r.name,
    ceiling_height_mm: 2400,
  }));

  const workTypeValues: WorkType[] = [];
  const seen = new Set<WorkType>();
  const addWorkType = (value: WorkType) => {
    if (knownValues.has(value) && !seen.has(value)) {
      seen.add(value);
      workTypeValues.push(value);
    }
  };
  parsed.globalWorkTypes.forEach(addWorkType);
  parsed.rooms.forEach((r) => r.suggestedWorkTypes.forEach(addWorkType));

  const workTypes: WizardWorkType[] = workTypeValues.map((value) => ({
    id: value,
    type: "predefined",
    value,
    label: labelFor(value),
  }));

  const matrix: TaskMatrix = {};
  for (const value of workTypeValues) {
    const selection = new Set<string>();
    if (parsed.globalWorkTypes.includes(value)) {
      selection.add(WHOLE_PROPERTY_KEY);
    }
    parsed.rooms.forEach((r, i) => {
      if (r.suggestedWorkTypes.includes(value)) {
        selection.add(rooms[i].id);
      }
    });
    if (selection.size > 0) {
      matrix[value] = selection;
    }
  }

  return { rooms: [...rooms, ...otherRooms], workTypes, matrix };
}

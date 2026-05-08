import { CalculationsSection } from "../../sections/CalculationsSection";
import { IdentitySection } from "../../sections/IdentitySection";
import type { RoomFormData } from "../../types";

interface MeasurementsTabProps {
  formData: RoomFormData;
  updateFormData: (updates: Partial<RoomFormData>) => void;
  updateSpec: <K extends keyof RoomFormData>(
    specKey: K,
    updates: Partial<RoomFormData[K]>
  ) => void;
  areaSqm?: number;
  perimeterMm?: number;
  createdAt?: string;
}

export function MeasurementsTab({
  formData,
  updateFormData,
  updateSpec,
  areaSqm,
  perimeterMm,
  createdAt,
}: MeasurementsTabProps) {
  return (
    <div className="flex flex-col gap-5 px-6 py-5">
      <IdentitySection
        formData={formData}
        updateFormData={updateFormData}
        updateSpec={updateSpec}
        areaSqm={areaSqm}
        perimeterMm={perimeterMm}
        createdAt={createdAt}
      />
      <CalculationsSection
        formData={formData}
        areaSqm={areaSqm ?? null}
        perimeterMm={perimeterMm ?? null}
      />
    </div>
  );
}

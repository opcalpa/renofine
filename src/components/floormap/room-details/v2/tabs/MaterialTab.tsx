import { useTranslation } from "react-i18next";
import { HorizontalSection } from "../../sections/HorizontalSection";
import { VerticalSection } from "../../sections/VerticalSection";
import { TechnicalSection } from "../../sections/TechnicalSection";
import { RoomItemsSection } from "../../sections/RoomItemsSection";
import { FilledIndicator } from "../../components/FilledIndicator";
import { countFilledFields } from "../../utils/countFilledFields";
import type { RoomFormData } from "../../types";

interface MaterialTabProps {
  formData: RoomFormData;
  updateFormData: (updates: Partial<RoomFormData>) => void;
  updateSpec: <K extends keyof RoomFormData>(
    specKey: K,
    updates: Partial<RoomFormData[K]>
  ) => void;
  roomId?: string;
  projectId: string;
}

function SectionHeader({ label, filled, total }: { label: string; filled: number; total: number }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <span className="rf-section-label">{label}</span>
      <FilledIndicator filled={filled} total={total} />
    </div>
  );
}

export function MaterialTab({ formData, updateFormData, updateSpec, roomId, projectId }: MaterialTabProps) {
  const { t } = useTranslation();
  const counts = countFilledFields(formData);

  return (
    <div className="flex flex-col gap-5 px-6 py-5">
      <div>
        <SectionHeader
          label={t("rooms.floorAndCeiling", "Golv & Tak")}
          filled={counts.floorCeiling.filled}
          total={counts.floorCeiling.total}
        />
        <HorizontalSection formData={formData} updateFormData={updateFormData} updateSpec={updateSpec} />
      </div>

      <div>
        <SectionHeader
          label={t("rooms.wallsAndJoinery", "Väggar & Snickerier")}
          filled={counts.wallsJoinery.filled}
          total={counts.wallsJoinery.total}
        />
        <VerticalSection formData={formData} updateFormData={updateFormData} updateSpec={updateSpec} />
      </div>

      <div>
        <SectionHeader
          label={t("rooms.electricalAndHeating", "El & Värme")}
          filled={counts.electricalHeating.filled}
          total={counts.electricalHeating.total}
        />
        <TechnicalSection formData={formData} updateFormData={updateFormData} updateSpec={updateSpec} />
      </div>

      <div>
        <span className="rf-section-label mb-2 block">{t("roomItems.electricalItems", "El-objekt")}</span>
        <RoomItemsSection roomId={roomId} projectId={projectId} category="electrical" />
      </div>
    </div>
  );
}

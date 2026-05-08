import { useTranslation } from "react-i18next";
import { VisionSection } from "../../sections/VisionSection";
import { FilledIndicator } from "../../components/FilledIndicator";
import type { RoomFormData } from "../../types";

interface OverviewTabProps {
  formData: RoomFormData;
  updateFormData: (updates: Partial<RoomFormData>) => void;
  createdAt?: string;
  updatedAt?: string;
}

export function OverviewTab({ formData, updateFormData, createdAt, updatedAt }: OverviewTabProps) {
  const { t, i18n } = useTranslation();
  const visionFilled = formData.description ? 1 : 0;

  const fmtDate = (iso?: string) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString(i18n.language === "sv" ? "sv-SE" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="flex flex-col gap-5 px-6 py-5">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="rf-section-label">{t("rooms.customerWishes", "Kundens önskemål")}</span>
          <FilledIndicator filled={visionFilled} total={1} />
        </div>
        <VisionSection formData={formData} updateFormData={updateFormData} />
      </div>

      <div>
        <span className="rf-section-label mb-2 block">{t("rooms.quickInfo", "Snabbinfo")}</span>
        <div className="grid grid-cols-2 gap-2">
          {[
            { k: t("rooms.createdAt", "Skapat"), v: fmtDate(createdAt) },
            { k: t("rooms.updatedAt", "Uppdaterat"), v: fmtDate(updatedAt) },
          ].map((s) => (
            <div
              key={s.k}
              className="rounded-md border px-3 py-2"
              style={{
                borderColor: "var(--rf-hairline)",
                background: "var(--rf-paper-2)",
              }}
            >
              <div className="rf-section-label mb-0.5">{s.k}</div>
              <div style={{ fontSize: 13, color: "var(--rf-ink)" }}>{s.v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

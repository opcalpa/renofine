import { useTranslation } from "react-i18next";
import { ComboboxSelect } from "../fields/ComboboxSelect";
import { ELECTRICAL_SERIES_OPTIONS, HEATING_TYPE_OPTIONS } from "../constants";
import type { SectionProps, ElectricalSpec, HeatingSpec } from "../types";

function SpecRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-sm text-muted-foreground shrink-0 w-28 truncate">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function SubHeader({ label }: { label: string }) {
  return (
    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide pt-1 pb-0.5">
      {label}
    </p>
  );
}

export function TechnicalSection({ formData, updateSpec }: SectionProps) {
  const { t } = useTranslation();
  const electricalSpec = formData.electrical_spec as ElectricalSpec;
  const heatingSpec = formData.heating_spec as HeatingSpec;

  return (
    <div className="space-y-1">
      {/* El & Belysning */}
      <SubHeader label={t("rooms.electricalAndLighting")} />
      <div className="divide-y divide-border/50">
        <SpecRow label={t("rooms.series")}>
          <ComboboxSelect
            id="electrical-series"
            options={ELECTRICAL_SERIES_OPTIONS}
            value={electricalSpec?.series || ""}
            onChange={(value) => updateSpec("electrical_spec", { ...electricalSpec, series: value })}
            placeholder={t("rooms.selectSeries")}
          />
        </SpecRow>
      </div>

      {/* Värme */}
      <div className="border-t pt-2">
        <SubHeader label={t("rooms.heating")} />
      </div>
      <div className="divide-y divide-border/50">
        <SpecRow label={t("rooms.heatingType")}>
          <ComboboxSelect
            id="heating-type"
            options={HEATING_TYPE_OPTIONS}
            value={heatingSpec?.type || ""}
            onChange={(value) => updateSpec("heating_spec", { ...heatingSpec, type: value })}
            placeholder={t("rooms.selectHeatingType")}
          />
        </SpecRow>
      </div>
    </div>
  );
}

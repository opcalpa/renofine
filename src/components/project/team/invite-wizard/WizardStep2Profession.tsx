import { useTranslation } from "react-i18next";
import {
  Hammer,
  Zap,
  Wrench,
  Paintbrush,
  Grid3x3,
  Thermometer,
  HardHat,
  Compass,
  Truck,
  User,
  Calculator,
  Briefcase,
  Home,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import type { ProfessionKey } from "./types";

interface ProfessionMeta {
  key: ProfessionKey;
  icon: LucideIcon;
  labelKey: string;
  fallback: string;
}

const PROFESSIONS: ProfessionMeta[] = [
  { key: "carpenter", icon: Hammer, labelKey: "professions.carpenter", fallback: "Snickare" },
  { key: "electrician", icon: Zap, labelKey: "professions.electrician", fallback: "Elektriker" },
  { key: "plumber", icon: Wrench, labelKey: "professions.plumber", fallback: "Rörmokare" },
  { key: "painter", icon: Paintbrush, labelKey: "professions.painter", fallback: "Målare" },
  { key: "tiler", icon: Grid3x3, labelKey: "professions.tiler", fallback: "Plattsättare" },
  { key: "hvac", icon: Thermometer, labelKey: "professions.hvac", fallback: "VVS" },
  { key: "general_contractor", icon: HardHat, labelKey: "professions.general_contractor", fallback: "Projektledare" },
  { key: "architect", icon: Compass, labelKey: "professions.architect", fallback: "Arkitekt" },
  { key: "supplier", icon: Truck, labelKey: "professions.supplier", fallback: "Materialleverantör" },
  { key: "customer", icon: User, labelKey: "professions.customer", fallback: "Kund" },
  { key: "auditor", icon: Calculator, labelKey: "professions.auditor", fallback: "Revisor" },
  { key: "agent", icon: Briefcase, labelKey: "professions.agent", fallback: "Ombud" },
  { key: "broker", icon: Home, labelKey: "professions.broker", fallback: "Mäklare" },
  { key: "other", icon: Plus, labelKey: "professions.other", fallback: "Annat" },
];

interface Props {
  profession: ProfessionKey | null;
  onChange: (profession: ProfessionKey | null) => void;
  onSkip: () => void;
}

export function WizardStep2Profession({ profession, onChange, onSkip }: Props) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t(
          "inviteWizard.step2Description",
          "Bara en etikett — påverkar inte vad personen kan se eller göra.",
        )}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {PROFESSIONS.map((p) => {
          const active = profession === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => onChange(active ? null : p.key)}
              className={cn(
                "flex flex-col items-center justify-center gap-1.5 rounded-lg border p-3 transition-colors",
                "hover:border-foreground/40 hover:bg-accent/50",
                active
                  ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                  : "border-border bg-card",
              )}
            >
              <p.icon
                className={cn(
                  "h-6 w-6",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              />
              <span
                className={cn(
                  "text-xs font-medium leading-tight text-center",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {t(p.labelKey, p.fallback)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex justify-center pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={onSkip}>
          {t("inviteWizard.skipProfession", "Hoppa över →")}
        </Button>
      </div>
    </div>
  );
}

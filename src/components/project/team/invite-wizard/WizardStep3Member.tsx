import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Eye, Wrench, ChevronDown, RotateCcw, Hammer, Receipt, Wallet, FolderOpen } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AccessConsequenceList } from "../AccessConsequenceList";
import type { LucideIcon } from "lucide-react";
import type { FeatureAccess } from "../FeatureAccessEditor";
import type { MemberAccessConfig, PackagePreset } from "./types";
import { diffCount } from "./packageToAccess";
import {
  AREAS,
  type AreaKey,
  type AreaLevel,
  levelToAccess,
  readAreaLevel,
  getAreaAccessField,
} from "./areaLevel";

interface Props {
  memberAccess: MemberAccessConfig;
  onSetPreset: (preset: Exclude<PackagePreset, "custom">) => void;
  onSetOnlyAssigned: (onlyAssigned: boolean) => void;
  onSetAccessField: (updates: Partial<FeatureAccess>) => void;
  onResetToPackage: () => void;
  personName?: string;
}

interface AreaMeta {
  key: AreaKey;
  icon: LucideIcon;
  labelKey: string;
  fallback: string;
  levels: AreaLevel[];
}

const AREA_META: Record<AreaKey, AreaMeta> = {
  tasks: {
    key: "tasks",
    icon: Hammer,
    labelKey: "inviteWizard.memberStep.areaTasks",
    fallback: "Arbeten",
    levels: ["stangd", "insyn", "aktiv"],
  },
  purchases: {
    key: "purchases",
    icon: Receipt,
    labelKey: "inviteWizard.memberStep.areaPurchases",
    fallback: "Inköp & material",
    levels: ["stangd", "insyn", "aktiv"],
  },
  budget: {
    key: "budget",
    icon: Wallet,
    labelKey: "inviteWizard.memberStep.areaBudget",
    fallback: "Ekonomi",
    levels: ["stangd", "insyn", "aktiv"],
  },
  files: {
    key: "files",
    icon: FolderOpen,
    labelKey: "inviteWizard.memberStep.areaFiles",
    fallback: "Filer",
    levels: ["stangd", "insyn", "aktiv"],
  },
};

export function WizardStep3Member({
  memberAccess,
  onSetPreset,
  onSetOnlyAssigned,
  onSetAccessField,
  onResetToPackage,
  personName,
}: Props) {
  const { t } = useTranslation();
  const [adjustOpen, setAdjustOpen] = useState(false);

  const { preset, onlyAssigned, access } = memberAccess;
  const isCustom = preset === "custom";
  const baseline: Exclude<PackagePreset, "custom"> = isCustom ? "insyn" : preset;
  const diff = isCustom ? diffCount(access, baseline, onlyAssigned) : 0;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">
          {t("inviteWizard.memberStep.title", "Vilken nivå av åtkomst?")}
        </h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <PackageCard
          icon={Eye}
          title={t("inviteWizard.memberStep.insynTitle", "Insyn")}
          description={t(
            "inviteWizard.memberStep.insynDescription",
            "Ser arbeten, inköp och filer men kan inte ändra något. Ekonomi dolt som default.",
          )}
          active={preset === "insyn"}
          onClick={() => onSetPreset("insyn")}
        />
        <PackageCard
          icon={Wrench}
          title={t("inviteWizard.memberStep.aktivTitle", "Aktiv")}
          description={t(
            "inviteWizard.memberStep.aktivDescription",
            "Skapar och redigerar arbeten, loggar inköp, laddar upp filer.",
          )}
          active={preset === "aktiv"}
          onClick={() => onSetPreset("aktiv")}
        />
      </div>

      <div className="rounded-md border bg-card/40 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 space-y-0.5">
            <div className="text-sm font-medium">
              {t("inviteWizard.memberStep.onlyAssignedLabel", "Bara sina arbeten")}
            </div>
            <p className="text-xs text-muted-foreground leading-snug">
              {t(
                "inviteWizard.memberStep.onlyAssignedDescription",
                "Personen ser bara det den är tilldelad till. Bra för underleverantörer.",
              )}
            </p>
          </div>
          <Switch checked={onlyAssigned} onCheckedChange={onSetOnlyAssigned} />
        </div>
      </div>

      <div className="rounded-md border">
        <button
          type="button"
          className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-accent/50"
          onClick={() => setAdjustOpen((v) => !v)}
        >
          <span className="flex items-center gap-2">
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform",
                adjustOpen ? "rotate-0" : "-rotate-90",
              )}
            />
            <span className="font-medium">
              {t("inviteWizard.memberStep.adjustHeader", "Justera områden")}
            </span>
            {isCustom && diff > 0 && (
              <span className="text-xs text-muted-foreground">
                {t("inviteWizard.memberStep.diffCount", "({{count}} ändringar)", {
                  count: diff,
                })}
              </span>
            )}
          </span>
          {isCustom && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onResetToPackage();
              }}
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              {t("inviteWizard.memberStep.resetToPackage", "Återställ")}
            </Button>
          )}
        </button>

        {adjustOpen && (
          <div className="divide-y border-t">
            {AREAS.map((area) => {
              const meta = AREA_META[area];
              const currentLevel = readAreaLevel(area, access);
              return (
                <AreaRow
                  key={area}
                  meta={meta}
                  currentLevel={currentLevel}
                  onLevelChange={(level) => {
                    const field = getAreaAccessField(area);
                    onSetAccessField({
                      [field]: levelToAccess(area, level),
                    } as Partial<FeatureAccess>);
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      <AccessConsequenceList access={access} personName={personName} />
    </div>
  );
}

interface PackageCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  active: boolean;
  onClick: () => void;
}

function PackageCard({ icon: Icon, title, description, active, onClick }: PackageCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left rounded-lg border p-3 transition-colors",
        "hover:border-foreground/40 hover:bg-accent/50",
        active
          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
          : "border-border bg-card",
      )}
    >
      <div className="flex items-start gap-2.5">
        <div
          className={cn(
            "rounded-md p-1.5 shrink-0",
            active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 space-y-1">
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-muted-foreground leading-snug">{description}</div>
        </div>
      </div>
    </button>
  );
}

interface AreaRowProps {
  meta: AreaMeta;
  currentLevel: AreaLevel;
  onLevelChange: (level: AreaLevel) => void;
}

function AreaRow({ meta, currentLevel, onLevelChange }: AreaRowProps) {
  const { t } = useTranslation();
  const Icon = meta.icon;

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{t(meta.labelKey, meta.fallback)}</span>
      </div>
      <div className="inline-flex rounded-md border bg-muted/30 p-0.5">
        {meta.levels.map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => onLevelChange(level)}
            className={cn(
              "px-3 py-1 text-xs rounded transition-colors",
              currentLevel === level
                ? "bg-background shadow-sm font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`inviteWizard.memberStep.level.${level}`, levelFallback(level))}
          </button>
        ))}
      </div>
    </div>
  );
}

function levelFallback(level: AreaLevel): string {
  switch (level) {
    case "stangd":
      return "Stängd";
    case "insyn":
      return "Insyn";
    case "aktiv":
      return "Aktiv";
  }
}

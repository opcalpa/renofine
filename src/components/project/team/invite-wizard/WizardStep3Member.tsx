import { useTranslation } from "react-i18next";
import { Eye, Wrench, Check, X as XIcon, RotateCcw } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import {
  FEATURES,
  OPTION_LABEL_KEYS,
  type FeatureAccess,
} from "../FeatureAccessEditor";
import type {
  MemberAccessConfig,
  PackagePreset,
  ProfessionKey,
} from "./types";
import { PROFESSION_KEYS } from "./types";
import { diffCount } from "./packageToAccess";

interface Props {
  memberAccess: MemberAccessConfig;
  profession: ProfessionKey | null;
  onSetProfession: (profession: ProfessionKey | null) => void;
  onSetPreset: (preset: Exclude<PackagePreset, "custom">) => void;
  onSetOnlyAssigned: (onlyAssigned: boolean) => void;
  onSetAccessField: (updates: Partial<FeatureAccess>) => void;
  onResetToPackage: () => void;
}

export function WizardStep3Member({
  memberAccess,
  profession,
  onSetProfession,
  onSetPreset,
  onSetOnlyAssigned,
  onSetAccessField,
  onResetToPackage,
}: Props) {
  const { t } = useTranslation();
  const { preset, onlyAssigned, access } = memberAccess;
  const isCustom = preset === "custom";
  const baseline: Exclude<PackagePreset, "custom"> = isCustom ? "insyn" : preset;
  const diff = isCustom ? diffCount(access, baseline, onlyAssigned) : 0;

  return (
    <div className="space-y-4">
      {/* Profession dropdown */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1">
          <div className="text-sm font-medium">
            {t("inviteWizard.memberStep.professionLabel", "Yrke")}
          </div>
          <p className="text-xs text-muted-foreground">
            {t(
              "inviteWizard.memberStep.professionHelp",
              "Bara en etikett — påverkar inte åtkomsten.",
            )}
          </p>
        </div>
        <Select
          value={profession ?? "none"}
          onValueChange={(v) =>
            onSetProfession(v === "none" ? null : (v as ProfessionKey))
          }
        >
          <SelectTrigger className="w-[180px] h-8 text-sm">
            <SelectValue
              placeholder={t("inviteWizard.memberStep.professionPlaceholder", "Inget valt")}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">
              {t("inviteWizard.memberStep.professionNone", "— Inget valt —")}
            </SelectItem>
            {PROFESSION_KEYS.map((key) => (
              <SelectItem key={key} value={key}>
                {t(`professions.${key}`, key)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Preset cards */}
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

      {/* Bara tilldelat switch */}
      <div className="rounded-md border bg-card/40 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 space-y-0.5">
            <div className="text-sm font-medium">
              {t("inviteWizard.memberStep.onlyAssignedLabel", "Bara tilldelat")}
            </div>
            <p className="text-xs text-muted-foreground leading-snug">
              {t(
                "inviteWizard.memberStep.onlyAssignedDescription",
                "Personen ser bara arbeten och inköp där den står som tilldelad. Bra för underentreprenörer.",
              )}
            </p>
          </div>
          <Switch checked={onlyAssigned} onCheckedChange={onSetOnlyAssigned} />
        </div>
      </div>

      {/* Per-feature access list */}
      <div className="rounded-md border">
        <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("inviteWizard.memberStep.accessListHeader", "Tillgång per sida")}
            {isCustom && diff > 0 && (
              <span className="ml-2 normal-case font-normal tracking-normal">
                ({t("inviteWizard.memberStep.diffCount", "{{count}} ändringar", { count: diff })})
              </span>
            )}
          </div>
          {isCustom && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={onResetToPackage}
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              {t("inviteWizard.memberStep.resetToPackage", "Återställ")}
            </Button>
          )}
        </div>
        <div className="divide-y">
          {FEATURES.map((feature) => (
            <AccessRow
              key={feature.key}
              feature={feature}
              access={access}
              onChange={onSetAccessField}
            />
          ))}
        </div>
      </div>
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

interface AccessRowProps {
  feature: (typeof FEATURES)[number];
  access: FeatureAccess;
  onChange: (updates: Partial<FeatureAccess>) => void;
}

function AccessRow({ feature, access, onChange }: AccessRowProps) {
  const { t } = useTranslation();
  const currentValue = access[feature.key] as string;
  const isGranted = currentValue !== "none";
  const scopeValue = feature.scope ? (access[feature.scope.key] as string) : undefined;
  const showScope =
    feature.scope && feature.scope.showWhen.includes(currentValue);

  return (
    <div className="px-3 py-2 flex items-center gap-3">
      {/* Status icon */}
      <div className="shrink-0 w-5 flex items-center justify-center">
        {isGranted ? (
          <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <XIcon className="h-3.5 w-3.5 text-muted-foreground/60" />
        )}
      </div>

      {/* Label */}
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            "text-sm",
            isGranted ? "text-foreground font-medium" : "text-muted-foreground",
          )}
        >
          {t(feature.labelKey)}
        </div>
        {showScope && scopeValue === "assigned" && (
          <div className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
            {t("inviteWizard.memberStep.assignedOnlyNote", "Bara där personen är tilldelad")}
          </div>
        )}
      </div>

      {/* Level dropdown */}
      <Select
        value={currentValue}
        onValueChange={(value) =>
          onChange({ [feature.key]: value } as Partial<FeatureAccess>)
        }
      >
        <SelectTrigger
          className={cn(
            "h-7 w-[120px] text-xs",
            !isGranted && "text-muted-foreground",
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {feature.options.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {t(OPTION_LABEL_KEYS[opt], opt)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

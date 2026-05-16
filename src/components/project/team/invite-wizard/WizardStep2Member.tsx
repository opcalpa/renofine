import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { PROFESSION_KEYS } from "./types";
import type { EconomyMode, ProfessionKey, ScopeConfig, ScopeRule } from "./types";

interface Props {
  profession: ProfessionKey | null;
  scope: ScopeConfig;
  mode: EconomyMode;
  onSetProfession: (p: ProfessionKey | null) => void;
  onSetScope: (s: ScopeConfig) => void;
  onSetMode: (m: EconomyMode) => void;
}

const PROFESSION_FALLBACK: Record<ProfessionKey, string> = {
  carpenter: "Snickeri",
  electrician: "Elektriker",
  plumber: "VVS",
  painter: "Måleri",
  tiler: "Plattsättning",
  hvac: "Ventilation",
  general_contractor: "Totalentreprenör",
  architect: "Arkitekt",
  supplier: "Materialleverantör",
  customer: "Kund",
  auditor: "Granskare",
  agent: "Ombud",
  broker: "Mäklare",
  other: "Annat",
};

export function WizardStep2Member({
  profession,
  scope,
  mode,
  onSetProfession,
  onSetScope,
  onSetMode,
}: Props) {
  const { t } = useTranslation();

  return (
    <div className="space-y-5">
      <Section
        title={t("inviteWizard.memberStep.professionLabel", "Yrke")}
        hint={t("inviteWizard.memberStep.professionHelp", "Bara en etikett — påverkar inte åtkomsten.")}
      >
        <div className="flex flex-wrap gap-1.5">
          {PROFESSION_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onSetProfession(profession === key ? null : key)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                profession === key
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "border-border text-muted-foreground hover:border-foreground/40",
              )}
            >
              {t(`inviteWizard.profession.${key}`, PROFESSION_FALLBACK[key])}
            </button>
          ))}
        </div>
      </Section>

      <Section title={t("inviteWizard.memberStep.scopeLabel", "Vilka delar av projektet?")}>
        <div className="grid grid-cols-2 gap-2">
          <ChoiceCard
            active={scope.rule === "assigned"}
            title={t("inviteWizard.scope.assigned.title", "Mina uppgifter")}
            description={t("inviteWizard.scope.assigned.description", "Bara där personen är tilldelad.")}
            onClick={() => onSetScope({ rule: "assigned" as ScopeRule })}
          />
          <ChoiceCard
            active={scope.rule === "all"}
            title={t("inviteWizard.scope.all.title", "Alla uppgifter")}
            description={t("inviteWizard.scope.all.description", "Hela projektets arbeten och inköp.")}
            onClick={() => onSetScope({ rule: "all" as ScopeRule })}
          />
        </div>
      </Section>

      <Section title={t("inviteWizard.memberStep.modeLabel", "Ekonomi-åtkomst")}>
        <div className="grid grid-cols-2 gap-2">
          <ChoiceCard
            active={mode === "none"}
            title={t("inviteWizard.mode.none.title", "Inga belopp")}
            description={t("inviteWizard.mode.none.description", "Inga priser eller budgetar visas.")}
            onClick={() => onSetMode("none")}
          />
          <ChoiceCard
            active={mode === "own"}
            title={t("inviteWizard.mode.own.title", "Egna belopp")}
            description={t("inviteWizard.mode.own.description", "Bara egna materials och timrapporter.")}
            onClick={() => onSetMode("own")}
          />
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function ChoiceCard({
  active,
  title,
  description,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left rounded-lg border p-3 transition-colors",
        active
          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
          : "border-border bg-card hover:border-foreground/40",
      )}
    >
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-muted-foreground leading-snug mt-0.5">
        {description}
      </div>
    </button>
  );
}

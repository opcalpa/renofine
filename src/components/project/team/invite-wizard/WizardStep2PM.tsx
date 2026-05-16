import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import type { EconomyMode, PmSubType } from "./types";

interface Props {
  pmSubType: PmSubType | null;
  mode: EconomyMode;
  expiresAt: string | null;
  onSetPmSubType: (s: PmSubType) => void;
  onSetMode: (m: EconomyMode) => void;
  onSetExpiresAt: (iso: string | null) => void;
}

function daysFromNowIso(days: number): string {
  return new Date(Date.now() + days * 86400_000).toISOString();
}

export function WizardStep2PM({
  pmSubType,
  mode,
  expiresAt,
  onSetPmSubType,
  onSetMode,
  onSetExpiresAt,
}: Props) {
  const { t } = useTranslation();

  // Which time-bound preset is active (custom = a date that isn't the 90d preset).
  const isCustom = expiresAt !== null;

  return (
    <div className="space-y-5">
      <Section title={t("inviteWizard.pmStep.relationLabel", "Relation")}>
        <div className="grid grid-cols-2 gap-2">
          <ChoiceCard
            active={pmSubType === "co_owner"}
            title={t("inviteWizard.pm.coOwner.title", "Min partner / co-owner")}
            description={t("inviteWizard.pm.coOwner.description", "Delägare med fulla rättigheter.")}
            onClick={() => onSetPmSubType("co_owner")}
          />
          <ChoiceCard
            active={pmSubType === "pm_hired"}
            title={t("inviteWizard.pm.hired.title", "Min anlitade projektledare")}
            description={t("inviteWizard.pm.hired.description", "Anlitad PM, admin-rättigheter.")}
            onClick={() => onSetPmSubType("pm_hired")}
          />
        </div>
      </Section>

      <Section title={t("inviteWizard.pmStep.modeLabel", "Ekonomi-åtkomst")}>
        <div className="grid grid-cols-3 gap-2">
          <ChoiceCard
            active={mode === "none"}
            title={t("inviteWizard.mode.none.title", "Inga belopp")}
            description={t("inviteWizard.mode.none.descShort", "Inga priser.")}
            onClick={() => onSetMode("none")}
          />
          <ChoiceCard
            active={mode === "own"}
            title={t("inviteWizard.mode.own.title", "Egna belopp")}
            description={t("inviteWizard.mode.own.descShort", "Bara egna.")}
            onClick={() => onSetMode("own")}
          />
          <ChoiceCard
            active={mode === "full"}
            title={t("inviteWizard.mode.full.title", "Full ekonomi")}
            description={t("inviteWizard.mode.full.descShort", "Allt, inkl. marginal.")}
            onClick={() => onSetMode("full")}
          />
        </div>
      </Section>

      <Section
        title={t("inviteWizard.pmStep.timeLabel", "Tidsbegränsning")}
        hint={t("inviteWizard.pmStep.timeHelp", "Åtkomsten upphör automatiskt vid valt datum.")}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill
            active={expiresAt === null}
            label={t("inviteWizard.time.permanent", "Permanent")}
            onClick={() => onSetExpiresAt(null)}
          />
          <Pill
            active={isCustom}
            label={t("inviteWizard.time.days90", "90 dagar")}
            onClick={() => onSetExpiresAt(daysFromNowIso(90))}
          />
          {isCustom && (
            <Input
              type="date"
              className="h-8 w-auto text-xs"
              value={expiresAt ? expiresAt.slice(0, 10) : ""}
              onChange={(e) =>
                onSetExpiresAt(
                  e.target.value
                    ? new Date(e.target.value + "T23:59:59").toISOString()
                    : null,
                )
              }
            />
          )}
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

function Pill({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary font-medium"
          : "border-border text-muted-foreground hover:border-foreground/40",
      )}
    >
      {label}
    </button>
  );
}

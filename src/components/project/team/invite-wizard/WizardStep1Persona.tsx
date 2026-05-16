import { useTranslation } from "react-i18next";
import { Send, Users, HardHat, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InvitePersona } from "./types";

interface Props {
  persona: InvitePersona;
  onChange: (persona: InvitePersona) => void;
}

const PERSONAS: Array<{
  key: InvitePersona;
  icon: React.ComponentType<{ className?: string }>;
  titleKey: string;
  titleFallback: string;
  descKey: string;
  descFallback: string;
  surfaceKey: string;
  surfaceFallback: string;
}> = [
  {
    key: "worker",
    icon: Send,
    titleKey: "inviteWizard.persona.worker.title",
    titleFallback: "Hantverkare med jobb",
    descKey: "inviteWizard.persona.worker.description",
    descFallback: "Får ett dagsjobb via SMS-länk. Behöver inget konto.",
    surfaceKey: "inviteWizard.persona.worker.surface",
    surfaceFallback: "Arbetarvy",
  },
  {
    key: "client",
    icon: Users,
    titleKey: "inviteWizard.persona.client.title",
    titleFallback: "Kund / beställare",
    descKey: "inviteWizard.persona.client.description",
    descFallback: "Din slutkund. Får en kundvy av projektet.",
    surfaceKey: "inviteWizard.persona.client.surface",
    surfaceFallback: "Kundvy",
  },
  {
    key: "member",
    icon: HardHat,
    titleKey: "inviteWizard.persona.member.title",
    titleFallback: "UE / specialist",
    descKey: "inviteWizard.persona.member.description",
    descFallback: "Återkommande hantverkare eller specialist. Eget konto.",
    surfaceKey: "inviteWizard.persona.member.surface",
    surfaceFallback: "Full app",
  },
  {
    key: "pm",
    icon: Crown,
    titleKey: "inviteWizard.persona.pm.title",
    titleFallback: "Projektledare / partner",
    descKey: "inviteWizard.persona.pm.description",
    descFallback: "Partner eller anlitad PM med utökade rättigheter.",
    surfaceKey: "inviteWizard.persona.pm.surface",
    surfaceFallback: "Full app · admin",
  },
];

export function WizardStep1Persona({ persona, onChange }: Props) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t("inviteWizard.step1Description", "Vem är personen du vill bjuda in?")}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {PERSONAS.map((p) => (
          <PersonaCard
            key={p.key}
            icon={p.icon}
            title={t(p.titleKey, p.titleFallback)}
            description={t(p.descKey, p.descFallback)}
            surface={t(p.surfaceKey, p.surfaceFallback)}
            active={persona === p.key}
            onClick={() => onChange(p.key)}
          />
        ))}
      </div>
    </div>
  );
}

interface PersonaCardProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  surface: string;
  active: boolean;
  onClick: () => void;
}

function PersonaCard({
  icon: Icon,
  title,
  description,
  surface,
  active,
  onClick,
}: PersonaCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left rounded-lg border p-4 transition-colors",
        "hover:border-foreground/40 hover:bg-accent/50",
        active
          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
          : "border-border bg-card",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "rounded-md p-2 shrink-0",
            active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 space-y-1">
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-muted-foreground leading-snug">
            {description}
          </div>
          <div className="text-[10px] font-mono uppercase tracking-wide text-primary/70 pt-0.5">
            {surface}
          </div>
        </div>
      </div>
    </button>
  );
}

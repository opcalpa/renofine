import { useTranslation } from "react-i18next";
import { Send, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InvitePath } from "./types";

interface Props {
  path: InvitePath;
  onChange: (path: InvitePath) => void;
}

export function WizardStep1Path({ path, onChange }: Props) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t(
          "inviteWizard.step1Description",
          "Välj hur personen ska delta i projektet.",
        )}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <PathCard
          icon={Send}
          title={t("inviteWizard.pathWorkerTitle", "Skicka instruktioner")}
          description={t(
            "inviteWizard.pathWorkerDescription",
            "Ett färdigt jobb via SMS eller länk. Personen behöver inget konto.",
          )}
          active={path === "worker"}
          onClick={() => onChange("worker")}
        />
        <PathCard
          icon={Users}
          title={t("inviteWizard.pathMemberTitle", "Bjud in till projektet")}
          description={t(
            "inviteWizard.pathMemberDescription",
            "Personen får eget konto och kan följa projektet löpande.",
          )}
          active={path === "member"}
          onClick={() => onChange("member")}
        />
      </div>
    </div>
  );
}

interface PathCardProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  active: boolean;
  onClick: () => void;
}

function PathCard({ icon: Icon, title, description, active, onClick }: PathCardProps) {
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
          <div className="text-xs text-muted-foreground leading-snug">{description}</div>
        </div>
      </div>
    </button>
  );
}

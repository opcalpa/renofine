import { Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { FeatureAccess } from "./FeatureAccessEditor";

interface Props {
  access: FeatureAccess;
  /** Optional name to personalize the header ("Lars kommer se:" vs "Personen kommer se:") */
  personName?: string;
  className?: string;
}

type Line = { label: string; granted: boolean };

/**
 * Translates the abstract feature-access matrix into human-readable consequences.
 * One bullet per feature; level/scope is folded into the suffix.
 */
function buildLines(
  access: FeatureAccess,
  t: (key: string, fallback?: string) => string,
): Line[] {
  const lines: Line[] = [];

  const labelFor = (
    featureKey: string,
    level: string,
    scope?: string,
    scopeShownOn: string[] = [],
  ): string => {
    const name = t(`roles.feature${featureKey}`);
    if (level === "none") return name;

    const suffixParts: string[] = [];
    if (level === "edit") suffixParts.push(t("roles.consequence.canEdit", "kan ändra"));
    else if (level === "create") suffixParts.push(t("roles.consequence.canCreate", "kan skapa"));
    else if (level === "upload") suffixParts.push(t("roles.consequence.canUpload", "kan ladda upp"));
    else if (level === "invite") suffixParts.push(t("roles.consequence.canInvite", "kan bjuda in"));
    if (scope === "assigned" && scopeShownOn.includes(level)) {
      suffixParts.push(t("roles.consequence.assignedOnly", "endast tilldelade"));
    }

    if (suffixParts.length === 0) return name;
    return `${name} — ${suffixParts.join(", ")}`;
  };

  // Order chosen so granted things tend to read first; ungranted falls to right column anyway.
  lines.push({
    label: labelFor("CustomerView", access.customerView),
    granted: access.customerView !== "none",
  });
  lines.push({
    label: labelFor("Overview", access.overview),
    granted: access.overview !== "none",
  });
  lines.push({
    label: labelFor("Timeline", access.timeline),
    granted: access.timeline !== "none",
  });
  lines.push({
    label: labelFor("Tasks", access.tasks, access.tasksScope, ["view", "edit"]),
    granted: access.tasks !== "none",
  });
  lines.push({
    label: labelFor("SpacePlanner", access.spacePlanner),
    granted: access.spacePlanner !== "none",
  });
  lines.push({
    label: labelFor("PurchaseOrders", access.purchases, access.purchasesScope, [
      "view",
      "create",
      "edit",
    ]),
    granted: access.purchases !== "none",
  });
  lines.push({
    label: labelFor("Budget", access.budget),
    granted: access.budget !== "none",
  });
  lines.push({
    label: labelFor("Files", access.files),
    granted: access.files !== "none",
  });
  lines.push({
    label: labelFor("TeamManagement", access.teams),
    granted: access.teams !== "none",
  });

  return lines;
}

export const AccessConsequenceList: React.FC<Props> = ({ access, personName, className }) => {
  const { t } = useTranslation();
  const lines = buildLines(access, t);
  const granted = lines.filter((l) => l.granted);
  const denied = lines.filter((l) => !l.granted);

  const subject = personName?.trim() || t("roles.consequence.subjectFallback", "Personen");
  const header = t("roles.consequence.header", "{{subject}} kommer kunna:", { subject });

  return (
    <div className={cn("rounded-lg border bg-card/40 p-3 space-y-2.5", className)}>
      <div className="text-sm font-medium">{header}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
        <ul className="space-y-1">
          {granted.length === 0 && (
            <li className="text-xs text-muted-foreground italic">
              {t("roles.consequence.noneGranted", "Inget — personen ser ingen del av projektet")}
            </li>
          )}
          {granted.map((l) => (
            <li key={l.label} className="flex items-start gap-1.5 text-xs">
              <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
              <span className="text-foreground">{l.label}</span>
            </li>
          ))}
        </ul>
        <ul className="space-y-1">
          {denied.length === 0 && (
            <li className="text-xs text-muted-foreground italic">
              {t("roles.consequence.noneDenied", "—")}
            </li>
          )}
          {denied.map((l) => (
            <li key={l.label} className="flex items-start gap-1.5 text-xs">
              <X className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <span className="text-muted-foreground line-through decoration-muted-foreground/40">
                {l.label}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

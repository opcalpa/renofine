import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface TeamSharingSwitcherProps {
  active: "team" | "sharing";
  onChange: (value: "team" | "sharing") => void;
}

/**
 * Always-visible segmented control shown at the top of the Team and Delning
 * views so the two related pages are discoverable without hovering the
 * top-nav dropdown. Not rendered for client viewers (they only see Kundvy).
 */
export function TeamSharingSwitcher({ active, onChange }: TeamSharingSwitcherProps) {
  const { t } = useTranslation();
  const options: { value: "team" | "sharing"; label: string }[] = [
    { value: "team", label: t("projectDetail.team") },
    { value: "sharing", label: t("sharing.tabTitle", "Sharing") },
  ];

  return (
    <div className="mb-4 inline-flex rounded-md border bg-muted/50 p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={active === opt.value}
          className={cn(
            "px-3 py-1 rounded text-sm transition-colors",
            active === opt.value
              ? "bg-background text-foreground font-medium shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

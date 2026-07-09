import { useTranslation } from "react-i18next";
import { Settings2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";

export interface FieldVisibilityItem {
  key: string;
  label: string;
  /** Fields with content always render — the toggle only affects unused ones. */
  hasContent: boolean;
}

interface FieldVisibilityMenuProps {
  items: FieldVisibilityItem[];
  prefs: Record<string, boolean>;
  onChange: (key: string, visible: boolean) => void;
}

/**
 * Per-user show/hide of the task dialog's optional fields (Carl 9 Jul:
 * "så användaren själv kan välja att gömma sådant den ej använder").
 * Preferences are device-local; content is never hidden silently.
 */
export function FieldVisibilityMenu({ items, prefs, onChange }: FieldVisibilityMenuProps) {
  const { t } = useTranslation();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={t("tasks.fieldSettings", "Visa/dölj fält")}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-accent"
          style={{ color: "var(--rf-fg-muted)" }}
        >
          <Settings2 className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="end">
        <p className="px-1 pb-2 text-xs font-medium text-muted-foreground">
          {t("tasks.fieldSettingsTitle", "Visa fält")}
        </p>
        <div className="space-y-0.5">
          {items.map((item) => {
            const visible = prefs[item.key] ?? true;
            return (
              <label
                key={item.key}
                className="flex items-center justify-between gap-3 rounded px-1.5 py-1.5 text-sm hover:bg-muted cursor-pointer"
              >
                <span className="min-w-0 truncate">{item.label}</span>
                {item.hasContent ? (
                  <span className="shrink-0 text-[10px] text-muted-foreground" title={t("tasks.fieldHasContent", "Har innehåll — visas alltid")}>
                    {t("tasks.fieldInUse", "används")}
                  </span>
                ) : (
                  <Switch
                    checked={visible}
                    onCheckedChange={(checked) => onChange(item.key, checked)}
                    className="shrink-0"
                  />
                )}
              </label>
            );
          })}
        </div>
        <p className="px-1 pt-2 text-[11px] leading-snug text-muted-foreground">
          {t("tasks.fieldSettingsHint", "Fält med innehåll visas alltid. Gäller bara dig, på den här enheten.")}
        </p>
      </PopoverContent>
    </Popover>
  );
}

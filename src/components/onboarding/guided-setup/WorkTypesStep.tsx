import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Check, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getWorkTypes } from "@/services/intakeService";
import type { StepProps, WizardWorkType } from "./types";

export function WorkTypesStep({ formData, updateFormData }: StepProps) {
  const { t } = useTranslation();
  const [customInput, setCustomInput] = useState("");

  const predefinedTypes = getWorkTypes();
  const selectedIds = new Set(formData.workTypes.map((wt) => wt.id));

  const handleTogglePredefined = (wt: { value: string; label: string }) => {
    if (selectedIds.has(wt.value)) {
      updateFormData({
        workTypes: formData.workTypes.filter((w) => w.id !== wt.value),
      });
    } else {
      const newWorkType: WizardWorkType = {
        id: wt.value,
        type: "predefined",
        value: wt.value as WizardWorkType["value"],
        label: t(`intake.workType.${wt.value}`),
      };
      updateFormData({ workTypes: [...formData.workTypes, newWorkType] });
    }
  };

  const handleAddCustom = () => {
    const label = customInput.trim();
    if (!label) return;

    // Check for dedup against predefined types
    const matchingPredefined = predefinedTypes.find(
      (pt) => t(`intake.workType.${pt.value}`).toLowerCase() === label.toLowerCase()
    );
    if (matchingPredefined) {
      toast.info(t("guidedSetup.duplicateHint"));
      if (!selectedIds.has(matchingPredefined.value)) {
        handleTogglePredefined(matchingPredefined);
      }
      setCustomInput("");
      return;
    }

    // Check for duplicate custom labels
    const exists = formData.workTypes.some(
      (wt) => wt.type === "custom" && wt.label.toLowerCase() === label.toLowerCase()
    );
    if (exists) {
      setCustomInput("");
      return;
    }

    const newWorkType: WizardWorkType = {
      id: crypto.randomUUID(),
      type: "custom",
      value: null,
      label,
    };
    updateFormData({ workTypes: [...formData.workTypes, newWorkType] });
    setCustomInput("");
  };

  const handleRemoveCustom = (id: string) => {
    updateFormData({
      workTypes: formData.workTypes.filter((wt) => wt.id !== id),
    });
  };

  const customWorkTypes = formData.workTypes.filter((wt) => wt.type === "custom");

  return (
    <div className="space-y-6">
      <div className="text-center mb-4">
        <h2 className="text-xl font-semibold">
          {t("guidedSetup.selectWorkTypes")}
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          {t("guidedSetup.selectWorkTypesDesc")}
        </p>
      </div>

      {/* Predefined work types */}
      <div className="space-y-3">
        <Label>{t("guidedSetup.predefinedTypes")}</Label>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {predefinedTypes.map((wt) => {
            const isSelected = selectedIds.has(wt.value);
            return (
              <button
                key={wt.value}
                type="button"
                onClick={() => handleTogglePredefined(wt)}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 p-2 sm:p-3 rounded-lg border-2 transition-all",
                  "hover:border-primary/50 hover:bg-accent/50",
                  isSelected ? "border-primary bg-primary/5" : "border-muted"
                )}
              >
                <span className="text-xl sm:text-2xl">{wt.icon}</span>
                <span className="text-xs font-medium text-center leading-tight">
                  {t(`intake.workType.${wt.value}`)}
                </span>
                {isSelected && <Check className="h-3 w-3 text-primary" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom work type input */}
      <div className="space-y-3">
        <Label>{t("guidedSetup.customTypes")}</Label>
        <div className="flex gap-2">
          <Input
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            placeholder={t("guidedSetup.customWorkTypePlaceholder")}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddCustom();
              }
            }}
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleAddCustom}
            disabled={!customInput.trim()}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {customWorkTypes.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {customWorkTypes.map((wt) => (
              <Badge
                key={wt.id}
                variant="secondary"
                className="gap-1 pr-1 text-sm"
              >
                {wt.label}
                <button
                  type="button"
                  onClick={() => handleRemoveCustom(wt.id)}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-muted"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {formData.workTypes.length === 0 && (
        <p className="text-center text-muted-foreground text-sm py-2">
          {t("guidedSetup.noWorkTypesSelected")}
        </p>
      )}
    </div>
  );
}

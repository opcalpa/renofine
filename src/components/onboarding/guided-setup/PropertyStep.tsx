import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Check, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { SimilarAddressHint } from "@/components/property/SimilarAddressHint";
import type { StepProps } from "./types";

export function PropertyStep({ formData, updateFormData }: StepProps) {
  const { t } = useTranslation();
  const [showAddress, setShowAddress] = useState(
    !!(formData.address || formData.postalCode || formData.city)
  );
  const [usingSuggestion, setUsingSuggestion] = useState(false);

  // Auto-generate project name suggestion
  const suggestion = useMemo(() => {
    const roomNames = formData.rooms.map((r) => r.name);
    const roomPart =
      roomNames.length <= 2
        ? roomNames.join(" & ")
        : `${roomNames.slice(0, 2).join(", ")} +${roomNames.length - 2}`;

    const address = formData.address.trim();
    if (address && roomPart) {
      return `${address} — ${roomPart}`;
    }
    if (address) {
      return `${address} — ${t("guidedSetup.renovation")}`;
    }
    if (roomPart) {
      return `${roomPart} ${t("guidedSetup.renovation").toLowerCase()}`;
    }
    return "";
  }, [formData.rooms, formData.address, t]);

  // Auto-apply suggestion if user hasn't manually typed
  useEffect(() => {
    if (usingSuggestion && suggestion) {
      updateFormData({ projectName: suggestion });
    }
  }, [suggestion, usingSuggestion, updateFormData]);

  const handleAcceptSuggestion = () => {
    updateFormData({ projectName: suggestion });
    setUsingSuggestion(true);
  };

  const handleNameChange = (value: string) => {
    setUsingSuggestion(false);
    updateFormData({ projectName: value });
  };

  return (
    <div className="space-y-5">
      <div className="text-center mb-4">
        <h2 className="text-xl font-semibold">
          {t("guidedSetup.nameStepTitle")}
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          {t("guidedSetup.nameStepDesc")}
        </p>
      </div>

      {/* Address section — encouraged but optional */}
      <div className="space-y-3">
        {!showAddress ? (
          <Button
            variant="outline"
            className="w-full justify-start text-muted-foreground"
            onClick={() => setShowAddress(true)}
          >
            <ChevronDown className="h-4 w-4 mr-2" />
            {t("guidedSetup.addAddress")}
          </Button>
        ) : (
          <div className="space-y-3 rounded-lg border p-4 bg-muted/30">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">
                {t("guidedSetup.addressOptional")}
              </Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setShowAddress(false)}
              >
                <ChevronUp className="h-3 w-3 mr-1" />
                {t("common.hide")}
              </Button>
            </div>
            <Input
              id="address"
              value={formData.address}
              onChange={(e) => updateFormData({ address: e.target.value })}
              placeholder={t("projects.addressPlaceholder")}
              autoFocus
            />
            {/* Taking the suggestion rewrites the address to the existing
                one's exact spelling, which is all it takes: the creation flow
                groups on that key, so the project lands on the same home. */}
            <SimilarAddressHint
              address={formData.address}
              postalCode={formData.postalCode}
              city={formData.city}
              onPick={(property) =>
                updateFormData({
                  address: property.address ?? "",
                  postalCode: property.postal_code ?? "",
                  city: property.city ?? "",
                })
              }
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                id="postalCode"
                value={formData.postalCode}
                onChange={(e) => updateFormData({ postalCode: e.target.value })}
                placeholder={t("projects.postalCode")}
              />
              <Input
                id="city"
                value={formData.city}
                onChange={(e) => updateFormData({ city: e.target.value })}
                placeholder={t("projects.cityPlaceholder")}
              />
            </div>
          </div>
        )}
      </div>

      {/* Project name with auto-suggestion */}
      <div className="space-y-2">
        <Label htmlFor="projectName">
          {t("guidedSetup.projectName")} <span className="text-destructive">*</span>
        </Label>
        <Input
          id="projectName"
          value={formData.projectName}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder={t("guidedSetup.projectNamePlaceholder")}
        />

        {/* Suggestion chip */}
        {suggestion && !usingSuggestion && formData.projectName !== suggestion && (
          <button
            type="button"
            onClick={handleAcceptSuggestion}
            className={cn(
              "flex items-center gap-2 w-full text-left text-sm px-3 py-2 rounded-lg",
              "border border-dashed border-primary/40 bg-primary/5",
              "hover:bg-primary/10 hover:border-primary/60 transition-colors"
            )}
          >
            <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />
            <span className="flex-1 truncate text-primary/80">{suggestion}</span>
            <span className="text-xs text-primary/60 flex-shrink-0">
              {t("guidedSetup.useSuggestion")}
            </span>
          </button>
        )}

        {usingSuggestion && (
          <div className="flex items-center gap-1.5 text-xs text-green-600">
            <Check className="h-3 w-3" />
            {t("guidedSetup.suggestionApplied")}
          </div>
        )}
      </div>
    </div>
  );
}

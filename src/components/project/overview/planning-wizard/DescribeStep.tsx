import { useTranslation } from "react-i18next";
import { DictationTextarea } from "@/components/shared/DictationTextarea";
import type { PlanningStepProps } from "./types";

interface DescribeStepProps extends PlanningStepProps {
  analyzing: boolean;
}

export function DescribeStep({ formData, updateFormData, analyzing }: DescribeStepProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">
          {t("planningWizard.step1Title", "Describe your renovation")}
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          {t("planningWizard.step1Desc", "Tell us in your own words what you want to do. Think big picture — details come later.")}
        </p>
      </div>

      <DictationTextarea
        value={formData.description}
        onChange={(description) => updateFormData({ description })}
        placeholder={t(
          "planningWizard.step1Placeholder",
          "e.g. We're renovating the bathroom and kitchen. New tiles in the bathroom, new cabinet fronts in the kitchen and repainting the whole apartment..."
        )}
        disabled={analyzing}
      />
    </div>
  );
}

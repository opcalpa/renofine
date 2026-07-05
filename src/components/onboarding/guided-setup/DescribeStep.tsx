import { useTranslation } from "react-i18next";
import { DictationTextarea } from "@/components/shared/DictationTextarea";

interface DescribeStepProps {
  description: string;
  onChange: (value: string) => void;
  analyzing: boolean;
  onStartBlank: () => void;
}

/**
 * Step 1 of the guided setup: describe the renovation by voice or text.
 * The AI analysis prefills rooms, work types and the task matrix; the user
 * reviews everything in the following steps. A tertiary escape hatch creates
 * an empty project instead (Renaida can scaffold it by voice afterwards).
 */
export function DescribeStep({ description, onChange, analyzing, onStartBlank }: DescribeStepProps) {
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
        value={description}
        onChange={onChange}
        placeholder={t(
          "planningWizard.step1Placeholder",
          "e.g. We're renovating the bathroom and kitchen. New tiles in the bathroom, new cabinet fronts in the kitchen and repainting the whole apartment..."
        )}
        disabled={analyzing}
      />

      <div className="pt-1">
        <button
          type="button"
          onClick={onStartBlank}
          disabled={analyzing}
          className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
        >
          {t("guidedSetup.startBlank", "Start with an empty project instead")}
        </button>
        <p className="text-xs text-muted-foreground mt-1">
          {t(
            "guidedSetup.startBlankHint",
            "Skip planning for now — you can describe the renovation by voice inside the project and Renaida sets it up."
          )}
        </p>
      </div>
    </div>
  );
}

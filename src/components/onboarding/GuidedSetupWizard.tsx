import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Loader2, CheckCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createProjectFromGuidedSetup, workTypeToCostCenter } from "@/services/intakeService";
import type { WorkType } from "@/services/intakeService";
import { createGuestProjectFromGuidedSetup } from "@/services/guestStorageService";
import {
  INITIAL_FORM_DATA,
  WHOLE_PROPERTY_KEY,
  type GuidedFormData,
} from "./guided-setup/types";
import type { AIParsedResult } from "@/components/project/overview/planning-wizard/types";
import { aiResultToGuidedData } from "./guided-setup/aiPrefill";
import { DescribeStep } from "./guided-setup/DescribeStep";
import { PropertyStep } from "./guided-setup/PropertyStep";
import { RoomsStep } from "./guided-setup/RoomsStep";
import { WorkTypesStep } from "./guided-setup/WorkTypesStep";
import { TaskMatrixStep } from "./guided-setup/TaskMatrixStep";
import { SummaryStep } from "./guided-setup/SummaryStep";

interface GuidedSetupWizardProps {
  onComplete: (projectId: string) => void;
  onCancel: () => void;
  userType: "homeowner" | "contractor";
  /** Required for authenticated users; omitted for guests (local-only project). */
  profileId?: string;
  /** When true, the project is created in guest localStorage instead of Supabase. */
  isGuest?: boolean;
}

type StepKey = "describe" | "rooms" | "workTypes" | "matrix" | "property" | "summary";

// Describe-first: AI prefills rooms/work/matrix, the user reviews each step.
const FULL_STEPS: StepKey[] = ["describe", "rooms", "workTypes", "matrix", "property", "summary"];
// Blank mode: name the project and go — Renaida scaffolds it by voice inside.
const BLANK_STEPS: StepKey[] = ["describe", "property"];

const STEP_LABEL_KEYS: Record<StepKey, string> = {
  describe: "describeStep",
  rooms: "roomsStep",
  workTypes: "workTypesStep",
  matrix: "matrixStep",
  property: "propertyStep",
  summary: "summaryStep",
};

function matrixToTasks(formData: GuidedFormData) {
  const tasks: Array<{
    workTypeLabel: string;
    costCenter: string;
    roomName: string | null;
  }> = [];

  for (const wt of formData.workTypes) {
    const roomIds = formData.matrix[wt.id];
    if (!roomIds?.size) continue;

    const label = wt.label;
    const costCenter = wt.value ? workTypeToCostCenter(wt.value) : "other";

    if (roomIds.has(WHOLE_PROPERTY_KEY)) {
      tasks.push({ workTypeLabel: label, costCenter, roomName: null });
    } else {
      for (const roomId of roomIds) {
        const room = formData.rooms.find((r) => r.id === roomId);
        if (room) {
          tasks.push({ workTypeLabel: label, costCenter, roomName: room.name });
        }
      }
    }
  }

  return tasks;
}

export function GuidedSetupWizard({
  onComplete,
  onCancel,
  profileId,
  isGuest = false,
}: GuidedSetupWizardProps) {
  const { t, i18n } = useTranslation();
  const [stepIndex, setStepIndex] = useState(0);
  const [blankMode, setBlankMode] = useState(false);
  const [formData, setFormData] = useState<GuidedFormData>(INITIAL_FORM_DATA);
  const [description, setDescription] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const steps = blankMode ? BLANK_STEPS : FULL_STEPS;
  const currentKey = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;

  const updateFormData = useCallback((updates: Partial<GuidedFormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  }, []);

  const canProceed = useCallback((): boolean => {
    switch (currentKey) {
      case "describe":
        return true; // buttons on this step gate themselves
      case "rooms":
        return formData.rooms.length > 0;
      case "workTypes":
        return formData.workTypes.length > 0;
      case "matrix":
        return Object.values(formData.matrix).some((set) => set.size > 0);
      case "property":
        return !!formData.projectName.trim();
      case "summary":
        return true;
      default:
        return false;
    }
  }, [currentKey, formData]);

  const canAnalyze = description.trim().length > 10;

  /** Returns false only when rate-limited (stay on the step); AI failure falls back to manual. */
  const handleAnalyze = useCallback(async (): Promise<boolean> => {
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("parse-renovation-description", {
        body: { description: description.trim(), language: i18n.language?.slice(0, 2) || "sv" },
      });
      // Edge function returns 429 with { error, message } when rate-limited.
      // supabase-js bubbles non-2xx as `error` but still exposes `data` on body.
      const rateLimited =
        (typeof data === "object" && data !== null && (data as { error?: string }).error === "Rate limit exceeded") ||
        (error && /429|rate limit/i.test(error.message || ""));
      if (rateLimited) {
        toast.error(
          t("planningWizard.rateLimited", "För många försök på kort tid. Vänta en stund eller fyll i manuellt.")
        );
        return false;
      }
      if (error) throw error;

      const parsed = data as AIParsedResult;
      updateFormData(aiResultToGuidedData(parsed, (wt: WorkType) => t(`intake.workType.${wt}`, wt)));
      setAnalyzed(true);
    } catch {
      toast.error(t("planningWizard.analyzeFailed", "Could not analyze. You can continue manually."));
    } finally {
      setAnalyzing(false);
    }
    return true;
  }, [description, updateFormData, t, i18n.language]);

  const handleDescribeNext = async () => {
    // Drive every first pass through AI; re-entering with a result skips re-analysis.
    if (!analyzed) {
      const proceed = await handleAnalyze();
      if (!proceed) return;
    }
    setStepIndex(1);
  };

  const handleFillManually = () => {
    setStepIndex(1);
  };

  const handleStartBlank = () => {
    setBlankMode(true);
    setStepIndex(1); // property step in the blank sequence
  };

  const handleNext = () => {
    if (!isLastStep && canProceed()) {
      setStepIndex((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (stepIndex === 0) return;
    if (blankMode && stepIndex === 1) {
      // Leaving blank mode returns to the describe step of the full flow.
      setBlankMode(false);
    }
    setStepIndex((prev) => prev - 1);
  };

  const handleSubmit = async () => {
    if (submitting) return;

    setSubmitting(true);
    try {
      const tasks = blankMode ? [] : matrixToTasks(formData);
      const rooms = blankMode
        ? []
        : formData.rooms.map((r) => ({
            name: r.name,
            area_sqm: r.area_sqm,
            width_mm: r.width_m ? Math.round(r.width_m * 1000) : undefined,
            height_mm: r.depth_m ? Math.round(r.depth_m * 1000) : undefined,
            ceiling_height_mm: r.ceiling_height_mm,
          }));

      const input = {
        projectName: formData.projectName.trim(),
        address: formData.address.trim() || undefined,
        postalCode: formData.postalCode.trim() || undefined,
        city: formData.city.trim() || undefined,
        rooms,
        tasks,
      };

      const result = isGuest
        ? createGuestProjectFromGuidedSetup(input)
        : await createProjectFromGuidedSetup(input, profileId!);

      if (!result) {
        toast.error(t("guest.projectLimit", "Guest mode is limited to 3 projects."));
        return;
      }

      setSubmitted(true);
      toast.success(t("guidedSetup.projectCreated"));
      onComplete(result.projectId);
    } catch (error) {
      console.error("Failed to create project from guided setup:", error);
      toast.error(t("common.error"));
    } finally {
      setSubmitting(false);
    }
  };

  const progressPercent = ((stepIndex + 1) / steps.length) * 100;

  if (submitted) {
    return (
      <div className="text-center py-8">
        <div className="flex justify-center mb-6">
          <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
        </div>
        <h2 className="text-2xl font-semibold mb-2">
          {t("guidedSetup.projectCreated")}
        </h2>
        <p className="text-muted-foreground">
          {t("guidedSetup.projectCreatedDesc")}
        </p>
      </div>
    );
  }

  const submitButton = (
    <Button onClick={handleSubmit} disabled={submitting || !canProceed()} className="gap-2">
      {submitting ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("guidedSetup.creatingProject")}
        </>
      ) : (
        <>
          <Sparkles className="h-4 w-4" />
          {blankMode ? t("guidedSetup.createBlankProject", "Create empty project") : t("guidedSetup.createProject")}
        </>
      )}
    </Button>
  );

  return (
    <div className="space-y-6">
      {/* Progress header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {t("guidedSetup.stepOf", {
              current: stepIndex + 1,
              total: steps.length,
            })}
          </span>
          <span>{t(`guidedSetup.${STEP_LABEL_KEYS[currentKey]}`)}</span>
        </div>
        <Progress value={progressPercent} className="h-2" />
      </div>

      {/* Step content */}
      {currentKey === "describe" && (
        <DescribeStep
          description={description}
          onChange={setDescription}
          analyzing={analyzing}
          onStartBlank={handleStartBlank}
        />
      )}
      {currentKey === "rooms" && (
        <RoomsStep formData={formData} updateFormData={updateFormData} />
      )}
      {currentKey === "workTypes" && (
        <WorkTypesStep formData={formData} updateFormData={updateFormData} />
      )}
      {currentKey === "matrix" && (
        <TaskMatrixStep formData={formData} updateFormData={updateFormData} />
      )}
      {currentKey === "property" && (
        <PropertyStep formData={formData} updateFormData={updateFormData} />
      )}
      {currentKey === "summary" && (
        <SummaryStep formData={formData} updateFormData={updateFormData} />
      )}

      {/* Navigation buttons */}
      <div className="flex items-center justify-between gap-3 pt-4 border-t">
        {stepIndex === 0 ? (
          <Button variant="outline" onClick={onCancel} disabled={analyzing}>
            {t("common.cancel")}
          </Button>
        ) : (
          <Button variant="outline" onClick={handleBack} disabled={submitting} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            {t("intake.back")}
          </Button>
        )}

        {currentKey === "describe" ? (
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={handleFillManually} disabled={analyzing}>
              {t("guidedSetup.fillManually", "Fill in myself")}
            </Button>
            <Button onClick={handleDescribeNext} disabled={analyzing || (!analyzed && !canAnalyze)} className="gap-2">
              {analyzing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("planningWizard.analyzing", "Analyzing...")}
                </>
              ) : analyzed ? (
                <>
                  {t("intake.next")}
                  <ArrowRight className="h-4 w-4" />
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  {t("planningWizard.analyzeAndContinue", "Analysera & fortsätt")}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        ) : isLastStep ? (
          submitButton
        ) : (
          <Button onClick={handleNext} disabled={!canProceed()} className="gap-2">
            {t("intake.next")}
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

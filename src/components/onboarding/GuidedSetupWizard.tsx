import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Loader2, CheckCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { createProjectFromGuidedSetup, workTypeToCostCenter } from "@/services/intakeService";
import { createGuestProjectFromGuidedSetup } from "@/services/guestStorageService";
import {
  TOTAL_STEPS,
  INITIAL_FORM_DATA,
  WHOLE_PROPERTY_KEY,
  type GuidedFormData,
} from "./guided-setup/types";
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

const STEP_KEYS = [
  "roomsStep",
  "workTypesStep",
  "matrixStep",
  "propertyStep",
  "summaryStep",
] as const;

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
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<GuidedFormData>(INITIAL_FORM_DATA);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const updateFormData = useCallback((updates: Partial<GuidedFormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  }, []);

  const canProceed = useCallback((): boolean => {
    switch (currentStep) {
      case 1: // Rooms
        return formData.rooms.length > 0;
      case 2: // Work types
        return formData.workTypes.length > 0;
      case 3: { // Matrix
        const hasSelection = Object.values(formData.matrix).some(
          (set) => set.size > 0
        );
        return hasSelection;
      }
      case 4: // Project name & address
        return !!formData.projectName.trim();
      case 5: // Summary
        return true;
      default:
        return false;
    }
  }, [currentStep, formData]);

  const handleNext = () => {
    if (currentStep < TOTAL_STEPS && canProceed()) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleSubmit = async () => {
    if (submitting) return;

    setSubmitting(true);
    try {
      const tasks = matrixToTasks(formData);
      const rooms = formData.rooms.map((r) => ({
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

  const progressPercent = (currentStep / TOTAL_STEPS) * 100;

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

  return (
    <div className="space-y-6">
      {/* Progress header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {t("guidedSetup.stepOf", {
              current: currentStep,
              total: TOTAL_STEPS,
            })}
          </span>
          <span>{t(`guidedSetup.${STEP_KEYS[currentStep - 1]}`)}</span>
        </div>
        <Progress value={progressPercent} className="h-2" />
      </div>

      {/* Step content */}
      {currentStep === 1 && (
        <RoomsStep formData={formData} updateFormData={updateFormData} />
      )}
      {currentStep === 2 && (
        <WorkTypesStep formData={formData} updateFormData={updateFormData} />
      )}
      {currentStep === 3 && (
        <TaskMatrixStep formData={formData} updateFormData={updateFormData} />
      )}
      {currentStep === 4 && (
        <PropertyStep formData={formData} updateFormData={updateFormData} />
      )}
      {currentStep === 5 && (
        <SummaryStep formData={formData} updateFormData={updateFormData} />
      )}

      {/* Navigation buttons */}
      <div className="flex items-center justify-between gap-3 pt-4 border-t">
        {currentStep === 1 ? (
          <Button variant="outline" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
        ) : (
          <Button variant="outline" onClick={handleBack} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            {t("intake.back")}
          </Button>
        )}

        {currentStep < TOTAL_STEPS ? (
          <Button
            onClick={handleNext}
            disabled={!canProceed()}
            className="gap-2"
          >
            {t("intake.next")}
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={submitting || !canProceed()}
            className="gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("guidedSetup.creatingProject")}
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                {t("guidedSetup.createProject")}
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

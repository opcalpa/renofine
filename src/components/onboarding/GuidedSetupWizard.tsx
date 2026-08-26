import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { analytics, AnalyticsEvents, ProjectCreationMethod } from "@/lib/analytics";
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
import { RenovationPlanView } from "./RenovationPlanView";
import type { PlanInput, PlanTaskInput } from "@/lib/renovationPlan";
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
  /** Start voice recording immediately on the describe step — used when the
   * launcher was a mic-branded button that promised voice (OwnerStart path 1). */
  autoStartVoice?: boolean;
  /** The visitor already said what they want on the landing page — analyse it
   * on open instead of asking the same question a second time. */
  initialDescription?: string;
  /** Fires when the wizard flips to the plan, so the host dialog can retitle —
   * "Berätta om din renovering" above a finished plan reads as a stuck step. */
  onPlanShown?: () => void;
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

/**
 * The same matrix, kept in the plan's vocabulary (WorkType survives, the cost
 * centre string does not). Separate from `matrixToTasks` because that one feeds
 * project creation and must keep its exact insert shape.
 */
function matrixToPlanTasks(formData: GuidedFormData): PlanTaskInput[] {
  const tasks: PlanTaskInput[] = [];

  for (const wt of formData.workTypes) {
    const roomIds = formData.matrix[wt.id];
    if (!roomIds?.size) continue;

    if (roomIds.has(WHOLE_PROPERTY_KEY)) {
      tasks.push({ workType: wt.value, label: wt.label, roomName: null });
    } else {
      for (const roomId of roomIds) {
        const room = formData.rooms.find((r) => r.id === roomId);
        if (room) tasks.push({ workType: wt.value, label: wt.label, roomName: room.name });
      }
    }
  }

  return tasks;
}

export function GuidedSetupWizard({
  onComplete,
  onCancel,
  userType,
  profileId,
  isGuest = false,
  autoStartVoice = false,
  initialDescription,
  onPlanShown,
}: GuidedSetupWizardProps) {
  const { t, i18n } = useTranslation();
  const [stepIndex, setStepIndex] = useState(0);
  const [blankMode, setBlankMode] = useState(false);
  const [formData, setFormData] = useState<GuidedFormData>(INITIAL_FORM_DATA);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  /** Set once the project exists — the plan screen needs it for the CTA target. */
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);

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

  // A landing-page intent is already an answer to the describe step, so run the
  // parse immediately. Guarded by a ref: React 18 StrictMode mounts twice in
  // dev, and a double parse is a double model call.
  const autoAnalyzed = useRef(false);
  useEffect(() => {
    if (autoAnalyzed.current) return;
    if (!initialDescription || initialDescription.trim().length <= 10) return;
    autoAnalyzed.current = true;
    void (async () => {
      const proceed = await handleAnalyze();
      if (proceed) setStepIndex(1);
    })();
  }, [initialDescription, handleAnalyze]);

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

      // Baseline for the Renaida funnel comparison: tag the free-text flow so
      // PostHog can break `activation_reached` down by creation_method. Guests
      // are ephemeral (not real activation) — skip them.
      if (!isGuest) {
        analytics.capture(AnalyticsEvents.PROJECT_CREATED, {
          creation_method: ProjectCreationMethod.GUIDED_WIZARD,
          used_ai: analyzed,
          blank_mode: blankMode,
          room_count: rooms.length,
          task_count: tasks.length,
        });
      }

      toast.success(t("guidedSetup.projectCreated"));

      // Blank mode has no rooms and no work types, so there is no plan to show
      // — going straight into the empty project is the honest answer there.
      if (blankMode) {
        onComplete(result.projectId);
        return;
      }
      setCreatedProjectId(result.projectId);
      setSubmitted(true);
      onPlanShown?.();
    } catch (error) {
      console.error("Failed to create project from guided setup:", error);
      toast.error(t("common.error"));
    } finally {
      setSubmitting(false);
    }
  };

  const progressPercent = ((stepIndex + 1) / steps.length) * 100;

  // The finish state IS the plan. The old "Projekt skapat" card handed the user
  // a five-step tour of an empty project; the plan hands them the cost range,
  // the ROT, the trade order and what they forgot — before asking for anything.
  if (submitted && createdProjectId) {
    const planInput: PlanInput = {
      rooms: formData.rooms.map((r) => ({
        name: r.name,
        areaSqm: r.area_sqm ?? null,
        widthM: r.width_m ?? null,
        depthM: r.depth_m ?? null,
        ceilingHeightMm: r.ceiling_height_mm,
      })),
      tasks: matrixToPlanTasks(formData),
      userType,
    };
    return (
      <RenovationPlanView
        input={planInput}
        isGuest={isGuest}
        projectId={createdProjectId}
        onOpenProject={() => onComplete(createdProjectId)}
      />
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
          {/* The blank branch shares steps with the full flow — a "Steg 2 av 2"
              counter right after "Steg 1 av 6" reads as broken, so hide it there. */}
          <span>
            {blankMode
              ? t("guidedSetup.startBlankLabel", "Tomt projekt")
              : t("guidedSetup.stepOf", { current: stepIndex + 1, total: steps.length })}
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
          autoStartVoice={autoStartVoice}
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

      {/* Navigation buttons — flex-wrap: three describe-step buttons exceed a
          390px viewport's min-content width and stretch the whole dialog. */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t">
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
          <div className="flex w-full sm:w-auto flex-wrap items-center justify-end gap-2 sm:ml-auto">
            <Button variant="link" onClick={handleFillManually} disabled={analyzing} className="h-auto px-1 underline underline-offset-4">
              {t("guidedSetup.fillManually", "Fill in the steps myself")}
            </Button>
            <Button onClick={handleDescribeNext} disabled={analyzing || (!analyzed && !canAnalyze)} className="gap-2 flex-1 sm:flex-none">
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

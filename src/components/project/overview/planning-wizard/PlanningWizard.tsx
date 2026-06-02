import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  populateProjectFromPlanningWizard,
  populateGuestProjectFromPlanningWizard,
} from "@/services/planningWizardService";
import { useGuestMode } from "@/hooks/useGuestMode";
import { DescribeStep } from "./DescribeStep";
import { SummaryStep } from "./SummaryStep";
import { WorkMatrixStep } from "./WorkMatrixStep";
import { INITIAL_FORM_DATA, TOTAL_STEPS } from "./types";
import type { PlanningWizardData, PlanningWizardRoom, AIParsedResult } from "./types";

interface PlanningWizardProps {
  projectId: string;
  onComplete: () => void;
  onSkip: () => void;
}

export function PlanningWizard({ projectId, onComplete, onSkip }: PlanningWizardProps) {
  const { t } = useTranslation();
  const { isGuest } = useGuestMode();
  const storageKey = `planning-wizard-${projectId}`;

  // Restore draft from localStorage (survives unmount/remount)
  const [step, setStep] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return (JSON.parse(saved) as { step: number }).step || 1;
    } catch { /* use default */ }
    return 1;
  });
  const [formData, setFormData] = useState<PlanningWizardData>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return (JSON.parse(saved) as { formData: PlanningWizardData }).formData || INITIAL_FORM_DATA;
    } catch { /* use default */ }
    return INITIAL_FORM_DATA;
  });
  const [analyzing, setAnalyzing] = useState(false);
  const [creating, setCreating] = useState(false);

  // Persist draft on every change
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify({ step, formData }));
  }, [step, formData, storageKey]);

  // Clear draft on complete/skip
  const clearDraft = useCallback(() => {
    localStorage.removeItem(storageKey);
  }, [storageKey]);

  const updateFormData = useCallback((updates: Partial<PlanningWizardData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  }, []);

  const canProceed = (): boolean => {
    switch (step) {
      case 1: return formData.description.length > 10;
      case 2: return formData.rooms.length > 0;
      case 3: return true; // matrix is optional — user can submit with no tasks
      default: return false;
    }
  };

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("parse-renovation-description", {
        body: { description: formData.description, language: "sv" },
      });
      // Edge function returns 429 with { error, message } when rate-limited.
      // supabase-js bubbles non-2xx as `error` (FunctionsHttpError) but still
      // exposes `data` on body — test for both.
      const rateLimited =
        (typeof data === "object" && data !== null && (data as { error?: string }).error === "Rate limit exceeded") ||
        (error && /429|rate limit/i.test(error.message || ""));
      if (rateLimited) {
        toast.error(
          t(
            "planningWizard.rateLimited",
            "För många försök på kort tid. Vänta en stund eller fyll i manuellt."
          )
        );
        setAnalyzing(false);
        return;
      }
      if (error) throw error;

      const parsed = data as AIParsedResult;
      // Pre-populate main rooms (with proposed work) from AI
      const aiRooms: PlanningWizardRoom[] = parsed.rooms.map((r) => ({
        id: crypto.randomUUID(),
        name: r.name,
        nameKey: r.nameKey,
        aiSuggested: true,
      }));

      // Pre-populate discovered-but-no-work rooms separately
      const aiOtherSpaces: PlanningWizardRoom[] = (parsed.otherSpaces ?? []).map((r) => ({
        id: crypto.randomUUID(),
        name: r.name,
        nameKey: r.nameKey,
        aiSuggested: true,
      }));

      // Pre-populate room-specific work from AI.
      // Note: multiple rooms can share the same nameKey ("Sovrum 1", "Sovrum 2") —
      // match by index within nameKey-group so each numbered room gets its own AI entry.
      const roomSpecificWork: PlanningWizardData["roomSpecificWork"] = {};
      const aiRoomQueueByKey = new Map<string, typeof parsed.rooms>();
      parsed.rooms.forEach((aiR) => {
        const arr = aiRoomQueueByKey.get(aiR.nameKey) ?? [];
        arr.push(aiR);
        aiRoomQueueByKey.set(aiR.nameKey, arr);
      });
      aiRooms.forEach((wizardRoom) => {
        const queue = aiRoomQueueByKey.get(wizardRoom.nameKey ?? "");
        const aiR = queue?.shift();
        if (!aiR || aiR.suggestedWorkTypes.length === 0) return;
        roomSpecificWork[wizardRoom.id] = {
          description: "",
          workTypes: aiR.suggestedWorkTypes,
          excludedGlobals: [],
          taskTitles: aiR.taskTitles,
        };
      });

      updateFormData({
        aiParsed: parsed,
        propertyType: parsed.propertyType,
        floors: parsed.floors,
        totalAreaSqm: parsed.totalAreaSqm ?? undefined,
        rooms: aiRooms,
        otherSpaces: aiOtherSpaces,
        globalWorkTypes: parsed.globalWorkTypes,
        roomSpecificWork,
      });
    } catch {
      toast.error(t("planningWizard.analyzeFailed", "Could not analyze. You can continue manually."));
    }
    setAnalyzing(false);
  }, [formData.description, updateFormData, t]);

  const handleSubmit = useCallback(async () => {
    setCreating(true);
    try {
      let roomCount: number;
      let taskCount: number;

      if (isGuest) {
        const result = populateGuestProjectFromPlanningWizard(
          projectId,
          formData,
          (wt) => t(`intake.workType.${wt}`, wt)
        );
        roomCount = result.roomCount;
        taskCount = result.taskCount;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", user.id)
          .single();
        if (!profile) throw new Error("No profile");

        const result = await populateProjectFromPlanningWizard(
          projectId,
          formData,
          profile.id,
          (wt) => t(`intake.workType.${wt}`, wt)
        );
        roomCount = result.roomCount;
        taskCount = result.taskCount;
      }

      toast.success(
        t("planningWizard.created", "Created {{rooms}} rooms and {{tasks}} tasks!", {
          rooms: roomCount,
          tasks: taskCount,
        })
      );
      clearDraft();
      onComplete();
    } catch {
      toast.error(t("common.errorSaving", "Could not save"));
    }
    setCreating(false);
  }, [projectId, formData, onComplete, t, isGuest, clearDraft]);

  const progress = (step / TOTAL_STEPS) * 100;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Card wrapper */}
      <div className="rounded-xl border bg-card shadow-sm">
        {/* Header with progress */}
        <div className="px-6 pt-6 pb-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold">
                {t("planningWizard.title", "Plan your renovation")}
              </h2>
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">
              {step} / {TOTAL_STEPS}
            </span>
          </div>
          <Progress value={progress} className="h-1" />
        </div>

        {/* Step content */}
        <div className="px-6 pb-6">
          {step === 1 && (
            <DescribeStep
              formData={formData}
              updateFormData={updateFormData}
              analyzing={analyzing}
            />
          )}
          {step === 2 && <SummaryStep formData={formData} updateFormData={updateFormData} />}
          {step === 3 && <WorkMatrixStep formData={formData} updateFormData={updateFormData} />}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-muted/30 rounded-b-xl">
          <div>
            {step === 1 ? (
              <Button variant="ghost" size="sm" onClick={() => { clearDraft(); onSkip(); }} className="text-muted-foreground">
                {t("planningWizard.skipWizard", "Skip — add manually")}
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setStep((s) => s - 1)} className="gap-1">
                <ChevronLeft className="h-4 w-4" />
                {t("common.back", "Back")}
              </Button>
            )}
          </div>
          <div>
            {step === 1 ? (
              <Button
                size="sm"
                onClick={async () => {
                  // Drive every step-1 user through AI on first pass.
                  // Continue to step 2 even if analysis fails — manual fallback.
                  if (!formData.aiParsed) {
                    await handleAnalyze();
                  }
                  setStep(2);
                }}
                disabled={!canProceed() || analyzing}
                className="gap-1.5"
              >
                {analyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("planningWizard.analyzing", "Analyzing...")}
                  </>
                ) : formData.aiParsed ? (
                  <>
                    {t("common.next", "Next")}
                    <ChevronRight className="h-4 w-4" />
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    {t("planningWizard.analyzeAndContinue", "Analysera & fortsätt")}
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            ) : step < TOTAL_STEPS ? (
              <Button size="sm" onClick={() => setStep((s) => s + 1)} disabled={!canProceed()} className="gap-1">
                {t("common.next", "Next")}
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button size="sm" onClick={handleSubmit} disabled={creating || !canProceed()} className="gap-1.5">
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                {creating
                  ? t("planningWizard.creating", "Creating plan...")
                  : t("planningWizard.createPlan", "Create plan")}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

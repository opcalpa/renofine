import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { HardHat, Loader2, Layers, List, Languages } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { WorkerTaskCard, type WorkerTask } from "@/components/worker/WorkerTaskCard";
import { SwipeableRoomInstructions, groupWorkerTasksByRoom } from "@/components/room-instructions";
import type { FloorPlanObject, WallNote, WallObject, WallSurface } from "@/components/worker/roomObjectShared";
import {
  fetchWorkerRuntimeTranslations,
  needsRuntimeTranslation,
  WELCOME_ID,
  WN_PREFIX,
  FIN_PREFIX,
  II_PREFIX,
} from "@/lib/workerContentTranslation";

interface WorkerInstructionsViewProps {
  projectId: string;
  workerToken: string;
  displayName: string;
}

interface WorkerViewData {
  projectName: string;
  workerName: string;
  /** Effective language of THIS payload (worker's, or the preview override). */
  language: string;
  /** The worker's real language, regardless of the current preview override. */
  workerLanguage?: string;
  welcomeMessage?: string | null;
  canUploadPhotos: boolean;
  canToggleChecklist: boolean;
  tasks: WorkerTask[];
  floorPlan: Array<{
    id: string;
    roomId: string | null;
    points: Array<{ x: number; y: number }>;
    color: string;
    strokeColor: string;
    name: string | null;
  }> | null;
  floorPlanImage: { url: string; x: number; y: number } | null;
  // Wall elevations + placed objects — the richest part of what the worker
  // sees. Previously dropped here, so the owner's preview silently omitted them.
  floorPlanObjects?: FloorPlanObject[];
  wallObjects?: WallObject[];
  wallSurfaces?: WallSurface[];
  wallNotes?: WallNote[];
}

export function WorkerInstructionsView({
  workerToken,
  displayName,
}: WorkerInstructionsViewProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<WorkerViewData | null>(null);
  const [viewMode, setViewMode] = useState<"rooms" | "list">("rooms");
  // Back-translation: null = worker's real language (exactly what they see);
  // "sv" = the owner's source text, so they can verify the translation faithful.
  const [previewLang, setPreviewLang] = useState<string | null>(null);

  const roomInstructions = useMemo(
    () => (data?.tasks ? groupWorkerTasksByRoom(data.tasks) : []),
    [data?.tasks]
  );

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerToken, previewLang]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke(
        "get-worker-data",
        { body: { token: workerToken, preview: true, previewLang: previewLang ?? undefined } }
      );

      if (error || result?.error) {
        setData(null);
        return;
      }

      const viewData = result as WorkerViewData;
      setData(viewData);

      // Run the SAME runtime translation pass the worker gets, so the preview
      // matches exactly (wall notes, object finish, instruction-image prose).
      // In Swedish mode these are already the source, so we skip.
      if (needsRuntimeTranslation(viewData.language)) {
        void fetchWorkerRuntimeTranslations(viewData, viewData.language).then((trMap) => {
          if (trMap.size === 0) return;
          setData((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              tasks: prev.tasks.map((task) => ({
                ...task,
                messages: task.messages.map((msg) => ({
                  ...msg,
                  translatedContent: trMap.get(msg.id) || msg.translatedContent || null,
                })),
                instructionImages: task.instructionImages?.map((img) => ({
                  ...img,
                  translatedDescription:
                    trMap.get(II_PREFIX + img.id) || img.translatedDescription || null,
                })),
              })),
              wallNotes: prev.wallNotes?.map((n) => ({
                ...n,
                translatedText: trMap.get(WN_PREFIX + n.id) || n.translatedText || null,
              })),
              floorPlanObjects: prev.floorPlanObjects?.map((o) => ({
                ...o,
                translatedFinish: trMap.get(FIN_PREFIX + o.id) || o.translatedFinish || null,
              })),
              wallObjects: prev.wallObjects?.map((o) => ({
                ...o,
                translatedFinish: trMap.get(FIN_PREFIX + o.id) || o.translatedFinish || null,
              })),
              welcomeMessage: trMap.get(WELCOME_ID) || prev.welcomeMessage,
            };
          });
        });
      }
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleTaskUpdate = (taskId: string, updates: Partial<WorkerTask>) => {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        tasks: prev.tasks.map((t) =>
          t.id === taskId ? { ...t, ...updates } : t
        ),
      };
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <HardHat className="h-10 w-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">
          {t("sharing.noAssignedTasks", "No tasks assigned to this person")}
        </p>
      </div>
    );
  }

  // The worker's own language — offer the toggle only when it isn't sv/en
  // (otherwise the source and the worker's view are identical anyway).
  const realWorkerLang = data.workerLanguage || data.language;
  const canToggleLanguage = needsRuntimeTranslation(realWorkerLang);
  const showingSource = previewLang === "sv";

  return (
    <div className="space-y-4">
      {/* Header — mirrors worker view header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
          <HardHat className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold">
            {t("sharing.instructionsFor", { name: displayName })}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("teamWorker.tasksAssigned", "{{count}} tasks", { count: data.tasks.length })}
          </p>
        </div>
        {/* View toggle */}
        <div className="flex rounded-md border bg-muted/30 p-0.5">
          <button
            type="button"
            onClick={() => setViewMode("rooms")}
            className={`p-1.5 rounded transition-colors ${viewMode === "rooms" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
          >
            <Layers className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className={`p-1.5 rounded transition-colors ${viewMode === "list" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Back-translation toggle: verify the translated instructions say what
          you meant, without reading the worker's language yourself. */}
      {canToggleLanguage && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2">
          <Languages className="h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="flex-1 text-xs text-muted-foreground">
            {showingSource
              ? t("sharing.previewShowingSource", "Visar din svenska källtext.")
              : t("sharing.previewShowingWorker", "Visar exakt vad {{name}} ser ({{lang}}).", {
                  name: displayName,
                  lang: realWorkerLang.toUpperCase(),
                })}
          </p>
          <button
            type="button"
            onClick={() => setPreviewLang(showingSource ? null : "sv")}
            className="shrink-0 rounded-md border bg-background px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent"
          >
            {showingSource
              ? t("sharing.previewSeeWorkerLang", "Se på {{lang}}", { lang: realWorkerLang.toUpperCase() })
              : t("sharing.previewSeeSwedish", "Visa på svenska")}
          </button>
        </div>
      )}

      {/* Content — identical to WorkerView */}
      {data.tasks.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">{t("worker.noTasks", "No tasks assigned yet.")}</p>
        </div>
      ) : viewMode === "rooms" ? (
        <div className="border rounded-lg overflow-hidden min-h-[400px]">
          <SwipeableRoomInstructions
            rooms={roomInstructions}
            floorPlanShapes={data.floorPlan ?? undefined}
            floorPlanObjects={data.floorPlanObjects}
            wallObjects={data.wallObjects}
            wallSurfaces={data.wallSurfaces}
            wallNotes={data.wallNotes}
            canToggleChecklist={false}
            canUploadPhotos={false}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {data.tasks.map((task) => (
            <WorkerTaskCard
              key={task.id}
              task={task}
              token={workerToken}
              canToggleChecklist={false}
              canUploadPhotos={false}
              floorPlan={data.floorPlan}
              floorPlanImage={data.floorPlanImage}
              floorPlanObjects={data.floorPlanObjects}
              wallObjects={data.wallObjects}
              wallSurfaces={data.wallSurfaces}
              wallNotes={data.wallNotes}
              onTaskUpdate={handleTaskUpdate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

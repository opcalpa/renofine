import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { HardHat, Loader2, Layers, List } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { WorkerTaskCard, type WorkerTask } from "@/components/worker/WorkerTaskCard";
import { SwipeableRoomInstructions, groupWorkerTasksByRoom } from "@/components/room-instructions";

interface WorkerInstructionsViewProps {
  projectId: string;
  workerToken: string;
  displayName: string;
}

interface WorkerViewData {
  projectName: string;
  workerName: string;
  language: string;
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
}

export function WorkerInstructionsView({
  projectId,
  workerToken,
  displayName,
}: WorkerInstructionsViewProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<WorkerViewData | null>(null);
  const [viewMode, setViewMode] = useState<"rooms" | "list">("rooms");

  const roomInstructions = useMemo(
    () => (data?.tasks ? groupWorkerTasksByRoom(data.tasks) : []),
    [data?.tasks]
  );

  useEffect(() => {
    loadData();
  }, [workerToken]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke(
        "get-worker-data",
        { body: { token: workerToken } }
      );

      if (error || result?.error) {
        setData(null);
        return;
      }

      setData(result as WorkerViewData);
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

      {/* Content — identical to WorkerView */}
      {data.tasks.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">{t("worker.noTasks", "No tasks assigned yet.")}</p>
        </div>
      ) : viewMode === "rooms" ? (
        <div className="border rounded-lg overflow-hidden min-h-[400px]">
          <SwipeableRoomInstructions
            rooms={roomInstructions}
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
              onTaskUpdate={handleTaskUpdate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

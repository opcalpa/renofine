import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { HardHat, Loader2, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface WorkerInstructionsViewProps {
  projectId: string;
  taskIds: string[];
  displayName: string;
}

export function WorkerInstructionsView({
  projectId,
  taskIds,
  displayName,
}: WorkerInstructionsViewProps) {
  const { t } = useTranslation();

  const { data, isLoading } = useQuery({
    queryKey: ["worker-instructions", projectId, taskIds],
    enabled: taskIds.length > 0,
    queryFn: async () => {
      const { data: tasks } = await supabase
        .from("tasks")
        .select("id, title, description, status, progress, room_id, checklists")
        .in("id", taskIds)
        .order("created_at");

      if (!tasks?.length) return { tasks: [], rooms: new Map<string, string>() };

      // Fetch room names
      const roomIds = [...new Set(tasks.map((t) => t.room_id).filter(Boolean))] as string[];
      const rooms = new Map<string, string>();
      if (roomIds.length > 0) {
        const { data: roomRows } = await supabase
          .from("rooms")
          .select("id, name")
          .in("id", roomIds);
        for (const r of roomRows || []) rooms.set(r.id, r.name);
      }

      return { tasks, rooms };
    },
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const tasks = data?.tasks || [];
  const rooms = data?.rooms || new Map<string, string>();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
          <HardHat className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">
            {t("sharing.instructionsFor", { name: displayName })}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("teamWorker.tasksAssigned", "{{count}} tasks", { count: tasks.length })}
          </p>
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <HardHat className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            {t("sharing.noAssignedTasks", "No tasks assigned to this person")}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => {
            const isDone = task.status === "done" || task.status === "completed";
            const roomName = task.room_id ? rooms.get(task.room_id) : null;
            const checklists = Array.isArray(task.checklists) ? task.checklists as Array<{ items?: Array<{ completed?: boolean }> }> : [];
            const totalItems = checklists.reduce((sum, cl) => sum + (cl.items?.length || 0), 0);
            const doneItems = checklists.reduce((sum, cl) => sum + (cl.items?.filter((i) => i.completed).length || 0), 0);

            return (
              <div
                key={task.id}
                className={cn(
                  "border rounded-lg p-4 space-y-2",
                  isDone && "opacity-60"
                )}
              >
                <div className="flex items-start gap-3">
                  <CheckCircle className={cn("h-5 w-5 shrink-0 mt-0.5", isDone ? "text-emerald-500" : "text-muted-foreground/30")} />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm">{task.title}</h3>
                    {roomName && (
                      <p className="text-xs text-muted-foreground">{roomName}</p>
                    )}
                    {task.description && (
                      <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
                    )}
                  </div>
                  {totalItems > 0 && (
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                      {doneItems}/{totalItems}
                    </span>
                  )}
                </div>

                {/* Progress bar */}
                {(task.progress > 0 || totalItems > 0) && (
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden ml-8">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${totalItems > 0 ? (doneItems / totalItems) * 100 : task.progress}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

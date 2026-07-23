import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TaskRoomDetails } from "@/components/shared/TaskRoomDetails";
import { RoomItemsSummary } from "@/components/shared/RoomItemsSummary";
import { TaskFilesList } from "../../TaskFilesList";
import { formatCurrency } from "@/lib/currency";
import { type Task, taskRoomIdList } from "../types";

export interface TaskDependency {
  id: string;
  depends_on_task_id: string;
  title: string;
  status: string;
  finish_date: string | null;
}

export interface RelatedPurchaseOrder {
  id: string;
  label: string;
  status: string;
  total: number;
  vendorName: string | null;
}

interface RelatedTabProps {
  task: Task;
  projectId: string;
  dependencies: TaskDependency[];
  setDependencies: React.Dispatch<React.SetStateAction<TaskDependency[]>>;
  allProjectTasks: { id: string; title: string; status: string; finish_date: string | null }[];
  relatedPOs: RelatedPurchaseOrder[];
  currency?: string | null;
  onOpenPurchase: (poId: string) => void;
}

export function RelatedTab({ task, projectId, dependencies, setDependencies, allProjectTasks, relatedPOs, currency, onOpenPurchase }: RelatedTabProps) {
  const { t } = useTranslation();
  const taskRoomIds = taskRoomIdList(task);

  return (
    <div className="flex flex-col gap-5 px-6 py-5">
      {/* Related purchase orders — from the task's material lines */}
      {relatedPOs.length > 0 && (
        <div>
          <span className="rf-section-label mb-2 block">
            {t("tasks.relatedPurchases", "Köpordrar")} ({relatedPOs.length})
          </span>
          <div className="space-y-1.5">
            {relatedPOs.map((po) => (
              <button
                key={po.id}
                type="button"
                onClick={() => onOpenPurchase(po.id)}
                className="flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
                style={{ borderColor: "var(--rf-hairline)", background: "var(--rf-paper-2)" }}
              >
                <span className="min-w-0 truncate">
                  {po.label}
                  {po.vendorName && <span className="ml-1.5 text-xs text-muted-foreground">· {po.vendorName}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {po.total > 0 && <span className="rf-num text-xs tabular-nums">{formatCurrency(po.total, currency)}</span>}
                  <span className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {t(`purchaseOrderStatus.${po.status}`, po.status)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Dependencies */}
      <div>
        <span className="rf-section-label mb-2 block">
          {t("tasks.dependencies", "Dependencies")} {dependencies.length > 0 && `(${dependencies.length})`}
        </span>
        <div className="space-y-2">
          {dependencies.map((dep) => {
            const isReady = dep.status === "completed";
            return (
              <div
                key={dep.id}
                className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm ${isReady ? "border-green-200 bg-green-50/50" : "border-amber-200 bg-amber-50/50"}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`h-2 w-2 rounded-full shrink-0 ${isReady ? "bg-green-500" : "bg-amber-500"}`} />
                  <span className="truncate">{dep.title}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {isReady ? t("tasks.depReady", "Ready") : t("tasks.depWaiting", "Waiting")}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive shrink-0"
                  onClick={async () => {
                    await supabase.from("task_dependencies").delete().eq("id", dep.id);
                    setDependencies((prev) => prev.filter((d) => d.id !== dep.id));
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            );
          })}
          {(() => {
            const availableTasks = allProjectTasks.filter(
              (pt) => !dependencies.some((d) => d.depends_on_task_id === pt.id)
            );
            if (availableTasks.length === 0 && dependencies.length === 0) {
              return <p className="text-xs text-muted-foreground">{t("tasks.noDepsAvailable", "No other tasks to depend on")}</p>;
            }
            if (availableTasks.length === 0) return null;
            return (
              <Select
                value=""
                onValueChange={async (depTaskId) => {
                  const { data, error } = await supabase
                    .from("task_dependencies")
                    .insert({ task_id: task.id, depends_on_task_id: depTaskId })
                    .select("id")
                    .single();
                  if (!error && data) {
                    const depTask = allProjectTasks.find((pt) => pt.id === depTaskId);
                    setDependencies((prev) => [...prev, {
                      id: data.id,
                      depends_on_task_id: depTaskId,
                      title: depTask?.title || "Unknown",
                      status: depTask?.status || "to_do",
                      finish_date: depTask?.finish_date || null,
                    }]);
                  }
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder={t("tasks.addDependency", "Add dependency...")} />
                </SelectTrigger>
                <SelectContent>
                  {availableTasks.map((pt) => (
                    <SelectItem key={pt.id} value={pt.id}>
                      {pt.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            );
          })()}
        </div>
      </div>

      {/* Objects logged/placed in the task's rooms — mirror of the floor plan
          and room-details lists (same room_items records) */}
      {taskRoomIds.length > 0 && <RoomItemsSummary roomIds={taskRoomIds} />}

      {/* Room details (aggregated from all linked rooms) */}
      {taskRoomIds.length > 0 && (
        <div>
          <span className="rf-section-label mb-2 block">
            {t("tasks.roomDetails", "Room details")}
            {taskRoomIds.length > 1 && ` (${taskRoomIds.length} ${t("tasks.rooms", "rooms")})`}
          </span>
          <TaskRoomDetails roomIds={taskRoomIds} />
        </div>
      )}

      {/* Linked files — TaskFilesList renders its own heading */}
      <div>
        <TaskFilesList taskId={task.id} projectId={projectId} />
      </div>
    </div>
  );
}

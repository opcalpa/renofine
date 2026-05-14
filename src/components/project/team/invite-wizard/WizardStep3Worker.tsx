import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckSquare } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useWorkerTasks, type TaskOption, type TaskOverride } from "../WorkerInviteFields";
import { WorkerInvitePreview } from "../WorkerInvitePreview";
import { cn } from "@/lib/utils";
import type { WorkerAccessConfig } from "./types";

interface Props {
  projectId: string;
  workerAccess: WorkerAccessConfig;
  onToggleTask: (taskId: string) => void;
  onChange: (updates: Partial<WorkerAccessConfig>) => void;
  onSetOverride: (taskId: string, updates: Partial<TaskOverride>) => void;
  onToggleChecklistItem: (task: TaskOption, checklistId: string, itemId: string) => void;
  isChecklistItemIncluded: (taskId: string, checklistId: string, itemId: string) => boolean;
}

export function WizardStep3Worker({
  projectId,
  workerAccess,
  onToggleTask,
  onChange,
  onSetOverride,
  onToggleChecklistItem,
  isChecklistItemIncluded,
}: Props) {
  const { t } = useTranslation();
  const tasks = useWorkerTasks(projectId);
  const selectedCount = workerAccess.taskIds.length;
  const [previewTaskId, setPreviewTaskId] = useState<string | null>(null);

  // Auto-select first task when something is selected and nothing previewed yet
  useEffect(() => {
    if (selectedCount > 0 && !previewTaskId) {
      setPreviewTaskId(workerAccess.taskIds[0]);
    }
    if (selectedCount === 0 && previewTaskId) {
      setPreviewTaskId(null);
    }
    if (previewTaskId && !workerAccess.taskIds.includes(previewTaskId)) {
      setPreviewTaskId(workerAccess.taskIds[0] || null);
    }
  }, [workerAccess.taskIds, selectedCount, previewTaskId]);

  const previewTask = previewTaskId ? tasks.find((task) => task.id === previewTaskId) : null;
  const grouped = groupByRoom(tasks);
  const previewIdx = previewTaskId ? workerAccess.taskIds.indexOf(previewTaskId) : -1;

  const navigatePreview = (direction: "prev" | "next") => {
    if (workerAccess.taskIds.length < 2) return;
    const idx = previewIdx < 0 ? 0 : previewIdx;
    const nextIdx =
      direction === "next"
        ? (idx + 1) % workerAccess.taskIds.length
        : (idx - 1 + workerAccess.taskIds.length) % workerAccess.taskIds.length;
    setPreviewTaskId(workerAccess.taskIds[nextIdx]);
  };

  const previewOverride: TaskOverride = previewTaskId
    ? workerAccess.taskOverrides.get(previewTaskId) ?? {
        taskId: previewTaskId,
        descriptionOverride: null,
        checklistOverride: null,
        photoOverride: null,
      }
    : {
        taskId: "",
        descriptionOverride: null,
        checklistOverride: null,
        photoOverride: null,
      };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">
            {t("inviteWizard.workerStep.title", "Vilka uppgifter ska personen utföra?")}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t(
              "inviteWizard.workerStep.description",
              "Välj en eller flera uppgifter. Workern ser bara det du markerar.",
            )}
          </p>
        </div>
        <div className="text-xs font-medium text-muted-foreground tabular-nums">
          {t("inviteWizard.workerStep.selectedCount", "{{count}} valda", {
            count: selectedCount,
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4">
        {/* Task list */}
        <div className="border rounded-md max-h-[420px] overflow-y-auto divide-y">
          {tasks.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              {t("inviteWizard.workerStep.noTasks", "Inga uppgifter i projektet ännu.")}
            </div>
          ) : (
            Object.entries(grouped).map(([room, items]) => (
              <div key={room} className="p-2">
                {room !== "__none__" && (
                  <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {room}
                  </div>
                )}
                <ul className="space-y-0.5">
                  {items.map((task) => {
                    const checked = workerAccess.taskIds.includes(task.id);
                    const isPreviewed = task.id === previewTaskId;
                    return (
                      <li key={task.id}>
                        <div
                          className={cn(
                            "flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer transition-colors",
                            isPreviewed
                              ? "bg-primary/10 ring-1 ring-primary/30"
                              : checked
                                ? "bg-primary/5 hover:bg-primary/10"
                                : "hover:bg-accent/50",
                          )}
                          onClick={() => {
                            if (!checked) onToggleTask(task.id);
                            setPreviewTaskId(task.id);
                          }}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => onToggleTask(task.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <span className="text-sm flex-1">{task.title}</span>
                          {checked && (
                            <CheckSquare className="h-3.5 w-3.5 text-primary shrink-0" />
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>

        {/* Preview */}
        <div className="border-l-0 md:border-l md:pl-4 max-h-[420px] overflow-y-auto">
          {previewTask ? (
            <WorkerInvitePreview
              task={previewTask}
              override={previewOverride}
              onOverrideChange={(updates) => onSetOverride(previewTask.id, updates)}
              onChecklistToggle={(checklistId, itemId) =>
                onToggleChecklistItem(previewTask, checklistId, itemId)
              }
              isChecklistItemIncluded={(checklistId, itemId) =>
                isChecklistItemIncluded(previewTask.id, checklistId, itemId)
              }
              currentIndex={previewIdx}
              totalCount={workerAccess.taskIds.length}
              onNavigate={navigatePreview}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-6 text-xs text-muted-foreground">
              {t(
                "inviteWizard.workerStep.previewEmpty",
                "Välj en uppgift för att se hur arbetaren ser den.",
              )}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-md border bg-card/40 p-3 space-y-3">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("inviteWizard.workerStep.purchaseHeader", "Inköp")}
        </div>

        <PurchaseToggle
          id="can-propose"
          label={t("inviteWizard.workerStep.canProposeLabel", "Kan föreslå inköp")}
          description={t(
            "inviteWizard.workerStep.canProposeDescription",
            "Skapar förslag som du godkänner innan inköpet görs.",
          )}
          checked={workerAccess.canProposePurchases}
          onChange={(v) => onChange({ canProposePurchases: v })}
        />

        <PurchaseToggle
          id="can-log"
          label={t("inviteWizard.workerStep.canLogLabel", "Kan logga utförda inköp")}
          description={t(
            "inviteWizard.workerStep.canLogDescription",
            "Workern registrerar och bifogar kvitto direkt — kringgår godkännande.",
          )}
          checked={workerAccess.canLogPurchases}
          onChange={(v) => onChange({ canLogPurchases: v })}
        />
      </div>
    </div>
  );
}

interface PurchaseToggleProps {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function PurchaseToggle({ id, label, description, checked, onChange }: PurchaseToggleProps) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1 space-y-0.5">
        <Label htmlFor={id} className="text-sm font-medium cursor-pointer">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground leading-snug">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function groupByRoom(tasks: TaskOption[]): Record<string, TaskOption[]> {
  const groups: Record<string, TaskOption[]> = {};
  for (const task of tasks) {
    const key = task.roomName?.trim() || "__none__";
    if (!groups[key]) groups[key] = [];
    groups[key].push(task);
  }
  return groups;
}

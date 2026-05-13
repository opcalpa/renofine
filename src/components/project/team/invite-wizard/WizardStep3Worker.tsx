import { useTranslation } from "react-i18next";
import { CheckSquare } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useWorkerTasks } from "../WorkerInviteFields";
import { cn } from "@/lib/utils";
import type { WorkerAccessConfig } from "./types";

interface Props {
  projectId: string;
  workerAccess: WorkerAccessConfig;
  onToggleTask: (taskId: string) => void;
  onChange: (updates: Partial<WorkerAccessConfig>) => void;
}

export function WizardStep3Worker({
  projectId,
  workerAccess,
  onToggleTask,
  onChange,
}: Props) {
  const { t } = useTranslation();
  const tasks = useWorkerTasks(projectId);
  const selectedCount = workerAccess.taskIds.length;

  const grouped = groupByRoom(tasks);

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

      <div className="border rounded-md max-h-[280px] overflow-y-auto divide-y">
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
                  return (
                    <li key={task.id}>
                      <label
                        className={cn(
                          "flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer hover:bg-accent/50 transition-colors",
                          checked && "bg-primary/5",
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => onToggleTask(task.id)}
                        />
                        <span className="text-sm flex-1">{task.title}</span>
                        {checked && (
                          <CheckSquare className="h-3.5 w-3.5 text-primary shrink-0" />
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
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

interface TaskRow {
  id: string;
  title: string;
  roomName: string | null;
}

function groupByRoom(tasks: TaskRow[]): Record<string, TaskRow[]> {
  const groups: Record<string, TaskRow[]> = {};
  for (const t of tasks) {
    const key = t.roomName?.trim() || "__none__";
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  }
  return groups;
}

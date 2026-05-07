import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import type { ActiveTask } from "./useClientViewData";

interface ThisWeekTasksProps {
  tasks: ActiveTask[];
  onTaskClick: (taskId: string) => void;
}

export function ThisWeekTasks({ tasks, onTaskClick }: ThisWeekTasksProps) {
  const { t } = useTranslation();

  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground mb-3">
        {t("customerView.thisWeek.label", "Denna vecka")}
      </div>
      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("customerView.thisWeek.noTasks", "Inga aktiva arbeten just nu.")}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {tasks.map((task) => {
            const done = task.status === "completed";
            return (
              <li
                key={task.id}
                className="flex gap-3 p-3 bg-card border border-border/60 rounded-lg cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => onTaskClick(task.id)}
              >
                <div className={`w-[22px] h-[22px] rounded-full shrink-0 mt-0.5 flex items-center justify-center ${
                  done
                    ? "bg-foreground text-background"
                    : "border border-border bg-muted"
                }`}>
                  {done && <Check className="h-3 w-3" />}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium tracking-[-0.003em] truncate">{task.title}</div>
                  {task.assigneeName && (
                    <div className="text-xs text-muted-foreground mt-0.5">{task.assigneeName}</div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

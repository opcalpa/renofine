import { useTranslation } from "react-i18next";
import { format, parseISO, differenceInDays, startOfDay, isAfter, isBefore } from "date-fns";
import { sv, enUS } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { Milestone } from "./useClientViewData";

interface ProgressRibbonProps {
  percentage: number;
  milestones: Milestone[];
  startDate?: string | null;
  finishDate?: string | null;
}

export function ProgressRibbon({ percentage, milestones, startDate, finishDate }: ProgressRibbonProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "sv" ? sv : enUS;
  const today = startOfDay(new Date());

  const totalDays = startDate && finishDate
    ? differenceInDays(parseISO(finishDate), parseISO(startDate))
    : null;
  const elapsedDays = startDate
    ? Math.max(0, differenceInDays(today, parseISO(startDate)))
    : null;
  const finishStr = finishDate
    ? format(parseISO(finishDate), "d MMM", { locale })
    : null;

  // Determine current milestone index
  const currentIdx = milestones.findIndex((m) => isAfter(parseISO(m.date), today) || format(parseISO(m.date), "yyyy-MM-dd") === format(today, "yyyy-MM-dd"));
  const activeIdx = currentIdx === -1 ? milestones.length - 1 : Math.max(0, currentIdx);

  return (
    <div>
      <div className="flex justify-between items-baseline mb-2.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          {t("customerView.ribbon.label", "Tidslinje")}
        </span>
        {totalDays && elapsedDays !== null && finishStr && (
          <span className="font-mono text-[11px] text-muted-foreground">
            {t("customerView.ribbon.dayCount", {
              current: Math.min(elapsedDays, totalDays),
              total: totalDays,
              date: finishStr,
              defaultValue: "Dag {{current}} / {{total}} . klart {{date}}",
            })}
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="relative h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500"
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>

      {/* Milestone phase dots */}
      {milestones.length > 0 && (
        <div className="flex justify-between mt-4 overflow-x-auto">
          {milestones.map((m, i) => {
            const isPast = isBefore(parseISO(m.date), today);
            const isCurrent = i === activeIdx;
            const monthStr = format(parseISO(m.date), "MMM", { locale }).toLowerCase();

            return (
              <div key={m.id} className="flex flex-col items-center flex-1 min-w-0">
                <div
                  className={cn(
                    "w-3 h-3 rounded-full",
                    isCurrent && "bg-primary ring-2 ring-background shadow-[0_0_0_2px] shadow-primary",
                    isPast && !isCurrent && "bg-foreground",
                    !isPast && !isCurrent && "bg-muted",
                  )}
                />
                <span className={cn(
                  "text-xs mt-2 text-center truncate max-w-full px-1",
                  (isPast || isCurrent) ? "font-medium text-foreground" : "text-muted-foreground",
                  isCurrent && "font-semibold",
                )}>
                  {m.title}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground mt-0.5 uppercase">
                  {monthStr}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

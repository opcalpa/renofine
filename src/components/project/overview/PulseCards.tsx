import { useTranslation } from "react-i18next";
import { Progress } from "@/components/ui/progress";
import { CheckSquare, Calendar, Wallet, ShoppingCart, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import type { TaskStats, BudgetStats, OrderStats, TimelineStats, OverviewNavigation } from "./types";

interface PulseCardsProps {
  taskStats: TaskStats;
  budgetStats: BudgetStats;
  orderStats: OrderStats;
  timelineStats: TimelineStats;
  navigation: OverviewNavigation;
  currency?: string | null;
  isBuilder?: boolean;
  loading?: boolean;
}

function getTaskColor(percentage: number): string {
  if (percentage >= 75) return "text-green-600 dark:text-green-400";
  if (percentage >= 25) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function getTaskBarColor(percentage: number): string {
  if (percentage >= 75) return "[&>div]:bg-green-500";
  if (percentage >= 25) return "[&>div]:bg-amber-500";
  return "[&>div]:bg-red-500";
}

function getTimelineColor(days: number | null, taskPercentage: number): string {
  if (days === null) return "text-muted-foreground";
  if (days < 7) return "text-red-600 dark:text-red-400";
  if (days <= 30) {
    return taskPercentage < 25
      ? "text-red-600 dark:text-red-400"
      : "text-amber-600 dark:text-amber-400";
  }
  // > 30 days: green unless less than half done
  return taskPercentage < 50
    ? "text-amber-600 dark:text-amber-400"
    : "text-green-600 dark:text-green-400";
}

function getBudgetColor(percentage: number): string {
  if (percentage > 80) return "text-red-600 dark:text-red-400";
  if (percentage >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-green-600 dark:text-green-400";
}

function getBudgetBarColor(percentage: number): string {
  if (percentage > 80) return "[&>div]:bg-red-500";
  if (percentage >= 60) return "[&>div]:bg-amber-500";
  return "[&>div]:bg-green-500";
}

function getOrderColor(count: number): string {
  return count > 0
    ? "text-amber-600 dark:text-amber-400"
    : "text-green-600 dark:text-green-400";
}

export function PulseCards({
  taskStats,
  budgetStats,
  orderStats,
  timelineStats,
  navigation,
  currency,
  isBuilder,
  loading,
}: PulseCardsProps) {
  const { t } = useTranslation();
  const PLACEHOLDER = "—";

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-border">
      {/* Tasks Card */}
      <button
        type="button"
        className="cursor-pointer min-w-0 text-left hover:bg-accent/50 transition-colors"
        onClick={() => navigation.onNavigateToTasks()}
      >
        <div className="p-3 sm:p-4 lg:p-5">
          <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
            <CheckSquare className={`h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 ${getTaskColor(taskStats.percentage)}`} />
            <span className="kicker truncate">
              {t("overview.pulseCards.tasks")}
            </span>
          </div>
          <p className={`text-xl sm:text-2xl font-display font-normal ${loading ? "text-muted-foreground" : getTaskColor(taskStats.percentage)}`}>
            {loading ? PLACEHOLDER : `${taskStats.completed}/${taskStats.total}`}
          </p>
          <Progress
            value={loading ? 0 : taskStats.percentage}
            className={`h-1 sm:h-1.5 mt-1.5 sm:mt-2 ${loading ? "" : getTaskBarColor(taskStats.percentage)}`}
          />
          {!loading && (taskStats.overdue.length > 0 || taskStats.blockedOrOnHold.length > 0) && (
            <div className="flex items-center gap-1 mt-1.5 flex-wrap text-xs">
              <AlertTriangle className="h-3 w-3 shrink-0 text-red-500" />
              {taskStats.overdue.length > 0 && (
                <span className="text-red-600 dark:text-red-400">
                  {t("overview.pulseCards.overdueCount", { count: taskStats.overdue.length })}
                </span>
              )}
              {taskStats.overdue.length > 0 && taskStats.blockedOrOnHold.length > 0 && (
                <span className="text-muted-foreground">·</span>
              )}
              {taskStats.blockedOrOnHold.length > 0 && (
                <span className="text-amber-600 dark:text-amber-400">
                  {t("overview.pulseCards.blockedCount", { count: taskStats.blockedOrOnHold.length })}
                </span>
              )}
            </div>
          )}
        </div>
      </button>

      {/* Timeline Card */}
      <button
        type="button"
        className="cursor-pointer min-w-0 text-left hover:bg-accent/50 transition-colors"
        onClick={() => {
          if (timelineStats.daysRemaining === null) {
            navigation.onOpenSettings();
          } else {
            navigation.onNavigateToTasks();
          }
        }}
      >
        <div className="p-3 sm:p-4 lg:p-5">
          <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
            <Calendar className={`h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 ${getTimelineColor(timelineStats.daysRemaining, taskStats.percentage)}`} />
            <span className="kicker truncate">
              {t("overview.pulseCards.timeline")}
            </span>
          </div>
          {timelineStats.daysRemaining !== null ? (
            <p className={`text-lg sm:text-2xl font-display font-normal truncate ${getTimelineColor(timelineStats.daysRemaining, taskStats.percentage)}`}>
              {timelineStats.daysRemaining < 0
                ? t("overview.pulseCards.daysOverdue", { count: Math.abs(timelineStats.daysRemaining) })
                : t("overview.pulseCards.daysRemaining", { count: timelineStats.daysRemaining })}
            </p>
          ) : (
            <p className="text-sm sm:text-lg text-muted-foreground truncate">
              {t("overview.pulseCards.noDeadlineSet")}
            </p>
          )}
        </div>
      </button>

      {/* Budget Card */}
      <button
        type="button"
        className="cursor-pointer min-w-0 text-left hover:bg-accent/50 transition-colors"
        onClick={() => {
          if (!budgetStats.total && !budgetStats.contractTotal) {
            navigation.onOpenSettings();
          } else {
            navigation.onNavigateToBudget();
          }
        }}
      >
        <div className="p-3 sm:p-4 lg:p-5">
          <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
            <Wallet className={`h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 ${isBuilder && budgetStats.contractTotal > 0 ? "text-foreground" : getBudgetColor(budgetStats.percentage)}`} />
            <span className="kicker truncate">
              {t("overview.pulseCards.budget")}
            </span>
          </div>
          {loading ? (
            <p className="text-base sm:text-lg font-display font-normal text-muted-foreground">
              {PLACEHOLDER}
            </p>
          ) : isBuilder && budgetStats.contractTotal > 0 ? (
            <>
              <p className="text-base sm:text-lg font-display font-normal truncate">
                {formatCurrency(budgetStats.contractTotal, currency, { compact: true })}
              </p>
              <p className="text-xs sm:text-sm text-muted-foreground truncate mt-0.5">
                {t("overview.pulseCards.invoiced")} {formatCurrency(budgetStats.invoicedTotal, currency, { compact: true })} ({budgetStats.invoicedPercent}%)
              </p>
              {budgetStats.estimatedProfit > 0 && (
                <p className="text-xs sm:text-sm text-green-600 dark:text-green-400 truncate">
                  {t("overview.pulseCards.estProfit")} ~{formatCurrency(budgetStats.estimatedProfit, currency, { compact: true })}
                </p>
              )}
              <Progress
                value={Math.min(budgetStats.invoicedPercent, 100)}
                className="h-1 sm:h-1.5 mt-1.5 sm:mt-2 [&>div]:bg-green-500"
              />
            </>
          ) : budgetStats.total ? (
            <>
              <p className={`text-base sm:text-lg font-display font-normal truncate ${getBudgetColor(budgetStats.percentage)}`}>
                {formatCurrency(budgetStats.spent, currency, { compact: true })}
                <span className="text-xs sm:text-sm font-normal text-muted-foreground">
                  {" / "}
                  {formatCurrency(budgetStats.total, currency, { compact: true })}
                </span>
              </p>
              <Progress
                value={Math.min(budgetStats.percentage, 100)}
                className={`h-1 sm:h-1.5 mt-1.5 sm:mt-2 ${getBudgetBarColor(budgetStats.percentage)}`}
              />
              {budgetStats.isWarning && (
                <div className="flex items-center gap-1 mt-1.5 text-xs">
                  <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500" />
                  <span className="text-amber-600 dark:text-amber-400">
                    {t("overview.pulseCards.budgetAt", { percentage: Math.round(budgetStats.percentage) })}
                  </span>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm sm:text-lg text-muted-foreground truncate">
              {t("overview.pulseCards.noBudgetSet")}
            </p>
          )}
        </div>
      </button>

      {/* Orders Card */}
      <button
        type="button"
        className="cursor-pointer min-w-0 text-left hover:bg-accent/50 transition-colors"
        onClick={() => navigation.onNavigateToPurchases()}
      >
        <div className="p-3 sm:p-4 lg:p-5">
          <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
            <ShoppingCart className={`h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 ${getOrderColor(orderStats.pendingCount)}`} />
            <span className="kicker truncate">
              {t("overview.pulseCards.orders")}
            </span>
          </div>
          <p className={`text-xl sm:text-2xl font-display font-normal ${loading ? "text-muted-foreground" : getOrderColor(orderStats.pendingCount)}`}>
            {loading ? PLACEHOLDER : orderStats.pendingCount}
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1 truncate">
            {loading
              ? " "
              : orderStats.pendingCount > 0
              ? t("overview.pulseCards.needsReview")
              : t("overview.pulseCards.noPending")}
          </p>
        </div>
      </button>
      </div>
    </div>
  );
}

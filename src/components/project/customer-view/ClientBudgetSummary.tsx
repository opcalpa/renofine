import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import type { BudgetStats } from "../overview/types";

interface ClientBudgetSummaryProps {
  budgetStats: BudgetStats;
  currency?: string | null;
}

export function ClientBudgetSummary({ budgetStats, currency }: ClientBudgetSummaryProps) {
  const { t } = useTranslation();
  const { total, spent, percentage } = budgetStats;

  if (!total) return null;

  const remaining = total - spent;
  const remainingStr = formatCurrency(remaining, currency, { compact: true });
  const totalStr = formatCurrency(total, currency, { compact: true });
  const spentStr = formatCurrency(spent, currency, { compact: true, showSymbol: false });
  const totalNoSymbol = formatCurrency(total, currency, { compact: true, showSymbol: false });

  const barColor = percentage > 80 ? "bg-red-500" : percentage > 60 ? "bg-amber-500" : "bg-primary";

  return (
    <div className="py-7 border-t border-b border-border/60">
      <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground mb-4">
        {t("customerView.budgetSummary.label", "Er budget")}
      </div>
      <div className="flex flex-col md:flex-row md:items-baseline gap-4 md:gap-6 mb-3.5">
        <div>
          <div className="font-display tabular-nums text-4xl md:text-[44px] font-normal tracking-[-0.025em] leading-[1]">
            {spentStr}<span className="text-muted-foreground/50"> / {totalNoSymbol}</span>
          </div>
          <div className="font-mono text-[11px] text-muted-foreground mt-1.5">
            {t("customerView.budgetSummary.unit", "använda av total")}
          </div>
        </div>
        <div className="flex-1 md:pl-6 md:border-l md:border-border/60">
          <p className="text-sm text-muted-foreground leading-relaxed max-w-[480px]">
            {percentage <= 80
              ? t("customerView.budgetSummary.onTrack", {
                  remaining: remainingStr,
                  defaultValue: "Budgeten \u00e4r i fas. Ni har \u00e4nnu {{remaining}} kvar f\u00f6r resterande arbeten.",
                })
              : t("customerView.budgetSummary.warning", {
                  remaining: remainingStr,
                  total: totalStr,
                  defaultValue: "Budgeten n\u00e4rmar sig taket. {{remaining}} kvar av {{total}}.",
                })}
          </p>
        </div>
      </div>
      <div className="h-1 bg-muted rounded-full overflow-hidden mt-3">
        <div
          className={cn("h-full rounded-full transition-all duration-500", barColor)}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  );
}

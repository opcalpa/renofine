// Simplified read-only budget view shown to clients/viewers. Tasks/materials
// breakdown + total progress bar, no editing controls. Mounted from BudgetTab
// when isReadOnly is set.

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/currency";
import type { BudgetRow } from "./shared/types";
import type { BudgetTotals } from "./shared/useBudgetFilters";

export interface ReadOnlyBudgetViewProps {
  rows: BudgetRow[];
  totals: BudgetTotals;
  projectBudget: number;
  extraTotal: number;
  currency?: string | null;
}

export function ReadOnlyBudgetView({
  rows,
  totals,
  projectBudget,
  extraTotal,
  currency,
}: ReadOnlyBudgetViewProps): ReactNode {
  const { t } = useTranslation();

  const totalSpent = totals.paid;
  const spentPercent = projectBudget > 0
    ? Math.min(Math.round((totalSpent / projectBudget) * 100), 100)
    : 0;
  const remaining = projectBudget - totalSpent;
  const taskTotal = rows.filter(r => r.type === "task").reduce((s, r) => s + r.budget, 0);
  const materialTotal = rows.filter(r => r.type === "material").reduce((s, r) => s + r.budget, 0);

  return (
    <div className="space-y-5 sm:space-y-8">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('budget.title')}</h2>

      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{t('budget.simpleTotalBudget', 'Total budget')}</p>
            <p className="text-3xl font-bold">{formatCurrency(projectBudget, currency)}</p>
          </div>
          <p className="text-lg font-semibold text-muted-foreground">{spentPercent}%</p>
        </div>
        <Progress value={spentPercent} className="h-3" />
        <div className="grid grid-cols-2 gap-4 pt-2">
          <div>
            <p className="text-sm text-muted-foreground">{t('budget.simpleSpent', 'Spent')}</p>
            <p className="text-xl font-semibold">{formatCurrency(totalSpent, currency)}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">{t('budget.simpleRemaining', 'Remaining')}</p>
            <p className={`text-xl font-semibold ${remaining < 0 ? "text-destructive" : ""}`}>
              {formatCurrency(remaining, currency)}
            </p>
          </div>
        </div>
      </div>

      {(taskTotal > 0 || materialTotal > 0) && (
        <div className="rounded-xl border bg-card p-6 space-y-3">
          <p className="text-sm font-medium text-muted-foreground">{t('budget.simpleBreakdown', 'Breakdown')}</p>
          {taskTotal > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm">{t('budget.simpleTasks', 'Work & services')}</span>
              <span className="font-medium">{formatCurrency(taskTotal, currency)}</span>
            </div>
          )}
          {materialTotal > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm">{t('budget.simpleMaterials', 'Materials & purchases')}</span>
              <span className="font-medium">{formatCurrency(materialTotal, currency)}</span>
            </div>
          )}
          {extraTotal > 0 && (
            <>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t('budget.simpleExtra', 'Outside budget')}</span>
                <span className="font-medium text-muted-foreground">{formatCurrency(extraTotal, currency)}</span>
              </div>
            </>
          )}
        </div>
      )}

      {rows.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <p>{t('budget.simpleEmpty', 'No budget items yet. Your project manager will add costs as work progresses.')}</p>
        </div>
      )}
    </div>
  );
}

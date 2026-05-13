// Pure-function cell renderers extracted from BudgetTab.tsx. Each renderer
// takes a column def and a context object; the caller builds the context once
// per render and passes it to each call. Keeping these as plain functions
// (not React components) means the parent's render decides when to re-run —
// React.memo isn't useful here since cells render in a tight loop.
//
// Owner and Contractor shells will both call into these once the budget split
// is done; for now BudgetTab is the only caller.

import type { ReactNode } from "react";
import type { TFunction } from "i18next";
import { formatCurrency } from "@/lib/currency";
import type { BudgetRow, ColumnDef } from "./types";
import type { BudgetTotals } from "./useBudgetFilters";

export interface FooterCellContext {
  totals: BudgetTotals;
  filtered: BudgetRow[];
  rows: BudgetRow[];
  isBuilder: boolean;
  currency?: string | null;
  t: TFunction;
}

export function renderFooterCell(col: ColumnDef, ctx: FooterCellContext): ReactNode {
  const { totals, filtered, rows, isBuilder, currency, t } = ctx;
  switch (col.key) {
    case "name":
      return <span className="font-bold">{t('budget.totals')}</span>;
    case "budget":
      return <span className="font-bold">{formatCurrency(totals.budget, currency)}</span>;
    case "consumed":
      return totals.consumed > 0
        ? <span className="font-bold">{formatCurrency(totals.consumed, currency)}</span>
        : null;
    case "paid":
      // Homeowner: sum of actual payments only; Builder: sum of effective costs
      return <span className="font-bold">{formatCurrency(isBuilder ? totals.cost : totals.paid, currency)}</span>;
    case "remaining": {
      if (isBuilder) {
        const totalResult = totals.budget - totals.cost;
        return (
          <span className={`font-bold ${totalResult < 0 ? "text-destructive" : totalResult > 0 ? "text-green-600" : ""}`}>
            {formatCurrency(totalResult, currency)}
          </span>
        );
      }
      // Homeowner: sum of (quoted - paid) for tasks + budget posts only — skip purchase rows
      const totalOutstanding = filtered.reduce((sum, r) => {
        if (r.type === "purchase") return sum;
        const quoted = r.budget > 0 ? r.budget : r.estimatedCost;
        return sum + (quoted > 0 ? quoted - r.paid : 0);
      }, 0);
      return (
        <span className={`font-bold ${totalOutstanding < 0 ? "text-destructive" : totalOutstanding > 0 ? "text-amber-600" : "text-green-600"}`}>
          {formatCurrency(totalOutstanding, currency)}
        </span>
      );
    }
    case "margin": {
      const totalResult = totals.budget - totals.cost;
      const totalMargin = totals.budget > 0 ? Math.round((totalResult / totals.budget) * 100) : 0;
      let colorClass = "";
      if (totalMargin < 0) colorClass = "text-destructive";
      else if (totalMargin === 0) colorClass = "text-muted-foreground";
      else if (totalMargin < 15) colorClass = "text-amber-500";
      else if (totalMargin >= 30) colorClass = "text-green-600";
      return <span className={`font-bold ${colorClass}`}>{totalMargin}%</span>;
    }
    case "matBudget":
      return <span className="font-bold">{formatCurrency(totals.matBudget, currency)}</span>;
    case "matConsumed":
      return <span className="font-bold">{formatCurrency(totals.matConsumed, currency)}</span>;
    case "matRemaining": {
      const totalMatRemaining = totals.matBudget - totals.matConsumed;
      const matPctLeft = totals.matBudget > 0 ? totalMatRemaining / totals.matBudget : 0;
      let matFooterColor = "text-green-600";
      if (matPctLeft <= 0) matFooterColor = "text-destructive";
      else if (matPctLeft <= 0.2) matFooterColor = "text-amber-500";
      return <span className={`font-bold ${totals.matBudget > 0 ? matFooterColor : ""}`}>{formatCurrency(totalMatRemaining, currency)}</span>;
    }
    case "rotAmount": {
      const totalRot = rows.filter(r => r.type === "task").reduce((sum, r) => sum + (r.rotAmount ?? 0), 0);
      return totalRot > 0 ? <span className="font-bold text-green-700">{formatCurrency(totalRot, currency)}</span> : null;
    }
    default:
      return null;
  }
}

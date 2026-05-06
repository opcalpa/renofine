import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, BarChart3, ExternalLink } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";

interface FinancialAnalysisSectionProps {
  projects: { id: string; name: string; created_at: string; status?: string }[];
  financials: Record<string, { budget: number; profit: number; tasksDone?: number; tasksTotal?: number; spentAmount?: number }>;
  currency?: string | null;
}

export function FinancialAnalysisSection({
  projects,
  financials,
  currency,
}: FinancialAnalysisSectionProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useState(false);
  const [invoicedByProject, setInvoicedByProject] = useState<Record<string, number>>({});

  // Fetch invoice totals when expanded
  useEffect(() => {
    if (!isExpanded || projects.length === 0) return;
    const fetchInvoices = async () => {
      const pids = projects.map((p) => p.id);
      const { data } = await supabase
        .from("invoices")
        .select("project_id, total_amount, status")
        .in("project_id", pids)
        .in("status", ["sent", "paid", "partially_paid"]);
      if (data) {
        const map: Record<string, number> = {};
        for (const inv of data) {
          map[inv.project_id] = (map[inv.project_id] || 0) + (inv.total_amount || 0);
        }
        setInvoicedByProject(map);
      }
    };
    fetchInvoices();
  }, [isExpanded, projects]);

  const withBudget = useMemo(
    () => projects.filter((p) => financials[p.id]?.budget > 0),
    [projects, financials]
  );

  const totals = useMemo(() => {
    let budget = 0;
    let profit = 0;
    let invoiced = 0;
    for (const p of withBudget) {
      budget += financials[p.id]?.budget ?? 0;
      profit += financials[p.id]?.profit ?? 0;
      invoiced += invoicedByProject[p.id] ?? 0;
    }
    const margin = budget > 0 ? Math.round((profit / budget) * 100) : 0;
    const invoicedPct = budget > 0 ? Math.round((invoiced / budget) * 100) : 0;
    return { budget, profit, margin, invoiced, invoicedPct, count: withBudget.length };
  }, [withBudget, financials, invoicedByProject]);

  const projectRows = useMemo(
    () =>
      withBudget
        .map((p) => {
          const fin = financials[p.id];
          const inv = invoicedByProject[p.id] ?? 0;
          const margin = fin.budget > 0 ? Math.round((fin.profit / fin.budget) * 100) : 0;
          const invPct = fin.budget > 0 ? Math.round((inv / fin.budget) * 100) : 0;
          return { id: p.id, name: p.name, budget: fin.budget, profit: fin.profit, margin, invoiced: inv, invoicedPct: invPct };
        })
        .sort((a, b) => b.budget - a.budget),
    [withBudget, financials, invoicedByProject]
  );

  const maxBudget = projectRows[0]?.budget || 1;

  const fmt = (v: number) => formatCurrency(v, currency, { compact: true });

  return (
    <section className="border rounded-lg bg-card">
      {/* Collapsible header */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <BarChart3 className="h-4 w-4" />
          {t("financialAnalysis.title")}
          {!isExpanded && totals.count > 0 && (
            <span className="text-xs text-muted-foreground font-normal ml-2">
              {totals.count} {t("financialAnalysis.projects")} · {fmt(totals.budget)}
            </span>
          )}
        </span>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {isExpanded && (
        <div className="border-t">
          {/* Key metrics strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0">
            {/* Total budget */}
            <div className="px-4 py-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{t("financialAnalysis.totalBudget")}</p>
              <p className="text-lg font-semibold tabular-nums">{fmt(totals.budget)}</p>
            </div>
            {/* Invoiced */}
            <div className="px-4 py-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{t("financialAnalysis.invoiced", "Fakturerat")}</p>
              <p className="text-lg font-semibold tabular-nums">{fmt(totals.invoiced)}</p>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${totals.invoicedPct}%` }} />
                </div>
                <span className="text-[10px] tabular-nums text-muted-foreground">{totals.invoicedPct}%</span>
              </div>
            </div>
            {/* Profit */}
            <div className="px-4 py-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{t("financialAnalysis.totalProfit")}</p>
              <p className={`text-lg font-semibold tabular-nums ${totals.profit > 0 ? "text-emerald-600" : totals.profit < 0 ? "text-destructive" : ""}`}>
                {fmt(totals.profit)}
              </p>
            </div>
            {/* Margin */}
            <div className="px-4 py-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{t("financialAnalysis.margin")}</p>
              <p className={`text-lg font-semibold tabular-nums ${totals.margin > 0 ? "text-emerald-600" : totals.margin < 0 ? "text-destructive" : ""}`}>
                {totals.margin}%
              </p>
            </div>
          </div>

          {/* Per-project table */}
          {projectRows.length > 0 && (
            <div className="border-t">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2 text-left font-medium">{t("common.project", "Projekt")}</th>
                    <th className="px-4 py-2 text-right font-medium hidden sm:table-cell">{t("financialAnalysis.totalBudget")}</th>
                    <th className="px-4 py-2 text-right font-medium">{t("financialAnalysis.invoiced", "Fakturerat")}</th>
                    <th className="px-4 py-2 text-right font-medium hidden sm:table-cell">{t("financialAnalysis.totalProfit")}</th>
                    <th className="px-4 py-2 text-right font-medium w-16">{t("financialAnalysis.margin")}</th>
                    <th className="px-4 py-2 w-24 hidden md:table-cell"><span className="sr-only">Bar</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {projectRows.map((row) => (
                    <tr
                      key={row.id}
                      className="hover:bg-muted/30 transition-colors cursor-pointer group"
                      onClick={() => navigate(`/projects/${row.id}`)}
                    >
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-1.5 font-medium truncate max-w-[200px]">
                          {row.name}
                          <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums hidden sm:table-cell">{fmt(row.budget)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {fmt(row.invoiced)}
                        <span className="text-muted-foreground text-xs ml-1">/ {fmt(row.budget)}</span>
                      </td>
                      <td className={`px-4 py-2.5 text-right tabular-nums hidden sm:table-cell ${row.profit > 0 ? "text-emerald-600" : row.profit < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                        {fmt(row.profit)}
                      </td>
                      <td className={`px-4 py-2.5 text-right tabular-nums ${row.margin > 0 ? "text-emerald-600" : row.margin < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                        {row.margin}%
                      </td>
                      <td className="px-4 py-2.5 hidden md:table-cell">
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary/60 rounded-full"
                            style={{ width: `${Math.round((row.budget / maxBudget) * 100)}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totals.count === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {t("financialAnalysis.noData", "Inga projekt med budget ännu")}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/currency";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertTriangle,
  MessageSquare,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";

interface DashboardStripProps {
  projectIds: string[];
  currency?: string;
}

interface ProjectStat {
  projectId: string;
  projectName: string;
  count: number;
  items: string[]; // individual item names for tooltip detail
}

interface BudgetStat {
  projectName: string;
  budget: number;
  spent: number;
}

interface StripData {
  overdueTasks: ProjectStat[];
  recentComments: ProjectStat[];
  pendingPurchases: ProjectStat[];
  budgetByProject: BudgetStat[];
  totalBudget: number;
  totalSpent: number;
}

export function DashboardStrip({ projectIds, currency = "SEK" }: DashboardStripProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-strip", projectIds],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];

      const [overdueRes, commentsRes, purchasesRes, budgetRes] = await Promise.all([
        supabase
          .from("tasks")
          .select("id, title, project_id, due_date, finish_date, status, projects!inner(name)")
          .in("project_id", projectIds)
          .neq("status", "completed"),
        supabase
          .from("comments")
          .select("id, content, project_id, projects!inner(name)")
          .in("project_id", projectIds)
          .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString()),
        supabase
          .from("materials")
          .select("id, name, project_id, projects!inner(name)")
          .in("project_id", projectIds)
          .eq("status", "to_order"),
        supabase
          .from("projects")
          .select("id, name, contract_value, spent_amount")
          .in("id", projectIds),
      ]);

      function groupByProject(
        rows: Array<{ project_id: string; projects: unknown; [k: string]: unknown }>,
        itemNameKey: string
      ) {
        const map = new Map<string, { name: string; count: number; items: string[] }>();
        for (const row of rows) {
          const entry = map.get(row.project_id) || {
            name: (row.projects as { name: string })?.name || "",
            count: 0,
            items: [],
          };
          entry.count++;
          const itemName = row[itemNameKey] as string | undefined;
          if (itemName && entry.items.length < 5) {
            entry.items.push(itemName.length > 40 ? itemName.slice(0, 40) + "…" : itemName);
          }
          map.set(row.project_id, entry);
        }
        return Array.from(map.entries()).map(([projectId, v]) => ({
          projectId,
          projectName: v.name,
          count: v.count,
          items: v.items,
        }));
      }

      const budgetByProject: BudgetStat[] = [];
      let totalBudget = 0;
      let totalSpent = 0;
      for (const p of budgetRes.data || []) {
        const b = p.contract_value || 0;
        const s = p.spent_amount || 0;
        if (b > 0 || s > 0) {
          budgetByProject.push({ projectName: p.name, budget: b, spent: s });
        }
        totalBudget += b;
        totalSpent += s;
      }

      // Filter overdue in JS: due_date OR finish_date < today, matching PulseCards logic
      const overdueTasks = (overdueRes.data || []).filter((t) => {
        const effectiveDate = (t as Record<string, unknown>).due_date || (t as Record<string, unknown>).finish_date;
        return effectiveDate && String(effectiveDate) < today;
      });

      return {
        overdueTasks: groupByProject(overdueTasks as Array<{ project_id: string; projects: unknown; title: string }>, "title"),
        recentComments: groupByProject(commentsRes.data || [], "content"),
        pendingPurchases: groupByProject(purchasesRes.data || [], "name"),
        budgetByProject,
        totalBudget,
        totalSpent,
      } satisfies StripData;
    },
    enabled: projectIds.length >= 2,
    staleTime: 60 * 1000,
  });

  const totalOverdue = useMemo(() => data?.overdueTasks.reduce((s, p) => s + p.count, 0) ?? 0, [data]);
  const totalComments = useMemo(() => data?.recentComments.reduce((s, p) => s + p.count, 0) ?? 0, [data]);
  const totalPurchases = useMemo(() => data?.pendingPurchases.reduce((s, p) => s + p.count, 0) ?? 0, [data]);

  if (projectIds.length < 2) return null;

  if (isLoading || !data) return (
    <div className="rounded-xl border bg-card overflow-hidden mb-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-border">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="p-4 lg:p-5 animate-pulse">
            <div className="h-3 w-20 rounded bg-muted mb-3" />
            <div className="h-7 w-12 rounded bg-muted mb-1" />
            <div className="h-3 w-28 rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );

  const hasContent = totalOverdue > 0 || totalComments > 0 || totalPurchases > 0 || data.totalBudget > 0;
  if (!hasContent) return null;

  const budgetPct = data.totalBudget > 0 ? Math.round((data.totalSpent / data.totalBudget) * 100) : 0;

  return (
    <div className="rounded-xl border bg-card overflow-hidden mb-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-border">
      {/* Overdue tasks */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => {
              const first = data.overdueTasks[0];
              if (first) navigate(`/projects/${first.projectId}?tab=tasks`);
            }}
            className="p-4 lg:p-5 text-left hover:bg-accent/50 transition-colors"
          >
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className={`h-4 w-4 ${totalOverdue > 0 ? "text-red-500" : "text-green-500"}`} />
              <span className="kicker">
                {t("dashboard.overdue")}
              </span>
            </div>
            {totalOverdue > 0 ? (
              <>
                <p className="text-2xl font-display font-normal tabular-nums text-red-600">{totalOverdue}</p>
                <p className="text-xs text-muted-foreground mt-1 truncate">
                  {data.overdueTasks.map((p) => `${p.projectName} (${p.count})`).join(", ")}
                </p>
              </>
            ) : (
              <>
                <p className="text-2xl font-display font-normal tabular-nums text-green-600">0</p>
                <p className="text-xs text-muted-foreground mt-1">{t("dashboard.allOnTrack")}</p>
              </>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          {totalOverdue > 0 ? (
            <div className="space-y-2">
              <p className="font-medium text-sm">{t("dashboard.overdueTooltip")}</p>
              {data.overdueTasks.map((p) => (
                <div key={p.projectId}>
                  <div className="flex justify-between gap-4 text-xs font-medium">
                    <span className="truncate">{p.projectName}</span>
                    <span className="tabular-nums text-red-400">{p.count}</span>
                  </div>
                  {p.items.length > 0 && (
                    <ul className="mt-1 space-y-1">
                      {p.items.map((item, i) => (
                        <li key={i} className="text-xs text-muted-foreground truncate pl-2">· {item}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm">{t("dashboard.overdueTooltipNone")}</p>
          )}
        </TooltipContent>
      </Tooltip>

      {/* Recent comments */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => {
              const first = data.recentComments[0];
              if (first) navigate(`/projects/${first.projectId}?tab=overview`);
            }}
            className="p-4 lg:p-5 text-left hover:bg-accent/50 transition-colors"
          >
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className={`h-4 w-4 ${totalComments > 0 ? "text-blue-500" : "text-muted-foreground"}`} />
              <span className="kicker">
                {t("dashboard.comments")}
              </span>
            </div>
            {totalComments > 0 ? (
              <>
                <p className="text-2xl font-display font-normal tabular-nums">{totalComments}</p>
                <p className="text-xs text-muted-foreground mt-1 truncate">{t("dashboard.lastWeek")}</p>
              </>
            ) : (
              <>
                <p className="text-2xl font-display font-normal tabular-nums text-muted-foreground">0</p>
                <p className="text-xs text-muted-foreground mt-1">{t("dashboard.noRecent")}</p>
              </>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          {totalComments > 0 ? (
            <div className="space-y-2">
              <p className="font-medium text-sm">{t("dashboard.commentsTooltip")}</p>
              {data.recentComments.map((p) => (
                <div key={p.projectId}>
                  <div className="flex justify-between gap-4 text-xs font-medium">
                    <span className="truncate">{p.projectName}</span>
                    <span className="tabular-nums">{p.count}</span>
                  </div>
                  {p.items.length > 0 && (
                    <ul className="mt-1 space-y-1">
                      {p.items.map((item, i) => (
                        <li key={i} className="text-xs text-muted-foreground truncate pl-2">· {item}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm">{t("dashboard.commentsTooltipNone")}</p>
          )}
        </TooltipContent>
      </Tooltip>

      {/* Pending purchases */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => {
              const first = data.pendingPurchases[0];
              if (first) navigate(`/projects/${first.projectId}?tab=purchases`);
            }}
            className="p-4 lg:p-5 text-left hover:bg-accent/50 transition-colors"
          >
            <div className="flex items-center gap-2 mb-2">
              <ShoppingCart className={`h-4 w-4 ${totalPurchases > 0 ? "text-amber-500" : "text-muted-foreground"}`} />
              <span className="kicker">
                {t("dashboard.purchases")}
              </span>
            </div>
            {totalPurchases > 0 ? (
              <>
                <p className="text-2xl font-display font-normal tabular-nums text-amber-600">{totalPurchases}</p>
                <p className="text-xs text-muted-foreground mt-1 truncate">
                  {data.pendingPurchases.map((p) => `${p.projectName} (${p.count})`).join(", ")}
                </p>
              </>
            ) : (
              <>
                <p className="text-2xl font-display font-normal tabular-nums text-muted-foreground">0</p>
                <p className="text-xs text-muted-foreground mt-1">{t("dashboard.noPending")}</p>
              </>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          {totalPurchases > 0 ? (
            <div className="space-y-2">
              <p className="font-medium text-sm">{t("dashboard.purchasesTooltip")}</p>
              {data.pendingPurchases.map((p) => (
                <div key={p.projectId}>
                  <div className="flex justify-between gap-4 text-xs font-medium">
                    <span className="truncate">{p.projectName}</span>
                    <span className="tabular-nums text-amber-400">{p.count}</span>
                  </div>
                  {p.items.length > 0 && (
                    <ul className="mt-1 space-y-1">
                      {p.items.map((item, i) => (
                        <li key={i} className="text-xs text-muted-foreground truncate pl-2">· {item}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm">{t("dashboard.purchasesTooltipNone")}</p>
          )}
        </TooltipContent>
      </Tooltip>

      {/* Budget overview */}
      {data.totalBudget > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="p-4 lg:p-5">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className={`h-4 w-4 ${budgetPct > 90 ? "text-red-500" : budgetPct > 70 ? "text-amber-500" : "text-green-500"}`} />
                <span className="kicker">
                  {t("dashboard.budget")}
                </span>
              </div>
              <p className="text-2xl font-display font-normal tabular-nums">
                {formatCurrency(data.totalSpent, currency)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                / {formatCurrency(data.totalBudget, currency)}
              </p>
              <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden mt-2">
                <div
                  className={`h-full rounded-full transition-all ${
                    budgetPct > 90 ? "bg-red-500" : budgetPct > 70 ? "bg-amber-500" : "bg-green-500"
                  }`}
                  style={{ width: `${Math.min(budgetPct, 100)}%` }}
                />
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <div className="space-y-1.5">
              <p className="font-medium text-sm">{t("dashboard.budgetTooltip")}</p>
              {data.budgetByProject.map((p) => (
                <div key={p.projectName} className="flex justify-between gap-4 text-xs">
                  <span className="truncate">{p.projectName}</span>
                  <span className="tabular-nums">
                    {formatCurrency(p.spent, currency)}
                    <span className="text-muted-foreground"> / {formatCurrency(p.budget, currency)}</span>
                  </span>
                </div>
              ))}
              <div className="border-t pt-1.5 flex justify-between text-xs font-medium">
                <span>{t("common.total")}</span>
                <span className="tabular-nums">{budgetPct}%</span>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      )}
      </div>
    </div>
  );
}

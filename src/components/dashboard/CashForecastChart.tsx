/**
 * CashForecastChart — 8-week cash flow visualization.
 * Shows 4 weeks past + 4 weeks future, with invoice inflow
 * vs material/purchase outflow bucketed by ISO week.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { formatLocalDate } from "@/lib/dateUtils";

interface CashForecastChartProps {
  projectIds: string[];
}

interface WeekBucket {
  week: number;
  year: number;
  label: string;
  inflow: number;
  outflow: number;
  net: number;
  isFuture: boolean;
}

function getISOWeek(date: Date): { week: number; year: number } {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + yearStart.getDay() + 1) / 7);
  return { week, year: d.getFullYear() };
}

function getWeekStart(year: number, week: number): Date {
  const jan1 = new Date(year, 0, 1);
  const dayOfWeek = jan1.getDay() || 7;
  const firstMonday = new Date(year, 0, 1 + (8 - dayOfWeek) % 7);
  const d = new Date(firstMonday);
  d.setDate(d.getDate() + (week - 1) * 7);
  return d;
}

function buildWeekBuckets(): WeekBucket[] {
  const now = new Date();
  const current = getISOWeek(now);
  const buckets: WeekBucket[] = [];

  for (let offset = -3; offset <= 4; offset++) {
    const d = new Date(now);
    d.setDate(d.getDate() + offset * 7);
    const { week, year } = getISOWeek(d);
    buckets.push({
      week,
      year,
      label: `v.${week}`,
      inflow: 0,
      outflow: 0,
      net: 0,
      isFuture: offset > 0,
    });
  }

  return buckets;
}

function bucketKey(week: number, year: number): string {
  return `${year}-${week}`;
}

export function CashForecastChart({ projectIds }: CashForecastChartProps) {
  const { t } = useTranslation();
  const [buckets, setBuckets] = useState<WeekBucket[]>(buildWeekBuckets);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (projectIds.length === 0) {
      setLoading(false);
      return;
    }

    async function fetchData() {
      const weekBuckets = buildWeekBuckets();
      const bucketMap = new Map<string, WeekBucket>();
      for (const b of weekBuckets) {
        bucketMap.set(bucketKey(b.week, b.year), b);
      }

      // Date range: 4 weeks back to 4 weeks forward
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 28);
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 35);

      const startStr = formatLocalDate(startDate);
      const endStr = formatLocalDate(endDate);

      // Inflow: invoices with due_date or paid_at in range
      const { data: invoices } = await supabase
        .from("invoices")
        .select("total_amount, paid_amount, due_date, paid_at, status")
        .in("project_id", projectIds)
        .in("status", ["sent", "paid", "partially_paid"]);

      if (invoices) {
        for (const inv of invoices) {
          const dateStr = inv.paid_at || inv.due_date;
          if (!dateStr) continue;
          const date = new Date(dateStr);
          if (date < startDate || date > endDate) continue;

          const { week, year } = getISOWeek(date);
          const key = bucketKey(week, year);
          const bucket = bucketMap.get(key);
          if (bucket) {
            const amount = inv.status === "paid"
              ? (inv.total_amount || 0)
              : (inv.total_amount || 0) - (inv.paid_amount || 0);
            bucket.inflow += amount;
          }
        }
      }

      // Outflow: materials/purchases with created_at or paid_date in range
      const { data: materials } = await supabase
        .from("materials")
        .select("cost, quantity, price_per_unit, created_at, paid_date")
        .in("project_id", projectIds);

      if (materials) {
        for (const mat of materials) {
          const dateStr = mat.paid_date || mat.created_at;
          if (!dateStr) continue;
          const date = new Date(dateStr);
          if (date < startDate || date > endDate) continue;

          const { week, year } = getISOWeek(date);
          const key = bucketKey(week, year);
          const bucket = bucketMap.get(key);
          if (bucket) {
            const amount = mat.cost || ((mat.price_per_unit || 0) * (mat.quantity || 1));
            bucket.outflow += amount;
          }
        }
      }

      // Calculate net
      for (const b of weekBuckets) {
        b.net = b.inflow - b.outflow;
      }

      setBuckets(weekBuckets);
      setLoading(false);
    }

    fetchData();
  }, [projectIds]);

  const totalInflow = buckets.reduce((s, b) => s + b.inflow, 0);
  const totalOutflow = buckets.reduce((s, b) => s + b.outflow, 0);
  const totalNet = totalInflow - totalOutflow;

  // Bar heights: use absolute net values, scale to max
  const maxAbs = Math.max(...buckets.map(b => Math.abs(b.net)), 1);

  // If no data at all, don't render
  if (!loading && totalInflow === 0 && totalOutflow === 0) return null;

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 sm:p-5">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
        {t("cashForecast.kicker", "Nästa 30 dagar")}
      </div>
      <div className="text-base font-medium tracking-tight mb-3">
        {t("cashForecast.title", "Likviditetsprognos")}
      </div>

      {/* Net flow hero */}
      <div className="flex items-baseline gap-2">
        <span
          className="font-display text-[30px] font-normal tracking-tight leading-none tnum"
          style={{ color: totalNet >= 0 ? "var(--primary, hsl(var(--primary)))" : "var(--danger, hsl(var(--destructive)))" }}
        >
          {totalNet >= 0 ? "+" : ""}{Math.round(totalNet / 1000)}
        </span>
        <span className="font-mono text-xs text-muted-foreground">
          {t("cashForecast.unit", "tkr nettoflöde")}
        </span>
      </div>

      {/* Bar chart */}
      <div className="flex items-end gap-[3px] h-[60px] mt-4">
        {buckets.map((b, i) => {
          const absNet = Math.abs(b.net);
          const heightPct = maxAbs > 0 ? Math.max((absNet / maxAbs) * 100, 4) : 4;
          const isNegative = b.net < 0;
          return (
            <div
              key={i}
              className="flex-1 rounded-sm transition-all"
              style={{
                height: `${heightPct}%`,
                background: isNegative
                  ? "var(--danger, hsl(var(--destructive)))"
                  : b.isFuture
                    ? "var(--primary, hsl(var(--primary)))"
                    : "var(--surface-2, hsl(var(--muted)))",
                opacity: b.isFuture ? 1 : 0.7,
              }}
              title={`${b.label}: ${b.net >= 0 ? "+" : ""}${Math.round(b.net / 1000)}k`}
            />
          );
        })}
      </div>

      {/* Week labels */}
      <div className="flex justify-between mt-2 font-mono text-[9.5px] text-muted-foreground">
        <span>{buckets[0]?.label}</span>
        <span>{buckets[Math.floor(buckets.length / 2)]?.label}</span>
        <span>{buckets[buckets.length - 1]?.label}</span>
      </div>

      {/* Divider */}
      <div className="h-px bg-border/60 my-3" />

      {/* Summary */}
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{t("cashForecast.inflow", "Inflöde fakturor")}</span>
        <span className="font-mono tnum text-foreground">
          +{Math.round(totalInflow / 1000)} {t("cashForecast.tkr", "tkr")}
        </span>
      </div>
      <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
        <span>{t("cashForecast.outflow", "Utflöde material")}</span>
        <span className="font-mono tnum text-foreground">
          −{Math.round(totalOutflow / 1000)} {t("cashForecast.tkr", "tkr")}
        </span>
      </div>
    </div>
  );
}

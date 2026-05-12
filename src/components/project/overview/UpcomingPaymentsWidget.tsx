import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, Clock, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";

interface UnpaidInvoicePO {
  id: string;
  vendor_name: string;
  total: number;
  invoice_due_date: string | null;
  invoice_number: string | null;
}

interface UpcomingPaymentsWidgetProps {
  projectId: string;
  currency: string;
  onNavigateToPurchases?: () => void;
}

function daysUntil(dateStr: string): number {
  const due = new Date(dateStr);
  const now = new Date();
  due.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatRelativeDate(dateStr: string, t: (key: string, fallback?: string, opts?: Record<string, unknown>) => string): string {
  const days = daysUntil(dateStr);
  if (days < 0) return t("upcomingPayments.overdueDays", "Förfallen för {{count}} dagar sedan", { count: -days });
  if (days === 0) return t("upcomingPayments.dueToday", "Förfaller idag");
  if (days === 1) return t("upcomingPayments.dueTomorrow", "Förfaller imorgon");
  return t("upcomingPayments.dueInDays", "Förfaller om {{count}} dagar", { count: days });
}

function getUrgencyStyle(dateStr: string | null): { bg: string; fg: string; icon: typeof Clock } {
  if (!dateStr) return { bg: "var(--muted, #f5f5f5)", fg: "var(--muted-foreground, #6b7280)", icon: Clock };
  const days = daysUntil(dateStr);
  if (days < 0) return { bg: "rgb(254 226 226)", fg: "rgb(153 27 27)", icon: AlertCircle };
  if (days <= 7) return { bg: "rgb(254 243 199)", fg: "rgb(146 64 14)", icon: Clock };
  return { bg: "var(--muted, #f5f5f5)", fg: "var(--muted-foreground, #6b7280)", icon: Clock };
}

export function UpcomingPaymentsWidget({ projectId, currency, onNavigateToPurchases }: UpcomingPaymentsWidgetProps) {
  const { t } = useTranslation();
  const [items, setItems] = useState<UnpaidInvoicePO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchUnpaid = async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id, vendor_name, total, invoice_due_date, invoice_number")
        .eq("project_id", projectId)
        .eq("source", "ai_invoice")
        .is("paid_at", null)
        .order("invoice_due_date", { ascending: true, nullsFirst: false })
        .limit(5);

      if (cancelled) return;
      if (error) {
        console.error("Failed to load unpaid invoices:", error);
        setItems([]);
      } else {
        setItems(data ?? []);
      }
      setLoading(false);
    };
    fetchUnpaid();

    // Re-fetch on PO changes
    const channel = supabase
      .channel(`upcoming-payments-${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "purchase_orders", filter: `project_id=eq.${projectId}` },
        () => fetchUnpaid(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  if (loading || items.length === 0) return null;

  return (
    <div className="rounded-lg border bg-card">
      <div className="px-4 py-2.5 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-sm font-medium">
            {t("upcomingPayments.title", "Att betala")}
          </h3>
          <span className="text-xs text-muted-foreground tnum">
            {items.length}
          </span>
        </div>
        {onNavigateToPurchases && (
          <button
            type="button"
            onClick={onNavigateToPurchases}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-0.5"
          >
            {t("upcomingPayments.viewAll", "Visa alla")}
            <ChevronRight className="h-3 w-3" />
          </button>
        )}
      </div>
      <div className="divide-y">
        {items.map((po) => {
          const urgency = getUrgencyStyle(po.invoice_due_date);
          const Icon = urgency.icon;
          return (
            <button
              key={po.id}
              type="button"
              onClick={onNavigateToPurchases}
              className="group w-full px-4 py-2.5 text-left hover:bg-accent/50 transition-colors flex items-center gap-3"
            >
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                style={{ background: urgency.bg, color: urgency.fg }}
              >
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{po.vendor_name}</span>
                  {po.invoice_number && (
                    <span className="text-xs text-muted-foreground tnum">#{po.invoice_number}</span>
                  )}
                </div>
                <div
                  className={cn("text-xs mt-0.5 tnum")}
                  style={{ color: urgency.fg }}
                >
                  {po.invoice_due_date
                    ? formatRelativeDate(po.invoice_due_date, t as unknown as (k: string, f?: string, o?: Record<string, unknown>) => string)
                    : t("upcomingPayments.noDueDate", "Inget förfallodatum")}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-display tnum">{formatCurrency(po.total, currency)}</div>
              </div>
              <ChevronRight className="h-3 w-3 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

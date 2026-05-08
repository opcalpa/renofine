import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/currency";

interface AtaBudgetWarningSectionProps {
  /** Project the quote belongs to */
  projectId: string;
  /** Amount of the quote about to be accepted (incl. moms or however quote totals are stored) */
  pendingQuoteAmount: number;
  /** Quote ID to exclude from existing-commitments calc (so we don't double-count itself if already 'accepted') */
  excludeQuoteId?: string;
  currency?: string | null;
}

/**
 * Private warning shown to the homeowner BEFORE accepting a quote / ÄTA.
 *
 * Renders only when:
 *  - The viewer is the project owner (RLS returns the private cap row)
 *  - A private_budget_cap is set
 *  - Accepting this quote would push totalCommitted over the cap
 *
 * For everyone else (PL, shared users, anon token-approval) the cap query returns
 * empty by RLS — the warning silently disappears, no information leaks.
 */
export function AtaBudgetWarningSection({
  projectId,
  pendingQuoteAmount,
  excludeQuoteId,
  currency,
}: AtaBudgetWarningSectionProps) {
  const { t } = useTranslation();
  const [cap, setCap] = useState<number | null>(null);
  const [committed, setCommitted] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [capRes, quotesRes, invoicesRes, materialsRes, extraMatRes] = await Promise.all([
        supabase
          .from("project_private_budget")
          .select("private_budget_cap")
          .eq("project_id", projectId)
          .maybeSingle(),
        supabase
          .from("quotes")
          .select("id, total_amount, status, is_ata")
          .eq("project_id", projectId)
          .eq("status", "accepted"),
        supabase
          .from("invoices")
          .select("total_amount, status, is_ata")
          .eq("project_id", projectId)
          .neq("status", "cancelled"),
        supabase
          .from("materials")
          .select("price_total")
          .eq("project_id", projectId)
          .eq("exclude_from_budget", false)
          .is("task_id", null),
        supabase
          .from("materials")
          .select("price_total")
          .eq("project_id", projectId)
          .eq("exclude_from_budget", true),
      ]);
      if (cancelled) return;

      const capValue = capRes.data?.private_budget_cap ?? null;
      setCap(capValue ? Number(capValue) : null);

      // Mirror HomeownerBudgetView's totalCommitted formula
      const acceptedQuotes = (quotesRes.data || [])
        .filter((q) => q.id !== excludeQuoteId);
      const acceptedQuoteTotal = acceptedQuotes
        .filter((q) => !q.is_ata)
        .reduce((sum, q) => sum + (Number(q.total_amount) || 0), 0);
      const ataQuoteTotal = acceptedQuotes
        .filter((q) => q.is_ata)
        .reduce((sum, q) => sum + (Number(q.total_amount) || 0), 0);
      const ataInvoiceTotal = (invoicesRes.data || [])
        .filter((inv) => inv.is_ata)
        .reduce((sum, inv) => sum + (Number(inv.total_amount) || 0), 0);
      const ownPurchasesTotal = (materialsRes.data || [])
        .reduce((sum, m) => sum + (Number(m.price_total) || 0), 0);
      const extraMaterialTotal = (extraMatRes.data || [])
        .reduce((sum, m) => sum + (Number(m.price_total) || 0), 0);

      setCommitted(acceptedQuoteTotal + ataQuoteTotal + ataInvoiceTotal + ownPurchasesTotal + extraMaterialTotal);
    })();
    return () => { cancelled = true; };
  }, [projectId, excludeQuoteId]);

  // Silent if no cap (non-owner via RLS, or owner hasn't set one)
  if (!cap || cap <= 0) return null;

  const projected = committed + pendingQuoteAmount;
  const overage = projected - cap;
  // Below cap → no warning (the user is free to accept)
  if (overage <= 0) return null;

  return (
    <Alert variant="destructive" className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100 [&>svg]:text-amber-600">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{t("ata.privateCapWarning.title", "Detta tar dig över din privata gräns")}</AlertTitle>
      <AlertDescription className="space-y-1">
        <p className="text-sm">
          {t("ata.privateCapWarning.body", {
            overage: formatCurrency(overage, currency),
            cap: formatCurrency(cap, currency),
            defaultValue: "Att godkänna denna offert skulle ta dig {{overage}} över din privata gräns på {{cap}}.",
          })}
        </p>
        <p className="text-xs opacity-80">
          {t("ata.privateCapWarning.privateNote", "Endast du ser denna varning. Projektledaren delas aldrig denna siffra.")}
        </p>
      </AlertDescription>
    </Alert>
  );
}

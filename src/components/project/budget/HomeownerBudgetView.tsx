import { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/currency";
import { getDisplayStatus } from "@/services/invoiceService";
import { toast } from "sonner";
import {
  Loader2,
  Pencil,
  Check,
  X,
  FileText,
  Receipt,
  Wallet,
  ChevronDown,
  ExternalLink,
  ShoppingBag,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { HomeownerAnalysisSection } from "./HomeownerAnalysisSection";

// --- Interfaces ---

interface HomeownerBudgetViewProps {
  projectId: string;
  currency?: string | null;
}

interface QuoteData {
  id: string;
  title: string | null;
  quote_number: string | null;
  total_amount: number;
  total_rot_deduction: number;
  total_after_rot: number;
  status: string;
  is_ata: boolean;
}

interface QuoteItemData {
  id: string;
  quote_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  is_rot_eligible: boolean;
  rot_deduction: number;
}

interface InvoiceData {
  id: string;
  title: string | null;
  invoice_number: string | null;
  status: string;
  total_amount: number;
  paid_amount: number;
  due_date: string | null;
  is_ata: boolean;
  sent_at: string | null;
  created_at: string;
}

interface MaterialData {
  id: string;
  name: string;
  price_total: number;
  paid_amount: number;
}

// --- Constants ---

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  partially_paid: "bg-amber-100 text-amber-700",
  overdue: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
};

const invoiceStatusKey = (status: string) => {
  const map: Record<string, string> = { partially_paid: "partiallyPaid" };
  return map[status] || status;
};

// --- Component ---

export function HomeownerBudgetView({ projectId, currency }: HomeownerBudgetViewProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [privateBudgetCap, setPrivateBudgetCap] = useState(0);
  const [quotes, setQuotes] = useState<QuoteData[]>([]);
  const [quoteItems, setQuoteItems] = useState<QuoteItemData[]>([]);
  const [invoices, setInvoices] = useState<InvoiceData[]>([]);
  const [ownPurchases, setOwnPurchases] = useState<MaterialData[]>([]);
  const [extraMaterialTotal, setExtraMaterialTotal] = useState(0);

  // Edit budget inline
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");

  // Collapsible sections

  // --- Data fetching ---

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [privateBudgetRes, quotesRes, invoicesRes, materialsRes, extraMatRes] = await Promise.all([
          supabase.from("project_private_budget").select("private_budget_cap").eq("project_id", projectId).maybeSingle(),
          supabase
            .from("quotes")
            .select("id, title, quote_number, total_amount, total_rot_deduction, total_after_rot, status, is_ata")
            .eq("project_id", projectId),
          supabase
            .from("invoices")
            .select("id, title, invoice_number, status, total_amount, total_rot_deduction, paid_amount, due_date, is_ata, sent_at, created_at")
            .eq("project_id", projectId)
            .neq("status", "cancelled")
            .order("created_at", { ascending: false }),
          supabase
            .from("materials")
            .select("id, name, price_total, paid_amount")
            .eq("project_id", projectId)
            .eq("exclude_from_budget", false)
            .is("task_id", null),
          supabase
            .from("materials")
            .select("price_total")
            .eq("project_id", projectId)
            .eq("exclude_from_budget", true),
        ]);

        const cap = privateBudgetRes.data?.private_budget_cap ?? 0;
        setPrivateBudgetCap(cap);
        setBudgetInput(String(cap));

        const allQuotes = (quotesRes.data || []) as QuoteData[];
        const allInvoices = (invoicesRes.data || []) as InvoiceData[];

        setQuotes(allQuotes);
        setInvoices(allInvoices);
        setOwnPurchases((materialsRes.data || []) as MaterialData[]);

        const matExtra = (extraMatRes.data || []).reduce((sum, m) => sum + (m.price_total || 0), 0);
        setExtraMaterialTotal(matExtra);

        // Fetch quote items for accepted quotes
        const acceptedIds = allQuotes.filter((q) => q.status === "accepted").map((q) => q.id);
        if (acceptedIds.length > 0) {
          const { data: items } = await supabase
            .from("quote_items")
            .select("id, quote_id, description, quantity, unit_price, total_price, is_rot_eligible, rot_deduction")
            .in("quote_id", acceptedIds)
            .order("sort_order", { ascending: true });
          setQuoteItems((items || []) as QuoteItemData[]);
        }
      } catch (error) {
        console.error("Failed to load homeowner budget:", error);
        toast.error(t("budget.failedToLoadData"));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [projectId, t]);

  // --- Computed values ---

  const computed = useMemo(() => {
    const acceptedQuotes = quotes.filter((q) => q.status === "accepted" && !q.is_ata);
    const acceptedQuoteTotal = acceptedQuotes.reduce((sum, q) => sum + (q.total_amount || 0), 0);
    const acceptedRotDeduction = acceptedQuotes.reduce((sum, q) => sum + (q.total_rot_deduction || 0), 0);
    const acceptedAfterRot = acceptedQuotes.reduce((sum, q) => sum + (q.total_after_rot || 0), 0);

    const ataQuoteTotal = quotes.filter((q) => q.is_ata).reduce((sum, q) => sum + (q.total_amount || 0), 0);
    const ataInvoiceTotal = invoices.filter((inv) => inv.is_ata).reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
    const ataTotal = ataQuoteTotal + ataInvoiceTotal + extraMaterialTotal;

    const nonDraftInvoices = invoices.filter((inv) => inv.status !== "draft");
    const invoicedTotal = nonDraftInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
    const receivedTotal = invoices.reduce((sum, inv) => sum + (inv.paid_amount || 0), 0);
    const outstandingBalance = invoicedTotal - receivedTotal;

    const ownPurchasesTotal = ownPurchases.reduce((sum, m) => sum + (m.price_total || 0), 0);

    const totalCommitted = acceptedQuoteTotal + ownPurchasesTotal + ataTotal;
    const disposableFunds = privateBudgetCap - totalCommitted;
    const usedPct = privateBudgetCap > 0 ? Math.round((totalCommitted / privateBudgetCap) * 100) : 0;

    return {
      acceptedQuoteTotal,
      acceptedRotDeduction,
      acceptedAfterRot,
      ataTotal,
      invoicedTotal,
      receivedTotal,
      outstandingBalance,
      ownPurchasesTotal,
      totalCommitted,
      disposableFunds,
      usedPercent: Math.min(usedPct, 100),
      isOverBudget: totalCommitted > privateBudgetCap && privateBudgetCap > 0,
    };
  }, [quotes, invoices, ownPurchases, privateBudgetCap, extraMaterialTotal]);

  // --- Budget edit ---

  const handleSaveBudget = async () => {
    const val = parseFloat(budgetInput);
    if (isNaN(val) || val < 0) return;

    const { error } = await supabase
      .from("project_private_budget")
      .upsert({ project_id: projectId, private_budget_cap: val }, { onConflict: "project_id" });

    if (error) {
      toast.error(t("homeownerBudget.failedToUpdateBudget", "Could not update budget"));
      return;
    }

    setPrivateBudgetCap(val);
    setEditingBudget(false);
    toast.success(t("homeownerBudget.budgetUpdated", "Budget updated"));
  };

  const handleCancelEdit = () => {
    setBudgetInput(String(privateBudgetCap));
    setEditingBudget(false);
  };

  // --- Disposition color ---

  const getDisposableColor = () => {
    if (privateBudgetCap <= 0) return "";
    const pct = computed.disposableFunds / privateBudgetCap;
    if (pct < 0.05) return "text-destructive";
    if (pct < 0.2) return "text-amber-500";
    return "text-green-600";
  };

  // --- Loading ---

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const sentInvoices = invoices.filter((inv) => inv.status !== "draft");

  return (
    <div className="space-y-4 sm:space-y-6">
      <h2 className="text-xl sm:text-2xl font-bold">{t("budget.title")}</h2>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6 md:gap-3">
        {/* Min privata gräns — homeowner only, RLS-protected */}
        <div className="bg-muted/50 rounded-lg p-4 text-center space-y-1" title={t("homeownerBudget.privateCapTooltip", "Endast du ser denna siffra. Den delas aldrig med projektledare eller hantverkare.")}>
          <div className="flex items-center justify-center gap-1.5">
            <Wallet className="h-3.5 w-3.5 text-blue-600" />
            <p className="text-xs text-muted-foreground">{t("homeownerBudget.privateCap", "Min privata gräns")}</p>
          </div>
          {editingBudget ? (
            <div className="flex items-center gap-1 justify-center">
              <Input
                type="number"
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                className="h-8 w-28 text-center text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveBudget();
                  if (e.key === "Escape") handleCancelEdit();
                }}
                autoFocus
              />
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleSaveBudget}>
                <Check className="h-3.5 w-3.5 text-green-600" />
              </Button>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleCancelEdit}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <button
              type="button"
              className="text-lg font-bold group flex items-center gap-1 justify-center mx-auto hover:text-primary transition-colors"
              onClick={() => {
                setBudgetInput(String(privateBudgetCap));
                setEditingBudget(true);
              }}
            >
              {privateBudgetCap > 0
                ? formatCurrency(privateBudgetCap, currency)
                : t("homeownerBudget.setBudget", "Ange budget")}
              <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-50" />
            </button>
          )}
          <p className="text-[10px] text-muted-foreground">{t("homeownerBudget.privateOnly", "Endast du ser detta")}</p>
        </div>

        {/* Offererat — clickable popover with quote items */}
        <Popover>
          <PopoverTrigger asChild>
            <div className={`bg-muted/50 rounded-lg p-4 text-center space-y-1 ${quoteItems.length > 0 ? "cursor-pointer hover:bg-muted hover:ring-1 hover:ring-border transition-colors" : ""}`}>
              <div className="flex items-center justify-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-indigo-600" />
                <p className="text-xs text-muted-foreground">{t("homeownerBudget.quoted", "Offererat")}</p>
              </div>
              <p className="text-lg font-bold">{formatCurrency(computed.acceptedQuoteTotal, currency)}</p>
              {computed.acceptedRotDeduction > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  {t("homeownerBudget.afterRot", "Efter ROT")}: {formatCurrency(computed.acceptedAfterRot, currency)}
                </p>
              )}
            </div>
          </PopoverTrigger>
          {quoteItems.length > 0 && (
            <PopoverContent align="center" className="w-[calc(100%-2rem)] sm:w-96 p-0">
              <div className="px-3 py-2.5 border-b">
                <h4 className="text-sm font-semibold">{t("homeownerBudget.quoteOverview", "Offertöversikt")}</h4>
              </div>
              <div className="max-h-72 overflow-y-auto p-1.5 space-y-0.5">
                {quoteItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm">
                    <span className="flex-1 min-w-0 truncate">{item.description}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-medium">{formatCurrency(item.total_price, currency)}</span>
                      {item.is_rot_eligible && item.rot_deduction > 0 && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 text-green-700 border-green-300">ROT</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t px-4 py-2.5 space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{t("common.total")}</span>
                  <span className="font-bold">{formatCurrency(computed.acceptedQuoteTotal, currency)}</span>
                </div>
                {computed.acceptedRotDeduction > 0 && (
                  <>
                    <div className="flex items-center justify-between text-sm text-green-700">
                      <span>ROT-{t("homeownerBudget.deduction", "avdrag")}</span>
                      <span>&minus;{formatCurrency(computed.acceptedRotDeduction, currency)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm font-bold">
                      <span>{t("homeownerBudget.afterRot", "Efter ROT")}</span>
                      <span>{formatCurrency(computed.acceptedAfterRot, currency)}</span>
                    </div>
                  </>
                )}
              </div>
            </PopoverContent>
          )}
        </Popover>

        {/* Fakturerat — clickable popover with invoice list */}
        <Popover>
          <PopoverTrigger asChild>
            <div className={`bg-muted/50 rounded-lg p-4 text-center space-y-1 ${sentInvoices.length > 0 ? "cursor-pointer hover:bg-muted hover:ring-1 hover:ring-border transition-colors" : ""}`}>
              <div className="flex items-center justify-center gap-1.5">
                <Receipt className="h-3.5 w-3.5 text-amber-600" />
                <p className="text-xs text-muted-foreground">{t("homeownerBudget.invoiced", "Fakturerat")}</p>
              </div>
              <p className="text-lg font-bold">{formatCurrency(computed.invoicedTotal, currency)}</p>
            </div>
          </PopoverTrigger>
          {sentInvoices.length > 0 && (
            <PopoverContent align="center" className="w-[calc(100%-2rem)] sm:w-96 p-0">
              <div className="px-3 py-2.5 border-b">
                <h4 className="text-sm font-semibold">{t("homeownerBudget.invoices", "Fakturor")}</h4>
              </div>
              <div className="max-h-72 overflow-y-auto p-1.5 space-y-0.5">
                {sentInvoices.map((inv) => {
                  const displayStatus = getDisplayStatus(inv);
                  const remaining = (inv.total_amount || 0) - (inv.paid_amount || 0);
                  return (
                    <button
                      key={inv.id}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md hover:bg-muted transition-colors text-left"
                      onClick={() => navigate(`/invoices/${inv.id}`)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {inv.invoice_number || inv.title || t("invoices.untitled", "Untitled")}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{formatCurrency(inv.total_amount || 0, currency)}</span>
                          {displayStatus === "partially_paid" && remaining > 0 && (
                            <span className="text-amber-600">
                              ({formatCurrency(remaining, currency)} {t("homeownerBudget.remaining", "kvar")})
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {inv.total_rot_deduction > 0 && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 text-green-700 border-green-300">ROT</Badge>
                        )}
                        {inv.is_ata && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 text-orange-600 border-orange-300">{t('budget.addition', 'Tillägg')}</Badge>
                        )}
                        <Badge className={STATUS_COLORS[displayStatus] || STATUS_COLORS.draft}>
                          {t(`invoices.${invoiceStatusKey(displayStatus)}`)}
                        </Badge>
                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="border-t px-4 py-2.5 space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t("homeownerBudget.totalInvoiced", "Totalt fakturerat")}</span>
                  <span className="font-medium">{formatCurrency(computed.invoicedTotal, currency)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t("homeownerBudget.totalPaid", "Totalt betalt")}</span>
                  <span className="font-medium text-green-600">{formatCurrency(computed.receivedTotal, currency)}</span>
                </div>
                {computed.outstandingBalance > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t("homeownerBudget.outstandingBalance", "Kvarstår att betala")}</span>
                    <span className="font-medium text-amber-600">{formatCurrency(computed.outstandingBalance, currency)}</span>
                  </div>
                )}
                {(() => {
                  const totalRot = sentInvoices.reduce((sum, inv) => sum + (inv.total_rot_deduction || 0), 0);
                  return totalRot > 0 ? (
                    <div className="flex items-center justify-between text-sm text-green-700">
                      <span>{t("homeownerBudget.totalRotDeduction", "ROT-avdrag totalt")}</span>
                      <span className="font-medium">&minus;{formatCurrency(totalRot, currency)}</span>
                    </div>
                  ) : null;
                })()}
              </div>
            </PopoverContent>
          )}
        </Popover>

        {/* Betalt */}
        <div className="bg-muted/50 rounded-lg p-4 text-center space-y-1">
          <div className="flex items-center justify-center gap-1.5">
            <Check className="h-3.5 w-3.5 text-green-600" />
            <p className="text-xs text-muted-foreground">{t("homeownerBudget.paid", "Betalt")}</p>
          </div>
          <p className="text-lg font-bold">{formatCurrency(computed.receivedTotal, currency)}</p>
          {computed.outstandingBalance > 0 && (
            <p className="text-[10px] text-amber-600">
              {t("homeownerBudget.outstandingShort", "Kvarstår")}: {formatCurrency(computed.outstandingBalance, currency)}
            </p>
          )}
        </div>

        {/* ÄTA */}
        <div className="bg-muted/50 rounded-lg p-4 text-center space-y-1">
          <div className="flex items-center justify-center gap-1.5">
            <ShoppingBag className="h-3.5 w-3.5 text-orange-600" />
            <p className="text-xs text-muted-foreground">{t("homeownerBudget.ataShort", "Tillägg")}</p>
          </div>
          <p className="text-lg font-bold">{formatCurrency(computed.ataTotal, currency)}</p>
        </div>

        {/* Kvarstår (budget minus all committed) */}
        <div className="bg-muted/50 rounded-lg p-4 text-center space-y-1">
          <div className="flex items-center justify-center gap-1.5">
            <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">{t("homeownerBudget.availableToSpend", "Kvar att spendera")}</p>
          </div>
          <p className={`text-lg font-bold ${getDisposableColor()}`}>
            {formatCurrency(computed.disposableFunds, currency)}
          </p>
        </div>
      </div>

      {/* Budget progress bar — uses private cap as denominator (homeowner-only view) */}
      {privateBudgetCap > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{t("homeownerBudget.budgetUsed", "Förbrukat av budget")}</span>
            <span>{Math.round((computed.invoicedTotal / privateBudgetCap) * 100)}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                computed.invoicedTotal > privateBudgetCap ? "bg-red-500" : computed.invoicedTotal > privateBudgetCap * 0.8 ? "bg-amber-500" : "bg-green-500"
              }`}
              style={{ width: `${Math.min(100, (computed.invoicedTotal / privateBudgetCap) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* No budget prompt */}
      {privateBudgetCap <= 0 && computed.acceptedQuoteTotal <= 0 && sentInvoices.length === 0 && (
        <div className="rounded-xl border border-dashed bg-muted/30 p-8 text-center space-y-3">
          <Wallet className="h-8 w-8 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">
            {t("homeownerBudget.noBudgetDescription", "Set a total budget for your renovation to track spending.")}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setBudgetInput("");
              setEditingBudget(true);
            }}
          >
            {t("homeownerBudget.setBudget", "Ange budget")}
          </Button>
        </div>
      )}

      {/* Egna inköp — removed: now shown in the budget table under standalone/orphan sections */}
    </div>
  );
}

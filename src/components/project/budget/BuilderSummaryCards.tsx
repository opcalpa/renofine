import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/currency";
import { getDisplayStatus } from "@/services/invoiceService";
import { FileText, Receipt, Banknote, AlertTriangle, Clock, Plus, ExternalLink, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface BuilderSummaryCardsProps {
  projectId: string;
  currency?: string | null;
  onCreateInvoice?: () => void;
}

interface InvoiceSummary {
  contractTotal: number;
  invoicedTotal: number;
  receivedTotal: number;
  unbilledTotal: number;
  overdueTotal: number;
  ataTotal: number;
}

interface Invoice {
  id: string;
  title: string;
  invoice_number: string | null;
  status: string;
  total_amount: number;
  paid_amount: number;
  due_date: string | null;
  sent_at: string | null;
  is_ata: boolean;
  created_at: string;
}

interface Quote {
  id: string;
  title: string;
  quote_number: string | null;
  total_amount: number;
  status: string;
  is_ata: boolean;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  partially_paid: "bg-amber-100 text-amber-700",
  overdue: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
  accepted: "bg-green-100 text-green-700",
  pending: "bg-amber-100 text-amber-700",
  rejected: "bg-red-100 text-red-700",
};

const invoiceStatusKey = (status: string) => {
  const map: Record<string, string> = {
    partially_paid: "partiallyPaid",
  };
  return map[status] || status;
};

export function BuilderSummaryCards({ projectId, currency, onCreateInvoice }: BuilderSummaryCardsProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<InvoiceSummary>({
    contractTotal: 0,
    invoicedTotal: 0,
    receivedTotal: 0,
    unbilledTotal: 0,
    overdueTotal: 0,
    ataTotal: 0,
  });
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);

  useEffect(() => {
    fetchData();
  }, [projectId]);

  const fetchData = async () => {
    const [quotesRes, invoicesRes] = await Promise.all([
      supabase
        .from("quotes")
        .select("id, title, quote_number, total_amount, status, is_ata, created_at")
        .eq("project_id", projectId),
      supabase
        .from("invoices")
        .select("id, title, invoice_number, status, total_amount, paid_amount, due_date, sent_at, is_ata, created_at")
        .eq("project_id", projectId)
        .neq("status", "cancelled")
        .order("created_at", { ascending: false }),
    ]);

    const allQuotes = (quotesRes.data || []) as Quote[];
    const allInvoices = (invoicesRes.data || []) as Invoice[];

    setQuotes(allQuotes);
    setInvoices(allInvoices);

    const acceptedQuotes = allQuotes.filter((q) => q.status === "accepted");
    let contractTotal = acceptedQuotes.reduce(
      (sum, q) => sum + (q.total_amount || 0),
      0
    );

    // Fallback: if accepted quotes have total_amount = 0, sum from quote_items
    if (contractTotal === 0 && acceptedQuotes.length > 0) {
      const quoteIds = acceptedQuotes.map((q) => q.id);
      const { data: itemsData } = await supabase
        .from("quote_items")
        .select("total_price")
        .in("quote_id", quoteIds);
      if (itemsData) {
        contractTotal = itemsData.reduce((sum, i) => sum + (i.total_price || 0), 0);
      }
    }

    const sentInvoices = allInvoices.filter((inv) => inv.status !== "draft");
    const invoicedTotal = sentInvoices.reduce(
      (sum, inv) => sum + (inv.total_amount || 0),
      0
    );
    const receivedTotal = allInvoices.reduce(
      (sum, inv) => sum + (inv.paid_amount || 0),
      0
    );

    const now = new Date().toISOString().split("T")[0];
    const overdueTotal = allInvoices
      .filter(
        (inv) =>
          (inv.status === "sent" || inv.status === "partially_paid") &&
          inv.due_date &&
          inv.due_date < now
      )
      .reduce((sum, inv) => sum + ((inv.total_amount || 0) - (inv.paid_amount || 0)), 0);

    // ATA total from both ATA invoices and ATA quotes
    const ataInvoiceTotal = allInvoices
      .filter((inv) => inv.is_ata)
      .reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
    const ataQuoteTotal = allQuotes
      .filter((q) => q.is_ata)
      .reduce((sum, q) => sum + (q.total_amount || 0), 0);

    setSummary({
      contractTotal,
      invoicedTotal,
      receivedTotal,
      unbilledTotal: contractTotal - invoicedTotal,
      overdueTotal,
      ataTotal: ataInvoiceTotal + ataQuoteTotal,
    });
  };

  // --- Filtered lists for each popover ---

  const acceptedQuotes = quotes.filter((q) => q.status === "accepted" && !q.is_ata);
  const invoicedInvoices = invoices.filter((inv) => inv.status !== "draft");
  const receivedInvoices = invoices.filter(
    (inv) => (inv.status === "paid" || inv.status === "partially_paid") && (inv.paid_amount || 0) > 0
  );
  // For Unbilled popover: show draft invoices + non-invoiced contract quotes
  const unbilledInvoices = invoices.filter((inv) => inv.status === "draft");
  const unbilledQuotes = acceptedQuotes; // Accepted quotes that aren't fully invoiced yet
  const now = new Date().toISOString().split("T")[0];
  const overdueInvoices = invoices.filter(
    (inv) =>
      (inv.status === "sent" || inv.status === "partially_paid") &&
      inv.due_date &&
      inv.due_date < now
  );
  const ataQuotes = quotes.filter((q) => q.is_ata);
  const ataInvoices = invoices.filter((inv) => inv.is_ata);

  // --- Render helpers ---

  const renderInvoiceRow = (inv: Invoice) => {
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
            {displayStatus === "partially_paid" && (
              <span>({formatCurrency(remaining, currency)} {t("budget.builder.outstanding", "outstanding")})</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {inv.is_ata && (
            <Badge variant="outline" className="text-[10px] px-1 py-0">ATA</Badge>
          )}
          <Badge className={STATUS_COLORS[displayStatus] || STATUS_COLORS.draft}>
            {t(`invoices.${invoiceStatusKey(displayStatus)}`)}
          </Badge>
          <ExternalLink className="h-3 w-3 text-muted-foreground" />
        </div>
      </button>
    );
  };

  const renderQuoteRow = (q: Quote) => (
    <button
      key={q.id}
      className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md hover:bg-muted transition-colors text-left"
      onClick={() => navigate(`/quotes/${q.id}`)}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {q.quote_number || q.title || t("invoices.untitled", "Untitled")}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatCurrency(q.total_amount || 0, currency)}
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {q.is_ata && (
          <Badge variant="outline" className="text-[10px] px-1 py-0">ATA</Badge>
        )}
        <Badge className={STATUS_COLORS[q.status] || STATUS_COLORS.draft}>
          {t(`quotes.${q.status}`, q.status)}
        </Badge>
        <ExternalLink className="h-3 w-3 text-muted-foreground" />
      </div>
    </button>
  );

  const renderPopoverList = (
    title: string,
    items: React.ReactNode[],
  ) => (
    <PopoverContent align="center" className="w-80 p-0">
      <div className="px-3 py-2.5 border-b">
        <h4 className="text-sm font-semibold">{title}</h4>
      </div>
      <div className="max-h-64 overflow-y-auto p-1.5 space-y-0.5">
        {items.length > 0 ? items : (
          <p className="text-sm text-muted-foreground text-center py-4">
            {t("budget.builder.noItems", "No items")}
          </p>
        )}
      </div>
    </PopoverContent>
  );

  // --- Card definitions ---

  type CardDef = {
    label: string;
    value: number;
    icon: typeof FileText;
    color: string;
    clickable: boolean;
    popoverTitle: string;
    popoverItems: React.ReactNode[];
  };

  const cards: CardDef[] = [
    {
      label: t("budget.builder.contract", "Contract"),
      value: summary.contractTotal,
      icon: FileText,
      color: "text-blue-600",
      clickable: true,
      popoverTitle: t("budget.builder.contractDetails", "Contract Details"),
      popoverItems: acceptedQuotes.map((q) => renderQuoteRow(q)),
    },
    {
      label: t("budget.builder.invoiced", "Invoiced"),
      value: summary.invoicedTotal,
      icon: Receipt,
      color: "text-amber-600",
      clickable: true,
      popoverTitle: t("budget.builder.invoiceList", "Invoiced — Details"),
      popoverItems: invoicedInvoices.map((inv) => renderInvoiceRow(inv)),
    },
    {
      label: t("budget.builder.received", "Received"),
      value: summary.receivedTotal,
      icon: Banknote,
      color: "text-green-600",
      clickable: true,
      popoverTitle: t("budget.builder.receivedList", "Received Payments"),
      popoverItems: receivedInvoices.map((inv) => renderInvoiceRow(inv)),
    },
    {
      label: t("budget.builder.unbilled", "Unbilled"),
      value: summary.unbilledTotal,
      icon: Clock,
      color: "text-muted-foreground",
      clickable: unbilledInvoices.length > 0 || unbilledQuotes.length > 0,
      popoverTitle: t("budget.builder.unbilledList", "Ej fakturerat — utkast & återstående kontrakt"),
      popoverItems: [
        ...unbilledInvoices.map((inv) => renderInvoiceRow(inv)),
        ...unbilledQuotes.map((q) => renderQuoteRow(q)),
      ],
    },
    {
      label: t("budget.builder.overdue", "Overdue"),
      value: summary.overdueTotal,
      icon: AlertTriangle,
      color: summary.overdueTotal > 0 ? "text-destructive" : "text-muted-foreground",
      clickable: true,
      popoverTitle: t("budget.builder.overdueList", "Overdue Invoices"),
      popoverItems: overdueInvoices.map((inv) => renderInvoiceRow(inv)),
    },
    {
      label: t("budget.builder.ata", "ATA"),
      value: summary.ataTotal,
      icon: Plus,
      color: "text-orange-600",
      clickable: true,
      popoverTitle: t("budget.builder.ataList", "ATA / Change Orders"),
      popoverItems: [
        ...ataQuotes.map((q) => renderQuoteRow(q)),
        ...ataInvoices.map((inv) => renderInvoiceRow(inv)),
      ],
    },
  ];

  const renderCard = (card: CardDef) => {
    // Förfallet får röd accent när belopp > 0 så det visuellt sticker ut som
    // ett nödläge istället för en neutral KPI.
    const isOverdueWithAmount = card.label === t("budget.builder.overdue", "Overdue") && card.value > 0;
    const cardContent = (
      <div
        className={`group relative rounded-lg border bg-card p-3 text-center space-y-1 shadow-sm transition-all duration-200 ${
          card.clickable
            ? "cursor-pointer hover:shadow-lg hover:-translate-y-0.5"
            : ""
        } ${
          isOverdueWithAmount
            ? "border-destructive/40 bg-destructive/5"
            : ""
        }`}
      >
        <div className="flex items-center justify-center gap-1.5">
          <card.icon className={`h-3.5 w-3.5 ${card.color}`} />
          <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
        </div>
        <p className={`text-xl font-display font-normal tabular-nums ${card.value < 0 || isOverdueWithAmount ? "text-destructive" : ""}`}>
          {formatCurrency(card.value, currency)}
        </p>
        {card.clickable && (
          <ChevronDown className="absolute top-1.5 right-1.5 h-3 w-3 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
        )}
      </div>
    );

    if (!card.clickable) {
      return <div key={card.label}>{cardContent}</div>;
    }

    return (
      <Popover key={card.label}>
        <PopoverTrigger asChild>
          {cardContent}
        </PopoverTrigger>
        {renderPopoverList(card.popoverTitle, card.popoverItems)}
      </Popover>
    );
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6 md:gap-3">
        {cards.map(renderCard)}
      </div>

      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onCreateInvoice ? onCreateInvoice() : navigate(`/invoices/new?projectId=${projectId}`)}
          className="gap-1"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("budget.builder.createInvoice", "Create Invoice")}
        </Button>
      </div>
    </div>
  );
}

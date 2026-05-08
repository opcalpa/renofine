/**
 * ViewInvoiceV2 — read-only invoice document with paper-warm DocumentLayout.
 *
 * Mirrors ViewQuoteV2 structurally. Reuses the same data fetching, status
 * transitions, and side effects as v1 ViewInvoice.tsx — only the visual shell
 * is new. PDF generation is shared via invoicePdfService.
 *
 * Feature-flagged in App.tsx via USE_INVOICE_VIEW_V2; flip to false to fall
 * back to the original ViewInvoice.
 */

import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Download,
  Trash2,
  ArrowLeft,
  Pencil,
  Send,
  MessageCircle,
  CheckCircle,
  CreditCard,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Eye,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/useAuthSession";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CommentsSection } from "@/components/comments/CommentsSection";
import { ShareInvoiceDialog } from "@/components/invoices/ShareInvoiceDialog";
import { RecordPaymentDialog } from "@/components/invoices/RecordPaymentDialog";

import {
  updateInvoiceStatus,
  markInvoiceViewed,
  getDisplayStatus,
} from "@/services/invoiceService";
import { downloadInvoicePdf } from "@/services/invoicePdfService";

import {
  DocumentLayout,
  DocumentNumber,
  DocumentParties,
  DocumentLines,
  DocumentTotals,
  DocumentStatusStamp,
  SidebarCard,
  SidebarActions,
  SidebarTimeline,
  SidebarLinkBlock,
  StatusPill,
  type DocumentLineItem,
  type SidebarAction,
  type StatusTone,
  type StampTone,
} from "@/components/documents-v2";

interface InvoiceData {
  id: string;
  title: string;
  status: string;
  project_id: string;
  creator_id: string;
  total_amount: number;
  total_rot_deduction: number;
  total_after_rot: number;
  paid_amount: number;
  created_at: string;
  free_text: string | null;
  viewed_at: string | null;
  invoice_number: string | null;
  due_date: string | null;
  sent_at: string | null;
  bankgiro: string | null;
  bank_account_number: string | null;
  ocr_reference: string | null;
  is_ata: boolean | null;
}

interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  is_rot_eligible: boolean;
  rot_deduction: number;
  sort_order: number;
  comment: string | null;
  discount_percent: number | null;
}

interface CreatorProfile {
  name: string;
  company_name: string | null;
  avatar_url: string | null;
  org_number: string | null;
  company_address: string | null;
  company_postal_code: string | null;
  company_city: string | null;
  email: string | null;
  phone: string | null;
  company_website: string | null;
  company_logo_url: string | null;
  bankgiro: string | null;
  bank_account_number: string | null;
}

const STATUS_TONE: Record<string, StatusTone> = {
  draft: "draft",
  sent: "sent",
  paid: "paid",
  partially_paid: "sent",
  overdue: "overdue",
  cancelled: "neutral",
};

const STAMP_FOR_STATUS: Partial<Record<string, StampTone>> = {
  sent: "sent",
  paid: "paid",
  overdue: "rejected",
};

function fmtKr(n: number): string {
  return `${n.toLocaleString("sv-SE")} kr`;
}

export default function ViewInvoiceV2() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthSession();

  const returnTo = searchParams.get("returnTo");

  const [userName, setUserName] = useState<string>();
  const [userEmail, setUserEmail] = useState<string>();
  const [avatarUrl, setAvatarUrl] = useState<string>();
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [creator, setCreator] = useState<CreatorProfile | null>(null);
  const [projectName, setProjectName] = useState("");
  const [clientName, setClientName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [markAsPaidMode, setMarkAsPaidMode] = useState(false);
  const [confirmUnlock, setConfirmUnlock] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("name, avatar_url")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setUserName(data.name ?? undefined);
          setAvatarUrl(data.avatar_url ?? undefined);
        }
      });
    setUserEmail(user.email);
  }, [user]);

  useEffect(() => {
    if (!invoiceId) return;
    fetchInvoice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  useEffect(() => {
    if (!user || !invoice) return;
    supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data?.id === invoice.creator_id) setIsOwner(true);
      });
  }, [user?.id, invoice?.creator_id]);

  useEffect(() => {
    if (!user || !invoice || !invoiceId || isOwner || invoice.status !== "sent") return;
    markInvoiceViewed(invoiceId);
  }, [user, invoice, invoiceId, isOwner]);

  const fetchInvoice = async () => {
    if (!invoiceId) return;
    const { data: inv } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .single();
    if (!inv) {
      setLoading(false);
      return;
    }
    setInvoice(inv as InvoiceData);

    const clientIdRef = (inv as Record<string, unknown>).client_id_ref as string | null;
    if (clientIdRef) {
      const { data: cd } = await supabase
        .from("clients")
        .select("name")
        .eq("id", clientIdRef)
        .maybeSingle();
      if (cd?.name) setClientName(cd.name);
    }

    const [itemsRes, creatorRes, projectRes] = await Promise.all([
      supabase
        .from("invoice_items")
        .select("*")
        .eq("invoice_id", invoiceId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("profiles")
        .select(
          "name, company_name, avatar_url, org_number, company_address, company_postal_code, company_city, email, phone, company_website, company_logo_url, bankgiro, bank_account_number"
        )
        .eq("id", inv.creator_id)
        .single(),
      supabase.from("projects").select("name").eq("id", inv.project_id).single(),
    ]);

    if (itemsRes.data) setItems(itemsRes.data as InvoiceItem[]);
    if (creatorRes.data) setCreator(creatorRes.data as CreatorProfile);
    if (projectRes.data) setProjectName(projectRes.data.name);

    setLoading(false);
  };

  const handleEdit = () => {
    navigate(`/invoices/new?editInvoiceId=${invoiceId}&projectId=${invoice?.project_id}`);
  };

  const handleUnlockAndEdit = async () => {
    if (!invoice || !invoiceId) return;
    const result = await updateInvoiceStatus(invoiceId, "draft");
    if (result) {
      setInvoice({ ...invoice, status: "draft" });
      setConfirmUnlock(false);
      navigate(`/invoices/new?editInvoiceId=${invoiceId}&projectId=${invoice.project_id}`);
    }
  };

  const handleDelete = async () => {
    if (!invoiceId) return;
    await supabase.from("invoice_items").delete().eq("invoice_id", invoiceId);
    const { error } = await supabase.from("invoices").delete().eq("id", invoiceId);
    if (error) {
      toast.error(t("common.error"));
    } else {
      toast.success(t("invoices.invoiceDeleted"));
      navigate("/start");
    }
    setConfirmDelete(false);
  };

  const handleDownloadPdf = async () => {
    if (!invoice || !invoiceId) return;
    await downloadInvoicePdf({
      invoice,
      items: items.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        unit: i.unit,
        unit_price: i.unit_price,
        total_price: i.total_price,
        rot_deduction: i.rot_deduction,
        comment: i.comment,
      })),
      creator,
      projectName,
      clientName,
      t,
      onDraftFinalized: () => {
        setInvoice({ ...invoice, status: "sent" });
        toast.success(t("invoices.invoiceFinalizedOnPdf"));
      },
    });
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!invoice) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">{t("common.notFound", "Invoice not found")}</p>
      </div>
    );
  }

  const subtotal = items.reduce((s, i) => s + (i.total_price ?? 0), 0);
  const vat = Math.round(subtotal * 0.25 * 100) / 100;
  const totalRot = items.reduce((s, i) => s + (i.rot_deduction ?? 0), 0);
  const totalToPay = subtotal + vat - totalRot;
  const hasRotEligible = items.some((i) => i.is_rot_eligible);
  const paidAmount = invoice.paid_amount ?? 0;
  const remaining = totalToPay - paidAmount;
  const displayStatus = getDisplayStatus(invoice);
  const isOverdue = displayStatus === "overdue";

  const statusKey =
    displayStatus === "overdue"
      ? "overdue"
      : displayStatus === "partially_paid"
        ? "partiallyPaid"
        : displayStatus;

  const lineItems: DocumentLineItem[] = items.map((it) => ({
    id: it.id,
    description: it.description,
    comment: it.comment ?? undefined,
    quantity: `${it.quantity} ${it.unit}`,
    unitPrice: fmtKr(it.unit_price),
    total: fmtKr(it.total_price),
    rot: it.is_rot_eligible,
  }));

  // Sidebar actions per (isOwner, status). Mirrors V1 invoice actions.
  const ownerActions: SidebarAction[] = (() => {
    if (!isOwner) return [];
    if (invoice.status === "draft") {
      return [
        { label: t("invoices.shareWithCustomer"), variant: "primary", icon: <Send className="h-3.5 w-3.5" />, onClick: () => setShareDialogOpen(true) },
        { label: t("invoices.edit"), variant: "outline", icon: <Pencil className="h-3.5 w-3.5" />, onClick: handleEdit },
        { label: "PDF", variant: "outline", icon: <Download className="h-3.5 w-3.5" />, onClick: handleDownloadPdf },
      ];
    }
    if (invoice.status === "sent" || invoice.status === "partially_paid") {
      return [
        {
          label: t("invoices.markAsPaid", "Markera som betald"),
          variant: "primary",
          icon: <CheckCircle className="h-3.5 w-3.5" />,
          onClick: () => {
            setMarkAsPaidMode(true);
            setPaymentDialogOpen(true);
          },
        },
        {
          label: t("invoices.recordPayment", "Registrera betalning"),
          variant: "outline",
          icon: <CreditCard className="h-3.5 w-3.5" />,
          onClick: () => {
            setMarkAsPaidMode(false);
            setPaymentDialogOpen(true);
          },
        },
        ...(invoice.status === "sent"
          ? [{ label: t("invoices.edit"), variant: "outline" as const, icon: <Pencil className="h-3.5 w-3.5" />, onClick: () => setConfirmUnlock(true) }]
          : []),
        { label: t("invoices.reshare"), variant: "outline", icon: <Send className="h-3.5 w-3.5" />, onClick: () => setShareDialogOpen(true) },
        { label: "PDF", variant: "outline", icon: <Download className="h-3.5 w-3.5" />, onClick: handleDownloadPdf },
      ];
    }
    if (invoice.status === "paid" || invoice.status === "cancelled") {
      return [{ label: "PDF", variant: "outline", icon: <Download className="h-3.5 w-3.5" />, onClick: handleDownloadPdf }];
    }
    return [];
  })();

  const showOwnerDelete = isOwner && invoice.status === "draft";
  const showCustomerActions = !isOwner && invoice.status !== "draft";
  const showOwnerChat = isOwner && invoice.status !== "draft";

  // Title bar text
  const docTitle = `${t("invoices.invoiceLabel", "Faktura")} ${invoice.invoice_number ?? invoice.id.slice(0, 8)} · ${projectName}`;
  const docMeta = (() => {
    if (invoice.status === "draft") return t("invoices.draft", "Utkast");
    if (invoice.due_date) {
      return `${t("invoices.dueDate", "Förfallodag")}: ${new Date(invoice.due_date).toLocaleDateString("sv-SE")}`;
    }
    return t(`invoices.${statusKey}`);
  })();

  // Payment block — rendered inside document body, between totals and footer.
  const bankgiroVal = invoice.bankgiro || creator?.bankgiro;
  const accountVal = invoice.bank_account_number || creator?.bank_account_number;
  const showPaymentBlock = bankgiroVal || accountVal || invoice.ocr_reference;

  // Sidebar (owner only — customer gets sticky-bar at the bottom)
  const sidebar = isOwner ? (
    <>
      <SidebarCard label={t("invoices.statusLabel", "Status")}>
        <StatusPill tone={STATUS_TONE[displayStatus] ?? "neutral"} label={t(`invoices.${statusKey}`)} />
        {invoice.status === "sent" && (
          <div
            className="mt-2 flex items-center gap-1.5 text-xs"
            style={{ color: invoice.viewed_at ? "var(--rf-green)" : "var(--rf-fg-muted)" }}
          >
            <Eye className="h-3.5 w-3.5" />
            {invoice.viewed_at
              ? t("invoices.viewedAt", { time: formatDistanceToNow(new Date(invoice.viewed_at), { addSuffix: true }) })
              : t("invoices.waitingForCustomer", "Väntar på kund")}
          </div>
        )}
        {isOverdue && (
          <div className="mt-2 flex items-center gap-1.5 text-xs" style={{ color: "var(--rf-danger)" }}>
            <AlertTriangle className="h-3.5 w-3.5" />
            {t("invoices.overdueNotice", "Fakturan är förfallen")}
          </div>
        )}
        {paidAmount > 0 && invoice.status !== "paid" && (
          <div className="mt-2 text-xs" style={{ color: "var(--rf-fg-muted)" }}>
            {t("invoices.paidSoFar", { amount: fmtKr(paidAmount), defaultValue: `Betalt: ${fmtKr(paidAmount)}` })}
            <br />
            {t("invoices.remainingAmount", "Återstår")}: {fmtKr(remaining)}
          </div>
        )}
      </SidebarCard>

      {ownerActions.length > 0 && <SidebarActions actions={ownerActions} />}

      <SidebarCard label={t("invoices.activity", "Aktivitet")}>
        <SidebarTimeline
          items={[
            {
              what: t("invoices.created", "Skapad"),
              when: new Date(invoice.created_at).toLocaleDateString("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
            },
            ...(invoice.sent_at
              ? [{
                  what: t("invoices.sentToCustomer", "Skickad till kund"),
                  when: formatDistanceToNow(new Date(invoice.sent_at), { addSuffix: true }),
                }]
              : invoice.status !== "draft"
                ? [{ what: t("invoices.sentToCustomer", "Skickad till kund"), when: t("common.unknown", "—") }]
                : []),
            ...(invoice.viewed_at
              ? [{
                  what: t("invoices.openedByCustomer", "Öppnad av kund"),
                  when: formatDistanceToNow(new Date(invoice.viewed_at), { addSuffix: true }),
                }]
              : []),
            ...(invoice.status === "draft"
              ? [{ what: t("invoices.notSentYet", "Inte skickad än"), when: t("invoices.pending", "Väntar"), pending: true }]
              : []),
            ...(invoice.status === "paid"
              ? [{ what: t("invoices.paid", "Betald"), when: t("invoices.byCustomer", "Av kund") }]
              : invoice.status === "partially_paid"
                ? [{ what: t("invoices.partiallyPaid", "Delvis betald"), when: fmtKr(paidAmount) }]
                : []),
          ]}
        />
      </SidebarCard>

      <SidebarLinkBlock
        label={t("invoices.linkedProject", "Koppling")}
        title={projectName}
        subtitle={clientName ? `${t("invoices.recipient", "Mottagare")}: ${clientName}` : undefined}
        cta={{ label: t("invoices.openProject", "Öppna projekt"), onClick: () => navigate(`/projects/${invoice.project_id}`) }}
      />

      {showOwnerDelete && (
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="mt-2 inline-flex items-center justify-center gap-1.5 self-start text-xs"
          style={{ color: "var(--rf-danger)" }}
        >
          <Trash2 className="h-3 w-3" /> {t("invoices.deleteInvoice", "Ta bort faktura")}
        </button>
      )}
    </>
  ) : null;

  return (
    <div className="min-h-screen" style={{ background: "var(--rf-paper, #FAFAF7)" }}>
      <AppHeader userName={userName} userEmail={userEmail} avatarUrl={avatarUrl} onSignOut={handleSignOut} />

      {/* Top back-bar */}
      <div className="container mx-auto max-w-6xl px-4 pt-4">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 gap-2 text-muted-foreground hover:text-foreground"
          onClick={() => navigate(returnTo || (invoice.project_id ? `/projects/${invoice.project_id}` : "/start"))}
        >
          <ArrowLeft className="h-4 w-4" />
          {returnTo || invoice.project_id ? t("invoices.backToProject") : t("invoices.backToStart")}
        </Button>
      </div>

      {/* Document */}
      <div className="container mx-auto max-w-6xl px-4 py-6">
        <DocumentLayout
          title={docTitle}
          meta={docMeta}
          stamp={
            STAMP_FOR_STATUS[displayStatus] ? (
              <DocumentStatusStamp label={t(`invoices.${statusKey}`)} tone={STAMP_FOR_STATUS[displayStatus]!} />
            ) : null
          }
          main={
            <>
              <DocumentNumber
                type={t("invoices.invoiceLabel", "Faktura")}
                number={invoice.invoice_number ?? invoice.id.slice(0, 8)}
                rightLabel={invoice.due_date ? t("invoices.dueDate", "Förfallodag") : t("invoices.dateLabel", "Datum")}
                rightValue={
                  invoice.due_date
                    ? new Date(invoice.due_date).toLocaleDateString("sv-SE")
                    : new Date(invoice.created_at).toLocaleDateString("sv-SE")
                }
              />
              <DocumentParties
                from={{
                  name: creator?.company_name || creator?.name || "Renofine",
                  address: (
                    <>
                      {creator?.company_address}
                      {creator?.company_address && (creator.company_postal_code || creator.company_city) && <br />}
                      {[creator?.company_postal_code, creator?.company_city].filter(Boolean).join(" ")}
                      {creator?.org_number && (
                        <>
                          <br />
                          Org.nr {creator.org_number}
                        </>
                      )}
                    </>
                  ),
                }}
                to={{
                  name: clientName ?? t("invoices.recipient", "Mottagare"),
                  address: projectName ? <>{projectName}</> : undefined,
                }}
              />

              {invoice.free_text && (
                <div
                  className="mb-6 whitespace-pre-wrap"
                  style={{ fontSize: 13, color: "var(--rf-fg-muted)", lineHeight: 1.55 }}
                >
                  {invoice.free_text}
                </div>
              )}

              <DocumentLines items={lineItems} />

              <DocumentTotals
                rows={[
                  { label: t("quotes.subtotal"), value: fmtKr(subtotal) },
                  { label: t("quotes.vat"), value: fmtKr(vat) },
                  ...(paidAmount > 0
                    ? [{ label: t("invoices.paidAmount", "Betalt"), value: `−${fmtKr(paidAmount)}` }]
                    : []),
                ]}
                grand={
                  paidAmount > 0
                    ? { label: t("invoices.remainingAmount", "Återstår"), value: fmtKr(remaining) }
                    : hasRotEligible
                      ? { label: t("quotes.totalIncVat", "Totalt"), value: fmtKr(subtotal + vat) }
                      : { label: t("quotes.totalToPay"), value: fmtKr(totalToPay) }
                }
                rot={
                  hasRotEligible && totalRot > 0
                    ? {
                        label: t("quotes.rotDeduction", "ROT-avdrag"),
                        sublabel: t("quotes.afterRotHint", "Att betala efter avdrag"),
                        value: `−${fmtKr(totalRot)}`,
                      }
                    : undefined
                }
                afterRotGrand={
                  hasRotEligible && totalRot > 0 && paidAmount === 0
                    ? { label: t("quotes.totalToPay"), value: fmtKr(totalToPay) }
                    : undefined
                }
              />

              {/* Payment block (invoice-specific) — bankgiro / OCR / account */}
              {showPaymentBlock && (
                <div
                  className="mt-6 rounded-lg p-4"
                  style={{
                    background: "var(--rf-surface-2, #F5F2E8)",
                    border: "1px solid var(--rf-hairline, rgba(20, 15, 5, 0.10))",
                  }}
                >
                  <p
                    className="rf-eyebrow"
                    style={{ marginBottom: 8 }}
                  >
                    {t("invoices.paymentDetails", "Betalningsuppgifter")}
                  </p>
                  <div className="space-y-1 text-sm">
                    {bankgiroVal && (
                      <div className="flex justify-between gap-3">
                        <span style={{ color: "var(--rf-fg-muted)" }}>{t("invoices.bankgiro", "Bankgiro")}</span>
                        <span className="rf-num" style={{ fontWeight: 500 }}>{bankgiroVal}</span>
                      </div>
                    )}
                    {accountVal && (
                      <div className="flex justify-between gap-3">
                        <span style={{ color: "var(--rf-fg-muted)" }}>{t("invoices.bankAccountNumber", "Bankkonto")}</span>
                        <span className="rf-num" style={{ fontWeight: 500 }}>{accountVal}</span>
                      </div>
                    )}
                    {invoice.ocr_reference && (
                      <div className="flex justify-between gap-3">
                        <span style={{ color: "var(--rf-fg-muted)" }}>{t("invoices.ocrReference", "OCR")}</span>
                        <span className="rf-num" style={{ fontWeight: 500 }}>{invoice.ocr_reference}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          }
          sidebar={sidebar}
        />

        {/* Owner chat (collapsible) — below document */}
        {showOwnerChat && (
          <div className="mt-6 rf-paper">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setChatOpen(!chatOpen)}
              className="gap-2"
            >
              <MessageCircle className="h-4 w-4" />
              {t("invoices.questionsAboutInvoice", "Frågor om fakturan")}
              {chatOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
            {chatOpen && invoiceId && (
              <div
                className="mt-3 rounded-md border p-4"
                style={{ borderColor: "var(--rf-hairline)", background: "var(--rf-surface)" }}
              >
                <CommentsSection
                  entityId={invoiceId}
                  entityType="invoice"
                  projectId={invoice.project_id}
                  chatMode
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Customer sticky-bar — payment status + chat */}
      {showCustomerActions && (
        <div
          className="sticky bottom-0 z-40 border-t"
          style={{
            background: "var(--rf-surface)",
            borderColor: "var(--rf-hairline)",
            boxShadow: "0 -4px 12px -2px rgba(0,0,0,0.08)",
          }}
        >
          <div className="container mx-auto max-w-6xl px-4 py-3">
            {chatOpen && invoiceId && (
              <div className="mb-3 max-h-[300px] overflow-y-auto rounded-md border p-3" style={{ borderColor: "var(--rf-hairline)" }}>
                <CommentsSection
                  entityId={invoiceId}
                  entityType="invoice"
                  projectId={invoice.project_id}
                  chatMode
                />
              </div>
            )}

            {isOverdue && (
              <div className="mb-2 flex items-center gap-2 text-sm" style={{ color: "var(--rf-danger)" }}>
                <AlertTriangle className="h-4 w-4" />
                {t("invoices.overdueNotice", "Fakturan är förfallen")}
              </div>
            )}

            {invoice.status === "paid" ? (
              <div className="flex items-center gap-2 text-sm" style={{ color: "var(--rf-green)" }}>
                <CheckCircle className="h-5 w-5" />
                <span style={{ fontWeight: 500 }}>{t("invoices.paidThanks", "Betald — tack!")}</span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setChatOpen(!chatOpen)}
                  className="gap-2"
                >
                  <MessageCircle className="h-4 w-4" />
                  {t("invoices.questionsAboutInvoice", "Frågor")}
                  {chatOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </Button>
                <div className="flex-1" />
                <div className="text-right text-sm">
                  <div style={{ color: "var(--rf-fg-muted)" }}>{t("quotes.totalToPay", "Att betala")}</div>
                  <div className="rf-num" style={{ fontSize: 18, fontWeight: 600 }}>
                    {fmtKr(paidAmount > 0 ? remaining : totalToPay)}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dialogs */}
      <ShareInvoiceDialog
        invoiceId={invoiceId!}
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
        onSuccess={() => {
          if (!invoice) return;
          setInvoice({ ...invoice, status: "sent" });
          fetchInvoice();
        }}
      />

      <RecordPaymentDialog
        invoiceId={invoiceId!}
        totalAmount={totalToPay}
        paidAmount={paidAmount}
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        onSuccess={fetchInvoice}
        markAsPaid={markAsPaidMode}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("invoices.confirmDelete", "Ta bort faktura")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("invoices.confirmDeleteHint", "Det går inte att ångra.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              {t("common.delete", "Ta bort")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmUnlock} onOpenChange={setConfirmUnlock}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("invoices.unlockEditTitle", "Lås upp och redigera")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("invoices.unlockEditWarning", "Fakturan återgår till utkast och du kan redigera den.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnlockAndEdit}>
              {t("invoices.unlockAndEdit", "Lås upp")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/useAuthSession";
import { AppHeader } from "@/components/AppHeader";
import { updateInvoiceStatus, markInvoiceViewed, getDisplayStatus } from "@/services/invoiceService";
import { downloadInvoicePdf } from "@/services/invoicePdfService";
import { CommentsSection } from "@/components/comments/CommentsSection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Download,
  Trash2,
  ArrowLeft,
  Pencil,
  Send,
  MessageCircle,
  Eye,
  ChevronUp,
  ChevronDown,
  CreditCard,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";
import { ShareInvoiceDialog } from "@/components/invoices/ShareInvoiceDialog";
import { RecordPaymentDialog } from "@/components/invoices/RecordPaymentDialog";
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
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

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

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  partially_paid: "bg-amber-100 text-amber-700",
  cancelled: "bg-red-100 text-red-700",
  overdue: "bg-red-100 text-red-700",
};

export default function ViewInvoice() {
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
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [clientName, setClientName] = useState("");
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
    if (!user || !invoice || !invoiceId || isOwner || invoice.status !== "sent")
      return;
    markInvoiceViewed(invoiceId);
  }, [user, invoice, invoiceId, isOwner]);

  const fetchInvoice = async () => {
    if (!invoiceId) return;

    const { data: inv, error: iErr } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .single();

    if (iErr || !inv) {
      setLoading(false);
      return;
    }

    setInvoice(inv as InvoiceData);

    // Fetch client name if available
    if (inv.client_id_ref) {
      supabase
        .from("clients")
        .select("name")
        .eq("id", inv.client_id_ref)
        .maybeSingle()
        .then(({ data: cd }) => {
          if (cd?.name) setClientName(cd.name);
        });
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
      supabase
        .from("projects")
        .select("name")
        .eq("id", inv.project_id)
        .single(),
    ]);

    if (itemsRes.data) setItems(itemsRes.data as InvoiceItem[]);
    if (creatorRes.data) setCreator(creatorRes.data as CreatorProfile);
    if (projectRes.data) setProjectName(projectRes.data.name);

    setLoading(false);
  };

  const handleEdit = () => {
    navigate(
      `/invoices/new?editInvoiceId=${invoiceId}&projectId=${invoice?.project_id}`
    );
  };

  const handleUnlockAndEdit = async () => {
    if (!invoice || !invoiceId) return;
    const result = await updateInvoiceStatus(invoiceId, "draft");
    if (result) {
      setInvoice({ ...invoice, status: "draft" });
      setConfirmUnlock(false);
      navigate(
        `/invoices/new?editInvoiceId=${invoiceId}&projectId=${invoice.project_id}`
      );
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">
          {t("common.notFound", "Invoice not found")}
        </p>
      </div>
    );
  }

  const subtotal = items.reduce((s, i) => s + (i.total_price ?? 0), 0);
  const vat = Math.round(subtotal * 0.25 * 100) / 100;
  const totalRot = items.reduce((s, i) => s + (i.rot_deduction ?? 0), 0);
  const totalToPay = subtotal + vat - totalRot;
  const displayStatus = getDisplayStatus(invoice);
  const isOverdue = displayStatus === "overdue";

  const handleDelete = async () => {
    if (!invoiceId) return;
    await supabase.from("invoice_items").delete().eq("invoice_id", invoiceId);
    const { error } = await supabase
      .from("invoices")
      .delete()
      .eq("id", invoiceId);
    if (error) {
      console.error("Failed to delete invoice:", error);
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

  const statusKey =
    displayStatus === "overdue"
      ? "overdue"
      : displayStatus === "partially_paid"
        ? "partiallyPaid"
        : displayStatus;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        userName={userName}
        userEmail={userEmail}
        avatarUrl={avatarUrl}
        onSignOut={handleSignOut}
      />

      {/* Top bar */}
      <div className="container mx-auto px-4 pt-6 pb-4 max-w-3xl">
        <div className="flex items-center justify-between mb-4">
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 -ml-2 text-muted-foreground hover:text-foreground"
            onClick={() =>
              navigate(
                returnTo ||
                  (invoice.project_id
                    ? `/projects/${invoice.project_id}`
                    : "/start")
              )
            }
          >
            <ArrowLeft className="h-4 w-4" />
            {returnTo || invoice.project_id
              ? t("invoices.backToProject")
              : t("invoices.backToStart")}
          </Button>
          <div className="flex items-center gap-2">
            {invoice.is_ata && (
              <Badge variant="outline" className="text-xs">
                ÄTA
              </Badge>
            )}
            <Badge className={STATUS_COLORS[displayStatus] ?? ""}>
              {t(`invoices.${statusKey}`)}
            </Badge>
          </div>
        </div>

        {/* Overdue warning */}
        {isOverdue && isOwner && (
          <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 text-red-700 p-3 rounded-lg mb-4 text-sm">
            <AlertTriangle className="h-4 w-4" />
            {t("invoices.overdueNotice")}
          </div>
        )}

        {/* Quick actions for owner - draft */}
        {isOwner && invoice.status === "draft" && (
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={handleEdit}>
              <Pencil className="h-4 w-4 mr-1" />
              {t("invoices.edit")}
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
              <Download className="h-4 w-4 mr-1" />
              PDF
            </Button>
            <Button size="sm" onClick={() => setShareDialogOpen(true)}>
              <Send className="h-4 w-4 mr-1" />
              {t("invoices.shareWithCustomer")}
            </Button>
          </div>
        )}

        {/* Quick actions for owner - sent / overdue */}
        {isOwner &&
          (invoice.status === "sent" || invoice.status === "partially_paid") && (
            <div className="flex gap-2 items-center flex-wrap">
              {invoice.status === "sent" && invoice.viewed_at ? (
                <span className="text-sm text-green-600 flex items-center gap-1">
                  <Eye className="h-4 w-4" />
                  {t("invoices.viewedAt", {
                    time: formatDistanceToNow(new Date(invoice.viewed_at), {
                      addSuffix: true,
                    }),
                  })}
                </span>
              ) : invoice.status === "sent" ? (
                <span className="text-sm text-muted-foreground">
                  {t("invoices.waitingForCustomer")}
                </span>
              ) : null}
              <Button
                size="sm"
                onClick={() => {
                  setMarkAsPaidMode(false);
                  setPaymentDialogOpen(true);
                }}
              >
                <CreditCard className="h-4 w-4 mr-1" />
                {t("invoices.recordPayment")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-green-700 border-green-300 hover:bg-green-50 dark:text-green-400 dark:border-green-700 dark:hover:bg-green-900/20"
                onClick={() => {
                  setMarkAsPaidMode(true);
                  setPaymentDialogOpen(true);
                }}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                {t("invoices.markAsPaid", "Markera som betald")}
              </Button>
              {/* Only sent can revert to draft — partially_paid cannot */}
              {invoice.status === "sent" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmUnlock(true)}
                >
                  <Pencil className="h-4 w-4 mr-1" />
                  {t("invoices.edit")}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadPdf}
              >
                <Download className="h-4 w-4 mr-1" />
                PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShareDialogOpen(true)}
              >
                <Send className="h-4 w-4 mr-1" />
                {t("invoices.reshare")}
              </Button>
            </div>
          )}

        {/* Paid state */}
        {isOwner && invoice.status === "paid" && (
          <div className="flex gap-2 items-center flex-wrap">
            <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
              <Download className="h-4 w-4 mr-1" />
              PDF
            </Button>
          </div>
        )}
      </div>

      {/* Document preview */}
      <div className="bg-neutral-100 dark:bg-neutral-900 py-8">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="bg-white dark:bg-card shadow-xl rounded mx-auto max-w-[210mm] min-h-[280mm] relative flex flex-col" style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}>
            {/* Paid watermark */}
            {invoice.status === "paid" && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-green-200 dark:text-green-900/30 text-7xl font-bold rotate-[-30deg]">
                  {t("invoices.paidWatermark")}
                </span>
              </div>
            )}

            <div className="px-10 sm:px-14 md:px-16 py-10 sm:py-12 md:py-14 flex-1 flex flex-col text-[13px] leading-relaxed text-foreground">
              {/* Document header */}
              <div className="flex justify-between items-start mb-10">
                <div className="flex items-center gap-4">
                  {creator?.company_logo_url && (
                    <img
                      src={creator.company_logo_url}
                      alt=""
                      className="h-14 w-auto max-w-[180px] object-contain"
                    />
                  )}
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight">
                      {creator?.company_name || creator?.name || "Renofine"}
                    </h2>
                    {creator?.org_number && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Org.nr: {creator.org_number}
                      </p>
                    )}
                    {(creator?.company_address || creator?.company_city) && (
                      <p className="text-xs text-muted-foreground">
                        {[
                          creator.company_address,
                          [creator.company_postal_code, creator.company_city]
                            .filter(Boolean)
                            .join(" "),
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right text-sm text-muted-foreground">
                  <p>{new Date(invoice.created_at).toLocaleDateString("sv-SE")}</p>
                </div>
              </div>

              {/* Structured document title */}
              <div className="mb-8">
                <h1 className="text-2xl font-bold tracking-tight uppercase">
                  {t("invoices.invoiceLabel", "Faktura")}
                </h1>
                {projectName && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {t("invoices.projectLabel", "Projekt")}: {projectName}
                  </p>
                )}
                {clientName && (
                  <p className="text-sm text-muted-foreground">
                    {t("invoices.recipient", "Mottagare")}: {clientName}
                  </p>
                )}
                {invoice.invoice_number && (
                  <p className="text-sm text-muted-foreground">
                    {t("invoices.invoiceNumberLabel", "Fakturanr")}: {invoice.invoice_number}
                  </p>
                )}
                {invoice.due_date && (
                  <p className="text-sm text-muted-foreground">
                    {t("invoices.dueDate")}: {new Date(invoice.due_date).toLocaleDateString("sv-SE")}
                  </p>
                )}
              </div>

              {/* Free text */}
              {invoice.free_text && (
                <div className="whitespace-pre-wrap text-muted-foreground mb-8 text-[13px] leading-relaxed">
                  {invoice.free_text}
                </div>
              )}

              {/* Items table */}
              <table className="w-full mb-8 border-collapse">
                <thead>
                  <tr className="border-b-2 border-foreground/20">
                    <th className="text-left py-2.5 pr-4 font-semibold text-[12px] uppercase tracking-wide text-muted-foreground">
                      {t("quotes.description")}
                    </th>
                    <th className="text-right py-2.5 px-3 font-semibold text-[12px] uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                      {t("quotes.quantity")}
                    </th>
                    <th className="text-right py-2.5 px-3 font-semibold text-[12px] uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                      {t("quotes.unitPrice")}
                    </th>
                    <th className="text-right py-2.5 pl-3 font-semibold text-[12px] uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                      {t("quotes.totalAmount")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b border-foreground/8">
                      <td className="py-2.5 pr-4">
                        {item.description}
                        {item.is_rot_eligible && (
                          <span className="text-[11px] text-muted-foreground ml-1.5">
                            (ROT)
                          </span>
                        )}
                        {item.comment && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                            {item.comment}
                          </p>
                        )}
                      </td>
                      <td className="text-right py-2.5 px-3 whitespace-nowrap tabular-nums">
                        {item.quantity} {item.unit}
                      </td>
                      <td className="text-right py-2.5 px-3 whitespace-nowrap tabular-nums">
                        {item.unit_price.toLocaleString()} kr
                      </td>
                      <td className="text-right py-2.5 pl-3 whitespace-nowrap tabular-nums font-medium">
                        {item.total_price.toLocaleString()} kr
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Summary -- right-aligned */}
              <div className="ml-auto w-72 space-y-1.5 text-[13px] mb-10">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("quotes.subtotal")}</span>
                  <span className="tabular-nums">{subtotal.toLocaleString()} kr</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("quotes.vat")}</span>
                  <span className="tabular-nums">{vat.toLocaleString()} kr</span>
                </div>
                {totalRot > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>{t("quotes.rotDeduction")}</span>
                    <span className="tabular-nums">-{totalRot.toLocaleString()} kr</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base border-t-2 border-foreground/20 pt-2.5 mt-2">
                  <span>{t("quotes.totalToPay")}</span>
                  <span className="tabular-nums">{totalToPay.toLocaleString()} kr</span>
                </div>
                {(invoice.paid_amount ?? 0) > 0 && (
                  <>
                    <div className="flex justify-between text-green-600">
                      <span>{t("invoices.paidAmount")}</span>
                      <span className="tabular-nums">
                        -{(invoice.paid_amount ?? 0).toLocaleString()} kr
                      </span>
                    </div>
                    <div className="flex justify-between font-bold">
                      <span>{t("invoices.remainingAmount")}</span>
                      <span className="tabular-nums">
                        {(totalToPay - (invoice.paid_amount ?? 0)).toLocaleString()} kr
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Payment details block */}
              {(invoice.bankgiro || creator?.bankgiro || invoice.bank_account_number || creator?.bank_account_number || invoice.ocr_reference) && (
                <div className="border rounded-lg p-5 bg-muted/20 mb-10 text-[13px]">
                  <p className="font-semibold text-sm mb-2">
                    {t("invoices.paymentDetails")}
                  </p>
                  {(invoice.bankgiro || creator?.bankgiro) && (
                    <p className="text-muted-foreground">
                      {t("invoices.bankgiro")}: <span className="text-foreground font-medium">{invoice.bankgiro || creator?.bankgiro}</span>
                    </p>
                  )}
                  {(invoice.bank_account_number || creator?.bank_account_number) && (
                    <p className="text-muted-foreground">
                      {t("invoices.bankAccountNumber")}: <span className="text-foreground font-medium">{invoice.bank_account_number || creator?.bank_account_number}</span>
                    </p>
                  )}
                  {invoice.ocr_reference && (
                    <p className="text-muted-foreground">
                      {t("invoices.ocrReference")}: <span className="text-foreground font-medium">{invoice.ocr_reference}</span>
                    </p>
                  )}
                </div>
              )}

              {/* Footer -- pushed to bottom */}
              {creator &&
                (creator.company_name || creator.org_number || creator.email) && (
                  <div className="mt-auto pt-10">
                    <div className="border-t pt-4 text-[11px] text-muted-foreground flex justify-between gap-6">
                      <div className="space-y-0.5">
                        {creator.company_name && (
                          <p className="font-medium">{creator.company_name}</p>
                        )}
                        {creator.org_number && <p>Org.nr: {creator.org_number}</p>}
                        {(invoice.bankgiro || creator.bankgiro) && (
                          <p>Bankgiro: {invoice.bankgiro || creator.bankgiro}</p>
                        )}
                        {(creator.company_address || creator.company_city) && (
                          <p>
                            {[
                              creator.company_address,
                              [creator.company_postal_code, creator.company_city]
                                .filter(Boolean)
                                .join(" "),
                            ]
                              .filter(Boolean)
                              .join(", ")}
                          </p>
                        )}
                      </div>
                      <div className="space-y-0.5 text-right">
                        {creator.company_website && <p>{creator.company_website}</p>}
                        {creator.phone && <p>{creator.phone}</p>}
                        {creator.email && <p>{creator.email}</p>}
                      </div>
                    </div>
                  </div>
                )}
            </div>
          </div>
        </div>
      </div>

      {/* Below paper: owner sections */}
      {isOwner && (
        <div className="container mx-auto px-4 py-6 max-w-3xl space-y-6">
          {invoice.status !== "draft" && (
            <div className="bg-muted/30 rounded-lg border">
              <button
                type="button"
                onClick={() => setChatOpen(!chatOpen)}
                className="w-full flex items-center justify-between p-4"
              >
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-5 w-5 text-primary" />
                  <span className="font-medium">
                    {t("invoices.questionsAboutInvoice")}
                  </span>
                </div>
                {chatOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
              {chatOpen && (
                <div className="px-4 pb-4 space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {t("invoices.chatDescriptionOwner")}
                  </p>
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

          {invoice.status === "draft" && (
            <div className="pt-4 border-t">
              <Button
                variant="ghost"
                className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {t("invoices.deleteInvoice")}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Client view: sticky footer with chat */}
      {!isOwner && invoice.status !== "draft" && (
        <>
          <div className="h-32" />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
            <div className="container mx-auto px-4 max-w-3xl">
              <button
                type="button"
                onClick={() => setChatOpen(!chatOpen)}
                className="w-full flex items-center justify-between py-3"
              >
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">
                    {t("invoices.questionsAboutInvoice")}
                  </span>
                </div>
                {chatOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
              {chatOpen && (
                <div className="max-h-[40vh] overflow-y-auto border-t pt-3 pb-2">
                  <CommentsSection
                    entityId={invoiceId}
                    entityType="invoice"
                    projectId={invoice.project_id}
                    chatMode
                  />
                </div>
              )}

              {/* Payment info for client */}
              <div className="border-t py-3">
                {isOverdue && (
                  <div className="flex items-center gap-2 text-red-600 text-sm mb-2">
                    <AlertTriangle className="h-4 w-4" />
                    {t("invoices.overdueNotice")}
                  </div>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {t("quotes.totalToPay")}
                  </span>
                  <span className="font-bold">
                    {totalToPay.toLocaleString()} kr
                  </span>
                </div>
                {(invoice.paid_amount ?? 0) > 0 && (
                  <div className="flex items-center justify-between text-sm mt-1">
                    <span className="text-muted-foreground">
                      {t("invoices.remainingAmount")}
                    </span>
                    <span className="font-bold text-amber-600">
                      {(
                        totalToPay - (invoice.paid_amount ?? 0)
                      ).toLocaleString()}{" "}
                      kr
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("invoices.confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription />
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmUnlock} onOpenChange={setConfirmUnlock}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("invoices.unlockEditTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("invoices.unlockEditWarning")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnlockAndEdit}>
              {t("invoices.unlockAndEdit")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ShareInvoiceDialog
        invoiceId={invoiceId!}
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
        onSuccess={() => {
          setInvoice({ ...invoice, status: "sent" });
          fetchInvoice();
        }}
      />

      <RecordPaymentDialog
        invoiceId={invoiceId!}
        totalAmount={totalToPay}
        paidAmount={invoice.paid_amount ?? 0}
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        onSuccess={fetchInvoice}
        markAsPaid={markAsPaidMode}
      />
    </div>
  );
}

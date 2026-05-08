import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/useAuthSession";
import { AppHeader } from "@/components/AppHeader";
import { updateQuoteStatus, createTasksFromQuote, markQuoteViewed, reviseQuote } from "@/services/quoteService";
import { CommentsSection } from "@/components/comments/CommentsSection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, Download, Trash2, ArrowLeft, Pencil, Send, MessageCircle, XCircle, Eye, ChevronUp, ChevronDown, RefreshCw, FileText } from "lucide-react";
import { createInvoiceFromQuote } from "@/services/invoiceService";
import { ShareQuoteDialog } from "@/components/quotes/ShareQuoteDialog";
import { RotDetailsDialog } from "@/components/project/RotDetailsDialog";
import { AtaBudgetWarningSection } from "@/components/project/AtaBudgetWarningSection";
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
import confetti from "canvas-confetti";

interface QuoteData {
  id: string;
  title: string;
  status: string;
  project_id: string;
  creator_id: string;
  total_amount: number;
  total_rot_deduction: number;
  total_after_rot: number;
  created_at: string;
  free_text: string | null;
  viewed_at: string | null;
  revised_from: string | null;
}

interface QuoteItem {
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
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-blue-100 text-blue-700",
  accepted: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  expired: "bg-yellow-100 text-yellow-700",
};

export default function ViewQuote() {
  const { quoteId } = useParams<{ quoteId: string }>();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthSession();

  // Check if we came from a project
  const returnTo = searchParams.get("returnTo");

  const [userName, setUserName] = useState<string>();
  const [userEmail, setUserEmail] = useState<string>();
  const [avatarUrl, setAvatarUrl] = useState<string>();
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [creator, setCreator] = useState<CreatorProfile | null>(null);
  const [projectName, setProjectName] = useState("");
  const [clientName, setClientName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [confirmUnlock, setConfirmUnlock] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [celebrationShown, setCelebrationShown] = useState(false);
  const [rotDialogOpen, setRotDialogOpen] = useState(false);
  const [rotProfileId, setRotProfileId] = useState<string | null>(null);
  const [rotPersonnummer, setRotPersonnummer] = useState<string | null>(null);
  const [rotAddress, setRotAddress] = useState<string | null>(null);
  const [rotPropertyDesignation, setRotPropertyDesignation] = useState<string | null>(null);
  const [revisedFromQuote, setRevisedFromQuote] = useState<{ id: string; quote_number: string | null } | null>(null);
  const [latestRevision, setLatestRevision] = useState<{ id: string; quote_number: string | null } | null>(null);

  // Celebrate when the owner first sees their accepted quote
  useEffect(() => {
    if (!quote || !isOwner || celebrationShown) return;
    if (quote.status !== "accepted") return;
    setCelebrationShown(true);
    confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
    toast.success(t("quotes.quoteAccepted"));
  }, [quote, isOwner, celebrationShown, t]);

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
    if (!quoteId) return;
    fetchQuote();
  }, [quoteId]);

  // Separate ownership check — runs once both user and quote are loaded
  useEffect(() => {
    if (!user || !quote) return;
    supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data?.id === quote.creator_id) setIsOwner(true);
      });
  }, [user?.id, quote?.creator_id]);

  // Mark quote as viewed when a non-owner views a sent quote
  useEffect(() => {
    if (!user || !quote || !quoteId || isOwner || quote.status !== "sent") return;
    markQuoteViewed(quoteId);
  }, [user, quote, quoteId, isOwner]);

  const fetchQuote = async () => {
    if (!quoteId) return;

    const { data: q, error: qErr } = await supabase
      .from("quotes")
      .select("*")
      .eq("id", quoteId)
      .single();

    if (qErr || !q) {
      setLoading(false);
      return;
    }

    setQuote(q as QuoteData);

    const [itemsRes, creatorRes, projectRes] = await Promise.all([
      supabase
        .from("quote_items")
        .select("*")
        .eq("quote_id", quoteId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("profiles")
        .select("name, company_name, avatar_url, org_number, company_address, company_postal_code, company_city, email, phone, company_website, company_logo_url")
        .eq("id", q.creator_id)
        .single(),
      supabase
        .from("projects")
        .select("name")
        .eq("id", q.project_id)
        .single(),
    ]);

    if (itemsRes.data) setItems(itemsRes.data as QuoteItem[]);
    if (creatorRes.data) setCreator(creatorRes.data as CreatorProfile);
    if (projectRes.data) setProjectName(projectRes.data.name);

    // Fetch client name if linked
    const clientIdRef = (q as Record<string, unknown>).client_id_ref as string | null;
    if (clientIdRef) {
      const { data: clientData } = await supabase
        .from("clients")
        .select("name")
        .eq("id", clientIdRef)
        .maybeSingle();
      if (clientData?.name) setClientName(clientData.name);
    }

    // Fetch revision chain
    const revisedFrom = (q as Record<string, unknown>).revised_from as string | null;
    if (revisedFrom) {
      const { data: parent } = await supabase
        .from("quotes")
        .select("id, quote_number")
        .eq("id", revisedFrom)
        .single();
      if (parent) setRevisedFromQuote(parent as { id: string; quote_number: string | null });
    } else {
      setRevisedFromQuote(null);
    }

    const { data: revision } = await supabase
      .from("quotes")
      .select("id, quote_number")
      .eq("revised_from", quoteId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setLatestRevision(revision as { id: string; quote_number: string | null } | null);

    setLoading(false);
  };

  const handleAccept = async () => {
    if (!quote || !quoteId) return;
    setActing(true);

    const result = await updateQuoteStatus(quoteId, "accepted");
    if (!result) {
      setActing(false);
      return;
    }

    // Convert lead project to active
    const { data: project } = await supabase
      .from("projects")
      .select("project_type, status")
      .eq("id", quote.project_id)
      .single();

    if (project) {
      await supabase
        .from("projects")
        .update({ status: "active" })
        .eq("id", quote.project_id);
    }

    confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });

    setQuote({ ...quote, status: "accepted" });

    await createTasksFromQuote(quoteId);

    // Post comment about acceptance
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, name")
        .eq("user_id", user.id)
        .single();

      if (profile) {
        await supabase.from("comments").insert({
          entity_id: quoteId,
          entity_type: "quote",
          project_id: quote.project_id,
          content: t("quotes.quoteAcceptedMessage", {
            name: profile.name,
            title: quote.title,
          }),
          created_by_user_id: profile.id,
        });
      }
    }

    // Check if quote has ROT-eligible items → prompt customer (not owner) for ROT details
    const hasRotItems = items.some((i) => i.is_rot_eligible);
    if (hasRotItems && !isOwner) {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser) {
        const { data: customerProfile } = await supabase
          .from("profiles")
          .select("id, personnummer")
          .eq("user_id", currentUser.id)
          .single();

        const { data: projectData } = await supabase
          .from("projects")
          .select("address, property_designation")
          .eq("id", quote.project_id)
          .single();

        if (customerProfile) {
          setRotProfileId(customerProfile.id);
          setRotPersonnummer(customerProfile.personnummer ?? null);
          setRotAddress(projectData?.address ?? null);
          setRotPropertyDesignation(
            (projectData as Record<string, unknown>)?.property_designation as string | null ?? null
          );
          setRotDialogOpen(true);
          setActing(false);
          return;
        }
      }
    }

    toast.success(t("quotes.quoteAccepted"));
    setActing(false);
  };

  const handleEdit = () => {
    // Navigate back to edit mode - for now, we could create a duplicate
    // In a full implementation, we'd have an edit page
    navigate(`/quotes/new?editQuoteId=${quoteId}&projectId=${quote?.project_id}`);
  };

  const handleReject = async () => {
    if (!quote || !quoteId) return;
    setActing(true);

    const result = await updateQuoteStatus(quoteId, "rejected");
    if (!result) {
      setActing(false);
      return;
    }

    setQuote({ ...quote, status: "rejected" });

    // Post comment about rejection
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (currentUser) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, name")
        .eq("user_id", currentUser.id)
        .single();

      if (profile) {
        await supabase.from("comments").insert({
          entity_id: quoteId,
          entity_type: "quote",
          project_id: quote.project_id,
          content: t("quotes.quoteRejectedMessage", {
            name: profile.name,
            title: quote.title,
          }),
          created_by_user_id: profile.id,
        });
      }
    }

    toast.success(t("quotes.quoteDeclined"));
    setActing(false);
  };

  const handleUnlockAndEdit = async () => {
    if (!quote || !quoteId) return;
    const result = await updateQuoteStatus(quoteId, "draft");
    if (result) {
      setQuote({ ...quote, status: "draft" });
      setConfirmUnlock(false);
      navigate(`/quotes/new?editQuoteId=${quoteId}&projectId=${quote.project_id}`);
    }
  };

  const handleRevise = async () => {
    if (!quoteId || !quote) return;
    setActing(true);
    const newId = await reviseQuote(quoteId);
    if (newId) {
      navigate(`/quotes/new?editQuoteId=${newId}&projectId=${quote.project_id}`);
    }
    setActing(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">{t("common.notFound", "Quote not found")}</p>
      </div>
    );
  }

  const subtotal = items.reduce((s, i) => s + (i.total_price ?? 0), 0);
  const vat = Math.round(subtotal * 0.25 * 100) / 100;
  const totalRot = items.reduce((s, i) => s + (i.rot_deduction ?? 0), 0);
  const totalToPay = subtotal + vat - totalRot;

  const isSent = quote.status === "sent";

  const handleDelete = async () => {
    if (!quoteId) return;
    // Delete items first, then quote
    await supabase.from("quote_items").delete().eq("quote_id", quoteId);
    const { error } = await supabase.from("quotes").delete().eq("id", quoteId);
    if (error) {
      console.error("Failed to delete quote:", error);
      toast.error(t("errors.generic"));
    } else {
      toast.success(t("quotes.quoteDeleted"));
      navigate("/start");
    }
    setConfirmDelete(false);
  };

  const handleDownloadPdf = async () => {
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pw = 190; // page width usable
    const contentLimit = 255; // leave room for footer
    let y = 20;

    // Footer helper — draws on every page
    const drawFooter = () => {
      if (!creator) return;
      const footerY = 275;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.line(15, footerY - 3, 195, footerY - 3);

      // Left side: company name, org nr, address
      const leftParts: string[] = [];
      if (creator.company_name) leftParts.push(creator.company_name);
      if (creator.org_number) leftParts.push(`Org.nr: ${creator.org_number}`);
      if (creator.company_address) leftParts.push(creator.company_address);
      if (creator.company_postal_code || creator.company_city) {
        leftParts.push([creator.company_postal_code, creator.company_city].filter(Boolean).join(" "));
      }
      doc.text(leftParts.join("  |  "), 15, footerY);

      // Right side: website, phone, email
      const rightParts: string[] = [];
      if (creator.company_website) rightParts.push(creator.company_website);
      if (creator.phone) rightParts.push(creator.phone);
      if (creator.email) rightParts.push(creator.email);
      doc.text(rightParts.join("  |  "), 195, footerY, { align: "right" });
    };

    const newPageIfNeeded = (needed: number) => {
      if (y + needed > contentLimit) {
        drawFooter();
        doc.addPage();
        y = 20;
      }
    };

    // Header — logo + company name
    if (creator?.company_logo_url) {
      try {
        const img = new Image();
        img.crossOrigin = "anonymous";
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject();
          img.src = creator.company_logo_url!;
        });
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext("2d")?.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL("image/png");

        const ratio = img.width / img.height;
        const logoH = 12;
        const logoW = logoH * ratio;
        doc.addImage(dataUrl, "PNG", 15, y, logoW, logoH);
        y += logoH + 3;
      } catch {
        // Logo load failed — continue without it
      }
    }

    doc.setFontSize(16);
    doc.text(creator?.company_name || creator?.name || "Renofine", 15, y);
    y += 8;
    doc.setFontSize(10);
    doc.text(new Date(quote.created_at).toLocaleDateString("sv-SE"), 15, y);
    y += 10;

    // Title
    const qNum = (quote as Record<string, unknown>).quote_number as string | null;
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(t("quotes.quoteLabel", "Offert").toUpperCase(), 15, y);
    y += 6;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    if (projectName) {
      doc.text(`${t("quotes.projectLabel", "Projekt")}: ${projectName}`, 15, y);
      y += 5;
    }
    if (clientName) {
      doc.text(`${t("quotes.recipient", "Mottagare")}: ${clientName}`, 15, y);
      y += 5;
    }
    if (qNum) {
      doc.text(`${t("quotes.quoteNumberLabel", "Offertnr")}: ${qNum}`, 15, y);
      y += 5;
    }
    y += 3;

    // Free text introduction — above items
    if (quote.free_text) {
      doc.setFontSize(9);
      const ftLines = doc.splitTextToSize(quote.free_text, pw);
      newPageIfNeeded(ftLines.length * 4 + 4);
      doc.text(ftLines, 15, y);
      y += ftLines.length * 4 + 4;
    }

    y += 2;

    // Table header
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(t("quotes.description"), 15, y);
    doc.text(t("quotes.quantity"), 105, y, { align: "right" });
    doc.text(t("quotes.unitPrice"), 135, y, { align: "right" });
    doc.text(t("quotes.discount", "Discount"), 160, y, { align: "right" });
    doc.text(t("quotes.totalAmount"), 195, y, { align: "right" });
    y += 2;
    doc.line(15, y, 195, y);
    y += 5;
    doc.setFont("helvetica", "normal");

    // Items
    for (const item of items) {
      const discount = item.discount_percent ?? 0;
      const lineHeight = item.comment ? 10 : 6;
      newPageIfNeeded(lineHeight);

      doc.text(item.description || "—", 15, y, { maxWidth: 80 });
      doc.text(`${item.quantity} ${item.unit}`, 105, y, { align: "right" });
      doc.text(`${item.unit_price.toLocaleString()} kr`, 135, y, { align: "right" });
      doc.text(discount > 0 ? `${discount}%` : "—", 160, y, { align: "right" });
      doc.text(`${item.total_price.toLocaleString()} kr`, 195, y, { align: "right" });
      y += 6;

      if (item.comment) {
        doc.setFontSize(7);
        doc.setTextColor(130, 130, 130);
        doc.text(item.comment, 15, y, { maxWidth: 80 });
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(9);
        y += 4;
      }
    }

    // Summary
    newPageIfNeeded(30);
    y += 4;
    doc.line(15, y, 195, y);
    y += 6;
    doc.text(t("quotes.subtotal"), 15, y);
    doc.text(`${subtotal.toLocaleString()} kr`, 195, y, { align: "right" });
    y += 5;
    doc.text(t("quotes.vat"), 15, y);
    doc.text(`${vat.toLocaleString()} kr`, 195, y, { align: "right" });
    y += 5;
    if (totalRot > 0) {
      doc.text(t("quotes.rotDeduction"), 15, y);
      doc.text(`-${totalRot.toLocaleString()} kr`, 195, y, { align: "right" });
      y += 5;
    }
    doc.setFont("helvetica", "bold");
    doc.text(t("quotes.totalToPay"), 15, y);
    doc.text(`${totalToPay.toLocaleString()} kr`, 195, y, { align: "right" });

    // Draw footer on last page
    drawFooter();

    doc.save(`${quote.title.replace(/[^a-zåäö0-9]/gi, "_")}.pdf`);

    // Finalize draft → sent on PDF download
    if (quote.status === "draft") {
      const result = await updateQuoteStatus(quoteId!, "sent");
      if (result) {
        setQuote({ ...quote, status: "sent" });
        toast.success(t("quotes.quoteFinalizedOnPdf"));
      }
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        userName={userName}
        userEmail={userEmail}
        avatarUrl={avatarUrl}
        onSignOut={handleSignOut}
      />
      {/* Top bar: back + status + actions */}
      <div className="container mx-auto px-4 pt-6 pb-4 max-w-3xl">
        <div className="flex items-center justify-between mb-4">
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 -ml-2 text-muted-foreground hover:text-foreground"
            onClick={() => {
              if (isOwner) {
                navigate(returnTo || (quote.project_id ? `/projects/${quote.project_id}` : "/start"));
              } else if (quote.status === "accepted") {
                navigate(`/projects/${quote.project_id}`);
              } else {
                navigate("/start");
              }
            }}
          >
            <ArrowLeft className="h-4 w-4" />
            {isOwner
              ? (returnTo || quote.project_id ? t("quotes.backToProject") : t("quotes.backToStart"))
              : quote.status === "accepted"
                ? t("quotes.backToProject")
                : t("quotes.backToStart")}
          </Button>
          <Badge className={STATUS_COLORS[quote.status] ?? ""}>
            {t(`quotes.${quote.status}`)}
          </Badge>
        </div>

        {/* Quick actions for owner - draft */}
        {isOwner && quote.status === "draft" && (
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={handleEdit}
            >
              <Pencil className="h-4 w-4 mr-1" />
              {t("quotes.edit")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadPdf}
            >
              <Download className="h-4 w-4 mr-1" />
              PDF
            </Button>
            <Button
              size="sm"
              onClick={() => setShareDialogOpen(true)}
            >
              <Send className="h-4 w-4 mr-1" />
              {t("quotes.shareWithCustomer")}
            </Button>
          </div>
        )}

        {/* Quick actions for owner - sent */}
        {isOwner && quote.status === "sent" && (
          <div className="flex gap-2 items-center flex-wrap">
            {quote.viewed_at ? (
              <span className="text-sm text-green-600 flex items-center gap-1">
                <Eye className="h-4 w-4" />
                {t("quotes.viewedAt", {
                  time: formatDistanceToNow(new Date(quote.viewed_at), { addSuffix: true }),
                })}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">
                {t("quotes.waitingForCustomer")}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmUnlock(true)}
            >
              <Pencil className="h-4 w-4 mr-1" />
              {t("quotes.edit")}
            </Button>
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
              {t("quotes.reshare")}
            </Button>
            <span className="text-muted-foreground mx-1">|</span>
            <Button
              variant="ghost"
              size="sm"
              className="text-green-700 hover:text-green-800 hover:bg-green-50"
              onClick={handleAccept}
              disabled={acting}
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              {t("quotes.markAccepted", "Mark as accepted")}
            </Button>
          </div>
        )}

        {/* Quick actions for owner - rejected */}
        {isOwner && quote.status === "rejected" && (
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              onClick={handleRevise}
              disabled={acting}
            >
              {acting ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1" />
              )}
              {acting ? t("quotes.creatingRevision") : t("quotes.reviseQuote")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadPdf}
            >
              <Download className="h-4 w-4 mr-1" />
              PDF
            </Button>
          </div>
        )}

        {/* Quick actions for owner - accepted */}
        {isOwner && quote.status === "accepted" && (
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              onClick={async () => {
                if (!quoteId || !quote) return;
                setActing(true);
                try {
                  const invoice = await createInvoiceFromQuote(quoteId, quote.creator_id);
                  if (invoice) {
                    toast.success(t("quotes.invoiceCreated", "Faktura skapad från offert"));
                    navigate(`/invoices/${invoice.id}`);
                  }
                } finally {
                  setActing(false);
                }
              }}
              disabled={acting}
            >
              {acting ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <FileText className="h-4 w-4 mr-1" />
              )}
              {t("quotes.createInvoice", "Skapa faktura")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadPdf}
            >
              <Download className="h-4 w-4 mr-1" />
              PDF
            </Button>
          </div>
        )}
      </div>

      {/* Document preview area */}
      <div className="bg-muted/40 py-8">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="bg-white dark:bg-card shadow-lg rounded-sm mx-auto px-12 py-10 max-w-[210mm] min-h-[297mm] relative flex flex-col">

            {/* Document header: company name left, date right */}
            <div className="flex justify-between items-start mb-8">
              <div className="flex items-center gap-3">
                {creator?.company_logo_url && (
                  <img src={creator.company_logo_url} alt="" className="h-12 w-auto max-w-[160px] object-contain" />
                )}
                <div>
                  <h2 className="text-lg font-semibold">
                    {creator?.company_name || creator?.name || "Renofine"}
                  </h2>
                  {creator?.org_number && (
                    <p className="text-xs text-muted-foreground">Org.nr: {creator.org_number}</p>
                  )}
                  {(creator?.company_address || creator?.company_city) && (
                    <p className="text-xs text-muted-foreground">
                      {[creator.company_address, [creator.company_postal_code, creator.company_city].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
                    </p>
                  )}
                </div>
              </div>
              <div className="text-right text-sm text-muted-foreground">
                <p>{new Date(quote.created_at).toLocaleDateString()}</p>
              </div>
            </div>

            {/* Structured document title */}
            <div className="mb-6">
              <h1 className="text-xl font-bold uppercase">
                {t("quotes.quoteLabel", "Offert")}
              </h1>
              {projectName && (
                <p className="text-sm text-muted-foreground mt-1">
                  {t("quotes.projectLabel", "Projekt")}: {projectName}
                </p>
              )}
              {clientName && (
                <p className="text-sm text-muted-foreground">
                  {t("quotes.recipient", "Mottagare")}: {clientName}
                </p>
              )}
              {(quote as Record<string, unknown>).quote_number && (
                <p className="text-sm text-muted-foreground">
                  {t("quotes.quoteNumberLabel", "Offertnr")}: {(quote as Record<string, unknown>).quote_number}
                </p>
              )}
              {revisedFromQuote && (
                <p className="text-sm text-blue-600 mt-1">
                  <button
                    type="button"
                    className="underline hover:text-blue-800"
                    onClick={() => navigate(`/quotes/${revisedFromQuote.id}`)}
                  >
                    {t("quotes.revisionOf", { number: revisedFromQuote.quote_number || revisedFromQuote.id.slice(0, 8) })}
                  </button>
                </p>
              )}
              {latestRevision && (
                <p className="text-sm text-orange-600 mt-1">
                  <button
                    type="button"
                    className="underline hover:text-orange-800"
                    onClick={() => navigate(`/quotes/${latestRevision.id}`)}
                  >
                    {t("quotes.revisedAs", { number: latestRevision.quote_number || latestRevision.id.slice(0, 8) })}
                  </button>
                </p>
              )}
            </div>

            {/* Free text introduction — above items */}
            {quote.free_text && (
              <div className="whitespace-pre-wrap text-muted-foreground mb-6 text-sm leading-relaxed">
                {quote.free_text}
              </div>
            )}

            {/* Items table */}
            {(() => {
              const hasAnyDiscount = items.some((i) => (i.discount_percent ?? 0) > 0);
              return (
                <table className="w-full text-sm mb-6">
                  <thead>
                    <tr className="border-b-2 border-foreground/20">
                      <th className="text-left py-2 font-medium">{t("quotes.description")}</th>
                      <th className="text-right py-2 font-medium">{t("quotes.quantity")}</th>
                      <th className="text-right py-2 font-medium">{t("quotes.unitPrice")}</th>
                      {hasAnyDiscount && (
                        <th className="text-right py-2 font-medium">{t("quotes.discount", "Discount")}</th>
                      )}
                      <th className="text-right py-2 font-medium">{t("quotes.totalAmount")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const discount = item.discount_percent ?? 0;
                      return (
                        <tr key={item.id} className="border-b border-foreground/10">
                          <td className="py-2 pr-4">
                            {item.description}
                            {item.is_rot_eligible && (
                              <span className="text-xs text-muted-foreground ml-1">(ROT)</span>
                            )}
                            {item.comment && (
                              <p className="text-xs text-muted-foreground mt-0.5">{item.comment}</p>
                            )}
                          </td>
                          <td className="text-right py-2">
                            {item.quantity} {item.unit}
                          </td>
                          <td className="text-right py-2">
                            {item.unit_price.toLocaleString()} kr
                          </td>
                          {hasAnyDiscount && (
                            <td className="text-right py-2">
                              {discount > 0 ? `${discount}%` : "—"}
                            </td>
                          )}
                          <td className="text-right py-2">
                            {item.total_price.toLocaleString()} kr
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              );
            })()}

            {/* Summary — right-aligned */}
            <div className="ml-auto w-64 space-y-1 text-sm mb-8">
              <div className="flex justify-between">
                <span>{t("quotes.subtotal")}</span>
                <span>{subtotal.toLocaleString()} kr</span>
              </div>
              <div className="flex justify-between">
                <span>{t("quotes.vat")}</span>
                <span>{vat.toLocaleString()} kr</span>
              </div>
              {totalRot > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>{t("quotes.rotDeduction")}</span>
                  <span>-{totalRot.toLocaleString()} kr</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base border-t pt-2">
                <span>{t("quotes.totalToPay")}</span>
                <span>{totalToPay.toLocaleString()} kr</span>
              </div>
            </div>

            {/* Footer — pushed to bottom */}
            {creator && (creator.company_name || creator.org_number || creator.email) && (
              <div className="mt-auto pt-8">
                <div className="border-t pt-3 text-xs text-muted-foreground flex justify-between gap-4">
                  <div className="space-y-0.5">
                    {creator.company_name && <p className="font-medium">{creator.company_name}</p>}
                    {creator.org_number && <p>Org.nr: {creator.org_number}</p>}
                    {(creator.company_address || creator.company_city) && (
                      <p>{[creator.company_address, [creator.company_postal_code, creator.company_city].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</p>
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

      {/* Below paper: owner-only sections (chat + delete) */}
      {isOwner && (
        <div className="container mx-auto px-4 py-6 max-w-3xl space-y-6">
          {/* Owner chat — collapsible */}
          {(isSent || quote.status === "accepted" || quote.status === "rejected") && (
            <div className="bg-muted/30 rounded-lg border">
              <button
                type="button"
                onClick={() => setChatOpen(!chatOpen)}
                className="w-full flex items-center justify-between p-4"
              >
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-5 w-5 text-primary" />
                  <span className="font-medium">
                    {quote.status === "accepted"
                      ? t("quotes.questionsAfterAccept")
                      : t("quotes.questionsAboutQuote")}
                  </span>
                </div>
                {chatOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
              </button>
              {chatOpen && (
                <div className="px-4 pb-4 space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {t("quotes.chatDescriptionOwner")}
                  </p>
                  <CommentsSection
                    entityId={quoteId}
                    entityType="quote"
                    projectId={quote.project_id}
                    chatMode
                  />
                </div>
              )}
            </div>
          )}

          {/* Delete button for owner */}
          {(quote.status === "draft" || quote.status === "sent") && (
            <div className="pt-4 border-t">
              <Button
                variant="ghost"
                className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {t("quotes.deleteQuote")}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Spacer so sticky footer doesn't overlap content */}
      {!isOwner && (isSent || quote.status === "accepted" || quote.status === "rejected") && (
        <div className="h-44" />
      )}

      {/* Sticky footer for customer */}
      {!isOwner && (isSent || quote.status === "accepted" || quote.status === "rejected") && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
          <div className="container mx-auto px-4 max-w-3xl">
            {/* Chat toggle header */}
            <button
              type="button"
              onClick={() => setChatOpen(!chatOpen)}
              className="w-full flex items-center justify-between py-3"
            >
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">
                  {quote.status === "accepted"
                    ? t("quotes.questionsAfterAccept")
                    : t("quotes.questionsAboutQuote")}
                </span>
              </div>
              {chatOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
            </button>

            {/* Expandable chat panel */}
            {chatOpen && (
              <div className="max-h-[40vh] overflow-y-auto border-t pt-3 pb-2">
                <CommentsSection
                  entityId={quoteId}
                  entityType="quote"
                  projectId={quote.project_id}
                  chatMode
                />
              </div>
            )}

            {/* Action area — always visible */}
            <div className="border-t py-3 space-y-2">
              {isSent && (
                <>
                  <AtaBudgetWarningSection
                    projectId={quote.project_id}
                    pendingQuoteAmount={quote.total_amount}
                    excludeQuoteId={quote.id}
                  />
                  <Button
                    className="w-full min-h-[48px] bg-green-600 hover:bg-green-700 text-base"
                    onClick={handleAccept}
                    disabled={acting}
                  >
                    {acting ? (
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    ) : (
                      <CheckCircle className="h-5 w-5 mr-2" />
                    )}
                    {t("quotes.acceptQuote")}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleReject}
                    disabled={acting}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    {t("quotes.rejectQuote")}
                  </Button>
                  <p className="text-xs text-center text-muted-foreground">
                    {t("quotes.acceptHint")}
                  </p>
                </>
              )}

              {quote.status === "accepted" && (
                <div className="flex items-center gap-3 py-1">
                  <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-green-800 text-sm">{t("quotes.youAccepted")}</p>
                    <p className="text-xs text-green-700">{t("quotes.acceptedNextSteps")}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-green-300 text-green-700 hover:bg-green-100 shrink-0"
                    onClick={() => navigate(`/projects/${quote.project_id}`)}
                  >
                    {t("customerView.tabTitle")}
                    <ArrowLeft className="h-4 w-4 ml-1 rotate-180" />
                  </Button>
                </div>
              )}

              {quote.status === "rejected" && (
                <div className="flex items-center gap-3 py-1">
                  <XCircle className="h-5 w-5 text-red-600 shrink-0" />
                  <div>
                    <p className="font-medium text-red-800 text-sm">{t("quotes.youRejected")}</p>
                    <p className="text-xs text-red-700">{t("quotes.rejectedNextSteps")}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("quotes.confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription />
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmUnlock} onOpenChange={setConfirmUnlock}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("quotes.unlockEditTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("quotes.unlockEditWarning")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnlockAndEdit}>
              {t("quotes.unlockAndEdit")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ShareQuoteDialog
        quoteId={quoteId!}
        projectId={quote.project_id}
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
        onSuccess={() => {
          setQuote({ ...quote, status: "sent" });
          fetchQuote();
        }}
      />

      {rotProfileId && (
        <RotDetailsDialog
          open={rotDialogOpen}
          onOpenChange={setRotDialogOpen}
          projectId={quote.project_id}
          profileId={rotProfileId}
          existingPersonnummer={rotPersonnummer}
          existingAddress={rotAddress}
          existingPropertyDesignation={rotPropertyDesignation}
          onSaved={() => {
            toast.success(t("quotes.quoteAccepted"));
          }}
        />
      )}
    </div>
  );
}

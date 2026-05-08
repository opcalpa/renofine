/**
 * ViewQuoteV2 — read-only quote document with paper-warm DocumentLayout.
 *
 * Reuses the same data fetching, status transitions, and side effects as the
 * v1 ViewQuote.tsx — only the visual shell is new. PDF generation is shared
 * via quotePdfService.
 *
 * Feature-flagged in App.tsx via USE_QUOTE_VIEW_V2; flip to false to fall back
 * to the original ViewQuote.
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
  XCircle,
  Loader2,
  Eye,
  RefreshCw,
  FileText,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import confetti from "canvas-confetti";
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
import { ShareQuoteDialog } from "@/components/quotes/ShareQuoteDialog";
import { RotDetailsDialog } from "@/components/project/RotDetailsDialog";
import { AtaBudgetWarningSection } from "@/components/project/AtaBudgetWarningSection";

import {
  updateQuoteStatus,
  createTasksFromQuote,
  markQuoteViewed,
  reviseQuote,
} from "@/services/quoteService";
import { createInvoiceFromQuote } from "@/services/invoiceService";
import { downloadQuotePdf } from "@/services/quotePdfService";

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
  quote_number?: string | null;
  is_ata?: boolean | null;
  ata_reason?: string | null;
  ata_time_shift_days?: number | null;
}

interface AtaPhoto {
  id: string;
  storage_path: string;
  caption: string | null;
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

const STATUS_TONE: Record<string, StatusTone> = {
  draft: "draft",
  sent: "sent",
  accepted: "accepted",
  rejected: "rejected",
  expired: "neutral",
};

const STAMP_FOR_STATUS: Partial<Record<string, StampTone>> = {
  sent: "sent",
  accepted: "paid",
  rejected: "rejected",
};

function fmtKr(n: number): string {
  return `${n.toLocaleString("sv-SE")} kr`;
}

export default function ViewQuoteV2() {
  const { quoteId } = useParams<{ quoteId: string }>();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthSession();

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
  // ÄTA-specific: site-visit photos for the change-order grid (only fetched when is_ata)
  const [ataPhotos, setAtaPhotos] = useState<AtaPhoto[]>([]);

  // ─── effects ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!quote || !isOwner || celebrationShown) return;
    if (quote.status !== "accepted") return;
    setCelebrationShown(true);
    confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
    toast.success(t("quotes.quoteAccepted"));
  }, [quote, isOwner, celebrationShown, t]);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("name, avatar_url").eq("user_id", user.id).single().then(({ data }) => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId]);

  useEffect(() => {
    if (!user || !quote) return;
    supabase.from("profiles").select("id").eq("user_id", user.id).single().then(({ data }) => {
      if (data?.id === quote.creator_id) setIsOwner(true);
    });
  }, [user?.id, quote?.creator_id]);

  useEffect(() => {
    if (!user || !quote || !quoteId || isOwner || quote.status !== "sent") return;
    markQuoteViewed(quoteId);
  }, [user, quote, quoteId, isOwner]);

  // ─── data fetch ────────────────────────────────────────────────────────────
  const fetchQuote = async () => {
    if (!quoteId) return;
    const { data: q } = await supabase.from("quotes").select("*").eq("id", quoteId).single();
    if (!q) {
      setLoading(false);
      return;
    }
    setQuote(q as QuoteData);

    const [itemsRes, creatorRes, projectRes] = await Promise.all([
      supabase.from("quote_items").select("*").eq("quote_id", quoteId).order("sort_order", { ascending: true }),
      supabase
        .from("profiles")
        .select(
          "name, company_name, avatar_url, org_number, company_address, company_postal_code, company_city, email, phone, company_website, company_logo_url"
        )
        .eq("id", q.creator_id)
        .single(),
      supabase.from("projects").select("name").eq("id", q.project_id).single(),
    ]);

    if (itemsRes.data) setItems(itemsRes.data as QuoteItem[]);
    if (creatorRes.data) setCreator(creatorRes.data as CreatorProfile);
    if (projectRes.data) setProjectName(projectRes.data.name);

    const clientIdRef = (q as Record<string, unknown>).client_id_ref as string | null;
    if (clientIdRef) {
      const { data: clientData } = await supabase.from("clients").select("name").eq("id", clientIdRef).maybeSingle();
      if (clientData?.name) setClientName(clientData.name);
    }

    const revisedFrom = (q as Record<string, unknown>).revised_from as string | null;
    if (revisedFrom) {
      const { data: parent } = await supabase.from("quotes").select("id, quote_number").eq("id", revisedFrom).single();
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

    // ÄTA — fetch site-visit photos for the dedicated change-order grid
    if (q.is_ata) {
      const { data: photos } = await supabase
        .from("photos")
        .select("id, storage_path, caption")
        .eq("entity_type", "quote")
        .eq("entity_id", quoteId)
        .order("created_at", { ascending: true });
      if (photos) setAtaPhotos(photos as AtaPhoto[]);
    }

    setLoading(false);
  };

  // ─── handlers ──────────────────────────────────────────────────────────────
  const handleAccept = async () => {
    if (!quote || !quoteId) return;
    setActing(true);
    const result = await updateQuoteStatus(quoteId, "accepted");
    if (!result) {
      setActing(false);
      return;
    }
    const { data: project } = await supabase
      .from("projects")
      .select("project_type, status")
      .eq("id", quote.project_id)
      .single();
    if (project) {
      await supabase.from("projects").update({ status: "active" }).eq("id", quote.project_id);
    }
    confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
    setQuote({ ...quote, status: "accepted" });
    await createTasksFromQuote(quoteId);

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
          content: t("quotes.quoteAcceptedMessage", { name: profile.name, title: quote.title }),
          created_by_user_id: profile.id,
        });
      }
    }

    const hasRotItems = items.some((i) => i.is_rot_eligible);
    if (hasRotItems && !isOwner) {
      const { data: { user: currentUser2 } } = await supabase.auth.getUser();
      if (currentUser2) {
        const { data: customerProfile } = await supabase
          .from("profiles")
          .select("id, personnummer")
          .eq("user_id", currentUser2.id)
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
            ((projectData as Record<string, unknown>)?.property_designation as string | null) ?? null
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

  const handleReject = async () => {
    if (!quote || !quoteId) return;
    setActing(true);
    const result = await updateQuoteStatus(quoteId, "rejected");
    if (!result) {
      setActing(false);
      return;
    }
    setQuote({ ...quote, status: "rejected" });

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
          content: t("quotes.quoteRejectedMessage", { name: profile.name, title: quote.title }),
          created_by_user_id: profile.id,
        });
      }
    }
    toast.success(t("quotes.quoteDeclined"));
    setActing(false);
  };

  const handleEdit = () => {
    navigate(`/quotes/new?editQuoteId=${quoteId}&projectId=${quote?.project_id}`);
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
    if (newId) navigate(`/quotes/new?editQuoteId=${newId}&projectId=${quote.project_id}`);
    setActing(false);
  };

  const handleDelete = async () => {
    if (!quoteId) return;
    await supabase.from("quote_items").delete().eq("quote_id", quoteId);
    const { error } = await supabase.from("quotes").delete().eq("id", quoteId);
    if (error) {
      toast.error(t("errors.generic"));
    } else {
      toast.success(t("quotes.quoteDeleted"));
      navigate("/start");
    }
    setConfirmDelete(false);
  };

  const handleDownloadPdf = async () => {
    if (!quote) return;
    await downloadQuotePdf({
      quote,
      items,
      creator,
      projectName,
      clientName,
      t,
      onDraftFinalized: () => {
        setQuote({ ...quote, status: "sent" });
        toast.success(t("quotes.quoteFinalizedOnPdf"));
      },
    });
  };

  const handleCreateInvoice = async () => {
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
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  // ─── render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!quote) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">{t("common.notFound", "Quote not found")}</p>
      </div>
    );
  }

  const subtotal = items.reduce((s, i) => s + (i.total_price ?? 0), 0);
  const vat = Math.round(subtotal * 0.25 * 100) / 100;
  const totalRot = items.reduce((s, i) => s + (i.rot_deduction ?? 0), 0);
  const totalToPay = subtotal + vat - totalRot;
  const hasRotEligible = items.some((i) => i.is_rot_eligible);

  // Build line items grouped by labor / material implicitly — quotes are flat today,
  // so render them sequentially. Sections come in F1.B (CreateQuote v2 settings).
  const lineItems: DocumentLineItem[] = items.map((it) => ({
    id: it.id,
    description: it.description,
    comment: it.comment ?? undefined,
    quantity: `${it.quantity} ${it.unit}`,
    unitPrice: fmtKr(it.unit_price),
    total: fmtKr(it.total_price),
    rot: it.is_rot_eligible,
  }));

  // Sidebar actions per (isOwner, status)
  const ownerActions: SidebarAction[] = (() => {
    if (!isOwner) return [];
    if (quote.status === "draft") {
      return [
        { label: t("quotes.shareWithCustomer"), variant: "primary", icon: <Send className="h-3.5 w-3.5" />, onClick: () => setShareDialogOpen(true) },
        { label: t("quotes.edit"), variant: "outline", icon: <Pencil className="h-3.5 w-3.5" />, onClick: handleEdit },
        { label: "PDF", variant: "outline", icon: <Download className="h-3.5 w-3.5" />, onClick: handleDownloadPdf },
      ];
    }
    if (quote.status === "sent") {
      return [
        { label: t("quotes.markAccepted", "Markera accepterad"), variant: "primary", icon: <CheckCircle className="h-3.5 w-3.5" />, onClick: handleAccept, disabled: acting },
        { label: t("quotes.edit"), variant: "outline", icon: <Pencil className="h-3.5 w-3.5" />, onClick: () => setConfirmUnlock(true) },
        { label: t("quotes.reshare"), variant: "outline", icon: <Send className="h-3.5 w-3.5" />, onClick: () => setShareDialogOpen(true) },
        { label: "PDF", variant: "outline", icon: <Download className="h-3.5 w-3.5" />, onClick: handleDownloadPdf },
      ];
    }
    if (quote.status === "rejected") {
      return [
        { label: acting ? t("quotes.creatingRevision") : t("quotes.reviseQuote"), variant: "primary", icon: acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />, onClick: handleRevise, disabled: acting },
        { label: "PDF", variant: "outline", icon: <Download className="h-3.5 w-3.5" />, onClick: handleDownloadPdf },
      ];
    }
    if (quote.status === "accepted") {
      return [
        { label: t("quotes.createInvoice", "Skapa faktura"), variant: "primary", icon: acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />, onClick: handleCreateInvoice, disabled: acting },
        { label: "PDF", variant: "outline", icon: <Download className="h-3.5 w-3.5" />, onClick: handleDownloadPdf },
      ];
    }
    return [];
  })();

  const showOwnerDelete = isOwner && (quote.status === "draft" || quote.status === "sent");
  const showCustomerActions = !isOwner && (quote.status === "sent" || quote.status === "accepted" || quote.status === "rejected");
  const showOwnerChat = isOwner && (quote.status === "sent" || quote.status === "accepted" || quote.status === "rejected");

  // Title bar text
  const docTitle = `${t("quotes.quoteLabel", "Offert")} ${quote.quote_number ?? quote.id.slice(0, 8)} · ${projectName}`;
  const docMeta = (() => {
    if (quote.status === "draft") return t("quotes.draft", "Utkast");
    if (quote.status === "sent" && quote.viewed_at) {
      return t("quotes.viewedAt", { time: formatDistanceToNow(new Date(quote.viewed_at), { addSuffix: true }) });
    }
    if (quote.status === "sent") return t("quotes.waitingForCustomer", "Väntar på kund");
    return t(`quotes.${quote.status}`);
  })();

  // ─── sidebar (owner only — customers get sticky-bar at bottom) ─────────────
  const sidebar = isOwner ? (
    <>
      <SidebarCard label={t("quotes.statusLabel", "Status")}>
        <StatusPill tone={STATUS_TONE[quote.status] ?? "neutral"} label={t(`quotes.${quote.status}`)} />
        {quote.status === "sent" && (
          <div className="mt-2 flex items-center gap-1.5 text-xs" style={{ color: quote.viewed_at ? "var(--rf-green)" : "var(--rf-fg-muted)" }}>
            <Eye className="h-3.5 w-3.5" />
            {quote.viewed_at
              ? t("quotes.viewedAt", { time: formatDistanceToNow(new Date(quote.viewed_at), { addSuffix: true }) })
              : t("quotes.waitingForCustomer", "Väntar på kund")}
          </div>
        )}
      </SidebarCard>

      {ownerActions.length > 0 && <SidebarActions actions={ownerActions} />}

      {(revisedFromQuote || latestRevision) && (
        <SidebarCard label={t("quotes.revisionChain", "Revisionskedja")}>
          {revisedFromQuote && (
            <button
              type="button"
              onClick={() => navigate(`/quotes/${revisedFromQuote.id}`)}
              className="block w-full text-left"
              style={{ fontSize: 12, color: "var(--rf-green)", marginBottom: 4 }}
            >
              ← {t("quotes.revisedFrom", "Revision av")} {revisedFromQuote.quote_number ?? revisedFromQuote.id.slice(0, 8)}
            </button>
          )}
          {latestRevision && (
            <button
              type="button"
              onClick={() => navigate(`/quotes/${latestRevision.id}`)}
              className="block w-full text-left"
              style={{ fontSize: 12, color: "var(--rf-amber-soft-fg)" }}
            >
              → {t("quotes.revisedAs", "Reviderad som")} {latestRevision.quote_number ?? latestRevision.id.slice(0, 8)}
            </button>
          )}
        </SidebarCard>
      )}

      <SidebarCard label={t("quotes.activity", "Aktivitet")}>
        <SidebarTimeline
          items={[
            {
              what: t("quotes.created", "Skapad"),
              when: new Date(quote.created_at).toLocaleDateString("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
            },
            ...(quote.status !== "draft"
              ? [
                  {
                    what: t("quotes.sentToCustomer", "Skickad till kund"),
                    when: quote.viewed_at
                      ? formatDistanceToNow(new Date(quote.viewed_at), { addSuffix: true })
                      : t("common.unknown", "—"),
                  },
                ]
              : []),
            ...(quote.viewed_at
              ? [
                  {
                    what: t("quotes.openedByCustomer", "Öppnad av kund"),
                    when: formatDistanceToNow(new Date(quote.viewed_at), { addSuffix: true }),
                  },
                ]
              : []),
            ...(quote.status === "draft"
              ? [{ what: t("quotes.notSentYet", "Inte skickad än"), when: t("quotes.pending", "Väntar"), pending: true }]
              : []),
            ...(quote.status === "accepted"
              ? [{ what: t("quotes.accepted", "Accepterad"), when: t("quotes.byCustomer", "Av kund") }]
              : quote.status === "rejected"
              ? [{ what: t("quotes.rejected", "Avböjd"), when: t("quotes.byCustomer", "Av kund") }]
              : []),
          ]}
        />
      </SidebarCard>

      <SidebarLinkBlock
        label={t("quotes.linkedProject", "Koppling")}
        title={projectName}
        subtitle={clientName ? `${t("quotes.recipient", "Mottagare")}: ${clientName}` : undefined}
        cta={{ label: t("quotes.openProject", "Öppna projekt"), onClick: () => navigate(`/projects/${quote.project_id}`) }}
      />

      {showOwnerDelete && (
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="mt-2 inline-flex items-center justify-center gap-1.5 self-start text-xs"
          style={{ color: "var(--rf-danger)" }}
        >
          <Trash2 className="h-3 w-3" /> {t("quotes.deleteQuote", "Ta bort offert")}
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
          onClick={() => {
            if (isOwner) navigate(returnTo || (quote.project_id ? `/projects/${quote.project_id}` : "/start"));
            else if (quote.status === "accepted") navigate(`/projects/${quote.project_id}`);
            else navigate("/start");
          }}
        >
          <ArrowLeft className="h-4 w-4" />
          {isOwner
            ? returnTo || quote.project_id
              ? t("quotes.backToProject")
              : t("quotes.backToStart")
            : quote.status === "accepted"
            ? t("quotes.backToProject")
            : t("quotes.backToStart")}
        </Button>
      </div>

      {/* Document */}
      <div className="container mx-auto max-w-6xl px-4 py-6">
        {quote.is_ata ? (
          // ─── ÄTA grid ───────────────────────────────────────────────────
          // Change-order layout per design spec: full-width 2-col grid with
          // change details, reason, photos on the left and price/time-shift/
          // approval on the right. Replaces DocumentLayout entirely.
          <div className="space-y-6 rf-paper">
            {/* Header card */}
            <div
              className="rounded-lg border p-4"
              style={{ background: "var(--rf-surface)", borderColor: "var(--rf-hairline)" }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="rf-eyebrow">{t("quotes.ataLabel", "Ändring & tillägg")}</div>
                  <h1
                    className="rf-display mt-1"
                    style={{ fontSize: 22, lineHeight: 1.15, color: "var(--rf-ink)" }}
                  >
                    {t("quotes.ataNumberPrefix", "ÄTA")} {quote.quote_number ?? quote.id.slice(0, 8)}
                  </h1>
                  <div className="mt-1 text-sm" style={{ color: "var(--rf-fg-muted)" }}>{projectName}</div>
                </div>
                <div className="text-right">
                  <StatusPill tone={STATUS_TONE[quote.status] ?? "neutral"} label={t(`quotes.${quote.status}`)} />
                  {quote.ata_time_shift_days != null && quote.ata_time_shift_days > 0 && (
                    <div className="mt-2 text-sm" style={{ color: "var(--rf-amber-soft-fg)" }}>
                      +{quote.ata_time_shift_days} {t("quotes.daysDelay", "dagar tidsförskjutning")}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 2-col grid */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* Left column: Ändring + Skäl + Foton */}
              <div className="space-y-6">
                <SidebarCard label={t("quotes.ataChange", "Ändring")}>
                  <div className="rf-display" style={{ fontSize: 16, fontWeight: 500 }}>
                    {quote.title}
                  </div>
                  {quote.free_text && (
                    <div
                      className="mt-2 whitespace-pre-wrap text-sm"
                      style={{ color: "var(--rf-fg-muted)", lineHeight: 1.5 }}
                    >
                      {quote.free_text}
                    </div>
                  )}
                  <div className="mt-3 text-xs" style={{ color: "var(--rf-fg-subtle)" }}>
                    {t("quotes.created", "Skapad")} {creator?.name ? `${t("quotes.by", "av")} ${creator.name}` : ""} ·{" "}
                    {new Date(quote.created_at).toLocaleDateString("sv-SE", { day: "numeric", month: "short" })}
                  </div>
                </SidebarCard>

                {quote.ata_reason && (
                  <div
                    className="rounded-lg p-4"
                    style={{
                      background: "var(--rf-green-soft, #DCE5DC)",
                      borderLeft: "3px solid var(--rf-green, #2F5D4E)",
                    }}
                  >
                    <div className="rf-eyebrow" style={{ color: "var(--rf-green)" }}>
                      {t("quotes.ataReason", "Skäl till ändring")}
                    </div>
                    <div
                      className="mt-2 whitespace-pre-wrap text-sm"
                      style={{ color: "var(--rf-green-soft-fg)", lineHeight: 1.5 }}
                    >
                      {quote.ata_reason}
                    </div>
                  </div>
                )}

                {ataPhotos.length > 0 && (
                  <SidebarCard label={t("quotes.ataSitePhotos", "Foton från platsbesök")}>
                    <div className="grid grid-cols-3 gap-2">
                      {ataPhotos.map((p) => {
                        const { data: { publicUrl } } = supabase.storage
                          .from("project-files")
                          .getPublicUrl(p.storage_path);
                        return (
                          <a
                            key={p.id}
                            href={publicUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block overflow-hidden rounded-md"
                            style={{ border: "1px solid var(--rf-hairline)" }}
                          >
                            <img
                              src={publicUrl}
                              alt={p.caption ?? ""}
                              className="aspect-square w-full object-cover"
                            />
                          </a>
                        );
                      })}
                    </div>
                  </SidebarCard>
                )}
              </div>

              {/* Right column: Prisjustering + Tidsförskjutning + Godkännande */}
              <div className="space-y-6">
                <SidebarCard label={t("quotes.ataPriceAdjustment", "Prisjustering")}>
                  <div className="space-y-1.5 text-sm">
                    {items.map((it) => (
                      <div key={it.id} className="flex items-baseline justify-between gap-3">
                        <span style={{ color: "var(--rf-ink)" }}>
                          {it.description}
                          {it.quantity !== 1 && (
                            <span style={{ color: "var(--rf-fg-muted)" }}> × {it.quantity}</span>
                          )}
                        </span>
                        <span className="rf-num">{fmtKr(it.total_price)}</span>
                      </div>
                    ))}
                    <div
                      className="flex justify-between pt-1.5"
                      style={{ color: "var(--rf-fg-muted)" }}
                    >
                      <span>{t("quotes.vat", "Moms")} 25%</span>
                      <span className="rf-num">{fmtKr(vat)}</span>
                    </div>
                    {totalRot > 0 && (
                      <div className="flex justify-between" style={{ color: "var(--rf-green)" }}>
                        <span>{t("quotes.rotDeduction", "ROT-avdrag")}</span>
                        <span className="rf-num">−{fmtKr(totalRot)}</span>
                      </div>
                    )}
                    <div
                      className="flex justify-between pt-2 mt-2"
                      style={{
                        borderTop: "1px solid var(--rf-hairline)",
                        fontWeight: 600,
                      }}
                    >
                      <span>{t("quotes.ataTotal", "Total ÄTA")}</span>
                      <span className="rf-num" style={{ fontSize: 16 }}>{fmtKr(totalToPay)}</span>
                    </div>
                  </div>
                </SidebarCard>

                <SidebarCard label={t("quotes.ataTimeShift", "Tidsförskjutning")}>
                  {quote.ata_time_shift_days != null && quote.ata_time_shift_days > 0 ? (
                    <div className="text-sm">
                      <span style={{ color: "var(--rf-fg-muted)" }}>
                        {t("quotes.ataAdditionalDays", "Tillägg")}:{" "}
                      </span>
                      <span className="rf-num" style={{ fontWeight: 500 }}>
                        +{quote.ata_time_shift_days} {t("quotes.days", "dagar")}
                      </span>
                    </div>
                  ) : (
                    <div className="text-sm" style={{ color: "var(--rf-fg-muted)" }}>
                      {t("quotes.ataNoTimeShift", "Ingen tidsförskjutning")}
                    </div>
                  )}
                </SidebarCard>

                <SidebarCard label={t("quotes.ataApproval", "Godkännande")}>
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-9 w-9 items-center justify-center rounded-full text-sm"
                      style={{
                        background: "var(--rf-stone, #EFEAE0)",
                        color: "var(--rf-stone-fg, #6B5A3A)",
                        fontWeight: 500,
                      }}
                    >
                      {(clientName ?? "?").slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>
                        {clientName ?? t("quotes.recipient", "Mottagare")}
                      </div>
                      <div className="mt-0.5">
                        <StatusPill
                          tone={STATUS_TONE[quote.status] ?? "neutral"}
                          label={t(`quotes.${quote.status}`)}
                        />
                      </div>
                    </div>
                  </div>
                </SidebarCard>

                {/* Owner actions row — sits at the bottom of the right column */}
                {isOwner && ownerActions.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {ownerActions.map((a) => (
                      <Button
                        key={a.label}
                        variant={a.variant === "primary" ? "default" : "outline"}
                        size="sm"
                        onClick={a.onClick}
                        disabled={a.disabled}
                        className="gap-1.5"
                        style={
                          a.variant === "primary"
                            ? { background: "var(--rf-green)", color: "var(--rf-paper)" }
                            : undefined
                        }
                      >
                        {a.icon}
                        {a.label}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <DocumentLayout
            title={docTitle}
            meta={docMeta}
          stamp={
            STAMP_FOR_STATUS[quote.status] ? (
              <DocumentStatusStamp label={t(`quotes.${quote.status}`)} tone={STAMP_FOR_STATUS[quote.status]!} />
            ) : null
          }
          main={
            <>
              <DocumentNumber
                type={t("quotes.quoteLabel", "Offert")}
                number={quote.quote_number ?? quote.id.slice(0, 8)}
                rightLabel={t("quotes.dateLabel", "Datum")}
                rightValue={new Date(quote.created_at).toLocaleDateString("sv-SE")}
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
                  name: clientName ?? t("quotes.recipient", "Mottagare"),
                  address: projectName ? <>{projectName}</> : undefined,
                }}
              />

              {quote.free_text && (
                <div
                  className="mb-6 whitespace-pre-wrap"
                  style={{ fontSize: 13, color: "var(--rf-fg-muted)", lineHeight: 1.55 }}
                >
                  {quote.free_text}
                </div>
              )}

              <DocumentLines items={lineItems} />

              <DocumentTotals
                rows={[
                  { label: t("quotes.subtotal"), value: fmtKr(subtotal) },
                  { label: t("quotes.vat"), value: fmtKr(vat) },
                ]}
                grand={hasRotEligible ? { label: t("quotes.totalIncVat", "Totalt"), value: fmtKr(subtotal + vat) } : { label: t("quotes.totalToPay"), value: fmtKr(totalToPay) }}
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
                  hasRotEligible && totalRot > 0 ? { label: t("quotes.totalToPay"), value: fmtKr(totalToPay) } : undefined
                }
              />
            </>
          }
          sidebar={sidebar}
        />
        )}

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
              {t("quotes.chatWithCustomer", "Chatt med kund")}
              {chatOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
            {chatOpen && quoteId && (
              <div className="mt-3 rounded-md border p-4" style={{ borderColor: "var(--rf-hairline)", background: "var(--rf-surface)" }}>
                <CommentsSection entityId={quoteId} entityType="quote" projectId={quote.project_id} chatMode />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Customer sticky-bar — floats at bottom on sent/accepted/rejected */}
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
            {chatOpen && quoteId && (
              <div className="mb-3 max-h-[300px] overflow-y-auto rounded-md border p-3" style={{ borderColor: "var(--rf-hairline)" }}>
                <CommentsSection entityId={quoteId} entityType="quote" projectId={quote.project_id} chatMode />
              </div>
            )}

            {quote.status === "sent" && (
              <>
                <AtaBudgetWarningSection
                  projectId={quote.project_id}
                  pendingQuoteAmount={quote.total_amount}
                  excludeQuoteId={quote.id}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setChatOpen(!chatOpen)}
                    className="gap-2"
                  >
                    <MessageCircle className="h-4 w-4" />
                    {t("quotes.chatWithSeller", "Chatta")}
                    {chatOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </Button>
                  <div className="flex-1" />
                  <Button
                    variant="outline"
                    onClick={handleReject}
                    disabled={acting}
                    className="h-12 gap-2"
                  >
                    <XCircle className="h-4 w-4" />
                    {t("quotes.decline", "Avböj")}
                  </Button>
                  <Button
                    onClick={handleAccept}
                    disabled={acting}
                    className="h-12 gap-2"
                    style={{ background: "var(--rf-green)", color: "var(--rf-paper)", border: "1px solid var(--rf-green)" }}
                  >
                    {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                    {t("quotes.accept", "Acceptera")}
                  </Button>
                </div>
              </>
            )}

            {quote.status === "accepted" && (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm" style={{ color: "var(--rf-green)" }}>
                  <CheckCircle className="h-5 w-5" />
                  <span style={{ fontWeight: 500 }}>{t("quotes.youAccepted", "Du accepterade offerten")}</span>
                </div>
                <Button variant="outline" onClick={() => navigate(`/projects/${quote.project_id}`)}>
                  {t("quotes.viewProject", "Visa projekt")}
                </Button>
              </div>
            )}

            {quote.status === "rejected" && (
              <div className="flex items-center gap-2 text-sm" style={{ color: "var(--rf-fg-muted)" }}>
                <XCircle className="h-5 w-5" />
                <span>{t("quotes.youDeclined", "Du avböjde offerten")}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dialogs */}
      <ShareQuoteDialog
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
        quoteId={quoteId!}
        projectId={quote.project_id}
        onSuccess={() => {
          setQuote({ ...quote, status: "sent" });
          fetchQuote();
        }}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("quotes.deleteQuote", "Ta bort offert")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("quotes.confirmDeleteQuote", "Är du säker? Det går inte att ångra.")}
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
            <AlertDialogTitle>{t("quotes.unlockAndEdit", "Lås upp och redigera")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("quotes.unlockHint", "Offerten återgår till utkast och du kan redigera den. Kunden får inget meddelande.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnlockAndEdit}>{t("quotes.unlockAndEdit", "Lås upp")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
            setRotDialogOpen(false);
            toast.success(t("quotes.quoteAccepted"));
          }}
        />
      )}
    </div>
  );
}

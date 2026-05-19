/**
 * CreateInvoiceV2 — paper-warm invoice editor with .rf-paper scope and an
 * ÄTA-badge that surfaces when is_ata is set. All data flow (load, save, draft,
 * edit, fromQuote) is unchanged from V1.
 *
 * Feature-flagged in App.tsx via USE_INVOICE_CREATE_V2.
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useTaxDeductionVisible } from "@/hooks/useTaxDeduction";
import { AppHeader } from "@/components/AppHeader";
import { QuoteItemRow, type QuoteItem } from "@/components/quotes/QuoteItemRow";
import { QuoteSummary } from "@/components/quotes/QuoteSummary";
import { InvoicePreview } from "@/components/invoices/InvoicePreview";
import { ImportRoomDialog } from "@/components/quotes/ImportRoomDialog";
import { CreateClientDialog, type Client } from "@/components/quotes/CreateClientDialog";
import {
  createInvoice,
  createInvoiceFromQuote,
  addInvoiceItem,
  updateInvoiceDraft,
  replaceInvoiceItems,
  generateInvoiceNumber,
  recalculateInvoiceTotals,
} from "@/services/invoiceService";
import { formatLocalDate } from "@/lib/dateUtils";

interface SimpleProject {
  id: string;
  name: string;
}

function newItem(): QuoteItem {
  return {
    id: crypto.randomUUID(),
    description: "",
    quantity: 1,
    unit: "st",
    unitPrice: 0,
    isRotEligible: false,
    comment: "",
    discountPercent: 0,
  };
}

export default function CreateInvoiceV2() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showTaxDeduction } = useTaxDeductionVisible();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuthSession();

  const urlProjectId = searchParams.get("projectId");
  const editInvoiceId = searchParams.get("editInvoiceId");
  const fromQuoteId = searchParams.get("fromQuoteId");
  const urlClientId = searchParams.get("clientId");

  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState("");
  const [projects, setProjects] = useState<SimpleProject[]>([]);
  const [items, setItems] = useState<QuoteItem[]>([newItem()]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [importRoomItemId, setImportRoomItemId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [companyName, setCompanyName] = useState<string | undefined>();
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | undefined>();
  const [userName, setUserName] = useState<string | undefined>();
  const [userEmail, setUserEmail] = useState<string | undefined>();
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>();
  const [profileId, setProfileId] = useState<string | null>(null);
  const [clientId, setClientId] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [createClientOpen, setCreateClientOpen] = useState(false);
  const [freeText, setFreeText] = useState("");
  const [companyInfo, setCompanyInfo] = useState<{
    name?: string; logoUrl?: string; address?: string; postalCode?: string;
    city?: string; phone?: string; email?: string; website?: string;
    orgNumber?: string; bankgiro?: string;
  }>({});

  // Invoice-specific fields
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [paymentTermsDays, setPaymentTermsDays] = useState(30);
  const [bankgiro, setBankgiro] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [ocrReference, setOcrReference] = useState("");
  const [isAta, setIsAta] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("projects")
      .select("id, name")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setProjects(data);
      });
    supabase
      .from("profiles")
      .select("id, name, company_name, avatar_url, company_logo_url, company_address, company_postal_code, company_city, phone, email, company_website, org_number, bankgiro, bank_account_number, default_payment_terms_days")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setCompanyName(data.company_name ?? undefined);
          setCompanyLogoUrl(data.company_logo_url ?? undefined);
          setUserName(data.name ?? undefined);
          setAvatarUrl(data.avatar_url ?? undefined);
          setProfileId(data.id);
          setCompanyInfo({
            name: data.company_name ?? undefined,
            logoUrl: data.company_logo_url ?? undefined,
            address: data.company_address ?? undefined,
            postalCode: data.company_postal_code ?? undefined,
            city: data.company_city ?? undefined,
            phone: data.phone ?? undefined,
            email: data.email ?? undefined,
            website: data.company_website ?? undefined,
            orgNumber: data.org_number ?? undefined,
            bankgiro: data.bankgiro ?? undefined,
          });
          if (data.bankgiro) setBankgiro(data.bankgiro);
          if (data.bank_account_number) setBankAccountNumber(data.bank_account_number);
          if (data.default_payment_terms_days) setPaymentTermsDays(data.default_payment_terms_days);
          supabase
            .from("clients")
            .select("*")
            .eq("owner_id", data.id)
            .order("name")
            .then(({ data: clientData }) => {
              if (clientData) setClients(clientData as Client[]);
            });
        }
      });
    setUserEmail(user.email);
  }, [user]);

  useEffect(() => {
    if (urlProjectId && !projectId) setProjectId(urlProjectId);
  }, [urlProjectId, projectId]);

  useEffect(() => {
    if (urlClientId && !clientId) setClientId(urlClientId);
  }, [urlClientId, clientId]);

  // Auto-fill client from project's accepted quote when no client is set
  useEffect(() => {
    if (!projectId || clientId || fromQuoteId || editInvoiceId) return;
    supabase
      .from("quotes")
      .select("client_id_ref")
      .eq("project_id", projectId)
      .eq("status", "accepted")
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data?.client_id_ref) setClientId(data.client_id_ref);
      });
  }, [projectId, clientId, fromQuoteId, editInvoiceId]);

  // Set default due date based on payment terms
  useEffect(() => {
    if (!dueDate && paymentTermsDays) {
      const d = new Date();
      d.setDate(d.getDate() + paymentTermsDays);
      setDueDate(formatLocalDate(d));
    }
  }, [paymentTermsDays, dueDate]);

  // Load existing invoice for editing
  useEffect(() => {
    if (!editInvoiceId) return;

    const loadInvoice = async () => {
      const [invoiceRes, itemsRes] = await Promise.all([
        supabase
          .from("invoices")
          .select("title, free_text, client_id, project_id, invoice_number, due_date, payment_terms_days, bankgiro, bank_account_number, ocr_reference, is_ata")
          .eq("id", editInvoiceId)
          .single(),
        supabase
          .from("invoice_items")
          .select("*")
          .eq("invoice_id", editInvoiceId)
          .order("sort_order", { ascending: true }),
      ]);

      if (invoiceRes.data) {
        const inv = invoiceRes.data;
        setTitle(inv.title || "");
        setFreeText(inv.free_text || "");
        if (inv.client_id) setClientId(inv.client_id);
        if (inv.project_id) setProjectId(inv.project_id);
        if (inv.invoice_number) setInvoiceNumber(inv.invoice_number);
        if (inv.due_date) setDueDate(inv.due_date);
        if (inv.payment_terms_days) setPaymentTermsDays(inv.payment_terms_days);
        if (inv.bankgiro) setBankgiro(inv.bankgiro);
        if (inv.bank_account_number) setBankAccountNumber(inv.bank_account_number);
        if (inv.ocr_reference) setOcrReference(inv.ocr_reference);
        setIsAta(inv.is_ata ?? false);
      }

      if (itemsRes.data && itemsRes.data.length > 0) {
        setItems(
          itemsRes.data.map((item) => ({
            id: item.id,
            description: item.description || "",
            quantity: item.quantity ?? 1,
            unit: item.unit || "st",
            unitPrice: item.unit_price ?? 0,
            isRotEligible: item.is_rot_eligible ?? false,
            roomId: item.room_id ?? undefined,
            comment: item.comment || "",
            discountPercent: item.discount_percent ?? 0,
          }))
        );
      }
    };

    loadInvoice();
  }, [editInvoiceId]);

  // Load from quote
  useEffect(() => {
    if (!fromQuoteId || editInvoiceId) return;

    const loadFromQuote = async () => {
      const [quoteRes, itemsRes] = await Promise.all([
        supabase
          .from("quotes")
          .select("title, project_id, client_id_ref")
          .eq("id", fromQuoteId)
          .single(),
        supabase
          .from("quote_items")
          .select("*")
          .eq("quote_id", fromQuoteId)
          .order("sort_order", { ascending: true }),
      ]);

      if (quoteRes.data) {
        setTitle(quoteRes.data.title || "");
        if (quoteRes.data.project_id) setProjectId(quoteRes.data.project_id);
        if (quoteRes.data.client_id_ref) setClientId(quoteRes.data.client_id_ref);
      }

      if (itemsRes.data && itemsRes.data.length > 0) {
        setItems(
          itemsRes.data.map((item) => ({
            id: crypto.randomUUID(),
            description: item.description || "",
            quantity: item.quantity ?? 1,
            unit: item.unit || "st",
            unitPrice: item.unit_price ?? 0,
            isRotEligible: item.is_rot_eligible ?? false,
            roomId: item.room_id ?? undefined,
            comment: item.comment || "",
            discountPercent: item.discount_percent ?? 0,
          }))
        );
        toast.success(t("invoices.itemsImportedFromQuote", { count: itemsRes.data.length }));
      }
    };

    loadFromQuote();
  }, [fromQuoteId, editInvoiceId, t]);

  // Auto-generate invoice number per creator
  useEffect(() => {
    if (invoiceNumber || editInvoiceId) return;
    if (!profileId) return;

    generateInvoiceNumber(profileId).then((num) => setInvoiceNumber(num));
  }, [profileId, invoiceNumber, editInvoiceId]);

  const handleChange = useCallback((id: string, updates: Partial<QuoteItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...updates } : i)));
  }, []);

  const handleDelete = useCallback((id: string) => {
    setItems((prev) => {
      const next = prev.filter((i) => i.id !== id);
      return next.length === 0 ? [newItem()] : next;
    });
  }, []);

  const handleImportRoom = useCallback(
    (itemId: string) => {
      if (!projectId) {
        toast.error(t("quotes.selectProject"));
        return;
      }
      setImportRoomItemId(itemId);
    },
    [projectId, t]
  );

  const handleRoomSelect = useCallback(
    (roomId: string, areaSqm: number) => {
      if (!importRoomItemId) return;
      setItems((prev) =>
        prev.map((i) =>
          i.id === importRoomItemId ? { ...i, quantity: areaSqm, unit: "m2", roomId } : i
        )
      );
      setImportRoomItemId(null);
    },
    [importRoomItemId]
  );

  const handleSaveDraft = async () => {
    if (!user) return;
    if (!projectId) {
      toast.error(t("quotes.selectProject"));
      return;
    }
    setSaving(true);

    const itemPayloads = items
      .filter((item) => item.description || item.unitPrice > 0)
      .map((item, idx) => ({
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        unit: item.unit,
        is_rot_eligible: item.isRotEligible,
        room_id: item.roomId,
        sort_order: idx,
        comment: item.comment || null,
        discount_percent: item.discountPercent || null,
      }));

    if (itemPayloads.length === 0) {
      toast.error(t("invoices.atLeastOneItem", "Add at least one item"));
      setSaving(false);
      return;
    }

    if (editInvoiceId) {
      const updated = await updateInvoiceDraft(editInvoiceId, {
        title: title || t("invoices.newInvoice"),
        free_text: freeText.trim() || null,
        client_id_ref: clientId || null,
        invoice_number: invoiceNumber || null,
        due_date: dueDate || null,
        payment_terms_days: paymentTermsDays,
        bankgiro: bankgiro || null,
        bank_account_number: bankAccountNumber || null,
        ocr_reference: ocrReference || null,
        is_ata: isAta,
      });
      if (!updated) {
        setSaving(false);
        return;
      }
      const ok = await replaceInvoiceItems(editInvoiceId, itemPayloads);
      if (!ok) {
        setSaving(false);
        return;
      }
      setSaving(false);
      toast.success(t("invoices.saved"));
      const returnTo = projectId
        ? `?returnTo=${encodeURIComponent(`/projects/${projectId}`)}`
        : "";
      navigate(`/invoices/${editInvoiceId}${returnTo}`);
    } else {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();
      if (!profile) {
        toast.error("Profile not found");
        setSaving(false);
        return;
      }
      const invoice = await createInvoice(projectId, profile.id, title || t("invoices.newInvoice"), {
        clientIdRef: clientId || undefined,
        quoteId: fromQuoteId || undefined,
        isAta,
        bankgiro: bankgiro || undefined,
        paymentTermsDays,
      });
      if (!invoice) {
        setSaving(false);
        return;
      }
      // Update invoice number and other fields
      await updateInvoiceDraft(invoice.id, {
        invoice_number: invoiceNumber || null,
        due_date: dueDate || null,
        ocr_reference: ocrReference || null,
        bank_account_number: bankAccountNumber || null,
        free_text: freeText.trim() || null,
      });

      for (const item of itemPayloads) {
        await addInvoiceItem(invoice.id, item);
      }
      // Recalculate totals after all items are inserted
      await recalculateInvoiceTotals(invoice.id);
      setSaving(false);
      toast.success(t("invoices.saved"));
      const returnTo = projectId
        ? `?returnTo=${encodeURIComponent(`/projects/${projectId}`)}`
        : "";
      navigate(`/invoices/${invoice.id}${returnTo}`);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  // Auth + role check handled by RequireAuth + RequireRole wrappers in App.tsx
  if (authLoading || !user) return null;

  const projectName = projects.find((p) => p.id === projectId)?.name ?? "";

  return (
    <div className="min-h-screen rf-paper" style={{ background: "var(--rf-paper, #FAFAF7)" }}>
      <AppHeader
        userName={userName}
        userEmail={userEmail}
        avatarUrl={avatarUrl}
        onSignOut={handleSignOut}
      />

      <main className="container mx-auto px-4 py-6 max-w-2xl space-y-4">
        {urlProjectId && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 -ml-2 text-muted-foreground hover:text-foreground"
            onClick={() => navigate(`/projects/${urlProjectId}`)}
          >
            <ArrowLeft className="h-4 w-4" />
            {t("invoices.backToProject", "Back to project")}
          </Button>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">
            {isAta
              ? t("invoices.changeOrderInvoiceTitle", "Tilläggsfaktura")
              : editInvoiceId
                ? t("invoices.editInvoice", "Redigera faktura")
                : t("invoices.newInvoice")}
          </h1>
          {/* V2: ÄTA-badge — surfaces is_ata=true mode prominently */}
          {isAta && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={{ background: "var(--rf-warn-soft, #F2E2DA)", color: "var(--rf-warn-soft-fg, #7A3D26)" }}
            >
              <AlertTriangle className="h-3 w-3" />
              {t("invoices.ataMode", "ÄTA — utanför ursprunglig offert")}
            </span>
          )}
          {/* V2: editing-state badge */}
          {!isAta && editInvoiceId && (
            <span
              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={{ background: "var(--rf-stone, #EFEAE0)", color: "var(--rf-stone-fg, #6B5A3A)" }}
            >
              {t("invoices.draft", "Utkast")}
            </span>
          )}
        </div>

        <Input
          placeholder={t("invoices.titlePlaceholder")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="min-h-[48px]"
        />

        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger className="min-h-[48px]">
            <SelectValue placeholder={t("quotes.selectProject")} />
          </SelectTrigger>
          <SelectContent>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={clientId}
          onValueChange={(val) => {
            if (val === "__new__") {
              setCreateClientOpen(true);
            } else {
              setClientId(val);
            }
          }}
        >
          <SelectTrigger className="min-h-[48px]">
            <SelectValue placeholder={t("quotes.selectRecipient")} />
          </SelectTrigger>
          <SelectContent>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
            <SelectItem value="__new__">{t("quotes.createNewClient")}</SelectItem>
          </SelectContent>
        </Select>

        {/* Invoice-specific fields */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>{t("invoices.invoiceNumber")}</Label>
            <Input
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="FAK-2026-001"
              className="min-h-[48px]"
            />
          </div>
          <div className="space-y-1">
            <Label>{t("invoices.paymentTerms")}</Label>
            <Select
              value={String(paymentTermsDays)}
              onValueChange={(val) => {
                const days = parseInt(val);
                setPaymentTermsDays(days);
                const d = new Date();
                d.setDate(d.getDate() + days);
                setDueDate(formatLocalDate(d));
              }}
            >
              <SelectTrigger className="min-h-[48px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 15, 20, 30, 45, 60, 90].map((days) => (
                  <SelectItem key={days} value={String(days)}>
                    {t("invoices.paymentTermsDays", { days })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t("invoices.dueDate")}</Label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="min-h-[48px]"
            />
          </div>
          <div className="space-y-1">
            <Label>{t("invoices.bankgiro")}</Label>
            <Input
              value={bankgiro}
              onChange={(e) => setBankgiro(e.target.value)}
              placeholder="123-4567"
              className="min-h-[48px]"
            />
          </div>
          <div className="space-y-1">
            <Label>{t("invoices.bankAccountNumber")}</Label>
            <Input
              value={bankAccountNumber}
              onChange={(e) => setBankAccountNumber(e.target.value)}
              placeholder="1234-12 345 67"
              className="min-h-[48px]"
            />
          </div>
          <div className="space-y-1">
            <Label>{t("invoices.ocrReference")}</Label>
            <Input
              value={ocrReference}
              onChange={(e) => setOcrReference(e.target.value)}
              className="min-h-[48px]"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 min-h-[48px]">
          <Checkbox checked={isAta} onCheckedChange={(checked) => setIsAta(!!checked)} />
          <span className="text-sm">{t("invoices.isAta")}</span>
        </label>

        <div className="space-y-3">
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              {t("quotes.noItems")}
            </p>
          )}
          {items.map((item) => (
            <QuoteItemRow
              key={item.id}
              item={item}
              onChange={handleChange}
              onDelete={handleDelete}
              onImportRoom={handleImportRoom}
              showRot={showTaxDeduction}
            />
          ))}
        </div>

        <Button
          variant="outline"
          className="w-full min-h-[48px]"
          onClick={() => setItems((prev) => [...prev, newItem()])}
        >
          <Plus className="h-4 w-4 mr-2" />
          {t("quotes.addItem")}
        </Button>

        <Textarea
          placeholder={t("quotes.freeTextPlaceholder")}
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          rows={3}
          className="min-h-[80px]"
        />

        <QuoteSummary items={items} />

        <div className="flex gap-2 pb-8">
          <Button
            variant="outline"
            className="flex-1 min-h-[48px]"
            onClick={() => setPreviewOpen(true)}
          >
            {t("invoices.preview")}
          </Button>
          <Button
            className="flex-1 min-h-[48px]"
            onClick={handleSaveDraft}
            disabled={saving}
          >
            {saving ? t("common.saving") : t("invoices.saveDraft")}
          </Button>
        </div>
      </main>

      <InvoicePreview
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        projectName={projectName}
        items={items}
        company={companyInfo}
        clientName={clients.find((c) => c.id === clientId)?.name}
        freeText={freeText}
        invoiceNumber={invoiceNumber}
        dueDate={dueDate}
        bankgiro={bankgiro}
        bankAccountNumber={bankAccountNumber}
        ocrReference={ocrReference}
      />

      <ImportRoomDialog
        open={importRoomItemId !== null}
        onClose={() => setImportRoomItemId(null)}
        projectId={projectId || null}
        onSelect={handleRoomSelect}
      />

      {profileId && (
        <CreateClientDialog
          open={createClientOpen}
          onClose={() => setCreateClientOpen(false)}
          onSaved={(client) => {
            setClients((prev) => [...prev, client].sort((a, b) => a.name.localeCompare(b.name)));
            setClientId(client.id);
          }}
          ownerId={profileId}
        />
      )}
    </div>
  );
}

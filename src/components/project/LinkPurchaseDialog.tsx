/**
 * LinkPurchaseDialog — Link an invoice/receipt to an existing task/purchase or create new.
 *
 * Flow:
 * 1. AI extracts vendor, amount, date from document (process-receipt)
 * 2. User sees extracted data + choice: "Link to existing" or "Create new"
 * 3a. Link: SearchableEntityPicker to find task/material
 * 3b. Create: Auto-creates material record with extracted data
 * 4. File saved to project storage with smart filename
 */

import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Receipt,
  FileText,
  Link2,
  Plus,
  Building2,
  Calendar,
  ArrowLeft,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/currency";
import {
  analyzeDocument,
  generateDocumentFilename,
  type DocumentAnalysisResult,
} from "@/services/receiptAnalysisService";
import {
  SearchableEntityPicker,
  type SelectedEntity,
} from "@/components/shared/SearchableEntityPicker";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LinkPurchaseDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: File | null;
  documentType: "invoice" | "receipt";
  onComplete?: () => void;
}

type Step = "extracting" | "choose" | "link" | "saving";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Use global formatCurrency from @/lib/currency

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] || result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function compressImage(file: File, maxSize = 1600, quality = 0.85): Promise<string> {
  if (!file.type.startsWith("image/")) {
    return fileToBase64(file);
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas context failed"));
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality).split(",")[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
    img.src = url;
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LinkPurchaseDialog({
  projectId,
  open,
  onOpenChange,
  file,
  documentType,
  onComplete,
}: LinkPurchaseDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("extracting");
  const [extraction, setExtraction] = useState<DocumentAnalysisResult | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity | null>(null);
  const [extracted, setExtracted] = useState(false);

  const reset = useCallback(() => {
    setStep("extracting");
    setExtraction(null);
    setSelectedEntity(null);
    setExtracted(false);
  }, []);

  // ---- Extract on open ----
  useEffect(() => {
    if (!open || !file || extracted) return;
    setExtracted(true);

    (async () => {
      try {
        const base64 = await compressImage(file);
        const result = await analyzeDocument(base64);
        setExtraction(result);

        // Auto-match ROT personnummer if extracted
        if (result.rot_personnummer && projectId) {
          const { data: existingPerson } = await supabase
            .from("project_rot_persons")
            .select("id, name")
            .eq("project_id", projectId)
            .eq("personnummer", result.rot_personnummer)
            .maybeSingle();

          if (!existingPerson) {
            // New personnummer found — offer to add as ROT person
            toast({
              title: t("linkPurchase.newRotPerson", "Nytt personnummer hittat"),
              description: `${result.rot_personnummer} — ${t("linkPurchase.addAsRotPerson", "läggs till som ROT-person automatiskt")}`,
            });
            // Auto-create ROT person
            await supabase.from("project_rot_persons").insert({
              project_id: projectId,
              name: result.vendor_name || "Okänd",
              personnummer: result.rot_personnummer,
            });
          }
        }

        setStep("choose");
      } catch (err) {
        console.error("Extraction error:", err);
        toast({
          title: t("linkPurchase.extractionError", "Kunde inte analysera dokumentet"),
          description: err instanceof Error ? err.message : "Okänt fel",
          variant: "destructive",
        });
        onOpenChange(false);
        reset();
      }
    })();
  }, [open, file, extracted, t, toast, onOpenChange, reset]);

  // ---- Save: upload file + link or create ----
  const handleSave = async (mode: "link" | "create") => {
    if (!file || !extraction) return;
    setStep("saving");

    try {
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !user) throw new Error("Inte inloggad");

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();
      if (!profile) throw new Error("Profil hittades inte");

      // Generate smart filename and upload
      const smartName = generateDocumentFilename(
        extraction.document_type,
        extraction.vendor_name || "Okänd",
        extraction.purchase_date,
        extraction.total_amount,
        extraction.invoice_number
      );
      const folder = extraction.document_type === "invoice" ? "Fakturor" : "Kvitton";
      const storagePath = `projects/${projectId}/${folder}/${smartName}`;

      await supabase.storage.from("project-files").upload(storagePath, file);
      const { data: urlData } = supabase.storage.from("project-files").getPublicUrl(storagePath);

      if (mode === "link" && selectedEntity) {
        // Create task_file_link to connect document to existing entity
        await supabase.from("task_file_links").insert({
          project_id: projectId,
          [selectedEntity.type === "task" ? "task_id" : "material_id"]: selectedEntity.id,
          file_path: storagePath,
          file_name: smartName,
          file_type: file.type,
          file_size: file.size,
        });

        toast({
          title: t("linkPurchase.linked", "Dokument kopplat"),
          description: t("linkPurchase.linkedTo", {
            defaultValue: "Kopplat till {{name}}",
            name: selectedEntity.name,
          }),
        });
      } else {
        // Create a purchase_order so every scanned receipt/invoice lives in
        // Inköp-fliken as a first-class order — not an orphan material row.
        // The file stays linked via receipt_file_path through its lifecycle.
        const isInvoiceDoc = extraction.document_type === "invoice";
        const lineItems = extraction.line_items?.length ? extraction.line_items : null;
        const total = extraction.total_amount || 0;
        const purchaseDate = extraction.purchase_date || new Date().toISOString();

        const { data: po, error: poErr } = await supabase
          .from("purchase_orders")
          .insert({
            project_id: projectId,
            vendor_name: extraction.vendor_name || t("linkPurchase.unknownVendor", "Okänd leverantör"),
            total,
            status: "delivered",
            source: isInvoiceDoc ? "ai_invoice" : "ai_receipt",
            delivered_at: purchaseDate,
            ordered_at: purchaseDate,
            receipt_file_path: storagePath,
            invoice_number: isInvoiceDoc ? extraction.invoice_number || null : null,
            ocr_number: isInvoiceDoc ? extraction.ocr_number || null : null,
            invoice_due_date: isInvoiceDoc ? extraction.due_date || null : null,
            created_by_user_id: profile.id,
          })
          .select("id")
          .single();

        if (poErr) throw new Error(poErr.message);

        // One material row per line item (or one aggregate if AI didn't extract
        // line items). Every row points back at the PO via purchase_order_id.
        const matStatus = isInvoiceDoc ? "billed" : "paid";
        const matRows = lineItems
          ? lineItems.map((li) => ({
              project_id: projectId,
              purchase_order_id: po.id,
              name: li.description,
              vendor_name: extraction.vendor_name || null,
              quantity: li.quantity || 1,
              unit: "st",
              price_per_unit: li.unit_price || null,
              price_total: li.total || null,
              paid_amount: isInvoiceDoc ? 0 : li.total || 0,
              status: matStatus,
              created_by_user_id: profile.id,
            }))
          : [{
              project_id: projectId,
              purchase_order_id: po.id,
              name: extraction.vendor_name
                ? `${isInvoiceDoc ? "Faktura" : "Kvitto"} — ${extraction.vendor_name}`
                : smartName,
              vendor_name: extraction.vendor_name || null,
              quantity: 1,
              unit: "st",
              price_total: total,
              paid_amount: isInvoiceDoc ? 0 : total,
              status: matStatus,
              created_by_user_id: profile.id,
            }];

        const { error: matErr } = await supabase.from("materials").insert(matRows);
        if (matErr) throw new Error(matErr.message);

        toast({
          title: t("linkPurchase.created", "Inköp skapat"),
          description: t("linkPurchase.createdDescV2", {
            defaultValue: "{{vendor}} · {{count}} rader · {{amount}}",
            vendor: extraction.vendor_name || "Okänd",
            count: matRows.length,
            amount: formatCurrency(total, "SEK"),
          }),
        });
      }

      onOpenChange(false);
      reset();
      onComplete?.();
    } catch (err) {
      console.error("Save error:", err);
      toast({
        title: t("linkPurchase.saveError", "Kunde inte spara"),
        description: err instanceof Error ? err.message : "Okänt fel",
        variant: "destructive",
      });
      setStep("choose");
    }
  };

  const isInvoice = extraction?.document_type === "invoice" || documentType === "invoice";

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            {isInvoice
              ? t("linkPurchase.titleInvoice", "Faktura mottagen")
              : t("linkPurchase.titleReceipt", "Kvitto mottaget")}
          </DialogTitle>
          <DialogDescription>
            {t("linkPurchase.description", "Koppla till ett befintligt arbete eller skapa nytt inköp.")}
          </DialogDescription>
        </DialogHeader>

        {/* Extracting */}
        {step === "extracting" && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
            <p className="text-sm text-muted-foreground">
              {t("linkPurchase.analyzing", "Läser dokument...")}
            </p>
          </div>
        )}

        {/* Choose: link or create */}
        {step === "choose" && extraction && (
          <div className="space-y-4">
            {/* Extracted info card */}
            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm">
                  {extraction.vendor_name || t("linkPurchase.unknownVendor", "Okänd leverantör")}
                </span>
                <Badge variant={isInvoice ? "default" : "secondary"} className="text-[10px]">
                  {isInvoice ? t("smartUpload.types.invoice") : t("smartUpload.types.receipt")}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground text-sm">
                  {formatCurrency(extraction.total_amount, "SEK")}
                </span>
                {extraction.vat_amount != null && (
                  <span>{t("quoteReview.vat", "Moms")}: {formatCurrency(extraction.vat_amount, "SEK")}</span>
                )}
                {extraction.purchase_date && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> {extraction.purchase_date}
                  </span>
                )}
                {extraction.invoice_number && (
                  <span>#{extraction.invoice_number}</span>
                )}
              </div>
            </div>

            {/* Prompt */}
            <p className="text-sm text-center text-muted-foreground">
              {t("smartUpload.linkPrompt")}
            </p>

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="h-auto py-4 flex flex-col items-center gap-2"
                onClick={() => setStep("link")}
              >
                <Link2 className="h-5 w-5" />
                <span className="text-sm font-medium">{t("smartUpload.linkExisting")}</span>
              </Button>
              <Button
                variant="outline"
                className="h-auto py-4 flex flex-col items-center gap-2"
                onClick={() => handleSave("create")}
              >
                <Plus className="h-5 w-5" />
                <span className="text-sm font-medium">{t("smartUpload.createNew")}</span>
              </Button>
            </div>
          </div>
        )}

        {/* Link: entity picker */}
        {step === "link" && extraction && (
          <div className="flex-1 min-h-0 space-y-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setStep("choose"); setSelectedEntity(null); }}
              className="h-7 text-xs"
            >
              <ArrowLeft className="h-3 w-3 mr-1" />
              {t("common.back", "Tillbaka")}
            </Button>

            <SearchableEntityPicker
              projectId={projectId}
              documentType={extraction.document_type}
              onSelect={setSelectedEntity}
              selectedEntity={selectedEntity}
            />

            <div className="flex justify-end pt-2">
              <Button
                onClick={() => handleSave("link")}
                disabled={!selectedEntity}
              >
                <Link2 className="h-4 w-4 mr-2" />
                {t("linkPurchase.linkButton", "Koppla dokument")}
              </Button>
            </div>
          </div>
        )}

        {/* Saving */}
        {step === "saving" && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
            <p className="text-sm text-muted-foreground">
              {t("linkPurchase.saving", "Sparar...")}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * SmartUploadDialog — Unified intelligent document upload.
 *
 * Drop any file → AI classifies it → suggests where/how to import →
 * routes to the appropriate extraction flow.
 *
 * Supported document types:
 * - Quote (offert) → extract tasks with budget
 * - Invoice/Receipt → link to existing task/purchase or create new
 * - Floor plan → import as canvas background image
 * - Specification/Contract → extract tasks (scope mode)
 * - Product image / Other → store in project files
 */

import { useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Upload,
  FileText,
  Loader2,
  Sparkles,
  Receipt,
  FileImage,
  ScrollText,
  ShoppingCart,
  Image,
  HelpCircle,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  FilePlus,
  Truck,
  ClipboardCheck,
  BadgeCheck,
  Stamp,
} from "lucide-react";
import {
  classifyDocument,
  type ClassificationResult,
  type DocumentType,
  type SuggestedAction,
  DOCUMENT_TYPE_CATALOG,
} from "@/services/smartUploadService";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SmartUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** Callback when user confirms an action — parent handles the actual import flow */
  onAction: (action: SmartUploadAction) => void;
}

export interface SmartUploadAction {
  type: SuggestedAction;
  documentType: DocumentType;
  file: File;
  classification: ClassificationResult;
}

type Step = "upload" | "classifying" | "result";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
].join(",");

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const TYPE_ICONS: Record<DocumentType, typeof FileText> = {
  quote: ScrollText,
  invoice: Receipt,
  receipt: ShoppingCart,
  ata: FilePlus,
  delivery_note: Truck,
  floor_plan: FileImage,
  contract: FileText,
  inspection_report: ClipboardCheck,
  certificate: BadgeCheck,
  permit: Stamp,
  specification: FileText,
  product_image: Image,
  other: HelpCircle,
};

const TYPE_COLORS: Record<DocumentType, string> = {
  quote: "bg-blue-100 text-blue-800",
  invoice: "bg-amber-100 text-amber-800",
  receipt: "bg-green-100 text-green-800",
  ata: "bg-orange-100 text-orange-800",
  delivery_note: "bg-lime-100 text-lime-800",
  floor_plan: "bg-purple-100 text-purple-800",
  contract: "bg-slate-100 text-slate-800",
  inspection_report: "bg-teal-100 text-teal-800",
  certificate: "bg-emerald-100 text-emerald-800",
  permit: "bg-indigo-100 text-indigo-800",
  specification: "bg-cyan-100 text-cyan-800",
  product_image: "bg-pink-100 text-pink-800",
  other: "bg-gray-100 text-gray-800",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SmartUploadDialog({
  open,
  onOpenChange,
  projectId,
  onAction,
}: SmartUploadDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [classification, setClassification] = useState<ClassificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ---- Reset ----
  const reset = useCallback(() => {
    setStep("upload");
    setFile(null);
    setClassification(null);
    setError(null);
  }, []);

  // ---- Handle file selection ----
  const handleFile = useCallback(
    async (selectedFile: File) => {
      if (selectedFile.size > MAX_FILE_SIZE) {
        toast({
          title: t("smartUpload.fileTooLarge", "Filen är för stor"),
          description: t("smartUpload.maxSize", "Max 10 MB"),
          variant: "destructive",
        });
        return;
      }

      setFile(selectedFile);
      setStep("classifying");
      setError(null);

      try {
        const result = await classifyDocument(selectedFile);
        setClassification(result);
        setStep("result");
      } catch (err) {
        console.error("Classification failed:", err);
        setError(
          t(
            "smartUpload.classifyError",
            "Kunde inte analysera dokumentet. Försök igen."
          )
        );
        setStep("upload");
      }
    },
    [t, toast]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) handleFile(droppedFile);
    },
    [handleFile]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (selectedFile) handleFile(selectedFile);
    },
    [handleFile]
  );

  // ---- Confirm action ----
  const handleConfirm = useCallback(
    (actionOverride?: SuggestedAction) => {
      if (!file || !classification) return;
      onAction({
        type: actionOverride || classification.suggested_action,
        documentType: classification.type,
        file,
        classification,
      });
      onOpenChange(false);
      reset();
    },
    [file, classification, onAction, onOpenChange, reset]
  );

  // ---- Render helpers ----
  const typeLabel = (type: DocumentType): string => {
    // From the catalog rather than a parallel list: the two drifted apart
    // before (this one still said "Planritning" after the label became
    // "Ritning"), and a stale label is a paper the person cannot find.
    const entry = DOCUMENT_TYPE_CATALOG.find((d) => d.value === type);
    return entry ? t(entry.labelKey, entry.fallback) : type;
  };

  const actionLabel = (action: SuggestedAction): string => {
    const labels: Record<SuggestedAction, string> = {
      extract_tasks: t("smartUpload.actions.extractTasks", "Extrahera arbeten & budget"),
      extract_purchase: t("smartUpload.actions.extractPurchase", "Koppla till inköp/arbete"),
      import_to_canvas: t("smartUpload.actions.importCanvas", "Lägg på ritningsytan"),
      store_only: t("smartUpload.actions.storeOnly", "Spara i projektfiler"),
    };
    return labels[action] || action;
  };

  const TypeIcon = classification ? TYPE_ICONS[classification.type] : FileText;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {t("smartUpload.title", "Smart uppladdning")}
          </DialogTitle>
        </DialogHeader>

        {/* ---- STEP: Upload ---- */}
        {step === "upload" && (
          <div
            className="flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed border-muted-foreground/25 p-8 cursor-pointer hover:border-primary/50 transition-colors"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-10 w-10 text-muted-foreground" />
            <div className="text-center">
              <p className="font-medium">
                {t("smartUpload.dropHere", "Dra & släpp eller klicka för att välja")}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {t(
                  "smartUpload.supportedTypes",
                  "Offert, faktura, kvitto, planritning, avtal, bilder..."
                )}
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES}
              className="hidden"
              onChange={handleInputChange}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        {/* ---- STEP: Classifying ---- */}
        {step === "classifying" && (
          <div className="flex flex-col items-center justify-center gap-4 py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              {t("smartUpload.analyzing", "Analyserar dokument...")}
            </p>
            {file && (
              <p className="text-xs text-muted-foreground truncate max-w-[300px]">
                {file.name}
              </p>
            )}
          </div>
        )}

        {/* ---- STEP: Result ---- */}
        {step === "result" && classification && file && (
          <div className="space-y-4">
            {/* File info */}
            <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
              <TypeIcon className="h-8 w-8 text-muted-foreground flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(0)} KB
                </p>
              </div>
              <Badge className={TYPE_COLORS[classification.type]}>
                {typeLabel(classification.type)}
              </Badge>
            </div>

            {/* AI summary */}
            <div className="rounded-lg border p-3 space-y-2">
              <p className="text-sm">{classification.summary}</p>
              {classification.vendor_name && (
                <p className="text-xs text-muted-foreground">
                  {t("smartUpload.vendor", "Leverantör")}: {classification.vendor_name}
                </p>
              )}
            </div>

            {/* Suggested action */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t("smartUpload.suggestedAction", "Föreslagen åtgärd")}
              </p>
              <Button
                className="w-full justify-between"
                size="lg"
                onClick={() => handleConfirm()}
              >
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  {actionLabel(classification.suggested_action)}
                </span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Alternative actions */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                {t("smartUpload.orChoose", "Eller välj annat:")}
              </p>
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    "extract_tasks",
                    "extract_purchase",
                    "import_to_canvas",
                    "store_only",
                  ] as SuggestedAction[]
                )
                  .filter((a) => a !== classification.suggested_action)
                  .map((action) => (
                    <Button
                      key={action}
                      variant="outline"
                      size="sm"
                      onClick={() => handleConfirm(action)}
                    >
                      {actionLabel(action)}
                    </Button>
                  ))}
              </div>
            </div>

            {/* Retry */}
            <div className="flex justify-center pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={reset}
                className="text-muted-foreground"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                {t("smartUpload.uploadAnother", "Ladda upp annan fil")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

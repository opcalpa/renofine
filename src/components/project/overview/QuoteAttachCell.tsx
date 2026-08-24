import { useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Paperclip, Upload, Loader2, FileText, X, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/currency";
import { analyzeDocument } from "@/services/receiptAnalysisService";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaskQuoteInfo {
  fileId: string;
  fileName: string;
  amount: number | null;
  url: string;
}

interface QuoteAttachCellProps {
  taskId: string;
  projectId: string;
  quote: TaskQuoteInfo | null;
  currency?: string | null;
  onQuoteChange: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function compressImage(
  file: File,
  maxWidth = 1600,
  maxHeight = 1600,
  quality = 0.85
): Promise<File> {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxWidth || height > maxHeight) {
        if (width > height) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        } else {
          width = (width * maxHeight) / height;
          height = maxHeight;
        }
      }
      canvas.width = width;
      canvas.height = height;
      ctx?.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
          } else {
            resolve(file);
          }
        },
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function QuoteAttachCell({
  taskId,
  projectId,
  quote,
  currency,
  onQuoteChange,
}: QuoteAttachCellProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [extractedAmount, setExtractedAmount] = useState<string>("");
  const [manualAmount, setManualAmount] = useState<string>("");
  const [vendorName, setVendorName] = useState("");
  const [step, setStep] = useState<"idle" | "preview">("idle");

  const resetState = useCallback(() => {
    setPendingFile(null);
    setExtractedAmount("");
    setManualAmount("");
    setVendorName("");
    setStep("idle");
    setUploading(false);
    setAnalyzing(false);
  }, []);

  // ---- File selected → analyze ----
  const handleFileSelect = async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      toast({ variant: "destructive", description: t("common.fileTooLarge", "File too large (max 10 MB)") });
      return;
    }

    setPendingFile(file);
    setStep("preview");

    // Try AI extraction for images
    const isImage = file.type.startsWith("image/");
    if (isImage) {
      setAnalyzing(true);
      try {
        const compressed = await compressImage(file);
        const base64 = await fileToBase64(compressed);
        const result = await analyzeDocument(base64);
        if (result.total_amount > 0) {
          setExtractedAmount(result.total_amount.toString());
          setManualAmount(result.total_amount.toString());
        }
        if (result.vendor_name) {
          setVendorName(result.vendor_name);
        }
      } catch {
        // AI extraction failed — user enters manually
      } finally {
        setAnalyzing(false);
      }
    }
  };

  // ---- Save: upload file + link to task + update budget ----
  const handleSave = async () => {
    if (!pendingFile) return;
    setUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();
      if (!profile) throw new Error("Profile not found");

      // Prepare file for upload
      let uploadFile = pendingFile;
      const isImage = pendingFile.type.startsWith("image/");
      if (isImage) {
        uploadFile = await compressImage(pendingFile);
      }

      const ext = uploadFile.name.split(".").pop() || "jpg";
      const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const storagePath = `projects/${projectId}/quotes/${uniqueName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("project-files")
        .upload(storagePath, uploadFile);
      if (uploadError) throw uploadError;

      // Create photo record
      await supabase.from("photos").insert({
        linked_to_type: "task",
        linked_to_id: taskId,
        // Store the storage path; readers sign it on demand.
        url: storagePath,
        caption: vendorName ? `${t("homeownerPlanning.quoteFrom", "Quote from")} ${vendorName}` : pendingFile.name,
        mime_type: uploadFile.type,
        uploaded_by_user_id: profile.id,
      });

      // Create task_file_link
      await supabase.from("task_file_links").insert({
        project_id: projectId,
        task_id: taskId,
        file_path: storagePath,
        file_name: vendorName
          ? `Offert_${vendorName.replace(/[^a-zA-Z0-9åäöÅÄÖ]/g, "_")}.${ext}`
          : pendingFile.name,
        file_type: "quote",
        file_size: uploadFile.size,
        mime_type: uploadFile.type,
        linked_by_user_id: profile.id,
      });

      // Update task budget with quote amount
      const amount = manualAmount ? parseFloat(manualAmount) : null;
      if (amount && amount > 0) {
        await supabase
          .from("tasks")
          .update({ budget: amount })
          .eq("id", taskId);
      }

      toast({ description: t("homeownerPlanning.quoteAttached", "Quote attached") });
      resetState();
      setOpen(false);
      onQuoteChange();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      toast({ variant: "destructive", description: msg });
    } finally {
      setUploading(false);
    }
  };

  // ---- Remove existing quote ----
  const handleRemove = async () => {
    if (!quote) return;
    try {
      await supabase.from("task_file_links").delete().eq("id", quote.fileId);
      // Clear budget if it matched the quote amount
      if (quote.amount) {
        const { data: task } = await supabase
          .from("tasks")
          .select("budget")
          .eq("id", taskId)
          .single();
        if (task && task.budget === quote.amount) {
          await supabase.from("tasks").update({ budget: null }).eq("id", taskId);
        }
      }
      toast({ description: t("homeownerPlanning.quoteRemoved", "Quote removed") });
      setOpen(false);
      onQuoteChange();
    } catch {
      toast({ variant: "destructive", description: t("common.error") });
    }
  };

  // ---- Render trigger ----
  const triggerContent = quote ? (
    <button
      type="button"
      className="flex items-center gap-1 text-xs text-primary hover:underline max-w-[120px] truncate"
      onClick={() => setOpen(true)}
    >
      <FileText className="h-3 w-3 shrink-0" />
      <span className="truncate">{quote.amount ? formatCurrency(quote.amount, currency) : quote.fileName}</span>
    </button>
  ) : (
    <button
      type="button"
      className="text-muted-foreground/40 hover:text-muted-foreground transition-colors"
      onClick={() => setOpen(true)}
    >
      <Paperclip className="h-3.5 w-3.5" />
    </button>
  );

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileSelect(file);
          e.target.value = "";
        }}
      />
      <Popover open={open} onOpenChange={(isOpen) => { if (!isOpen) { resetState(); } setOpen(isOpen); }}>
        <PopoverTrigger asChild>
          {triggerContent}
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3" align="start">
          {/* Existing quote */}
          {quote && step === "idle" && (
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <FileText className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{quote.fileName}</p>
                  {quote.amount != null && (
                    <p className="text-xs text-muted-foreground">{formatCurrency(quote.amount, currency)}</p>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 text-xs"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-3 w-3 mr-1" />
                  {t("homeownerPlanning.replaceQuote", "Replace")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs text-destructive hover:text-destructive"
                  onClick={handleRemove}
                >
                  <X className="h-3 w-3 mr-1" />
                  {t("common.remove", "Remove")}
                </Button>
              </div>
              {quote.url && (
                <a
                  href={quote.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
                >
                  {t("homeownerPlanning.viewQuote", "View file")}
                </a>
              )}
            </div>
          )}

          {/* No quote yet — upload prompt */}
          {!quote && step === "idle" && (
            <div className="space-y-3">
              <p className="text-sm font-medium">{t("homeownerPlanning.attachQuote", "Attach a quote")}</p>
              <p className="text-xs text-muted-foreground">
                {t("homeownerPlanning.attachQuoteHint", "Upload a quote from a builder. We'll try to extract the price automatically.")}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="w-full gap-1.5"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" />
                {t("homeownerPlanning.uploadQuote", "Choose file")}
              </Button>
            </div>
          )}

          {/* Preview & amount entry */}
          {step === "preview" && pendingFile && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm truncate flex-1">{pendingFile.name}</span>
              </div>

              {analyzing && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t("homeownerPlanning.analyzingQuote", "Reading quote...")}
                </div>
              )}

              {extractedAmount && !analyzing && (
                <div className="flex items-center gap-1.5 text-xs text-primary">
                  <Sparkles className="h-3 w-3" />
                  {t("homeownerPlanning.extractedAmount", "Detected amount: {{amount}}", {
                    amount: formatCurrency(parseFloat(extractedAmount), currency),
                  })}
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs">{t("homeownerPlanning.quoteAmount", "Quote amount")}</Label>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  placeholder="SEK"
                  value={manualAmount}
                  onChange={(e) => setManualAmount(e.target.value)}
                  disabled={analyzing}
                  className="h-8"
                />
              </div>

              {vendorName && (
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("homeownerPlanning.quoteVendor", "From")}</Label>
                  <Input
                    value={vendorName}
                    onChange={(e) => setVendorName(e.target.value)}
                    className="h-8"
                  />
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={handleSave}
                  disabled={uploading || analyzing}
                >
                  {uploading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                  {t("common.save", "Save")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { resetState(); }}
                  disabled={uploading}
                >
                  {t("common.cancel", "Cancel")}
                </Button>
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </>
  );
}

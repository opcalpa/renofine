import { useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  FileText,
  Plus,
  Upload,
  Loader2,
  Trash2,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/currency";
import { analyzeDocument } from "@/services/receiptAnalysisService";
import { useFileUrls } from "@/lib/fileUrl";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExternalQuote {
  id: string;
  project_id: string;
  builder_name: string;
  total_amount: number;
  file_path: string | null;
  file_name: string | null;
  notes: string | null;
  color: string;
  created_at: string;
  /** How much has been allocated to tasks so far */
  allocated: number;
  /** How many tasks this quote is assigned to */
  task_count: number;
}

interface ImportQuotePopoverProps {
  projectId: string;
  quotes: ExternalQuote[];
  currency?: string | null;
  onQuotesChange: () => void;
  /** Called when user chooses "smart import" — parent opens PlanningSmartImportDialog with the file */
  onSmartImport?: (file: File) => void;
}

// ---------------------------------------------------------------------------
// Color palette — auto-assigned
// ---------------------------------------------------------------------------

const QUOTE_COLORS = [
  "#6366f1", // indigo
  "#0ea5e9", // sky
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#14b8a6", // teal
];

function nextColor(existing: ExternalQuote[]): string {
  const used = new Set(existing.map((q) => q.color));
  return QUOTE_COLORS.find((c) => !used.has(c)) ?? QUOTE_COLORS[existing.length % QUOTE_COLORS.length];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE = 10 * 1024 * 1024;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function compressImage(file: File, maxW = 1600, maxH = 1600, q = 0.85): Promise<File> {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxW || height > maxH) {
        if (width > height) { height = (height * maxW) / width; width = maxW; }
        else { width = (width * maxH) / height; height = maxH; }
      }
      canvas.width = width;
      canvas.height = height;
      ctx?.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => blob ? resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" })) : resolve(file),
        "image/jpeg", q,
      );
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ImportQuotePopover({
  projectId,
  quotes,
  currency,
  onQuotesChange,
  onSmartImport,
}: ImportQuotePopoverProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const quoteFileUrls = useFileUrls(quotes.map((q) => q.file_path));

  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);

  // Add-form state
  const [builderName, setBuilderName] = useState("");
  const [amount, setAmount] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [showSmartPrompt, setShowSmartPrompt] = useState(false);

  const resetForm = useCallback(() => {
    setBuilderName("");
    setAmount("");
    setPendingFile(null);
    setAdding(false);
    setAnalyzing(false);
    setShowSmartPrompt(false);
  }, []);

  // ---- File selected → AI extract ----
  const handleFileSelect = async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      toast({ variant: "destructive", description: t("common.fileTooLarge", "File too large (max 10 MB)") });
      return;
    }
    setPendingFile(file);

    // For documents (PDF, DOCX), offer smart import option
    const isDocument = file.type === 'application/pdf' || file.name.endsWith('.docx') || file.name.endsWith('.doc') || file.name.endsWith('.txt');
    if (isDocument && onSmartImport) {
      setShowSmartPrompt(true);
    }

    const isImage = file.type.startsWith("image/");
    if (isImage) {
      setAnalyzing(true);
      try {
        const compressed = await compressImage(file);
        const base64 = await fileToBase64(compressed);
        const result = await analyzeDocument(base64);
        if (result.total_amount > 0 && !amount) {
          setAmount(result.total_amount.toString());
        }
        if (result.vendor_name && !builderName) {
          setBuilderName(result.vendor_name);
        }
      } catch {
        // AI extraction optional
      } finally {
        setAnalyzing(false);
      }
    }
  };

  // ---- Save new quote ----
  const handleSave = async () => {
    const parsedAmount = parseFloat(amount);
    if (!builderName.trim() || isNaN(parsedAmount) || parsedAmount <= 0) {
      toast({ variant: "destructive", description: t("externalQuotes.fillRequired", "Enter builder name and amount") });
      return;
    }

    setUploading(true);
    try {
      let filePath: string | null = null;
      let fileName: string | null = null;

      // Upload file if provided
      if (pendingFile) {
        let uploadFile = pendingFile;
        if (pendingFile.type.startsWith("image/")) {
          uploadFile = await compressImage(pendingFile);
        }
        const ext = uploadFile.name.split(".").pop() || "pdf";
        const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        filePath = `projects/${projectId}/external-quotes/${uniqueName}`;
        fileName = pendingFile.name;

        const { error: upErr } = await supabase.storage
          .from("project-files")
          .upload(filePath, uploadFile);
        if (upErr) throw upErr;
      }

      const { error } = await supabase.from("external_quotes").insert({
        project_id: projectId,
        builder_name: builderName.trim(),
        total_amount: parsedAmount,
        file_path: filePath,
        file_name: fileName,
        color: nextColor(quotes),
      });

      if (error) throw error;

      toast({ description: t("externalQuotes.imported", "Quote imported") });
      resetForm();
      onQuotesChange();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed";
      toast({ variant: "destructive", description: msg });
    } finally {
      setUploading(false);
    }
  };

  // ---- Delete quote ----
  const handleDelete = async (quoteId: string) => {
    const { error } = await supabase.from("external_quotes").delete().eq("id", quoteId);
    if (error) {
      toast({ variant: "destructive", description: error.message });
    } else {
      onQuotesChange();
    }
  };

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

      <Popover open={open} onOpenChange={(isOpen) => { setOpen(isOpen); if (!isOpen) resetForm(); }}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline" className="gap-1.5" title={t("externalQuotes.importQuote", "Import quote")}>
            <FileText className="h-3.5 w-3.5" />
            {quotes.length > 0 && (
              <span className="rounded-full bg-primary/10 text-primary text-xs px-1.5 py-0.5 tabular-nums">
                {quotes.length}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="end">
          <div className="p-3 border-b">
            <p className="text-sm font-medium">{t("externalQuotes.title", "Imported quotes")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("externalQuotes.subtitle", "Quotes received from builders outside the app")}
            </p>
          </div>

          {/* Quote list */}
          {quotes.length > 0 && (
            <div className="max-h-60 overflow-y-auto">
              {quotes.map((q) => {
                const remaining = q.total_amount - q.allocated;
                return (
                  <div key={q.id} className="px-3 py-2.5 border-b last:border-b-0 hover:bg-muted/50">
                    <div className="flex items-start gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0"
                        style={{ backgroundColor: q.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium truncate">{q.builder_name}</span>
                          <span className="text-sm tabular-nums shrink-0">
                            {formatCurrency(q.total_amount, currency)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                          <span>
                            {q.task_count > 0
                              ? t("externalQuotes.taskCount", "{{count}} tasks", { count: q.task_count })
                              : t("externalQuotes.unassigned", "Not assigned")}
                          </span>
                          {q.task_count > 0 && remaining > 0 && (
                            <span className="text-amber-600">
                              {formatCurrency(remaining, currency)} {t("externalQuotes.remaining", "remaining")}
                            </span>
                          )}
                          {q.file_path && (
                            <a
                              href={quoteFileUrls.get(q.file_path) ?? undefined}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline inline-flex items-center gap-0.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="h-3 w-3" />
                              PDF
                            </a>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="text-muted-foreground/50 hover:text-destructive transition-colors mt-0.5"
                        onClick={() => handleDelete(q.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Empty state */}
          {quotes.length === 0 && !adding && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {t("externalQuotes.empty", "No quotes imported yet")}
            </div>
          )}

          {/* Add form */}
          {adding ? (
            <div className="p-3 border-t space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("externalQuotes.builderName", "Builder / company")}</Label>
                <Input
                  autoFocus
                  value={builderName}
                  onChange={(e) => setBuilderName(e.target.value)}
                  placeholder={t("externalQuotes.builderPlaceholder", "e.g. Bygg-Kalle AB")}
                  className="h-8"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("externalQuotes.amount", "Total amount")}</Label>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="SEK"
                  className="h-8"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("externalQuotes.file", "Quote document (optional)")}</Label>
                {pendingFile ? (
                  <div className="flex items-center gap-2 text-xs">
                    <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="truncate flex-1">{pendingFile.name}</span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setPendingFile(null)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full gap-1.5 h-8"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {t("externalQuotes.chooseFile", "Choose file")}
                  </Button>
                )}
              </div>
              {analyzing && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Sparkles className="h-3 w-3 animate-pulse text-primary" />
                  {t("externalQuotes.analyzing", "Reading quote...")}
                </div>
              )}
              {/* Smart import prompt — shown after document (PDF/DOCX) selected */}
              {showSmartPrompt && pendingFile && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
                  <p className="text-xs font-medium">
                    {t("externalQuotes.smartPromptTitle", "Vill du att AI skapar arbeten och rum?")}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {t("externalQuotes.smartPromptDesc", "AI kan läsa dokumentet och automatiskt skapa arbetsuppgifter, rum och prisuppgifter.")}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="default"
                      className="flex-1 h-7 text-xs gap-1"
                      onClick={() => {
                        setOpen(false);
                        setShowSmartPrompt(false);
                        if (onSmartImport && pendingFile) onSmartImport(pendingFile);
                        resetForm();
                      }}
                    >
                      <Sparkles className="h-3 w-3" />
                      {t("externalQuotes.smartImportYes", "Ja, skapa arbeten")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-7 text-xs"
                      onClick={() => setShowSmartPrompt(false)}
                    >
                      {t("externalQuotes.smartImportNo", "Bara bifoga")}
                    </Button>
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={handleSave}
                  disabled={uploading || analyzing || !builderName.trim() || !amount}
                >
                  {uploading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                  {t("common.save", "Save")}
                </Button>
                <Button size="sm" variant="ghost" onClick={resetForm} disabled={uploading}>
                  {t("common.cancel", "Cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-2 border-t">
              <Button
                variant="ghost"
                size="sm"
                className="w-full gap-1.5 justify-start text-sm"
                onClick={() => setAdding(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                {t("externalQuotes.addQuote", "Add quote")}
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </>
  );
}

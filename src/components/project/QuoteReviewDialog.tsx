/**
 * QuoteReviewDialog — Review and import extracted quote data into project.
 *
 * Shows extracted line items with pricing, rooms, and quote metadata.
 * User can edit, select/deselect items before importing.
 *
 * Import modes (driven by quoteSource):
 *   - purchase_order (A): 1 purchase_orders row + N materials linked to it.
 *     Default for building_supplier quotes (Vindö, Bauhaus, etc) and mixed
 *     when AI can't decide — safest fallback since 1 order can be allocated.
 *   - material_budget (B): 1 stub task (budget=sum) + N materials under it.
 *     Default for contractor quotes (snickare etc) where material is a budget
 *     line rather than a concrete order.
 *
 * No "each line → its own task" mode — material rows (skruv, gips) are never
 * tasks. The task domain is for work items ("Riva vägg", "Måla tak"), not
 * material rows. If a contractor scope has distinct work items mixed with
 * material lines, mode B keeps the work-task structure via AI's `parentTaskName`.
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
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Sparkles,
  Loader2,
  Home,
  ClipboardList,
  Edit2,
  FileText,
  Receipt,
  Calendar,
  Building2,
  ShoppingCart,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/currency";
import {
  type TaskCategory,
  TASK_CATEGORY_LABELS,
} from "@/services/aiDocumentService.types";
import type {
  ExtractedTask,
  ExtractedRoom,
  QuoteMetadata,
  DocumentExtractionResult,
} from "@/services/smartUploadService";

type ImportMode = "purchase_order" | "material_budget";

const DEFAULT_MODE_BY_SOURCE: Record<NonNullable<QuoteMetadata["quoteSource"]>, ImportMode> = {
  building_supplier: "purchase_order",
  contractor: "material_budget",
  // Mixed quotes default to purchase_order — safer because 1 order can be
  // re-allocated to multiple tasks post-import. Material_budget would lock
  // the user into 1 task that may not match the scope.
  mixed: "purchase_order",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EditableRoom extends ExtractedRoom {
  index: number;
  selected: boolean;
}

interface EditableTask extends ExtractedTask {
  index: number;
  selected: boolean;
}

interface QuoteReviewDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The file to process — dialog handles upload + extraction */
  file: File | null;
  onImportComplete?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ConfidenceIndicator({ confidence }: { confidence: number }) {
  if (confidence >= 0.8)
    return <span title={`${Math.round(confidence * 100)}%`}>🟢</span>;
  if (confidence >= 0.5)
    return <span title={`${Math.round(confidence * 100)}%`}>🟡</span>;
  return <span title={`${Math.round(confidence * 100)}%`}>🔴</span>;
}

// formatCurrency imported from @/lib/currency

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function QuoteReviewDialog({
  projectId,
  open,
  onOpenChange,
  file,
  onImportComplete,
}: QuoteReviewDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [step, setStep] = useState<"extracting" | "review" | "importing">("extracting");
  const [rooms, setRooms] = useState<EditableRoom[]>([]);
  const [tasks, setTasks] = useState<EditableTask[]>([]);
  const [summary, setSummary] = useState("");
  const [quoteMetadata, setQuoteMetadata] = useState<QuoteMetadata | null>(null);
  const [editingTaskIndex, setEditingTaskIndex] = useState<number | null>(null);
  const [editingRoomIndex, setEditingRoomIndex] = useState<number | null>(null);
  const [tempPath, setTempPath] = useState<string | null>(null);
  const [extracted, setExtracted] = useState(false);
  const [mode, setMode] = useState<ImportMode>("purchase_order");
  const [linkToTaskId, setLinkToTaskId] = useState<string>("none");
  const [existingTasks, setExistingTasks] = useState<{ id: string; title: string }[]>([]);

  const resetState = useCallback(() => {
    setStep("extracting");
    setRooms([]);
    setTasks([]);
    setSummary("");
    setQuoteMetadata(null);
    setEditingTaskIndex(null);
    setEditingRoomIndex(null);
    setExtracted(false);
    setMode("purchase_order");
    setLinkToTaskId("none");
  }, []);

  // Load existing tasks for the "Link to task" dropdown when dialog opens.
  useEffect(() => {
    if (!open || !projectId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("tasks")
        .select("id, title")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });
      if (!cancelled) setExistingTasks(data || []);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, projectId]);

  // ---- Start extraction when dialog opens with file ----
  const startExtraction = useCallback(async () => {
    if (!file || extracted) return;
    setExtracted(true);
    setStep("extracting");

    try {
      // Upload directly under projects/{projectId}/ so the storage RLS policy
      // (user_can_manage_project_files) accepts it. Path is kept around so we
      // can clean up the file on cancel.
      const path = `projects/${projectId}/quote-imports/${Date.now()}-${file.name}`;
      const { error: uploadErr } = await supabase.storage
        .from("project-files")
        .upload(path, file, { upsert: true });
      if (uploadErr) throw new Error(uploadErr.message);
      setTempPath(path);

      const { data: urlData } = supabase.storage
        .from("project-files")
        .getPublicUrl(path);

      // Call process-document-v2 (Claude Haiku 4.5, 2-pass) via fetch so we
      // surface the real server-side error body on non-2xx. Auto-retry once
      // on edge worker timeout codes — v2 stays under 60s reliably but the
      // retry guards against transient cold-start blips.
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token ?? supabaseAnonKey;

      const callExtraction = async () => {
        const r = await fetch(`${supabaseUrl}/functions/v1/process-document-v2`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
            apikey: supabaseAnonKey,
          },
          body: JSON.stringify({
            fileUrl: urlData.publicUrl,
            fileType: file.type,
            fileName: file.name,
            mode: 'quote',
          }),
        });
        const body = await r.json().catch(() => null);
        return { status: r.status, ok: r.ok, body };
      };

      let attempt = await callExtraction();
      const isRetryable = [546, 504, 524].includes(attempt.status);
      if (!attempt.ok && isRetryable) {
        console.warn(`process-document attempt 1 failed (${attempt.status}) — retrying once`);
        attempt = await callExtraction();
      }

      if (!attempt.ok || attempt.body?.error) {
        supabase.storage.from("project-files").remove([path]);
        const serverMessage = attempt.body?.error || `HTTP ${attempt.status}`;
        const timeoutHint = isRetryable
          ? ` ${t("quoteReview.timeoutHint", "(Stora dokument kan timeouta — pröva igen eller dela upp dokumentet)")}`
          : "";
        throw new Error(`${serverMessage}${timeoutHint}`);
      }

      const result = attempt.body as DocumentExtractionResult;

      setSummary(result.documentSummary || "");
      setQuoteMetadata(result.quoteMetadata || null);

      // Default import mode from AI's quoteSource classification.
      const source = result.quoteMetadata?.quoteSource;
      if (source && DEFAULT_MODE_BY_SOURCE[source]) {
        setMode(DEFAULT_MODE_BY_SOURCE[source]);
      }

      setRooms(
        (result.rooms || []).map((room, index) => ({
          ...room,
          index,
          selected: room.confidence >= 0.5,
        }))
      );

      setTasks(
        (result.tasks || []).map((task, index) => ({
          ...task,
          index,
          selected: task.confidence >= 0.5,
        }))
      );

      setStep("review");

      toast({
        title: t("quoteReview.analysisDone", "Offert analyserad"),
        description: t("quoteReview.analysisResult", {
          defaultValue: "{{tasks}} arbeten och {{rooms}} rum hittade",
          tasks: (result.tasks || []).length,
          rooms: (result.rooms || []).length,
        }),
      });
    } catch (err) {
      console.error("Quote extraction error:", err);
      toast({
        title: t("quoteReview.analysisError", "Kunde inte analysera offerten"),
        description: err instanceof Error ? err.message : "Okänt fel",
        variant: "destructive",
      });
      onOpenChange(false);
      resetState();
    }
  }, [file, extracted, projectId, t, toast, onOpenChange, resetState]);

  // Trigger extraction when dialog opens
  if (open && file && !extracted) {
    startExtraction();
  }

  // ---- Import ----
  const handleImport = async () => {
    const selectedRooms = rooms.filter((r) => r.selected);
    const selectedTasks = tasks.filter((tk) => tk.selected);

    if (selectedRooms.length === 0 && selectedTasks.length === 0) {
      toast({
        title: t("aiDocumentImport.nothingSelected"),
        description: t("aiDocumentImport.selectAtLeastOne"),
        variant: "destructive",
      });
      return;
    }

    setStep("importing");

    try {
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !user) throw new Error("Inte inloggad");

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();
      if (!profile) throw new Error("Profil hittades inte");

      // File was already uploaded to projects/{projectId}/quote-imports/ during
      // extraction — no need to move it. tempPath stays as the canonical location.

      // Create rooms
      const createdRoomIds = new Map<string, string>();
      for (const room of selectedRooms) {
        const { data: roomData, error: roomErr } = await supabase
          .from("rooms")
          .insert({
            project_id: projectId,
            name: room.name,
            description: room.description,
            dimensions: room.estimatedAreaSqm
              ? { estimatedAreaSqm: room.estimatedAreaSqm }
              : null,
          })
          .select("id")
          .single();

        if (roomErr) {
          console.error("Error creating room:", roomErr);
          continue;
        }
        createdRoomIds.set(room.name.toLowerCase(), roomData.id);
      }

      const linkTaskId = linkToTaskId === "none" ? null : linkToTaskId;

      // Insert one purchase_order + N materials. Used by mode A.
      // Returns the new purchase_order id or null on failure.
      const createPurchaseOrder = async (): Promise<string | null> => {
        const totalAmount = quoteMetadata?.totalAmount
          ?? selectedTasks.reduce((s, tk) => s + (tk.estimatedCost || tk.materialCost || 0), 0);
        const vendorName = quoteMetadata?.vendorName || t("quoteReview.unknownVendor", "Okänd leverantör");

        const { data: po, error: poErr } = await supabase
          .from("purchase_orders")
          .insert({
            project_id: projectId,
            vendor_name: vendorName,
            total: totalAmount,
            status: "ordered",
            ordered_at: quoteMetadata?.quoteDate || new Date().toISOString(),
            source: "ai_quote",
            created_by_user_id: profile.id,
            notes: quoteMetadata?.quoteNumber ? `#${quoteMetadata.quoteNumber}` : null,
            receipt_file_path: tempPath || null,
          })
          .select("id")
          .single();

        if (poErr) {
          console.error("Error creating purchase_order:", poErr);
          throw new Error(poErr.message);
        }
        return po.id;
      };

      // Insert one material row per extracted task. Used by mode A + B.
      const insertMaterialRow = async (task: EditableTask, opts: { purchaseOrderId?: string | null; taskId?: string | null }) => {
        const cost = task.estimatedCost || task.materialCost || 0;
        const roomId = task.roomName ? createdRoomIds.get(task.roomName.toLowerCase()) || null : null;
        const { error: matErr } = await supabase.from("materials").insert({
          project_id: projectId,
          name: task.title,
          description: task.description,
          quantity: 1,
          unit: "st",
          price_per_unit: cost > 0 ? cost : null,
          price_total: cost > 0 ? cost : null,
          status: opts.purchaseOrderId ? "ordered" : "planned",
          purchase_order_id: opts.purchaseOrderId || null,
          task_id: opts.taskId || null,
          room_id: roomId,
          vendor_name: quoteMetadata?.vendorName || null,
          created_by_user_id: profile.id,
        });
        if (matErr) console.error("Error creating material:", matErr);
      };

      if (mode === "purchase_order") {
        // ----- Mode A: 1 purchase_order + N materials, optionally linked to a task -----
        const poId = await createPurchaseOrder();
        for (const tk of selectedTasks) {
          await insertMaterialRow(tk, { purchaseOrderId: poId, taskId: linkTaskId });
        }
      } else if (mode === "material_budget") {
        // ----- Mode B: 1 stub task (or use linked task) + N materials -----
        let bucketTaskId = linkTaskId;
        if (!bucketTaskId) {
          const totalBudget = selectedTasks.reduce(
            (s, tk) => s + ((tk.estimatedCost || 0) + (tk.materialCost || 0)),
            0,
          );
          const stubTitle = quoteMetadata?.vendorName
            ? t("quoteReview.materialBudgetTitle", {
                defaultValue: "Materialbudget — {{vendor}}",
                vendor: quoteMetadata.vendorName,
              })
            : t("quoteReview.materialBudgetTitleFallback", "Materialbudget");
          const { data: stub, error: stubErr } = await supabase
            .from("tasks")
            .insert({
              project_id: projectId,
              title: stubTitle,
              description: summary || null,
              status: "to_do",
              priority: "medium",
              created_by_user_id: profile.id,
              cost_center: "construction",
              task_cost_type: "subcontractor",
              budget: totalBudget > 0 ? totalBudget : null,
              material_estimate: totalBudget > 0 ? totalBudget : null,
            })
            .select("id")
            .single();
          if (stubErr) {
            console.error("Error creating stub task:", stubErr);
            throw new Error(stubErr.message);
          }
          bucketTaskId = stub.id;
        }
        for (const tk of selectedTasks) {
          await insertMaterialRow(tk, { taskId: bucketTaskId, purchaseOrderId: null });
        }
      }

      // Create external quote record if metadata exists (kept for both modes)
      if (quoteMetadata?.vendorName && quoteMetadata?.totalAmount) {
        await supabase.from("external_quotes").insert({
          project_id: projectId,
          builder_name: quoteMetadata.vendorName,
          total_amount: quoteMetadata.totalAmount,
        });
      }

      toast({
        title: t("quoteReview.importDone", "Offert importerad"),
        description: t("quoteReview.importResult", {
          defaultValue: "{{rooms}} rum och {{tasks}} arbeten skapade",
          rooms: selectedRooms.length,
          tasks: selectedTasks.length,
        }),
      });

      // File is now referenced by purchase_orders.receipt_file_path — clear
      // tempPath so the dialog's onOpenChange cleanup doesn't delete it.
      setTempPath(null);
      onOpenChange(false);
      resetState();
      onImportComplete?.();
    } catch (err) {
      console.error("Import error:", err);
      toast({
        title: t("quoteReview.importError", "Kunde inte importera"),
        description: err instanceof Error ? err.message : "Okänt fel",
        variant: "destructive",
      });
      setStep("review");
    }
  };

  // ---- Selection helpers ----
  const toggleRoom = (index: number) =>
    setRooms((p) => p.map((r) => (r.index === index ? { ...r, selected: !r.selected } : r)));
  const toggleTask = (index: number) =>
    setTasks((p) => p.map((tk) => (tk.index === index ? { ...tk, selected: !tk.selected } : tk)));
  const updateTask = (index: number, updates: Partial<ExtractedTask>) =>
    setTasks((p) => p.map((tk) => (tk.index === index ? { ...tk, ...updates } : tk)));
  const updateRoom = (index: number, updates: Partial<ExtractedRoom>) =>
    setRooms((p) => p.map((r) => (r.index === index ? { ...r, ...updates } : r)));

  const selectedTaskCount = tasks.filter((tk) => tk.selected).length;
  const selectedRoomCount = rooms.filter((r) => r.selected).length;
  const totalSelectedCost = tasks
    .filter((tk) => tk.selected && tk.estimatedCost)
    .reduce((sum, tk) => sum + (tk.estimatedCost || 0), 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && tempPath) {
          supabase.storage.from("project-files").remove([tempPath]);
        }
        onOpenChange(o);
        if (!o) resetState();
      }}
    >
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            {t("quoteReview.title", "Granska offert")}
          </DialogTitle>
          <DialogDescription>
            {t("quoteReview.description", "Granska extraherade arbeten och priser innan import.")}
          </DialogDescription>
        </DialogHeader>

        {/* Extracting */}
        {step === "extracting" && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-lg font-medium">
              {t("quoteReview.extracting", "Analyserar offert...")}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              {t("quoteReview.extractingTime", "Detta tar vanligtvis 10-30 sekunder")}
            </p>
          </div>
        )}

        {/* Review */}
        {step === "review" && (
          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            <div className="space-y-4">
              {/* Quote metadata card */}
              {quoteMetadata && (
                <div className="rounded-lg border bg-blue-50/50 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-blue-600" />
                    <span className="font-medium text-sm">
                      {quoteMetadata.vendorName || t("quoteReview.unknownVendor", "Okänd leverantör")}
                    </span>
                    {quoteMetadata.quoteNumber && (
                      <Badge variant="secondary" className="text-[10px]">
                        #{quoteMetadata.quoteNumber}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {quoteMetadata.totalAmount != null && (
                      <span className="font-medium text-foreground">
                        {t("quoteReview.total", "Totalt")}: {formatCurrency(quoteMetadata.totalAmount, "SEK")}
                      </span>
                    )}
                    {quoteMetadata.vatAmount != null && (
                      <span>{t("quoteReview.vat", "Moms")}: {formatCurrency(quoteMetadata.vatAmount, "SEK")}</span>
                    )}
                    {quoteMetadata.quoteDate && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> {quoteMetadata.quoteDate}
                      </span>
                    )}
                    {quoteMetadata.validUntil && (
                      <span>{t("quoteReview.validUntil", "Giltig t.o.m.")}: {quoteMetadata.validUntil}</span>
                    )}
                    {quoteMetadata.paymentTerms && (
                      <span>{quoteMetadata.paymentTerms}</span>
                    )}
                  </div>
                </div>
              )}

              {/* Mode selector — drives what the import creates */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">
                    {t("quoteReview.modeTitle", "Importera som")}
                  </h4>
                  {quoteMetadata?.quoteSource && (
                    <Badge variant="secondary" className="text-[10px]">
                      {t("quoteReview.aiDetected", "AI-detekterat")}: {t(`quoteReview.source.${quoteMetadata.quoteSource}`, quoteMetadata.quoteSource)}
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {([
                    {
                      value: "purchase_order" as const,
                      icon: ShoppingCart,
                      title: t("quoteReview.modeA.title", "Inköpsorder"),
                      desc: t("quoteReview.modeA.desc", "1 order + radnivå-material. För byggvaror-offerter."),
                    },
                    {
                      value: "material_budget" as const,
                      icon: Layers,
                      title: t("quoteReview.modeB.title", "Samlad materialbudget"),
                      desc: t("quoteReview.modeB.desc", "1 task med budget — material konsumeras därifrån."),
                    },
                  ]).map((opt) => {
                    const Icon = opt.icon;
                    const active = mode === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setMode(opt.value)}
                        className={cn(
                          "flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left transition-colors",
                          active
                            ? "bg-primary/5 border-primary/40 ring-1 ring-primary/30"
                            : "bg-background hover:bg-accent/40 hover:border-border",
                        )}
                      >
                        <div className="flex items-center gap-1.5">
                          <Icon className="h-3.5 w-3.5" />
                          <span className="text-xs font-medium">{opt.title}</span>
                        </div>
                        <span className="text-[11px] text-muted-foreground leading-tight">
                          {opt.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Link-to-task picker — always shown for modes A and B */}
                <div className="flex items-center gap-2 pt-1">
                  <label className="text-xs text-muted-foreground whitespace-nowrap">
                    {t("quoteReview.linkToLabel", "Koppla till task")}:
                  </label>
                  <Select value={linkToTaskId} onValueChange={setLinkToTaskId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue
                        placeholder={
                          mode === "purchase_order"
                            ? t("quoteReview.linkToUnallocated", "Oallokerat (välj senare)")
                            : t("quoteReview.linkToNewBucket", "Skapa ny budget-task")
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        {mode === "purchase_order"
                          ? t("quoteReview.linkToUnallocated", "Oallokerat (välj senare)")
                          : t("quoteReview.linkToNewBucket", "Skapa ny budget-task")}
                      </SelectItem>
                      {existingTasks.map((task) => (
                        <SelectItem key={task.id} value={task.id}>
                          {task.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              {/* Summary */}
              {summary && (
                <div className="flex gap-2 items-start p-3 rounded-lg bg-muted/50">
                  <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground">{summary}</p>
                </div>
              )}

              {/* Rooms */}
              {rooms.length > 0 && (
                <>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-medium flex items-center gap-2">
                        <Home className="h-4 w-4" />
                        {t("aiDocumentImport.roomsFound", { count: rooms.length })}
                      </h4>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 text-xs"
                          onClick={() => setRooms((p) => p.map((r) => ({ ...r, selected: true })))}>
                          {t("aiDocumentImport.all")}
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs"
                          onClick={() => setRooms((p) => p.map((r) => ({ ...r, selected: false })))}>
                          {t("aiDocumentImport.none")}
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {rooms.map((room) => (
                        <div key={room.index}
                          className={`flex items-start gap-2 p-2 rounded-lg border transition-colors ${
                            room.selected ? "bg-primary/5 border-primary/20" : "bg-background"
                          }`}>
                          <Checkbox checked={room.selected} onCheckedChange={() => toggleRoom(room.index)} className="mt-0.5" />
                          <div className="flex-1 min-w-0">
                            {editingRoomIndex === room.index ? (
                              <div className="space-y-1.5">
                                <Input value={room.name} onChange={(e) => updateRoom(room.index, { name: e.target.value })} className="h-7 text-sm" />
                                <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => setEditingRoomIndex(null)}>
                                  {t("aiDocumentImport.done")}
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-medium truncate">{room.name}</span>
                                {room.estimatedAreaSqm && (
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{room.estimatedAreaSqm} m²</Badge>
                                )}
                                <ConfidenceIndicator confidence={room.confidence} />
                              </div>
                            )}
                          </div>
                          {editingRoomIndex !== room.index && (
                            <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setEditingRoomIndex(room.index)}>
                              <Edit2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  <Separator />
                </>
              )}

              {/* Line items extracted from the quote — these become materials,
                  either under 1 purchase_order (mode A) or 1 budget task (mode B). */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <ClipboardList className="h-4 w-4" />
                    {t("quoteReview.lineItemsFound", {
                      defaultValue: "Materialrader ({{count}})",
                      count: tasks.length,
                    })}
                  </h4>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-7 text-xs"
                      onClick={() => setTasks((p) => p.map((tk) => ({ ...tk, selected: true })))}>
                      {t("aiDocumentImport.all")}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs"
                      onClick={() => setTasks((p) => p.map((tk) => ({ ...tk, selected: false })))}>
                      {t("aiDocumentImport.none")}
                    </Button>
                  </div>
                </div>
                {tasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-3">
                    {t("aiDocumentImport.noTasksFound")}
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {tasks.map((task) => (
                      <div key={task.index}
                        className={`flex items-start gap-2 p-2 rounded-lg border transition-colors ${
                          task.selected ? "bg-primary/5 border-primary/20" : "bg-background"
                        }`}>
                        <Checkbox checked={task.selected} onCheckedChange={() => toggleTask(task.index)} className="mt-0.5" />
                        <div className="flex-1 min-w-0">
                          {editingTaskIndex === task.index ? (
                            <div className="space-y-1.5">
                              <Input value={task.title}
                                onChange={(e) => updateTask(task.index, { title: e.target.value })}
                                className="h-7 text-sm" />
                              <div className="grid grid-cols-2 gap-1.5">
                                <Select value={task.category}
                                  onValueChange={(v) => updateTask(task.index, { category: v as TaskCategory })}>
                                  <SelectTrigger className="h-7 text-sm"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {Object.entries(TASK_CATEGORY_LABELS).map(([value, label]) => (
                                      <SelectItem key={value} value={value}>{label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Input type="number" value={task.estimatedCost ?? ""}
                                  onChange={(e) => updateTask(task.index, {
                                    estimatedCost: e.target.value ? parseFloat(e.target.value) : null,
                                  })}
                                  placeholder={t("quoteReview.costPlaceholder", "Kostnad (kr)")}
                                  className="h-7 text-sm" />
                              </div>
                              <div className="grid grid-cols-2 gap-1.5">
                                <Input type="number" value={task.laborCost ?? ""}
                                  onChange={(e) => updateTask(task.index, {
                                    laborCost: e.target.value ? parseFloat(e.target.value) : null,
                                  })}
                                  placeholder={t("quoteReview.laborCost", "Arbetskostnad")}
                                  className="h-7 text-sm" />
                                <Input type="number" value={task.materialCost ?? ""}
                                  onChange={(e) => updateTask(task.index, {
                                    materialCost: e.target.value ? parseFloat(e.target.value) : null,
                                  })}
                                  placeholder={t("quoteReview.materialCost", "Materialkostnad")}
                                  className="h-7 text-sm" />
                              </div>
                              <Button size="sm" variant="outline" className="h-6 text-xs"
                                onClick={() => setEditingTaskIndex(null)}>
                                {t("aiDocumentImport.done")}
                              </Button>
                            </div>
                          ) : (
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-medium">{task.title}</span>
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                  {TASK_CATEGORY_LABELS[task.category as TaskCategory] || task.category}
                                </Badge>
                                {task.roomName && (
                                  <span className="text-xs text-muted-foreground">({task.roomName})</span>
                                )}
                                <ConfidenceIndicator confidence={task.confidence} />
                              </div>
                              {/* Pricing row */}
                              {(task.estimatedCost != null || task.laborCost != null || task.materialCost != null) && (
                                <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                                  {task.estimatedCost != null && (
                                    <span className="font-medium text-foreground">
                                      {formatCurrency(task.estimatedCost, "SEK")}
                                    </span>
                                  )}
                                  {task.laborCost != null && (
                                    <span>{t("quoteReview.labor", "Arbete")}: {formatCurrency(task.laborCost, "SEK")}</span>
                                  )}
                                  {task.materialCost != null && (
                                    <span>{t("quoteReview.material", "Material")}: {formatCurrency(task.materialCost, "SEK")}</span>
                                  )}
                                </div>
                              )}
                              {/* Date row */}
                              {(task.startDate || task.endDate) && (
                                <div className="flex gap-2 mt-0.5 text-xs text-muted-foreground">
                                  <Calendar className="h-3 w-3 mt-0.5" />
                                  {task.startDate && <span>{task.startDate}</span>}
                                  {task.startDate && task.endDate && <span>→</span>}
                                  {task.endDate && <span>{task.endDate}</span>}
                                </div>
                              )}
                              {/* Source text — exact line from original document for manual spot-check */}
                              {task.sourceText && (
                                <div className="mt-1 text-[10px] text-muted-foreground/70 italic truncate" title={task.sourceText}>
                                  „{task.sourceText}"
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        {editingTaskIndex !== task.index && (
                          <Button variant="ghost" size="sm" className="h-5 w-5 p-0"
                            onClick={() => setEditingTaskIndex(task.index)}>
                            <Edit2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Importing */}
        {step === "importing" && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-lg font-medium">
              {t("quoteReview.importing", "Importerar...")}
            </p>
          </div>
        )}

        {/* Footer */}
        {step === "review" && (
          <div className="flex items-center justify-between pt-4 border-t flex-shrink-0">
            <div className="text-sm text-muted-foreground">
              {selectedTaskCount} {t("quoteReview.linesSelected", "materialrader")}
              {selectedRoomCount > 0 && `, ${selectedRoomCount} ${t("quoteReview.roomsSelected", "rum")}`}
              {totalSelectedCost > 0 && (
                <span className="ml-2 font-medium text-foreground">
                  = {formatCurrency(totalSelectedCost, "SEK")}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { onOpenChange(false); resetState(); }}>
                {t("common.cancel", "Avbryt")}
              </Button>
              <Button onClick={handleImport} disabled={selectedTaskCount === 0 && selectedRoomCount === 0}>
                <Sparkles className="h-4 w-4 mr-2" />
                {t("quoteReview.importButton", "Importera till projekt")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

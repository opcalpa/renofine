/**
 * Planning Smart Import Dialog
 * Upload a document → AI extracts rooms + tasks → review → import into existing project.
 * Reuses the process-document edge function and the same review UI pattern
 * as AIProjectImportModal, but targets an existing project in planning phase.
 */

import { useState, useCallback, useEffect, useRef } from "react";
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
import { Label } from "@/components/ui/label";
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
import { Switch } from "@/components/ui/switch";
import {
  Sparkles,
  Loader2,
  Home,
  ClipboardList,
  CheckCircle2,
  Edit2,
  Upload,
  FileText,
  ZoomIn,
  ZoomOut,
  ChevronUp,
  ChevronDown,
  Package,
  Shield,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  ExtractedRoom,
  ExtractedTask,
  AIDocumentExtractionResult,
  QuoteMetadata,
  TaskCategory,
  TASK_CATEGORY_LABELS,
  TASK_CATEGORY_TO_COST_CENTER,
} from "@/services/aiDocumentService.types";

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
  /** Material budget lines matched to this work task */
  materialChildren: ExtractedTask[];
}

/** Standalone material items that couldn't be matched to a parent task */
interface StandaloneMaterial extends ExtractedTask {
  index: number;
  selected: boolean;
}

interface PlanningSmartImportDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete?: () => void;
  /** Prefilled handoff (e.g. Renaida document capture): analyzed on open, skipping the upload step. */
  initialFile?: File | null;
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

// ---------------------------------------------------------------------------
// Price helpers
// ---------------------------------------------------------------------------

const VAT_RATE = 0.25;

/** Convert a cost to the display mode (inc/ex VAT) */
function convertVat(amount: number, sourceIsIncVat: boolean, displayIncVat: boolean): number {
  if (sourceIsIncVat === displayIncVat) return amount;
  if (sourceIsIncVat && !displayIncVat) return amount / (1 + VAT_RATE);
  return amount * (1 + VAT_RATE);
}

/** Format cost for display using the current VAT toggle */
function formatCostNum(amount: number, sourceIsIncVat: boolean, displayIncVat: boolean): number {
  return Math.round(convertVat(amount, sourceIsIncVat, displayIncVat));
}

// ---------------------------------------------------------------------------
// CostBreakdown — summary at the bottom of the task list
// ---------------------------------------------------------------------------

function CostBreakdown({
  tasks,
  standaloneMaterials,
  showIncVat,
  quoteMetadata,
  t,
}: {
  tasks: EditableTask[];
  standaloneMaterials: StandaloneMaterial[];
  showIncVat: boolean;
  quoteMetadata: QuoteMetadata | null;
  t: (key: string, fallback?: string) => string;
}) {
  const selected = tasks.filter((t) => t.selected);

  // Labor total (ex VAT)
  let laborExVat = 0;
  let materialExVat = 0;
  let totalRotAmount = 0;

  for (const task of selected) {
    const cost = task.estimatedCost || 0;
    const exVat = task.isIncludingVat ? cost / (1 + VAT_RATE) : cost;

    // If labor/material split available, use it
    if (task.laborCost != null || task.materialCost != null) {
      const labor = task.laborCost || 0;
      const mat = task.materialCost || 0;
      laborExVat += task.isIncludingVat ? labor / (1 + VAT_RATE) : labor;
      materialExVat += task.isIncludingVat ? mat / (1 + VAT_RATE) : mat;
    } else {
      // All goes to labor if no split
      laborExVat += exVat;
    }

    // Material children
    for (const child of task.materialChildren) {
      const childCost = child.estimatedCost || 0;
      materialExVat += child.isIncludingVat ? childCost / (1 + VAT_RATE) : childCost;
    }

    if (task.rotAmount) totalRotAmount += task.rotAmount;
  }

  // Standalone materials
  for (const mat of standaloneMaterials.filter((m) => m.selected)) {
    const cost = mat.estimatedCost || 0;
    materialExVat += mat.isIncludingVat ? cost / (1 + VAT_RATE) : cost;
  }

  const totalExVat = laborExVat + materialExVat;
  const vatAmount = totalExVat * VAT_RATE;
  const totalIncVat = totalExVat + vatAmount;
  const toPay = totalIncVat - totalRotAmount;

  if (totalExVat === 0) return null;

  const fmt = (n: number) => Math.round(n).toLocaleString("sv-SE");

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-1 text-sm">
      <div className="flex justify-between">
        <span className="text-muted-foreground">{t("quoteImport.laborTotal", "Arbete")}</span>
        <span className="tabular-nums">{fmt(showIncVat ? laborExVat * (1 + VAT_RATE) : laborExVat)} kr</span>
      </div>
      {materialExVat > 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("quoteImport.materialTotal", "Material")}</span>
          <span className="tabular-nums">{fmt(showIncVat ? materialExVat * (1 + VAT_RATE) : materialExVat)} kr</span>
        </div>
      )}
      <Separator className="!my-1.5" />
      <div className="flex justify-between">
        <span className="text-muted-foreground">{t("quoteImport.totalExVat", "Summa ex. moms")}</span>
        <span className="tabular-nums">{fmt(totalExVat)} kr</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">{t("quoteImport.vat", "Moms 25%")}</span>
        <span className="tabular-nums">{fmt(vatAmount)} kr</span>
      </div>
      <div className="flex justify-between font-medium">
        <span>{t("quoteImport.totalIncVat", "Summa ink. moms")}</span>
        <span className="tabular-nums">{fmt(totalIncVat)} kr</span>
      </div>
      {totalRotAmount > 0 && (
        <>
          <div className="flex justify-between text-green-700">
            <span>{t("quoteImport.rotDeduction", "ROT-avdrag")}</span>
            <span className="tabular-nums">-{fmt(totalRotAmount)} kr</span>
          </div>
          <div className="flex justify-between font-bold text-base">
            <span>{t("quoteImport.toPay", "Att betala")}</span>
            <span className="tabular-nums">{fmt(toPay)} kr</span>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PlanningSmartImportDialog({
  projectId,
  open,
  onOpenChange,
  onImportComplete,
  initialFile,
}: PlanningSmartImportDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [step, setStep] = useState<"upload" | "review" | "importing">("upload");
  const [extracting, setExtracting] = useState(false);
  const [rooms, setRooms] = useState<EditableRoom[]>([]);
  const [tasks, setTasks] = useState<EditableTask[]>([]);
  const [summary, setSummary] = useState("");
  const [editingRoomIndex, setEditingRoomIndex] = useState<number | null>(null);
  const [editingTaskIndex, setEditingTaskIndex] = useState<number | null>(null);
  const [uploadedFile, setUploadedFile] = useState<{
    tempPath: string;
    name: string;
    file: File;
  } | null>(null);
  const [previewExpanded, setPreviewExpanded] = useState(true);
  const [previewZoom, setPreviewZoom] = useState(100);
  /** Track which material is being edited: "taskIdx-matIdx" or "standalone-idx" */
  const [editingMaterialKey, setEditingMaterialKey] = useState<string | null>(null);
  const [quoteMetadata, setQuoteMetadata] = useState<QuoteMetadata | null>(null);
  const [showIncVat, setShowIncVat] = useState(true);
  const [standaloneMaterials, setStandaloneMaterials] = useState<StandaloneMaterial[]>([]);

  const resetState = useCallback(() => {
    setStep("upload");
    setExtracting(false);
    setRooms([]);
    setTasks([]);
    setSummary("");
    setEditingRoomIndex(null);
    setEditingTaskIndex(null);
    setUploadedFile(null);
    setQuoteMetadata(null);
    setShowIncVat(true);
    setStandaloneMaterials([]);
    setEditingMaterialKey(null);
  }, []);

  // ---- File intake + AI extraction — shared by the picker and prefilled handoffs ----
  const processFile = useCallback(async (file: File) => {
    const ext = file.name.toLowerCase().split(".").pop();
    if (!["pdf", "txt", "docx", "doc"].includes(ext || "")) {
      toast({
        title: t("errors.generic"),
        description: t("aiProjectImport.unsupportedFormat"),
        variant: "destructive",
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: t("errors.generic"),
        description: t("aiProjectImport.fileTooLarge"),
        variant: "destructive",
      });
      return;
    }

    setExtracting(true);

    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const tempPath = `projects/${projectId}/${Date.now()}-${safeName}`;
      const { error: uploadErr } = await supabase.storage
        .from("project-files")
        .upload(tempPath, file);

      if (uploadErr) throw new Error(uploadErr.message);

      const { data: urlData } = supabase.storage
        .from("project-files")
        .getPublicUrl(tempPath);

      const { data, error } = await supabase.functions.invoke(
        "process-document",
        {
          body: {
            fileUrl: urlData.publicUrl,
            fileType: file.type,
            fileName: file.name,
            mode: "quote",
          },
        }
      );

      if (error) {
        supabase.storage.from("project-files").remove([tempPath]);
        throw new Error(error.message);
      }

      setUploadedFile({ tempPath, name: file.name, file });

      const result = data as AIDocumentExtractionResult;
      result.rooms = result.rooms || [];
      result.tasks = result.tasks || [];
      result.documentSummary = result.documentSummary || "";

      setSummary(result.documentSummary);
      setQuoteMetadata(result.quoteMetadata || null);

      // Set VAT display default from quote metadata
      if (result.quoteMetadata?.isIncludingVat !== undefined) {
        setShowIncVat(result.quoteMetadata.isIncludingVat);
      }

      setRooms(
        result.rooms.map((room, index) => ({
          ...room,
          index,
          selected: room.confidence >= 0.5,
        }))
      );

      // Split work tasks from material budget lines
      const workItems: ExtractedTask[] = [];
      const materialItems: ExtractedTask[] = [];
      for (const task of result.tasks) {
        if (task.isMaterialBudget) {
          materialItems.push(task);
        } else {
          workItems.push(task);
        }
      }

      // Match material items to their parent work tasks
      const unmatchedMaterials: ExtractedTask[] = [];
      const materialByParent = new Map<number, ExtractedTask[]>();

      for (const mat of materialItems) {
        if (mat.parentTaskName) {
          const parentIdx = workItems.findIndex(
            (w) => w.title.toLowerCase() === mat.parentTaskName!.toLowerCase()
          );
          if (parentIdx >= 0) {
            const existing = materialByParent.get(parentIdx) || [];
            existing.push(mat);
            materialByParent.set(parentIdx, existing);
            continue;
          }
        }
        unmatchedMaterials.push(mat);
      }

      setTasks(
        workItems.map((task, index) => ({
          ...task,
          index,
          selected: task.confidence >= 0.5,
          materialChildren: materialByParent.get(index) || [],
        }))
      );

      setStandaloneMaterials(
        unmatchedMaterials.map((mat, index) => ({
          ...mat,
          index,
          selected: mat.confidence >= 0.5,
        }))
      );

      setStep("review");

      toast({
        title: t("aiDocumentImport.analysisDone"),
        description: t("aiDocumentImport.analysisResult", {
          rooms: result.rooms.length,
          tasks: workItems.length,
        }),
      });
    } catch (err) {
      console.error("AI extraction error:", err);
      toast({
        title: t("aiDocumentImport.analysisError"),
        description:
          err instanceof Error
            ? err.message
            : t("aiDocumentImport.couldNotAnalyze"),
        variant: "destructive",
      });
    } finally {
      setExtracting(false);
    }
  }, [projectId, t, toast]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void processFile(file);
  };

  // Prefilled handoff (Renaida D2): analyze the handed-over file as soon as we open.
  const handledInitialFileRef = useRef<File | null>(null);
  useEffect(() => {
    if (!open || !initialFile) return;
    if (handledInitialFileRef.current === initialFile) return;
    handledInitialFileRef.current = initialFile;
    void processFile(initialFile);
  }, [open, initialFile, processFile]);

  // ---- Import into existing project ----
  const handleImport = async () => {
    const selectedRooms = rooms.filter((r) => r.selected);
    const selectedTasks = tasks.filter((t) => t.selected);

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
      const {
        data: { user },
        error: authErr,
      } = await supabase.auth.getUser();
      if (authErr || !user) throw new Error("Inte inloggad");

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!profile) throw new Error("Profil hittades inte");

      // File already uploaded to projects/{projectId}/ — no move needed

      const createdRoomIds = new Map<string, string>();

      // Create rooms
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

      // Create tasks linked to rooms + material budgets
      let createdTaskCount = 0;
      let createdMaterialCount = 0;

      for (const task of selectedTasks) {
        let roomId: string | null = null;
        if (task.roomName) {
          roomId =
            createdRoomIds.get(task.roomName.toLowerCase()) || null;
        }

        const costCenter =
          TASK_CATEGORY_TO_COST_CENTER[task.category as TaskCategory] ||
          "construction";

        // Calculate material estimate from children
        const materialEstimate = task.materialChildren.reduce(
          (sum, child) => sum + (child.estimatedCost || 0),
          0
        ) || task.materialCost || null;

        // Store costs ex VAT in database
        const estimatedCost = task.estimatedCost != null
          ? Math.round(task.isIncludingVat ? task.estimatedCost / (1 + VAT_RATE) : task.estimatedCost)
          : null;

        const materialEstimateExVat = materialEstimate != null
          ? Math.round(task.isIncludingVat ? materialEstimate / (1 + VAT_RATE) : materialEstimate)
          : null;

        const { data: taskData, error: taskErr } = await supabase.from("tasks").insert({
          project_id: projectId,
          room_id: roomId,
          title: task.title,
          description: task.description,
          status: "to_do",
          priority: "medium",
          created_by_user_id: profile.id,
          cost_center: costCenter,
          task_cost_type: "subcontractor",
          subcontractor_cost: estimatedCost,
          material_estimate: materialEstimateExVat,
          budget: estimatedCost != null || materialEstimateExVat != null
            ? (estimatedCost || 0) + (materialEstimateExVat || 0)
            : null,
          rot_eligible: task.rotEligible || false,
          rot_amount: task.rotAmount || null,
        }).select("id").single();

        if (taskErr) {
          console.error("Error creating task:", taskErr);
          continue;
        }

        createdTaskCount++;

        // Create planned material budget items for material children
        for (const child of task.materialChildren) {
          const matCostExVat = child.estimatedCost != null
            ? Math.round(child.isIncludingVat ? child.estimatedCost / (1 + VAT_RATE) : child.estimatedCost)
            : null;

          const { error: matErr } = await supabase.from("materials").insert({
            project_id: projectId,
            task_id: taskData.id,
            room_id: roomId,
            name: child.title,
            description: child.description,
            price_total: matCostExVat,
            status: "planned",
            created_by_user_id: profile.id,
          });

          if (matErr) {
            console.error("Error creating planned material:", matErr);
          } else {
            createdMaterialCount++;
          }
        }
      }

      // Create standalone materials (unmatched)
      const selectedStandalone = standaloneMaterials.filter((m) => m.selected);
      for (const mat of selectedStandalone) {
        const matCostExVat = mat.estimatedCost != null
          ? Math.round(mat.isIncludingVat ? mat.estimatedCost / (1 + VAT_RATE) : mat.estimatedCost)
          : null;

        const { error: matErr } = await supabase.from("materials").insert({
          project_id: projectId,
          task_id: null,
          name: mat.title,
          description: mat.description,
          price_total: matCostExVat,
          status: "planned",
          created_by_user_id: profile.id,
        });

        if (matErr) {
          console.error("Error creating standalone material:", matErr);
        } else {
          createdMaterialCount++;
        }
      }

      // Link uploaded document to all created tasks
      if (uploadedFile) {
        const { data: newTasks } = await supabase
          .from("tasks")
          .select("id")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false })
          .limit(createdTaskCount);

        if (newTasks && newTasks.length > 0) {
          const fileType = uploadedFile.file.type?.includes("pdf") ? "quote" : "document";
          const links = newTasks.map((t) => ({
            project_id: projectId,
            task_id: t.id,
            file_path: uploadedFile.tempPath,
            file_name: uploadedFile.name,
            file_type: fileType,
            vendor_name: quoteMetadata?.vendorName || null,
            invoice_amount: quoteMetadata?.totalAmount || null,
            invoice_date: quoteMetadata?.quoteDate || null,
          }));
          await supabase.from("task_file_links").insert(links);
        }
      }

      // Update project total_budget from quote metadata
      if (quoteMetadata?.totalAmount) {
        const budgetExVat = quoteMetadata.isIncludingVat
          ? Math.round(quoteMetadata.totalAmount / (1 + VAT_RATE))
          : quoteMetadata.totalAmount;
        await supabase
          .from("projects")
          .update({ total_budget: budgetExVat })
          .eq("id", projectId);
      }

      toast({
        title: t("aiDocumentImport.importDone"),
        description: t("quoteImport.importResult", {
          defaultValue: "{{tasks}} arbeten och {{materials}} materialbudgetar importerade",
          tasks: createdTaskCount,
          materials: createdMaterialCount,
        }),
      });

      onOpenChange(false);
      resetState();
      onImportComplete?.();
    } catch (err) {
      console.error("Import error:", err);
      toast({
        title: t("aiDocumentImport.importError"),
        description:
          err instanceof Error
            ? err.message
            : t("aiDocumentImport.couldNotImport"),
        variant: "destructive",
      });
      setStep("review");
    }
  };

  // ---- Selection helpers ----
  const toggleRoomSelection = (index: number) => {
    setRooms((prev) =>
      prev.map((r) => (r.index === index ? { ...r, selected: !r.selected } : r))
    );
  };

  const toggleTaskSelection = (index: number) => {
    setTasks((prev) =>
      prev.map((t) => (t.index === index ? { ...t, selected: !t.selected } : t))
    );
  };

  const updateRoom = (index: number, updates: Partial<ExtractedRoom>) => {
    setRooms((prev) =>
      prev.map((r) => (r.index === index ? { ...r, ...updates } : r))
    );
  };

  const updateTask = (index: number, updates: Partial<ExtractedTask>) => {
    setTasks((prev) =>
      prev.map((t) => (t.index === index ? { ...t, ...updates } : t))
    );
  };

  /** Update a material child's cost within a parent task */
  const updateMaterialChild = (taskIndex: number, matIndex: number, cost: number | null) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.index !== taskIndex) return t;
        const updated = [...t.materialChildren];
        updated[matIndex] = { ...updated[matIndex], estimatedCost: cost };
        return { ...t, materialChildren: updated };
      })
    );
  };

  /** Update a standalone material's cost */
  const updateStandaloneMaterial = (matIndex: number, cost: number | null) => {
    setStandaloneMaterials((prev) =>
      prev.map((m) =>
        m.index === matIndex ? { ...m, estimatedCost: cost } : m
      )
    );
  };

  const selectedRoomCount = rooms.filter((r) => r.selected).length;
  const selectedTaskCount = tasks.filter((t) => t.selected).length;

  /** Format a cost for display respecting the VAT toggle */
  const formatCost = (amount: number, sourceIsIncVat: boolean) =>
    formatCostNum(amount, sourceIsIncVat, showIncVat).toLocaleString("sv-SE");

  // Block closing while extracting or importing
  const isBusy = extracting || step === "importing";

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && isBusy) return; // Don't close during active work
        if (!o && uploadedFile) {
          supabase.storage
            .from("project-files")
            .remove([uploadedFile.tempPath]);
        }
        onOpenChange(o);
        if (!o) resetState();
      }}
    >
      <DialogContent
        className="!max-w-6xl w-[calc(100%-2rem)] max-h-[90vh] flex flex-col overflow-hidden"
        onPointerDownOutside={(e) => { if (isBusy) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (isBusy) e.preventDefault(); }}
      >
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {t("planningSmartImport.title", "Smart Import")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "planningSmartImport.description",
              "Upload a document and AI will extract rooms and tasks into your planning table."
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Upload step */}
        {step === "upload" && !extracting && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="rounded-full bg-primary/10 p-4">
              <Upload className="h-8 w-8 text-primary" />
            </div>
            <div className="text-center space-y-1">
              <p className="font-medium">
                {t("aiProjectImport.uploadTitle")}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("aiProjectImport.uploadDescription")}
              </p>
            </div>
            <Label htmlFor="planning-smart-import-file" className="cursor-pointer">
              <Button asChild variant="outline" className="min-h-[48px]">
                <span>
                  <FileText className="h-4 w-4 mr-2" />
                  {t("aiProjectImport.chooseFile")}
                </span>
              </Button>
            </Label>
            <input
              id="planning-smart-import-file"
              type="file"
              accept=".pdf,.txt,.docx,.doc"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        )}

        {/* Extracting spinner */}
        {extracting && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-lg font-medium">
              {t("aiDocumentImport.analyzing")}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              {t("aiDocumentImport.analyzingTime")}
            </p>
          </div>
        )}

        {/* Review step — split layout: preview left, results right */}
        {step === "review" && (
          <div className="flex-1 min-h-0 flex gap-4 overflow-hidden">
            {/* Document preview panel */}
            {uploadedFile && previewExpanded && (
              <div className="w-[45%] flex flex-col min-h-0 shrink-0">
                <div className="flex items-center gap-2 mb-2">
                  <button type="button" onClick={() => setPreviewExpanded(false)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                    <ChevronDown className="h-3 w-3" />
                    {t("aiDocumentImport.documentPreview", "Dokumentförhandsvisning")}
                  </button>
                  <span className="flex items-center gap-1 ml-auto">
                    <button type="button" onClick={() => setPreviewZoom(z => Math.max(50, z - 25))} className="p-0.5 hover:bg-muted rounded"><ZoomOut className="h-3 w-3" /></button>
                    <span className="text-xs tabular-nums min-w-[32px] text-center">{previewZoom}%</span>
                    <button type="button" onClick={() => setPreviewZoom(z => Math.min(200, z + 25))} className="p-0.5 hover:bg-muted rounded"><ZoomIn className="h-3 w-3" /></button>
                  </span>
                </div>
                <div className="flex-1 border rounded-lg bg-muted/30 overflow-auto">
                  {uploadedFile.file.type?.includes('pdf') ? (
                    <iframe
                      src={`${supabase.storage.from('project-files').getPublicUrl(uploadedFile.tempPath).data.publicUrl}#navpanes=0&scrollbar=1&view=FitH`}
                      title={uploadedFile.name}
                      className="w-full h-full border-0"
                      style={{ minHeight: '400px', transform: `scale(${previewZoom / 100})`, transformOrigin: 'top left', width: `${100 / (previewZoom / 100)}%` }}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground py-12">
                      <FileText className="h-10 w-10 mr-2" />
                      <span className="text-sm">{uploadedFile.name}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            {!previewExpanded && uploadedFile && (
              <button type="button" onClick={() => setPreviewExpanded(true)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 self-start mt-1">
                <ChevronUp className="h-3 w-3" />
                {t("aiDocumentImport.documentPreview", "Visa dokument")}
              </button>
            )}

            {/* Results panel */}
            <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            <div className="space-y-4">
              {/* Summary */}
              {summary && (
                <div className="flex gap-2 items-start p-3 rounded-lg bg-muted/50">
                  <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground">{summary}</p>
                </div>
              )}

              {/* Rooms */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Home className="h-4 w-4" />
                    {t("aiDocumentImport.roomsFound", {
                      count: rooms.length,
                    })}
                  </h4>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() =>
                        setRooms((p) =>
                          p.map((r) => ({ ...r, selected: true }))
                        )
                      }
                    >
                      {t("aiDocumentImport.all")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() =>
                        setRooms((p) =>
                          p.map((r) => ({ ...r, selected: false }))
                        )
                      }
                    >
                      {t("aiDocumentImport.none")}
                    </Button>
                  </div>
                </div>
                {rooms.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-3">
                    {t("aiDocumentImport.noRoomsFound")}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {rooms.map((room) => (
                      <div
                        key={room.index}
                        className={`flex items-start gap-2 p-2 rounded-lg border transition-colors ${
                          room.selected
                            ? "bg-primary/5 border-primary/20"
                            : "bg-background"
                        }`}
                      >
                        <Checkbox
                          checked={room.selected}
                          onCheckedChange={() =>
                            toggleRoomSelection(room.index)
                          }
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          {editingRoomIndex === room.index ? (
                            <div className="space-y-1.5">
                              <Input
                                value={room.name}
                                onChange={(e) =>
                                  updateRoom(room.index, {
                                    name: e.target.value,
                                  })
                                }
                                className="h-7 text-sm"
                              />
                              <Input
                                type="number"
                                value={room.estimatedAreaSqm || ""}
                                onChange={(e) =>
                                  updateRoom(room.index, {
                                    estimatedAreaSqm: e.target.value
                                      ? parseFloat(e.target.value)
                                      : null,
                                  })
                                }
                                placeholder={t(
                                  "aiDocumentImport.areaPlaceholder"
                                )}
                                className="h-7 text-sm"
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-xs"
                                onClick={() => setEditingRoomIndex(null)}
                              >
                                {t("aiDocumentImport.done")}
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-medium truncate">
                                {room.name}
                              </span>
                              {room.estimatedAreaSqm && (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] px-1.5 py-0"
                                >
                                  {room.estimatedAreaSqm} m²
                                </Badge>
                              )}
                              <ConfidenceIndicator
                                confidence={room.confidence}
                              />
                            </div>
                          )}
                        </div>
                        {editingRoomIndex !== room.index && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0"
                            onClick={() => setEditingRoomIndex(room.index)}
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              {/* Tasks + Prices */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <ClipboardList className="h-4 w-4" />
                    {t("aiDocumentImport.tasksFound", {
                      count: tasks.length,
                    })}
                  </h4>
                  <div className="flex items-center gap-2">
                    {/* VAT toggle */}
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span>{t("quoteImport.exVat", "Ex. moms")}</span>
                      <Switch
                        checked={showIncVat}
                        onCheckedChange={setShowIncVat}
                        className="h-4 w-7 data-[state=checked]:bg-primary"
                      />
                      <span>{t("quoteImport.incVat", "Ink. moms")}</span>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() =>
                          setTasks((p) =>
                            p.map((t) => ({ ...t, selected: true }))
                          )
                        }
                      >
                        {t("aiDocumentImport.all")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() =>
                          setTasks((p) =>
                            p.map((t) => ({ ...t, selected: false }))
                          )
                        }
                      >
                        {t("aiDocumentImport.none")}
                      </Button>
                    </div>
                  </div>
                </div>
                {tasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-3">
                    {t("aiDocumentImport.noTasksFound")}
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {tasks.map((task) => (
                      <div key={task.index}>
                        <div
                          className={`flex items-start gap-2 p-2 rounded-lg border transition-colors ${
                            task.selected
                              ? "bg-primary/5 border-primary/20"
                              : "bg-background"
                          }`}
                        >
                          <Checkbox
                            checked={task.selected}
                            onCheckedChange={() =>
                              toggleTaskSelection(task.index)
                            }
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            {editingTaskIndex === task.index ? (
                              <div className="space-y-1.5">
                                <Input
                                  value={task.title}
                                  onChange={(e) =>
                                    updateTask(task.index, {
                                      title: e.target.value,
                                    })
                                  }
                                  className="h-7 text-sm"
                                />
                                <div className="flex gap-2">
                                  <Select
                                    value={task.category}
                                    onValueChange={(v) =>
                                      updateTask(task.index, {
                                        category: v as TaskCategory,
                                      })
                                    }
                                  >
                                    <SelectTrigger className="h-7 text-sm flex-1">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {Object.entries(TASK_CATEGORY_LABELS).map(
                                        ([value, label]) => (
                                          <SelectItem key={value} value={value}>
                                            {label}
                                          </SelectItem>
                                        )
                                      )}
                                    </SelectContent>
                                  </Select>
                                  <Input
                                    type="number"
                                    value={task.estimatedCost || ""}
                                    onChange={(e) =>
                                      updateTask(task.index, {
                                        estimatedCost: e.target.value
                                          ? parseFloat(e.target.value)
                                          : null,
                                      })
                                    }
                                    placeholder={t("quoteImport.costPlaceholder", "Kostnad (SEK)")}
                                    className="h-7 text-sm w-32"
                                  />
                                </div>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 text-xs"
                                  onClick={() => setEditingTaskIndex(null)}
                                >
                                  {t("aiDocumentImport.done")}
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-medium">
                                  {task.title}
                                </span>
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1.5 py-0"
                                >
                                  {TASK_CATEGORY_LABELS[
                                    task.category as TaskCategory
                                  ] || task.category}
                                </Badge>
                                {task.roomName && (
                                  <span className="text-xs text-muted-foreground">
                                    ({task.roomName})
                                  </span>
                                )}
                                {task.rotEligible && (
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700">
                                    <Shield className="h-2.5 w-2.5 mr-0.5" />
                                    ROT
                                  </Badge>
                                )}
                                <ConfidenceIndicator
                                  confidence={task.confidence}
                                />
                                {/* Price on the right */}
                                {task.estimatedCost != null && (
                                  <span className="ml-auto text-sm font-medium tabular-nums">
                                    {formatCost(task.estimatedCost, task.isIncludingVat)} kr
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          {editingTaskIndex !== task.index && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 w-5 p-0"
                              onClick={() => setEditingTaskIndex(task.index)}
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                        {/* Material children nested under work task */}
                        {task.materialChildren.length > 0 && (
                          <div className="ml-8 mt-0.5 space-y-0.5">
                            {task.materialChildren.map((mat, mi) => {
                              const matKey = `${task.index}-${mi}`;
                              const isEditing = editingMaterialKey === matKey;
                              return (
                                <div
                                  key={`mat-${matKey}`}
                                  className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground rounded bg-amber-50 border border-amber-100"
                                >
                                  <Package className="h-3 w-3 text-amber-600 shrink-0" />
                                  <span className="truncate">{mat.title}</span>
                                  {isEditing ? (
                                    <div className="ml-auto flex items-center gap-1">
                                      <span className="text-amber-700">+</span>
                                      <Input
                                        type="number"
                                        autoFocus
                                        defaultValue={mat.estimatedCost ?? ""}
                                        className="h-6 w-24 text-xs text-right tabular-nums"
                                        onBlur={(e) => {
                                          const val = e.target.value ? parseFloat(e.target.value) : null;
                                          updateMaterialChild(task.index, mi, val);
                                          setEditingMaterialKey(null);
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            const val = (e.target as HTMLInputElement).value
                                              ? parseFloat((e.target as HTMLInputElement).value)
                                              : null;
                                            updateMaterialChild(task.index, mi, val);
                                            setEditingMaterialKey(null);
                                          }
                                        }}
                                      />
                                      <span className="text-amber-700">kr</span>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      className="ml-auto font-medium tabular-nums text-amber-700 hover:underline hover:text-amber-900 cursor-pointer"
                                      onClick={() => setEditingMaterialKey(matKey)}
                                      title={t("common.edit", "Redigera")}
                                    >
                                      +{mat.estimatedCost != null ? formatCost(mat.estimatedCost, mat.isIncludingVat) : "0"} kr
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {/* ROT deduction line */}
                        {task.rotAmount != null && task.rotAmount > 0 && (
                          <div className="ml-8 mt-0.5 flex items-center gap-2 px-2 py-1 text-xs text-green-700 rounded bg-green-50 border border-green-100">
                            <Shield className="h-3 w-3 shrink-0" />
                            <span>{t("quoteImport.rotDeduction", "ROT-avdrag")}</span>
                            <span className="ml-auto font-medium tabular-nums">
                              -{task.rotAmount.toLocaleString("sv-SE")} kr
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Standalone materials (unmatched) */}
                {standaloneMaterials.length > 0 && (
                  <div className="mt-3">
                    <h5 className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
                      <Package className="h-3.5 w-3.5" />
                      {t("quoteImport.standaloneMaterials", "Fristående materialposter")}
                    </h5>
                    <div className="space-y-1">
                      {standaloneMaterials.map((mat) => {
                        const sKey = `standalone-${mat.index}`;
                        const isEditing = editingMaterialKey === sKey;
                        return (
                          <div
                            key={sKey}
                            className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${
                              mat.selected
                                ? "bg-amber-50 border-amber-200"
                                : "bg-background"
                            }`}
                          >
                            <Checkbox
                              checked={mat.selected}
                              onCheckedChange={() =>
                                setStandaloneMaterials((p) =>
                                  p.map((m) =>
                                    m.index === mat.index
                                      ? { ...m, selected: !m.selected }
                                      : m
                                  )
                                )
                              }
                              className="mt-0"
                            />
                            <Package className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                            <span className="text-sm truncate">{mat.title}</span>
                            {isEditing ? (
                              <div className="ml-auto flex items-center gap-1">
                                <Input
                                  type="number"
                                  autoFocus
                                  defaultValue={mat.estimatedCost ?? ""}
                                  className="h-6 w-24 text-xs text-right tabular-nums"
                                  onBlur={(e) => {
                                    const val = e.target.value ? parseFloat(e.target.value) : null;
                                    updateStandaloneMaterial(mat.index, val);
                                    setEditingMaterialKey(null);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      const val = (e.target as HTMLInputElement).value
                                        ? parseFloat((e.target as HTMLInputElement).value)
                                        : null;
                                      updateStandaloneMaterial(mat.index, val);
                                      setEditingMaterialKey(null);
                                    }
                                  }}
                                />
                                <span className="text-sm">kr</span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="ml-auto text-sm font-medium tabular-nums hover:underline cursor-pointer"
                                onClick={() => setEditingMaterialKey(sKey)}
                                title={t("common.edit", "Redigera")}
                              >
                                {mat.estimatedCost != null ? formatCost(mat.estimatedCost, mat.isIncludingVat) : "0"} kr
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Cost breakdown */}
              <CostBreakdown
                tasks={tasks}
                standaloneMaterials={standaloneMaterials}
                showIncVat={showIncVat}
                quoteMetadata={quoteMetadata}
                t={t}
              />

              {/* Legend */}
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>{t("aiDocumentImport.highConfidence")}</span>
                <span>{t("aiDocumentImport.mediumConfidence")}</span>
                <span>{t("aiDocumentImport.lowConfidence")}</span>
              </div>
            </div>
          </div>
          </div>
        )}

        {/* Importing spinner */}
        {step === "importing" && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-lg font-medium">
              {t("aiDocumentImport.importing")}
            </p>
          </div>
        )}

        {/* Footer */}
        {step === "review" && (
          <>
            <Separator className="my-4" />
            <div className="flex items-center justify-between flex-shrink-0">
              <div className="text-sm text-muted-foreground">
                {selectedRoomCount > 0 || selectedTaskCount > 0
                  ? t("aiDocumentImport.selected", {
                      rooms: selectedRoomCount,
                      tasks: selectedTaskCount,
                    })
                  : t("aiDocumentImport.selectPrompt")}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    onOpenChange(false);
                    resetState();
                  }}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={
                    selectedRoomCount === 0 && selectedTaskCount === 0
                  }
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  {t("aiDocumentImport.importButton", {
                    rooms: selectedRoomCount,
                    tasks: selectedTaskCount,
                  })}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

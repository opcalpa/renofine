import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import heic2any from "heic2any";
import { analytics, AnalyticsEvents } from "@/lib/analytics";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import {
  Camera,
  Upload,
  Loader2,
  Sparkles,
  X,
  AlertCircle,
  Receipt,
  FileText,
  Link2,
  ShoppingCart,
  ClipboardList,
  PenLine,
} from "lucide-react";
import {
  analyzeDocument,
  generateDocumentFilename,
  type DocumentAnalysisResult,
} from "@/services/receiptAnalysisService";
import { DatePicker } from "@/components/ui/date-picker";
import { formatLocalDate } from "@/lib/dateUtils";
import {
  SearchableEntityPicker,
  type SelectedEntity,
} from "@/components/shared/SearchableEntityPicker";

interface QuickReceiptCaptureModalProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  currency?: string | null;
  /** Called when user uploads a PDF in the scan flow — PDFs go through process-document
   * (quote import), not process-receipt. Parent should open QuoteReviewDialog with the file. */
  onSwitchToQuoteImport?: (file: File) => void;
}

// Check if file is a supported receipt file (images + PDF)
const isSupportedFile = (file: File): boolean => {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();

  // Images
  if (type.startsWith("image/")) return true;
  // HEIC/HEIF (MIME type may be empty or wrong)
  if (name.endsWith(".heic") || name.endsWith(".heif")) return true;
  // PDF
  if (type === "application/pdf" || name.endsWith(".pdf")) return true;

  return false;
};

const isPdfFile = (file: File): boolean => {
  return file.type.toLowerCase() === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
};

// Check if file is HEIC/HEIF format
const isHeicFile = (file: File): boolean => {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return (
    type === "image/heic" ||
    type === "image/heif" ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
};

// Convert HEIC to JPEG
const convertHeicToJpeg = async (file: File): Promise<File> => {
  try {
    const blob = await heic2any({
      blob: file,
      toType: "image/jpeg",
      quality: 0.9,
    });

    // heic2any can return a single blob or array of blobs
    const resultBlob = Array.isArray(blob) ? blob[0] : blob;
    const newFileName = file.name.replace(/\.(heic|heif)$/i, ".jpg");

    return new File([resultBlob], newFileName, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch (error) {
    console.error("HEIC conversion failed:", error);
    throw new Error("Failed to convert HEIC image");
  }
};

// Image compression utility
const compressImage = (
  file: File,
  maxWidth = 1200,
  maxHeight = 1200,
  quality = 0.8
): Promise<File> => {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.onload = () => {
      let { width, height } = img;
      if (width > height) {
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
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
            resolve(
              new File(
                [blob],
                file.name.replace(/\.(heic|heif)$/i, ".jpg"),
                { type: "image/jpeg", lastModified: Date.now() }
              )
            );
          } else {
            resolve(file);
          }
        },
        "image/jpeg",
        quality
      );
    };

    // Handle image load errors (e.g., HEIC not supported)
    img.onerror = () => {
      // Return original file if we can't compress it
      resolve(file);
    };

    img.src = URL.createObjectURL(file);
  });
};

// Convert file to base64
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data:image/xxx;base64, prefix
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

type LinkOption = "new" | "link" | "applyBudget";

export function QuickReceiptCaptureModal({
  projectId,
  open,
  onOpenChange,
  onSuccess,
  currency,
  onSwitchToQuoteImport,
}: QuickReceiptCaptureModalProps) {
  const { t } = useTranslation();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Flow step: choose → scan (existing) or manual
  const [flowStep, setFlowStep] = useState<"choose" | "scan" | "manual">("choose");

  // Image state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Analysis state
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] =
    useState<DocumentAnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState(false);
  // Ref so the running handleAnalyze closure can detect mid-flight abort.
  // (state wouldn't work — the async function captures the old value.)
  const aiAbortedRef = useRef(false);

  // Form state
  const [vendorName, setVendorName] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [vatAmount, setVatAmount] = useState("");
  const [purchaseDate, setPurchaseDate] = useState<Date | undefined>(undefined);
  const [roomId, setRoomId] = useState<string>("none");

  // Invoice-specific fields
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [ocrNumber, setOcrNumber] = useState("");
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);

  // Linking state
  const [linkOption, setLinkOption] = useState<LinkOption>("new");
  const [linkedEntity, setLinkedEntity] = useState<SelectedEntity | null>(null);

  // Task picker state
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Array<{id: string; title: string; budget: number | null; material_estimate: number | null; plannedMaterials: Array<{id: string; name: string; amount: number}>; is_ata: boolean; materialSpent: number}>>([]);

  // Budget-post linking state
  const [sourceMaterialId, setSourceMaterialId] = useState<string | null>(null);
  const [allPlannedMaterials, setAllPlannedMaterials] = useState<Array<{id: string; name: string; amount: number; taskId: string | null; taskName: string | null}>>([]);
  const [paidBySourceId, setPaidBySourceId] = useState<Map<string, number>>(new Map());

  // Data state
  const [rooms, setRooms] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);

  // Derived state
  const documentType = analysisResult?.document_type || "receipt";

  // Fetch rooms when modal opens
  useEffect(() => {
    if (open) {
      fetchRooms();
    }
  }, [open, projectId]);

  // Reset form when modal closes
  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open]);

  const resetForm = () => {
    setFlowStep("choose");
    setSelectedFile(null);
    setPreviewUrl(null);
    setAnalyzing(false);
    setAnalysisResult(null);
    setAnalysisError(false);
    aiAbortedRef.current = false;
    setVendorName("");
    setTotalAmount("");
    setVatAmount("");
    setPurchaseDate(undefined);
    setRoomId("none");
    setInvoiceNumber("");
    setOcrNumber("");
    setDueDate(undefined);
    setLinkOption("new");
    setLinkedEntity(null);
    setSelectedTaskId(null);
    setSourceMaterialId(null);
  };

  const fetchRooms = async () => {
    const { data } = await supabase
      .from("rooms")
      .select("id, name")
      .eq("project_id", projectId)
      .order("name");
    setRooms(data || []);
  };

  // Fetch tasks + their linked material spend + all planned materials when modal opens
  useEffect(() => {
    if (!open || !projectId) return;
    const fetchTasks = async () => {
      const [tasksRes, materialsRes] = await Promise.all([
        supabase
          .from("tasks")
          .select("id, title, budget, material_estimate, is_ata")
          .eq("project_id", projectId)
          .order("created_at", { ascending: true }),
        supabase
          .from("materials")
          .select("id, name, task_id, price_total, status, quantity, price_per_unit, source_material_id, paid_amount")
          .eq("project_id", projectId)
          .eq("exclude_from_budget", false),
      ]);
      const taskMap = new Map<string, string>();
      (tasksRes.data || []).forEach(t => taskMap.set(t.id, t.title));

      const spendMap = new Map<string, number>();
      const plannedMap = new Map<string, Array<{id: string; name: string; amount: number}>>();
      const allPlanned: Array<{id: string; name: string; amount: number; taskId: string | null; taskName: string | null}> = [];
      const paidMap = new Map<string, number>();

      (materialsRes.data || []).forEach(m => {
        const cost = m.price_total ?? ((m.quantity || 0) * (m.price_per_unit || 0));
        if (m.status === "planned") {
          allPlanned.push({
            id: m.id,
            name: m.name,
            amount: cost,
            taskId: m.task_id || null,
            taskName: m.task_id ? taskMap.get(m.task_id) || null : null,
          });
          if (m.task_id) {
            const items = plannedMap.get(m.task_id) || [];
            items.push({ id: m.id, name: m.name, amount: cost });
            plannedMap.set(m.task_id, items);
          }
        } else {
          if (m.task_id) {
            spendMap.set(m.task_id, (spendMap.get(m.task_id) || 0) + cost);
          }
          if (m.source_material_id) {
            const paid = m.paid_amount ?? (m.status === "paid" ? cost : 0);
            paidMap.set(m.source_material_id, (paidMap.get(m.source_material_id) || 0) + paid);
          }
        }
      });
      setAllPlannedMaterials(allPlanned);
      setPaidBySourceId(paidMap);
      setTasks((tasksRes.data || []).map(t => ({
        ...t,
        is_ata: t.is_ata ?? false,
        materialSpent: spendMap.get(t.id) || 0,
        plannedMaterials: plannedMap.get(t.id) || [],
      })));
    };
    fetchTasks();
  }, [open, projectId]);

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Clear the input value so the same file can be selected again
    event.target.value = "";

    // Validate file type (images + PDF)
    if (!isSupportedFile(file)) {
      toast.error(t("receipt.unsupportedFile", "Unsupported file type. Use images or PDF."));
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      toast.error(t("receipt.fileTooLarge"));
      return;
    }

    let processedFile = file;

    if (isPdfFile(file)) {
      // PDF — skip compression, use directly
      setSelectedFile(file);
      setPreviewUrl("pdf");
    } else {
      // Convert HEIC to JPEG if needed
      if (isHeicFile(file)) {
        try {
          toast.info(t("receipt.convertingImage"));
          processedFile = await convertHeicToJpeg(file);
        } catch {
          toast.error(t("receipt.conversionFailed"));
          return;
        }
      }

      // Compress image
      const compressed = await compressImage(processedFile);
      setSelectedFile(compressed);

      // Create preview
      const url = URL.createObjectURL(compressed);
      setPreviewUrl(url);
    }

    // Reset form fields when new image is selected
    setAnalysisResult(null);
    setAnalysisError(false);
    setVendorName("");
    setTotalAmount("");
    setVatAmount("");
    setPurchaseDate(undefined);
    setInvoiceNumber("");
    setOcrNumber("");
    setDueDate(undefined);
    setLinkOption("new");
    setLinkedEntity(null);
    setSelectedTaskId(null);
  };

  const handleAnalyze = async () => {
    if (!selectedFile) return;

    setAnalyzing(true);
    setAnalysisError(false);
    aiAbortedRef.current = false;

    try {
      const base64 = await fileToBase64(selectedFile);
      const result = await analyzeDocument(base64);

      // If user pressed "Fyll i själv" mid-flight, discard the result — they
      // may already be typing values that the AI would overwrite.
      if (aiAbortedRef.current) return;

      setAnalysisResult(result);

      // Populate form with extracted values
      if (result.vendor_name) setVendorName(result.vendor_name);
      if (result.total_amount) setTotalAmount(result.total_amount.toString());
      if (result.vat_amount) setVatAmount(result.vat_amount.toString());
      if (result.purchase_date) {
        setPurchaseDate(new Date(result.purchase_date));
      }

      // Invoice-specific fields
      if (result.invoice_number) setInvoiceNumber(result.invoice_number);
      if (result.ocr_number) setOcrNumber(result.ocr_number);
      if (result.due_date) {
        setDueDate(new Date(result.due_date));
      }

      // Track successful document analysis
      analytics.capture(AnalyticsEvents.RECEIPT_ANALYZED, {
        document_type: result.document_type,
        has_vendor: Boolean(result.vendor_name),
        has_amount: Boolean(result.total_amount),
        has_vat: Boolean(result.vat_amount),
        has_date: Boolean(result.purchase_date),
        has_invoice_number: Boolean(result.invoice_number),
        confidence: result.confidence,
      });

      toast.success(t("document.analysisComplete"));
    } catch (error) {
      if (aiAbortedRef.current) return; // user aborted — silent
      console.error("Document analysis failed:", error);
      setAnalysisError(true);
      toast.error(t("document.analysisError"));
    } finally {
      if (!aiAbortedRef.current) setAnalyzing(false);
    }
  };

  // User pressed "Fyll i själv" — drop out of the loading state and show
  // the form with empty fields. File stays attached. Any in-flight AI result
  // is discarded when it eventually returns.
  const handleSkipAi = () => {
    aiAbortedRef.current = true;
    setAnalyzing(false);
    setAnalysisError(true); // triggers form to render with empty fields
  };

  const handleSave = async () => {
    if (flowStep === "scan" && !selectedFile) {
      toast.error(t("receipt.vendorRequired"));
      return;
    }
    if (!vendorName.trim()) {
      toast.error(t("receipt.vendorRequired"));
      return;
    }

    setSaving(true);

    try {
      // Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!profile) throw new Error("Profile not found");

      const amount = parseFloat(totalAmount) || 0;
      const dateStr = purchaseDate
        ? formatLocalDate(purchaseDate)
        : formatLocalDate(new Date());

      // Generate filename
      const filename = generateDocumentFilename(
        documentType,
        vendorName,
        dateStr,
        amount,
        invoiceNumber
      );

      // Determine storage folder based on document type
      const folder = documentType === "invoice" ? "Fakturor" : "Kvitton";
      const storagePath = `projects/${projectId}/${folder}/${filename}`;

      let entityId: string | null = null;
      let entityType: "task" | "material" = "material";

      // Manual flow → create 1 purchase_order (status=delivered, source=manual).
      // If user picked a task / budget post, also create a bulk material row so the
      // task budget link is preserved. Otherwise the order sits in "Att allokera".
      if (flowStep === "manual") {
        const { data: po, error: poError } = await supabase
          .from("purchase_orders")
          .insert({
            project_id: projectId,
            vendor_name: vendorName,
            total: amount,
            status: "delivered",
            source: "manual",
            delivered_at: dateStr,
            created_by_user_id: profile.id,
          })
          .select("id")
          .single();

        if (poError) throw poError;

        if (selectedTaskId || sourceMaterialId) {
          const { error: matError } = await supabase
            .from("materials")
            .insert({
              project_id: projectId,
              purchase_order_id: po.id,
              name: vendorName,
              vendor_name: vendorName,
              price_per_unit: amount,
              price_total: amount,
              quantity: 1,
              unit: "st",
              status: "ordered",
              created_by_user_id: profile.id,
              room_id: roomId !== "none" ? roomId : null,
              task_id: selectedTaskId || null,
              source_material_id: sourceMaterialId || null,
            });
          if (matError) console.error("Error linking manual PO to task:", matError);
        }
      } else if (linkOption === "link" && linkedEntity) {
        // Link to existing entity
        entityId = linkedEntity.id;
        entityType = linkedEntity.type;
      } else if (linkOption === "new") {
        if (documentType === "invoice") {
          // Create new task for invoice
          const { data: task, error: taskError } = await supabase
            .from("tasks")
            .insert({
              project_id: projectId,
              title: `${t("document.typeInvoice")} - ${vendorName}`,
              description: `${t("document.invoiceNumber")}: ${invoiceNumber || "-"}\n${t("document.ocrNumber")}: ${ocrNumber || "-"}`,
              status: "to_do",
              priority: "medium",
              budget: amount,
              room_id: roomId !== "none" ? roomId : null,
              invoice_number: invoiceNumber || null,
              ocr_number: ocrNumber || null,
              invoice_due_date: dueDate
                ? formatLocalDate(dueDate)
                : null,
            })
            .select("id")
            .single();

          if (taskError) throw taskError;
          entityId = task.id;
          entityType = "task";
        } else {
          // applyBudget mode: task is implicit from the picked planned material.
          // Otherwise (mode=new), use the user's task selection if any.
          const sourceMaterial = linkOption === "applyBudget" && sourceMaterialId
            ? allPlannedMaterials.find((pm) => pm.id === sourceMaterialId)
            : null;
          const resolvedTaskId = sourceMaterial?.taskId ?? selectedTaskId ?? null;

          // Create new material for receipt
          const { data: material, error: materialError } = await supabase
            .from("materials")
            .insert({
              project_id: projectId,
              name: flowStep === "manual" ? vendorName : `${t("receipt.receiptPurchase")} - ${vendorName}`,
              vendor_name: vendorName,
              price_per_unit: amount,
              quantity: 1,
              unit: "st",
              status: flowStep === "manual" ? "to_order" : "submitted",
              created_by_user_id: profile.id,
              room_id: roomId !== "none" ? roomId : null,
              task_id: resolvedTaskId,
              source_material_id: sourceMaterialId || null,
            })
            .select("id")
            .single();

          if (materialError) throw materialError;
          entityId = material.id;
          entityType = "material";
        }
      }

      // Upload document image (only if file exists — scan flow)
      if (selectedFile) {
        const { error: uploadError } = await supabase.storage
          .from("project-files")
          .upload(storagePath, selectedFile, { upsert: true });

        if (uploadError) {
          console.error("Upload error:", uploadError);
          toast.error(t("receipt.uploadError"));
        } else if (entityId) {
        // Create task_file_links record
        const linkData: Record<string, unknown> = {
          project_id: projectId,
          file_path: storagePath,
          file_name: filename,
          file_type: documentType,
          file_size: selectedFile.size,
          mime_type: selectedFile.type,
          linked_by_user_id: profile.id,
        };

        if (entityType === "task") {
          linkData.task_id = entityId;
        } else {
          linkData.material_id = entityId;
        }

        if (roomId !== "none") {
          linkData.room_id = roomId;
        }

        await supabase.from("task_file_links").insert(linkData);

        // Also create photo record for visual display
        const {
          data: { publicUrl },
        } = supabase.storage.from("project-files").getPublicUrl(storagePath);

        await supabase.from("photos").insert({
          linked_to_type: entityType,
          linked_to_id: entityId,
          url: publicUrl,
          caption: filename,
          uploaded_by_user_id: profile.id,
        });
      }
      }

      // Track document saved
      analytics.capture(AnalyticsEvents.RECEIPT_CAPTURED, {
        document_type: documentType,
        link_option: linkOption,
        has_room: roomId !== "none",
        amount,
        was_ai_analyzed: Boolean(analysisResult),
      });

      // Show success message
      if (flowStep === "manual") {
        toast.success(t("purchases.purchaseCreated", "Inköp registrerat"), {
          description: t("purchases.addReceiptLater", "Du kan bifoga underlag senare"),
        });
      } else if (linkOption === "link") {
        toast.success(t("document.documentLinked"), {
          description: t("document.documentLinkedDescription"),
        });
      } else if (documentType === "invoice") {
        toast.success(t("document.invoiceCreated"), {
          description: t("document.invoiceCreatedDescription"),
        });
      } else {
        toast.success(t("document.receiptCreated"), {
          description: t("document.receiptCreatedDescription"),
        });
      }

      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Save error:", error);
      toast.error(t("receipt.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const clearImage = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setAnalysisResult(null);
    setAnalysisError(false);
    setLinkOption("new");
    setLinkedEntity(null);
    setSelectedTaskId(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col !inset-auto !bottom-0 !left-0 !right-0 !rounded-t-2xl !rounded-b-none md:!inset-auto md:!left-[50%] md:!top-[50%] md:!translate-x-[-50%] md:!translate-y-[-50%] md:!rounded-lg">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>
            {flowStep === "choose"
              ? t("purchases.registerPurchase", "Registrera inköp")
              : flowStep === "manual"
                ? t("purchases.flowPurchase", "Ny beställning")
                : t("document.title")}
          </DialogTitle>
          <DialogDescription>
            {flowStep === "choose"
              ? t("purchases.chooseType", "Vad vill du registrera?")
              : flowStep === "manual"
                ? t("purchases.flowPurchaseDesc", "Registrera inköp — bifoga underlag senare")
                : t("document.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto space-y-4 py-4">
          {/* Step 1: Choose flow */}
          {flowStep === "choose" && (
            <div className="grid gap-2">
              <button
                type="button"
                className="flex items-center gap-3 p-3 rounded-lg border hover:bg-emerald-50 hover:border-emerald-200 transition-colors text-left"
                onClick={() => setFlowStep("scan")}
              >
                <div className="h-10 w-10 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
                  <Receipt className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">{t("purchases.flowReceipt", "Registrera kvitto")}</p>
                  <p className="text-xs text-muted-foreground">{t("purchases.flowReceiptDesc", "Har kvitto eller faktura att skanna")}</p>
                </div>
              </button>
              <button
                type="button"
                className="flex items-center gap-3 p-3 rounded-lg border hover:bg-blue-50 hover:border-blue-200 transition-colors text-left"
                onClick={() => setFlowStep("manual")}
              >
                <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <PenLine className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">{t("purchases.flowPurchase", "Ny beställning")}</p>
                  <p className="text-xs text-muted-foreground">{t("purchases.flowPurchaseDesc", "Registrera inköp — bifoga underlag senare")}</p>
                </div>
              </button>
            </div>
          )}

          {/* Step 2a: Scan flow — existing document capture */}
          {flowStep === "scan" && !previewUrl && (
            <div className="space-y-3">
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*,.heic,.heif,application/pdf,.pdf"
                capture="environment"
                onChange={handleFileSelect}
                className="hidden"
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.heic,.heif,application/pdf,.pdf"
                onChange={handleFileSelect}
                className="hidden"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 gap-2 h-16"
                  onClick={() => cameraInputRef.current?.click()}
                >
                  <Camera className="h-5 w-5" />
                  {t("receipt.takePhoto")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 gap-2 h-16"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-5 w-5" />
                  {t("receipt.chooseFile")}
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground"
                onClick={() => setFlowStep("choose")}
              >
                {t("common.back", "Tillbaka")}
              </Button>
            </div>
          )}
          {flowStep === "scan" && previewUrl && (
            <>
              {/* Document preview */}
              <div className="relative">
                {previewUrl === "pdf" ? (
                  <div className="w-full h-32 flex flex-col items-center justify-center rounded-lg border bg-muted gap-2">
                    <FileText className="h-10 w-10 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">{selectedFile?.name}</span>
                  </div>
                ) : (
                  <img
                    src={previewUrl!}
                    alt="Document preview"
                    className="w-full max-h-40 object-contain rounded-lg border"
                  />
                )}
                <button
                  onClick={clearImage}
                  className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* PDF → route to quote import (process-receipt doesn't accept PDFs) */}
              {!analysisResult && !analysisError && selectedFile && isPdfFile(selectedFile) && onSwitchToQuoteImport && (
                <div className="space-y-2 p-3 rounded-lg border bg-amber-50 border-amber-200">
                  <p className="text-sm text-amber-800">
                    {t(
                      "receipt.pdfNeedsQuoteFlow",
                      "PDF-format hanteras via offert-importen (rad-för-rad extraktion).",
                    )}
                  </p>
                  <Button
                    onClick={() => {
                      const file = selectedFile;
                      onOpenChange(false);
                      resetForm();
                      onSwitchToQuoteImport(file);
                    }}
                    className="w-full gap-2"
                  >
                    <Sparkles className="h-4 w-4" />
                    {t("receipt.openQuoteImport", "Öppna offert-import")}
                  </Button>
                </div>
              )}

              {/* Analyze button + skip-AI escape hatch */}
              {!analysisResult && !analysisError && !(selectedFile && isPdfFile(selectedFile) && onSwitchToQuoteImport) && (
                <div className="space-y-2">
                  <Button
                    onClick={handleAnalyze}
                    disabled={analyzing}
                    className="w-full gap-2"
                  >
                    {analyzing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t("document.analyzing")}
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        {t("document.analyzeDocument")}
                      </>
                    )}
                  </Button>
                  {analyzing && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleSkipAi}
                      className="w-full text-xs text-muted-foreground hover:text-foreground"
                    >
                      {t("document.skipAndFillManually", "Fyll i själv")}
                    </Button>
                  )}
                </div>
              )}

              {/* Analysis error warning */}
              {analysisError && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{t("document.analysisError")}</span>
                </div>
              )}

              {/* Document type indicator */}
              {analysisResult && (
                <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                  {documentType === "invoice" ? (
                    <FileText className="h-5 w-5 text-blue-600" />
                  ) : (
                    <Receipt className="h-5 w-5 text-emerald-600" />
                  )}
                  <span className="text-sm font-medium">
                    {t("document.detectedType")}:
                  </span>
                  <Badge
                    variant={
                      documentType === "invoice" ? "default" : "secondary"
                    }
                  >
                    {documentType === "invoice"
                      ? t("document.typeInvoice")
                      : t("document.typeReceipt")}
                  </Badge>
                </div>
              )}

              {/* Form fields - show after analysis or if user wants to fill manually */}
              {(analysisResult || analysisError) && (
                <div className="space-y-4">
                  {/* Link option selection */}
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">
                      {t("document.chooseAction")}
                    </Label>
                    <RadioGroup
                      value={linkOption}
                      onValueChange={(v) => {
                        const next = v as LinkOption;
                        setLinkOption(next);
                        if (next !== "link") setLinkedEntity(null);
                        if (next !== "applyBudget") setSourceMaterialId(null);
                      }}
                      className="flex flex-col gap-2"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="new" id="new" />
                        <Label htmlFor="new" className="cursor-pointer">
                          {documentType === "invoice"
                            ? t("document.createNewTask")
                            : t("document.createNewPurchase")}
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="link" id="link" />
                        <Label
                          htmlFor="link"
                          className="cursor-pointer flex items-center gap-1.5"
                        >
                          <Link2 className="h-4 w-4" />
                          {t("document.linkToExisting")}
                        </Label>
                      </div>
                      {documentType !== "invoice" && allPlannedMaterials.length > 0 && (
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="applyBudget" id="applyBudget" />
                          <Label
                            htmlFor="applyBudget"
                            className="cursor-pointer flex items-center gap-1.5"
                          >
                            <ClipboardList className="h-4 w-4" />
                            {t("document.applyToPlannedMaterial", "Koppla mot planerat material")}
                          </Label>
                        </div>
                      )}
                    </RadioGroup>
                  </div>

                  {/* Entity picker for linking */}
                  {linkOption === "link" && (
                    <SearchableEntityPicker
                      projectId={projectId}
                      documentType={documentType}
                      currency={currency}
                      selectedEntity={linkedEntity}
                      onSelect={setLinkedEntity}
                    />
                  )}

                  {/* Task picker — visible only in "new" mode. In "applyBudget" the task
                       is auto-derived from the picked planned material. */}
                  {linkOption === "new" && documentType !== "invoice" && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">{t("document.linkToTask")}</Label>
                      <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                        {tasks.map(task => (
                          <button
                            key={task.id}
                            type="button"
                            onClick={() => setSelectedTaskId(task.id)}
                            className={cn(
                              "flex items-center justify-between p-2.5 rounded-lg border text-left text-sm transition-colors",
                              selectedTaskId === task.id
                                ? "border-primary bg-primary/5"
                                : "border-border hover:border-primary/30 hover:bg-accent/50"
                            )}
                          >
                            <span className="truncate font-medium flex items-center gap-1.5">
                              {task.title}
                              {task.is_ata && (
                                <Badge variant="outline" className="text-[10px] px-1 py-0 text-orange-600 border-orange-300 shrink-0">{t('budget.addition', 'Tillägg')}</Badge>
                              )}
                            </span>
                            {(() => {
                              const denom = (task.material_estimate && task.material_estimate > 0)
                                ? task.material_estimate : task.budget;
                              if (!denom || denom <= 0) return null;
                              const ratio = task.materialSpent / denom;
                              const color = ratio >= 1 ? "text-destructive" : ratio >= 0.8 ? "text-amber-600" : "text-emerald-600";
                              const bar = ratio >= 1 ? "bg-destructive" : ratio >= 0.8 ? "bg-amber-500" : "bg-emerald-500";
                              return (
                                <div className="flex flex-col items-end gap-0.5 ml-2 shrink-0">
                                  <span className={cn("text-xs", color)}>
                                    {formatCurrency(task.materialSpent, currency)} / {formatCurrency(denom, currency)}
                                  </span>
                                  <div className="w-16 h-1 rounded-full bg-muted overflow-hidden">
                                    <div className={cn("h-full rounded-full", bar)} style={{ width: `${Math.min(ratio * 100, 100)}%` }} />
                                  </div>
                                </div>
                              );
                            })()}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setSelectedTaskId(null)}
                          className={cn(
                            "flex items-center p-2.5 rounded-lg border text-left text-sm transition-colors border-dashed",
                            selectedTaskId === null
                              ? "border-primary bg-primary/5"
                              : "border-muted-foreground/30 hover:border-primary/30"
                          )}
                        >
                          <span className="text-muted-foreground">{t("document.noTaskLink")}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Planned-material picker — only in applyBudget mode. Picking a row
                       auto-assigns the parent task (sent at save). */}
                  {linkOption === "applyBudget" && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">
                        {t("document.plannedMaterialPickerLabel", "Vilken budgetpost fyller detta inköp?")}
                      </Label>
                      <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
                        {allPlannedMaterials.map((pm) => {
                          const paid = paidBySourceId.get(pm.id) || 0;
                          const remaining = pm.amount - paid;
                          return (
                            <button
                              key={pm.id}
                              type="button"
                              onClick={() => setSourceMaterialId(sourceMaterialId === pm.id ? null : pm.id)}
                              className={cn(
                                "flex items-center justify-between p-2.5 rounded-lg border text-left text-sm transition-colors",
                                sourceMaterialId === pm.id
                                  ? "border-primary bg-primary/5"
                                  : "border-border hover:border-primary/30 hover:bg-accent/50"
                              )}
                            >
                              <div className="flex flex-col min-w-0">
                                <span className="truncate font-medium">{pm.name}</span>
                                {pm.taskName && (
                                  <span className="text-xs text-muted-foreground truncate">{pm.taskName}</span>
                                )}
                              </div>
                              <span className="text-xs shrink-0 ml-2">
                                {remaining > 0
                                  ? t("purchases.budgetRemaining", "Kvar: {{amount}}", { amount: formatCurrency(remaining, currency) })
                                  : formatCurrency(pm.amount, currency)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Common fields */}
                  <div className="space-y-2">
                    <Label>{t("receipt.vendor")} *</Label>
                    <Input
                      value={vendorName}
                      onChange={(e) => setVendorName(e.target.value)}
                      placeholder={t("receipt.vendorPlaceholder")}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>{t("receipt.totalAmount")}</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={totalAmount}
                        onChange={(e) => setTotalAmount(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("receipt.vatAmount")}</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={vatAmount}
                        onChange={(e) => setVatAmount(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>{t("receipt.purchaseDate")}</Label>
                    <DatePicker
                      date={purchaseDate}
                      onDateChange={setPurchaseDate}
                      placeholder={t("receipt.selectDate")}
                    />
                  </div>

                  {/* Invoice-specific fields */}
                  {documentType === "invoice" && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label>{t("document.invoiceNumber")}</Label>
                          <Input
                            value={invoiceNumber}
                            onChange={(e) => setInvoiceNumber(e.target.value)}
                            placeholder="12345"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{t("document.ocrNumber")}</Label>
                          <Input
                            value={ocrNumber}
                            onChange={(e) => setOcrNumber(e.target.value)}
                            placeholder="1234567890"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>{t("document.dueDate")}</Label>
                        <DatePicker
                          date={dueDate}
                          onDateChange={setDueDate}
                          placeholder={t("receipt.selectDate")}
                        />
                      </div>
                    </>
                  )}

                  {/* Room selection - only when creating a new entity (new or applyBudget). */}
                  {(linkOption === "new" || linkOption === "applyBudget") && (
                    <div className="space-y-2">
                      <Label>{t("receipt.linkToRoom")}</Label>
                      <Select value={roomId} onValueChange={setRoomId}>
                        <SelectTrigger>
                          <SelectValue placeholder={t("receipt.selectRoom")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">
                            {t("receipt.noRoom")}
                          </SelectItem>
                          {rooms.map((room) => (
                            <SelectItem key={room.id} value={room.id}>
                              {room.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          {/* Step 2b: Manual entry form */}
          {flowStep === "manual" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("receipt.vendorName", "Butik / leverantör")}</Label>
                <Input
                  placeholder={t("receipt.vendorPlaceholder", "t.ex. Bauhaus, IKEA...")}
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("receipt.amount", "Belopp")}</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                />
              </div>
              {rooms.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("receipt.room", "Rum")}</Label>
                  <Select value={roomId} onValueChange={setRoomId}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder={t("receipt.noRoom", "Inget rum")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("receipt.noRoom", "Inget rum")}</SelectItem>
                      {rooms.map((r) => (
                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {allPlannedMaterials.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("purchases.linkToBudgetPost", "Koppla till budgetpost")}</Label>
                  <Select
                    value={sourceMaterialId || "none"}
                    onValueChange={(v) => setSourceMaterialId(v === "none" ? null : v)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder={t("purchases.noBudgetPost", "Ingen budgetpost")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("purchases.noBudgetPost", "Ingen budgetpost")}</SelectItem>
                      {allPlannedMaterials.map((pm) => {
                        const paid = paidBySourceId.get(pm.id) || 0;
                        const remaining = pm.amount - paid;
                        return (
                          <SelectItem key={pm.id} value={pm.id}>
                            {pm.name}
                            {pm.taskName ? ` (${pm.taskName})` : ""}
                            {remaining > 0 ? ` — ${t("purchases.remaining", "kvar")}: ${formatCurrency(remaining, currency)}` : ""}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">
                {t("purchases.manualNote", "Du kan bifoga kvitto eller faktura senare via Inköpslistan.")}
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground"
                onClick={() => setFlowStep("choose")}
              >
                {t("common.back", "Tillbaka")}
              </Button>
            </div>
          )}
        </div>

        {/* Save button — scan flow (after analysis) or manual flow */}
        {((flowStep === "scan" && (analysisResult || analysisError) && previewUrl) || flowStep === "manual") && (
          <div className="flex-shrink-0 pt-4 border-t">
            <Button
              onClick={handleSave}
              disabled={
                saving ||
                !vendorName.trim() ||
                (linkOption === "link" && !linkedEntity) ||
                (linkOption === "applyBudget" && !sourceMaterialId)
              }
              className="w-full"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {t("receipt.saving")}
                </>
              ) : flowStep === "manual" ? (
                t("purchases.savePurchase", "Registrera inköp")
              ) : documentType === "invoice" ? (
                t("document.saveInvoice")
              ) : (
                t("document.saveReceipt")
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Export alias for backwards compatibility
export { QuickReceiptCaptureModal as DocumentCaptureModal };

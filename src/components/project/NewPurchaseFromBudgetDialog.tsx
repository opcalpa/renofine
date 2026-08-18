import { useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Receipt, ShoppingCart, ArrowLeft, Camera, Upload, X, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { createRequestPurchase } from "@/lib/createRequestPurchase";

interface BudgetMaterial {
  id: string;
  name: string;
  price_total: number | null;
  task_id: string | null;
  room_id: string | null;
  quantity: number;
  unit: string;
  price_per_unit: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planned: BudgetMaterial | null;
  projectId: string;
  currentProfileId: string | null;
  currency?: string | null;
  usedAmount?: number;
  onCreated: () => void;
}

type FlowStep = "choose" | "completed" | "order";

export function NewPurchaseFromBudgetDialog({
  open,
  onOpenChange,
  planned,
  projectId,
  currentProfileId,
  currency,
  usedAmount = 0,
  onCreated,
}: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState<FlowStep>("choose");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const remaining = (planned?.price_total ?? 0) - usedAmount;

  const reset = useCallback(() => {
    setStep("choose");
    setAmount("");
    setDescription("");
    setReceiptFile(null);
    setReceiptPreview(null);
  }, []);

  const handleClose = useCallback(
    (open: boolean) => {
      if (!open) reset();
      onOpenChange(open);
    },
    [onOpenChange, reset]
  );

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReceiptFile(file);
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => setReceiptPreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setReceiptPreview(null);
    }
  };

  const uploadReceipt = async (materialId: string): Promise<void> => {
    if (!receiptFile) return;
    const ext = receiptFile.name.split(".").pop() || "jpg";
    const filePath = `projects/${projectId}/kvitton/${Date.now()}-${materialId}.${ext}`;
    const { error } = await supabase.storage
      .from("project-files")
      .upload(filePath, receiptFile, { upsert: false });
    if (error) {
      console.error("Receipt upload failed:", error);
      return;
    }
    // Link file to the material
    await supabase.from("task_file_links").insert({
      project_id: projectId,
      file_path: filePath,
      file_name: receiptFile.name,
      file_type: "receipt",
      material_id: materialId,
      linked_by_user_id: currentProfileId,
    });
  };

  const handleSave = useCallback(async () => {
    if (!planned || !currentProfileId) return;
    setSaving(true);

    const isCompleted = step === "completed";
    const parsedAmount = amount ? parseFloat(amount) : null;

    // Route through the request-PO helper: every non-planned material MUST hang
    // off a purchase_order (DB CHECK enforces (status='planned') = (po_id IS NULL)).
    // A raw material insert here violated that invariant → hard-failed every save.
    let materialId: string;
    try {
      const result = await createRequestPurchase({
        projectId,
        createdByUserId: currentProfileId,
        // Completed purchase → a delivered PO; an order/wish → the default request PO.
        poStatus: isCompleted ? "delivered" : "requested",
        material: {
          task_id: planned.task_id,
          room_id: planned.room_id,
          name: planned.name,
          description: description || null,
          quantity: parsedAmount ? 1 : planned.quantity || 1,
          unit: planned.unit || "st",
          price_per_unit: parsedAmount,
          price_total: parsedAmount ?? 0,
          paid_amount: isCompleted ? parsedAmount : null,
          status: isCompleted ? "paid" : "to_order",
          source_material_id: planned.id,
        },
      });
      materialId = result.materialId;
    } catch {
      setSaving(false);
      toast.error(t("purchases.createOrderFailed", "Kunde inte skapa inköp"));
      return;
    }

    // Upload receipt file if provided
    if (receiptFile && materialId) {
      await uploadReceipt(materialId);
    }

    setSaving(false);
    toast.success(
      isCompleted
        ? t("purchases.completedPurchaseSaved", "Utfört köp registrerat")
        : t("purchases.orderCreated", "Beställning skapad")
    );
    handleClose(false);
    onCreated();
  }, [step, amount, description, planned, projectId, currentProfileId, receiptFile]);

  if (!planned) return null;

  const choices = [
    {
      key: "completed" as FlowStep,
      icon: Receipt,
      title: t("purchases.flowCompleted", "Utfört köp"),
      desc: t("purchases.flowCompletedDesc", "Redan köpt — fota eller ladda upp kvitto"),
      color: "text-emerald-600",
      bg: "hover:bg-emerald-50 hover:border-emerald-200 dark:hover:bg-emerald-950/20",
    },
    {
      key: "order" as FlowStep,
      icon: ShoppingCart,
      title: t("purchases.flowOrder", "Beställning"),
      desc: t("purchases.flowOrderDesc", "Ska köpas — belopp valfritt"),
      color: "text-blue-600",
      bg: "hover:bg-blue-50 hover:border-blue-200 dark:hover:bg-blue-950/20",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">
            {step === "choose"
              ? t("purchases.newPurchaseFrom", "Nytt inköp")
              : choices.find((c) => c.key === step)?.title}
          </DialogTitle>
          <DialogDescription className="text-sm">
            <span className="font-medium text-foreground">{planned.name}</span>
            {planned.price_total != null && (
              <>
                {" · "}
                {t("purchases.budgetLabel", "Budget")}: {formatCurrency(planned.price_total, currency)}
                {usedAmount > 0 && (
                  <>
                    {" · "}
                    {t("purchases.remainingLabel", "Kvar")}: {formatCurrency(remaining, currency)}
                  </>
                )}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {step === "choose" ? (
          <div className="space-y-2 pt-1">
            {choices.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setStep(c.key)}
                className={`w-full flex items-center gap-3 p-4 rounded-lg border text-left transition-colors bg-transparent cursor-pointer ${c.bg}`}
              >
                <c.icon className={`h-5 w-5 shrink-0 ${c.color}`} />
                <div>
                  <p className="text-sm font-medium">{c.title}</p>
                  <p className="text-xs text-muted-foreground">{c.desc}</p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-4 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs -ml-2 text-muted-foreground"
              onClick={() => setStep("choose")}
            >
              <ArrowLeft className="h-3.5 w-3.5 mr-1" />
              {t("common.back", "Tillbaka")}
            </Button>

            {/* Amount */}
            <div className="space-y-2">
              <Label htmlFor="purchase-amount" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("purchases.amount", "Belopp")} (SEK)
                {step === "order" && (
                  <span className="normal-case tracking-normal font-normal ml-1">
                    — {t("purchases.optional", "valfritt")}
                  </span>
                )}
              </Label>
              <Input
                id="purchase-amount"
                type="number"
                step="0.01"
                min="0"
                placeholder={step === "order" ? t("purchases.amountUnknown", "Okänt") : "0"}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
                required={step === "completed"}
                className="text-lg font-semibold tabular-nums"
              />
              {remaining > 0 && (
                <button
                  type="button"
                  className="text-xs text-primary hover:underline bg-transparent border-none cursor-pointer p-0"
                  onClick={() => setAmount(String(remaining))}
                >
                  {t("purchases.useRemaining", "Fyll i kvarvarande")}: {formatCurrency(remaining, currency)}
                </button>
              )}
            </div>

            {/* Receipt upload — only for completed purchases */}
            {step === "completed" && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("purchases.receipt", "Kvitto / faktura")}
                </Label>

                {receiptFile ? (
                  <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                    {receiptPreview && (
                      <img src={receiptPreview} alt="" className="h-12 w-12 rounded object-cover shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{receiptFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(receiptFile.size / 1024).toFixed(0)} KB
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => { setReceiptFile(null); setReceiptPreview(null); }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1.5"
                      onClick={() => cameraInputRef.current?.click()}
                    >
                      <Camera className="h-3.5 w-3.5" />
                      {t("purchases.photoReceipt", "Fota kvitto")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1.5"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      {t("purchases.uploadReceipt", "Ladda upp")}
                    </Button>
                  </div>
                )}

                <p className="text-[11px] text-muted-foreground">
                  {t("purchases.receiptOptionalHint", "Du kan även bifoga kvitto senare via filfliken.")}
                </p>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={handleFileSelected}
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleFileSelected}
                />
              </div>
            )}

            {/* Note */}
            <div className="space-y-2">
              <Label htmlFor="purchase-desc" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("purchases.note", "Anteckning")}
                {step === "order" && (
                  <span className="normal-case tracking-normal font-normal ml-1">
                    — {t("purchases.whatToBuy", "vad ska köpas?")}
                  </span>
                )}
              </Label>
              <Textarea
                id="purchase-desc"
                rows={2}
                placeholder={
                  step === "order"
                    ? t("purchases.orderPlaceholder", "T.ex. 'Behöver 2 burkar vit spackel'")
                    : t("purchases.notePlaceholder", "Valfri anteckning...")
                }
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <Button
              className="w-full"
              disabled={saving || (step === "completed" && !amount)}
              onClick={handleSave}
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {step === "completed"
                ? t("purchases.saveCompleted", "Registrera köp")
                : t("purchases.saveOrder", "Skapa beställning")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

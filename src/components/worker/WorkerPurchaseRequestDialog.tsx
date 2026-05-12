import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, ShoppingCart, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface WorkerTaskOption {
  id: string;
  title: string;
}

interface WorkerPurchaseRequestDialogProps {
  token: string;
  tasks: WorkerTaskOption[];
  canCreatePurchases: boolean;
  canLogReceipts: boolean;
}

const COMMON_UNITS = ["st", "m", "m²", "m³", "kg", "l", "rulle", "påse"];

export function WorkerPurchaseRequestDialog({
  token,
  tasks,
  canCreatePurchases,
  canLogReceipts,
}: WorkerPurchaseRequestDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // När bara receipt-läget är tillgängligt, börja i det. Annars request.
  const initialReceipt = !canCreatePurchases && canLogReceipts;
  const [receiptMode, setReceiptMode] = useState(initialReceipt);
  useEffect(() => setReceiptMode(initialReceipt), [initialReceipt]);

  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("st");
  const [priceTotal, setPriceTotal] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [taskId, setTaskId] = useState<string>("none");
  const [description, setDescription] = useState("");
  const [purchasedDate, setPurchasedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const reset = () => {
    setName("");
    setQuantity("1");
    setUnit("st");
    setPriceTotal("");
    setVendorName("");
    setTaskId("none");
    setDescription("");
    setPurchasedDate(new Date().toISOString().slice(0, 10));
    setPaymentMethod("card");
    setReceiptFile(null);
    setReceiptMode(initialReceipt);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast({
        variant: "destructive",
        description: t("worker.purchase.nameRequired", "Beskriv vad du köpt / behöver"),
      });
      return;
    }

    setSubmitting(true);
    try {
      let data, error;

      if (receiptMode) {
        // Receipt-läge: FormData för att kunna bifoga kvitto-bild
        const fd = new FormData();
        fd.append("token", token);
        fd.append("name", name.trim());
        fd.append("mode", "receipt");
        fd.append("quantity", String(parseFloat(quantity) || 1));
        fd.append("unit", unit);
        fd.append("priceTotal", String(parseFloat(priceTotal) || 0));
        if (vendorName.trim()) fd.append("vendorName", vendorName.trim());
        if (taskId !== "none") fd.append("taskId", taskId);
        if (description.trim()) fd.append("description", description.trim());
        fd.append("purchasedDate", purchasedDate);
        fd.append("paymentMethod", paymentMethod);
        if (receiptFile) fd.append("receiptFile", receiptFile);

        ({ data, error } = await supabase.functions.invoke("worker-create-purchase", {
          body: fd,
        }));
      } else {
        // Request-läge: enkel JSON
        ({ data, error } = await supabase.functions.invoke("worker-create-purchase", {
          body: {
            token,
            name: name.trim(),
            mode: "request",
            quantity: parseFloat(quantity) || 1,
            unit,
            priceTotal: parseFloat(priceTotal) || 0,
            vendorName: vendorName.trim() || null,
            taskId: taskId === "none" ? null : taskId,
            description: description.trim() || null,
          },
        }));
      }

      if (error || (data && data.error)) {
        throw error || new Error(data.error);
      }

      toast({
        description: receiptMode
          ? t("worker.purchase.loggedReceipt", "Inköp loggat — projektägaren ser kvittot.")
          : t("worker.purchase.submitted", "Inköpsförslag skickat — projektägaren godkänner."),
      });
      reset();
      setOpen(false);
    } catch (err) {
      console.error("Failed to submit purchase:", err);
      toast({
        variant: "destructive",
        description: t("worker.purchase.submitFailed", "Kunde inte skicka. Försök igen."),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const showModeToggle = canCreatePurchases && canLogReceipts;
  const triggerLabel = receiptMode
    ? t("worker.purchase.logButton", "Logga inköp")
    : t("worker.purchase.requestButton", "Be om inköp");

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <ShoppingCart className="h-3.5 w-3.5" />
          {triggerLabel}
        </Button>
      </DrawerTrigger>
      <DrawerContent className="max-h-[90vh]">
        <div className="mx-auto w-full max-w-lg">
          <DrawerHeader>
            <DrawerTitle>
              {receiptMode
                ? t("worker.purchase.titleReceipt", "Logga utfört inköp")
                : t("worker.purchase.title", "Be om inköp")}
            </DrawerTitle>
            <DrawerDescription>
              {receiptMode
                ? t(
                    "worker.purchase.descriptionReceipt",
                    "Logga något du redan köpt. Bifoga kvitto om du har.",
                  )
                : t(
                    "worker.purchase.description",
                    "Beskriv vad du behöver. Projektägaren godkänner innan beställning.",
                  )}
            </DrawerDescription>
          </DrawerHeader>

          <div className="px-4 space-y-3 overflow-y-auto">
            {showModeToggle && (
              <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
                <Label htmlFor="receipt-toggle" className="text-sm cursor-pointer">
                  {t("worker.purchase.toggleAlreadyBought", "Jag har redan köpt det här")}
                </Label>
                <Switch
                  id="receipt-toggle"
                  checked={receiptMode}
                  onCheckedChange={setReceiptMode}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="purchase-name">
                {receiptMode
                  ? t("worker.purchase.nameReceipt", "Vad köptes?")
                  : t("worker.purchase.name", "Vad behövs?")}
              </Label>
              <Input
                id="purchase-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("worker.purchase.namePlaceholder", "Skruv 5×60mm, 100-pack")}
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="purchase-quantity">{t("worker.purchase.quantity", "Antal")}</Label>
                <Input
                  id="purchase-quantity"
                  type="number"
                  inputMode="decimal"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="purchase-unit">{t("worker.purchase.unit", "Enhet")}</Label>
                <Select value={unit} onValueChange={setUnit}>
                  <SelectTrigger id="purchase-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMON_UNITS.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="purchase-price">
                {receiptMode
                  ? t("worker.purchase.priceTotalReceipt", "Pris (totalt, inkl moms)")
                  : t("worker.purchase.priceTotal", "Uppskattat pris (totalt, inkl moms)")}
              </Label>
              <Input
                id="purchase-price"
                type="number"
                inputMode="decimal"
                value={priceTotal}
                onChange={(e) => setPriceTotal(e.target.value)}
                placeholder="0"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="purchase-vendor">
                {receiptMode
                  ? t("worker.purchase.vendorReceipt", "Köpt hos")
                  : t("worker.purchase.vendor", "Leverantör (valfritt)")}
              </Label>
              <Input
                id="purchase-vendor"
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                placeholder={t("worker.purchase.vendorPlaceholder", "Bauhaus, Beijer...")}
              />
            </div>

            {receiptMode && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="purchase-date">
                      {t("worker.purchase.purchasedDate", "Köpdatum")}
                    </Label>
                    <Input
                      id="purchase-date"
                      type="date"
                      value={purchasedDate}
                      onChange={(e) => setPurchasedDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="purchase-payment">
                      {t("worker.purchase.paymentMethod", "Betalning")}
                    </Label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger id="purchase-payment">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="card">{t("worker.purchase.payCard", "Kort")}</SelectItem>
                        <SelectItem value="cash">{t("worker.purchase.payCash", "Kontant")}</SelectItem>
                        <SelectItem value="swish">Swish</SelectItem>
                        <SelectItem value="invoice">{t("worker.purchase.payInvoice", "Faktura")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="purchase-receipt">
                    {t("worker.purchase.receiptFile", "Kvitto (valfritt)")}
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="purchase-receipt"
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
                      className="flex-1"
                    />
                    {receiptFile && (
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        onClick={() => setReceiptFile(null)}
                      >
                        {t("common.remove", "Ta bort")}
                      </Button>
                    )}
                  </div>
                  {!receiptFile && (
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Upload className="h-3 w-3" />
                      {t("worker.purchase.receiptHint", "Ta bild på kvittot med kameran")}
                    </p>
                  )}
                </div>
              </>
            )}

            {tasks.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="purchase-task">
                  {t("worker.purchase.task", "Koppla till uppgift (valfritt)")}
                </Label>
                <Select value={taskId} onValueChange={setTaskId}>
                  <SelectTrigger id="purchase-task">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      {t("worker.purchase.noTask", "Ingen koppling")}
                    </SelectItem>
                    {tasks.map((task) => (
                      <SelectItem key={task.id} value={task.id}>
                        {task.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="purchase-description">
                {t("worker.purchase.notes", "Anteckningar (valfritt)")}
              </Label>
              <Textarea
                id="purchase-description"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t(
                  "worker.purchase.notesPlaceholder",
                  "T.ex. om varför, var den ska användas, deadline",
                )}
              />
            </div>
          </div>

          <DrawerFooter>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {receiptMode
                ? t("worker.purchase.submitReceipt", "Logga inköp")
                : t("worker.purchase.submit", "Skicka förslag")}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
              {t("common.cancel", "Avbryt")}
            </Button>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

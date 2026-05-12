import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, ShoppingCart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
}

const COMMON_UNITS = ["st", "m", "m²", "m³", "kg", "l", "rulle", "påse"];

export function WorkerPurchaseRequestDialog({ token, tasks }: WorkerPurchaseRequestDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("st");
  const [priceTotal, setPriceTotal] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [taskId, setTaskId] = useState<string>("none");
  const [description, setDescription] = useState("");

  const reset = () => {
    setName("");
    setQuantity("1");
    setUnit("st");
    setPriceTotal("");
    setVendorName("");
    setTaskId("none");
    setDescription("");
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast({
        variant: "destructive",
        description: t("worker.purchase.nameRequired", "Beskriv vad du behöver"),
      });
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("worker-create-purchase", {
        body: {
          token,
          name: name.trim(),
          quantity: parseFloat(quantity) || 1,
          unit,
          priceTotal: parseFloat(priceTotal) || 0,
          vendorName: vendorName.trim() || null,
          taskId: taskId === "none" ? null : taskId,
          description: description.trim() || null,
        },
      });

      if (error || (data && data.error)) {
        throw error || new Error(data.error);
      }

      toast({
        description: t("worker.purchase.submitted", "Inköpsförslag skickat — projektägaren godkänner."),
      });
      reset();
      setOpen(false);
    } catch (err) {
      console.error("Failed to submit purchase request:", err);
      toast({
        variant: "destructive",
        description: t("worker.purchase.submitFailed", "Kunde inte skicka förslag. Försök igen."),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
        >
          <ShoppingCart className="h-3.5 w-3.5" />
          {t("worker.purchase.requestButton", "Be om inköp")}
        </Button>
      </DrawerTrigger>
      <DrawerContent className="max-h-[90vh]">
        <div className="mx-auto w-full max-w-lg">
          <DrawerHeader>
            <DrawerTitle>{t("worker.purchase.title", "Be om inköp")}</DrawerTitle>
            <DrawerDescription>
              {t(
                "worker.purchase.description",
                "Beskriv vad du behöver. Projektägaren godkänner innan beställning.",
              )}
            </DrawerDescription>
          </DrawerHeader>

          <div className="px-4 space-y-3 overflow-y-auto">
            <div className="space-y-1.5">
              <Label htmlFor="purchase-name">
                {t("worker.purchase.name", "Vad behövs?")}
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
                <Label htmlFor="purchase-quantity">
                  {t("worker.purchase.quantity", "Antal")}
                </Label>
                <Input
                  id="purchase-quantity"
                  type="number"
                  inputMode="decimal"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="purchase-unit">
                  {t("worker.purchase.unit", "Enhet")}
                </Label>
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
                {t("worker.purchase.priceTotal", "Uppskattat pris (totalt, inkl moms)")}
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
                {t("worker.purchase.vendor", "Leverantör (valfritt)")}
              </Label>
              <Input
                id="purchase-vendor"
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                placeholder={t("worker.purchase.vendorPlaceholder", "Bauhaus, Beijer...")}
              />
            </div>

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
              {t("worker.purchase.submit", "Skicka förslag")}
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

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/currency";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

interface AddPurchaseLineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  purchaseOrderId: string;
  defaultVendorName?: string | null;
  // Inherited PO status: if PO is 'ordered' we default material status to 'ordered',
  // delivered/pending → corresponding material status.
  defaultMaterialStatus?: string;
  currency?: string | null;
  tasks: { id: string; title: string }[];
  rooms: { id: string; name: string }[];
  onAdded: () => void;
}

export const AddPurchaseLineDialog = ({
  open,
  onOpenChange,
  projectId,
  purchaseOrderId,
  defaultVendorName,
  defaultMaterialStatus,
  currency,
  tasks,
  rooms,
  onAdded,
}: AddPurchaseLineDialogProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("st");
  const [pricePerUnit, setPricePerUnit] = useState("");
  const [status, setStatus] = useState<string>("submitted");
  const [taskId, setTaskId] = useState<string>("none");
  const [roomId, setRoomId] = useState<string>("none");

  useEffect(() => {
    if (!open) return;
    setName("");
    setQuantity("1");
    setUnit("st");
    setPricePerUnit("");
    setStatus(defaultMaterialStatus ?? "submitted");
    setTaskId("none");
    setRoomId("none");
  }, [open, defaultMaterialStatus]);

  const qtyNum = parseFloat(quantity) || 0;
  const priceNum = parseFloat(pricePerUnit) || 0;
  const totalPreview = qtyNum * priceNum;

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ description: t("purchases.nameRequired", "Namn krävs"), variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();

      const { error } = await supabase.from("materials").insert({
        project_id: projectId,
        purchase_order_id: purchaseOrderId,
        name: name.trim(),
        quantity: qtyNum > 0 ? qtyNum : null,
        unit: unit.trim() || "st",
        price_per_unit: priceNum > 0 ? priceNum : null,
        vendor_name: defaultVendorName ?? null,
        status,
        task_id: taskId !== "none" ? taskId : null,
        room_id: roomId !== "none" ? roomId : null,
        created_by_user_id: profile?.id ?? null,
        exclude_from_budget: false,
      });
      if (error) throw error;
      toast({ description: t("purchases.lineAdded", "Rad tillagd") });
      onAdded();
      onOpenChange(false);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      toast({ title: t("common.error", "Error"), description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("purchases.addLine", "Lägg till rad")}</DialogTitle>
          <DialogDescription>
            {defaultVendorName
              ? t("purchases.addLineDesc", "Ny rad i ordern från {{vendor}}.", { vendor: defaultVendorName })
              : t("purchases.addLineDescGeneric", "Ny rad i denna inköpsorder.")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="line-name">{t("purchases.itemName", "Artikel")}*</Label>
            <Input
              id="line-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("purchases.itemPlaceholder", "T.ex. Spik 50mm")}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-[1fr_80px] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="line-qty">{t("common.quantity", "Antal")}*</Label>
              <Input
                id="line-qty"
                type="number"
                step="0.01"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="line-unit">{t("common.unit", "Enhet")}</Label>
              <Input
                id="line-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="st"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="line-price">{t("purchases.pricePerUnit", "Á-pris")} ({t("common.optional", "valfritt")})</Label>
            <Input
              id="line-price"
              type="number"
              step="0.01"
              value={pricePerUnit}
              onChange={(e) => setPricePerUnit(e.target.value)}
              placeholder="0.00"
            />
            {totalPreview > 0 && (
              <p className="text-xs text-muted-foreground">
                {t("purchases.totalPreview", "Summa")}: {formatCurrency(totalPreview, currency)}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="line-status">{t("common.status", "Status")}</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="line-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["submitted", "to_order", "ordered", "approved", "billed", "paid", "paused", "declined"].map((s) => (
                    <SelectItem key={s} value={s}>{t(`materialStatuses.${s}`, s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {tasks.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="line-task">{t("purchases.linkedTask", "Koppla till task")}</Label>
                <Select value={taskId} onValueChange={setTaskId}>
                  <SelectTrigger id="line-task">
                    <SelectValue placeholder={t("purchases.unallocated", "Oallokerat")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("purchases.unallocated", "Oallokerat")}</SelectItem>
                    {tasks.map((task) => (
                      <SelectItem key={task.id} value={task.id}>{task.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {rooms.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="line-room">{t("purchases.linkedRoom", "Koppla till rum")}</Label>
              <Select value={roomId} onValueChange={setRoomId}>
                <SelectTrigger id="line-room">
                  <SelectValue placeholder={t("purchases.noRoom", "Inget rum")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("purchases.noRoom", "Inget rum")}</SelectItem>
                  {rooms.map((room) => (
                    <SelectItem key={room.id} value={room.id}>{room.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("common.cancel", "Avbryt")}
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {t("common.add", "Lägg till")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

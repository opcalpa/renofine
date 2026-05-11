import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

interface PurchaseOrder {
  id: string;
  vendor_name: string;
  total: number;
  status: string;
  ordered_at: string | null;
  delivered_at: string | null;
  notes: string | null;
}

interface EditPurchaseOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchaseOrder: PurchaseOrder | null;
  currency?: string | null;
  onSaved: () => void;
}

export const EditPurchaseOrderDialog = ({
  open,
  onOpenChange,
  purchaseOrder,
  onSaved,
}: EditPurchaseOrderDialogProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [vendor, setVendor] = useState("");
  const [total, setTotal] = useState("");
  const [status, setStatus] = useState<string>("pending");
  const [orderedAt, setOrderedAt] = useState("");
  const [deliveredAt, setDeliveredAt] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!purchaseOrder) return;
    setVendor(purchaseOrder.vendor_name ?? "");
    setTotal(purchaseOrder.total != null ? String(purchaseOrder.total) : "");
    setStatus(purchaseOrder.status ?? "pending");
    setOrderedAt(purchaseOrder.ordered_at ? purchaseOrder.ordered_at.slice(0, 10) : "");
    setDeliveredAt(purchaseOrder.delivered_at ? purchaseOrder.delivered_at.slice(0, 10) : "");
    setNotes(purchaseOrder.notes ?? "");
  }, [purchaseOrder]);

  const handleSave = async () => {
    if (!purchaseOrder) return;
    setSaving(true);
    try {
      const parsedTotal = total.trim() === "" ? 0 : parseFloat(total);
      const { error } = await supabase
        .from("purchase_orders")
        .update({
          vendor_name: vendor.trim() || "Okänd leverantör",
          total: isNaN(parsedTotal) ? 0 : parsedTotal,
          status,
          ordered_at: orderedAt ? orderedAt : null,
          delivered_at: deliveredAt ? deliveredAt : null,
          notes: notes.trim() || null,
        })
        .eq("id", purchaseOrder.id);
      if (error) throw error;
      toast({ description: t("purchases.poUpdated", "Inköpsorder uppdaterad") });
      onSaved();
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("purchases.editPO", "Redigera inköpsorder")}</DialogTitle>
          <DialogDescription>
            {t("purchases.editPODesc", "Uppdatera leverantör, totalsumma, status och datum.")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="po-vendor">{t("purchases.vendor", "Leverantör")}*</Label>
            <Input id="po-vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="po-total">{t("purchases.total", "Totalsumma")}</Label>
              <Input
                id="po-total"
                type="number"
                step="0.01"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-status">{t("common.status", "Status")}</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="po-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">{t("purchaseOrderStatus.pending", "Väntar")}</SelectItem>
                  <SelectItem value="ordered">{t("purchaseOrderStatus.ordered", "Beställd")}</SelectItem>
                  <SelectItem value="delivered">{t("purchaseOrderStatus.delivered", "Levererad")}</SelectItem>
                  <SelectItem value="cancelled">{t("purchaseOrderStatus.cancelled", "Avbruten")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="po-ordered-at">{t("purchases.orderedAt", "Beställd datum")}</Label>
              <Input
                id="po-ordered-at"
                type="date"
                value={orderedAt}
                onChange={(e) => setOrderedAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-delivered-at">{t("purchases.deliveredAt", "Levererad datum")}</Label>
              <Input
                id="po-delivered-at"
                type="date"
                value={deliveredAt}
                onChange={(e) => setDeliveredAt(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="po-notes">{t("purchases.notes", "Anteckningar")}</Label>
            <Textarea
              id="po-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder={t("purchases.notesPlaceholder", "Valfri anteckning...")}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("common.cancel", "Avbryt")}
          </Button>
          <Button onClick={handleSave} disabled={saving || !vendor.trim()}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {t("common.save", "Spara")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

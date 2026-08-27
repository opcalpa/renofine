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
import { purchaseVatFields, vatFromGross, type VatRate } from "@/lib/vat";

interface PurchaseOrder {
  id: string;
  vendor_name: string;
  total: number;
  status: string;
  ordered_at: string | null;
  delivered_at: string | null;
  notes: string | null;
  vat_amount?: number | null;
  net_amount?: number | null;
  vat_rate?: number | null;
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
  const [vat, setVat] = useState("");

  useEffect(() => {
    if (!purchaseOrder) return;
    setVendor(purchaseOrder.vendor_name ?? "");
    setTotal(purchaseOrder.total != null ? String(purchaseOrder.total) : "");
    setStatus(purchaseOrder.status ?? "pending");
    setOrderedAt(purchaseOrder.ordered_at ? purchaseOrder.ordered_at.slice(0, 10) : "");
    setDeliveredAt(purchaseOrder.delivered_at ? purchaseOrder.delivered_at.slice(0, 10) : "");
    setNotes(purchaseOrder.notes ?? "");
    setVat(purchaseOrder.vat_amount != null ? String(purchaseOrder.vat_amount) : "");
  }, [purchaseOrder]);

  // Momsen räknas EN gång här och sparas — aldrig `total * 0.25` vid visning.
  // Tomt fält betyder "vet ej" och nollar kolumnerna; det är en annan sak än 0 kr.
  const parsedTotalNum = parseFloat(total);
  const parsedVatNum = parseFloat(vat);
  const vatPreview = purchaseVatFields(
    Number.isFinite(parsedTotalNum) ? parsedTotalNum : 0,
    Number.isFinite(parsedVatNum) ? parsedVatNum : null,
  );
  const applyRate = (rate: VatRate) => {
    if (!Number.isFinite(parsedTotalNum) || parsedTotalNum <= 0) return;
    setVat(String(vatFromGross(parsedTotalNum, rate)));
  };

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
          vat_amount: vatPreview.vat_amount,
          net_amount: vatPreview.net_amount,
          vat_rate: vatPreview.vat_rate,
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

          <div className="space-y-1.5">
            <Label htmlFor="po-vat">{t("purchases.vatAmount", "Moms")}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="po-vat"
                type="number"
                step="0.01"
                value={vat}
                onChange={(e) => setVat(e.target.value)}
                placeholder={t("purchases.vatUnknown", "Okänd")}
              />
              <div className="flex gap-1">
                {([25, 12, 6, 0] as VatRate[]).map((rate) => (
                  <Button
                    key={rate}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => applyRate(rate)}
                  >
                    {rate}%
                  </Button>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {vatPreview.vat_amount == null
                ? t("purchases.vatEmptyHint", "Lämna tomt om momsen inte är känd — den syns då som ej utläst.")
                : vatPreview.vat_rate != null
                  ? t("purchases.vatNetHintRate", {
                      defaultValue: "Momsunderlag {{net}} kr · {{rate}} %",
                      net: vatPreview.net_amount,
                      rate: vatPreview.vat_rate,
                    })
                  : t("purchases.vatNetHint", {
                      defaultValue: "Momsunderlag {{net}} kr",
                      net: vatPreview.net_amount,
                    })}
            </p>
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

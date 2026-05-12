import { useState } from "react";
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
import { Loader2, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";

interface NewPurchaseOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  currency?: string | null;
  tasks: { id: string; title: string }[];
  rooms: { id: string; name: string }[];
  onCreated: () => void;
}

interface DraftLine {
  key: number;
  name: string;
  quantity: string;
  unit: string;
  pricePerUnit: string;
  url: string;
}

const newDraftLine = (key: number): DraftLine => ({
  key,
  name: "",
  quantity: "1",
  unit: "st",
  pricePerUnit: "",
  url: "",
});

export const NewPurchaseOrderDialog = ({
  open,
  onOpenChange,
  projectId,
  currency,
  tasks,
  rooms,
  onCreated,
}: NewPurchaseOrderDialogProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [vendor, setVendor] = useState("");
  const [orderedAt, setOrderedAt] = useState<string>(new Date().toISOString().slice(0, 10));
  const [poStatus, setPoStatus] = useState<"pending" | "ordered" | "delivered">("ordered");
  const [taskId, setTaskId] = useState<string>("none");
  const [roomId, setRoomId] = useState<string>("none");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([newDraftLine(0)]);
  const [keyCounter, setKeyCounter] = useState(1);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const resetForm = () => {
    setVendor("");
    setOrderedAt(new Date().toISOString().slice(0, 10));
    setPoStatus("ordered");
    setTaskId("none");
    setRoomId("none");
    setNotes("");
    setLines([newDraftLine(0)]);
    setKeyCounter(1);
    setShowAdvanced(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetForm();
    onOpenChange(next);
  };

  const updateLine = (key: number, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const addLine = () => {
    setLines((prev) => [...prev, newDraftLine(keyCounter)]);
    setKeyCounter((k) => k + 1);
  };

  const removeLine = (key: number) => {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.key !== key)));
  };

  const totalPreview = lines.reduce((sum, l) => {
    const q = parseFloat(l.quantity) || 0;
    const p = parseFloat(l.pricePerUnit) || 0;
    return sum + q * p;
  }, 0);

  const validLines = lines.filter((l) => l.name.trim().length > 0);

  // Material status derived from PO status: pending → to_order, ordered → ordered, delivered → ordered (lines are typically ordered when delivered)
  const materialStatus = poStatus === "pending" ? "to_order" : "ordered";

  const handleSave = async () => {
    if (!vendor.trim()) {
      toast({ description: t("purchases.vendorRequired", "Leverantör krävs"), variant: "destructive" });
      return;
    }
    if (validLines.length === 0) {
      toast({ description: t("purchases.atLeastOneLine", "Minst en rad med namn krävs"), variant: "destructive" });
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

      // 1. Create the PO
      const { data: po, error: poErr } = await supabase
        .from("purchase_orders")
        .insert({
          project_id: projectId,
          vendor_name: vendor.trim(),
          total: totalPreview,
          status: poStatus,
          ordered_at: poStatus !== "pending" ? orderedAt : null,
          delivered_at: poStatus === "delivered" ? orderedAt : null,
          source: "manual",
          notes: notes.trim() || null,
          created_by_user_id: profile?.id ?? null,
        })
        .select("id")
        .single();
      if (poErr) throw poErr;

      // 2. Insert lines
      const lineInserts = validLines.map((l) => {
        const q = parseFloat(l.quantity) || null;
        const p = parseFloat(l.pricePerUnit) || null;
        return {
          project_id: projectId,
          purchase_order_id: po.id,
          name: l.name.trim(),
          quantity: q,
          unit: l.unit.trim() || "st",
          price_per_unit: p,
          vendor_name: vendor.trim(),
          vendor_link: l.url.trim() || null,
          status: materialStatus,
          task_id: taskId !== "none" ? taskId : null,
          room_id: roomId !== "none" ? roomId : null,
          created_by_user_id: profile?.id ?? null,
          exclude_from_budget: false,
        };
      });
      const { error: lineErr } = await supabase.from("materials").insert(lineInserts);
      if (lineErr) throw lineErr;

      toast({
        description: t("purchases.orderCreated", "Beställning skapad ({{count}} rader)", { count: validLines.length }),
      });
      onCreated();
      handleOpenChange(false);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      toast({ title: t("common.error", "Error"), description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("purchases.createOrder", "Skapa beställning")}</DialogTitle>
          <DialogDescription>
            {t("purchases.createOrderDesc", "Lägg in en beställning som ska göras eller redan är beställd. Pris är valfritt — antalet räcker.")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className={showAdvanced ? "grid grid-cols-[1fr_140px_160px] gap-3" : ""}>
            <div className="space-y-1.5">
              <Label htmlFor="po-vendor">{t("purchases.vendor", "Leverantör")}*</Label>
              <Input
                id="po-vendor"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder={t("purchases.vendorPlaceholder", "T.ex. Bauhaus")}
                autoFocus
              />
            </div>
            {showAdvanced && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="po-date">{t("purchases.orderedAt", "Datum")}</Label>
                  <Input
                    id="po-date"
                    type="date"
                    value={orderedAt}
                    onChange={(e) => setOrderedAt(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="po-status">{t("common.status", "Status")}</Label>
                  <Select value={poStatus} onValueChange={(v) => setPoStatus(v as "pending" | "ordered" | "delivered")}>
                    <SelectTrigger id="po-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">{t("purchaseOrderStatus.pending", "Att beställa")}</SelectItem>
                      <SelectItem value="ordered">{t("purchaseOrderStatus.ordered", "Beställd")}</SelectItem>
                      <SelectItem value="delivered">{t("purchaseOrderStatus.delivered", "Levererad")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>{t("purchases.lines", "Rader")}</Label>
            <div className="space-y-2 border rounded-md p-2 bg-muted/20 max-h-[320px] overflow-y-auto">
              {lines.map((line, idx) => (
                <div key={line.key} className="space-y-1.5 rounded border border-border/40 bg-card/40 p-2">
                  <div className="grid grid-cols-[1fr_72px_64px_100px_28px] gap-2 items-center">
                    <Input
                      placeholder={idx === 0 ? t("purchases.itemPlaceholder", "T.ex. Spik 50mm") : t("purchases.itemPlaceholderRow", "Artikel")}
                      value={line.name}
                      onChange={(e) => updateLine(line.key, { name: e.target.value })}
                      className="h-8 text-sm"
                    />
                    <Input
                      type="number"
                      step="0.01"
                      placeholder={t("common.quantity", "Antal")}
                      value={line.quantity}
                      onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                      className="h-8 text-sm"
                    />
                    <Input
                      placeholder={t("common.unit", "st")}
                      value={line.unit}
                      onChange={(e) => updateLine(line.key, { unit: e.target.value })}
                      className="h-8 text-sm"
                    />
                    <Input
                      type="number"
                      step="0.01"
                      placeholder={t("purchases.pricePerUnit", "Á-pris")}
                      value={line.pricePerUnit}
                      onChange={(e) => updateLine(line.key, { pricePerUnit: e.target.value })}
                      className="h-8 text-sm text-right"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removeLine(line.key)}
                      disabled={lines.length === 1}
                      title={t("common.remove", "Ta bort")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <Input
                    type="url"
                    placeholder={t("purchases.productUrlPlaceholder", "Länk till produkt (valfri)")}
                    value={line.url}
                    onChange={(e) => updateLine(line.key, { url: e.target.value })}
                    className="h-7 text-xs text-muted-foreground"
                  />
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={addLine}
              >
                <Plus className="h-3 w-3 mr-1" />
                {t("purchases.addLine", "Lägg till rad")}
              </Button>
            </div>
            <div className="text-xs text-muted-foreground tabular-nums text-right">
              {t("purchases.totalPreview", "Summa")}: <span className="font-medium text-foreground">{formatCurrency(totalPreview, currency)}</span>
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground -mt-1"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
            {showAdvanced ? t("purchases.showLessDetails", "Visa mindre") : t("purchases.showMoreDetails", "Visa fler alternativ (datum, task, anteckning…)")}
          </Button>

          {showAdvanced && (
            <>
              <div className="grid grid-cols-2 gap-3">
                {tasks.length > 0 && (
                  <div className="space-y-1.5">
                    <Label htmlFor="po-task">{t("purchases.linkedTask", "Koppla till task")}</Label>
                    <Select value={taskId} onValueChange={setTaskId}>
                      <SelectTrigger id="po-task">
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
                {rooms.length > 0 && (
                  <div className="space-y-1.5">
                    <Label htmlFor="po-room">{t("purchases.linkedRoom", "Koppla till rum")}</Label>
                    <Select value={roomId} onValueChange={setRoomId}>
                      <SelectTrigger id="po-room">
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

              <div className="space-y-1.5">
                <Label htmlFor="po-notes">{t("purchases.notes", "Anteckning")} ({t("common.optional", "valfritt")})</Label>
                <Input
                  id="po-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t("purchases.notesPlaceholder", "T.ex. Hämtas av Anna fredag")}
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
            {t("common.cancel", "Avbryt")}
          </Button>
          <Button onClick={handleSave} disabled={saving || !vendor.trim() || validLines.length === 0}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {t("purchases.createOrder", "Skapa beställning")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

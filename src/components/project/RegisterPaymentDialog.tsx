/**
 * RegisterPaymentDialog — register customer payment on an invoice.
 * Lists unpaid/partially paid invoices and lets the user record
 * a payment amount + date.
 */

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/currency";
import { Loader2, Receipt, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatLocalDate } from "@/lib/dateUtils";

interface Invoice {
  id: string;
  title: string;
  invoice_number: string | null;
  total_amount: number;
  paid_amount: number;
  due_date: string | null;
  status: string;
}

interface RegisterPaymentDialogProps {
  projectId: string;
  currency?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function RegisterPaymentDialog({
  projectId,
  currency = "SEK",
  open,
  onOpenChange,
  onSuccess,
}: RegisterPaymentDialogProps) {
  const { t } = useTranslation();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => formatLocalDate(new Date()));

  useEffect(() => {
    if (!open) return;
    setSelectedId(null);
    setAmount("");
    setPaymentDate(formatLocalDate(new Date()));

    async function fetchInvoices() {
      setLoading(true);
      const { data } = await supabase
        .from("invoices")
        .select("id, title, invoice_number, total_amount, paid_amount, due_date, status")
        .eq("project_id", projectId)
        .in("status", ["sent", "partially_paid"])
        .order("due_date", { ascending: true });

      setInvoices(data || []);
      setLoading(false);
    }

    fetchInvoices();
  }, [open, projectId]);

  const selected = invoices.find((i) => i.id === selectedId);
  const remaining = selected ? (selected.total_amount || 0) - (selected.paid_amount || 0) : 0;
  const parsedAmount = parseFloat(amount) || 0;

  const handleSave = async () => {
    if (!selected || parsedAmount <= 0) return;
    setSaving(true);

    const newPaidAmount = (selected.paid_amount || 0) + parsedAmount;
    const fullyPaid = newPaidAmount >= (selected.total_amount || 0);

    const { error } = await supabase
      .from("invoices")
      .update({
        paid_amount: newPaidAmount,
        status: fullyPaid ? "paid" : "partially_paid",
        paid_at: fullyPaid ? new Date().toISOString() : null,
      })
      .eq("id", selected.id);

    setSaving(false);

    if (error) {
      console.error("Error registering payment:", error);
      toast.error(t("payments.error", "Kunde inte registrera betalning"));
      return;
    }

    toast.success(
      fullyPaid
        ? t("payments.fullyPaid", "Faktura markerad som betald")
        : t("payments.partiallyPaid", "Delbetalning registrerad")
    );
    onOpenChange(false);
    onSuccess?.();
  };

  const isOverdue = (inv: Invoice) => {
    if (!inv.due_date) return false;
    return new Date(inv.due_date) < new Date();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("payments.title", "Registrera inbetalning")}</DialogTitle>
          <DialogDescription>
            {t("payments.description", "Välj en faktura och ange betalat belopp.")}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            <Receipt className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
            {t("payments.noInvoices", "Inga obetalda fakturor")}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Invoice list */}
            <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
              {invoices.map((inv) => {
                const invRemaining = (inv.total_amount || 0) - (inv.paid_amount || 0);
                const overdue = isOverdue(inv);
                return (
                  <button
                    key={inv.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(inv.id);
                      setAmount(String(invRemaining));
                    }}
                    className={cn(
                      "w-full text-left rounded-lg border p-3 transition-colors",
                      selectedId === inv.id
                        ? "border-primary bg-primary/5"
                        : "border-border/60 hover:border-border"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{inv.title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {inv.invoice_number || "—"}
                          {inv.due_date && (
                            <span className={overdue ? " text-destructive font-medium" : ""}>
                              {" · "}{overdue ? t("payments.overdue", "Förfallen") : t("payments.due", "Förfaller")} {inv.due_date}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-mono tnum">{formatCurrency(invRemaining, currency)}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {t("payments.of", "av")} {formatCurrency(inv.total_amount, currency)}
                        </div>
                      </div>
                    </div>
                    {selectedId === inv.id && <Check className="absolute right-3 top-3 h-4 w-4 text-primary" />}
                  </button>
                );
              })}
            </div>

            {/* Payment form — shown when invoice selected */}
            {selected && (
              <div className="space-y-3 pt-2 border-t">
                <div>
                  <Label className="text-xs">{t("payments.amount", "Belopp")}</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      min={0}
                      max={remaining}
                      step={100}
                      className="font-mono"
                    />
                    <span className="text-xs text-muted-foreground shrink-0">{currency}</span>
                  </div>
                  {parsedAmount > 0 && parsedAmount < remaining && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {t("payments.partialNote", "Delbetalning — {{remaining}} kvar efter", {
                        remaining: formatCurrency(remaining - parsedAmount, currency),
                      })}
                    </p>
                  )}
                </div>
                <div>
                  <Label className="text-xs">{t("payments.date", "Betalningsdatum")}</Label>
                  <Input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleSave}
            disabled={!selected || parsedAmount <= 0 || saving}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            {t("payments.register", "Registrera")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

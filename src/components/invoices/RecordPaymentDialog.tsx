import { useEffect, useState } from "react";
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
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { recordPayment } from "@/services/invoiceService";
import { formatLocalDate } from "@/lib/dateUtils";

interface RecordPaymentDialogProps {
  invoiceId: string;
  totalAmount: number;
  paidAmount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  markAsPaid?: boolean;
}

export function RecordPaymentDialog({
  invoiceId,
  totalAmount,
  paidAmount,
  open,
  onOpenChange,
  onSuccess,
  markAsPaid,
}: RecordPaymentDialogProps) {
  const { t } = useTranslation();
  const remaining = totalAmount - paidAmount;
  const [amount, setAmount] = useState(remaining.toString());
  const [paymentDate, setPaymentDate] = useState(
    formatLocalDate(new Date())
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const rem = totalAmount - paidAmount;
      setAmount(markAsPaid ? rem.toString() : rem.toString());
      setPaymentDate(formatLocalDate(new Date()));
    }
  }, [open, totalAmount, paidAmount, markAsPaid]);

  const fmt = (n: number) =>
    n.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) return;

    setSaving(true);
    try {
      const result = await recordPayment(invoiceId, numAmount, paymentDate);
      if (result) {
        toast.success(t("invoices.paymentRecorded"));
        onOpenChange(false);
        onSuccess();
      }
    } finally {
      setSaving(false);
    }
  };

  const title = markAsPaid
    ? t("invoices.markAsPaid", "Mark as paid")
    : t("invoices.recordPaymentTitle");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {t("invoices.recordPaymentDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="text-center p-3 rounded-lg bg-muted">
                <p className="text-muted-foreground">{t("invoices.totalAmount")}</p>
                <p className="font-semibold">{fmt(totalAmount)} kr</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-900/20">
                <p className="text-muted-foreground">{t("invoices.paidAmount")}</p>
                <p className="font-semibold text-green-600">{fmt(paidAmount)} kr</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20">
                <p className="text-muted-foreground">{t("invoices.remainingAmount")}</p>
                <p className="font-semibold text-amber-600">{fmt(remaining)} kr</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment-amount">{t("invoices.paymentAmount")}</Label>
              <Input
                id="payment-amount"
                type="number"
                required
                min={0.01}
                max={remaining}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="min-h-[48px]"
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment-date">{t("invoices.paymentDate")}</Label>
              <Input
                id="payment-date"
                type="date"
                required
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="min-h-[48px]"
                disabled={saving}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={saving || !parseFloat(amount) || parseFloat(amount) <= 0}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : null}
              {markAsPaid
                ? t("invoices.markAsPaid", "Mark as paid")
                : t("invoices.recordPayment")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

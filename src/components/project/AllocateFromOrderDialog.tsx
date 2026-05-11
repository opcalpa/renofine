import { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/currency";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ShoppingCart, Loader2, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStatusBadgeColor } from "@/lib/statusColors";

interface AllocateFromOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  taskId: string;
  currency?: string | null;
  onAllocated: () => void;
}

interface UnallocatedLine {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  price_total: number | null;
  vendor_name: string | null;
  purchase_order_id: string;
}

interface POGroup {
  poId: string;
  vendor: string;
  status: string;
  lines: UnallocatedLine[];
  total: number;
}

export const AllocateFromOrderDialog = ({
  open,
  onOpenChange,
  projectId,
  taskId,
  currency,
  onAllocated,
}: AllocateFromOrderDialogProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [allocating, setAllocating] = useState(false);
  const [lines, setLines] = useState<UnallocatedLine[]>([]);
  const [poMeta, setPoMeta] = useState<Map<string, { vendor: string; status: string }>>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    fetchUnallocated();
  }, [open, projectId]);

  const fetchUnallocated = async () => {
    setLoading(true);
    try {
      // Materials with no task allocation but linked to a PO
      const { data: matsData, error: matsErr } = await supabase
        .from("materials")
        .select("id, name, quantity, unit, price_total, vendor_name, purchase_order_id")
        .eq("project_id", projectId)
        .is("task_id", null)
        .not("purchase_order_id", "is", null)
        .eq("exclude_from_budget", false)
        .order("created_at", { ascending: true });

      if (matsErr) throw matsErr;

      const rows = (matsData || []).filter((m): m is UnallocatedLine & { purchase_order_id: string } =>
        m.purchase_order_id !== null
      );
      setLines(rows as UnallocatedLine[]);

      // Fetch PO info for header
      const poIds = Array.from(new Set(rows.map((l) => l.purchase_order_id)));
      if (poIds.length > 0) {
        const { data: pos } = await supabase
          .from("purchase_orders")
          .select("id, vendor_name, status")
          .in("id", poIds);
        const map = new Map<string, { vendor: string; status: string }>();
        for (const po of pos || []) {
          map.set(po.id, { vendor: po.vendor_name, status: po.status });
        }
        setPoMeta(map);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      toast({ title: t('common.error', 'Error'), description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const groups: POGroup[] = useMemo(() => {
    const byPo = new Map<string, UnallocatedLine[]>();
    for (const l of lines) {
      if (!byPo.has(l.purchase_order_id)) byPo.set(l.purchase_order_id, []);
      byPo.get(l.purchase_order_id)!.push(l);
    }
    const result: POGroup[] = [];
    for (const [poId, poLines] of byPo) {
      const meta = poMeta.get(poId);
      result.push({
        poId,
        vendor: meta?.vendor ?? t('purchases.unknownVendor', 'Okänd leverantör'),
        status: meta?.status ?? "pending",
        lines: poLines,
        total: poLines.reduce((sum, l) => sum + (l.price_total ?? 0), 0),
      });
    }
    return result.sort((a, b) => a.vendor.localeCompare(b.vendor));
  }, [lines, poMeta, t]);

  const toggleLine = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGroup = (group: POGroup) => {
    const ids = group.lines.map((l) => l.id);
    const allSelected = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const id of ids) next.delete(id);
      } else {
        for (const id of ids) next.add(id);
      }
      return next;
    });
  };

  const selectedTotal = useMemo(
    () => lines.filter((l) => selected.has(l.id)).reduce((sum, l) => sum + (l.price_total ?? 0), 0),
    [lines, selected]
  );

  const handleAllocate = async () => {
    if (selected.size === 0) return;
    setAllocating(true);
    try {
      const { error } = await supabase
        .from("materials")
        .update({ task_id: taskId })
        .in("id", Array.from(selected));
      if (error) throw error;
      toast({
        title: t('purchases.allocated', 'Allokerat'),
        description: t('purchases.allocatedCount', '{{count}} rader allokerade till denna task', { count: selected.size }),
      });
      onAllocated();
      onOpenChange(false);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      toast({ title: t('common.error', 'Error'), description: msg, variant: "destructive" });
    } finally {
      setAllocating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('purchases.allocateFromOrder', 'Lägg till från befintlig order')}</DialogTitle>
          <DialogDescription>
            {t('purchases.allocateFromOrderDesc', 'Välj oallokerade rader från projektets inköpsordrar att koppla till denna task.')}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : groups.length === 0 ? (
          <div className="py-8 flex flex-col items-center justify-center text-center gap-2 text-muted-foreground">
            <Inbox className="h-8 w-8" />
            <p className="text-sm">{t('purchases.noUnallocated', 'Inga oallokerade rader i projektet.')}</p>
          </div>
        ) : (
          <ScrollArea className="h-[420px] pr-3">
            <div className="space-y-3">
              {groups.map((group) => {
                const allSelected = group.lines.every((l) => selected.has(l.id));
                const someSelected = group.lines.some((l) => selected.has(l.id));
                return (
                  <div key={group.poId} className="border rounded-lg">
                    <button
                      type="button"
                      className="w-full px-3 py-2 flex items-center gap-2 bg-slate-50/60 border-b hover:bg-slate-100 transition-colors text-left"
                      onClick={() => toggleGroup(group)}
                    >
                      <Checkbox
                        checked={allSelected ? true : someSelected ? "indeterminate" : false}
                        onCheckedChange={() => toggleGroup(group)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <ShoppingCart className="h-3.5 w-3.5 text-slate-500" />
                      <span className="font-medium text-sm text-slate-700">{group.vendor}</span>
                      <Badge variant="secondary" className="text-[10px]">{group.lines.length} {t('budget.lineItems', 'rader')}</Badge>
                      <Badge className={cn("border text-[10px]", getStatusBadgeColor(group.status))}>
                        {t(`materialStatuses.${group.status}`, group.status)}
                      </Badge>
                      <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                        {formatCurrency(group.total, currency)}
                      </span>
                    </button>
                    <div className="divide-y">
                      {group.lines.map((line) => (
                        <label
                          key={line.id}
                          className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted/30 cursor-pointer"
                        >
                          <Checkbox
                            checked={selected.has(line.id)}
                            onCheckedChange={() => toggleLine(line.id)}
                          />
                          <span className="flex-1 truncate">{line.name}</span>
                          {line.quantity != null && (
                            <span className="text-muted-foreground tabular-nums">
                              {line.quantity} {line.unit ?? ""}
                            </span>
                          )}
                          <span className="tabular-nums font-medium w-20 text-right">
                            {line.price_total != null ? formatCurrency(line.price_total, currency) : "–"}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <div className="text-xs text-muted-foreground">
            {selected.size > 0 && (
              <>
                {t('purchases.selectedCount', '{{count}} rader valda', { count: selected.size })}
                {" · "}
                <span className="font-medium tabular-nums">{formatCurrency(selectedTotal, currency)}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={allocating}>
              {t('common.cancel', 'Avbryt')}
            </Button>
            <Button onClick={handleAllocate} disabled={selected.size === 0 || allocating}>
              {allocating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t('purchases.allocateToTask', 'Allokera till denna task')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

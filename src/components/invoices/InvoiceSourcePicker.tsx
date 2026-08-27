/**
 * InvoiceSourcePicker — "Hämta från projektet".
 *
 * Det ett byggföretag faktiskt fakturerar är godkända timmar, inköpt material
 * och den ÄTA kunden sagt ja till. Innan detta kunde en faktura bara komma från
 * en offert, vilket gjorde tidrapporteringen i fält till en återvändsgränd.
 *
 * Panelen visar bara sådant som INTE redan sitter på en fakturarad, och
 * databasen har dessutom ett unikt index per källa. Dubbelfakturering är den
 * felriktning som kostar förtroende, så den spärras på båda ställena.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Clock, Package, FilePlus2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatCurrency } from "@/lib/currency";
import { toast } from "sonner";
import {
  fetchInvoiceSources,
  type InvoiceSourceCandidate,
  type InvoiceSourceKind,
} from "@/services/invoiceSourcesService";

interface InvoiceSourcePickerProps {
  projectId: string;
  currency?: string | null;
  onAdd: (picked: InvoiceSourceCandidate[]) => void;
}

const KIND_ORDER: InvoiceSourceKind[] = ["hours", "ata", "material"];

const KIND_ICON: Record<InvoiceSourceKind, typeof Clock> = {
  hours: Clock,
  ata: FilePlus2,
  material: Package,
};

export function InvoiceSourcePicker({ projectId, currency, onAdd }: InvoiceSourcePickerProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<InvoiceSourceCandidate[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId || loadedFor === projectId) return;
    let cancelled = false;
    setLoading(true);
    fetchInvoiceSources(projectId)
      .then((rows) => {
        if (cancelled) return;
        setCandidates(rows);
        setPicked(new Set());
        setLoadedFor(projectId);
      })
      .catch((err) => {
        console.error("Failed to load invoice sources:", err);
        toast.error(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, loadedFor]);

  const grouped = useMemo(() => {
    const map = new Map<InvoiceSourceKind, InvoiceSourceCandidate[]>();
    for (const kind of KIND_ORDER) map.set(kind, []);
    for (const c of candidates) map.get(c.kind)?.push(c);
    return map;
  }, [candidates]);

  const pickedTotal = useMemo(
    () => candidates.filter((c) => picked.has(c.sourceId)).reduce((s, c) => s + c.total, 0),
    [candidates, picked],
  );

  const toggle = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleKind = (kind: InvoiceSourceKind) => {
    const rows = grouped.get(kind) ?? [];
    const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.sourceId));
    setPicked((prev) => {
      const next = new Set(prev);
      for (const r of rows) {
        if (allPicked) next.delete(r.sourceId);
        else next.add(r.sourceId);
      }
      return next;
    });
  };

  const handleAdd = () => {
    const rows = candidates.filter((c) => picked.has(c.sourceId));
    if (rows.length === 0) return;
    onAdd(rows);
    // Det tillagda försvinner ur listan så att det inte går att lägga till igen
    // i samma pass — spärren finns även i databasen, men den ska inte behöva slå till.
    setCandidates((prev) => prev.filter((c) => !picked.has(c.sourceId)));
    setPicked(new Set());
  };

  if (!projectId) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border p-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("invoiceSources.loading", "Hämtar underlag från projektet…")}
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <div className="rounded-lg border p-3 text-sm text-muted-foreground">
        {t(
          "invoiceSources.empty",
          "Inget ofakturerat underlag i projektet — godkända timmar, inköp och godkända ÄTA dyker upp här.",
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <div className="border-b px-3 py-2">
        <p className="text-sm font-medium">{t("invoiceSources.title", "Hämta från projektet")}</p>
        <p className="text-xs text-muted-foreground">
          {t(
            "invoiceSources.hint",
            "Godkända timmar, inköpt material och ÄTA kunden godkänt. Det som redan fakturerats visas inte.",
          )}
        </p>
      </div>

      <div className="max-h-72 overflow-y-auto">
        {KIND_ORDER.map((kind) => {
          const rows = grouped.get(kind) ?? [];
          if (rows.length === 0) return null;
          const Icon = KIND_ICON[kind];
          const allPicked = rows.every((r) => picked.has(r.sourceId));
          return (
            <div key={kind} className="border-b last:border-b-0">
              <button
                type="button"
                onClick={() => toggleKind(kind)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground hover:bg-muted/50"
              >
                <Icon className="h-3.5 w-3.5" />
                {t(`invoiceSources.kind.${kind}`)}
                <span className="ml-auto font-normal normal-case">
                  {allPicked
                    ? t("invoiceSources.deselectAll", "Avmarkera alla")
                    : t("invoiceSources.selectAll", "Välj alla")}
                </span>
              </button>
              {rows.map((row) => (
                <label
                  key={row.sourceId}
                  className="flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-muted/40"
                >
                  <Checkbox
                    checked={picked.has(row.sourceId)}
                    onCheckedChange={() => toggle(row.sourceId)}
                    className="mt-0.5"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{row.description}</span>
                    <span className="block text-xs text-muted-foreground">
                      {row.quantity} {row.unit}
                      {row.date ? ` · ${row.date}` : ""}
                      {row.taskTitle && row.kind !== "ata" ? ` · ${row.taskTitle}` : ""}
                    </span>
                  </span>
                  <span className="whitespace-nowrap text-sm tabular-nums">
                    {formatCurrency(row.total, currency)}
                  </span>
                </label>
              ))}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 border-t px-3 py-2">
        <span className="text-xs text-muted-foreground">
          {t("invoiceSources.picked", {
            defaultValue: "{{count}} valda · {{amount}}",
            count: picked.size,
            amount: formatCurrency(pickedTotal, currency),
          })}
        </span>
        <Button size="sm" variant="outline" disabled={picked.size === 0} onClick={handleAdd}>
          {t("invoiceSources.add", "Lägg till på fakturan")}
        </Button>
      </div>
    </div>
  );
}

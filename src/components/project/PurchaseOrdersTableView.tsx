import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ColumnToggle } from "@/components/shared/ColumnToggle";
import { ChevronDown, ShoppingCart, Trash2, Pencil, Plus } from "lucide-react";
import { usePersistedPreference } from "@/hooks/usePersistedPreference";

interface PurchaseOrderRow {
  id: string;
  vendor_name: string;
  total: number;
  status: string;
  ordered_at: string | null;
  delivered_at: string | null;
  source: string | null;
  notes: string | null;
}

interface MaterialLine {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  price_total: number | null;
  task_id: string | null;
  room_id: string | null;
  task?: { id: string; title: string } | null;
}

type ColumnKey =
  | "vendor"
  | "status"
  | "total"
  | "lines"
  | "tasks"
  | "rooms"
  | "ordered_at"
  | "delivered_at"
  | "source"
  | "notes";

const ALL_COLUMNS: ColumnKey[] = ["vendor", "status", "total", "lines", "tasks", "rooms", "ordered_at", "delivered_at", "source", "notes"];
const DEFAULT_VISIBLE: ColumnKey[] = ["vendor", "status", "total", "lines", "tasks"];

interface PurchaseOrdersTableViewProps {
  projectId: string;
  purchaseOrders: PurchaseOrderRow[];
  materialsByPOId: Map<string, MaterialLine[]>;
  tasks: { id: string; title: string }[];
  rooms: { id: string; name: string }[];
  currency?: string | null;
  canEdit: boolean;
  onEditPO: (po: PurchaseOrderRow) => void;
  onDeletePO: (po: PurchaseOrderRow) => void;
  onAddLine: (po: PurchaseOrderRow) => void;
  onEditLine: (lineId: string) => void;
}

export const PurchaseOrdersTableView = ({
  projectId,
  purchaseOrders,
  materialsByPOId,
  tasks,
  rooms,
  currency,
  canEdit,
  onEditPO,
  onDeletePO,
  onAddLine,
  onEditLine,
}: PurchaseOrdersTableViewProps) => {
  const { t } = useTranslation();

  const [visibleColsArr, setVisibleColsArr] = usePersistedPreference<ColumnKey[]>(
    `po-table-cols-${projectId}`,
    DEFAULT_VISIBLE,
  );
  const visibleCols = useMemo(() => new Set(visibleColsArr), [visibleColsArr]);
  const [expandedPOIds, setExpandedPOIds] = useState<Set<string>>(new Set());

  const togglePO = (id: string) => {
    setExpandedPOIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const labels: Record<ColumnKey, string> = {
    vendor: t("purchases.vendor", "Leverantör"),
    status: t("common.status", "Status"),
    total: t("purchases.total", "Total"),
    lines: t("purchases.lines", "Rader"),
    tasks: t("purchases.tasks", "Tasks"),
    rooms: t("purchases.rooms", "Rum"),
    ordered_at: t("purchases.orderedAt", "Beställd"),
    delivered_at: t("purchases.deliveredAt", "Levererad"),
    source: t("purchases.source", "Källa"),
    notes: t("purchases.notes", "Anteckning"),
  };

  const taskMap = useMemo(() => new Map(tasks.map((t) => [t.id, t.title])), [tasks]);
  const roomMap = useMemo(() => new Map(rooms.map((r) => [r.id, r.name])), [rooms]);

  const statusColor = (status: string) =>
    status === "delivered" ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
    status === "ordered" ? "bg-amber-100 text-amber-700 border-amber-200" :
    status === "cancelled" ? "bg-red-100 text-red-700 border-red-200" :
    "bg-muted text-muted-foreground border-border";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end">
        <ColumnToggle
          columns={ALL_COLUMNS}
          labels={labels}
          visible={visibleCols}
          onChange={(v) => setVisibleColsArr(Array.from(v))}
        />
      </div>
      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted border-b text-left">
              <th className="px-2 py-2 w-6" />
              {visibleCols.has("vendor") && <th className="px-2 py-2 font-medium">{labels.vendor}</th>}
              {visibleCols.has("status") && <th className="px-2 py-2 font-medium">{labels.status}</th>}
              {visibleCols.has("total") && <th className="px-2 py-2 font-medium text-right">{labels.total}</th>}
              {visibleCols.has("lines") && <th className="px-2 py-2 font-medium text-right">{labels.lines}</th>}
              {visibleCols.has("tasks") && <th className="px-2 py-2 font-medium">{labels.tasks}</th>}
              {visibleCols.has("rooms") && <th className="px-2 py-2 font-medium">{labels.rooms}</th>}
              {visibleCols.has("ordered_at") && <th className="px-2 py-2 font-medium">{labels.ordered_at}</th>}
              {visibleCols.has("delivered_at") && <th className="px-2 py-2 font-medium">{labels.delivered_at}</th>}
              {visibleCols.has("source") && <th className="px-2 py-2 font-medium">{labels.source}</th>}
              {visibleCols.has("notes") && <th className="px-2 py-2 font-medium">{labels.notes}</th>}
              {canEdit && <th className="px-2 py-2 w-20" />}
            </tr>
          </thead>
          <tbody>
            {purchaseOrders.map((po) => {
              const rows = materialsByPOId.get(po.id) || [];
              const isExpanded = expandedPOIds.has(po.id);
              const taskIds = new Set(rows.map((r) => r.task_id).filter((id): id is string => !!id));
              const roomIds = new Set(rows.map((r) => r.room_id).filter((id): id is string => !!id));
              const tasksLabel = taskIds.size === 0
                ? <span className="text-muted-foreground">–</span>
                : taskIds.size === 1
                  ? <span>{taskMap.get(Array.from(taskIds)[0]) ?? "?"}</span>
                  : <span className="text-muted-foreground">{t("purchases.multipleTasks", "{{count}} tasks", { count: taskIds.size })}</span>;
              const roomsLabel = roomIds.size === 0
                ? <span className="text-muted-foreground">–</span>
                : roomIds.size === 1
                  ? <span>{roomMap.get(Array.from(roomIds)[0]) ?? "?"}</span>
                  : <span className="text-muted-foreground">{t("purchases.multipleRooms", "{{count}} rum", { count: roomIds.size })}</span>;
              return (
                <Row
                  key={po.id}
                  po={po}
                  rows={rows}
                  isExpanded={isExpanded}
                  togglePO={() => togglePO(po.id)}
                  visibleCols={visibleCols}
                  currency={currency}
                  statusColor={statusColor(po.status)}
                  tasksLabel={tasksLabel}
                  roomsLabel={roomsLabel}
                  canEdit={canEdit}
                  onEditPO={() => onEditPO(po)}
                  onDeletePO={() => onDeletePO(po)}
                  onAddLine={() => onAddLine(po)}
                  onEditLine={onEditLine}
                  taskMap={taskMap}
                />
              );
            })}
            {purchaseOrders.length === 0 && (
              <tr>
                <td colSpan={ALL_COLUMNS.length + 2} className="px-3 py-6 text-center text-muted-foreground italic">
                  {t("purchases.noOrders", "Inga inköpsordrar än.")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

interface RowProps {
  po: PurchaseOrderRow;
  rows: MaterialLine[];
  isExpanded: boolean;
  togglePO: () => void;
  visibleCols: Set<ColumnKey>;
  currency?: string | null;
  statusColor: string;
  tasksLabel: React.ReactNode;
  roomsLabel: React.ReactNode;
  canEdit: boolean;
  onEditPO: () => void;
  onDeletePO: () => void;
  onAddLine: () => void;
  onEditLine: (lineId: string) => void;
  taskMap: Map<string, string>;
}

const Row = ({
  po, rows, isExpanded, togglePO, visibleCols, currency, statusColor,
  tasksLabel, roomsLabel, canEdit, onEditPO, onDeletePO, onAddLine, onEditLine, taskMap,
}: RowProps) => {
  const { t } = useTranslation();
  const visibleColCount = visibleCols.size + 1 + (canEdit ? 1 : 0);

  return (
    <>
      <tr className="border-b hover:bg-muted/30 transition-colors">
        <td className="px-2 py-1.5">
          <button type="button" onClick={togglePO} className="hover:bg-muted rounded p-0.5">
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !isExpanded && "-rotate-90")} />
          </button>
        </td>
        {visibleCols.has("vendor") && (
          <td className="px-2 py-1.5">
            <button type="button" onClick={onEditPO} className="font-medium hover:underline text-left flex items-center gap-1.5">
              <ShoppingCart className="h-3 w-3 text-muted-foreground" />
              {po.vendor_name}
            </button>
          </td>
        )}
        {visibleCols.has("status") && (
          <td className="px-2 py-1.5">
            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 capitalize", statusColor)}>
              {t(`purchaseOrderStatus.${po.status}`, po.status)}
            </Badge>
          </td>
        )}
        {visibleCols.has("total") && (
          <td className="px-2 py-1.5 text-right tabular-nums font-medium">
            {formatCurrency(po.total, currency)}
          </td>
        )}
        {visibleCols.has("lines") && (
          <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
            {rows.length}
          </td>
        )}
        {visibleCols.has("tasks") && <td className="px-2 py-1.5">{tasksLabel}</td>}
        {visibleCols.has("rooms") && <td className="px-2 py-1.5">{roomsLabel}</td>}
        {visibleCols.has("ordered_at") && (
          <td className="px-2 py-1.5 text-muted-foreground">
            {po.ordered_at ? new Date(po.ordered_at).toLocaleDateString() : "–"}
          </td>
        )}
        {visibleCols.has("delivered_at") && (
          <td className="px-2 py-1.5 text-muted-foreground">
            {po.delivered_at ? new Date(po.delivered_at).toLocaleDateString() : "–"}
          </td>
        )}
        {visibleCols.has("source") && (
          <td className="px-2 py-1.5 text-muted-foreground">
            {po.source ? t(`purchaseOrderSource.${po.source}`, po.source) : "–"}
          </td>
        )}
        {visibleCols.has("notes") && (
          <td className="px-2 py-1.5 text-muted-foreground truncate max-w-[160px]" title={po.notes || ""}>
            {po.notes || "–"}
          </td>
        )}
        {canEdit && (
          <td className="px-2 py-1.5">
            <div className="flex items-center justify-end gap-0.5">
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onEditPO} title={t("purchases.editPO", "Redigera")}>
                <Pencil className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={onDeletePO} title={t("purchases.deletePO", "Ta bort")}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </td>
        )}
      </tr>
      {isExpanded && (
        <tr className="bg-muted/10">
          <td colSpan={visibleColCount} className="px-2 py-1">
            {rows.length === 0 ? (
              <div className="px-2 py-1.5 flex items-center justify-between gap-2">
                <span className="text-muted-foreground italic text-[11px]">
                  {t("purchases.poNoLines", "Inga radnivå-material — ordern är endast registrerad som totalsumma.")}
                </span>
                {canEdit && (
                  <Button variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={onAddLine}>
                    <Plus className="h-3 w-3 mr-1" />
                    {t("purchases.addLine", "Lägg till rad")}
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-0.5 px-2 py-1">
                {rows.map((line) => (
                  <button
                    key={line.id}
                    type="button"
                    onClick={() => onEditLine(line.id)}
                    className="w-full grid grid-cols-[1fr_auto_auto_auto] gap-3 text-left py-1 px-2 rounded hover:bg-accent transition-colors text-[11px]"
                  >
                    <span className="truncate">{line.name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {line.quantity != null ? `${line.quantity} ${line.unit ?? ""}` : ""}
                    </span>
                    {line.task_id ? (
                      <Badge variant="secondary" className="text-[9px] px-1 py-0">
                        {taskMap.get(line.task_id) ?? "?"}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 text-muted-foreground">
                        {t("purchases.unallocated", "Oallokerat")}
                      </Badge>
                    )}
                    <span className="tabular-nums text-muted-foreground">
                      {line.price_total != null ? formatCurrency(line.price_total, currency) : "–"}
                    </span>
                  </button>
                ))}
                {canEdit && (
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-muted-foreground" onClick={onAddLine}>
                    <Plus className="h-3 w-3 mr-1" />
                    {t("purchases.addLine", "Lägg till rad")}
                  </Button>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
};

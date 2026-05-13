import { useCallback, useState } from "react";
import { PurchaseOrderCardV2 } from "./PurchaseOrderCardV2";
import { PurchaseOrderDetailSheet } from "./PurchaseOrderDetailSheet";
import type { PO, POMaterial } from "./types";

interface PurchaseOrdersGridV2Props {
  purchaseOrders: PO[];
  materialsByPOId: Map<string, POMaterial[]>;
  tasks: Array<{ id: string; title: string }>;
  rooms: Array<{ id: string; name: string }>;
  projectId: string;
  currency: string;
  canEdit: boolean;

  // header actions (delegated to existing dialogs in parent)
  onEditMeta: (po: PO) => void;
  onDelete: (po: PO) => void;

  // allocate-all
  allocatingPOId: string | null;
  onAllocateAllToTask: (poId: string, taskId: string | null) => void;
  onAllocateAllToRoom: (poId: string, roomId: string | null) => void;

  // bulk-select (drawer-scoped)
  selectModePoId: string | null;
  selectedLineIds: Set<string>;
  bulkActionLoading: boolean;
  onEnterSelectMode: (poId: string) => void;
  onExitSelectMode: () => void;
  onToggleLineSelection: (id: string) => void;
  onBulkUpdate: (updates: { task_id?: string | null; room_id?: string | null; status?: string }) => void;
  onBulkDelete: () => void;

  // line actions
  onEditLine: (mat: POMaterial) => void;
  onAddLine: (po: PO) => void;

  // optional controlled-open (used to deep-link from widgets/notifications)
  openPOId?: string | null;
  onOpenPOIdChange?: (id: string | null) => void;
}

export function PurchaseOrdersGridV2(props: PurchaseOrdersGridV2Props) {
  const {
    purchaseOrders,
    materialsByPOId,
    currency,
    selectModePoId,
    onExitSelectMode,
    openPOId: openPOIdProp,
    onOpenPOIdChange,
  } = props;

  const [openPOIdInternal, setOpenPOIdInternal] = useState<string | null>(null);
  const isControlled = openPOIdProp !== undefined;
  const openPOId = isControlled ? openPOIdProp : openPOIdInternal;
  const setOpenPOId = useCallback(
    (id: string | null) => {
      if (isControlled) {
        onOpenPOIdChange?.(id);
      } else {
        setOpenPOIdInternal(id);
      }
    },
    [isControlled, onOpenPOIdChange]
  );
  const openPO = openPOId ? purchaseOrders.find((p) => p.id === openPOId) ?? null : null;
  const openRows = openPO ? materialsByPOId.get(openPO.id) ?? [] : [];

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        // close detail sheet — also exit bulk-select if active for this PO
        if (selectModePoId === openPOId) onExitSelectMode();
        setOpenPOId(null);
      }
    },
    [openPOId, selectModePoId, onExitSelectMode, setOpenPOId]
  );

  return (
    <div className="rf-paper" style={{ background: "transparent" }}>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {purchaseOrders.map((po) => {
          const rows = materialsByPOId.get(po.id) ?? [];
          return (
            <PurchaseOrderCardV2
              key={po.id}
              po={po}
              rows={rows}
              currency={currency}
              selected={openPOId === po.id}
              bulkMode={false}
              onClick={() => setOpenPOId(po.id)}
              onToggleSelect={() => {
                /* grid-level bulk mode not yet implemented */
              }}
            />
          );
        })}
      </div>

      <PurchaseOrderDetailSheet
        {...props}
        po={openPO}
        open={!!openPO}
        onOpenChange={handleOpenChange}
        rows={openRows}
        inSelectMode={openPO ? selectModePoId === openPO.id : false}
        onEnterSelectMode={() => {
          if (openPO) props.onEnterSelectMode(openPO.id);
        }}
      />
    </div>
  );
}

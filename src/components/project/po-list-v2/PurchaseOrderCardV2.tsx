import { useTranslation } from "react-i18next";
import { Check, HardHat, Paperclip } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import type { PO, POMaterial } from "./types";
import { getPOStatusStyle } from "./types";

interface PurchaseOrderCardV2Props {
  po: PO;
  rows: POMaterial[];
  currency: string;
  maskEconomy?: boolean;
  selected: boolean;
  bulkMode: boolean;
  onClick: () => void;
  onToggleSelect: () => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function deriveAllocation(rows: POMaterial[], t: (k: string, fb?: string) => string): { label: string; allocated: boolean } {
  if (rows.length === 0) return { label: t("purchases.unallocated", "Oallokerat"), allocated: false };
  const taskIds = new Set(rows.map((r) => r.task_id).filter((id): id is string => !!id));
  const roomIds = new Set(rows.map((r) => r.room_id).filter((id): id is string => !!id));
  if (taskIds.size === 0 && roomIds.size === 0) return { label: t("purchases.unallocated", "Oallokerat"), allocated: false };
  if (taskIds.size === 1) {
    const taskName = rows.find((r) => r.task_id && r.task?.title)?.task?.title;
    return { label: taskName ?? t("purchases.linkedToTask", "Task"), allocated: true };
  }
  if (taskIds.size > 1) return { label: t("purchases.mixedAllocation", "Olika tasks"), allocated: true };
  if (roomIds.size === 1) {
    const roomName = rows.find((r) => r.room_id && r.room?.name)?.room?.name;
    return { label: roomName ?? t("purchases.linkedToRoom", "Rum"), allocated: true };
  }
  return { label: t("purchases.mixedRoomAllocation", "Olika rum"), allocated: true };
}

export function PurchaseOrderCardV2({
  po,
  rows,
  currency,
  maskEconomy = false,
  selected,
  bulkMode,
  onClick,
  onToggleSelect,
}: PurchaseOrderCardV2Props) {
  const { t } = useTranslation();
  const statusStyle = getPOStatusStyle(po.status);
  const allocation = deriveAllocation(rows, t);
  const hasWorkerSubmission = rows.some((r) => !!r.submitted_by_worker_token_id);

  // Line preview — first 3 line names, with "+N till" suffix when more exist
  const previewLines = rows.slice(0, 3).map((r) => r.name);
  const moreCount = Math.max(0, rows.length - previewLines.length);

  const dateLabel = po.delivered_at
    ? `${t("purchases.delivered", "Levererad")} ${formatDate(po.delivered_at)}`
    : po.ordered_at
      ? `${t("purchases.orderedAt", "Beställd")} ${formatDate(po.ordered_at)}`
      : formatDate(po.created_at);

  return (
    <div
      onClick={bulkMode ? onToggleSelect : onClick}
      className="group relative flex cursor-pointer flex-col overflow-hidden transition-all hover:-translate-y-px hover:shadow-md"
      style={{
        background: "#FFFFFF",
        border: selected ? "1px solid var(--rf-ink)" : "1px solid rgba(20, 15, 5, 0.12)",
        boxShadow: selected
          ? "0 0 0 1px var(--rf-ink) inset, 0 1px 3px rgba(20, 15, 5, 0.06)"
          : "0 1px 2px rgba(20, 15, 5, 0.04), 0 2px 8px rgba(20, 15, 5, 0.04)",
        borderRadius: 10,
      }}
    >
      {/* STATUS HEADER ZONE — status-tinted cover with strong accent-stripe (matches Rum cover pattern) */}
      <div
        className="relative flex items-center justify-between gap-2 px-4 py-2.5"
        style={{
          background: statusStyle.coverBg,
          color: "var(--rf-ink)",
          borderBottom: `1px solid var(--rf-hairline)`,
        }}
      >
        {/* color accent stripe — top edge */}
        <div
          className="absolute left-0 right-0 top-0"
          style={{ height: 3, background: statusStyle.stripe }}
        />

        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
            style={{
              background: statusStyle.bg,
              color: statusStyle.fg,
              letterSpacing: "0.05em",
            }}
          >
            {t(statusStyle.key, po.status)}
          </span>
          {po.source && (
            <span className="text-[11px]" style={{ color: "var(--rf-fg-muted)" }}>
              {t(`purchaseOrderSource.${po.source}`, po.source)}
            </span>
          )}
          {po.receipt_file_path && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px]"
              style={{
                background: "rgba(255, 255, 255, 0.7)",
                color: "var(--rf-ink)",
                border: "1px solid var(--rf-hairline)",
              }}
              title={t("purchases.hasAttachment", "Underlag bifogat")}
            >
              <Paperclip className="h-2.5 w-2.5" />
              {t("purchases.attachmentShort", "Bilaga")}
            </span>
          )}
          {hasWorkerSubmission && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px]"
              style={{
                background: "rgba(255, 255, 255, 0.7)",
                color: "var(--rf-ink)",
                border: "1px solid var(--rf-hairline)",
              }}
              title={t("worker.fromWorkerTooltip", "Inskickad av arbetare via deras länk")}
            >
              <HardHat className="h-2.5 w-2.5" />
              {t("worker.tag", "Arbetare")}
            </span>
          )}
        </div>
        {bulkMode && (
          <div
            className="flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center"
            style={{
              borderRadius: 4,
              border: selected ? "1.5px solid var(--rf-ink)" : "1.5px solid var(--rf-hairline)",
              background: selected ? "var(--rf-ink)" : "var(--rf-surface)",
              color: "var(--rf-paper)",
            }}
          >
            {selected && <Check className="h-3 w-3" />}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2.5 px-4 py-3.5">
        {/* VENDOR + META */}
        <div className="min-w-0">
          <div
            className="truncate"
            style={{
              fontSize: 15,
              fontWeight: 500,
              color: "var(--rf-ink)",
              letterSpacing: "-0.012em",
              lineHeight: 1.25,
            }}
          >
            {maskEconomy ? "—" : (po.vendor_name || t("purchases.unknownVendor", "Okänd leverantör"))}
          </div>
          <div
            className="rf-num mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5"
            style={{ fontSize: 11, color: "var(--rf-fg-muted)" }}
          >
            {dateLabel && <span>{dateLabel}</span>}
            {po.notes && dateLabel && <span style={{ color: "var(--rf-hairline)" }}>·</span>}
            {po.notes && (
              <span className="truncate" title={po.notes}>
                {po.notes}
              </span>
            )}
          </div>
        </div>

        {/* HERO TOTAL */}
        <div className="flex items-end justify-between gap-2">
          <div
            className="font-display tnum"
            style={{
              fontSize: 24,
              fontWeight: 400,
              color: "var(--rf-ink)",
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
            }}
          >
            {maskEconomy ? "—" : formatCurrency(po.total, currency)}
          </div>
          <div className="rf-num" style={{ fontSize: 11, color: "var(--rf-fg-muted)" }}>
            {rows.length === 0
              ? t("purchases.noLines", "Inga rader")
              : t("purchases.linesCount", { count: rows.length, defaultValue: `${rows.length} rader` })}
          </div>
        </div>

        {/* LINE PREVIEW */}
        {previewLines.length > 0 && (
          <div
            style={{
              borderTop: "1px solid var(--rf-hairline)",
              paddingTop: 8,
              fontSize: 11.5,
              lineHeight: 1.5,
              color: "var(--rf-fg-muted)",
              fontStyle: "italic",
            }}
          >
            <div className="line-clamp-2">
              {previewLines.join(" · ")}
              {moreCount > 0 && (
                <span className="rf-num" style={{ fontStyle: "normal", marginLeft: 4 }}>
                  +{moreCount} {t("purchases.moreSuffix", "till")}
                </span>
              )}
            </div>
          </div>
        )}

        {/* ALLOCATION CHIP */}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <span
            className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px]"
            style={{
              background: allocation.allocated ? "var(--rf-bg-sunken)" : "transparent",
              color: allocation.allocated ? "var(--rf-ink)" : "var(--rf-fg-subtle)",
              border: allocation.allocated ? "1px solid var(--rf-hairline)" : "1px dashed var(--rf-hairline)",
            }}
          >
            {allocation.label}
          </span>
          {po.notes ? null : (
            <span className="rf-num" style={{ fontSize: 10, color: "var(--rf-fg-subtle)" }}>
              #{po.id.slice(0, 6)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

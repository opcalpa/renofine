import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, CheckSquare, ExternalLink, FileText, Image as ImageIcon, Loader2, Paperclip, Pencil, Plus, Trash2, X } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { PO, POMaterial } from "./types";
import { getPOStatusStyle } from "./types";

function isImagePath(path: string): boolean {
  return /\.(png|jpe?g|gif|webp|heic|heif|avif)$/i.test(path);
}

function isPdfPath(path: string): boolean {
  return /\.pdf$/i.test(path);
}

function fileBasename(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

interface ExtraAttachment {
  id: string;
  file_path: string;
  file_name: string;
  mime_type: string | null;
  created_at: string;
}

function POExtraAttachments({ poId, projectId }: { poId: string; projectId: string }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<ExtraAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [inputEl, setInputEl] = useState<HTMLInputElement | null>(null);

  const refetch = async () => {
    const { data } = await supabase
      .from("task_file_links")
      .select("id, file_path, file_name, mime_type, created_at")
      .eq("purchase_order_id", poId)
      .order("created_at", { ascending: false });
    setItems(data ?? []);
  };

  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poId]);

  const handleSelect = () => inputEl?.click();

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();

      for (const file of Array.from(files)) {
        const path = `projects/${projectId}/Inköp/${poId}/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage
          .from("project-files")
          .upload(path, file, { upsert: true });
        if (upErr) throw upErr;

        await supabase.from("task_file_links").insert({
          project_id: projectId,
          purchase_order_id: poId,
          file_path: path,
          file_name: file.name,
          file_type: "other",
          file_size: file.size,
          mime_type: file.type,
          linked_by_user_id: profile?.id ?? null,
        });
      }
      toast.success(t("files.uploaded", "Fil bifogad"));
      await refetch();
    } catch (err) {
      console.error("Attachment upload failed:", err);
      toast.error(t("files.uploadError", "Kunde inte ladda upp"));
    } finally {
      setUploading(false);
      if (inputEl) inputEl.value = "";
    }
  };

  const handleOpen = async (path: string) => {
    const { data, error } = await supabase.storage
      .from("project-files")
      .createSignedUrl(path, 600);
    if (error || !data?.signedUrl) {
      toast.error(t("files.openError", "Kunde inte öppna filen"));
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const handleUnlink = async (id: string) => {
    await supabase.from("task_file_links").delete().eq("id", id);
    await refetch();
  };

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="rf-eyebrow">
          {t("purchases.moreAttachments", "Fler bilagor")}
          {items.length > 0 && (
            <span className="rf-num ml-1.5" style={{ color: "var(--rf-fg-muted)" }}>
              {items.length}
            </span>
          )}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11px]"
          style={{ color: "var(--rf-fg-muted)" }}
          onClick={handleSelect}
          disabled={uploading}
        >
          {uploading ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <Paperclip className="mr-1 h-3 w-3" />
          )}
          {t("purchases.attachFile", "Bifoga fil")}
        </Button>
        <input
          ref={(el) => setInputEl(el)}
          type="file"
          multiple
          className="hidden"
          onChange={handleUpload}
        />
      </div>

      {items.length === 0 ? (
        <div
          className="rounded-md py-3 text-center"
          style={{
            fontSize: 11,
            fontStyle: "italic",
            color: "var(--rf-fg-subtle)",
            border: "1px dashed var(--rf-hairline)",
          }}
        >
          {t("purchases.noExtraAttachments", "Inga ytterligare bilagor")}
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map((f) => {
            const isImg = isImagePath(f.file_path);
            const isPdf = isPdfPath(f.file_path);
            return (
              <div
                key={f.id}
                className="flex items-center gap-2 rounded-md px-2.5 py-1.5"
                style={{
                  background: "var(--rf-surface)",
                  border: "1px solid var(--rf-hairline)",
                }}
              >
                <div
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded"
                  style={{ background: "var(--rf-bg-sunken)" }}
                >
                  {isPdf ? (
                    <FileText className="h-3.5 w-3.5" style={{ color: "var(--rf-warn)" }} />
                  ) : isImg ? (
                    <ImageIcon className="h-3.5 w-3.5" style={{ color: "var(--rf-fg-muted)" }} />
                  ) : (
                    <Paperclip className="h-3.5 w-3.5" style={{ color: "var(--rf-fg-muted)" }} />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleOpen(f.file_path)}
                  className="flex-1 min-w-0 text-left text-xs truncate hover:underline"
                  style={{ color: "var(--rf-ink)" }}
                >
                  {f.file_name}
                </button>
                <button
                  type="button"
                  onClick={() => handleUnlink(f.id)}
                  className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded opacity-50 hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                  style={{ color: "var(--rf-fg-muted)" }}
                  title={t("files.unlink", "Ta bort koppling")}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MarkAsPaidButton({ po }: { po: PO }) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);

  // Only show when PO has invoice fields and isn't paid yet
  const hasInvoiceContext =
    !!po.invoice_number || !!po.ocr_number || !!po.invoice_due_date || po.source === "ai_invoice";
  if (!hasInvoiceContext || po.paid_at) return null;

  const handleMarkPaid = async () => {
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const { error: poErr } = await supabase
        .from("purchase_orders")
        .update({ paid_at: now })
        .eq("id", po.id);
      if (poErr) throw poErr;

      // Mark every line in this PO paid in full
      const { data: lines } = await supabase
        .from("materials")
        .select("id, price_total")
        .eq("purchase_order_id", po.id);
      if (lines && lines.length > 0) {
        await Promise.all(
          lines.map((l) =>
            supabase
              .from("materials")
              .update({ paid_amount: l.price_total || 0, status: "paid" })
              .eq("id", l.id)
          )
        );
      }

      toast.success(t("purchases.markedAsPaid", "Markerad som betald"));
    } catch (err) {
      console.error("Mark as paid failed:", err);
      toast.error(t("purchases.markPaidError", "Kunde inte markera som betald"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleMarkPaid}
      disabled={saving}
      className="gap-1.5"
      style={{
        borderColor: "var(--rf-green, #10b981)",
        color: "var(--rf-green, #059669)",
      }}
    >
      {saving ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <CheckCircle2 className="h-3.5 w-3.5" />
      )}
      {t("purchases.markAsPaid", "Markera som betald")}
    </Button>
  );
}

/**
 * The order's document, shown where the order is — not in another browser tab.
 *
 * WHY (Carl, 2026-09-02): this rendered a 48x48 thumbnail in a row that did
 * `window.open` on click. To check a total against the receipt you had to leave
 * the app, which means you could never see the number and its source at the
 * same time — the one thing checking actually requires. It is the same
 * principle as the filename on the import row and the CSV second opinion: the
 * figure and the paper it came from belong on one screen.
 *
 * The sheet is 540px on desktop and a drawer on mobile, so the preview goes
 * inline above the caption rather than beside it.
 */
function ReceiptAttachment({ filePath }: { filePath: string }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [opening, setOpening] = useState(false);

  const isImage = isImagePath(filePath);
  const isPdf = isPdfPath(filePath);
  const name = fileBasename(filePath);
  const canPreview = isImage || isPdf;

  // One signed URL serves both the inline preview and "open in a new tab".
  // An hour, not ten minutes: someone comparing a stack of receipts keeps this
  // panel open, and a preview that silently expires mid-review looks like a
  // broken file rather than a stale link.
  useEffect(() => {
    if (!canPreview) return;
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    supabase.storage
      .from("project-files")
      .createSignedUrl(filePath, 3600)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.signedUrl) setFailed(true);
        else setUrl(data.signedUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [filePath, canPreview]);

  const handleOpen = async () => {
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    setOpening(true);
    const { data, error } = await supabase.storage
      .from("project-files")
      .createSignedUrl(filePath, 3600);
    setOpening(false);
    if (error || !data?.signedUrl) {
      toast.error(t("files.openError", "Kunde inte öppna filen"));
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div
      className="overflow-hidden rounded-md border"
      style={{ background: "var(--rf-surface)", borderColor: "var(--rf-hairline)" }}
    >
      {canPreview && (
        <div
          className="flex items-center justify-center"
          style={{ background: "var(--rf-bg-sunken)", minHeight: 120 }}
        >
          {failed ? (
            <p className="px-3 py-6 text-center" style={{ fontSize: 12, color: "var(--rf-fg-muted)" }}>
              {t("purchases.attachmentPreviewFailed", "Förhandsvisningen kunde inte laddas — öppna filen nedan.")}
            </p>
          ) : !url ? (
            <Loader2 className="my-8 h-5 w-5 animate-spin" style={{ color: "var(--rf-fg-muted)" }} />
          ) : isImage ? (
            <button
              type="button"
              onClick={handleOpen}
              className="w-full cursor-zoom-in"
              title={t("purchases.attachmentOpenFull", "Öppna i full storlek")}
            >
              <img src={url} alt={name} className="max-h-[380px] w-full object-contain" />
            </button>
          ) : (
            <object data={url} type="application/pdf" className="h-[380px] w-full">
              <p className="px-3 py-6 text-center" style={{ fontSize: 12, color: "var(--rf-fg-muted)" }}>
                {t("purchases.attachmentPdfFallback", "PDF:en kan inte visas här — öppna den nedan.")}
              </p>
            </object>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 px-3 py-2">
        {isPdf ? (
          <FileText className="h-4 w-4 shrink-0" style={{ color: "var(--rf-warn)" }} />
        ) : isImage ? (
          <ImageIcon className="h-4 w-4 shrink-0" style={{ color: "var(--rf-fg-muted)" }} />
        ) : (
          <Paperclip className="h-4 w-4 shrink-0" style={{ color: "var(--rf-fg-muted)" }} />
        )}
        <span className="min-w-0 flex-1 truncate" style={{ fontSize: 12, color: "var(--rf-ink)" }} title={name}>
          {name}
        </span>
        <Button variant="ghost" size="sm" className="h-6 gap-1 px-2" onClick={handleOpen} disabled={opening}>
          {opening ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />}
          <span style={{ fontSize: 11 }}>{t("purchases.attachmentOpen", "Öppna")}</span>
        </Button>
      </div>
    </div>
  );
}
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== "undefined" && window.innerWidth >= 1024
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

interface PurchaseOrderDetailSheetProps {
  po: PO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: POMaterial[];
  tasks: Array<{ id: string; title: string }>;
  rooms: Array<{ id: string; name: string }>;
  projectId: string;
  currency: string;
  maskEconomy?: boolean;
  canEdit: boolean;

  // header actions
  onEditMeta: (po: PO) => void;
  onDelete: (po: PO) => void;

  // allocate-all
  allocatingPOId: string | null;
  onAllocateAllToTask: (poId: string, taskId: string | null) => void;
  onAllocateAllToRoom: (poId: string, roomId: string | null) => void;

  // bulk-select
  inSelectMode: boolean;
  selectedLineIds: Set<string>;
  bulkActionLoading: boolean;
  onEnterSelectMode: () => void;
  onExitSelectMode: () => void;
  onToggleLineSelection: (id: string) => void;
  onBulkUpdate: (updates: { task_id?: string | null; room_id?: string | null; status?: string }) => void;
  onBulkDelete: () => void;

  // line actions
  onEditLine: (mat: POMaterial) => void;
  onAddLine: (po: PO) => void;
}

function SheetBody(props: PurchaseOrderDetailSheetProps) {
  const { t } = useTranslation();
  const {
    po,
    rows,
    tasks,
    rooms,
    currency,
    maskEconomy = false,
    canEdit,
    onEditMeta,
    onDelete,
    allocatingPOId,
    onAllocateAllToTask,
    onAllocateAllToRoom,
    inSelectMode,
    selectedLineIds,
    bulkActionLoading,
    onEnterSelectMode,
    onExitSelectMode,
    onToggleLineSelection,
    onBulkUpdate,
    onBulkDelete,
    onEditLine,
    onAddLine,
    onOpenChange,
  } = props;

  if (!po) return null;

  const statusStyle = getPOStatusStyle(po.status);
  const isAllocating = allocatingPOId === po.id;
  const allocatedTaskIds = new Set(rows.map((r) => r.task_id).filter((id): id is string => !!id));
  const bulkTaskValue =
    allocatedTaskIds.size === 1
      ? Array.from(allocatedTaskIds)[0]
      : allocatedTaskIds.size > 1
        ? "mixed"
        : "none";
  const allocatedRoomIds = new Set(rows.map((r) => r.room_id).filter((id): id is string => !!id));
  const bulkRoomValue =
    allocatedRoomIds.size === 1
      ? Array.from(allocatedRoomIds)[0]
      : allocatedRoomIds.size > 1
        ? "mixed"
        : "none";

  const rowsInThisPo = new Set(rows.map((r) => r.id));
  const selectedInThisPo = Array.from(selectedLineIds).filter((id) => rowsInThisPo.has(id));
  const allSelected = rows.length > 0 && selectedInThisPo.length === rows.length;
  const someSelected = selectedInThisPo.length > 0;

  const toggleSelectAll = () => {
    if (allSelected) {
      // deselect all in this PO via individual toggles
      for (const id of rowsInThisPo) onToggleLineSelection(id);
    } else {
      // select all in this PO that aren't already selected
      for (const id of rowsInThisPo) {
        if (!selectedLineIds.has(id)) onToggleLineSelection(id);
      }
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* HEADER ZONE */}
      <div
        className="flex-shrink-0 px-5 pb-4 pt-5 sm:px-6"
        style={{ borderBottom: "1px solid var(--rf-hairline)" }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{ background: statusStyle.bg, color: statusStyle.fg }}
            >
              {t(statusStyle.key, po.status)}
            </span>
            {po.source && (
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px]"
                style={{
                  background: "transparent",
                  color: "var(--rf-fg-muted)",
                  border: "1px solid var(--rf-hairline)",
                }}
              >
                {t(`purchaseOrderSource.${po.source}`, po.source)}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="-mr-1 flex h-7 w-7 items-center justify-center rounded-md"
            style={{ color: "var(--rf-fg-muted)" }}
            title={t("common.close", "Stäng")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          className="mt-2 truncate"
          style={{ fontSize: 19, fontWeight: 500, color: "var(--rf-ink)", letterSpacing: "-0.015em" }}
        >
          {maskEconomy ? "—" : (po.vendor_name || t("purchases.unknownVendor", "Okänd leverantör"))}
        </div>

        <div
          className="font-display tnum mt-1"
          style={{
            fontSize: 28,
            fontWeight: 400,
            color: "var(--rf-ink)",
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
          }}
        >
          {maskEconomy ? "—" : formatCurrency(po.total, currency)}
        </div>

        {/* Momsen syns nu i stället för att bara ha lästs ut och kastats.
            Båda beloppen etiketteras — proffset läser netto + avdragsgill moms,
            hemägaren läser vad som faktiskt betalades. */}
        {!maskEconomy && po.vat_amount != null && (
          <div
            className="rf-num mt-1"
            style={{ fontSize: 12, color: "var(--rf-fg-muted)" }}
          >
            {po.net_amount != null && (
              <>
                {t("purchases.netAmount", "Netto")} {formatCurrency(po.net_amount, currency)}
                <span style={{ color: "var(--rf-hairline)" }}> · </span>
              </>
            )}
            {t("purchases.vatAmount", "Moms")} {formatCurrency(po.vat_amount, currency)}
            {po.vat_rate != null && ` (${po.vat_rate} %)`}
          </div>
        )}
        {!maskEconomy && po.vat_amount == null && (po.source === "ai_receipt" || po.source === "ai_invoice") && (
          <div className="rf-num mt-1" style={{ fontSize: 12, color: "var(--rf-fg-subtle)" }}>
            {t("purchases.vatMissing", "Moms ej utläst — fyll i under Redigera")}
          </div>
        )}

        <div
          className="rf-num mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5"
          style={{ fontSize: 11.5, color: "var(--rf-fg-muted)" }}
        >
          <span>
            {rows.length === 0
              ? t("purchases.noLines", "Inga rader")
              : t("purchases.linesCount", { count: rows.length, defaultValue: `${rows.length} rader` })}
          </span>
          {po.delivered_at && (
            <>
              <span style={{ color: "var(--rf-hairline)" }}>·</span>
              <span>
                {t("purchases.delivered", "Levererad")} {formatDate(po.delivered_at)}
              </span>
            </>
          )}
          {!po.delivered_at && po.ordered_at && (
            <>
              <span style={{ color: "var(--rf-hairline)" }}>·</span>
              <span>
                {t("purchases.orderedAt", "Beställd")} {formatDate(po.ordered_at)}
              </span>
            </>
          )}
          <span style={{ color: "var(--rf-hairline)" }}>·</span>
          <span>#{po.id.slice(0, 8)}</span>
        </div>

        {po.notes && (
          <div
            className="mt-2"
            style={{ fontSize: 12, color: "var(--rf-fg-muted)", lineHeight: 1.5 }}
          >
            {po.notes}
          </div>
        )}

        {/* Invoice metadata — only shown when PO has invoice fields */}
        {(po.invoice_number || po.ocr_number || po.invoice_due_date || po.paid_at) && (() => {
          const overdue =
            po.invoice_due_date && !po.paid_at && new Date(po.invoice_due_date) < new Date();
          return (
            <div
              className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 rf-num"
              style={{ fontSize: 11.5 }}
            >
              {po.invoice_number && (
                <span style={{ color: "var(--rf-fg-muted)" }}>
                  {t("purchases.invoiceNumberShort", "Faktura")} #{po.invoice_number}
                </span>
              )}
              {po.ocr_number && (
                <span style={{ color: "var(--rf-fg-muted)" }}>
                  OCR: {po.ocr_number}
                </span>
              )}
              {po.invoice_due_date && (
                <span
                  style={{
                    color: overdue ? "var(--rf-warn)" : po.paid_at ? "var(--rf-green)" : "var(--rf-fg-muted)",
                    fontWeight: overdue ? 500 : 400,
                  }}
                >
                  {po.paid_at
                    ? t("purchases.paidOn", "Betald {{date}}", { date: formatDate(po.paid_at) })
                    : overdue
                      ? t("purchases.overdueLabel", "Förfallen {{date}}", { date: formatDate(po.invoice_due_date) })
                      : t("purchases.dueOn", "Förfaller {{date}}", { date: formatDate(po.invoice_due_date) })}
                </span>
              )}
            </div>
          );
        })()}

        {canEdit && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEditMeta(po)}
              className="gap-1.5"
            >
              <Pencil className="h-3.5 w-3.5" />
              {t("purchases.editOrder", "Redigera order")}
            </Button>
            <MarkAsPaidButton po={po} />
          </div>
        )}
      </div>

      {/* BODY (scrollable) */}
      <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
        {/* Attachment section — primary receipt + extra files */}
        <div className="mb-5">
          {po.receipt_file_path && (
            <>
              <div className="rf-eyebrow mb-2">{t("purchases.attachment", "Underlag")}</div>
              <ReceiptAttachment filePath={po.receipt_file_path} />
            </>
          )}
          <POExtraAttachments poId={po.id} projectId={props.projectId} />
        </div>

        {/* Allocate-all section */}
        {canEdit && rows.length > 0 && (
          <div className="mb-5">
            <div className="rf-eyebrow mb-2">{t("purchases.allocateAll", "Tilldela alla rader")}</div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Select
                value={bulkTaskValue}
                disabled={isAllocating}
                onValueChange={(v) => onAllocateAllToTask(po.id, v === "none" ? null : v)}
              >
                <SelectTrigger className="h-9 text-xs">
                  {isAllocating ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin" /> {t("common.saving", "Sparar...")}
                    </span>
                  ) : (
                    <SelectValue placeholder={t("purchases.allocateAllTo", "Tilldela alla till...")} />
                  )}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("purchases.unallocated", "Oallokerat")}</SelectItem>
                  {bulkTaskValue === "mixed" && (
                    <SelectItem value="mixed" disabled>
                      {t("purchases.mixedAllocation", "Olika tasks")}
                    </SelectItem>
                  )}
                  {tasks.map((task) => (
                    <SelectItem key={task.id} value={task.id}>
                      {task.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {rooms.length > 0 && (
                <Select
                  value={bulkRoomValue}
                  disabled={isAllocating}
                  onValueChange={(v) => onAllocateAllToRoom(po.id, v === "none" ? null : v)}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder={t("purchases.allocateAllToRoom", "Tilldela alla till rum...")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("purchases.noRoom", "Inget rum")}</SelectItem>
                    {bulkRoomValue === "mixed" && (
                      <SelectItem value="mixed" disabled>
                        {t("purchases.mixedRoomAllocation", "Olika rum")}
                      </SelectItem>
                    )}
                    {rooms.map((room) => (
                      <SelectItem key={room.id} value={room.id}>
                        {room.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        )}

        {/* Lines section */}
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="rf-eyebrow">{t("purchases.lines", "Rader")}</div>
            {canEdit && rows.length > 0 && !inSelectMode && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px]"
                style={{ color: "var(--rf-fg-muted)" }}
                onClick={onEnterSelectMode}
              >
                <CheckSquare className="mr-1 h-3 w-3" />
                {t("purchases.selectRows", "Välj rader")}
              </Button>
            )}
          </div>

          {/* Bulk-action toolbar */}
          {inSelectMode && (
            <div
              className="mb-2 flex flex-wrap items-center gap-2 rounded-md px-2.5 py-2"
              style={{ background: "var(--rf-bg-sunken)", border: "1px solid var(--rf-hairline)" }}
            >
              <Checkbox
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={toggleSelectAll}
              />
              <span style={{ fontSize: 11, color: "var(--rf-fg-muted)" }}>
                {t("purchases.linesSelected", "{{count}} valda", { count: selectedInThisPo.length })}
              </span>
              {selectedInThisPo.length > 0 && (
                <>
                  <Select
                    value=""
                    disabled={bulkActionLoading}
                    onValueChange={(v) => onBulkUpdate({ task_id: v === "none" ? null : v })}
                  >
                    <SelectTrigger className="h-7 w-[150px] text-xs">
                      <SelectValue placeholder={t("purchases.bulkAllocateTask", "Tilldela task...")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("purchases.unallocated", "Oallokerat")}</SelectItem>
                      {tasks.map((task) => (
                        <SelectItem key={task.id} value={task.id}>
                          {task.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {rooms.length > 0 && (
                    <Select
                      value=""
                      disabled={bulkActionLoading}
                      onValueChange={(v) => onBulkUpdate({ room_id: v === "none" ? null : v })}
                    >
                      <SelectTrigger className="h-7 w-[130px] text-xs">
                        <SelectValue placeholder={t("purchases.bulkAllocateRoom", "Tilldela rum...")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("purchases.noRoom", "Inget rum")}</SelectItem>
                        {rooms.map((room) => (
                          <SelectItem key={room.id} value={room.id}>
                            {room.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Select
                    value=""
                    disabled={bulkActionLoading}
                    onValueChange={(v) => onBulkUpdate({ status: v })}
                  >
                    <SelectTrigger className="h-7 w-[110px] text-xs">
                      <SelectValue placeholder={t("purchases.bulkStatus", "Status...")} />
                    </SelectTrigger>
                    <SelectContent>
                      {["submitted", "to_order", "ordered", "approved", "billed", "paid", "paused", "declined"].map((s) => (
                        <SelectItem key={s} value={s}>
                          {t(`materialStatuses.${s}`, s)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={bulkActionLoading}
                    onClick={onBulkDelete}
                  >
                    <Trash2 className="mr-1 h-3 w-3" />
                    {t("common.delete", "Ta bort")}
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-7 px-2 text-xs"
                onClick={onExitSelectMode}
                disabled={bulkActionLoading}
              >
                {t("common.cancel", "Avbryt")}
              </Button>
              {bulkActionLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
            </div>
          )}

          {/* Lines list */}
          {rows.length === 0 ? (
            <div
              className="rounded-md py-4 text-center"
              style={{
                fontSize: 12,
                fontStyle: "italic",
                color: "var(--rf-fg-muted)",
                background: "var(--rf-bg-sunken)",
                border: "1px dashed var(--rf-hairline)",
              }}
            >
              {t("purchases.poNoLines", "Inga radnivå-material — ordern är endast registrerad som totalsumma.")}
            </div>
          ) : (
            <div className="space-y-0.5">
              {rows.map((row) => {
                const isSelected = selectedLineIds.has(row.id);
                if (inSelectMode) {
                  return (
                    <label
                      key={row.id}
                      className={cn(
                        "grid w-full cursor-pointer grid-cols-[auto_1fr_auto_auto] items-center gap-3 rounded px-2 py-1.5 text-xs transition-colors",
                        isSelected ? "bg-primary/10" : "hover:bg-accent"
                      )}
                    >
                      <Checkbox checked={isSelected} onCheckedChange={() => onToggleLineSelection(row.id)} />
                      <span className="truncate">{row.name}</span>
                      {row.task_id ? (
                        <Badge variant="secondary" className="whitespace-nowrap px-1.5 py-0 text-[10px]">
                          {row.task?.title || t("purchases.linkedToTask", "Task")}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="whitespace-nowrap px-1.5 py-0 text-[10px] text-muted-foreground"
                        >
                          {t("purchases.unallocated", "Oallokerat")}
                        </Badge>
                      )}
                      <span className="tnum whitespace-nowrap text-muted-foreground">
                        {maskEconomy ? "—" : formatCurrency(row.price_total || 0, currency)}
                      </span>
                    </label>
                  );
                }
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => onEditLine(row)}
                    className="grid w-full grid-cols-[1fr_auto_auto] gap-3 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent"
                  >
                    <span className="truncate">{row.name}</span>
                    {row.task_id ? (
                      <Badge variant="secondary" className="whitespace-nowrap px-1.5 py-0 text-[10px]">
                        {row.task?.title || t("purchases.linkedToTask", "Task")}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="whitespace-nowrap px-1.5 py-0 text-[10px] text-muted-foreground"
                      >
                        {t("purchases.unallocated", "Oallokerat")}
                      </Badge>
                    )}
                    <span className="tnum whitespace-nowrap text-muted-foreground">
                      {maskEconomy ? "—" : formatCurrency(row.price_total || 0, currency)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {canEdit && !inSelectMode && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 h-8 px-2 text-xs"
              style={{ color: "var(--rf-fg-muted)" }}
              onClick={() => onAddLine(po)}
            >
              <Plus className="mr-1 h-3 w-3" />
              {t("purchases.addLine", "Lägg till rad")}
            </Button>
          )}
        </div>
      </div>

      {/* STICKY ACTION BAR */}
      <div
        className="flex-shrink-0 flex items-center justify-between gap-3 px-5 pb-5 pt-3 sm:px-6"
        style={{ borderTop: "1px solid var(--rf-hairline)" }}
      >
        {canEdit ? (
          <Button
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => onDelete(po)}
          >
            <Trash2 className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{t("purchases.deletePO", "Ta bort order")}</span>
          </Button>
        ) : (
          <div />
        )}
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          {t("common.close", "Stäng")}
        </Button>
      </div>
    </div>
  );
}

export function PurchaseOrderDetailSheet(props: PurchaseOrderDetailSheetProps) {
  const { t } = useTranslation();
  const isDesktop = useIsDesktop();
  const { po, open, onOpenChange, maskEconomy = false } = props;
  const titleText = maskEconomy
    ? t("purchases.purchaseOrder", "Inköpsorder")
    : (po?.vendor_name ?? t("purchases.purchaseOrder", "Inköpsorder"));

  if (isDesktop) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          overlayClassName="bg-transparent pointer-events-none"
          className="rf-paper flex w-[540px] max-w-[92vw] flex-col gap-0 p-0 overflow-hidden"
        >
          <VisuallyHidden>
            <SheetTitle>{titleText}</SheetTitle>
            <SheetDescription>
              {t("purchases.detailSheetDescription", "Redigera order, rader och tilldelning")}
            </SheetDescription>
          </VisuallyHidden>
          <SheetBody {...props} />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerPortal>
        <DrawerOverlay />
        <DrawerContent className="rf-paper flex h-[92vh] flex-col p-0">
          <VisuallyHidden>
            <DrawerTitle>{titleText}</DrawerTitle>
            <DrawerDescription>
              {t("purchases.detailSheetDescription", "Redigera order, rader och tilldelning")}
            </DrawerDescription>
          </VisuallyHidden>
          <SheetBody {...props} />
        </DrawerContent>
      </DrawerPortal>
    </Drawer>
  );
}

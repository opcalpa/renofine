/**
 * Shared bits for the worker instruction views (floor mini-map + wall elevation).
 * Category colours, title resolution, the tap-for-info card and the per-category
 * filter chips live here so both view layers render objects identically.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ExternalLink, Loader2, MessageCircleQuestion, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/** Common fields every placed room-item carries, regardless of view layer. */
export interface RoomObjectInfo {
  id: string;
  /** floor_map_shapes.id — the drawing object a worker question is tagged to. */
  drawingObjectId?: string | null;
  roomId: string | null;
  category: string;
  subtype: string | null;
  title: string;
  installStatus: string;
  productLink: string | null;
  quantity: number | null;
  notes: string | null;
}

/** Floor-plan placed object — absolute world position (x,y). */
export interface FloorPlanObject extends RoomObjectInfo {
  x: number;
  y: number;
}

/** Wall (elevation) placed object — positioned along a wall, in mm. */
export interface WallObject extends RoomObjectInfo {
  wallId: string;
  distanceFromWallStart: number;
  elevationBottom: number;
  width: number;
  height: number;
}

// Category → marker accent colour. Mirrors ROOM_ITEM_CATEGORIES order.
export const CATEGORY_COLORS: Record<string, string> = {
  electrical: "#f59e0b",
  plumbing: "#3b82f6",
  ventilation: "#06b6d4",
  appliance: "#a855f7",
};

export const CATEGORY_LABEL_KEYS: Record<string, string> = {
  electrical: "roomItems.catElectrical",
  plumbing: "roomItems.catPlumbing",
  ventilation: "roomItems.catVentilation",
  appliance: "roomItems.catAppliance",
};

// Electrical subtype → i18n key (mirrors ELECTRICAL_ITEM_SUBTYPE_OPTIONS). Lets
// the worker see object titles in their own language for free (no AI), since the
// electrical catalog is fully translated. Other categories use the raw title.
const ELECTRICAL_SUBTYPE_KEYS: Record<string, string> = {
  single_outlet: "objects.electrical.singleOutlet",
  double_outlet: "objects.electrical.doubleOutlet",
  usb_outlet: "objects.electrical.usbOutlet",
  data_outlet: "objects.electrical.dataOutlet",
  tv_outlet: "objects.electrical.tvOutlet",
  light_switch: "objects.electrical.lightSwitch",
  dimmer_switch: "objects.electrical.dimmerSwitch",
  ceiling_lamp: "objects.electrical.ceilingLamp",
};

export const categoryColor = (cat: string): string => CATEGORY_COLORS[cat] || "#6b7280";

/** Resolve an object's display title — electrical enums via i18n, else raw/translated. */
export function useObjectTitle() {
  const { t } = useTranslation();
  return (o: RoomObjectInfo): string => {
    if (o.category === "electrical" && o.subtype && ELECTRICAL_SUBTYPE_KEYS[o.subtype]) {
      return t(ELECTRICAL_SUBTYPE_KEYS[o.subtype], o.title);
    }
    return o.title;
  };
}

/**
 * The tap-for-info card shown when a marker is selected.
 * When `token` is set (worker view, not owner preview) and the object is a real
 * drawing object, the worker can ask a question tagged to that object (W3).
 */
export function ObjectInfoCard({
  object,
  token,
}: {
  object: RoomObjectInfo;
  token?: string;
}) {
  const { t } = useTranslation();
  const objectTitle = useObjectTitle();
  const installed = object.installStatus === "installed";
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium text-foreground">{objectTitle(object)}</div>
        <span
          className="mt-0.5 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
          style={{ backgroundColor: categoryColor(object.category) }}
        >
          {t(CATEGORY_LABEL_KEYS[object.category] || "", object.category)}
        </span>
      </div>
      <div className="mt-1.5 space-y-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-full ${
              installed ? "bg-emerald-500 text-white" : "border border-muted-foreground/40"
            }`}
          >
            {installed && <Check className="h-2.5 w-2.5" />}
          </span>
          <span>
            {installed
              ? t("roomItems.installed", "Installed")
              : t("roomItems.planned", "Planned")}
          </span>
        </div>
        {object.quantity != null && (
          <div>
            {t("roomItems.quantity", "Qty")}: <span className="rf-num">×{object.quantity}</span>
          </div>
        )}
        {object.notes && <div className="whitespace-pre-wrap">{object.notes}</div>}
        {object.productLink && (
          <a
            href={object.productLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            {t("roomItems.productLink", "Product link")}
          </a>
        )}
      </div>
      {token && object.drawingObjectId && (
        <AskQuestion token={token} drawingObjectId={object.drawingObjectId} />
      )}
    </div>
  );
}

/** Inline "ask a question about this object" affordance for the worker view. */
function AskQuestion({
  token,
  drawingObjectId,
}: {
  token: string;
  drawingObjectId: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const send = async () => {
    if (!message.trim() || sending) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("worker-ask-question", {
        body: { token, drawingObjectId, message: message.trim() },
      });
      if (error || data?.error) throw new Error(data?.error || "Send failed");
      setMessage("");
      setOpen(false);
      setSent(true);
    } catch (err) {
      console.error("Ask question failed:", err);
      toast.error(t("roomItems.questionFailed", "Could not send question"));
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="mt-2 flex items-center gap-1.5 border-t pt-2 text-xs text-emerald-600">
        <Check className="h-3.5 w-3.5" />
        {t("roomItems.questionSent", "Question sent!")}
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex items-center gap-1.5 border-t pt-2 text-xs font-medium text-primary hover:underline"
      >
        <MessageCircleQuestion className="h-3.5 w-3.5" />
        {t("roomItems.askQuestion", "Ask a question")}
      </button>
    );
  }

  return (
    <div className="mt-2 flex items-start gap-1.5 border-t pt-2">
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={t("roomItems.askPlaceholder", "What do you want to ask about this?")}
        rows={2}
        autoFocus
        className="flex-1 resize-none rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        disabled={sending}
      />
      <button
        type="button"
        onClick={send}
        disabled={sending || !message.trim()}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-50"
      >
        {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

/** Per-category filter chips. Shown by the caller only when >1 category is present. */
export function CategoryFilterChips({
  categories,
  hidden,
  onToggle,
}: {
  categories: string[];
  hidden: Set<string>;
  onToggle: (cat: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-1.5">
      {categories.map((cat) => {
        const active = !hidden.has(cat);
        const color = categoryColor(cat);
        return (
          <button
            key={cat}
            type="button"
            onClick={() => onToggle(cat)}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition ${
              active ? "border-transparent text-white" : "border-border bg-background text-muted-foreground"
            }`}
            style={active ? { backgroundColor: color } : undefined}
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: active ? "rgba(255,255,255,0.9)" : color }}
            />
            {t(CATEGORY_LABEL_KEYS[cat] || "", cat)}
          </button>
        );
      })}
    </div>
  );
}

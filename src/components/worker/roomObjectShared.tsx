/**
 * Shared bits for the worker instruction views (floor mini-map + wall elevation).
 * Category colours, title resolution, the tap-for-info card and the per-category
 * filter chips live here so both view layers render objects identically.
 */
import { useTranslation } from "react-i18next";
import { Check, ExternalLink } from "lucide-react";

/** Common fields every placed room-item carries, regardless of view layer. */
export interface RoomObjectInfo {
  id: string;
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

/** The tap-for-info card shown when a marker is selected. */
export function ObjectInfoCard({ object }: { object: RoomObjectInfo }) {
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

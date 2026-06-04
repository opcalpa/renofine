/**
 * RoomMiniMap — renders a simplified floor plan SVG with one room highlighted.
 * Uses raw polygon points from floor_map_shapes (no Konva dependency).
 * Lightweight for mobile worker view.
 *
 * Three rendering modes (automatic):
 * 1. Background image + room polygons → image with colored room overlays
 * 2. Room polygons only → SVG minimap with highlighted room
 * 3. No data → renders nothing
 *
 * W1 (room-item instruction view): placed objects in the highlighted room are
 * drawn as tappable markers. Tapping one shows its logged info (title, install
 * status, qty, product link) and a per-category filter lets the worker focus on
 * one trade at a time — turning the drawing into an instruction.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ExternalLink } from "lucide-react";

interface FloorPlanShape {
  id: string;
  roomId: string | null;
  points: Array<{ x: number; y: number }>;
  color: string;
  strokeColor: string;
  name: string | null;
}

interface FloorPlanImage {
  url: string;
  x: number;
  y: number;
}

export interface FloorPlanObject {
  id: string;
  roomId: string | null;
  x: number;
  y: number;
  category: string;
  subtype: string | null;
  title: string;
  installStatus: string;
  productLink: string | null;
  quantity: number | null;
  notes: string | null;
}

interface RoomMiniMapProps {
  shapes: FloorPlanShape[];
  highlightRoomId: string | null;
  /** Background image from canvas (uploaded floor plan / architect drawing) */
  backgroundImage?: FloorPlanImage | null;
  /** Placed room-items (objects) across assigned rooms; filtered to the highlighted room. */
  objects?: FloorPlanObject[];
  className?: string;
}

// Category → marker accent colour. Mirrors ROOM_ITEM_CATEGORIES order.
const CATEGORY_COLORS: Record<string, string> = {
  electrical: "#f59e0b",
  plumbing: "#3b82f6",
  ventilation: "#06b6d4",
  appliance: "#a855f7",
};

const CATEGORY_LABEL_KEYS: Record<string, string> = {
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

function pointsToSvgPath(points: Array<{ x: number; y: number }>): string {
  if (points.length < 2) return "";
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ") + " Z";
}

function findCenter(points: Array<{ x: number; y: number }>): { x: number; y: number } {
  const x = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const y = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  return { x, y };
}

export function RoomMiniMap({
  shapes,
  highlightRoomId,
  backgroundImage,
  objects,
  className,
}: RoomMiniMapProps) {
  const { t } = useTranslation();

  const validShapes = (shapes || []).filter(
    (s) => Array.isArray(s.points) && s.points.length >= 3
  );

  // Objects belonging to the room this card is about.
  const roomObjects = useMemo(
    () => (objects || []).filter((o) => o.roomId === highlightRoomId),
    [objects, highlightRoomId]
  );

  const presentCategories = useMemo(() => {
    const seen: string[] = [];
    for (const o of roomObjects) if (!seen.includes(o.category)) seen.push(o.category);
    return seen;
  }, [roomObjects]);

  // Active category filter (all on by default). null entry = uninitialised.
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const visibleObjects = useMemo(
    () => roomObjects.filter((o) => !hiddenCategories.has(o.category)),
    [roomObjects, hiddenCategories]
  );

  const selected = useMemo(
    () => roomObjects.find((o) => o.id === selectedId) || null,
    [roomObjects, selectedId]
  );

  // Nothing to render
  if (validShapes.length === 0 && !backgroundImage?.url && roomObjects.length === 0) {
    return null;
  }

  // Bounding box of shapes + visible object markers (so markers never clip).
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const shape of validShapes) {
    for (const p of shape.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  for (const o of roomObjects) {
    if (o.x < minX) minX = o.x;
    if (o.y < minY) minY = o.y;
    if (o.x > maxX) maxX = o.x;
    if (o.y > maxY) maxY = o.y;
  }

  // If only background image with no room shapes, use image position as bounds
  if (validShapes.length === 0 && roomObjects.length === 0 && backgroundImage) {
    minX = backgroundImage.x;
    minY = backgroundImage.y;
    maxX = backgroundImage.x + 10000; // Estimate — image will scale to fit
    maxY = backgroundImage.y + 7000;
  }

  if (!Number.isFinite(minX)) return null;

  const width = maxX - minX || 1;
  const height = maxY - minY || 1;
  const padding = Math.max(width, height) * 0.1;
  const vbX = minX - padding;
  const vbY = minY - padding;
  const vbW = width + padding * 2;
  const vbH = height + padding * 2;

  const strokeScale = Math.max(vbW, vbH);
  const markerR = strokeScale * 0.02;

  const objectTitle = (o: FloorPlanObject): string => {
    if (o.category === "electrical" && o.subtype && ELECTRICAL_SUBTYPE_KEYS[o.subtype]) {
      return t(ELECTRICAL_SUBTYPE_KEYS[o.subtype], o.title);
    }
    return o.title;
  };

  return (
    <div className="space-y-2">
      {/* Category filter chips (only when more than one trade is present) */}
      {presentCategories.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {presentCategories.map((cat) => {
            const active = !hiddenCategories.has(cat);
            const color = CATEGORY_COLORS[cat] || "#6b7280";
            return (
              <button
                key={cat}
                type="button"
                onClick={() =>
                  setHiddenCategories((prev) => {
                    const next = new Set(prev);
                    if (next.has(cat)) next.delete(cat);
                    else next.add(cat);
                    return next;
                  })
                }
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition ${
                  active
                    ? "border-transparent text-white"
                    : "border-border bg-background text-muted-foreground"
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
      )}

      <svg
        viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
        className={className}
        style={{ width: "100%", maxHeight: 220 }}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Background image (uploaded floor plan / architect drawing) */}
        {backgroundImage?.url && (
          <image
            href={backgroundImage.url}
            x={backgroundImage.x}
            y={backgroundImage.y}
            width={width}
            height={height}
            preserveAspectRatio="xMidYMid meet"
            opacity={0.4}
          />
        )}

        {/* Room polygons as overlays */}
        {validShapes.map((shape) => {
          const isHighlighted = shape.roomId === highlightRoomId;
          return (
            <g key={shape.id}>
              <path
                d={pointsToSvgPath(shape.points)}
                fill={
                  isHighlighted
                    ? "rgba(34, 197, 94, 0.3)"
                    : backgroundImage?.url
                      ? "rgba(229, 231, 235, 0.15)"
                      : "rgba(229, 231, 235, 0.4)"
                }
                stroke={isHighlighted ? "#16a34a" : "#d1d5db"}
                strokeWidth={isHighlighted ? strokeScale * 0.005 : strokeScale * 0.003}
              />
              {shape.name && (
                <text
                  x={findCenter(shape.points).x}
                  y={findCenter(shape.points).y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={strokeScale * 0.035}
                  fontWeight={isHighlighted ? 600 : 400}
                  fill={isHighlighted ? "#15803d" : "#9ca3af"}
                  paintOrder="stroke"
                  stroke={backgroundImage?.url ? "rgba(255,255,255,0.8)" : "none"}
                  strokeWidth={backgroundImage?.url ? strokeScale * 0.008 : 0}
                >
                  {shape.name}
                </text>
              )}
            </g>
          );
        })}

        {/* Object markers */}
        {visibleObjects.map((o) => {
          const color = CATEGORY_COLORS[o.category] || "#6b7280";
          const installed = o.installStatus === "installed";
          const isSelected = o.id === selectedId;
          return (
            <g
              key={o.id}
              style={{ cursor: "pointer" }}
              onClick={() => setSelectedId(isSelected ? null : o.id)}
            >
              {/* tap halo */}
              <circle cx={o.x} cy={o.y} r={markerR * 1.9} fill="transparent" />
              <circle
                cx={o.x}
                cy={o.y}
                r={markerR}
                fill={installed ? color : "#ffffff"}
                stroke={color}
                strokeWidth={markerR * (isSelected ? 0.5 : 0.32)}
                opacity={0.95}
              />
              {isSelected && (
                <circle
                  cx={o.x}
                  cy={o.y}
                  r={markerR * 1.5}
                  fill="none"
                  stroke={color}
                  strokeWidth={markerR * 0.22}
                  opacity={0.6}
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* Tapped-object info card */}
      {selected && (
        <div className="rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="font-medium text-foreground">{objectTitle(selected)}</div>
            <span
              className="mt-0.5 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
              style={{ backgroundColor: CATEGORY_COLORS[selected.category] || "#6b7280" }}
            >
              {t(CATEGORY_LABEL_KEYS[selected.category] || "", selected.category)}
            </span>
          </div>
          <div className="mt-1.5 space-y-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span
                className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-full ${
                  selected.installStatus === "installed"
                    ? "bg-emerald-500 text-white"
                    : "border border-muted-foreground/40"
                }`}
              >
                {selected.installStatus === "installed" && <Check className="h-2.5 w-2.5" />}
              </span>
              <span>
                {selected.installStatus === "installed"
                  ? t("roomItems.installed", "Installed")
                  : t("roomItems.planned", "Planned")}
              </span>
            </div>
            {selected.quantity != null && (
              <div>
                {t("roomItems.quantity", "Qty")}: <span className="rf-num">×{selected.quantity}</span>
              </div>
            )}
            {selected.notes && <div className="whitespace-pre-wrap">{selected.notes}</div>}
            {selected.productLink && (
              <a
                href={selected.productLink}
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
      )}
    </div>
  );
}

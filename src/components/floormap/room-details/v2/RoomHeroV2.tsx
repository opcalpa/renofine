import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, ChevronDown } from "lucide-react";
import { useMeasurement } from "@/contexts/MeasurementContext";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ROOM_STATUS_OPTIONS, PRIORITY_OPTIONS } from "../constants";
import { CanvasSettingsPopover } from "../CanvasSettingsPopover";
import { RoomShapeMini } from "./RoomShapeMini";
import { getRoomTypeIcon } from "../../rooms-list-v2/roomTypeIcons";
import { useRoomCoverPhotos } from "../../rooms-list-v2/useRoomCoverPhotos";
import { useMemo } from "react";
import type { RoomFormData, Room } from "../types";

interface RoomHeroV2Props {
  room: Room | null;
  formData: RoomFormData;
  updateFormData: (updates: Partial<RoomFormData>) => void;
  areaSqm?: number;
  perimeterMm?: number;
}

const STATUS_PILL_STYLE: Record<string, { bg: string; fg: string }> = {
  existing: { bg: "var(--rf-stone)", fg: "var(--rf-stone-fg)" },
  to_be_renovated: { bg: "var(--rf-sand)", fg: "var(--rf-sand-fg)" },
  new_construction: { bg: "var(--rf-green-soft)", fg: "var(--rf-green-soft-fg)" },
};

const PRIORITY_PILL_STYLE: Record<string, { bg: string; fg: string; dot: string }> = {
  high: { bg: "var(--rf-warn-soft)", fg: "var(--rf-warn-soft-fg)", dot: "#B86040" },
  medium: { bg: "var(--rf-amber-soft)", fg: "var(--rf-amber-soft-fg)", dot: "#C9A87A" },
  low: { bg: "#E5EAE2", fg: "#4A5547", dot: "#A8B5A2" },
};

function StatusPillButton({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  const style = STATUS_PILL_STYLE[value] ?? STATUS_PILL_STYLE.existing;
  const opt = ROOM_STATUS_OPTIONS.find((o) => o.value === value) ?? ROOM_STATUS_OPTIONS[0];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border-0 px-2 py-0.5 text-[11px] font-medium"
          style={{ background: style.bg, color: style.fg }}
        >
          {t(opt.labelKey)}
          <ChevronDown className="h-2.5 w-2.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-1" align="start">
        {ROOM_STATUS_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`w-full rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--rf-bg-sunken)] ${
              o.value === value ? "font-medium" : ""
            }`}
          >
            {t(o.labelKey)}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function PriorityPillButton({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  const style = PRIORITY_PILL_STYLE[value] ?? PRIORITY_PILL_STYLE.low;
  const opt = PRIORITY_OPTIONS.find((o) => o.value === value) ?? PRIORITY_OPTIONS[1];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full border-0 px-2 py-0.5 text-[11px] font-medium"
          style={{ background: style.bg, color: style.fg }}
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: style.dot }}
          />
          {t(opt.labelKey)}
          <ChevronDown className="h-2.5 w-2.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-40 p-1" align="start">
        {PRIORITY_OPTIONS.map((o) => {
          const ps = PRIORITY_PILL_STYLE[o.value];
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--rf-bg-sunken)] ${
                o.value === value ? "font-medium" : ""
              }`}
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: ps.dot }} />
              {t(o.labelKey)}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

export function RoomHeroV2({
  room,
  formData,
  updateFormData,
  areaSqm,
  perimeterMm,
}: RoomHeroV2Props) {
  const { t } = useTranslation();
  const ms = useMeasurement();
  const [editingName, setEditingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const points = room?.floor_plan_position?.points;
  const hasShape = !!(points && points.length > 0);
  const heightMm = formData.ceiling_height_mm ?? 2400;
  const area = formData.area_sqm ?? areaSqm;
  const perimeter = perimeterMm;
  const volume = area ? area * (heightMm / 1000) : null;

  // Cover photo (single-room fetch)
  const roomIds = useMemo(() => (room?.id ? [room.id] : []), [room?.id]);
  const coverMap = useRoomCoverPhotos(roomIds);
  const coverPhoto = room?.id ? coverMap.get(room.id) : undefined;
  const TypeIcon = getRoomTypeIcon(formData.name || room?.name || null);

  // Extract a display-friendly stroke color from the rgba color in formData.color
  const previewColor = formData.color?.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
    ? `rgb(${formData.color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)?.slice(1, 4).join(",")})`
    : "#2F5D4E";

  return (
    <div
      className="border-b px-6 pt-5 pb-4"
      style={{ borderColor: "var(--rf-hairline)", background: "var(--rf-surface)" }}
    >
      {/* head */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {/* bricka: photo > shape-svg > type-icon, with color-dot picker overlay */}
          <div className="relative flex-shrink-0">
            <div
              className="flex h-[60px] w-[60px] items-center justify-center overflow-hidden rounded-lg"
              style={{ background: "var(--rf-bg-sunken)" }}
            >
              {coverPhoto?.url ? (
                <img
                  src={coverPhoto.url}
                  alt={coverPhoto.caption || formData.name}
                  loading="lazy"
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              ) : hasShape ? (
                <RoomShapeMini points={points} color={previewColor} size={48} />
              ) : (
                <TypeIcon
                  style={{ width: 26, height: 26, color: "var(--rf-fg-muted)" }}
                  strokeWidth={1.5}
                />
              )}
            </div>
            <div className="absolute -bottom-1 -right-1">
              <CanvasSettingsPopover
                roomId={room?.id ?? null}
                color={formData.color}
                onColorChange={(color) => updateFormData({ color })}
                customTrigger={
                  <span
                    className="inline-block h-[18px] w-[18px] rounded-full"
                    style={{
                      background: previewColor,
                      border: "2px solid var(--rf-surface)",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                    }}
                  />
                }
              />
            </div>
          </div>

          <div className="min-w-0 flex-1">
            {editingName ? (
              <input
                ref={nameInputRef}
                type="text"
                value={formData.name}
                onChange={(e) => updateFormData({ name: e.target.value })}
                onBlur={() => setEditingName(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === "Escape") setEditingName(false);
                }}
                autoFocus
                className="rf-display w-full bg-transparent outline-none"
                style={{
                  fontSize: 26,
                  borderBottom: "2px solid var(--rf-ink)",
                  color: "var(--rf-ink)",
                  paddingBottom: 2,
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setEditingName(true);
                  setTimeout(() => nameInputRef.current?.select(), 0);
                }}
                className="rf-display group inline-flex max-w-full items-center gap-1.5 truncate bg-transparent text-left"
                style={{ fontSize: 26, color: "var(--rf-ink)" }}
                title={t("rooms.clickToRename", "Click to rename")}
              >
                <span className="truncate">{formData.name || t("rooms.unnamed", "Unnamed room")}</span>
                <Pencil className="h-3.5 w-3.5 flex-shrink-0 opacity-0 group-hover:opacity-30" />
              </button>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <StatusPillButton
                value={formData.status}
                onChange={(v) => updateFormData({ status: v })}
              />
              <PriorityPillButton
                value={formData.priority}
                onChange={(v) => updateFormData({ priority: v })}
              />
            </div>
          </div>
        </div>
      </div>

      {/* metadata strip — 4 stat cards */}
      <div
        className="mt-4 grid grid-cols-4 gap-0 border-t pt-3"
        style={{ borderColor: "var(--rf-hairline)" }}
      >
        {[
          { k: t("rooms.area", "Yta"), v: area ? `${area.toFixed(1)} ${ms.areaLabel}` : "—" },
          {
            k: t("rooms.perimeter", "Omkrets"),
            v: perimeter ? ms.fmtLength(perimeter) : "—",
          },
          {
            // Strip "(m)" suffix that exists in the i18n value — the unit is on the value side already.
            k: t("rooms.ceilingHeight", "Takhöjd").replace(/\s*\([^)]*\)\s*$/, ""),
            v: heightMm ? ms.fmtLength(heightMm) : "—",
          },
          {
            k: t("rooms.volume", "Volym"),
            v: volume ? `${volume.toFixed(1)} m³` : "—",
          },
        ].map((s) => (
          <div key={s.k}>
            <div className="rf-section-label mb-0.5">{s.k}</div>
            <div
              className="rf-num"
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "var(--rf-ink)",
                letterSpacing: "-0.01em",
              }}
            >
              {s.v}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

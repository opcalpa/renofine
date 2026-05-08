import { useTranslation } from "react-i18next";
import { Check, MapPin, Image as ImageIcon } from "lucide-react";
import { useMeasurement } from "@/contexts/MeasurementContext";
import { RoomShapeMini } from "../room-details/v2/RoomShapeMini";
import { getRoomTypeIcon } from "./roomTypeIcons";
import type { Room } from "../rooms-table/types";
import type { RoomProgress } from "./useRoomsProgress";
import type { RoomCoverPhoto } from "./useRoomCoverPhotos";

interface RoomCardV2Props {
  room: Room;
  progress?: RoomProgress;
  coverPhoto?: RoomCoverPhoto;
  bulkMode: boolean;
  selected: boolean;
  onClick: () => void;
  onToggleSelect: () => void;
  onPlaceOnPlan?: () => void;
  onShowOnPlan?: () => void;
}

const STATUS_LABEL: Record<string, { bg: string; fg: string; key: string }> = {
  existing: { bg: "var(--rf-stone)", fg: "var(--rf-stone-fg)", key: "roomStatuses.existing" },
  to_be_renovated: { bg: "var(--rf-sand)", fg: "var(--rf-sand-fg)", key: "roomStatuses.toBeRenovated" },
  new_construction: { bg: "var(--rf-green-soft)", fg: "var(--rf-green-soft-fg)", key: "roomStatuses.newConstruction" },
};

const PRIORITY_DOT: Record<string, string> = {
  high: "#B86040",
  medium: "#C9A87A",
  low: "#A8B5A2",
};

function previewColorFromRgba(rgba?: string | null): string {
  if (!rgba) return "#2F5D4E";
  const m = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return m ? `rgb(${m.slice(1, 4).join(",")})` : "#2F5D4E";
}

/**
 * Cover renders the most informative visual for the room:
 *   1. Uploaded photo (full-bleed, object-cover)
 *   2. Floor-plan shape (centered SVG on tinted paper background)
 *   3. Room-type icon (centered, big, on tinted paper background)
 */
function RoomCover({
  room,
  color,
  coverPhoto,
}: {
  room: Room;
  color: string;
  coverPhoto?: RoomCoverPhoto;
}) {
  const points = room.floor_plan_position?.points;
  const hasShape = points && points.length > 0;

  if (coverPhoto?.url) {
    return (
      <div className="relative h-32 w-full overflow-hidden">
        <img
          src={coverPhoto.url}
          alt={coverPhoto.caption || room.name}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  if (hasShape) {
    return (
      <div
        className="flex h-32 w-full items-center justify-center"
        style={{ background: "var(--rf-bg-sunken)" }}
      >
        <RoomShapeMini points={points} color={color} size={86} stroke={1.5} />
      </div>
    );
  }

  const Icon = getRoomTypeIcon(room.name);
  return (
    <div
      className="flex h-32 w-full items-center justify-center"
      style={{
        background: "var(--rf-bg-sunken)",
        color: "var(--rf-fg-subtle)",
      }}
    >
      <Icon style={{ width: 44, height: 44 }} strokeWidth={1.25} />
    </div>
  );
}

export function RoomCardV2({
  room,
  progress,
  coverPhoto,
  bulkMode,
  selected,
  onClick,
  onToggleSelect,
  onPlaceOnPlan,
  onShowOnPlan,
}: RoomCardV2Props) {
  const { t } = useTranslation();
  const ms = useMeasurement();

  const points = room.floor_plan_position?.points;
  const placed = !!(points && points.length > 0);
  const color = previewColorFromRgba(room.color);
  const status = STATUS_LABEL[room.status || "existing"] ?? STATUS_LABEL.existing;
  const priority = (room.priority || "medium") as "high" | "medium" | "low";
  const priorityDot = PRIORITY_DOT[priority];
  const area = room.dimensions?.area_sqm;
  const pct = progress?.pct ?? 0;
  const tasksDone = progress?.done ?? 0;
  const tasksTotal = progress?.total ?? 0;
  const hasPhoto = !!coverPhoto?.url;

  const tasksLabel =
    tasksTotal > 0
      ? t("rooms.tasksProgress", {
          done: tasksDone,
          total: tasksTotal,
          defaultValue: `${tasksDone}/${tasksTotal} arbeten`,
        })
      : t("rooms.noTasksYet", "Inga arbeten ännu");

  return (
    <div
      onClick={bulkMode ? onToggleSelect : onClick}
      className="group relative cursor-pointer overflow-hidden transition-shadow hover:shadow-md"
      style={{
        background: "var(--rf-surface)",
        border: selected ? "1px solid var(--rf-ink)" : "1px solid var(--rf-hairline)",
        boxShadow: selected ? "0 0 0 1px var(--rf-ink) inset" : undefined,
        borderRadius: 10,
      }}
    >
      {/* COVER */}
      <div className="relative">
        <RoomCover room={room} color={color} coverPhoto={coverPhoto} />

        {/* color-stripe ribbon along bottom of cover */}
        <div
          className="absolute bottom-0 left-0 right-0"
          style={{ height: 3, background: color }}
        />

        {/* status pill — top-left, paper-glass */}
        <div className="absolute left-3 top-3">
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium backdrop-blur-sm"
            style={{
              background: `color-mix(in oklab, ${status.bg} 92%, transparent)`,
              color: status.fg,
              border: "1px solid rgba(255,255,255,0.2)",
            }}
          >
            {t(status.key)}
          </span>
        </div>

        {/* bulk checkbox — top-right */}
        {bulkMode && (
          <div
            className="absolute right-3 top-3 flex h-[20px] w-[20px] items-center justify-center"
            style={{
              borderRadius: 4,
              border: selected ? "1.5px solid var(--rf-ink)" : "1.5px solid var(--rf-surface)",
              background: selected ? "var(--rf-ink)" : "rgba(255,255,255,0.85)",
              color: "var(--rf-paper)",
              boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
            }}
          >
            {selected && <Check className="h-3 w-3" />}
          </div>
        )}

        {/* photo indicator — bottom-right of cover, only when a real photo is shown */}
        {hasPhoto && (
          <div
            className="absolute bottom-2 right-3 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium backdrop-blur-sm"
            style={{
              background: "rgba(0,0,0,0.55)",
              color: "#fff",
            }}
          >
            <ImageIcon className="h-2.5 w-2.5" />
            {t("rooms.photoCover", "Bild")}
          </div>
        )}
      </div>

      {/* CONTENT */}
      <div className="flex flex-col gap-2.5 px-4 py-3">
        {/* title row */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
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
              {room.name}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span
                className="rf-num"
                style={{ fontSize: 12, color: "var(--rf-fg-muted)" }}
              >
                {area ? `${area.toFixed(1)} ${ms.areaLabel}` : "—"}
              </span>
              <span style={{ color: "var(--rf-hairline)" }}>·</span>
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: priorityDot }}
              />
              <span style={{ fontSize: 11, color: "var(--rf-fg-muted)" }}>
                {t(
                  `tasks.priority${priority.charAt(0).toUpperCase()}${priority.slice(1)}`,
                  priority === "high" ? "Hög" : priority === "medium" ? "Medel" : "Låg"
                )}
              </span>
            </div>
          </div>
          {!bulkMode && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (placed) onShowOnPlan?.();
                else onPlaceOnPlan?.();
              }}
              title={
                placed
                  ? t("rooms.showOnFloorPlan", "Visa på ritning")
                  : t("rooms.placeOnFloorPlan", "Placera på ritning")
              }
              className="flex h-7 w-7 items-center justify-center rounded-md transition-colors"
              style={{
                color: placed ? "var(--rf-green)" : "var(--rf-warn)",
                background: "transparent",
                border: "1px solid var(--rf-hairline)",
              }}
            >
              <MapPin className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* progress */}
        <div>
          <div
            className="rf-num mb-1 flex justify-between"
            style={{ fontSize: 11, color: "var(--rf-fg-muted)" }}
          >
            <span>{tasksLabel}</span>
            <span
              style={{
                fontWeight: 500,
                color: pct === 100 ? "var(--rf-green)" : "var(--rf-ink)",
              }}
            >
              {pct}%
            </span>
          </div>
          <div
            style={{
              height: 3,
              background: "var(--rf-bg-sunken)",
              borderRadius: 2,
              overflow: "hidden",
              width: "100%",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${pct}%`,
                background: pct === 100 ? "var(--rf-green)" : color,
                transition: "width .3s",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

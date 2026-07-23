/**
 * WallElevationMiniView — read-only wall elevation(s) for the worker view (W4).
 * Lightweight SVG (no Konva). Renders one panel per wall that has placed objects,
 * positioning each object by its wall-relative mm coordinates (distance along the
 * wall + height from floor). The drawing reads as a wall instruction: which object
 * sits where on the wall, at what height, with which product + status.
 *
 * Scale note: floor-plan scale (pixels/mm) is not persisted, so the wall panel is
 * sized to the objects (+ padding) rather than the wall's true length. Relative
 * positions and heights between objects on the same wall are exact.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CATEGORY_COLORS,
  CategoryFilterChips,
  ObjectInfoCard,
  type WallNote,
  type WallObject,
  type WallSurface,
} from "./roomObjectShared";
import { ZoomPanSvg } from "./ZoomPanSvg";

interface WallElevationMiniViewProps {
  objects: WallObject[];
  /** Render walls for this room only (the card's room). */
  roomId: string | null;
  ceilingHeightMm?: number | null;
  /** Per-wall finish instructions (material/treatment/color code). */
  surfaces?: WallSurface[];
  /** Wall-anchored text notes from the wall view. */
  notes?: WallNote[];
  /** Worker token — when set, the info card lets the worker ask a question (W3). */
  token?: string;
  className?: string;
}

const DEFAULT_CEILING_MM = 2400;
const WALL_PADDING_MM = 400;
const MIN_WALL_LENGTH_MM = 1200;

export function WallElevationMiniView({
  objects,
  roomId,
  ceilingHeightMm,
  surfaces,
  notes,
  token,
  className,
}: WallElevationMiniViewProps) {
  const { t } = useTranslation();

  const roomObjects = useMemo(
    () => (objects || []).filter((o) => o.roomId === roomId),
    [objects, roomId]
  );
  const roomNotes = useMemo(
    () => (notes || []).filter((n) => n.roomId === roomId),
    [notes, roomId]
  );
  const surfaceByWall = useMemo(() => {
    const map: Record<string, WallSurface> = {};
    for (const s of surfaces || []) if (s.roomId === roomId) map[s.wallId] = s;
    return map;
  }, [surfaces, roomId]);

  const presentCategories = useMemo(() => {
    const seen: string[] = [];
    for (const o of roomObjects) if (!seen.includes(o.category)) seen.push(o.category);
    return seen;
  }, [roomObjects]);

  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const wallHeightMM = ceilingHeightMm && ceilingHeightMm > 0 ? ceilingHeightMm : DEFAULT_CEILING_MM;

  // Group visible objects (and notes) by wall, preserving first-seen order.
  // A wall with only a note or a finish still gets a panel.
  const walls = useMemo(() => {
    const order: string[] = [];
    const byWall: Record<string, WallObject[]> = {};
    const seen = (wallId: string) => {
      if (!byWall[wallId]) {
        byWall[wallId] = [];
        order.push(wallId);
      }
    };
    for (const o of roomObjects) {
      if (hiddenCategories.has(o.category)) continue;
      seen(o.wallId);
      byWall[o.wallId].push(o);
    }
    for (const n of roomNotes) seen(n.wallId);
    return order.map((wallId) => {
      const objs = byWall[wallId];
      const wallNotes = roomNotes.filter((n) => n.wallId === wallId);
      const maxRight = Math.max(
        objs.reduce((m, o) => Math.max(m, o.distanceFromWallStart + o.width), 0),
        wallNotes.reduce((m, n) => Math.max(m, n.distanceFromWallStart + n.width), 0)
      );
      const lengthMM = Math.max(maxRight + WALL_PADDING_MM, MIN_WALL_LENGTH_MM);
      return { wallId, objs, notes: wallNotes, lengthMM };
    });
  }, [roomObjects, roomNotes, hiddenCategories]);

  const selected = useMemo(
    () => roomObjects.find((o) => o.id === selectedId) || null,
    [roomObjects, selectedId]
  );

  if (roomObjects.length === 0 && roomNotes.length === 0) return null;

  return (
    <div className="space-y-2">
      {presentCategories.length > 1 && (
        <CategoryFilterChips
          categories={presentCategories}
          hidden={hiddenCategories}
          onToggle={(cat) =>
            setHiddenCategories((prev) => {
              const next = new Set(prev);
              if (next.has(cat)) next.delete(cat);
              else next.add(cat);
              return next;
            })
          }
        />
      )}

      {walls.map((wall, i) => (
        <div key={wall.wallId} className="space-y-1">
          {(walls.length > 1 || surfaceByWall[wall.wallId]) && (
            <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
              {walls.length > 1 && (
                <span className="font-medium text-muted-foreground">
                  {t("roomItems.wall", "Wall")} {i + 1}
                </span>
              )}
              {/* Per-wall finish instruction: material · treatment · color code */}
              {surfaceByWall[wall.wallId] && (
                <span className="text-muted-foreground">
                  {[
                    surfaceByWall[wall.wallId].material,
                    surfaceByWall[wall.wallId].treatment,
                    surfaceByWall[wall.wallId].treatmentColor,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              )}
            </div>
          )}
          <ZoomPanSvg
            viewBox={`${-wall.lengthMM * 0.04} ${-wallHeightMM * 0.06} ${wall.lengthMM * 1.08} ${wallHeightMM * 1.18}`}
            className={className}
            maxHeight={200}
          >
            {/* Wall face */}
            <rect
              x={0}
              y={0}
              width={wall.lengthMM}
              height={wallHeightMM}
              fill="rgba(229, 231, 235, 0.4)"
              stroke="#d1d5db"
              strokeWidth={wallHeightMM * 0.006}
            />
            {/* Floor line */}
            <line
              x1={0}
              y1={wallHeightMM}
              x2={wall.lengthMM}
              y2={wallHeightMM}
              stroke="#9ca3af"
              strokeWidth={wallHeightMM * 0.01}
            />

            {/* Wall-anchored notes (yellow stickies from the wall view) */}
            {wall.notes.map((n) => {
              const topY = wallHeightMM - (n.elevationBottom + n.height);
              const fontSize = Math.min(n.height * 0.42, 130);
              return (
                <g key={n.id}>
                  <rect
                    x={n.distanceFromWallStart}
                    y={topY}
                    width={n.width}
                    height={n.height}
                    rx={n.height * 0.1}
                    fill="#fef9c3"
                    stroke="#eab308"
                    strokeWidth={wallHeightMM * 0.004}
                    opacity={0.95}
                  />
                  <text
                    x={n.distanceFromWallStart + n.width / 2}
                    y={topY + n.height / 2 + fontSize * 0.35}
                    textAnchor="middle"
                    fontSize={fontSize}
                    fill="#713f12"
                  >
                    {n.text.length > 28 ? `${n.text.slice(0, 27)}…` : n.text}
                    <title>{n.text}</title>
                  </text>
                </g>
              );
            })}

            {wall.objs.map((o) => {
              const color = CATEGORY_COLORS[o.category] || "#6b7280";
              const installed = o.installStatus === "installed";
              const isSelected = o.id === selectedId;
              // y grows downward; floor is at wallHeightMM, ceiling at 0.
              const topY = wallHeightMM - (o.elevationBottom + o.height);
              return (
                <g
                  key={o.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => setSelectedId(isSelected ? null : o.id)}
                >
                  <rect
                    x={o.distanceFromWallStart}
                    y={topY}
                    width={o.width}
                    height={o.height}
                    rx={Math.min(o.width, o.height) * 0.15}
                    fill={installed ? color : "#ffffff"}
                    stroke={color}
                    strokeWidth={Math.max(wallHeightMM * 0.004, Math.min(o.width, o.height) * 0.12)}
                    opacity={0.95}
                  />
                  {isSelected && (
                    <rect
                      x={o.distanceFromWallStart - o.width * 0.2}
                      y={topY - o.height * 0.2}
                      width={o.width * 1.4}
                      height={o.height * 1.4}
                      rx={Math.min(o.width, o.height) * 0.15}
                      fill="none"
                      stroke={color}
                      strokeWidth={wallHeightMM * 0.005}
                      opacity={0.6}
                    />
                  )}
                </g>
              );
            })}
          </ZoomPanSvg>
        </div>
      ))}

      {selected && <ObjectInfoCard object={selected} token={token} />}
    </div>
  );
}

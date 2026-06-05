/**
 * RoomObjectViews — the worker's per-room visual instruction surface (W4).
 * Shows the floor mini-map and/or the wall elevation, with a toggle to flip
 * between them when both layers carry objects. Used by both worker surfaces
 * (work cards + room cards) so they behave identically.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { RoomMiniMap } from "./RoomMiniMap";
import { WallElevationMiniView } from "./WallElevationMiniView";
import type { FloorPlanObject, WallObject } from "./roomObjectShared";

interface FloorPlanShape {
  id: string;
  roomId: string | null;
  points: Array<{ x: number; y: number }>;
  color: string;
  strokeColor: string;
  name: string | null;
}

interface RoomObjectViewsProps {
  shapes: FloorPlanShape[];
  highlightRoomId: string | null;
  backgroundImage?: { url: string; x: number; y: number } | null;
  floorObjects?: FloorPlanObject[];
  wallObjects?: WallObject[];
  ceilingHeightMm?: number | null;
  /** Worker token — enables "ask a question" on tapped objects (W3). */
  token?: string;
  className?: string;
}

export function RoomObjectViews({
  shapes,
  highlightRoomId,
  backgroundImage,
  floorObjects,
  wallObjects,
  ceilingHeightMm,
  token,
  className,
}: RoomObjectViewsProps) {
  const { t } = useTranslation();

  const hasWall = (wallObjects || []).some((o) => o.roomId === highlightRoomId);
  const hasFloor =
    (shapes && shapes.length > 0) ||
    (floorObjects || []).some((o) => o.roomId === highlightRoomId);

  const [view, setView] = useState<"floor" | "wall">("floor");
  // Force the only available view when one layer is empty.
  const active = !hasFloor && hasWall ? "wall" : !hasWall && hasFloor ? "floor" : view;

  if (!hasFloor && !hasWall) return null;

  return (
    <div className="space-y-2">
      {hasFloor && hasWall && (
        <div className="inline-flex rounded-lg border bg-background p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setView("floor")}
            className={`rounded-md px-2.5 py-1 transition ${
              active === "floor" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            {t("roomItems.floorView", "Floor plan")}
          </button>
          <button
            type="button"
            onClick={() => setView("wall")}
            className={`rounded-md px-2.5 py-1 transition ${
              active === "wall" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            {t("roomItems.wallView", "Wall view")}
          </button>
        </div>
      )}

      {active === "floor" ? (
        <RoomMiniMap
          shapes={shapes}
          highlightRoomId={highlightRoomId}
          backgroundImage={backgroundImage}
          objects={floorObjects}
          token={token}
          className={className}
        />
      ) : (
        <WallElevationMiniView
          objects={wallObjects || []}
          roomId={highlightRoomId}
          ceilingHeightMm={ceilingHeightMm}
          token={token}
          className={className}
        />
      )}
    </div>
  );
}

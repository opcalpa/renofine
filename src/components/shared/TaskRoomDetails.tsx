import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { ColorSwatchRow } from "@/components/worker/ColorSwatchRow";
import { RoomSpecsSummary } from "@/components/worker/RoomSpecsSummary";
import { MapPin, Ruler, Camera } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RoomSpec {
  id: string;
  name: string;
  wallSpec: Record<string, unknown> | null;
  floorSpec: Record<string, unknown> | null;
  ceilingSpec: Record<string, unknown> | null;
  joinerySpec: Record<string, unknown> | null;
  dimensions: { area_sqm?: number; ceiling_height_mm?: number } | null;
  ceilingHeightMm: number | null;
  beforePhotoCount: number;
}

interface TaskRoomDetailsProps {
  /** Room IDs to display — pass task.room_ids or [task.room_id] */
  roomIds: string[];
  /** Compact = no photos count, less padding (for task card) */
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TaskRoomDetails({ roomIds, compact }: TaskRoomDetailsProps) {
  const { t } = useTranslation();
  const [rooms, setRooms] = useState<RoomSpec[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (roomIds.length === 0) {
      setRooms([]);
      return;
    }
    loadRooms(roomIds);
  }, [roomIds.join(",")]);

  const loadRooms = async (ids: string[]) => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("rooms")
        .select("id, name, wall_spec, floor_spec, ceiling_spec, joinery_spec, dimensions, ceiling_height_mm")
        .in("id", ids);

      if (!data) { setRooms([]); return; }

      // Count before-photos per room
      const { data: photoCounts } = await supabase
        .from("photos")
        .select("linked_to_id")
        .eq("linked_to_type", "room")
        .eq("source", "before")
        .in("linked_to_id", ids);

      const countMap: Record<string, number> = {};
      for (const p of photoCounts || []) {
        countMap[p.linked_to_id] = (countMap[p.linked_to_id] || 0) + 1;
      }

      // Maintain order from roomIds
      const roomMap = new Map(data.map((r) => [r.id, r]));
      const ordered = ids
        .map((id) => roomMap.get(id))
        .filter(Boolean)
        .map((r) => ({
          id: r!.id,
          name: r!.name,
          wallSpec: r!.wall_spec as RoomSpec["wallSpec"],
          floorSpec: r!.floor_spec as RoomSpec["floorSpec"],
          ceilingSpec: r!.ceiling_spec as RoomSpec["ceilingSpec"],
          joinerySpec: r!.joinery_spec as RoomSpec["joinerySpec"],
          dimensions: r!.dimensions as RoomSpec["dimensions"],
          ceilingHeightMm: r!.ceiling_height_mm,
          beforePhotoCount: countMap[r!.id] || 0,
        }));

      setRooms(ordered);
    } finally {
      setLoading(false);
    }
  };

  if (roomIds.length === 0) return null;
  if (loading) return null; // silent load — no spinner for inline details

  const hasAnySpecs = rooms.some(
    (r) => r.wallSpec || r.floorSpec || r.ceilingSpec || r.joinerySpec || r.dimensions
  );

  if (!hasAnySpecs && rooms.every((r) => r.beforePhotoCount === 0)) return null;

  return (
    <div className="space-y-3">
      {rooms.map((room) => {
        const areaSqm = room.dimensions?.area_sqm;
        const ceilingH = room.ceilingHeightMm || room.dimensions?.ceiling_height_mm;
        const hasSpecs = room.wallSpec || room.floorSpec || room.ceilingSpec || room.joinerySpec;

        if (!hasSpecs && !areaSqm && room.beforePhotoCount === 0) return null;

        return (
          <div
            key={room.id}
            className={compact ? "space-y-1.5" : "rounded-lg border bg-muted/20 p-3 space-y-2"}
          >
            {/* Room header */}
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-medium">{room.name}</span>
              {areaSqm && (
                <span className="text-muted-foreground flex items-center gap-1">
                  <Ruler className="h-3 w-3" />
                  {areaSqm} m²
                </span>
              )}
              {ceilingH && (
                <span className="text-xs text-muted-foreground">
                  {t("worker.ceilingHeight", "Ceiling")}: {(ceilingH / 1000).toFixed(1)}m
                </span>
              )}
              {room.beforePhotoCount > 0 && (
                <span className="text-xs text-muted-foreground flex items-center gap-0.5 ml-auto">
                  <Camera className="h-3 w-3" />
                  {room.beforePhotoCount}
                </span>
              )}
            </div>

            {/* Color swatches */}
            {room.wallSpec && (
              <ColorSwatchRow
                wallSpec={room.wallSpec}
                ceilingSpec={room.ceilingSpec}
                floorSpec={room.floorSpec}
              />
            )}

            {/* Specs summary */}
            {hasSpecs && (
              <RoomSpecsSummary
                wallSpec={room.wallSpec}
                floorSpec={room.floorSpec}
                ceilingSpec={room.ceilingSpec}
                joinerySpec={room.joinerySpec}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

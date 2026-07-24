/**
 * Room-data enrichment for canvas shapes — ONE engine for both editors.
 *
 * Room shapes persist geometry; name, colour and surface finishes (E4) live on
 * the rooms table. This merges them onto the shapes at load time so the floor
 * plan (tint + pattern), the elevation view (wall colour) and labels all read
 * from the shape without extra fetches. Extracted verbatim from the v1
 * canvas's load path; v2's EditorCanvas uses the same function.
 */

import { supabase } from '@/integrations/supabase/client';
import { FloorMapShape } from '../types';
import { useFloorMapStore } from '../store';
import { resolveFloorTint } from '../canvas/utils/floorMaterialColor';
import { resolveFloorPattern } from '../canvas/utils/surfacePatterns';

/** Darker variant of an rgba color for the room stroke. */
export function darkerRoomStroke(rgbaColor: string): string {
  const match = rgbaColor?.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (match) {
    const r = Math.floor(parseInt(match[1]) * 0.7);
    const g = Math.floor(parseInt(match[2]) * 0.7);
    const b = Math.floor(parseInt(match[3]) * 0.7);
    return `rgba(${r}, ${g}, ${b}, 0.8)`;
  }
  return rgbaColor || 'rgba(41, 91, 172, 0.8)';
}

/**
 * Merge rooms-table data (name, colour, floor/wall finishes) onto linked room
 * shapes. Returns the input array untouched when there is nothing to enrich
 * or the fetch fails (shapes must never be blocked by room metadata).
 */
export async function enrichShapesWithRoomData(
  shapes: FloorMapShape[]
): Promise<FloorMapShape[]> {
  const roomIds = shapes
    .filter((s) => s.type === 'room' && s.roomId)
    .map((s) => s.roomId as string);
  if (roomIds.length === 0) return shapes;

  try {
    const { data: rooms, error } = await supabase
      .from('rooms')
      .select('id, name, color, wall_spec, floor_spec')
      .in('id', roomIds);
    if (error || !rooms) return shapes;

    return shapes.map((shape) => {
      if (shape.type !== 'room' || !shape.roomId) return shape;
      const room = rooms.find((r) => r.id === shape.roomId);
      if (!room) return shape;
      const floorSpec = (room.floor_spec || {}) as {
        material?: string;
        specification?: string;
        skirting_color?: string;
      };
      const wallSpec = (room.wall_spec || {}) as { main_color?: string };
      const baseColor = room.color || shape.color || 'rgba(59, 130, 246, 0.2)';
      return {
        ...shape,
        name: room.name,
        color: baseColor,
        strokeColor: darkerRoomStroke(baseColor),
        surfaceTint: resolveFloorTint(floorSpec.material, floorSpec.skirting_color),
        surfaceLabel: floorSpec.material || null,
        surfacePattern: resolveFloorPattern(floorSpec.material, floorSpec.specification),
        wallSurfaceColor: wallSpec.main_color || null,
      };
    });
  } catch (err) {
    console.error('Error enriching shapes with room data:', err);
    return shapes;
  }
}

/**
 * Enrich the STORE's shapes in place. The fetch is async — an executor commit
 * may land while it is in flight — so only the enrichment fields are merged
 * onto the CURRENT shapes; geometry is never touched or reverted.
 */
export async function enrichStoreShapesWithRoomData(): Promise<void> {
  const snapshot = useFloorMapStore.getState().shapes;
  const enriched = await enrichShapesWithRoomData(snapshot);
  if (enriched === snapshot) return;
  const byId = new Map(enriched.map((s) => [s.id, s]));
  const store = useFloorMapStore.getState();
  store.setShapes(
    store.shapes.map((s) => {
      const e = byId.get(s.id);
      if (!e || s.type !== 'room' || !s.roomId) return s;
      return {
        ...s,
        name: e.name,
        color: e.color,
        strokeColor: e.strokeColor,
        surfaceTint: e.surfaceTint,
        surfaceLabel: e.surfaceLabel,
        surfacePattern: e.surfacePattern,
        wallSurfaceColor: e.wallSurfaceColor,
      };
    })
  );
}

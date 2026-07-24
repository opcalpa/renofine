/**
 * Pure helpers for resolving wall-view instruction data (wall→room mapping,
 * per-wall finishes, wall-anchored notes) from raw floor_map_shapes rows.
 *
 * No Deno/Supabase imports — this module is shared verbatim with the e2e
 * regression test (e2e/worker-wall-resolution.spec.ts), which runs it against
 * real serialized v2 editor shapes. Keep it dependency-free.
 */

export type Point = { x: number; y: number };

export type ShapeRow = {
  id: string;
  shape_type: string;
  shape_data: Record<string, unknown> | null;
};

export type RoomPoly = { id: string; roomId: string | null; points: Point[] };

export type WallSurface = {
  wallId: string;
  roomId: string;
  material: string | null;
  treatment: string | null;
  treatmentColor: string | null;
};

export type WallNote = {
  id: string;
  wallId: string;
  roomId: string;
  text: string;
  distanceFromWallStart: number;
  elevationBottom: number;
  width: number;
  height: number;
};

/**
 * Room polygons are serialized as shape_data.points = the store's
 * PolygonCoordinates object ({ points: [...] }) — NOT a bare array. Accept
 * both forms (bare array kept for any legacy rows) and reject anything else.
 */
export function normalizeRoomPoints(shapeData: Record<string, unknown> | null): Point[] {
  const raw = shapeData?.points ?? shapeData?.coordinates;
  const candidate = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as Record<string, unknown> | undefined)?.points)
      ? ((raw as Record<string, unknown>).points as unknown[])
      : [];
  return candidate.filter(
    (p): p is Point =>
      typeof (p as Point)?.x === "number" && typeof (p as Point)?.y === "number"
  );
}

function pointInPoly(pt: Point, pts: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
    if (yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Map wall shape id → room id by probing perpendicularly from each wall's
 * midpoint against the assigned rooms' polygons (both sides, two distances,
 * in world units where 1 unit = 10 mm).
 */
export function resolveWallRooms(
  wallShapes: ShapeRow[],
  roomPolys: RoomPoly[],
  assignedRoomIds: string[]
): Record<string, string> {
  const assigned = roomPolys.filter(
    (r) => r.roomId && assignedRoomIds.includes(r.roomId) && r.points.length >= 3
  );
  const wallRoom: Record<string, string> = {};
  for (const s of wallShapes) {
    if (s.shape_type !== "wall") continue;
    const c = ((s.shape_data as Record<string, unknown>)?.coordinates || {}) as Record<string, number>;
    if (typeof c.x1 !== "number") continue;
    const mid = { x: (c.x1 + c.x2) / 2, y: (c.y1 + c.y2) / 2 };
    const len = Math.hypot(c.x2 - c.x1, c.y2 - c.y1) || 1;
    const n = { x: -(c.y2 - c.y1) / len, y: (c.x2 - c.x1) / len };
    outer: for (const dist of [12, 30]) {
      for (const side of [1, -1]) {
        const probe = { x: mid.x + n.x * dist * side, y: mid.y + n.y * dist * side };
        const hit = assigned.find((r) => pointInPoly(probe, r.points));
        if (hit?.roomId) {
          wallRoom[s.id] = hit.roomId;
          break outer;
        }
      }
    }
  }
  return wallRoom;
}

/**
 * Extract the per-wall finish instructions and wall-anchored elevation notes
 * from wall/text shape rows, keeping only walls resolved to an assigned room.
 */
export function extractWallInstructions(
  extraShapes: ShapeRow[],
  wallRoom: Record<string, string>
): { wallSurfaces: WallSurface[]; wallNotes: WallNote[] } {
  const wallSurfaces: WallSurface[] = [];
  const wallNotes: WallNote[] = [];
  for (const s of extraShapes) {
    const sd = (s.shape_data as Record<string, unknown>) || {};
    if (s.shape_type === "wall") {
      const roomId = wallRoom[s.id];
      if (!roomId) continue;
      const material = (sd.material as string) || null;
      const treatment = (sd.treatment as string) || null;
      const treatmentColor = (sd.treatmentColor as string) || null;
      if (material || treatment || treatmentColor) {
        wallSurfaces.push({ wallId: s.id, roomId, material, treatment, treatmentColor });
      }
    } else if (s.shape_type === "text") {
      const wr = sd.wallRelative as Record<string, unknown> | undefined;
      if (
        sd.shapeViewMode === "elevation" &&
        wr &&
        typeof wr.wallId === "string" &&
        typeof sd.text === "string" &&
        sd.text &&
        wallRoom[wr.wallId as string]
      ) {
        wallNotes.push({
          id: s.id,
          wallId: wr.wallId as string,
          roomId: wallRoom[wr.wallId as string],
          text: sd.text as string,
          distanceFromWallStart: typeof wr.distanceFromWallStart === "number" ? wr.distanceFromWallStart : 0,
          elevationBottom: typeof wr.elevationBottom === "number" ? wr.elevationBottom : 0,
          width: typeof wr.width === "number" ? wr.width : 700,
          height: typeof wr.height === "number" ? wr.height : 250,
        });
      }
    }
  }
  return { wallSurfaces, wallNotes };
}

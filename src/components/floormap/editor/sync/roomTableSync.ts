/**
 * rooms-table bridge for the v2 editor.
 *
 * Auto-detected rooms become rooms rows when the user confirms a name (or
 * links an existing room) in the naming dialog; linked rooms get their
 * area/perimeter/position kept in sync as walls move. Same storage semantics
 * as the legacy editor: dimensions.area_sqm (m²), perimeter_mm, and
 * floor_plan_position.points in world units.
 */

import { supabase } from '@/integrations/supabase/client';
import { FloorMapShape, PolygonCoordinates } from '../../types';
import { worldToMm } from '../core/units';

function roomMetrics(shape: FloorMapShape): {
  areaSqM: number;
  perimeterMm: number;
  points: { x: number; y: number }[];
} | null {
  const points = (shape.coordinates as PolygonCoordinates)?.points;
  if (!points || points.length < 3) return null;
  let area = 0;
  let perimeterWorld = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y - points[j].x * points[i].y;
    perimeterWorld += Math.hypot(points[j].x - points[i].x, points[j].y - points[i].y);
  }
  const mmPerWorld = worldToMm(1);
  const areaSqM = (Math.abs(area) / 2) * mmPerWorld * mmPerWorld / 1_000_000;
  return {
    areaSqM: parseFloat(areaSqM.toFixed(2)),
    perimeterMm: Math.round(perimeterWorld * mmPerWorld),
    points,
  };
}

/** Create a rooms row for a confirmed auto-room. Returns the new room id. */
export async function insertRoomRow(
  projectId: string,
  shape: FloorMapShape,
  name: string
): Promise<string | null> {
  const metrics = roomMetrics(shape);
  if (!metrics) return null;
  const { data, error } = await supabase
    .from('rooms')
    .insert({
      project_id: projectId,
      name,
      dimensions: { area_sqm: metrics.areaSqM, perimeter_mm: metrics.perimeterMm },
      floor_plan_position: { points: metrics.points },
    })
    .select('id')
    .single();
  if (error) {
    console.error('insertRoomRow failed:', error);
    return null;
  }
  return data.id;
}

/** Update dimensions/position on an existing rooms row after wall edits. */
export async function updateRoomRow(shape: FloorMapShape): Promise<boolean> {
  if (!shape.roomId) return false;
  const metrics = roomMetrics(shape);
  if (!metrics) return false;
  const { error } = await supabase
    .from('rooms')
    .update({
      dimensions: { area_sqm: metrics.areaSqM, perimeter_mm: metrics.perimeterMm },
      floor_plan_position: { points: metrics.points },
    })
    .eq('id', shape.roomId);
  if (error) {
    console.error('updateRoomRow failed:', error);
    return false;
  }
  return true;
}

export interface ProjectRoomOption {
  id: string;
  name: string;
  color?: string;
}

/** Rooms in the project that aren't yet placed on any plan (for link-first naming). */
export async function fetchUnplacedRooms(
  projectId: string,
  placedRoomIds: string[]
): Promise<ProjectRoomOption[]> {
  const { data, error } = await supabase
    .from('rooms')
    .select('id, name, color')
    .eq('project_id', projectId);
  if (error || !data) return [];
  const placed = new Set(placedRoomIds);
  return (data as ProjectRoomOption[]).filter((r) => !placed.has(r.id));
}

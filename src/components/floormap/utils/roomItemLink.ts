import { supabase } from '@/integrations/supabase/client';
import type { FloorMapShape } from '../types';
import { saveShapesForPlan } from './plans';

/**
 * E3 — link a freshly placed canvas object to its room_items row.
 *
 * The shape is persisted FIRST (so the floor_map_shapes row exists) because
 * room_items.floor_map_shape_id is a foreign key — updating it before the shape
 * row is written would violate the constraint. The canvas's own debounced
 * autosave would otherwise only flush ~2s later.
 */
export async function linkPlacedItemToShape(
  planId: string,
  shapes: FloorMapShape[],
  itemId: string,
  shapeId: string
): Promise<void> {
  // Persist all shapes (includes the new object) so the FK target exists.
  await saveShapesForPlan(planId, shapes);

  const { error } = await supabase
    .from('room_items')
    .update({ floor_map_shape_id: shapeId, representation_kind: 'point' })
    .eq('id', itemId);

  if (error) throw error;
}

/** Ray-casting point-in-polygon. Point and polygon share the canvas world space. */
export function pointInPolygon(
  pt: { x: number; y: number },
  points: { x: number; y: number }[]
): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x, yi = points[i].y;
    const xj = points[j].x, yj = points[j].y;
    const intersect =
      yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * E3.2 reverse — an object drawn directly on the canvas inside a room becomes
 * a room_items entry for that room (canvas → list). Shape is persisted first
 * so the FK target exists (same ordering as linkPlacedItemToShape).
 * Category defaults to 'electrical' (the original E3 flow); v2 passes the
 * object's own catalog category so plumbing/kitchen mirror the same way.
 */
export async function createRoomItemForPlacedShape(
  planId: string,
  shapes: FloorMapShape[],
  projectId: string,
  roomId: string,
  shape: { id: string; name?: string; metadata?: { unifiedObjectId?: unknown } },
  category: string = 'electrical'
): Promise<void> {
  await saveShapesForPlan(planId, shapes);

  const subtype = typeof shape.metadata?.unifiedObjectId === 'string'
    ? shape.metadata.unifiedObjectId
    : null;

  const { error } = await supabase.from('room_items').insert({
    project_id: projectId,
    room_id: roomId,
    category,
    subtype,
    title: shape.name || subtype || category,
    representation_kind: 'point',
    floor_map_shape_id: shape.id,
  });

  if (error) throw error;
}

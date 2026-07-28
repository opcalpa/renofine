import { supabase } from '@/integrations/supabase/client';
import type { FloorMapShape } from '../types';
import { saveShapesForPlan } from './plans';
import { normalizeWorkCategory } from '@/lib/workCategories';

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
 * P2 — keep the mirrored room_items row's finish in sync when the object's
 * colour/material instruction (metadata.finishColor) changes on the canvas.
 * No-op for objects without a mirrored row (furniture, unlinked rooms).
 */
export async function updateRoomItemFinishForShape(
  shapeId: string,
  finish: string
): Promise<void> {
  const { data, error } = await supabase
    .from('room_items')
    .select('id, detail')
    .eq('floor_map_shape_id', shapeId)
    .limit(1);
  if (error || !data?.length) return;
  const detail = { ...((data[0].detail as Record<string, unknown>) || {}) };
  if (finish) detail.finish = finish;
  else delete detail.finish;
  await supabase.from('room_items').update({ detail }).eq('id', data[0].id);
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

  // Store the canonical trade id (appliances→appliance, hvac→ventilation, …)
  // so the mirrored row's category matches the shared work-category registry.
  const canonicalCategory = normalizeWorkCategory(category) ?? category;

  const { error } = await supabase.from('room_items').insert({
    project_id: projectId,
    room_id: roomId,
    category: canonicalCategory,
    subtype,
    title: shape.name || subtype || canonicalCategory,
    representation_kind: 'point',
    floor_map_shape_id: shape.id,
  });

  if (error) throw error;
}

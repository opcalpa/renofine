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

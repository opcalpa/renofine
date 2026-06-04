import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { FloorMapShape } from '../types';

export interface ShapeRoomItem {
  id: string;
  title: string;
  subtype: string | null;
  category: string;
  install_status: string;
  detail: { product_link?: string; quantity?: number; notes?: string };
  floor_map_shape_id: string;
}

/**
 * E5 — load the room_items linked to placed canvas objects, keyed by
 * floor_map_shape_id, for hover/instruction overlays. Re-fetches when the set
 * of unified-object shape ids changes (covers place/remove of objects).
 */
export function useRoomItemsByShape(shapes: FloorMapShape[]): Record<string, ShapeRoomItem> {
  const [map, setMap] = useState<Record<string, ShapeRoomItem>>({});

  const shapeIds = shapes
    .filter((s) => s.metadata?.isUnifiedObject)
    .map((s) => s.id)
    .sort();
  const key = shapeIds.join(',');

  useEffect(() => {
    let cancelled = false;
    if (shapeIds.length === 0) {
      setMap({});
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from('room_items')
        .select('id, title, subtype, category, install_status, detail, floor_map_shape_id')
        .in('floor_map_shape_id', shapeIds);
      if (cancelled) return;
      if (error) {
        console.error('Failed to load room items for shapes:', error);
        return;
      }
      const next: Record<string, ShapeRoomItem> = {};
      for (const row of data ?? []) {
        if (row.floor_map_shape_id) {
          next[row.floor_map_shape_id] = {
            ...row,
            detail: (row.detail ?? {}) as ShapeRoomItem['detail'],
          } as ShapeRoomItem;
        }
      }
      setMap(next);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return map;
}

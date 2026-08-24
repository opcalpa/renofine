import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * How much work and how many purchases sit on each room.
 *
 * Carl asked to see this straight from the room list: "hur många och vilka
 * Arbeten som är kopplat till rummet, likaså Inköp". Without it you have to
 * open every room to find out whether it is actually used — which is exactly
 * what makes a duplicate room from an import hard to spot.
 *
 * Two queries for the whole project, never one per room: a 30-room list would
 * otherwise fire 60 requests.
 */

export interface RoomRelations {
  taskCount: number;
  /** Titles for the tooltip — capped, since a room can carry many. */
  taskTitles: string[];
  purchaseCount: number;
  purchaseNames: string[];
}

const TOOLTIP_CAP = 8;

export function useRoomRelations(projectId: string | undefined): Map<string, RoomRelations> {
  const [relations, setRelations] = useState<Map<string, RoomRelations>>(new Map());

  useEffect(() => {
    if (!projectId) {
      setRelations(new Map());
      return;
    }
    let cancelled = false;

    (async () => {
      const [tasksRes, materialsRes] = await Promise.all([
        supabase
          .from('tasks')
          .select('id, title, room_id, room_ids')
          .eq('project_id', projectId),
        // A purchase is a material that made it onto a purchase order.
        supabase
          .from('materials')
          .select('id, name, room_id, purchase_order_id')
          .eq('project_id', projectId)
          .not('purchase_order_id', 'is', null),
      ]);
      if (cancelled) return;

      const map = new Map<string, RoomRelations>();
      const bucket = (roomId: string): RoomRelations => {
        let entry = map.get(roomId);
        if (!entry) {
          entry = { taskCount: 0, taskTitles: [], purchaseCount: 0, purchaseNames: [] };
          map.set(roomId, entry);
        }
        return entry;
      };

      type TaskRow = { id: string; title: string | null; room_id: string | null; room_ids: string[] | null };
      for (const task of (tasksRes.data as TaskRow[] | null) ?? []) {
        // The app writes both fields; a task spanning rooms counts in each.
        const roomIds = new Set<string>(
          [task.room_id, ...(task.room_ids ?? [])].filter((id): id is string => !!id),
        );
        for (const roomId of roomIds) {
          const entry = bucket(roomId);
          entry.taskCount += 1;
          if (entry.taskTitles.length < TOOLTIP_CAP && task.title) entry.taskTitles.push(task.title);
        }
      }

      type MaterialRow = { id: string; name: string | null; room_id: string | null };
      for (const material of (materialsRes.data as MaterialRow[] | null) ?? []) {
        if (!material.room_id) continue;
        const entry = bucket(material.room_id);
        entry.purchaseCount += 1;
        if (entry.purchaseNames.length < TOOLTIP_CAP && material.name) {
          entry.purchaseNames.push(material.name);
        }
      }

      setRelations(map);
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return relations;
}

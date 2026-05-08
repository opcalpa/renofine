import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface RoomProgress {
  done: number;
  total: number;
  pct: number;
}

const DONE_STATUSES = new Set(["done", "completed"]);

interface TaskRow {
  id: string;
  status: string | null;
  room_id: string | null;
  room_ids: string[] | null;
}

/**
 * Fetches tasks for a project and aggregates done/total counts per room.
 * A task is associated to a room if `room_id === roomId` OR `room_ids` includes it.
 */
export function useRoomsProgress(projectId: string | undefined) {
  const [progressMap, setProgressMap] = useState<Map<string, RoomProgress>>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setLoading(true);

    supabase
      .from("tasks")
      .select("id, status, room_id, room_ids")
      .eq("project_id", projectId)
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoading(false);
        if (error) {
          console.error("useRoomsProgress fetch failed:", error);
          return;
        }
        const rows = (data || []) as TaskRow[];
        const map = new Map<string, RoomProgress>();

        const bump = (roomId: string, isDone: boolean) => {
          const cur = map.get(roomId) || { done: 0, total: 0, pct: 0 };
          cur.total += 1;
          if (isDone) cur.done += 1;
          map.set(roomId, cur);
        };

        for (const t of rows) {
          const isDone = DONE_STATUSES.has((t.status || "").toLowerCase());
          if (t.room_id) bump(t.room_id, isDone);
          if (Array.isArray(t.room_ids)) {
            for (const rid of t.room_ids) {
              if (rid && rid !== t.room_id) bump(rid, isDone);
            }
          }
        }

        for (const [, p] of map) {
          p.pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
        }
        setProgressMap(map);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return { progressMap, loading };
}

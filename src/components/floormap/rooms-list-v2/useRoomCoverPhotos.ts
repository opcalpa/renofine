import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface RoomCoverPhoto {
  url: string;
  caption: string | null;
}

/**
 * Fetches the first photo (cover) per room. Used for room cards as a smart fallback
 * when the room has no shape on the floor plan but does have an uploaded photo.
 */
export function useRoomCoverPhotos(roomIds: string[]) {
  const [coverMap, setCoverMap] = useState<Map<string, RoomCoverPhoto>>(new Map());

  // Stable string key from sorted IDs to avoid refetching on order changes
  const idsKey = roomIds.slice().sort().join(",");

  useEffect(() => {
    if (roomIds.length === 0) {
      setCoverMap(new Map());
      return;
    }
    let cancelled = false;

    supabase
      .from("photos")
      .select("linked_to_id, url, caption, sort_order, created_at")
      .eq("linked_to_type", "room")
      .in("linked_to_id", roomIds)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("useRoomCoverPhotos fetch failed:", error);
          return;
        }
        const map = new Map<string, RoomCoverPhoto>();
        for (const row of data || []) {
          if (!map.has(row.linked_to_id)) {
            map.set(row.linked_to_id, {
              url: row.url,
              caption: row.caption,
            });
          }
        }
        setCoverMap(map);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  return coverMap;
}

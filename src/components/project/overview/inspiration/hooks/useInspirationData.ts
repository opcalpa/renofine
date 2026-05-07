import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { InspoPhoto, InspoRoom, MaterialCard, DisplaySize, CropPosition, FitMode, CropShape } from "../types";
import { BA_SOURCES } from "../types";

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface InspirationDataResult {
  rooms: InspoRoom[];
  /** All inspiration photos (excluding before/during/after) */
  allPhotos: InspoPhoto[];
  /** Before-phase photos */
  beforePhotos: InspoPhoto[];
  /** Material cards with room context */
  materialCards: MaterialCard[];
  /** Photos filtered by selected room */
  filteredPhotos: InspoPhoto[];
  /** Before/After grouped by room + phase */
  beforeAfterByRoom: Array<{
    id: string;
    name: string;
    before: InspoPhoto[];
    during: InspoPhoto[];
    after: InspoPhoto[];
  }>;
  /** Combined gallery photos (filtered inspiration + before) */
  allGalleryPhotos: InspoPhoto[];
  /** Total count of displayable content */
  totalCount: number;
  /** Raw query data for optimistic updates */
  rawData: { rooms: InspoRoom[]; photos: InspoPhoto[]; materialCards: MaterialCard[] } | undefined;
  /** Tasks for linking popover */
  tasks: Array<{ id: string; title: string }>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useInspirationData(
  projectId: string,
  selectedRoom: string,
): InspirationDataResult {
  const { t } = useTranslation();

  // Main query: rooms + photos + materials
  const { data } = useQuery({
    queryKey: ["inspiration", projectId],
    queryFn: async () => {
      const [roomsRes, photosRes, materialsRes, materialPhotosRes] =
        await Promise.all([
          supabase
            .from("rooms")
            .select("id, name")
            .eq("project_id", projectId)
            .order("name"),
          supabase
            .from("photos")
            .select(
              "id, url, caption, linked_to_id, linked_to_type, source, source_url, display_size, sort_order, crop_position, fit_mode, crop_zoom, crop_offset_x, crop_offset_y, crop_shape, grid_col_span, grid_row_span",
            )
            .or(
              "linked_to_type.eq.room,linked_to_type.eq.project,linked_to_type.eq.task",
            )
            .order("created_at", { ascending: false }),
          supabase
            .from("materials")
            .select("id, name, price_total, room_id")
            .eq("project_id", projectId)
            .not("room_id", "is", null),
          supabase
            .from("photos")
            .select("id, url, linked_to_id")
            .eq("linked_to_type", "material"),
        ]);

      const rooms: InspoRoom[] = roomsRes.data || [];
      const roomIds = new Set(rooms.map((r) => r.id));
      const roomMap = new Map(rooms.map((r) => [r.id, r.name]));

      const { data: taskRows } = await supabase
        .from("tasks")
        .select("id")
        .eq("project_id", projectId);
      const taskIds = new Set((taskRows || []).map((t) => t.id));

      const photos: InspoPhoto[] = (photosRes.data || [])
        .filter((p) => {
          if (p.linked_to_type === "project")
            return p.linked_to_id === projectId;
          if (p.linked_to_type === "room") return roomIds.has(p.linked_to_id);
          if (p.linked_to_type === "task") return taskIds.has(p.linked_to_id);
          return false;
        })
        .map((p) => ({
          id: p.id,
          url: p.url,
          caption: p.caption,
          source: p.source || "upload",
          sourceUrl: p.source_url || null,
          displaySize: (p.display_size as DisplaySize) || "md",
          sortOrder: p.sort_order || 0,
          cropPosition: (p.crop_position as CropPosition) || "center",
          fitMode: (p.fit_mode as FitMode) || "cover",
          cropZoom: p.crop_zoom ?? 1.0,
          cropOffsetX: p.crop_offset_x ?? 50,
          cropOffsetY: p.crop_offset_y ?? 50,
          cropShape: (p.crop_shape as CropShape) || "landscape",
          gridColSpan: p.grid_col_span ?? 3,
          gridRowSpan: p.grid_row_span ?? 2,
          roomId: p.linked_to_type === "room" ? p.linked_to_id : null,
          roomName:
            p.linked_to_type === "room"
              ? roomMap.get(p.linked_to_id) || null
              : null,
        }));

      const matPhotoMap = new Map<string, string>();
      for (const p of materialPhotosRes.data || []) {
        if (!matPhotoMap.has(p.linked_to_id))
          matPhotoMap.set(p.linked_to_id, p.url);
      }

      const materialCards: MaterialCard[] = (materialsRes.data || [])
        .filter((m) => matPhotoMap.has(m.id))
        .map((m) => ({
          id: m.id,
          name: m.name,
          price: m.price_total || 0,
          roomId: m.room_id,
          roomName: roomMap.get(m.room_id!) || null,
          photoUrl: matPhotoMap.get(m.id) || null,
        }));

      return { rooms, photos, materialCards };
    },
    staleTime: 60 * 1000,
  });

  // Tasks for linking
  const { data: tasks } = useQuery({
    queryKey: ["project-tasks-names", projectId],
    queryFn: async () => {
      const { data } = await supabase
        .from("tasks")
        .select("id, title")
        .eq("project_id", projectId)
        .order("title");
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Derived lists
  const rooms = data?.rooms || [];
  const allPhotos = useMemo(
    () => (data?.photos || []).filter((p) => !BA_SOURCES.has(p.source)),
    [data?.photos],
  );
  const beforePhotos = useMemo(
    () => (data?.photos || []).filter((p) => p.source === "before"),
    [data?.photos],
  );
  const materialCards = data?.materialCards || [];

  const filteredPhotos = useMemo(() => {
    if (selectedRoom === "all") return allPhotos;
    if (selectedRoom === "untagged")
      return allPhotos.filter((p) => !p.roomId);
    return allPhotos.filter((p) => p.roomId === selectedRoom);
  }, [allPhotos, selectedRoom]);

  const beforeAfterByRoom = useMemo(() => {
    const baPhotos = (data?.photos || []).filter((p) =>
      BA_SOURCES.has(p.source),
    );
    const targetPhotos =
      selectedRoom === "all"
        ? baPhotos
        : selectedRoom === "untagged"
          ? baPhotos.filter((p) => !p.roomId)
          : baPhotos.filter((p) => p.roomId === selectedRoom);
    const roomGroups = new Map<
      string,
      {
        name: string;
        before: InspoPhoto[];
        during: InspoPhoto[];
        after: InspoPhoto[];
      }
    >();

    for (const photo of targetPhotos) {
      const key = photo.roomId || "__none__";
      if (!roomGroups.has(key)) {
        roomGroups.set(key, {
          name: photo.roomName || t("tasks.noRoom"),
          before: [],
          during: [],
          after: [],
        });
      }
      const group = roomGroups.get(key)!;
      if (photo.source === "before") group.before.push(photo);
      else if (
        photo.source === "during" ||
        photo.source === "worker_progress"
      )
        group.during.push(photo);
      else if (
        photo.source === "after" ||
        photo.source === "worker_completed"
      )
        group.after.push(photo);
    }

    return Array.from(roomGroups.entries())
      .map(([id, d]) => ({ id, ...d }))
      .filter(
        (g) =>
          g.before.length > 0 || g.during.length > 0 || g.after.length > 0,
      );
  }, [data?.photos, selectedRoom, t]);

  const allGalleryPhotos = useMemo(
    () => [...filteredPhotos, ...beforePhotos],
    [filteredPhotos, beforePhotos],
  );

  const totalCount =
    allPhotos.length + materialCards.filter((m) => m.photoUrl).length;

  return {
    rooms,
    allPhotos,
    beforePhotos,
    materialCards,
    filteredPhotos,
    beforeAfterByRoom,
    allGalleryPhotos,
    totalCount,
    rawData: data,
    tasks: tasks || [],
  };
}

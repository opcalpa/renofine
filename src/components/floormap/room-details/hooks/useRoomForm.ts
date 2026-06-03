import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useFloorMapStore } from "../../store";
import type { FloorMapShape } from "../../types";
import type { Room, RoomFormData } from "../types";
import { DEFAULT_FORM_VALUES } from "../constants";

// Helper function to get darker version for stroke (70% darker)
const getDarkerColor = (rgbaColor: string): string => {
  const match = rgbaColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (match) {
    const r = Math.floor(parseInt(match[1]) * 0.7);
    const g = Math.floor(parseInt(match[2]) * 0.7);
    const b = Math.floor(parseInt(match[3]) * 0.7);
    return `rgba(${r}, ${g}, ${b}, 0.8)`;
  }
  return rgbaColor;
};

interface UseRoomFormOptions {
  room: Room | null;
  projectId: string;
  onRoomUpdated?: () => void;
  onClose?: () => void;
}

export function useRoomForm({ room, projectId, onRoomUpdated, onClose }: UseRoomFormOptions) {
  const { t } = useTranslation();
  const isNewRoom = !room;
  const [formData, setFormData] = useState<RoomFormData>(DEFAULT_FORM_VALUES);
  const [saving, setSaving] = useState(false);

  const updateShape = useFloorMapStore((state) => state.updateShape);

  // Initialize form data from room or defaults for new room
  useEffect(() => {
    if (room) {
      // Derive width/depth from the actual polygon so the fields always reflect the
      // real shape (drawn or canvas-resized), not a stale stored value. Falls back to
      // stored dimensions when there is no polygon yet.
      const pts = room.floor_plan_position?.points;
      const ppm = useFloorMapStore.getState().scaleSettings.pixelsPerMm;
      let derivedWidthMm = room.dimensions?.width_mm;
      let derivedDepthMm = room.dimensions?.height_mm;
      if (pts && pts.length >= 3 && ppm) {
        const xs = pts.map((p) => p.x);
        const ys = pts.map((p) => p.y);
        derivedWidthMm = Math.round((Math.max(...xs) - Math.min(...xs)) / ppm);
        derivedDepthMm = Math.round((Math.max(...ys) - Math.min(...ys)) / ppm);
      }

      setFormData({
        name: room.name || "",
        description: room.description || "",
        color: room.color || "rgba(59, 130, 246, 0.2)",
        status: room.status || "existing",
        ceiling_height_mm: room.ceiling_height_mm || 2400,
        priority: room.priority || "medium",
        links: room.links || "",
        notes: room.notes || "",
        area_sqm: room.dimensions?.area_sqm,
        width_mm: derivedWidthMm,
        depth_mm: derivedDepthMm,
        non_paintable_area_sqm: room.dimensions?.non_paintable_area_sqm,
        floor_spec: room.floor_spec || {},
        ceiling_spec: room.ceiling_spec || {},
        wall_spec: room.wall_spec || {},
        joinery_spec: room.joinery_spec || {},
        electrical_spec: room.electrical_spec || {},
        heating_spec: room.heating_spec || {},
        checklists: room.checklists || [],
      });
    } else {
      // Reset to defaults for new room
      setFormData(DEFAULT_FORM_VALUES);
    }
  }, [room]);

  // Update form data
  const updateFormData = useCallback((updates: Partial<RoomFormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  }, []);

  // Update a specific spec field
  const updateSpec = useCallback(
    <K extends keyof RoomFormData>(specKey: K, updates: Partial<RoomFormData[K]>) => {
      setFormData((prev) => ({
        ...prev,
        [specKey]: { ...(prev[specKey] as object), ...updates },
      }));
    },
    []
  );

  // Save handler - handles both create and update
  const handleSave = useCallback(async () => {
    if (!formData.name.trim()) {
      toast.error(t('roomForm.nameRequired', 'Room name is required'));
      return;
    }

    setSaving(true);
    try {
      // Approach A: if the user typed an exact Bredd × Djup that differs from the
      // room's current polygon, reshape the polygon to a rectangle of that size
      // (anchored at its current top-left). Comparing against the live polygon — not a
      // stored value — keeps this idempotent and prevents reverting a canvas resize.
      let reshapedPoints: { x: number; y: number }[] | null = null;
      let reshapedDims: { area_sqm: number; perimeter_mm: number } | null = null;
      if (!isNewRoom && formData.width_mm && formData.depth_mm) {
        const { scaleSettings, shapes } = useFloorMapStore.getState();
        const ppm = scaleSettings.pixelsPerMm;
        const roomShape = shapes.find((s) => s.roomId === room!.id && s.type === "room");
        const existingPoints =
          (roomShape?.coordinates as { points?: { x: number; y: number }[] } | undefined)?.points ??
          room?.floor_plan_position?.points;
        // Only reshape axis-aligned rectangles (4 corners) — never flatten an L-shape.
        if (existingPoints && existingPoints.length === 4 && ppm) {
          const xs = existingPoints.map((p) => p.x);
          const ys = existingPoints.map((p) => p.y);
          const minX = Math.min(...xs);
          const minY = Math.min(...ys);
          const curWidthMm = (Math.max(...xs) - minX) / ppm;
          const curDepthMm = (Math.max(...ys) - minY) / ppm;
          const changed =
            Math.abs(formData.width_mm - curWidthMm) > 1 ||
            Math.abs(formData.depth_mm - curDepthMm) > 1;
          if (changed) {
            const wPx = formData.width_mm * ppm;
            const hPx = formData.depth_mm * ppm;
            reshapedPoints = [
              { x: minX, y: minY },
              { x: minX + wPx, y: minY },
              { x: minX + wPx, y: minY + hPx },
              { x: minX, y: minY + hPx },
            ];
            reshapedDims = {
              area_sqm: (formData.width_mm * formData.depth_mm) / 1_000_000,
              perimeter_mm: 2 * (formData.width_mm + formData.depth_mm),
            };
          }
        }
      }

      // Build dimensions JSONB by merging with existing
      const existingDims = room?.dimensions ?? {};
      const dimensions = {
        ...existingDims,
        ...(formData.area_sqm !== undefined ? { area_sqm: formData.area_sqm } : {}),
        ...(formData.width_mm !== undefined ? { width_mm: formData.width_mm } : {}),
        ...(formData.depth_mm !== undefined ? { height_mm: formData.depth_mm } : {}),
        ...(formData.non_paintable_area_sqm !== undefined ? { non_paintable_area_sqm: formData.non_paintable_area_sqm } : {}),
        ...(reshapedDims ?? {}),
      };

      if (isNewRoom) {
        // Create new room
        const { error: createError } = await supabase
          .from("rooms")
          .insert({
            project_id: projectId,
            name: formData.name.trim(),
            description: formData.description?.trim() || null,
            color: formData.color,
            status: formData.status,
            ceiling_height_mm: formData.ceiling_height_mm,
            priority: formData.priority,
            links: formData.links?.trim() || null,
            notes: formData.notes?.trim() || null,
            dimensions,
            floor_spec: formData.floor_spec,
            ceiling_spec: formData.ceiling_spec,
            wall_spec: formData.wall_spec,
            joinery_spec: formData.joinery_spec,
            electrical_spec: formData.electrical_spec,
            heating_spec: formData.heating_spec,
            checklists: formData.checklists || [],
          });

        if (createError) throw createError;

        // Mark onboarding step for drawing first room
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase
            .from("profiles")
            .update({ onboarding_drawn_room: true })
            .eq("user_id", user.id);
        }

        toast.success(t('roomForm.roomCreated', 'Room created!'));
        onRoomUpdated?.();
        onClose?.();
      } else {
        // Update existing room
        const { error: roomError } = await supabase
          .from("rooms")
          .update({
            name: formData.name.trim(),
            description: formData.description?.trim() || null,
            color: formData.color,
            status: formData.status,
            ceiling_height_mm: formData.ceiling_height_mm,
            priority: formData.priority,
            links: formData.links?.trim() || null,
            notes: formData.notes?.trim() || null,
            dimensions,
            ...(reshapedPoints
              ? { floor_plan_position: { ...(room?.floor_plan_position ?? {}), points: reshapedPoints } }
              : {}),
            floor_spec: formData.floor_spec,
            ceiling_spec: formData.ceiling_spec,
            wall_spec: formData.wall_spec,
            joinery_spec: formData.joinery_spec,
            electrical_spec: formData.electrical_spec,
            heating_spec: formData.heating_spec,
            checklists: formData.checklists || [],
          })
          .eq("id", room!.id);

        if (roomError) throw roomError;

        // Update floor_map_shapes table (the shape on canvas)
        await supabase
          .from("floor_map_shapes")
          .update({
            color: formData.color,
            stroke_color: getDarkerColor(formData.color),
          })
          .eq("room_id", room!.id);

        // Update canvas state immediately - use getState() for fresh shapes
        const currentShapes = useFloorMapStore.getState().shapes;
        const roomShape = currentShapes.find((s) => s.roomId === room!.id && s.type === "room");
        if (roomShape) {
          updateShape(roomShape.id, {
            color: formData.color,
            strokeColor: getDarkerColor(formData.color),
            name: formData.name.trim(),
            ...(reshapedPoints
              ? { coordinates: { points: reshapedPoints } as FloorMapShape["coordinates"] }
              : {}),
          });
          // Rebuild auto-walls so they hug the resized room (no-op in pro mode).
          if (reshapedPoints) {
            useFloorMapStore.getState().regenerateAutoWalls();
          }
        }

        toast.success(t('roomForm.roomUpdated', 'Room updated!'));
        onRoomUpdated?.();
        onClose?.();
      }
    } catch (error) {
      console.error("Error saving room:", error);
      toast.error(isNewRoom
        ? t('roomForm.couldNotCreate', 'Could not create room')
        : t('roomForm.couldNotUpdate', 'Could not update room'));
    } finally {
      setSaving(false);
    }
  }, [room, isNewRoom, projectId, formData, updateShape, onRoomUpdated, onClose, t]);

  // Delete handler
  const handleDelete = useCallback(async () => {
    if (!room) return;

    if (
      !confirm(t('roomForm.confirmDelete', 'Are you sure you want to delete this room? This action cannot be undone.'))
    ) {
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from("rooms").delete().eq("id", room.id);

      if (error) throw error;

      // Remove the room's canvas shape and rebuild auto-walls so no ghost
      // outline lingers (DB cascade drops the shape row; the live store needs it too).
      const { shapes, deleteShapes, regenerateAutoWalls } = useFloorMapStore.getState();
      const roomShape = shapes.find((s) => s.roomId === room.id && s.type === "room");
      if (roomShape) {
        deleteShapes([roomShape.id]);
        regenerateAutoWalls();
      }

      toast.success(t('roomForm.roomDeleted', 'Room deleted!'));
      onRoomUpdated?.();
      onClose?.();
    } catch (error) {
      console.error("Error deleting room:", error);
      toast.error(t('roomForm.couldNotDelete', 'Could not delete room'));
    } finally {
      setSaving(false);
    }
  }, [room, onRoomUpdated, onClose, t]);

  return {
    formData,
    updateFormData,
    updateSpec,
    saving,
    isNewRoom,
    handleSave,
    handleDelete,
  };
}

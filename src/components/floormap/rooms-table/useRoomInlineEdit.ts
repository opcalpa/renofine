import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import type { Room, EditableFieldKey, EditingCell } from "./types";
import type { CeilingSpec, WallSpec, FloorSpec, JoinerySpec } from "../room-details/types";

export function useRoomInlineEdit(
  onRoomUpdated?: () => void,
  onOptimisticUpdate?: (roomId: string, updates: Partial<Room>) => void,
) {
  const { t } = useTranslation();
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editValue, setEditValue] = useState("");

  const startEditing = useCallback(
    (roomId: string, field: EditableFieldKey, currentValue: string) => {
      setEditingCell({ roomId, field });
      setEditValue(currentValue);
    },
    []
  );

  const cancelEditing = useCallback(() => {
    setEditingCell(null);
    setEditValue("");
  }, []);

  const saveEdit = useCallback(
    async (room: Room, overrideValue?: string) => {
      if (!editingCell) return;
      const { field } = editingCell;
      const value = (overrideValue ?? editValue).trim();

      // Build the update payload
      let updates: Record<string, unknown> = {};

      switch (field) {
        case "description":
        case "notes":
          updates[field] = value || null;
          break;

        case "trimColor":
          updates.joinery_spec = {
            ...(room.joinery_spec as JoinerySpec),
            frame_color: value || undefined,
          };
          break;

        case "wallColor":
          updates.wall_spec = {
            ...(room.wall_spec as WallSpec),
            main_color: value || undefined,
          };
          break;

        case "floorMaterial":
          updates.floor_spec = {
            ...(room.floor_spec as FloorSpec),
            material: value || undefined,
          };
          break;

        case "ceilingColor":
          updates.ceiling_spec = {
            ...(room.ceiling_spec as CeilingSpec),
            color: value || undefined,
          };
          break;

        case "ceilingHeight": {
          const meters = parseFloat(value);
          if (isNaN(meters) || meters <= 0) {
            cancelEditing();
            return;
          }
          updates.ceiling_height_mm = Math.round(meters * 1000);
          break;
        }

        case "area": {
          const sqm = parseFloat(value);
          if (isNaN(sqm) || sqm < 0) { cancelEditing(); return; }
          updates.dimensions = {
            ...(room.dimensions ?? {}),
            area_sqm: sqm || undefined,
          };
          break;
        }

        case "width": {
          const mm = parseFloat(value);
          if (value && (isNaN(mm) || mm < 0)) { cancelEditing(); return; }
          const dims = { ...(room.dimensions ?? {}) };
          dims.width_mm = value ? Math.round(mm) : undefined;
          // Auto-calculate area if both width and depth exist
          if (dims.width_mm && dims.height_mm) {
            dims.area_sqm = (dims.width_mm * dims.height_mm) / 1_000_000;
          }
          updates.dimensions = dims;
          break;
        }

        case "depth": {
          const mm = parseFloat(value);
          if (value && (isNaN(mm) || mm < 0)) { cancelEditing(); return; }
          const dims = { ...(room.dimensions ?? {}) };
          dims.height_mm = value ? Math.round(mm) : undefined;
          // Auto-calculate area if both width and depth exist
          if (dims.width_mm && dims.height_mm) {
            dims.area_sqm = (dims.width_mm * dims.height_mm) / 1_000_000;
          }
          updates.dimensions = dims;
          break;
        }

        case "status":
        case "priority":
          updates[field] = value || null;
          break;
      }

      // Optimistic update — reflect change in UI immediately
      onOptimisticUpdate?.(room.id, updates as Partial<Room>);
      cancelEditing();

      const { error } = await supabase
        .from("rooms")
        .update(updates)
        .eq("id", room.id);

      if (error) {
        console.error("Failed to update room:", error);
        toast.error(t("rooms.updateError", "Could not update room"));
        // Revert optimistic update by refetching
        onRoomUpdated?.();
      } else {
        toast.success(t("rooms.roomUpdated", "Room updated"));
        onRoomUpdated?.();
      }
    },
    [editingCell, editValue, cancelEditing, onRoomUpdated, onOptimisticUpdate, t]
  );

  return {
    editingCell,
    editValue,
    setEditValue,
    startEditing,
    cancelEditing,
    saveEdit,
  };
}

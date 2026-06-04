import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MapPin, Trash2 } from "lucide-react";
import { isRoomPlacedOnCanvas } from "../utils/roomPlacement";
import { useMeasurement } from "@/contexts/MeasurementContext";
import {
  ROOM_STATUS_OPTIONS,
  PRIORITY_OPTIONS,
  FLOOR_MATERIAL_OPTIONS,
} from "../room-details/constants";
import type { CeilingSpec, JoinerySpec } from "../room-details/types";
import { computeWallArea, computePaintEstimate } from "./computations";
import { useRoomInlineEdit } from "./useRoomInlineEdit";
import type { Room, FieldKey, EditableFieldKey, FieldDefinition } from "./types";

interface RoomsTableViewProps {
  rooms: Room[];
  visibleFields: FieldKey[];
  fieldDefinitions: FieldDefinition[];
  selectedRoomIds: Set<string>;
  onRoomClick: (room: Room) => void;
  onToggleSelection: (roomId: string) => void;
  onDeleteRoom?: (roomId: string) => void;
  onNavigateToRoom?: (room: Room) => void;
  onPlaceRoom?: (room: Room) => void;
  onRoomUpdated?: () => void;
  onOptimisticUpdate?: (roomId: string, updates: Partial<Room>) => void;
  formatDate: (dateString: string) => string;
  /** When false, hide the selection checkbox column. Defaults to true to preserve v1 behavior. */
  bulkMode?: boolean;
}

export function RoomsTableView({
  rooms,
  visibleFields,
  fieldDefinitions,
  selectedRoomIds,
  onRoomClick,
  onToggleSelection,
  onDeleteRoom,
  onNavigateToRoom,
  onPlaceRoom,
  onRoomUpdated,
  onOptimisticUpdate,
  formatDate,
  bulkMode = true,
}: RoomsTableViewProps) {
  const { t } = useTranslation();
  const ms = useMeasurement();
  const {
    editingCell,
    editValue,
    setEditValue,
    startEditing,
    cancelEditing,
    saveEdit,
  } = useRoomInlineEdit(onRoomUpdated, onOptimisticUpdate);


  const getStatusLabel = useCallback(
    (status: string | null | undefined) => {
      if (!status) return "\u2014";
      const opt = ROOM_STATUS_OPTIONS.find((o) => o.value === status);
      return opt ? t(opt.labelKey) : status;
    },
    [t]
  );

  const getPriorityLabel = useCallback(
    (priority: string | null | undefined) => {
      if (!priority) return "\u2014";
      const opt = PRIORITY_OPTIONS.find((o) => o.value === priority);
      return opt ? t(opt.labelKey) : priority;
    },
    [t]
  );

  const getFloorMaterialLabel = useCallback(
    (material: string | null | undefined) => {
      if (!material) return "\u2014";
      const opt = FLOOR_MATERIAL_OPTIONS.find((o) => o.value === material);
      return opt ? t(opt.labelKey) : material;
    },
    [t]
  );

  const getCellDisplayValue = useCallback(
    (room: Room, field: FieldKey): string => {
      switch (field) {
        case "area":
          return room.dimensions?.area_sqm
            ? `${room.dimensions.area_sqm.toFixed(2)} ${ms.areaLabel}`
            : "\u2014";
        case "width":
          return room.dimensions?.width_mm
            ? ms.fmtLength(room.dimensions.width_mm)
            : "\u2014";
        case "depth":
          return room.dimensions?.height_mm
            ? ms.fmtLength(room.dimensions.height_mm)
            : "\u2014";
        case "perimeter":
          return room.dimensions?.perimeter_mm
            ? ms.fmtLength(room.dimensions.perimeter_mm)
            : "\u2014";
        case "status":
          return getStatusLabel(room.status);
        case "floorMaterial":
          return getFloorMaterialLabel(room.floor_spec?.material);
        case "wallColor":
          return room.wall_spec?.main_color || "\u2014";
        case "ceilingHeight":
          return room.ceiling_height_mm
            ? ms.fmtLength(room.ceiling_height_mm)
            : "\u2014";
        case "priority":
          return getPriorityLabel(room.priority);
        case "created":
          return room.created_at ? formatDate(room.created_at) : "\u2014";
        case "description":
          return room.description || "\u2014";
        case "notes":
          return room.notes || "\u2014";
        case "ceilingColor": {
          const cs = room.ceiling_spec as CeilingSpec | null | undefined;
          return cs?.color || "\u2014";
        }
        case "trimColor": {
          const js = room.joinery_spec as JoinerySpec | null | undefined;
          return js?.frame_color || "\u2014";
        }
        case "wallArea": {
          const wa = computeWallArea(room);
          return wa !== null ? `${wa.toFixed(1)} ${ms.areaLabel}` : "\u2014";
        }
        case "paintEstimate": {
          const pe = computePaintEstimate(room);
          return pe !== null ? `~${pe} L` : "\u2014";
        }
        default:
          return "\u2014";
      }
    },
    [getStatusLabel, getPriorityLabel, getFloorMaterialLabel, formatDate]
  );

  const getEditableCurrentValue = useCallback(
    (room: Room, field: EditableFieldKey): string => {
      switch (field) {
        case "area":
          return room.dimensions?.area_sqm
            ? room.dimensions.area_sqm.toFixed(2)
            : "";
        case "width":
          return room.dimensions?.width_mm
            ? String(room.dimensions.width_mm)
            : "";
        case "depth":
          return room.dimensions?.height_mm
            ? String(room.dimensions.height_mm)
            : "";
        case "description":
          return room.description || "";
        case "notes":
          return room.notes || "";
        case "ceilingColor": {
          const cs = room.ceiling_spec as CeilingSpec | null | undefined;
          return cs?.color || "";
        }
        case "trimColor": {
          const js = room.joinery_spec as JoinerySpec | null | undefined;
          return js?.frame_color || "";
        }
        case "wallColor":
          return room.wall_spec?.main_color || "";
        case "floorMaterial":
          return room.floor_spec?.material || "";
        case "ceilingHeight":
          return room.ceiling_height_mm
            ? (room.ceiling_height_mm / 1000).toFixed(2)
            : "";
        case "status":
          return room.status || "";
        case "priority":
          return room.priority || "";
      }
    },
    []
  );

  const isEditing = (roomId: string, field: FieldKey) =>
    editingCell?.roomId === roomId && editingCell?.field === field;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, room: Room) => {
      if (e.key === "Enter") {
        e.preventDefault();
        saveEdit(room);
      } else if (e.key === "Escape") {
        cancelEditing();
      }
    },
    [saveEdit, cancelEditing]
  );

  const renderSelectCell = (
    room: Room,
    field: "status" | "priority" | "floorMaterial",
    options: { value: string; labelKey: string }[]
  ) => {
    if (isEditing(room.id, field)) {
      return (
        <Select
          value={editValue}
          onValueChange={(v) => {
            setEditValue(v);
            saveEdit(room, v);
          }}
          open
          onOpenChange={(open) => {
            if (!open) cancelEditing();
          }}
        >
          <SelectTrigger className="h-7 text-xs w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {t(opt.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    const display = getCellDisplayValue(room, field);
    return (
      <button
        type="button"
        className="w-full text-left px-1 py-0.5 rounded hover:bg-muted cursor-pointer text-xs"
        onClick={(e) => {
          e.stopPropagation();
          startEditing(
            room.id,
            field,
            getEditableCurrentValue(room, field)
          );
        }}
      >
        {field === "status" && room.status ? (
          <Badge variant="outline" className="text-xs">
            {display}
          </Badge>
        ) : (
          display
        )}
      </button>
    );
  };

  const renderEditableTextCell = (
    room: Room,
    field: EditableFieldKey
  ) => {
    if (isEditing(room.id, field)) {
      return (
        <Input
          autoFocus
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => saveEdit(room)}
          onKeyDown={(e) => handleKeyDown(e, room)}
          className="h-7 text-xs"
          type={["ceilingHeight", "area", "width", "depth"].includes(field) ? "number" : "text"}
          step={field === "ceilingHeight" || field === "area" ? "0.01" : field === "width" || field === "depth" ? "1" : undefined}
        />
      );
    }

    const display = getCellDisplayValue(room, field);
    return (
      <button
        type="button"
        className="w-full text-left px-1 py-0.5 rounded hover:bg-muted cursor-text text-xs truncate max-w-[200px]"
        onClick={(e) => {
          e.stopPropagation();
          startEditing(
            room.id,
            field,
            getEditableCurrentValue(room, field)
          );
        }}
        title={display !== "\u2014" ? display : undefined}
      >
        {display}
      </button>
    );
  };

  const renderCell = (room: Room, field: FieldKey) => {
    // Select-based editable fields
    if (field === "status") {
      return renderSelectCell(room, "status", ROOM_STATUS_OPTIONS);
    }
    if (field === "priority") {
      return renderSelectCell(room, "priority", PRIORITY_OPTIONS);
    }
    if (field === "floorMaterial") {
      return renderSelectCell(room, "floorMaterial", FLOOR_MATERIAL_OPTIONS);
    }

    // Text/number editable fields
    const def = fieldDefinitions.find((d) => d.key === field);
    if (def?.editable) {
      return renderEditableTextCell(room, field as EditableFieldKey);
    }

    // Read-only fields
    return (
      <span className="text-xs">{getCellDisplayValue(room, field)}</span>
    );
  };

  return (
    <div className="rounded-lg border bg-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted border-b">
            {bulkMode && <th className="w-10 px-3 py-2.5" />}
            <th className="px-3 py-2.5 text-left kicker">{t("rooms.roomName", "Namn")}</th>
            {visibleFields.map((field) => {
              const def = fieldDefinitions.find((f) => f.key === field);
              const isNumeric = def?.type === "number";
              return (
                <th key={field} className={`px-3 py-2.5 kicker whitespace-nowrap ${isNumeric ? "text-right" : "text-left"}`}>
                  {t(def?.labelKey || field)}
                </th>
              );
            })}
            <th className="w-20 px-2 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {rooms.map((room) => (
            <tr
              key={room.id}
              className={`border-b last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer ${
                selectedRoomIds.has(room.id) ? "bg-primary/5" : ""
              }`}
              onClick={() => onRoomClick(room)}
            >
              {bulkMode && (
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedRoomIds.has(room.id)}
                    onCheckedChange={() => onToggleSelection(room.id)}
                  />
                </td>
              )}
              <td className="px-3 py-2.5">
                <span className="font-medium truncate block max-w-[200px]">{room.name}</span>
              </td>
              {visibleFields.map((field) => {
                const def = fieldDefinitions.find((d) => d.key === field);
                const isNumeric = def?.type === "number";
                return (
                  <td
                    key={field}
                    className={`px-3 py-2.5 ${isNumeric ? "text-right" : ""}`}
                    onClick={(e) => { if (def?.editable) e.stopPropagation(); }}
                  >
                    {renderCell(room, field)}
                  </td>
                );
              })}
              <td className="px-2 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-end gap-1">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-7 w-7 ${
                            isRoomPlacedOnCanvas(room)
                              ? "text-green-600 hover:text-green-700 hover:bg-green-50"
                              : "text-muted-foreground hover:text-amber-600 hover:bg-amber-50"
                          }`}
                          onClick={() => {
                            if (isRoomPlacedOnCanvas(room)) {
                              onNavigateToRoom?.(room);
                            } else {
                              onPlaceRoom?.(room);
                            }
                          }}
                        >
                          <MapPin className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {isRoomPlacedOnCanvas(room)
                          ? t("rooms.showOnFloorPlan", "Visa på ritning")
                          : t("rooms.placeOnFloorPlan", "Placera på ritning")}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  {onDeleteRoom && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => onDeleteRoom(room.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {t("common.delete", "Ta bort")}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import type { Room } from "../room-details/types";

// Re-export Room so consumers only need one import
export type { Room };

// All possible field keys for the rooms table
export type FieldKey =
  | "area"
  | "perimeter"
  | "width"
  | "depth"
  | "status"
  | "floorMaterial"
  | "wallColor"
  | "ceilingHeight"
  | "priority"
  | "created"
  | "description"
  | "notes"
  | "ceilingColor"
  | "trimColor"
  | "wallArea"
  | "paintEstimate"
  | "tasks"
  | "purchases";

// Fields that support inline editing
export type EditableFieldKey =
  | "area"
  | "width"
  | "depth"
  | "description"
  | "notes"
  | "ceilingColor"
  | "trimColor"
  | "wallColor"
  | "floorMaterial"
  | "ceilingHeight"
  | "status"
  | "priority";

export interface EditingCell {
  roomId: string;
  field: EditableFieldKey;
}

export interface FieldDefinition {
  key: FieldKey;
  labelKey: string;
  editable: boolean;
}

export const FIELD_DEFINITIONS: FieldDefinition[] = [
  { key: "area", labelKey: "rooms.area", editable: true },
  { key: "width", labelKey: "rooms.width", editable: true },
  { key: "depth", labelKey: "rooms.depth", editable: true },
  { key: "perimeter", labelKey: "rooms.perimeter", editable: false },
  { key: "status", labelKey: "common.status", editable: true },
  { key: "floorMaterial", labelKey: "rooms.floorMaterial", editable: true },
  { key: "wallColor", labelKey: "rooms.wallColor", editable: true },
  { key: "ceilingHeight", labelKey: "rooms.ceilingHeight", editable: true },
  { key: "priority", labelKey: "rooms.priority", editable: true },
  { key: "created", labelKey: "rooms.createdOn", editable: false },
  { key: "description", labelKey: "rooms.customerWishes", editable: true },
  { key: "notes", labelKey: "rooms.internalNotes", editable: true },
  { key: "ceilingColor", labelKey: "rooms.ceilingColor", editable: true },
  { key: "trimColor", labelKey: "rooms.trimColor", editable: true },
  { key: "wallArea", labelKey: "rooms.wallArea", editable: false },
  { key: "paintEstimate", labelKey: "rooms.paintEstimate", editable: false },
  // Relations — read-only counts, so a room's actual use is visible from the list.
  { key: "tasks", labelKey: "rooms.tasksColumn", editable: false },
  { key: "purchases", labelKey: "rooms.purchasesColumn", editable: false },
];

export const DEFAULT_VISIBLE_FIELDS: FieldKey[] = ["area", "status", "created"];

// Saved view
export interface RoomSavedView {
  id: string;
  name: string;
  visibleFields: FieldKey[];
  sortOption: string;
  viewMode: "cards" | "table";
}

const VIEWS_STORAGE_KEY = (projectId: string) => `rooms-saved-views-${projectId}`;

export function loadSavedViews(projectId: string): RoomSavedView[] {
  try {
    const raw = localStorage.getItem(VIEWS_STORAGE_KEY(projectId));
    if (!raw) return [];
    return JSON.parse(raw) as RoomSavedView[];
  } catch {
    return [];
  }
}

export function persistSavedViews(projectId: string, views: RoomSavedView[]) {
  localStorage.setItem(VIEWS_STORAGE_KEY(projectId), JSON.stringify(views));
}

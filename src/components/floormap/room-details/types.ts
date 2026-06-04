import { z } from "zod";

// Checklist types (shared with tasks)
export interface ChecklistItem { id: string; title: string; completed: boolean; }
export interface Checklist { id: string; title: string; items: ChecklistItem[]; }

// Base room interface matching Supabase schema
export interface Room {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  color?: string | null;
  material?: string | null;
  status?: string | null;
  ceiling_height_mm?: number | null;
  priority?: string | null;
  links?: string | null;
  notes?: string | null;
  pinterest_board_url?: string | null;
  floor_spec?: FloorSpec | null;
  ceiling_spec?: CeilingSpec | null;
  wall_spec?: WallSpec | null;
  joinery_spec?: JoinerySpec | null;
  electrical_spec?: ElectricalSpec | null;
  heating_spec?: HeatingSpec | null;
  dimensions: {
    area_sqm?: number;
    width_mm?: number;
    height_mm?: number;
    perimeter_mm?: number;
    non_paintable_area_sqm?: number;
  } | null;
  floor_plan_position: {
    points?: { x: number; y: number }[];
  } | null;
  checklists?: Checklist[] | null;
  created_at: string;
  updated_at: string;
}

// JSONB spec types
export interface FloorSpec {
  material?: string;
  specification?: string;
  treatments?: string[];
  skirting_type?: string;
  skirting_color?: string;
}

export interface CeilingSpec {
  material?: string;
  color?: string;
  molding_type?: string;
}

export interface WallSpec {
  treatments?: string[];
  main_color?: string;
  has_accent_wall?: boolean;
  accent_wall_color?: string;
}

export interface JoinerySpec {
  door_type?: string;
  trim_type?: string;
  frame_color?: string;
}

export interface ElectricalSpec {
  series?: string;
  outlet_types?: string[];
  lighting_types?: string[];
}

export interface HeatingSpec {
  type?: string;
}

// Zod schemas for validation
export const floorSpecSchema = z.object({
  material: z.string().optional(),
  specification: z.string().optional(),
  treatments: z.array(z.string()).optional(),
  skirting_type: z.string().optional(),
  skirting_color: z.string().optional(),
});

export const ceilingSpecSchema = z.object({
  material: z.string().optional(),
  color: z.string().optional(),
  molding_type: z.string().optional(),
});

export const wallSpecSchema = z.object({
  treatments: z.array(z.string()).optional(),
  main_color: z.string().optional(),
  has_accent_wall: z.boolean().optional(),
  accent_wall_color: z.string().optional(),
});

export const joinerySpecSchema = z.object({
  door_type: z.string().optional(),
  trim_type: z.string().optional(),
  frame_color: z.string().optional(),
});

export const electricalSpecSchema = z.object({
  series: z.string().optional(),
  outlet_types: z.array(z.string()).optional(),
  lighting_types: z.array(z.string()).optional(),
});

export const heatingSpecSchema = z.object({
  type: z.string().optional(),
});

export const roomFormSchema = z.object({
  name: z.string().min(1, "Rumsnamn krävs"),
  description: z.string().optional(),
  color: z.string(),
  status: z.string(),
  ceiling_height_mm: z.number().min(1000).max(10000),
  priority: z.string(),
  links: z.string().optional(),
  notes: z.string().optional(),
  area_sqm: z.number().min(0).optional(),
  width_mm: z.number().min(0).optional(),
  depth_mm: z.number().min(0).optional(),
  non_paintable_area_sqm: z.number().min(0).optional(),
  floor_spec: floorSpecSchema,
  ceiling_spec: ceilingSpecSchema,
  wall_spec: wallSpecSchema,
  joinery_spec: joinerySpecSchema,
  electrical_spec: electricalSpecSchema,
  heating_spec: heatingSpecSchema,
  checklists: z.array(z.any()).optional(),
});

export type RoomFormData = z.infer<typeof roomFormSchema>;

// Props for RoomDetailDialog
export interface RoomDetailDialogProps {
  room: Room | null;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRoomUpdated?: () => void;
  /** Set to true when intentionally creating a new room (not loading existing room data) */
  isCreateMode?: boolean;
  /** Callback to open room elevation view */
  onViewElevation?: () => void;
  /** Show Pinterest features (only for homeowners) */
  showPinterest?: boolean;
  /** E3: hand off a room_items row to the floor planner for placement. Closes the dialog. */
  onPlaceItemOnPlan?: (args: { itemId: string; roomId: string; subtype: string }) => void;
}

// Props for section components
export interface SectionProps {
  formData: RoomFormData;
  updateFormData: (updates: Partial<RoomFormData>) => void;
  updateSpec: <K extends keyof RoomFormData>(
    specKey: K,
    updates: Partial<RoomFormData[K]>
  ) => void;
}

// Props for identity section (needs dimensions for display)
export interface IdentitySectionProps extends SectionProps {
  areaSqm?: number;
  perimeterMm?: number;
  createdAt?: string;
}

// Props for smart data section (needs area for calculations)
export interface SmartDataSectionProps extends SectionProps {
  areaSqm?: number;
  perimeterMm?: number;
}

// Photo type
export interface Photo {
  id: string;
  url: string;
  caption: string | null;
  created_at: string;
  linked_to_id: string;
  linked_to_type: string;
  uploaded_by_user_id: string;
  source?: string | null;
  source_url?: string | null;
  pinterest_pin_id?: string | null;
}

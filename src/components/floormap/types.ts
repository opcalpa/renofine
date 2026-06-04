// Shared types for Floor Map Editor
//
// COORDINATE SYSTEM & SCALE:
// ---------------------------
// This architectural drawing tool uses a millimeter-based coordinate system internally.
// All coordinates, dimensions, and measurements are stored in millimeters (mm) for precision.
// 
// SCALE FACTOR:
// The canvas operates in pixels, and the relationship between pixels and millimeters is
// controlled by the zoom/scale factor in the ViewState:
// - Base scale: 1 pixel = 1 millimeter (at zoom = 1.0)
// - Zoomed in: zoom > 1.0 (e.g., zoom = 2.0 means 2 pixels per mm)
// - Zoomed out: zoom < 1.0 (e.g., zoom = 0.5 means 0.5 pixels per mm)
//
// DRAWING WORKFLOW:
// 1. User clicks and drags on canvas (pixel coordinates)
// 2. Canvas coordinates are converted to world coordinates (mm) using zoom and pan offset
// 3. BuildingObjects (walls, windows, doors) are stored in mm
// 4. When rendering, mm coordinates are converted back to pixels using zoom factor
//
// GRID & SNAPPING:
// Grid size is defined in mm (default 500mm = 50cm)
// Snap to grid and snap to endpoints use mm-based calculations

export type SymbolType = 
  | 'line' 
  | 'rectangle' 
  | 'triangle'
  | 'circle' 
  // Linjer (Linear elements - professional architectural standard)
  | 'inner_wall'
  | 'outer_wall'
  | 'arch_window'
  | 'door_outward'
  | 'sliding_door'
  | 'wall_opening'
  | 'half_stairs'
  // Objekt (Objects - professional architectural symbols)
  | 'spiral_stairs'
  | 'straight_stairs'
  | 'arch_bathtub'
  | 'arch_toilet'
  | 'arch_sink'
  | 'arch_stove'
  | 'arch_outlet'
  | 'arch_switch'
  | 'arch_mirror'
  // Legacy Structural
  | 'door' 
  | 'window' 
  | 'doorstep'
  | 'radiator'
  | 'curtain'
  // Kitchen
  | 'floor_cabinet' 
  | 'wall_cabinet' 
  | 'sink_cabinet'
  | 'oven'
  | 'stove'
  | 'fridge'
  | 'dishwasher'
  // Bathroom
  | 'toilet' 
  | 'shower' 
  | 'bathtub' 
  | 'sink' 
  | 'mirror'
  | 'washing_machine'
  | 'dryer'
  // Furniture
  | 'bed'
  | 'bed_single'
  | 'bed_double' 
  | 'sofa'
  | 'table'
  | 'table_round'
  | 'table_square'
  | 'table_dining'
  | 'chair' 
  | 'wardrobe'
  | 'nightstand'
  | 'desk'
  | 'carpet'
  | 'lamp'
  | 'tv'
  | 'closet';

export interface BezierCoordinates {
  start: { x: number; y: number };
  control: { x: number; y: number };
  end: { x: number; y: number };
}

// Image coordinates for background images
export interface ImageCoordinates {
  x: number;
  y: number;
  width: number;
  height: number;
}

// 3D dimensions for unified 2D/3D rendering
export interface Dimensions3D {
  width: number;      // mm - X axis (along wall or local width)
  height: number;     // mm - Z axis (vertical, floor to top)
  depth: number;      // mm - Y axis (perpendicular to wall)
}

// 3D position for freestanding objects
export interface Position3D {
  x: number;          // mm - world X
  y: number;          // mm - world Y
  z: number;          // mm - height from floor
}

// Rotation in 3D space
export interface Rotation3D {
  x: number;          // radians - pitch
  y: number;          // radians - yaw
  z: number;          // radians - roll
}

// Asset references for 2D sprites and 3D models
export interface ShapeAssets {
  sprite2D?: string;     // URL to PNG sprite for 2D view
  spriteTop?: string;    // URL to top-down view sprite
  model3D?: string;      // URL to GLTF model for 3D view
  thumbnail?: string;    // URL for library preview
}

export type AnchorSide = 'n' | 'e' | 's' | 'w';

export interface FloorMapShape {
  id: string; // Unique persistent ID
  type: 'line' | 'rectangle' | 'wall' | 'circle' | 'polygon' | 'symbol' | 'measurement' | 'text' | 'sticky_note' | 'triangle' | 'door' | 'opening' | 'room' | 'freehand' | 'bezier' | 'window_line' | 'door_line' | 'sliding_door_line' | 'image' | 'connector';
  // Connector-specific: shape IDs + which anchor side the endpoint is bound to
  startShapeId?: string;
  startAnchor?: AnchorSide;
  endShapeId?: string;
  endAnchor?: AnchorSide;
  // Door/window specific properties
  openingDirection?: 'left' | 'right'; // For door_line - which way the door opens
  coordinates: LineCoordinates | RectangleCoordinates | CircleCoordinates | PolygonCoordinates | SymbolCoordinates | TextCoordinates | BezierCoordinates;
  heightMM?: number; // Wall height for elevation/3D view (for walls/lines)
  thicknessMM?: number; // Wall thickness (for walls/lines)

  // Unified 3D dimensions (mm) - drives both 2D and 3D rendering
  dimensions3D?: Dimensions3D;

  // 3D position when not wall-relative (freestanding furniture)
  position3D?: Position3D;

  // 3D rotation when not wall-relative
  rotation3D?: Rotation3D;

  // Asset references for image-based 2D rendering and 3D models
  assets?: ShapeAssets;
  roomId?: string; // Database reference if this is a saved room
  planId?: string; // Reference to the floor plan this shape belongs to
  symbolType?: SymbolType; // For symbol shapes
  text?: string; // For text shapes
  textStyle?: TextStyle; // Bold/italic for text shapes
  fontSize?: number; // Font size for text shapes
  textRotation?: TextRotation; // Fixed rotation angles for text (0, 90, 180, 270)
  hasBackground?: boolean; // Background rectangle for text
  rotation?: number; // Rotation angle in degrees
  notes?: string; // Construction notes and instructions for this object
  attachedToWall?: string; // ID of wall this door/opening is attached to
  positionOnWall?: number; // Position along wall (0-1)
  parentWallId?: string; // ID of wall this elevation shape belongs to (for elevation view objects)

  // Template grouping - shapes from same template placement share a groupId
  groupId?: string; // Unique ID linking shapes from the same template instance
  isGroupLeader?: boolean; // True for the "main" shape that represents the group
  templateInfo?: {
    templateId: string; // Original template ID
    templateName: string; // Template name for display
    category?: string; // Template category
    // Group bounding box in mm (for dimension display and scaling)
    boundsWidth: number;
    boundsHeight: number;
    boundsDepth?: number; // Height/depth for 3D/elevation
    // Original bounds for proportional scaling
    originalWidth: number;
    originalHeight: number;
    originalDepth?: number;
  };

  // Visual properties
  color?: string; // Fill color
  strokeColor?: string; // Stroke/border color
  strokeWidth?: number; // Stroke width in pixels
  opacity?: number; // 0-1

  // Layering
  zIndex?: number; // Z-index for layering (higher = on top)

  // View mode - which canvas view this shape belongs to
  shapeViewMode?: 'floor' | 'elevation' | 'both'; // Default: 'floor' for backward compatibility

  // Selection state
  selected?: boolean;
  
  // Room-specific properties
  name?: string; // Room name displayed on canvas
  area?: number; // Area in square meters (for rooms)

  // Image-specific properties (for background images)
  imageUrl?: string; // Public URL from Supabase storage
  imageOpacity?: number; // 0-1, default 0.5
  locked?: boolean; // Prevent accidental movement

  // Material properties (for walls, elevation shapes, etc.)
  material?: string; // Material type (e.g., 'gips', 'betong', 'tra')
  materialSpec?: string; // Material specification/details
  treatment?: string; // Surface treatment (e.g., 'malat', 'tapetserat')
  treatmentColor?: string; // Color/finish for treatment (e.g., NCS code)
  manufacturer?: string; // Product manufacturer
  productCode?: string; // Product code/article number

  metadata?: {
    lengthMM?: number;
    widthMM?: number;
    areaMM?: number;
    radiusMM?: number;
    perimeterMM?: number;
    // Elevation symbol metadata
    symbolType?: string; // Legacy elevation symbol type identifier
    category?: string; // Symbol category
    typicalHeightFromFloor?: number; // Typical installation height in mm
    materialNotes?: string; // Material/finish notes
    // Allow additional properties
    [key: string]: unknown;
  };

  // Wall-relative positioning (for synchronized floorplan/elevation views)
  wallRelative?: WallRelativePosition;
  objectCategory?: WallObjectCategory;
}

export interface FloorMapPlan {
  id: string;
  projectId: string;
  name: string;
  isDefault: boolean;
  viewSettings: ViewSettings;
  createdAt: string;
  updatedAt: string;
}

export interface ViewSettings {
  cameraX: number;
  cameraY: number;
  zoom: number;
  rotation?: number;
  mode: ViewMode;
  startingView?: {
    panX: number;
    panY: number;
    zoom: number;
  } | null;
}

export interface LineCoordinates {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface RectangleCoordinates {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CircleCoordinates {
  cx: number;
  cy: number;
  radius: number;
}

export interface PolygonCoordinates {
  points: { x: number; y: number }[];
}

export interface SymbolCoordinates {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextCoordinates {
  x: number;
  y: number;
  width?: number;  // Box width for resizable text
  height?: number; // Box height for resizable text
}

export interface TextStyle {
  isBold?: boolean;
  isItalic?: boolean;
}

export type TextRotation = 0 | 90 | 180 | 270;

export type FontSizePreset = 'small' | 'medium' | 'large' | 'xlarge';

export const FONT_SIZE_PRESETS: Record<FontSizePreset, number> = {
  small: 12,
  medium: 16,
  large: 24,
  xlarge: 36,
};

export type ViewMode = 'floor' | 'elevation' | '3d';
export type Tool = 'select' | 'freehand' | 'wall' | 'room' | 'eraser' | 'rectangle' | 'circle' | 'triangle' | 'polygon' | 'symbol' | 'object' | 'measure' | 'text' | 'sticky_note' | 'pan' | 'door' | 'opening' | 'scissors' | 'glue' | 'bezier' | 'window_line' | 'door_line' | 'sliding_door_line' | 'opening_line' | 'connector';
export type Unit = 'mm' | 'cm' | 'm' | 'inch' | 'ft' | 'yd';
export type MeasurementSystem = 'metric' | 'imperial';

export interface GridSettings {
  show: boolean;
  snap: boolean;
  size: number; // in mm
  unit: Unit; // Display unit
}

export interface ScaleSettings {
  pixelsPerMm: number; // How many pixels represent 1mm
  name: string; // Display name
  description: string; // Description for UI
}

export type ScalePreset = 'architectural' | 'detailed' | 'standard' | 'overview';
export type GridPreset = 'fine' | 'standard' | 'coarse';

export interface ViewState {
  zoom: number;
  panX: number;
  panY: number;
}

// ============================================================================
// WALL-RELATIVE COORDINATE SYSTEM
// ============================================================================
// Objects attached to walls store position relative to the wall, not absolute.
// This enables IKEA Kitchen Planner / Revit-style synchronization:
// - Floorplan shows objects from above (bird's eye)
// - Elevation view shows objects from the front (face-on)
// - Moving/resizing in either view updates the same underlying data

/**
 * Position of an object relative to a wall.
 * All measurements in millimeters (mm).
 */
export interface WallRelativePosition {
  wallId: string;                    // Which wall this object is attached to
  distanceFromWallStart: number;     // mm from wall start point (along wall direction)
  perpendicularOffset: number;       // mm from wall surface (+ = into room, - = outside)
  elevationBottom: number;           // mm from floor (bottom of object)
  width: number;                     // mm (along wall direction)
  height: number;                    // mm (vertical in elevation view)
  depth: number;                     // mm (perpendicular to wall into room)
}

/**
 * Object categories with predefined elevation heights.
 * These correspond to typical installation heights in construction.
 */
export type WallObjectCategory =
  | 'floor_cabinet'      // elevationBottom: 0mm (sits on floor)
  | 'wall_cabinet'       // elevationBottom: 1400mm (mounted on wall)
  | 'countertop'         // elevationBottom: 850mm (kitchen counter height)
  | 'appliance_floor'    // elevationBottom: 0mm (fridge, dishwasher, etc.)
  | 'appliance_wall'     // elevationBottom: varies (wall oven, microwave, etc.)
  | 'window'             // elevationBottom: 900mm (typical window sill)
  | 'door'               // elevationBottom: 0mm (starts at floor)
  | 'decoration'         // elevationBottom: 1200mm (artwork, mirrors, etc.)
  | 'electrical_outlet'  // elevationBottom: 200mm (Swedish standard outlet height)
  | 'electrical_switch'  // elevationBottom: 1000mm (Swedish standard switch height)
  | 'custom';

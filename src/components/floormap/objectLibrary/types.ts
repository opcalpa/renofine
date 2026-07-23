/**
 * Unified Object Library Types
 *
 * Professional BIM-style object definitions that:
 * - Use SVG paths for crisp, scalable symbols
 * - Behave as single units (no separable sub-shapes)
 * - Work in both Floor Plan and Elevation views
 * - Follow IEC 60617 / SS-EN standards for electrical symbols
 */

export type ObjectCategory =
  | 'electrical'
  | 'plumbing'
  | 'kitchen'
  | 'appliances'
  | 'furniture'
  | 'doors'
  | 'windows'
  | 'hvac'
  | 'lighting'
  | 'custom';

export type WallAttachmentSide = 'interior' | 'exterior' | 'both' | 'none';

/**
 * SVG Symbol definition
 * Uses SVG path data for professional vector graphics
 */
export interface SVGSymbol {
  /** SVG viewBox (e.g., "0 0 100 100") */
  viewBox: string;
  /** SVG path data strings */
  paths: Array<{
    d: string;           // Path data
    fill?: string;       // Fill color (default: none)
    stroke?: string;     // Stroke color (default: currentColor)
    strokeWidth?: number; // Stroke width (default: 2)
  }>;
  /** Default fill color for the symbol */
  defaultFill?: string;
  /** Default stroke color for the symbol */
  defaultStroke?: string;
}

/**
 * Wall attachment behavior
 */
export interface WallBehavior {
  /** Does this object attach to walls? */
  attachesToWall: boolean;
  /** Does it penetrate the wall? (doors, windows) */
  penetratesWall: boolean;
  /** Default height from floor in mm */
  defaultElevationMM: number;
  /** Which side of wall it attaches to */
  side: WallAttachmentSide;
  /** Can be flipped/mirrored */
  canFlip: boolean;
  /** Can be rotated */
  canRotate: boolean;
}

/**
 * 3D Dimensions in millimeters
 */
export interface Dimensions3D {
  /** Width (X-axis) - horizontal extent */
  width: number;
  /** Height (Y-axis) - vertical extent (visible in elevation) */
  height: number;
  /** Depth (Z-axis) - how far it protrudes from wall */
  depth: number;
}

/**
 * Unified Object Definition
 *
 * A single definition that works for both floor plan and elevation views.
 * Objects are rendered as single units that cannot be broken apart.
 */
export interface UnifiedObjectDefinition {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** i18n key for translation */
  nameKey: string;
  /** Category for organization */
  category: ObjectCategory;

  // === DIMENSIONS ===
  /** Physical dimensions in mm */
  dimensions: Dimensions3D;

  // === SYMBOLS ===
  /** Symbol for floor plan view (top-down) */
  floorPlanSymbol: SVGSymbol;
  /** Symbol for elevation/wall view (front-facing) */
  elevationSymbol: SVGSymbol;

  // === BEHAVIOR ===
  /** Wall attachment behavior */
  wallBehavior: WallBehavior;

  // === METADATA ===
  /** Search tags */
  tags: string[];
  /** Optional manufacturer */
  manufacturer?: string;
  /** Optional article number */
  articleNumber?: string;
  /** Description */
  description?: string;
}

/**
 * Placed object instance on canvas
 */
export interface PlacedObject {
  /** Unique instance ID */
  id: string;
  /** Reference to object definition */
  definitionId: string;
  /** Plan ID this object belongs to */
  planId: string;

  // === POSITION ===
  /** Position in floor plan (mm) */
  position: { x: number; y: number };
  /** Rotation in degrees */
  rotation: number;
  /** Scale factor (1 = 100%) */
  scale: number;
  /** Is horizontally flipped */
  flipped: boolean;

  // === WALL ATTACHMENT ===
  /** Attached wall ID (if wall-attached) */
  attachedWallId?: string;
  /** Position along wall (0-1) */
  positionOnWall?: number;
  /** Elevation from floor in mm */
  elevationMM?: number;

  // === METADATA ===
  /** Custom label */
  label?: string;
  /** Notes */
  notes?: string;
  /** Room this object belongs to */
  roomId?: string;
}

/**
 * Object library category with objects
 */
export interface ObjectLibraryCategory {
  id: ObjectCategory;
  nameKey: string;
  icon: string;
  objects: UnifiedObjectDefinition[];
}

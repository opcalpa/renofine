/**
 * Unified Object Library
 *
 * Professional BIM-style object library with:
 * - SVG-based symbols
 * - Single-unit object handling
 * - Cross-view compatibility (Floor Plan + Elevation)
 */

// Types
export * from './types';

// Components
export { UnifiedObjectShape } from './UnifiedObjectShape';
export { ObjectLibraryPanel } from './ObjectLibraryPanel';

// Definitions - Electrical
export { ELECTRICAL_OBJECTS } from './definitions/electrical';
export {
  SINGLE_OUTLET,
  DOUBLE_OUTLET,
  LIGHT_SWITCH,
  DIMMER_SWITCH,
  USB_OUTLET,
  DATA_OUTLET,
  TV_OUTLET,
  CEILING_LAMP,
} from './definitions/electrical';

// Definitions - Kitchen
export { KITCHEN_OBJECTS } from './definitions/kitchen';
export {
  BASE_CABINET,
  WALL_CABINET,
  TALL_CABINET,
  REFRIGERATOR,
  FREEZER,
  DISHWASHER,
  OVEN,
  COOKTOP,
  RANGE_HOOD,
  SINK,
} from './definitions/kitchen';

// Definitions - Plumbing & Furniture
export { PLUMBING_OBJECTS } from './definitions/plumbing';
export { FURNITURE_OBJECTS } from './definitions/furniture';

// Get all objects
import { ELECTRICAL_OBJECTS } from './definitions/electrical';
import { KITCHEN_OBJECTS } from './definitions/kitchen';
import { PLUMBING_OBJECTS } from './definitions/plumbing';
import { FURNITURE_OBJECTS } from './definitions/furniture';
import { UnifiedObjectDefinition } from './types';

export const ALL_OBJECTS: UnifiedObjectDefinition[] = [
  ...ELECTRICAL_OBJECTS,
  ...KITCHEN_OBJECTS,
  ...PLUMBING_OBJECTS,
  ...FURNITURE_OBJECTS,
];

/**
 * Get object definition by ID
 */
export function getUnifiedObjectById(id: string): UnifiedObjectDefinition | undefined {
  return ALL_OBJECTS.find(obj => obj.id === id);
}

/**
 * Get objects by category
 */
export function getObjectsByCategory(category: string): UnifiedObjectDefinition[] {
  return ALL_OBJECTS.filter(obj => obj.category === category);
}

type ObjectCategoryShape = {
  objectCategory?: unknown;
  metadata?: { unifiedObjectId?: unknown } | null;
};

/**
 * The object-library category of a placed shape ('electrical', 'kitchen', ...),
 * or null if the shape is not a library object (rooms, walls, freehand, ...).
 * Resolved from the unified object definition, falling back to objectCategory.
 * This is the canvas object taxonomy — distinct from the room_items category.
 */
export function getShapeObjectCategory(shape: ObjectCategoryShape): string | null {
  const defId = shape.metadata?.unifiedObjectId;
  if (typeof defId === 'string') {
    const def = getUnifiedObjectById(defId);
    if (def) return def.category;
  }
  const cat = typeof shape.objectCategory === 'string' ? shape.objectCategory : '';
  if (!cat) return null;
  return cat.startsWith('electrical') ? 'electrical' : cat;
}

/**
 * Whether a placed shape should be hidden given the set of hidden categories.
 * Used by the per-category canvas filter (generalizes the old El-filter).
 */
export function isObjectCategoryHidden(shape: ObjectCategoryShape, hidden: string[]): boolean {
  if (!hidden || hidden.length === 0) return false;
  const cat = getShapeObjectCategory(shape);
  return cat != null && hidden.includes(cat);
}

/**
 * Whether a placed shape is an electrical object (outlet, switch, lamp, ...).
 * Used by the elevation install-status badge.
 */
export function isElectricalShape(shape: ObjectCategoryShape): boolean {
  return getShapeObjectCategory(shape) === 'electrical';
}

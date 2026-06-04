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

// Get all objects
import { ELECTRICAL_OBJECTS } from './definitions/electrical';
import { KITCHEN_OBJECTS } from './definitions/kitchen';
import { UnifiedObjectDefinition } from './types';

export const ALL_OBJECTS: UnifiedObjectDefinition[] = [
  ...ELECTRICAL_OBJECTS,
  ...KITCHEN_OBJECTS,
  // Add more categories here as they're created:
  // ...PLUMBING_OBJECTS,
  // ...FURNITURE_OBJECTS,
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

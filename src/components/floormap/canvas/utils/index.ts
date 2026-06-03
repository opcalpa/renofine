/**
 * Canvas Utilities
 *
 * Re-exports all utility functions for the canvas.
 */

export { throttle } from './throttle';
export { createUnifiedDragHandlers, clearDragState } from './dragSystem';

// Scale conversion helpers
export {
  getPixelsPerMm,
  getPixelsPerCm,
  getPixelsPerMeter,
  getGridLevels,
  getActiveGridLevels,
  getScaleRepresentation,
  formatDimension,
} from './scale';

export type { GridLevel } from './scale';

// Grid snapping helpers
export {
  getSnapSize,
  snapToGrid,
  snapDelta,
} from './snap';

// Room edge snapping (magnetic alignment to neighbouring rooms)
export {
  getEdgeSnapThreshold,
  collectRoomBBoxes,
  snapRectEdgesToRooms,
  edgeSnapNudge,
  snapDoorToRoomEdge,
} from './roomSnap';
export type { BBox } from './roomSnap';
export { computeRoomWallBreaks, isOpeningShape } from './wallBreaks';
export type { WallSegment, OpeningGap } from './wallBreaks';

// Shape connection helpers (auto-grouping, magnetic snap)
export {
  findConnectedShapes,
  findNearestWallEndpoint,
  areWallsConnected,
  getConnectedWalls,
} from './shapeConnections';

// Wall-relative coordinate system utilities
export {
  getWallGeometry,
  worldToWallRelative,
  wallRelativeToWorld,
  wallRelativeToElevation,
  elevationToWallRelative,
  findNearestWallForPoint,
  calculateWallAttachment,
} from './wallCoordinates';

export type { WallGeometry } from './wallCoordinates';

// Wall object defaults
export {
  OBJECT_CATEGORY_DEFAULTS,
  getDefaultsForCategory,
  getDefaultElevation,
  CATEGORY_LABELS,
  getCategoryLabel,
  inferCategoryFromSymbolType,
} from './wallObjectDefaults';

export type { ObjectCategoryDefaults } from './wallObjectDefaults';

// Fit-to-content (auto-fit view to all shapes)
export { calculateFitToContent } from './fitToContent';

// View synchronization
export {
  syncWallRelativeFromFloorplan,
  syncFromElevation,
  snapObjectToWall,
  detachFromWall,
  updateObjectElevation,
  setObjectCategory,
  hasValidWallRelative,
  initializeWallRelative,
} from './viewSync';

/**
 * Simple Drag System
 *
 * Principle: Let Konva handle dragging, only intervene at the end.
 * - During drag: Konva moves the node naturally
 * - On drag end: Read delta, apply snap, update store
 * - Multi-select: Apply same delta to all selected shapes
 * - Option/Alt-drag: Duplicate shape instead of moving
 */

import Konva from 'konva';
import { KonvaEventObject } from 'konva/lib/Node';
import { useFloorMapStore } from '../../store';
import { FloorMapShape } from '../../types';
import { findNearestWall, projectOntoWall, splitWall, isOpeningType, findMergeableWalls, findWallGap } from '../../utils/wallSnap';
import { snapObjectToWall as snapToWallRelative, syncWallRelativeFromFloorplan } from './viewSync';
import { findNearestWallForPoint, getWallGeometry } from './wallCoordinates';
import { getRoomBBox, collectRoomBBoxes, edgeSnapNudge, getEdgeSnapThreshold } from './roomSnap';
import { v4 as uuidv4 } from 'uuid';

/**
 * Apply delta to shape coordinates based on shape type
 */
function applyDelta(
  shape: FloorMapShape,
  deltaX: number,
  deltaY: number
): Partial<FloorMapShape> {
  const coords = shape.coordinates as Record<string, unknown>;

  // Handle library symbols (freehand with metadata.isLibrarySymbol)
  // These use metadata.placementX/Y instead of coordinates
  if (shape.metadata?.isLibrarySymbol) {
    return {
      metadata: {
        ...shape.metadata,
        placementX: (shape.metadata.placementX || 0) + deltaX,
        placementY: (shape.metadata.placementY || 0) + deltaY,
      }
    };
  }

  switch (shape.type) {
    case 'wall':
    case 'line':
    case 'door_line':
    case 'window_line':
    case 'sliding_door_line':
    case 'connector':
      return {
        coordinates: {
          x1: (coords.x1 as number) + deltaX,
          y1: (coords.y1 as number) + deltaY,
          x2: (coords.x2 as number) + deltaX,
          y2: (coords.y2 as number) + deltaY,
        }
      };

    case 'rectangle':
    case 'door':
    case 'opening':
      return {
        coordinates: {
          ...coords,
          left: (coords.left as number) + deltaX,
          top: (coords.top as number) + deltaY,
        }
      };

    case 'circle':
      return {
        coordinates: {
          ...coords,
          cx: (coords.cx as number) + deltaX,
          cy: (coords.cy as number) + deltaY,
        }
      };

    case 'room':
    case 'polygon':
    case 'freehand':
      const points = coords.points as Array<{ x: number; y: number }>;
      return {
        coordinates: {
          points: points.map(p => ({
            x: p.x + deltaX,
            y: p.y + deltaY,
          }))
        }
      };

    case 'text':
    case 'sticky_note':
      return {
        coordinates: {
          ...coords,
          x: (coords.x as number) + deltaX,
          y: (coords.y as number) + deltaY,
        }
      };

    case 'symbol':
      return {
        coordinates: {
          ...coords,
          x: ((coords.x as number) || 0) + deltaX,
          y: ((coords.y as number) || 0) + deltaY,
        }
      };

    case 'image':
      return {
        coordinates: {
          ...coords,
          x: (coords.x as number) + deltaX,
          y: (coords.y as number) + deltaY,
        }
      };

    case 'bezier':
      const start = coords.start as { x: number; y: number };
      const control = coords.control as { x: number; y: number };
      const end = coords.end as { x: number; y: number };
      return {
        coordinates: {
          start: { x: start.x + deltaX, y: start.y + deltaY },
          control: { x: control.x + deltaX, y: control.y + deltaY },
          end: { x: end.x + deltaX, y: end.y + deltaY },
        }
      };

    default:
      return {};
  }
}

// Module-level read-only flag to prevent drag in view-only mode
let _isReadOnly = false;
export function setDragSystemReadOnly(readOnly: boolean) {
  _isReadOnly = readOnly;
}

/**
 * Create a duplicate of a shape with a new ID
 */
function duplicateShape(shape: FloorMapShape): FloorMapShape {
  const newId = uuidv4();
  const duplicate: FloorMapShape = {
    ...shape,
    id: newId,
    // Clear any wall attachment on duplicate
    attachedToWall: undefined,
    positionOnWall: undefined,
    // Clear group membership - duplicate is independent
    groupId: undefined,
  };

  // Deep copy coordinates to avoid reference issues
  if (shape.coordinates) {
    duplicate.coordinates = JSON.parse(JSON.stringify(shape.coordinates));
  }

  // Deep copy metadata if present
  if (shape.metadata) {
    duplicate.metadata = JSON.parse(JSON.stringify(shape.metadata));
  }

  return duplicate;
}

/**
 * Helper to get all shapes that should move together
 * Handles both explicit selection and group membership
 */
function getShapesToMoveWithShape(shapeId: string): string[] {
  const state = useFloorMapStore.getState();
  const { shapes, selectedShapeIds } = state;

  // Find the dragged shape
  const draggedShape = shapes.find(s => s.id === shapeId);
  if (!draggedShape) return [shapeId];

  // If shape belongs to a group, include all group members
  if (draggedShape.groupId) {
    const groupShapeIds = shapes
      .filter(s => s.groupId === draggedShape.groupId)
      .map(s => s.id);

    // Merge with any other selected shapes (in case multiple groups are selected)
    const allIds = new Set([...selectedShapeIds, ...groupShapeIds]);
    return Array.from(allIds);
  }

  // Otherwise, use the current selection if it includes this shape
  if (selectedShapeIds.length > 1 && selectedShapeIds.includes(shapeId)) {
    return selectedShapeIds;
  }

  return [shapeId];
}

/**
 * Creates simple drag handlers for a shape
 * Works with both single shapes, multi-select, and grouped templates
 * Supports Option/Alt-drag to duplicate shapes
 */
export function createDragHandlers(shapeId: string) {
  // Cache the shapes to move during a drag operation
  let shapesToMoveDuringDrag: string[] = [];
  // Store start positions to calculate true drag deltas
  let dragStartPos = { x: 0, y: 0 };
  let otherStartPositions = new Map<string, { x: number; y: number }>();
  // Option-drag duplication state
  let isDuplicating = false;
  let duplicatedShapeIds: string[] = [];
  let originalToNewIdMap = new Map<string, string>();

  return {
    draggable: !_isReadOnly && !(useFloorMapStore.getState().shapes.find(s => s.id === shapeId)?.locked),
    onDragStart: (e: KonvaEventObject<DragEvent>) => {
      const isLocked = useFloorMapStore.getState().shapes.find(s => s.id === shapeId)?.locked;
      if (_isReadOnly || isLocked) { e.target.stopDrag(); e.cancelBubble = true; return; }
      e.cancelBubble = true;

      // Store the primary node's start position for accurate delta calculation
      dragStartPos = { x: e.target.x(), y: e.target.y() };

      // Determine which shapes should move together
      shapesToMoveDuringDrag = getShapesToMoveWithShape(shapeId);

      // Detect Option (Mac) / Alt (Windows) key for duplicate-drag
      const nativeEvent = e.evt;
      isDuplicating = nativeEvent.altKey;
      duplicatedShapeIds = [];
      originalToNewIdMap.clear();

      // If Option/Alt is held, create duplicates of all shapes being dragged
      const state = useFloorMapStore.getState();
      if (isDuplicating) {
        const { shapes, addShape, setSelectedShapeIds } = state;
        const newShapeIds: string[] = [];

        shapesToMoveDuringDrag.forEach(id => {
          const originalShape = shapes.find(s => s.id === id);
          if (originalShape) {
            const duplicate = duplicateShape(originalShape);
            addShape(duplicate);
            duplicatedShapeIds.push(duplicate.id);
            originalToNewIdMap.set(id, duplicate.id);
            newShapeIds.push(duplicate.id);
          }
        });

        // Select the new duplicates
        if (newShapeIds.length > 0) {
          setSelectedShapeIds(newShapeIds);
        }
      }

      // Store start positions for other nodes in the drag group
      otherStartPositions.clear();
      if (shapesToMoveDuringDrag.length > 1) {
        const stage = e.target.getStage();
        if (stage) {
          shapesToMoveDuringDrag.forEach(id => {
            if (id !== shapeId) {
              const node = stage.findOne(`#shape-${id}`);
              if (node) {
                otherStartPositions.set(id, { x: node.x(), y: node.y() });
              }
            }
          });
        }
      }

      // If this shape is part of a group, auto-select all group members
      const draggedShape = state.shapes.find(s => s.id === shapeId);
      if (draggedShape?.groupId && !isDuplicating) {
        const groupShapeIds = state.shapes
          .filter(s => s.groupId === draggedShape.groupId)
          .map(s => s.id);
        // Only update if not already all selected
        const allSelected = groupShapeIds.every(id => state.selectedShapeIds.includes(id));
        if (!allSelected) {
          state.setSelectedShapeIds(groupShapeIds);
        }
      }
    },

    onDragMove: (e: KonvaEventObject<DragEvent>) => {
      e.cancelBubble = true;

      const currentDelta = {
        x: e.target.x() - dragStartPos.x,
        y: e.target.y() - dragStartPos.y,
      };

      // Move all shapes that should move together
      if (shapesToMoveDuringDrag.length > 1) {
        // Move all other shapes visually by the same delta
        const stage = e.target.getStage();
        if (stage) {
          shapesToMoveDuringDrag.forEach(id => {
            if (id !== shapeId) {
              const node = stage.findOne(`#shape-${id}`);
              if (node) {
                const startPos = otherStartPositions.get(id) || { x: 0, y: 0 };
                node.position({
                  x: startPos.x + currentDelta.x,
                  y: startPos.y + currentDelta.y,
                });
              }
            }
          });
        }
      }

      // Wall snap preview for single shapes (symbols, openings)
      if (shapesToMoveDuringDrag.length === 1) {
        const state = useFloorMapStore.getState();
        const { shapes, setWallSnapPreview } = state;
        const draggedShape = shapes.find(s => s.id === shapeId);

        if (draggedShape) {
          const isGroupedShape = draggedShape.groupId != null;
          // Check for various object types that can snap to walls
          const isSymbolOrOpening = draggedShape.type === 'symbol' ||
                                     draggedShape.symbolType ||
                                     isOpeningType(draggedShape.type) ||
                                     draggedShape.wallRelative ||
                                     draggedShape.metadata?.isUnifiedObject ||
                                     draggedShape.objectCategory;

          if (!isGroupedShape && isSymbolOrOpening) {
            // Get object center position after delta
            const coords = draggedShape.coordinates as Record<string, unknown>;
            let centerX: number;
            let centerY: number;

            if ('x' in coords && 'width' in coords) {
              centerX = (coords.x as number) + (coords.width as number) / 2 + currentDelta.x;
              centerY = (coords.y as number) + ((coords.height as number) || (coords.width as number)) / 2 + currentDelta.y;
            } else if ('x1' in coords) {
              // Opening types (door, window)
              centerX = ((coords.x1 as number) + (coords.x2 as number)) / 2 + currentDelta.x;
              centerY = ((coords.y1 as number) + (coords.y2 as number)) / 2 + currentDelta.y;
            } else if ('points' in coords) {
              // Freehand/polygon shapes - calculate bounding box center
              const points = coords.points as Array<{ x: number; y: number }>;
              if (points && points.length > 0) {
                const minX = Math.min(...points.map(p => p.x));
                const maxX = Math.max(...points.map(p => p.x));
                const minY = Math.min(...points.map(p => p.y));
                const maxY = Math.max(...points.map(p => p.y));
                centerX = (minX + maxX) / 2 + currentDelta.x;
                centerY = (minY + maxY) / 2 + currentDelta.y;
              } else {
                setWallSnapPreview(null);
                return;
              }
            } else {
              setWallSnapPreview(null);
              return;
            }

            // Find nearest wall
            const walls = shapes.filter(
              s => (s.type === 'wall' || s.type === 'line') &&
                   s.shapeViewMode !== 'elevation' &&
                   s.id !== shapeId
            );

            const SNAP_THRESHOLD = 500; // 500mm = 50cm
            const nearest = findNearestWallForPoint(centerX, centerY, walls, SNAP_THRESHOLD);

            if (nearest) {
              const geom = getWallGeometry(nearest.wall);
              if (geom) {
                // Calculate snap point on wall
                const snapX = geom.x1 + nearest.t * (geom.x2 - geom.x1);
                const snapY = geom.y1 + nearest.t * (geom.y2 - geom.y1);
                const snapRotation = (geom.angle * 180 / Math.PI);

                setWallSnapPreview({
                  wallId: nearest.wall.id,
                  snapPoint: { x: snapX, y: snapY },
                  snapRotation,
                });
                return;
              }
            }

            // No wall nearby, clear preview
            setWallSnapPreview(null);
          }
        }
      }
    },

    onDragEnd: (e: KonvaEventObject<DragEvent>) => {
      e.cancelBubble = true;

      const state = useFloorMapStore.getState();
      const { shapes, projectSettings, updateShapes, setWallSnapPreview } = state;
      const { snapEnabled, gridInterval } = projectSettings;

      // Clear wall snap preview
      setWallSnapPreview(null);

      // Calculate actual drag delta (not absolute position)
      // Shapes like ImageShape render at (coords.x, coords.y), so e.target.x()
      // includes the original position. We need just the movement offset.
      let deltaX = e.target.x() - dragStartPos.x;
      let deltaY = e.target.y() - dragStartPos.y;

      // Apply grid snap to the delta
      if (snapEnabled && gridInterval > 0) {
        // Grid interval is in mm, coordinates are in canvas pixels
        // At 1:100 scale (pixelsPerMm = 0.1), 100mm grid = 10 pixels
        const snapSize = gridInterval * state.scaleSettings.pixelsPerMm;
        deltaX = Math.round(deltaX / snapSize) * snapSize;
        deltaY = Math.round(deltaY / snapSize) * snapSize;
      }

      // Use the shapes determined during drag start (includes group members)
      const shapesToUpdate = shapesToMoveDuringDrag.length > 0
        ? shapesToMoveDuringDrag
        : [shapeId];

      // Check for wall snap: single opening shape dragged near a wall
      // Skip wall snap for grouped shapes (template objects) and when duplicating
      const draggedShape = shapes.find(s => s.id === shapeId);
      const isGroupedShape = draggedShape?.groupId != null;
      if (
        !isDuplicating &&
        shapesToUpdate.length === 1 &&
        draggedShape &&
        isOpeningType(draggedShape.type) &&
        !isGroupedShape &&
        !state.simplified // Model A: openings don't split wall objects
      ) {
        const coords = draggedShape.coordinates as { x1: number; y1: number; x2: number; y2: number };
        const newCoords = {
          x1: coords.x1 + deltaX,
          y1: coords.y1 + deltaY,
          x2: coords.x2 + deltaX,
          y2: coords.y2 + deltaY,
        };

        // Snap threshold: 50 canvas pixels
        const SNAP_THRESHOLD = 50;
        const walls = shapes.filter(s => s.type === 'wall' && s.id !== shapeId);

        // FIRST: Check for existing gap between walls (for placing back in original position)
        const gap = findWallGap(newCoords, walls, SNAP_THRESHOLD);
        if (gap) {
          // Snap to the existing gap - no need to split walls
          const gapCoords = gap.gapCoords;
          updateShapes([{
            id: shapeId,
            updates: {
              coordinates: gapCoords,
              attachedToWall: `${gap.wall1.id}:${gap.wall2.id}`, // Mark as between these walls
              positionOnWall: 0.5, // Middle of gap
            },
          }]);

          const stage = e.target.getStage();
          if (stage) {
            shapesToUpdate.forEach(id => {
              const node = stage.findOne(`#shape-${id}`);
              if (node) node.position(id === shapeId ? dragStartPos : (otherStartPositions.get(id) || { x: 0, y: 0 }));
            });
          }
          e.target.position(dragStartPos);
          return;
        }

        // SECOND: Check for snapping to a solid wall
        const nearest = findNearestWall(newCoords, walls, SNAP_THRESHOLD);

        if (nearest) {
          const wallCoords = nearest.wall.coordinates as { x1: number; y1: number; x2: number; y2: number };
          const snappedCoords = projectOntoWall(newCoords, wallCoords);
          const wallSegments = splitWall(wallCoords, snappedCoords);

          state.applyWallSnap(
            shapeId,
            { coordinates: snappedCoords, attachedToWall: nearest.wall.id, positionOnWall: nearest.t },
            nearest.wall.id,
            wallSegments.map(seg => ({
              color: nearest.wall.color,
              strokeColor: nearest.wall.strokeColor,
              strokeWidth: nearest.wall.strokeWidth,
              heightMM: nearest.wall.heightMM,
              thicknessMM: nearest.wall.thicknessMM,
              coordinates: seg,
            }))
          );

          // Reset nodes and return early
          const stage = e.target.getStage();
          if (stage) {
            shapesToUpdate.forEach(id => {
              const node = stage.findOne(`#shape-${id}`);
              if (node) node.position(id === shapeId ? dragStartPos : (otherStartPositions.get(id) || { x: 0, y: 0 }));
            });
          }
          e.target.position(dragStartPos);
          return;
        }

        // No wall nearby — if previously attached, detach and try to merge walls
        if (draggedShape.attachedToWall) {
          const shapeUpdates = applyDelta(draggedShape, deltaX, deltaY);

          // Try to find and merge the wall segments that were created when this door was placed
          const oldCoords = draggedShape.coordinates as { x1: number; y1: number; x2: number; y2: number };
          const mergeable = findMergeableWalls(oldCoords, walls, 30);

          if (mergeable) {
            // Merge the walls back together
            state.mergeWalls(mergeable.wall1Id, mergeable.wall2Id, mergeable.mergedCoords);
          }

          updateShapes([{
            id: shapeId,
            updates: { ...shapeUpdates, attachedToWall: undefined, positionOnWall: undefined },
          }]);

          const stage = e.target.getStage();
          if (stage) {
            shapesToUpdate.forEach(id => {
              const node = stage.findOne(`#shape-${id}`);
              if (node) node.position(id === shapeId ? dragStartPos : (otherStartPositions.get(id) || { x: 0, y: 0 }));
            });
          }
          e.target.position(dragStartPos);
          return;
        }
      }

      // Check for wall-relative snap: symbol/library shapes near a wall
      // This enables synced positioning in elevation view
      // Skip when duplicating
      if (
        !isDuplicating &&
        shapesToUpdate.length === 1 &&
        draggedShape &&
        (draggedShape.type === 'symbol' || draggedShape.symbolType)
      ) {
        const walls = shapes.filter(
          s => (s.type === 'wall' || s.type === 'line') &&
               s.shapeViewMode !== 'elevation' &&
               s.id !== shapeId
        );

        // Try to snap to nearest wall (threshold: 500mm = 50cm)
        const WALL_RELATIVE_THRESHOLD = 500;

        // Apply delta first to get new position
        const updatedShape = {
          ...draggedShape,
          coordinates: applyDelta(draggedShape, deltaX, deltaY).coordinates || draggedShape.coordinates,
        };

        const wallRelativeUpdates = snapToWallRelative(updatedShape, walls, WALL_RELATIVE_THRESHOLD);
        if (wallRelativeUpdates) {
          updateShapes([{
            id: shapeId,
            updates: wallRelativeUpdates,
          }]);

          const stage = e.target.getStage();
          if (stage) {
            shapesToUpdate.forEach(id => {
              const node = stage.findOne(`#shape-${id}`);
              if (node) node.position(id === shapeId ? dragStartPos : (otherStartPositions.get(id) || { x: 0, y: 0 }));
            });
          }
          e.target.position(dragStartPos);
          return;
        }
      }

      // If shape has wallRelative data, update it based on new position
      // Skip when duplicating
      if (!isDuplicating && draggedShape?.wallRelative) {
        const walls = shapes.filter(
          s => (s.type === 'wall' || s.type === 'line') &&
               s.shapeViewMode !== 'elevation'
        );

        const updatedShape = {
          ...draggedShape,
          coordinates: applyDelta(draggedShape, deltaX, deltaY).coordinates || draggedShape.coordinates,
        };

        const syncUpdates = syncWallRelativeFromFloorplan(updatedShape, walls);
        if (syncUpdates) {
          const coordsUpdate = applyDelta(draggedShape, deltaX, deltaY);
          updateShapes([{
            id: shapeId,
            updates: { ...coordsUpdate, ...syncUpdates },
          }]);

          const stage = e.target.getStage();
          if (stage) {
            shapesToUpdate.forEach(id => {
              const node = stage.findOne(`#shape-${id}`);
              if (node) node.position(id === shapeId ? dragStartPos : (otherStartPositions.get(id) || { x: 0, y: 0 }));
            });
          }
          e.target.position(dragStartPos);
          return;
        }
      }

      // Room edge snapping: nudge a single dragged room so an edge aligns with a
      // neighbouring room (→ clean shared wall). Applied on top of the grid snap.
      if (!isDuplicating && shapesToUpdate.length === 1 && draggedShape?.type === 'room' && snapEnabled) {
        const box = getRoomBBox(draggedShape);
        if (box) {
          const moved = {
            minX: box.minX + deltaX,
            minY: box.minY + deltaY,
            maxX: box.maxX + deltaX,
            maxY: box.maxY + deltaY,
          };
          const neighbors = collectRoomBBoxes(shapes, draggedShape.planId ?? null, [draggedShape.id]);
          const nudge = edgeSnapNudge(moved, neighbors, getEdgeSnapThreshold(state.viewState.zoom));
          deltaX += nudge.dx;
          deltaY += nudge.dy;
        }
      }

      // Build updates for all affected shapes
      const updates: Array<{ id: string; updates: Partial<FloorMapShape> }> = [];

      // If duplicating, update the duplicated shapes instead of originals
      const idsToUpdate = isDuplicating ? duplicatedShapeIds : shapesToUpdate;

      idsToUpdate.forEach(id => {
        const shape = shapes.find(s => s.id === id);
        if (shape) {
          const shapeUpdates = applyDelta(shape, deltaX, deltaY);
          if (shapeUpdates.coordinates || shapeUpdates.metadata) {
            updates.push({ id, updates: shapeUpdates });
          }
        }
      });

      // Apply all updates at once (single undo entry)
      if (updates.length > 0) {
        updateShapes(updates);
        // Rebuild auto-walls so they follow a moved room (no-op outside simplified mode).
        if (!isDuplicating && draggedShape?.type === 'room') {
          state.regenerateAutoWalls();
        }
      }

      // Reset all moved nodes to position 0
      // When duplicating, reset original nodes (they didn't actually move in store)
      const stage = e.target.getStage();
      if (stage) {
        shapesToUpdate.forEach(id => {
          const node = stage.findOne(`#shape-${id}`);
          if (node) {
            node.position(id === shapeId ? dragStartPos : (otherStartPositions.get(id) || { x: 0, y: 0 }));
          }
        });
      }

      // Also reset the dragged node (in case it wasn't found above)
      e.target.position(dragStartPos);

      // Clean up duplication state
      isDuplicating = false;
      duplicatedShapeIds = [];
      originalToNewIdMap.clear();
    }
  };
}

// Legacy export for compatibility
export const createUnifiedDragHandlers = createDragHandlers;
export const clearDragState = () => {}; // No-op, no state to clear
export const isDragging = () => false; // Not tracked anymore

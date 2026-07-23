/**
 * RoomElevationView - Room-centric elevation view with swipe navigation
 *
 * Shows elevation view of a room's walls with gallery-style navigation.
 * User can swipe between wall segments of any room shape.
 *
 * SEGMENT-BASED APPROACH (v2):
 * - Each room edge is a separate wall segment ("Vägg 1", "Vägg 2", etc.)
 * - Works well for L-shaped and complex rooms
 * - Direction indicates which way you LOOK when viewing the wall
 * - Uses room polygon edges as the baseline dimensions
 * - Overlays actual walls and openings on top
 * - Shows missing walls as dashed lines
 *
 * DIRECTION LOGIC (Hybrid approach for L-shaped rooms):
 * 1. First determine if the wall is HORIZONTAL or VERTICAL (based on angle)
 * 2. Then use position relative to room center to assign direction:
 *    - Horizontal walls: North (above center) or South (below center)
 *    - Vertical walls: East (right of center) or West (left of center)
 * - This ensures horizontal walls are always N/S and vertical walls are always E/W
 * - Works correctly for L-shaped and complex room shapes
 */

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { v4 as uuidv4 } from 'uuid';
import { Stage, Layer, Rect, Line, Text as KonvaText, Group, Path, Circle as KonvaCircle } from 'react-konva';
import Konva from 'konva';
import { ArrowLeft, Blocks, ChevronLeft, ChevronRight, X, Compass, DoorOpen, ZoomIn, ZoomOut, RotateCcw, Home, Plug, ToggleRight, Circle as CircleIcon, MousePointer2, ChevronDown, MessageCircle, Save, Ruler } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useFloorMapStore } from './store';
import { InlineCommentPopover } from '@/components/comments/InlineCommentPopover';
import { supabase } from '@/integrations/supabase/client';
import { FloorMapShape, PolygonCoordinates, LineCoordinates, WallObjectCategory, WallRelativePosition } from './types';
import { v2OpeningsAsLegacy } from './editor/geometry/openingSync';
import { WallDirection, getDirectionLabel, getDirectionIcon } from './utils/roomWalls';
import { getAdminDefaults } from './canvas/constants';
import { cn } from '@/lib/utils';
import { formatMeasurement } from './utils/formatting';
import { useMeasurement } from "@/contexts/MeasurementContext";
import { wallRelativeToElevation, elevationToWallRelative } from './canvas/utils/wallCoordinates';
import { createRoomItemForPlacedShape } from './utils/roomItemLink';
import { isMirroredCategory } from './editor/sync/roomItemSync';
import { isEditorV2Enabled } from './editor/flag';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { execute } from './editor/core/commands';
import { wallFrame, projectOntoWall } from './editor/geometry/openingGeometry';
import { ElevationObjectPanel } from './ElevationObjectPanel';
import { saveShapesForPlan } from './utils/plans';
import { HoverInfoTooltip } from './HoverInfoTooltip';
import { ObjectLibraryPanel, getUnifiedObjectById, ELECTRICAL_OBJECTS, UnifiedObjectDefinition, isElectricalShape } from './objectLibrary';

interface RoomElevationViewProps {
  room: FloorMapShape;
  onClose: () => void;
  projectId: string;
  /** Optional: Start at a specific wall by ID (when opened from wall selection) */
  initialWallId?: string;
}

// formatDim moved inside component to use measurement context

/**
 * Represents a room edge (one side of the room polygon)
 */
interface RoomEdge {
  direction: WallDirection;
  /** Start point of the edge */
  start: { x: number; y: number };
  /** End point of the edge */
  end: { x: number; y: number };
  /** Length of this edge in pixels */
  lengthPixels: number;
  /** Edge index in the room polygon */
  edgeIndex: number;
}

/**
 * Wall segment that covers part of a room edge
 */
interface WallSegment {
  wall: FloorMapShape;
  /** Position along the edge (0-1) where the wall starts */
  startT: number;
  /** Position along the edge (0-1) where the wall ends */
  endT: number;
  /** The wall's height in mm */
  heightMM: number;
}

/**
 * Opening (door/window) on a room edge
 */
interface EdgeOpening {
  shape: FloorMapShape;
  /** Position along the edge (0-1) */
  positionT: number;
  /** Width of the opening in pixels */
  widthPixels: number;
  /** Type of opening */
  type: 'door' | 'window' | 'sliding_door';
}

/**
 * Complete data for one direction of the room (legacy - for grouped directions)
 */
interface DirectionData {
  direction: WallDirection;
  /** The room edge(s) for this direction */
  edges: RoomEdge[];
  /** Total length of this side in pixels */
  totalLengthPixels: number;
  /** Wall segments covering this side */
  wallSegments: WallSegment[];
  /** Percentage of the edge covered by walls (0-100) */
  wallCoverage: number;
  /** Openings on this side */
  openings: EdgeOpening[];
  /** Maximum wall height for this direction */
  wallHeightMM: number;
}

/**
 * Data for a single wall segment (edge) of the room
 * Used for segment-based navigation (better for L-shaped rooms)
 */
interface SegmentData {
  /** Unique index of this segment in the room polygon */
  segmentIndex: number;
  /** Human-readable label: "Vägg 1", "Vägg 2", etc. */
  label: string;
  /** Cardinal direction this segment faces */
  direction: WallDirection;
  /** The room edge for this segment */
  edge: RoomEdge;
  /** Length of this segment in pixels */
  lengthPixels: number;
  /** Length in mm */
  lengthMM: number;
  /** Whether an actual wall covers this edge */
  hasWall: boolean;
  /** Wall covering this edge (if any) */
  wall: FloorMapShape | null;
  /** Wall height in mm */
  wallHeightMM: number;
  /** Openings (doors/windows) on this segment */
  openings: EdgeOpening[];
}

/**
 * Calculate the direction of a room edge based on its angle
 */
function getEdgeDirection(start: { x: number; y: number }, end: { x: number; y: number }): WallDirection {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  // Normalize to 0-360
  const normalizedAngle = ((angle % 360) + 360) % 360;

  // Edge direction is perpendicular to the edge itself
  // An edge going left-to-right (angle ~0) faces either north or south
  // We determine this by which side of the room center the edge is on

  // For now, use the edge's orientation:
  // Horizontal edges (angle ~0 or ~180) are north or south walls
  // Vertical edges (angle ~90 or ~270) are east or west walls

  if (normalizedAngle >= 315 || normalizedAngle < 45) {
    // Edge going right - this is the south wall (faces south, looking from inside)
    return 'south';
  } else if (normalizedAngle >= 45 && normalizedAngle < 135) {
    // Edge going down - this is the west wall
    return 'west';
  } else if (normalizedAngle >= 135 && normalizedAngle < 225) {
    // Edge going left - this is the north wall
    return 'north';
  } else {
    // Edge going up - this is the east wall
    return 'east';
  }
}

/**
 * Calculate the center (centroid) of a room polygon
 */
function calculateRoomCenter(points: { x: number; y: number }[]): { x: number; y: number } {
  if (points.length === 0) return { x: 0, y: 0 };

  let sumX = 0;
  let sumY = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
  }
  return { x: sumX / points.length, y: sumY / points.length };
}

/**
 * Determine direction using a HYBRID approach that works for L-shaped rooms.
 *
 * Strategy:
 * 1. First, determine if the edge is primarily HORIZONTAL or VERTICAL
 *    based on its angle (orientation)
 * 2. Then use the edge's position relative to room center to disambiguate:
 *    - Horizontal edges: North (if above center) or South (if below center)
 *    - Vertical edges: East (if right of center) or West (if left of center)
 *
 * This is more robust than pure centroid-based or pure orientation-based
 * approaches for complex room shapes like L-shaped rooms.
 */
function getEdgeDirectionHybrid(
  edgeStart: { x: number; y: number },
  edgeEnd: { x: number; y: number },
  roomCenter: { x: number; y: number }
): WallDirection {
  const edgeCenter = {
    x: (edgeStart.x + edgeEnd.x) / 2,
    y: (edgeStart.y + edgeEnd.y) / 2,
  };

  // Calculate edge angle to determine if it's horizontal or vertical
  const dx = edgeEnd.x - edgeStart.x;
  const dy = edgeEnd.y - edgeStart.y;
  const edgeAngle = Math.atan2(dy, dx) * (180 / Math.PI);
  const normalizedAngle = ((edgeAngle % 360) + 360) % 360;

  // Determine if edge is more horizontal or vertical
  // Horizontal: angle close to 0° or 180° (±45°)
  // Vertical: angle close to 90° or 270° (±45°)
  const isHorizontal =
    (normalizedAngle >= 315 || normalizedAngle < 45) ||  // ~0° (right)
    (normalizedAngle >= 135 && normalizedAngle < 225);   // ~180° (left)

  if (isHorizontal) {
    // Horizontal edge: North or South based on Y position
    // In canvas: Y increases downward
    if (edgeCenter.y < roomCenter.y) {
      return 'north';  // Edge is above center → looking north
    } else {
      return 'south';  // Edge is below center → looking south
    }
  } else {
    // Vertical edge: East or West based on X position
    if (edgeCenter.x > roomCenter.x) {
      return 'east';   // Edge is right of center → looking east
    } else {
      return 'west';   // Edge is left of center → looking west
    }
  }
}

/**
 * Check if a point is close to a line segment
 */
function distanceToLineSegment(
  point: { x: number; y: number },
  lineStart: { x: number; y: number },
  lineEnd: { x: number; y: number }
): { distance: number; t: number } {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) {
    const dist = Math.sqrt((point.x - lineStart.x) ** 2 + (point.y - lineStart.y) ** 2);
    return { distance: dist, t: 0 };
  }

  let t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));

  const closestX = lineStart.x + t * dx;
  const closestY = lineStart.y + t * dy;

  const distance = Math.sqrt((point.x - closestX) ** 2 + (point.y - closestY) ** 2);
  return { distance, t };
}

/**
 * Analyze a room and extract data for each cardinal direction
 */
function analyzeRoomDirections(
  room: FloorMapShape,
  allShapes: FloorMapShape[],
  pixelsPerMm: number
): DirectionData[] {
  try {
    // Safety check for undefined room or coordinates
    if (!room || !room.coordinates) return [];

    const roomCoords = room.coordinates as PolygonCoordinates;
  if (!roomCoords.points || roomCoords.points.length < 3) return [];

  const roomCenter = calculateRoomCenter(roomCoords.points);
  const defaultWallHeight = 2400;

  // Extract all room edges with their directions
  const allEdges: RoomEdge[] = [];
  for (let i = 0; i < roomCoords.points.length; i++) {
    const start = roomCoords.points[i];
    const end = roomCoords.points[(i + 1) % roomCoords.points.length];

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.sqrt(dx * dx + dy * dy);

    if (length < 1) continue; // Skip degenerate edges

    const direction = getEdgeDirectionHybrid(start, end, roomCenter);

    allEdges.push({
      direction,
      start,
      end,
      lengthPixels: length,
      edgeIndex: i,
    });
  }

  // Get all walls and openings
  const walls = allShapes.filter(s =>
    (s.type === 'wall' || s.type === 'line') &&
    s.planId === room.planId
  );

  const openings = [...allShapes, ...v2OpeningsAsLegacy(allShapes)].filter(s =>
    ['door_line', 'window_line', 'sliding_door_line'].includes(s.type) &&
    s.planId === room.planId
  );

  // Group edges by direction and calculate data
  const directions: WallDirection[] = ['north', 'east', 'south', 'west'];
  const result: DirectionData[] = [];

  for (const dir of directions) {
    const dirEdges = allEdges.filter(e => e.direction === dir);

    // Calculate total length for this direction
    const totalLength = dirEdges.reduce((sum, e) => sum + e.lengthPixels, 0);

    // Find walls that overlap with these edges
    const wallSegments: WallSegment[] = [];
    let maxWallHeight = defaultWallHeight;

    // Tolerance for wall detection: 200mm (about wall thickness)
    const wallTolerancePixels = 200 * pixelsPerMm;

    for (const edge of dirEdges) {
      // Calculate edge angle for direction matching
      const edgeDx = edge.end.x - edge.start.x;
      const edgeDy = edge.end.y - edge.start.y;
      const edgeAngle = Math.atan2(edgeDy, edgeDx);

      for (const wall of walls) {
        const wallCoords = wall.coordinates as LineCoordinates;
        const wallMid = {
          x: (wallCoords.x1 + wallCoords.x2) / 2,
          y: (wallCoords.y1 + wallCoords.y2) / 2,
        };

        // Check wall angle matches edge angle (same or opposite direction)
        const wallDx = wallCoords.x2 - wallCoords.x1;
        const wallDy = wallCoords.y2 - wallCoords.y1;
        const wallAngle = Math.atan2(wallDy, wallDx);
        const angleDiff = Math.abs(edgeAngle - wallAngle);
        const anglesMatch = angleDiff < 0.2 || Math.abs(angleDiff - Math.PI) < 0.2;

        if (!anglesMatch) continue; // Skip walls not aligned with this edge

        // Check if wall midpoint is close to this edge
        const { distance, t } = distanceToLineSegment(wallMid, edge.start, edge.end);

        if (distance < wallTolerancePixels) { // tolerance in mm-based pixels
          // Calculate where the wall covers the edge
          const wallStart = { x: wallCoords.x1, y: wallCoords.y1 };
          const wallEnd = { x: wallCoords.x2, y: wallCoords.y2 };

          const startResult = distanceToLineSegment(wallStart, edge.start, edge.end);
          const endResult = distanceToLineSegment(wallEnd, edge.start, edge.end);

          const startT = Math.min(startResult.t, endResult.t);
          const endT = Math.max(startResult.t, endResult.t);

          wallSegments.push({
            wall,
            startT,
            endT,
            heightMM: wall.heightMM || defaultWallHeight,
          });

          if (wall.heightMM && wall.heightMM > maxWallHeight) {
            maxWallHeight = wall.heightMM;
          }
        }
      }
    }

    // Calculate wall coverage
    // Merge overlapping segments and calculate total coverage
    const sortedSegments = [...wallSegments].sort((a, b) => a.startT - b.startT);
    let coverage = 0;
    let currentEnd = 0;

    for (const seg of sortedSegments) {
      if (seg.startT > currentEnd) {
        coverage += seg.endT - seg.startT;
        currentEnd = seg.endT;
      } else if (seg.endT > currentEnd) {
        coverage += seg.endT - currentEnd;
        currentEnd = seg.endT;
      }
    }

    // Find openings on these edges
    const edgeOpenings: EdgeOpening[] = [];

    // Tolerance for opening detection: 150mm (about half a wall thickness)
    const tolerancePixels = 150 * pixelsPerMm;

    for (const edge of dirEdges) {
      // Calculate edge angle for direction matching
      const edgeDx = edge.end.x - edge.start.x;
      const edgeDy = edge.end.y - edge.start.y;
      const edgeAngle = Math.atan2(edgeDy, edgeDx);

      for (const opening of openings) {
        const openingCoords = opening.coordinates as LineCoordinates;
        const openingMid = {
          x: (openingCoords.x1 + openingCoords.x2) / 2,
          y: (openingCoords.y1 + openingCoords.y2) / 2,
        };

        const { distance, t } = distanceToLineSegment(openingMid, edge.start, edge.end);

        // Check distance is within tolerance (in proper mm-based pixels)
        if (distance < tolerancePixels) {
          const openingDx = openingCoords.x2 - openingCoords.x1;
          const openingDy = openingCoords.y2 - openingCoords.y1;
          const openingWidth = Math.sqrt(openingDx * openingDx + openingDy * openingDy);
          const openingAngle = Math.atan2(openingDy, openingDx);

          // Also check that the opening is aligned with the edge (same or opposite direction)
          const angleDiff = Math.abs(edgeAngle - openingAngle);
          const anglesMatch = angleDiff < 0.3 || Math.abs(angleDiff - Math.PI) < 0.3;

          if (!anglesMatch) continue; // Skip openings not aligned with this edge

          let type: 'door' | 'window' | 'sliding_door' = 'door';
          if (opening.type === 'window_line') type = 'window';
          else if (opening.type === 'sliding_door_line') type = 'sliding_door';

          edgeOpenings.push({
            shape: opening,
            positionT: t,
            widthPixels: openingWidth,
            type,
          });
        }
      }
    }

    result.push({
      direction: dir,
      edges: dirEdges,
      totalLengthPixels: totalLength,
      wallSegments,
      wallCoverage: totalLength > 0 ? (coverage * 100) : 0,
      openings: edgeOpenings,
      wallHeightMM: maxWallHeight,
    });
  }

  return result;
  } catch (error) {
    console.error('Error in analyzeRoomDirections:', error, { room, allShapes: allShapes?.length, pixelsPerMm });
    return [];
  }
}

/**
 * Analyze a room and extract data for EACH individual wall segment.
 * This is better for L-shaped and complex rooms where N/S/E/W grouping doesn't work well.
 */
function analyzeRoomSegments(
  room: FloorMapShape,
  allShapes: FloorMapShape[],
  pixelsPerMm: number
): SegmentData[] {
  try {
    // Safety check for undefined room or coordinates
    if (!room || !room.coordinates) return [];

    const roomCoords = room.coordinates as PolygonCoordinates;
  if (!roomCoords.points || roomCoords.points.length < 3) return [];

  const roomCenter = calculateRoomCenter(roomCoords.points);
  const defaultWallHeight = 2400;

  // Get all walls and openings
  const walls = allShapes.filter(s =>
    (s.type === 'wall' || s.type === 'line') &&
    s.planId === room.planId
  );

  const openings = [...allShapes, ...v2OpeningsAsLegacy(allShapes)].filter(s =>
    ['door_line', 'window_line', 'sliding_door_line'].includes(s.type) &&
    s.planId === room.planId
  );

  // Tolerances
  const wallTolerancePixels = 200 * pixelsPerMm;
  const openingTolerancePixels = 150 * pixelsPerMm;

  const segments: SegmentData[] = [];

  // Process each edge of the room polygon as a separate segment
  for (let i = 0; i < roomCoords.points.length; i++) {
    const start = roomCoords.points[i];
    const end = roomCoords.points[(i + 1) % roomCoords.points.length];

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthPixels = Math.sqrt(dx * dx + dy * dy);

    if (lengthPixels < 10 * pixelsPerMm) continue; // Skip very short edges (< 10mm)

    const edgeAngle = Math.atan2(dy, dx);
    const direction = getEdgeDirectionHybrid(start, end, roomCenter);

    const edge: RoomEdge = {
      direction,
      start,
      end,
      lengthPixels,
      edgeIndex: i,
    };

    // Find wall covering this edge
    let foundWall: FloorMapShape | null = null;
    let wallHeight = defaultWallHeight;

    for (const wall of walls) {
      const wallCoords = wall.coordinates as LineCoordinates;
      const wallMid = {
        x: (wallCoords.x1 + wallCoords.x2) / 2,
        y: (wallCoords.y1 + wallCoords.y2) / 2,
      };

      // Check wall angle matches edge angle
      const wallDx = wallCoords.x2 - wallCoords.x1;
      const wallDy = wallCoords.y2 - wallCoords.y1;
      const wallAngle = Math.atan2(wallDy, wallDx);
      const angleDiff = Math.abs(edgeAngle - wallAngle);
      const anglesMatch = angleDiff < 0.2 || Math.abs(angleDiff - Math.PI) < 0.2;

      if (!anglesMatch) continue;

      // Check if wall midpoint is close to this edge
      const { distance } = distanceToLineSegment(wallMid, start, end);

      if (distance < wallTolerancePixels) {
        foundWall = wall;
        wallHeight = wall.heightMM || defaultWallHeight;
        break;
      }
    }

    // Find openings on this edge
    const edgeOpenings: EdgeOpening[] = [];

    for (const opening of openings) {
      const openingCoords = opening.coordinates as LineCoordinates;
      const openingMid = {
        x: (openingCoords.x1 + openingCoords.x2) / 2,
        y: (openingCoords.y1 + openingCoords.y2) / 2,
      };

      const { distance, t } = distanceToLineSegment(openingMid, start, end);

      if (distance < openingTolerancePixels) {
        const openingDx = openingCoords.x2 - openingCoords.x1;
        const openingDy = openingCoords.y2 - openingCoords.y1;
        const openingWidth = Math.sqrt(openingDx * openingDx + openingDy * openingDy);
        const openingAngle = Math.atan2(openingDy, openingDx);

        // Check angle alignment
        const angleDiff = Math.abs(edgeAngle - openingAngle);
        const anglesMatch = angleDiff < 0.3 || Math.abs(angleDiff - Math.PI) < 0.3;

        if (!anglesMatch) continue;

        let type: 'door' | 'window' | 'sliding_door' = 'door';
        if (opening.type === 'window_line') type = 'window';
        else if (opening.type === 'sliding_door_line') type = 'sliding_door';

        edgeOpenings.push({
          shape: opening,
          positionT: t,
          widthPixels: openingWidth,
          type,
        });
      }
    }

    segments.push({
      segmentIndex: i,
      label: `Vägg ${i + 1}`,
      direction,
      edge,
      lengthPixels,
      lengthMM: lengthPixels / pixelsPerMm,
      hasWall: foundWall !== null,
      wall: foundWall,
      wallHeightMM: wallHeight,
      openings: edgeOpenings,
    });
  }

  return segments;
  } catch (error) {
    console.error('Error in analyzeRoomSegments:', error, { room, allShapes: allShapes?.length, pixelsPerMm });
    return [];
  }
}

// Direction colors
const directionColors: Record<WallDirection, string> = {
  north: '#3b82f6', // Blue
  east: '#10b981',  // Green
  south: '#f59e0b', // Amber
  west: '#8b5cf6',  // Purple
};

/**
 * Get fill color for object category in elevation view
 */
const getCategoryColor = (category?: WallObjectCategory): string => {
  const colors: Record<string, string> = {
    floor_cabinet: '#d4a574',    // Wood brown
    wall_cabinet: '#c4956a',     // Lighter wood
    countertop: '#e5e7eb',       // Gray stone
    appliance_floor: '#f3f4f6',  // White/silver
    appliance_wall: '#f3f4f6',
    decoration: '#ddd6fe',       // Light purple
    electrical_outlet: '#fef3c7', // Warm yellow (electrical)
    electrical_switch: '#fef3c7', // Warm yellow (electrical)
    custom: '#e5e7eb',           // Default gray
  };
  return colors[category || 'custom'] || '#e5e7eb';
};

/**
 * Get stroke color for object category in elevation view
 */
const getCategoryStroke = (category?: WallObjectCategory): string => {
  const colors: Record<string, string> = {
    floor_cabinet: '#92400e',    // Dark brown
    wall_cabinet: '#78350f',     // Darker brown
    countertop: '#6b7280',       // Gray
    appliance_floor: '#374151',  // Dark gray
    appliance_wall: '#374151',
    decoration: '#7c3aed',       // Purple
    electrical_outlet: '#d97706', // Amber (electrical)
    electrical_switch: '#d97706', // Amber (electrical)
    custom: '#6b7280',           // Default gray
  };
  return colors[category || 'custom'] || '#6b7280';
};

export const RoomElevationView: React.FC<RoomElevationViewProps> = ({
  room,
  onClose,
  projectId,
  initialWallId,
}) => {
  const { t } = useTranslation();
  const ms = useMeasurement();
  const formatDim = (value: number): string => ms.fmtLength(value);
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);

  const { shapes, scaleSettings, updateShapeWallRelative, updateShape, addShape, deleteShape, currentPlanId, undo, redo, canUndo, canRedo } = useFloorMapStore();
  const { pixelsPerMm } = scaleSettings;
  const adminDefaults = getAdminDefaults();

  // Track which object is being dragged and its current position
  const [draggingObjectId, setDraggingObjectId] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  // Ref to immediately block Stage dragging (state update is async, ref is sync)
  const isDraggingObjectRef = useRef(false);

  // Manual pan state (replacing Stage's built-in drag which conflicts with object drag)
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  // Object placement state (legacy)
  type PlacementObject = 'outlet_single' | 'outlet_double' | 'light_switch' | 'dimmer_switch' | null;
  const [selectedPlacement, setSelectedPlacement] = useState<PlacementObject>(null);

  // Unified object placement (new SVG-based library)
  const [selectedUnifiedObject, setSelectedUnifiedObject] = useState<UnifiedObjectDefinition | null>(null);
  const [objectLibraryOpen, setObjectLibraryOpen] = useState(false);
  // v2 shell: compact left tool rail (same look as the floor-plan rail)
  // replaces the amber placement strip.
  const editorV2 = isEditorV2Enabled();
  // v2: opening placement directly in the wall view (door/window/sliding/passage)
  type OpeningKind = 'door' | 'window' | 'sliding' | 'passage';
  const [selectedOpeningKind, setSelectedOpeningKind] = useState<OpeningKind | null>(null);
  const [openingMenuOpen, setOpeningMenuOpen] = useState(false);
  // v2: text annotations on the wall (sticky-note style, wall-anchored)
  const [textPlacementArmed, setTextPlacementArmed] = useState(false);
  const [textEditShapeId, setTextEditShapeId] = useState<string | null>(null);
  const [textDraft, setTextDraft] = useState('');
  const [wallInfoOpen, setWallInfoOpen] = useState(false);
  // v2: selected opening in the wall view (slide/width/flip/delete editing)
  const [selectedElevOpeningId, setSelectedElevOpeningId] = useState<string | null>(null);

  // Placement object definitions (matching objectLibraryDefinitions.ts)
  const placementObjects: Record<Exclude<PlacementObject, null>, {
    name: string;
    width: number;
    height: number;
    elevationBottom: number;
    category: WallObjectCategory;
    icon: React.ReactNode;
  }> = {
    outlet_single: {
      name: t('elevation.outletSingle', 'Eluttag'),
      width: 80,
      height: 80,
      elevationBottom: 200, // Swedish standard
      category: 'electrical_outlet',
      icon: <Plug className="h-4 w-4" />,
    },
    outlet_double: {
      name: t('elevation.outletDouble', 'Dubbelt uttag'),
      width: 150,
      height: 80,
      elevationBottom: 200,
      category: 'electrical_outlet',
      icon: <><Plug className="h-4 w-4" /><Plug className="h-4 w-4" /></>,
    },
    light_switch: {
      name: t('elevation.lightSwitch', 'Strömbrytare'),
      width: 80,
      height: 80,
      elevationBottom: 1000, // Swedish standard
      category: 'electrical_switch',
      icon: <ToggleRight className="h-4 w-4" />,
    },
    dimmer_switch: {
      name: t('elevation.dimmer', 'Dimmer'),
      width: 80,
      height: 80,
      elevationBottom: 1000,
      category: 'electrical_switch',
      icon: <CircleIcon className="h-4 w-4" />,
    },
  };

  // State
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [initialIndexSet, setInitialIndexSet] = useState(false);

  // Touch/swipe state
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [isSwiping, setIsSwiping] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);

  // Selected object state (for details panel)
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);

  // Comments state - stores comment counts and resolved status per object
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [resolvedStatus, setResolvedStatus] = useState<Record<string, boolean>>({});
  const [activeComment, setActiveComment] = useState<{ objectId: string; position: { x: number; y: number } } | null>(null);
  const [showContextMenu, setShowContextMenu] = useState<{ x: number; y: number; objectId: string } | null>(null);

  // Clipboard for copy/paste
  const [clipboard, setClipboard] = useState<FloorMapShape | null>(null);

  // Save state
  const [isSaving, setIsSaving] = useState(false);

  // Hover info tooltip state
  const [hoveredObjectId, setHoveredObjectId] = useState<string | null>(null);
  const [hoverMousePosition, setHoverMousePosition] = useState<{ x: number; y: number } | null>(null);

  // Measure tool state
  const [isMeasureActive, setIsMeasureActive] = useState(false);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [measureStart, setMeasureStart] = useState<{ x: number; y: number } | null>(null);
  const [measureEnd, setMeasureEnd] = useState<{ x: number; y: number } | null>(null);

  // Analyze room segments - returns one entry per wall segment (better for L-shaped rooms)
  const segmentData = useMemo(() => {
    return analyzeRoomSegments(room, shapes, pixelsPerMm);
  }, [room, shapes, pixelsPerMm]);

  const currentSegment = segmentData[currentSegmentIndex];

  // Filter objects attached to the current wall segment
  const segmentObjects = useMemo(() => {
    if (!currentSegment?.wall) return [];

    // Find all shapes with wallRelative data attached to this wall
    return shapes.filter(s =>
      s.wallRelative?.wallId === currentSegment.wall?.id &&
      s.planId === room?.planId
    );
  }, [currentSegment, shapes, room?.planId]);

  // Get the selected object (for details panel)
  const selectedObject = useMemo(() => {
    if (!selectedObjectId) return null;
    return shapes.find(s => s.id === selectedObjectId) || null;
  }, [selectedObjectId, shapes]);

  // Set initial segment based on initialWallId
  useEffect(() => {
    if (initialWallId && !initialIndexSet && segmentData.length > 0) {
      // Find which segment contains this wall ID
      const index = segmentData.findIndex(seg =>
        seg.wall?.id === initialWallId
      );
      if (index >= 0) {
        setCurrentSegmentIndex(index);
      }
      setInitialIndexSet(true);
    }
  }, [initialWallId, segmentData, initialIndexSet]);

  // Handle container resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight - 80,
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Fetch comment counts for objects on the current segment
  useEffect(() => {
    const fetchCommentData = async () => {
      if (segmentObjects.length === 0) return;

      const objectIds = segmentObjects.map(obj => obj.id);

      try {
        // First try with is_resolved column, fallback to without it
        let data;
        let error;

        // Try fetching with is_resolved (new schema)
        const result = await supabase
          .from('comments')
          .select('drawing_object_id, is_resolved')
          .in('drawing_object_id', objectIds);

        if (result.error?.code === '42703') {
          // Column doesn't exist yet, fetch without it
          const fallbackResult = await supabase
            .from('comments')
            .select('drawing_object_id')
            .in('drawing_object_id', objectIds);
          data = fallbackResult.data;
          error = fallbackResult.error;
        } else {
          data = result.data;
          error = result.error;
        }

        if (error) {
          console.error('Error fetching comment data:', error);
          return;
        }

        // Count comments and track resolved status per object
        const counts: Record<string, number> = {};
        const resolved: Record<string, boolean> = {};

        data?.forEach((row: { drawing_object_id: string | null; is_resolved?: boolean }) => {
          if (row.drawing_object_id) {
            counts[row.drawing_object_id] = (counts[row.drawing_object_id] || 0) + 1;
            // Thread is resolved if any comment is marked resolved
            if (row.is_resolved) {
              resolved[row.drawing_object_id] = true;
            }
          }
        });

        setCommentCounts(counts);
        setResolvedStatus(resolved);
      } catch (err) {
        console.error('Error fetching comment data:', err);
      }
    };

    fetchCommentData();
  }, [segmentObjects]);

  // Save handler
  const handleSave = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const success = await saveShapesForPlan(currentPlanId, shapes);
      if (success) {
        toast.success(t('common.saved', 'Sparad'));
      } else {
        toast.error(t('common.saveFailed', 'Kunde inte spara'));
      }
    } catch (err) {
      console.error('Save error:', err);
      toast.error(t('common.saveFailed', 'Kunde inte spara'));
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, currentPlanId, shapes, t]);

  // Keyboard shortcuts (undo, redo, delete, copy, paste, save)
  useEffect(() => {
    const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if typing in input
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;

      // Use Cmd on Mac, Ctrl on Windows
      const modKey = isMac ? e.metaKey : e.ctrlKey;
      const isZKey = e.key.toLowerCase() === 'z' || e.code === 'KeyZ';

      // Escape - deselect and close context menu
      if (e.key === 'Escape' && !isTyping) {
        e.preventDefault();
        setSelectedObjectId(null);
        setShowContextMenu(null);
        setActiveComment(null);
      }

      // Delete key - delete selected object
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isTyping && selectedObjectId) {
        e.preventDefault();
        deleteShape(selectedObjectId);
        setSelectedObjectId(null);
        toast.success(t('elevation.objectDeleted', 'Objekt borttaget'));
      }

      // Undo: Cmd+Z (Mac) or Ctrl+Z (Windows)
      if (modKey && isZKey && !e.shiftKey && !isTyping) {
        e.preventDefault();
        if (canUndo()) {
          undo();
          toast.success(t('common.undone', 'Ångrad'));
        } else {
          toast.info(t('common.nothingToUndo', 'Inget att ångra'));
        }
      }

      // Redo: Cmd+Shift+Z (Mac) or Ctrl+Y (Windows)
      if (!isTyping && modKey) {
        const isYKey = e.key.toLowerCase() === 'y' || e.code === 'KeyY';
        const isRedoKey = (isMac && e.shiftKey && isZKey) || (!isMac && isYKey);

        if (isRedoKey) {
          e.preventDefault();
          if (canRedo()) {
            redo();
            toast.success(t('common.redone', 'Gjort om'));
          } else {
            toast.info(t('common.nothingToRedo', 'Inget att göra om'));
          }
        }
      }

      // Copy: Cmd+C (Mac) or Ctrl+C (Windows)
      if (modKey && e.key.toLowerCase() === 'c' && !isTyping && selectedObjectId) {
        e.preventDefault();
        const objectToCopy = segmentObjects.find(obj => obj.id === selectedObjectId);
        if (objectToCopy) {
          setClipboard(objectToCopy);
          toast.success(t('elevation.objectCopied', 'Objekt kopierat'));
        }
      }

      // Paste: Cmd+V (Mac) or Ctrl+V (Windows)
      if (modKey && e.key.toLowerCase() === 'v' && !isTyping && clipboard && currentSegment?.wall) {
        e.preventDefault();

        // Create new object with offset
        const newId = uuidv4();
        const OFFSET_MM = 100; // 10cm offset

        const newShape: FloorMapShape = {
          ...clipboard,
          id: newId,
          planId: currentPlanId || clipboard.planId,
          wallRelative: clipboard.wallRelative ? {
            ...clipboard.wallRelative,
            wallId: currentSegment.wall.id, // Attach to current wall
            distanceFromWallStart: (clipboard.wallRelative.distanceFromWallStart || 0) + OFFSET_MM,
          } : undefined,
        };

        addShape(newShape);
        setSelectedObjectId(newId);
        toast.success(t('elevation.objectPasted', 'Objekt klistrat in'));
      }

      // Save: Cmd+S (Mac) or Ctrl+S (Windows)
      if (modKey && e.key.toLowerCase() === 's' && !isTyping) {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedObjectId, clipboard, currentSegment, segmentObjects, currentPlanId, deleteShape, undo, redo, canUndo, canRedo, addShape, handleSave, t]);

  // Navigation (segment-based)
  const goToPreviousSegment = useCallback(() => {
    if (segmentData.length === 0) return;
    setCurrentSegmentIndex((prev) => (prev - 1 + segmentData.length) % segmentData.length);
    setPanX(0);
    setPanY(0);
  }, [segmentData.length]);

  const goToNextSegment = useCallback(() => {
    if (segmentData.length === 0) return;
    setCurrentSegmentIndex((prev) => (prev + 1) % segmentData.length);
    setPanX(0);
    setPanY(0);
  }, [segmentData.length]);

  const goToSegment = useCallback((index: number) => {
    setCurrentSegmentIndex(index);
    setPanX(0);
    setPanY(0);
  }, []);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev * 1.2, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev / 1.2, 0.3));
  }, []);

  const resetView = useCallback(() => {
    setZoom(1);
    setPanX(0);
    setPanY(0);
  }, []);

  // Toggle measure tool
  const toggleMeasureTool = useCallback(() => {
    setIsMeasureActive(prev => {
      if (prev) {
        // Deactivating - clear measurement
        setMeasureStart(null);
        setMeasureEnd(null);
      }
      return !prev;
    });
  }, []);

  // Manual pan handlers (replaces Stage's built-in drag to avoid conflicts)
  const handleStageMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    // MEASURE TOOL - Always handle first, regardless of what's under cursor
    if (isMeasureActive) {
      e.cancelBubble = true;
      // Transform to canvas coordinates (accounting for zoom and pan)
      const pos = {
        x: (pointer.x - panX) / zoom,
        y: (pointer.y - panY) / zoom,
      };
      setIsMeasuring(true);
      setMeasureStart(pos);
      setMeasureEnd(pos);
      return;
    }

    // Only start panning if clicking on Stage/Layer/background, not on objects
    const clickedOnEmpty = e.target === e.target.getStage() ||
                           e.target.getClassName() === 'Layer' ||
                           e.target.attrs?.name === 'background';

    if (clickedOnEmpty && !selectedPlacement && !isDraggingObjectRef.current) {
      // Deselect object when clicking on empty space
      setSelectedObjectId(null);

      setIsPanning(true);
      if (pointer) {
        panStartRef.current = { x: pointer.x, y: pointer.y, panX, panY };
      }
    }
  }, [selectedPlacement, panX, panY, isMeasureActive, zoom]);

  const handleStageMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    // Handle measure tool movement
    if (isMeasuring) {
      const stage = e.target.getStage();
      const pointer = stage?.getPointerPosition();
      if (pointer) {
        const pos = {
          x: (pointer.x - panX) / zoom,
          y: (pointer.y - panY) / zoom,
        };
        setMeasureEnd(pos);
      }
      return;
    }

    if (!isPanning || !panStartRef.current) return;

    const stage = e.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (pointer) {
      const dx = pointer.x - panStartRef.current.x;
      const dy = pointer.y - panStartRef.current.y;
      setPanX(panStartRef.current.panX + dx);
      setPanY(panStartRef.current.panY + dy);
    }
  }, [isPanning, isMeasuring, panX, panY, zoom]);

  const handleStageMouseUp = useCallback(() => {
    // Finish measuring - keep measurement visible until tool is deactivated
    if (isMeasuring) {
      setIsMeasuring(false);
      return;
    }

    setIsPanning(false);
    panStartRef.current = null;
  }, [isMeasuring]);

  const handleStageMouseLeave = useCallback(() => {
    setIsPanning(false);
    panStartRef.current = null;
  }, []);

  // Handle wheel for zoom (zooms toward cursor position)
  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    if (!stage) return;

    const scaleBy = 1.1;
    const oldZoom = zoom;
    const newZoom = e.evt.deltaY > 0
      ? Math.max(0.3, oldZoom / scaleBy)
      : Math.min(3, oldZoom * scaleBy);

    // Get pointer position relative to stage
    const pointer = stage.getPointerPosition();
    if (!pointer) {
      setZoom(newZoom);
      return;
    }

    // Calculate new pan position to keep pointer stationary
    // Formula: newPan = pointer - (pointer - oldPan) * (newZoom / oldZoom)
    const mousePointTo = {
      x: (pointer.x - panX) / oldZoom,
      y: (pointer.y - panY) / oldZoom,
    };

    const newPanX = pointer.x - mousePointTo.x * newZoom;
    const newPanY = pointer.y - mousePointTo.y * newZoom;

    setZoom(newZoom);
    setPanX(newPanX);
    setPanY(newPanY);
  }, [zoom, panX, panY]);

  // Touch handlers for swipe
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setTouchStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
      setIsSwiping(false);
      setSwipeOffset(0);
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStart || e.touches.length !== 1) return;

    const deltaX = e.touches[0].clientX - touchStart.x;
    const deltaY = e.touches[0].clientY - touchStart.y;

    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 20) {
      setIsSwiping(true);
      setSwipeOffset(deltaX);
    }
  }, [touchStart]);

  const handleTouchEnd = useCallback(() => {
    if (isSwiping && Math.abs(swipeOffset) > 100) {
      if (swipeOffset > 0) {
        goToPreviousSegment();
      } else {
        goToNextSegment();
      }
    }
    setTouchStart(null);
    setIsSwiping(false);
    setSwipeOffset(0);
  }, [isSwiping, swipeOffset, goToPreviousSegment, goToNextSegment]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        goToPreviousSegment();
      } else if (e.key === 'ArrowRight') {
        goToNextSegment();
      } else if (e.key === 'Escape') {
        // First deselect placement tool, then close on second Escape
        if (selectedPlacement || selectedUnifiedObject || selectedOpeningKind || textPlacementArmed || selectedElevOpeningId) {
          setSelectedPlacement(null);
          setSelectedUnifiedObject(null);
          setSelectedOpeningKind(null);
          setTextPlacementArmed(false);
          setSelectedElevOpeningId(null);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPreviousSegment, goToNextSegment, onClose, selectedPlacement, selectedUnifiedObject, selectedOpeningKind, textPlacementArmed, selectedElevOpeningId]);

  // Selection is per-wall — clear it when navigating to another segment.
  useEffect(() => {
    setSelectedElevOpeningId(null);
  }, [currentSegmentIndex]);

  // Calculate visualization data (segment-based)
  const visualization = useMemo(() => {
    if (!currentSegment) return null;

    const wallLengthMM = currentSegment.lengthMM;
    const wallHeightMM = currentSegment.wallHeightMM || 2400;

    // Handle case where segment is too small
    if (wallLengthMM <= 0) {
      return null;
    }

    // Calculate scale to fit in canvas
    const padding = 120;
    const availableWidth = dimensions.width - padding * 2;
    const availableHeight = dimensions.height - padding * 2;

    const scaleX = availableWidth / wallLengthMM;
    const scaleY = availableHeight / wallHeightMM;
    const effectiveScale = Math.min(scaleX, scaleY) * 0.75;

    const wallWidth = wallLengthMM * effectiveScale;
    const wallHeight = wallHeightMM * effectiveScale;
    const wallX = (dimensions.width - wallWidth) / 2;
    const wallY = (dimensions.height - wallHeight) / 2 + 20;

    return {
      wallX,
      wallY,
      wallWidth,
      wallHeight,
      wallLengthMM,
      wallHeightMM,
      effectiveScale,
      hasWall: currentSegment.hasWall,
      wall: currentSegment.wall,
      openings: currentSegment.openings,
    };
  }, [currentSegment, dimensions, pixelsPerMm]);

  /**
   * Handle drag end for wall-attached objects in elevation view.
   * Converts the new screen position back to wall-relative coordinates
   * and syncs with the floor plan.
   */
  const handleObjectDragEnd = useCallback((
    obj: FloorMapShape,
    e: Konva.KonvaEventObject<DragEvent>
  ) => {
    if (!visualization?.wall || !obj.wallRelative) {
      setDraggingObjectId(null);
      setDragPosition(null);
      return;
    }

    const node = e.target;
    const newX = node.x();
    const newY = node.y();

    // Use original object dimensions (in mm) scaled to screen pixels
    const objWidthPixels = obj.wallRelative.width * visualization.effectiveScale;
    const objHeightPixels = obj.wallRelative.height * visualization.effectiveScale;

    // Convert screen position back to wall-relative mm
    const newWallRelative = elevationToWallRelative(
      newX,
      newY,
      objWidthPixels,
      objHeightPixels,
      visualization.wall,
      visualization.wallHeightMM,
      visualization.effectiveScale,
      visualization.wallX,
      visualization.wallY
    );

    if (newWallRelative) {
      // Update the shape's wall-relative position
      updateShapeWallRelative(obj.id, {
        distanceFromWallStart: Math.max(0, newWallRelative.distanceFromWallStart ?? 0),
        elevationBottom: Math.max(0, newWallRelative.elevationBottom ?? 0),
        // Preserve width/height/depth from existing data
        width: obj.wallRelative.width,
        height: obj.wallRelative.height,
      });
    }

    isDraggingObjectRef.current = false;
    setDraggingObjectId(null);
    setDragPosition(null);
  }, [visualization, updateShapeWallRelative]);

  /**
   * Handle selecting a unified object from the library
   */
  const handleSelectUnifiedObject = useCallback((definition: UnifiedObjectDefinition) => {
    setSelectedUnifiedObject(definition);
    setSelectedPlacement(null); // Clear legacy placement
    setObjectLibraryOpen(false);
    toast.success(t('objectLibrary.objectSelectedWall', { name: definition.name, defaultValue: `${definition.name} vald - klicka på väggen för att placera` }));
  }, [t]);

  /**
   * Handle click on canvas to place object
   */
  const handleCanvasClick = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    // Only handle placement if an object is selected (legacy or unified)
    const hasPlacement =
      selectedPlacement || selectedUnifiedObject || selectedOpeningKind || textPlacementArmed;
    if (!hasPlacement || !visualization?.wall || !currentSegment?.hasWall) return;

    // Get the click position relative to stage
    const stage = e.target.getStage();
    if (!stage) return;

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    // Convert to unscaled coordinates
    const x = (pointer.x - panX) / zoom;
    const y = (pointer.y - panY) / zoom;

    // v2: place a wall-anchored text annotation (sticky-note style).
    if (editorV2 && textPlacementArmed) {
      const wall = visualization.wall;
      const scale = visualization.effectiveScale;
      const notrWpx = 700 * scale;
      const notrHpx = 250 * scale;
      const wr = elevationToWallRelative(
        x - notrWpx / 2,
        y - notrHpx / 2,
        notrWpx,
        notrHpx,
        wall,
        visualization.wallHeightMM,
        scale,
        visualization.wallX,
        visualization.wallY
      );
      if (!wr || typeof wr.distanceFromWallStart !== 'number') return;
      const wc = wall.coordinates as { x1: number; y1: number };
      const newId = crypto.randomUUID();
      addShape({
        id: newId,
        type: 'text',
        planId: currentPlanId || room?.planId,
        shapeViewMode: 'elevation',
        text: '',
        name: t('elevation.noteName', 'Anteckning'),
        color: '#fef9c3',
        coordinates: { x: wc.x1, y: wc.y1 },
        wallRelative: {
          wallId: wall.id,
          distanceFromWallStart: Math.max(0, wr.distanceFromWallStart),
          perpendicularOffset: 0,
          elevationBottom: Math.max(0, wr.elevationBottom ?? 1200),
          width: 700,
          height: 250,
          depth: 10,
        },
        metadata: { placedInElevation: true },
      } as FloorMapShape);
      setTextPlacementArmed(false);
      setTextEditShapeId(newId);
      setTextDraft('');
      return;
    }

    // v2: place an opening on the hosted wall at the clicked position.
    // The view renders along the ROOM EDGE (screen-left = edge.start) while
    // opening.positionOnWall runs along the WALL's own direction — these can
    // be anti-parallel, so go via a world point: click fraction along the
    // edge → world → project onto the wall frame.
    if (editorV2 && selectedOpeningKind) {
      const wall = visualization.wall;
      const edge = currentSegment.edge;
      const frame = wallFrame(wall);
      if (!frame || visualization.wallWidth <= 0) return;
      const f = Math.max(0, Math.min(1, (x - visualization.wallX) / visualization.wallWidth));
      const worldPoint = {
        x: edge.start.x + (edge.end.x - edge.start.x) * f,
        y: edge.start.y + (edge.end.y - edge.start.y) * f,
      };
      const { t } = projectOntoWall(worldPoint, frame);
      execute('opening.add', { wallId: wall.id, t, kind: selectedOpeningKind });
      return;
    }

    // Handle unified object placement
    if (selectedUnifiedObject) {
      const objWidth = selectedUnifiedObject.dimensions.width;
      const objHeight = selectedUnifiedObject.dimensions.height;
      const defaultElevation = selectedUnifiedObject.wallBehavior.defaultElevationMM;

      // Convert screen position to wall-relative coordinates
      const wallRelative = elevationToWallRelative(
        x - objWidth / 2,
        y - objHeight / 2,
        objWidth,
        objHeight,
        visualization.wall,
        visualization.wallHeightMM,
        visualization.effectiveScale,
        visualization.wallX,
        visualization.wallY
      );

      if (!wallRelative) return;

      // Create the new shape with unified object metadata
      const newId = crypto.randomUUID();
      const newShape: FloorMapShape = {
        id: newId,
        type: 'freehand', // Using freehand type like floor plan
        planId: currentPlanId || room?.planId,
        coordinates: {
          points: [
            { x: visualization.wall.coordinates.x1, y: visualization.wall.coordinates.y1 },
            { x: visualization.wall.coordinates.x1 + 1, y: visualization.wall.coordinates.y1 + 1 },
          ]
        },
        strokeColor: '#374151',
        color: 'transparent',
        strokeWidth: 2,
        name: selectedUnifiedObject.name,
        objectCategory: selectedUnifiedObject.category,
        dimensions3D: {
          width: objWidth,
          height: objHeight,
          depth: selectedUnifiedObject.dimensions.depth,
        },
        wallRelative: {
          wallId: visualization.wall.id,
          distanceFromWallStart: Math.max(0, wallRelative.distanceFromWallStart ?? 0),
          perpendicularOffset: 0,
          elevationBottom: Math.max(0, wallRelative.elevationBottom ?? defaultElevation),
          width: objWidth,
          height: objHeight,
          depth: selectedUnifiedObject.dimensions.depth,
        },
        metadata: {
          isUnifiedObject: true,
          unifiedObjectId: selectedUnifiedObject.id,
          placedInElevation: true,
          placementX: visualization.wall.coordinates.x1,
          placementY: visualization.wall.coordinates.y1,
          scale: 1,
          rotation: 0,
          elevationHeight: objHeight,
          elevationBottom: defaultElevation,
          depth: selectedUnifiedObject.dimensions.depth,
        },
      };

      if (room?.roomId) newShape.roomId = room.roomId;
      addShape(newShape);

      // E3 mirroring: a wall-view placement in a linked room becomes that
      // room's list entry (visible in Rumsdetaljer, the task card and the
      // shared worker instructions — all read the same room_items record).
      const planForLink = currentPlanId || room?.planId;
      if (room?.roomId && projectId && planForLink && isMirroredCategory(selectedUnifiedObject.category)) {
        createRoomItemForPlacedShape(
          planForLink,
          useFloorMapStore.getState().shapes,
          projectId,
          room.roomId,
          newShape,
          selectedUnifiedObject.category
        )
          .then(() => toast.success(t('roomItems.addedFromPlan', 'Tillagt i rummets objektlista')))
          .catch((err) => console.error('Failed to mirror wall-view object into room items:', err));
      }
      return;
    }

    // Legacy placement (original code)
    if (!selectedPlacement) return;

    // Get placement object config
    const objConfig = placementObjects[selectedPlacement];
    if (!objConfig) return;

    // Convert screen position to wall-relative coordinates
    const wallRelative = elevationToWallRelative(
      x - objConfig.width / 2, // Center object on click
      y - objConfig.height / 2,
      objConfig.width,
      objConfig.height,
      visualization.wall,
      visualization.wallHeightMM,
      visualization.effectiveScale,
      visualization.wallX,
      visualization.wallY
    );

    if (!wallRelative) return;

    // Create the new shape
    const newId = crypto.randomUUID();
    const newShape: FloorMapShape = {
      id: newId,
      type: 'symbol',
      planId: currentPlanId || room?.planId,
      coordinates: {
        x: visualization.wall.coordinates.x1,
        y: visualization.wall.coordinates.y1,
        symbolType: selectedPlacement,
        size: objConfig.width,
      },
      name: objConfig.name,
      objectCategory: objConfig.category,
      dimensions3D: {
        width: objConfig.width,
        height: objConfig.height,
        depth: 50, // Electrical objects are shallow
      },
      wallRelative: {
        wallId: visualization.wall.id,
        distanceFromWallStart: Math.max(0, wallRelative.distanceFromWallStart ?? 0),
        perpendicularOffset: 0, // Flush with wall
        elevationBottom: Math.max(0, wallRelative.elevationBottom ?? objConfig.elevationBottom),
        width: objConfig.width,
        height: objConfig.height,
        depth: 50,
      },
      metadata: {
        objectId: selectedPlacement,
        placedInElevation: true,
      },
    };

    // Add to store
    addShape(newShape);

    // Clear selection after placement (or keep selected for multiple placements)
    // setSelectedPlacement(null); // Uncomment to require re-selection after each placement
  }, [selectedPlacement, selectedUnifiedObject, selectedOpeningKind, textPlacementArmed, editorV2, visualization, currentSegment, zoom, panX, panY, placementObjects, addShape, currentPlanId, room, projectId, t]);

  // Quick comment handlers (PROTOTYPE)
  const handleObjectRightClick = useCallback((
    e: Konva.KonvaEventObject<PointerEvent>,
    objectId: string,
    screenX: number,
    screenY: number
  ) => {
    e.evt.preventDefault();
    setShowContextMenu({ x: screenX, y: screenY, objectId });
  }, []);

  // Open comments popover for an object
  const handleOpenComments = useCallback((objectId: string, screenX?: number, screenY?: number) => {
    // Use provided position or context menu position or default
    const x = screenX ?? showContextMenu?.x ?? 200;
    const y = screenY ?? showContextMenu?.y ?? 200;
    setActiveComment({ objectId, position: { x, y } });
    setShowContextMenu(null);
  }, [showContextMenu]);

  // Close comments popover
  const handleCloseComments = useCallback(() => {
    setActiveComment(null);
  }, []);

  // Handle comment count change from popover
  const handleCommentCountChange = useCallback((objectId: string, count: number) => {
    setCommentCounts(prev => ({ ...prev, [objectId]: count }));
  }, []);

  // Handle resolved state change from popover
  const handleResolvedChange = useCallback((objectId: string, isResolved: boolean) => {
    setResolvedStatus(prev => ({ ...prev, [objectId]: isResolved }));
  }, []);

  // Close context menu when clicking elsewhere
  useEffect(() => {
    const handleClickOutside = () => {
      setShowContextMenu(null);
    };
    if (showContextMenu) {
      window.addEventListener('click', handleClickOutside);
      return () => window.removeEventListener('click', handleClickOutside);
    }
  }, [showContextMenu]);

  if (segmentData.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center">
        <div className="bg-white rounded-lg p-6 max-w-md text-center">
          <Home className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">
            {t('roomElevation.invalidRoom', 'Invalid room')}
          </h3>
          <p className="text-gray-600 mb-4">
            {t('roomElevation.roomNeedsPoints', 'The room needs at least 3 points to show elevation view.')}
          </p>
          <Button onClick={onClose}>
            {t('common.close', 'Close')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gray-900 z-[200] flex flex-col">
      {/* Header */}
      <div className="bg-white border-b shadow-sm px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Breadcrumb: ← Planritning · Rum · Vägg n/N */}
          <Button variant="ghost" size="sm" onClick={onClose} className="gap-1.5 text-gray-600">
            <ArrowLeft className="h-4 w-4" />
            {t('roomElevation.backToFloorPlan', 'Planritning')}
          </Button>
          <span className="text-gray-300">·</span>
          <div className="flex items-center gap-2">
            {/* Room color indicator */}
            {room?.color && (
              <div
                className="w-4 h-4 rounded-full border-2 border-white shadow-sm"
                style={{ backgroundColor: room.color.replace(/[\d.]+\)$/, '0.8)') }}
              />
            )}
            <div>
              <h2 className="font-semibold text-lg leading-tight">
                {room?.name || t('roomElevation.room', 'Room')}
              </h2>
              <p className="text-sm text-gray-500">
                {t('roomElevation.wallCounter', 'Vägg {{n}} av {{total}}', {
                  n: currentSegmentIndex + 1,
                  total: segmentData.length,
                })}{' '}
                · {t('roomElevation.swipeHint', 'Swipe or use arrows to navigate walls')}
              </p>
            </div>
          </div>
        </div>

        {/* Segment selector dropdown */}
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                style={{
                  backgroundColor: currentSegment ? directionColors[currentSegment.direction] : '#888',
                  color: 'white',
                }}
                className="hover:opacity-90 gap-2"
              >
                {currentSegment?.label || t('roomElevation.wall', 'Wall')}
                <span className="opacity-80">
                  {getDirectionIcon(currentSegment?.direction || 'north')}
                </span>
                <ChevronDown className="h-4 w-4 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="min-w-[180px] z-[250]">
              {segmentData.map((seg, index) => (
                <DropdownMenuItem
                  key={seg.segmentIndex}
                  onSelect={() => goToSegment(index)}
                  className="flex items-center justify-between gap-3 cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: directionColors[seg.direction] }}
                    />
                    <span className={index === currentSegmentIndex ? 'font-semibold' : ''}>
                      {seg.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground text-sm">
                    {getDirectionIcon(seg.direction)}
                    {!seg.hasWall && (
                      <span className="w-2 h-2 bg-orange-500 rounded-full ml-1" />
                    )}
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {currentSegment && !currentSegment.hasWall && (
            <Badge variant="outline" className="text-orange-600 border-orange-600 text-xs">
              {t('roomElevation.noWall', 'Ingen vägg')}
            </Badge>
          )}
        </div>

        {/* Zoom controls (v2: measure lives in the left rail instead) */}
        <div className="flex items-center gap-1">
          {!editorV2 && (
            <>
              <Button
                variant={isMeasureActive ? "default" : "ghost"}
                size="icon"
                onClick={toggleMeasureTool}
                className={isMeasureActive ? "bg-red-500 hover:bg-red-600 text-white" : ""}
                title={t('floormap.measureDistance', 'Mät avstånd')}
              >
                <Ruler className="h-4 w-4" />
              </Button>
              <div className="w-px h-6 bg-gray-200 mx-1" />
            </>
          )}
          <Button variant="ghost" size="icon" onClick={handleZoomOut}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm text-gray-600 w-12 text-center">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="icon" onClick={handleZoomIn}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={resetView}>
            <RotateCcw className="h-4 w-4" />
          </Button>
          <span className="text-gray-300 mx-1">|</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSave}
            disabled={isSaving}
            title={t('common.save', 'Spara') + ' (⌘S)'}
          >
            <Save className={cn("h-4 w-4", isSaving && "animate-pulse")} />
          </Button>
        </div>
      </div>

      {/* Object placement toolbar (Electrical) - merged with navigation.
          v1 only — the v2 shell replaces it with the compact left rail. */}
      {!editorV2 && (
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2">
        <div className="flex items-center gap-2 justify-center flex-wrap">
          {/* Select/Pointer tool (deselect placement) */}
          <Button
            variant={!selectedPlacement && !selectedUnifiedObject ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setSelectedPlacement(null);
              setSelectedUnifiedObject(null);
            }}
            className={cn(
              'gap-1.5',
              !selectedPlacement && !selectedUnifiedObject && 'bg-gray-700 hover:bg-gray-800 border-gray-700'
            )}
            title={t('elevation.selectTool', 'Markera (Esc)')}
          >
            <MousePointer2 className="h-4 w-4" />
          </Button>

          <span className="text-amber-400 mx-1">|</span>

          {/* Professional Object Library (New) */}
          <DropdownMenu open={objectLibraryOpen} onOpenChange={setObjectLibraryOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant={selectedUnifiedObject ? 'default' : 'outline'}
                size="sm"
                className={cn(
                  'gap-1.5',
                  selectedUnifiedObject && 'bg-blue-600 hover:bg-blue-700 border-blue-600'
                )}
                title={t('objectLibrary.title', 'Objektbibliotek')}
              >
                <Plug className="h-4 w-4" />
                <span className="hidden sm:inline">
                  {selectedUnifiedObject ? selectedUnifiedObject.name : t('objectLibrary.title', 'Objektbibliotek')}
                </span>
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-64 p-0 z-[250]" sideOffset={5}>
              <div className="h-80">
                <ObjectLibraryPanel
                  onSelectObject={handleSelectUnifiedObject}
                  selectedObjectId={selectedUnifiedObject?.id}
                  viewMode="elevation"
                />
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <span className="text-amber-200 mx-1">|</span>

          {/* Legacy electrical objects (for backwards compatibility) */}
          {(Object.keys(placementObjects) as Exclude<PlacementObject, null>[]).map((key) => {
            const obj = placementObjects[key];
            const isSelected = selectedPlacement === key;
            return (
              <Button
                key={key}
                variant={isSelected ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setSelectedPlacement(isSelected ? null : key);
                  setSelectedUnifiedObject(null);
                }}
                className={cn(
                  'gap-1.5 opacity-50 hover:opacity-100',
                  isSelected && 'bg-amber-600 hover:bg-amber-700 border-amber-600 opacity-100'
                )}
                title={`${obj.name} (legacy)`}
              >
                {obj.icon}
              </Button>
            );
          })}

          {(selectedPlacement || selectedUnifiedObject) && (
            <span className="text-xs text-amber-700 ml-2 hidden sm:inline">
              {t('elevation.clickToPlace', 'Klicka på väggen för att placera')} · <kbd className="px-1 py-0.5 bg-amber-100 rounded text-[10px]">Esc</kbd> {t('elevation.toDeselect', 'avbryt')}
            </span>
          )}
        </div>
      </div>
      )}

      {/* Main content area with canvas and optional details panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas container */}
        <div
          ref={containerRef}
          className="flex-1 relative"
          style={{ cursor: isMeasureActive ? 'crosshair' : 'default' }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
        {/* v2 shell: compact left tool rail — Välj / Objekt / Mät, same look
            as the floor-plan rail. (Öppning/Text kräver elevation-stöd som
            inte finns än — läggs till med elevation-pariteten.) */}
        {editorV2 && (
          <div
            className="absolute left-3 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-1 rounded-xl border bg-white p-1.5 shadow-lg"
            data-testid="elevation-v2-rail"
          >
            <button
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
                !selectedPlacement && !selectedUnifiedObject && !selectedOpeningKind && !isMeasureActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )}
              title={t('floormap.tools.select', 'Välj')}
              onClick={() => {
                setSelectedPlacement(null);
                setSelectedUnifiedObject(null);
                setSelectedOpeningKind(null);
                setTextPlacementArmed(false);
                if (isMeasureActive) toggleMeasureTool();
              }}
            >
              <MousePointer2 className="h-5 w-5" />
            </button>
            <Popover open={openingMenuOpen} onOpenChange={setOpeningMenuOpen}>
              <PopoverTrigger asChild>
                <button
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
                    selectedOpeningKind
                      ? 'bg-primary text-primary-foreground'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  )}
                  title={t('floormap.tools.opening', 'Öppning')}
                  data-testid="elevation-tool-opening"
                >
                  <DoorOpen className="h-5 w-5" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="right" align="start" className="ml-2 w-40 p-1 z-[250]">
                {([
                  ['door', t('floormap.tools.door', 'Dörr')],
                  ['window', t('floormap.tools.window', 'Fönster')],
                  ['sliding', t('floormap.tools.slidingDoor', 'Skjutdörr')],
                  ['passage', t('floormap.tools.passage', 'Passage')],
                ] as Array<[OpeningKind, string]>).map(([kind, label]) => (
                  <button
                    key={kind}
                    className={cn(
                      'flex w-full items-center rounded-md px-2 py-1.5 text-sm transition-colors',
                      selectedOpeningKind === kind ? 'bg-primary/10 text-primary' : 'hover:bg-gray-100'
                    )}
                    onClick={() => {
                      setSelectedOpeningKind(kind);
                      setSelectedPlacement(null);
                      setSelectedUnifiedObject(null);
                      setOpeningMenuOpen(false);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
            <Popover open={objectLibraryOpen} onOpenChange={setObjectLibraryOpen}>
              <PopoverTrigger asChild>
                <button
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
                    selectedUnifiedObject
                      ? 'bg-primary text-primary-foreground'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  )}
                  title={t('floormap.tools.objects', 'Objekt')}
                >
                  <Blocks className="h-5 w-5" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="right" align="start" className="ml-2 h-96 w-72 p-0 z-[250]">
                <ObjectLibraryPanel
                  onSelectObject={(def) => {
                    handleSelectUnifiedObject(def);
                    setObjectLibraryOpen(false);
                  }}
                  selectedObjectId={selectedUnifiedObject?.id}
                  viewMode="elevation"
                />
              </PopoverContent>
            </Popover>
            <button
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
                isMeasureActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )}
              title={t('floormap.measureDistance', 'Mät avstånd')}
              onClick={toggleMeasureTool}
            >
              <Ruler className="h-5 w-5" />
            </button>
            <button
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
                textPlacementArmed
                  ? 'bg-primary text-primary-foreground'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )}
              title={t('floormap.tools.text', 'Text')}
              data-testid="elevation-tool-text"
              onClick={() => {
                setTextPlacementArmed((v) => !v);
                setSelectedPlacement(null);
                setSelectedUnifiedObject(null);
                setSelectedOpeningKind(null);
              }}
            >
              <span className="text-lg font-serif leading-none">T</span>
            </button>
          </div>
        )}

        {/* v2: floating hint while a placement is armed */}
        {editorV2 && (selectedPlacement || selectedUnifiedObject || selectedOpeningKind || textPlacementArmed) && (
          <div className="absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full border bg-white px-3 py-1.5 text-xs text-gray-700 shadow-md">
            {selectedUnifiedObject?.name
              ? `${selectedUnifiedObject.name} · `
              : selectedOpeningKind
                ? `${t(`floormap.openingKind.${selectedOpeningKind}`, selectedOpeningKind === 'door' ? 'Dörr' : selectedOpeningKind === 'window' ? 'Fönster' : selectedOpeningKind === 'sliding' ? 'Skjutdörr' : 'Passage')} · `
                : textPlacementArmed
                  ? `${t('elevation.noteName', 'Anteckning')} · `
                  : ''}
            {t('elevation.clickToPlace', 'Klicka på väggen för att placera')} ·{' '}
            <kbd className="rounded bg-gray-100 px-1 py-0.5 text-[10px]">Esc</kbd>{' '}
            {t('elevation.toDeselect', 'avbryt')}
          </div>
        )}

        {/* v2: inline editor for a wall-anchored text note */}
        {editorV2 && textEditShapeId && (
          <div className="absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-2 rounded-lg border bg-white p-2 shadow-lg">
            <input
              autoFocus
              type="text"
              className="h-8 w-72 rounded-md border px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder={t('elevation.notePlaceholder', 'Skriv anteckningen…')}
              value={textDraft}
              onChange={(e) => setTextDraft(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                  const trimmed = textDraft.trim();
                  if (trimmed) {
                    updateShape(textEditShapeId, { text: trimmed });
                    handleSave();
                  } else {
                    // Empty note = never meant to be — remove it
                    deleteShape(textEditShapeId);
                  }
                  setTextEditShapeId(null);
                }
                if (e.key === 'Escape') {
                  const existing = shapes.find((s) => s.id === textEditShapeId);
                  if (existing && !existing.text) deleteShape(textEditShapeId);
                  setTextEditShapeId(null);
                }
              }}
            />
            <span className="text-[10px] text-gray-400">
              Enter {t('common.save', 'spara')} · Esc {t('common.cancel', 'avbryt')}
            </span>
          </div>
        )}

        {/* v2: editing chip for the selected opening — width, flip, delete */}
        {editorV2 && selectedElevOpeningId && (() => {
          const op = shapes.find((s) => s.id === selectedElevOpeningId && s.type === 'opening');
          if (!op) return null;
          const widthMM = (op.metadata?.widthMM as number) ?? 900;
          return (
            <div className="absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-lg border bg-white p-1.5 shadow-lg">
              <span className="pl-1 text-xs text-gray-500">
                {t(`floormap.openingKind.${op.openingKind}`, op.openingKind ?? '')}
              </span>
              <input
                key={`${op.id}-${widthMM}`}
                type="number"
                className="h-7 w-16 rounded-md border px-1.5 text-right text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                defaultValue={widthMM}
                min={300}
                step={10}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                onBlur={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (Number.isFinite(v) && v > 0 && v !== widthMM) {
                    execute('opening.setWidth', { id: op.id, widthMM: v });
                  }
                }}
              />
              <span className="text-xs text-gray-400">mm</span>
              <button
                className="flex h-7 w-7 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100"
                title={t('floormap.selection.flipOpening', 'Vänd öppning')}
                onClick={() => execute('opening.flip', { id: op.id })}
              >
                ⇄
              </button>
              <button
                className="flex h-7 w-7 items-center justify-center rounded-md text-gray-600 hover:bg-red-50 hover:text-red-600"
                title={t('floormap.selection.delete', 'Radera')}
                onClick={() => {
                  execute('shape.delete', { ids: [op.id] });
                  setSelectedElevOpeningId(null);
                }}
              >
                🗑
              </button>
            </div>
          );
        })()}

        {/* v2: wall surface info — the per-wall work instruction (material,
            treatment, color code) + the room's wall color swatch. */}
        {editorV2 && currentSegment?.wall && (
          <div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2">
            <Popover open={wallInfoOpen} onOpenChange={setWallInfoOpen}>
              <PopoverTrigger asChild>
                <button
                  className="flex items-center gap-2 rounded-full border bg-white px-3 py-1.5 text-xs text-gray-700 shadow-md transition-colors hover:bg-gray-50"
                  data-testid="wall-surface-chip"
                >
                  {room?.wallSurfaceColor && (
                    <span
                      className="h-3.5 w-3.5 rounded-full border border-black/10"
                      style={{ backgroundColor: room.wallSurfaceColor }}
                    />
                  )}
                  {[
                    currentSegment.wall.material,
                    currentSegment.wall.treatment,
                    currentSegment.wall.treatmentColor,
                  ]
                    .filter(Boolean)
                    .join(' · ') || t('elevation.wallSurfaceEmpty', 'Ange ytskikt för väggen')}
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" align="center" className="w-72 z-[250]">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t('elevation.wallSurfaceTitle', 'Väggens ytskikt (arbetsinstruktion)')}
                  </p>
                  {(
                    [
                      ['material', t('elevation.wallMaterial', 'Material'), 'Gips, betong…'],
                      ['treatment', t('elevation.wallTreatment', 'Behandling'), 'Målad, tapetserad…'],
                      ['treatmentColor', t('elevation.wallColorCode', 'Färgkod'), 'NCS S 0300-N…'],
                    ] as Array<['material' | 'treatment' | 'treatmentColor', string, string]>
                  ).map(([field, label, placeholder]) => (
                    <label key={field} className="block text-xs text-muted-foreground">
                      {label}
                      <input
                        type="text"
                        className="mt-0.5 h-8 w-full rounded-md border px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        placeholder={placeholder}
                        defaultValue={(currentSegment.wall![field] as string) ?? ''}
                        onKeyDown={(e) => e.stopPropagation()}
                        onBlur={(e) => {
                          const value = e.target.value.trim();
                          if (value !== ((currentSegment.wall![field] as string) ?? '')) {
                            updateShape(currentSegment.wall!.id, { [field]: value || undefined });
                            handleSave();
                          }
                        }}
                      />
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        )}

        {/* Navigation arrows */}
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'absolute top-1/2 -translate-y-1/2 z-10 h-12 w-12 bg-white/80 hover:bg-white shadow-lg',
            editorV2 ? 'left-20' : 'left-4'
          )}
          onClick={goToPreviousSegment}
        >
          <ChevronLeft className="h-8 w-8" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-4 top-1/2 -translate-y-1/2 z-10 h-12 w-12 bg-white/80 hover:bg-white shadow-lg"
          onClick={goToNextSegment}
        >
          <ChevronRight className="h-8 w-8" />
        </Button>

        {/* Swipe indicator */}
        {isSwiping && (
          <div
            className="absolute inset-0 pointer-events-none flex items-center justify-center"
            style={{
              transform: `translateX(${swipeOffset * 0.3}px)`,
              opacity: Math.min(Math.abs(swipeOffset) / 100, 1),
            }}
          >
            <div className={cn(
              "bg-white/90 rounded-full px-6 py-3 shadow-lg",
              swipeOffset > 0 ? "text-blue-600" : "text-blue-600"
            )}>
              {swipeOffset > 0
                ? `← ${t('roomElevation.previousWall', 'Previous')}`
                : `${t('roomElevation.nextWall', 'Next')} →`
              }
            </div>
          </div>
        )}

        {/* Konva Stage */}
        <Stage
          ref={stageRef}
          width={dimensions.width}
          height={dimensions.height}
          onWheel={handleWheel}
          onClick={handleCanvasClick}
          onTap={handleCanvasClick}
          onMouseDown={handleStageMouseDown}
          onMouseMove={handleStageMouseMove}
          onMouseUp={handleStageMouseUp}
          onMouseLeave={handleStageMouseLeave}
          scaleX={zoom}
          scaleY={zoom}
          x={panX}
          y={panY}
          style={{ cursor: isPanning ? 'grabbing' : (selectedPlacement || selectedUnifiedObject) ? 'crosshair' : 'grab' }}
        >
          <Layer>
            {/* Background - named for pan detection */}
            <Rect
              name="background"
              x={-1000}
              y={-1000}
              width={dimensions.width + 2000}
              height={dimensions.height + 2000}
              fill="#f3f4f6"
            />

            {visualization && currentSegment && (
              <>
                {/* Floor line */}
                <Line
                  points={[
                    visualization.wallX - 50,
                    visualization.wallY + visualization.wallHeight,
                    visualization.wallX + visualization.wallWidth + 50,
                    visualization.wallY + visualization.wallHeight,
                  ]}
                  stroke="#374151"
                  strokeWidth={3}
                />
                <KonvaText
                  x={visualization.wallX + visualization.wallWidth + 60}
                  y={visualization.wallY + visualization.wallHeight - 8}
                  text={t('roomElevation.floor', 'Floor')}
                  fontSize={12}
                  fill="#6b7280"
                />

                {/* Wall rectangle - solid if wall exists, dashed if no wall.
                    E4: tint the wall face with the room's actual wall paint
                    (wall_spec.main_color) when set, so the elevation reads as a
                    paint instruction; otherwise fall back to the subtle room tint. */}
                <Rect
                  x={visualization.wallX}
                  y={visualization.wallY}
                  width={visualization.wallWidth}
                  height={visualization.wallHeight}
                  fill={visualization.hasWall
                    ? (room?.wallSurfaceColor
                      ? room.wallSurfaceColor
                      : (room?.color
                        ? room.color.replace(/[\d.]+\)$/, '0.15)') // Make room color very subtle
                        : '#e5e7eb'))
                    : '#fafafa'}
                  opacity={visualization.hasWall && room?.wallSurfaceColor ? 0.55 : 1}
                  stroke={directionColors[currentSegment.direction]}
                  strokeWidth={visualization.hasWall ? 3 : 2}
                  dash={visualization.hasWall ? undefined : [10, 5]}
                />

                {/* Show "No wall" message if no wall exists */}
                {!visualization.hasWall && (
                  <KonvaText
                    x={visualization.wallX + visualization.wallWidth / 2 - 50}
                    y={visualization.wallY + visualization.wallHeight / 2 - 10}
                    text={t('roomElevation.noWallDrawn', 'Ingen vägg ritad')}
                    fontSize={14}
                    fill="#9ca3af"
                    fontStyle="italic"
                  />
                )}

                {/* Wall pattern (brick-like) - only if wall exists */}
                {visualization.hasWall && Array.from({ length: Math.ceil(visualization.wallHeight / 30) }).map((_, rowIndex) => (
                  <Line
                    key={`row-${rowIndex}`}
                    points={[
                      visualization.wallX,
                      visualization.wallY + rowIndex * 30,
                      visualization.wallX + visualization.wallWidth,
                      visualization.wallY + rowIndex * 30,
                    ]}
                    stroke="#d1d5db"
                    strokeWidth={0.5}
                    dash={[5, 10]}
                  />
                ))}

                {/* Width dimension label */}
                <Group>
                  <Line
                    points={[
                      visualization.wallX,
                      visualization.wallY - 40,
                      visualization.wallX + visualization.wallWidth,
                      visualization.wallY - 40,
                    ]}
                    stroke="#374151"
                    strokeWidth={1}
                  />
                  <Line
                    points={[
                      visualization.wallX,
                      visualization.wallY - 45,
                      visualization.wallX,
                      visualization.wallY - 35,
                    ]}
                    stroke="#374151"
                    strokeWidth={1}
                  />
                  <Line
                    points={[
                      visualization.wallX + visualization.wallWidth,
                      visualization.wallY - 45,
                      visualization.wallX + visualization.wallWidth,
                      visualization.wallY - 35,
                    ]}
                    stroke="#374151"
                    strokeWidth={1}
                  />
                  <KonvaText
                    x={visualization.wallX + visualization.wallWidth / 2 - 30}
                    y={visualization.wallY - 60}
                    text={formatDim(visualization.wallLengthMM)}
                    fontSize={14}
                    fontStyle="bold"
                    fill="#1f2937"
                  />
                </Group>

                {/* Height dimension label */}
                <Group>
                  <Line
                    points={[
                      visualization.wallX - 40,
                      visualization.wallY,
                      visualization.wallX - 40,
                      visualization.wallY + visualization.wallHeight,
                    ]}
                    stroke="#374151"
                    strokeWidth={1}
                  />
                  <Line
                    points={[
                      visualization.wallX - 45,
                      visualization.wallY,
                      visualization.wallX - 35,
                      visualization.wallY,
                    ]}
                    stroke="#374151"
                    strokeWidth={1}
                  />
                  <Line
                    points={[
                      visualization.wallX - 45,
                      visualization.wallY + visualization.wallHeight,
                      visualization.wallX - 35,
                      visualization.wallY + visualization.wallHeight,
                    ]}
                    stroke="#374151"
                    strokeWidth={1}
                  />
                  <KonvaText
                    x={visualization.wallX - 80}
                    y={visualization.wallY + visualization.wallHeight / 2 - 7}
                    text={formatDim(visualization.wallHeightMM)}
                    fontSize={14}
                    fontStyle="bold"
                    fill="#1f2937"
                    rotation={-90}
                  />
                </Group>

                {/* Openings (doors/windows) */}
                {visualization.openings.map((opening, index) => {
                  const openingWidthMM = opening.widthPixels / pixelsPerMm;
                  const openingWidth = openingWidthMM * visualization.effectiveScale;

                  // Opening height based on type
                  const isWindow = opening.type === 'window';
                  const isSlidingDoor = opening.type === 'sliding_door';
                  const openingHeightMM = isWindow ? 1200 : 2100;
                  const openingHeight = openingHeightMM * visualization.effectiveScale;

                  // Opening position
                  const openingX = visualization.wallX + opening.positionT * visualization.wallWidth - openingWidth / 2;
                  const openingFromFloor = isWindow ? 900 : 0;
                  const openingY = visualization.wallY + visualization.wallHeight - openingHeight - (openingFromFloor * visualization.effectiveScale);

                  const openingColor = isWindow ? '#0284c7' : isSlidingDoor ? '#10b981' : '#8b5cf6';
                  const openingFill = isWindow ? '#bae6fd' : isSlidingDoor ? '#d1fae5' : '#e9d5ff';

                  // v2 openings (store shape type 'opening') are editable here:
                  // slide along the wall, and select for width/flip/delete.
                  const storeOpening = editorV2
                    ? shapes.find((st) => st.id === opening.shape.id && st.type === 'opening')
                    : undefined;
                  const isOpeningSelected = selectedElevOpeningId === opening.shape.id;

                  return (
                    <Group
                      key={`opening-${index}`}
                      draggable={!!storeOpening}
                      dragBoundFunc={(pos) => ({ x: pos.x, y: 0 })}
                      onMouseDown={(e) => {
                        if (!storeOpening) return;
                        isDraggingObjectRef.current = true;
                        e.cancelBubble = true;
                      }}
                      onClick={(e) => {
                        if (!storeOpening) return;
                        e.cancelBubble = true;
                        isDraggingObjectRef.current = false;
                        setSelectedElevOpeningId(opening.shape.id);
                        setSelectedObjectId(null);
                      }}
                      onDragEnd={(e) => {
                        if (!storeOpening || !currentSegment) return;
                        e.cancelBubble = true;
                        isDraggingObjectRef.current = false;
                        const dx = e.target.x();
                        e.target.position({ x: 0, y: 0 });
                        const centerScreen = openingX + openingWidth / 2 + dx;
                        const f = Math.max(
                          0,
                          Math.min(1, (centerScreen - visualization.wallX) / visualization.wallWidth)
                        );
                        const edge = currentSegment.edge;
                        const frame = wallFrame(visualization.wall!);
                        if (!frame) return;
                        const worldPoint = {
                          x: edge.start.x + (edge.end.x - edge.start.x) * f,
                          y: edge.start.y + (edge.end.y - edge.start.y) * f,
                        };
                        const { t: newT } = projectOntoWall(worldPoint, frame);
                        execute('shape.update', {
                          id: storeOpening.id,
                          updates: { positionOnWall: newT },
                        });
                      }}
                      onMouseEnter={(e) => {
                        if (!storeOpening) return;
                        const container = e.target.getStage()?.container();
                        if (container) container.style.cursor = 'ew-resize';
                      }}
                      onMouseLeave={(e) => {
                        const container = e.target.getStage()?.container();
                        if (container) container.style.cursor = 'grab';
                      }}
                    >
                      <Rect
                        x={openingX}
                        y={openingY}
                        width={openingWidth}
                        height={openingHeight}
                        fill={openingFill}
                        stroke={isOpeningSelected ? '#22c55e' : openingColor}
                        strokeWidth={isOpeningSelected ? 3 : 2}
                        shadowColor={isOpeningSelected ? '#22c55e' : undefined}
                        shadowBlur={isOpeningSelected ? 8 : 0}
                        shadowOpacity={isOpeningSelected ? 0.4 : 0}
                      />
                      {/* Opening label */}
                      <KonvaText
                        x={openingX + openingWidth / 2 - 20}
                        y={openingY + openingHeight / 2 - 6}
                        text={isWindow
                          ? t('roomElevation.window', 'Window')
                          : isSlidingDoor
                            ? t('roomElevation.slidingDoor', 'Sliding Door')
                            : t('roomElevation.door', 'Door')}
                        fontSize={10}
                        fill={openingColor}
                      />
                      {/* Opening width dimension - above the opening */}
                      <Line
                        points={[
                          openingX,
                          openingY - 15,
                          openingX + openingWidth,
                          openingY - 15,
                        ]}
                        stroke={openingColor}
                        strokeWidth={1}
                      />
                      <Line
                        points={[openingX, openingY - 20, openingX, openingY - 10]}
                        stroke={openingColor}
                        strokeWidth={1}
                      />
                      <Line
                        points={[openingX + openingWidth, openingY - 20, openingX + openingWidth, openingY - 10]}
                        stroke={openingColor}
                        strokeWidth={1}
                      />
                      <KonvaText
                        x={openingX + openingWidth / 2 - 15}
                        y={openingY - 30}
                        text={formatDim(openingWidthMM)}
                        fontSize={10}
                        fontStyle="bold"
                        fill={openingColor}
                      />
                      {/* Opening height dimension - on the right side */}
                      <Line
                        points={[
                          openingX + openingWidth + 8,
                          openingY,
                          openingX + openingWidth + 8,
                          openingY + openingHeight,
                        ]}
                        stroke={openingColor}
                        strokeWidth={1}
                      />
                      <Line
                        points={[openingX + openingWidth + 5, openingY, openingX + openingWidth + 11, openingY]}
                        stroke={openingColor}
                        strokeWidth={1}
                      />
                      <Line
                        points={[openingX + openingWidth + 5, openingY + openingHeight, openingX + openingWidth + 11, openingY + openingHeight]}
                        stroke={openingColor}
                        strokeWidth={1}
                      />
                      <KonvaText
                        x={openingX + openingWidth + 14}
                        y={openingY + openingHeight / 2 - 5}
                        text={formatDim(openingHeightMM)}
                        fontSize={9}
                        fill={openingColor}
                      />
                    </Group>
                  );
                })}

                {/* Wall-attached objects (furniture, cabinets, etc.) - DRAGGABLE for bidirectional sync */}
                {segmentObjects.map((obj) => {
                  if (!obj.wallRelative || !visualization.wall) return null;

                  // Calculate elevation position
                  const pos = wallRelativeToElevation(
                    obj.wallRelative,
                    visualization.wall,
                    visualization.wallHeightMM,
                    0, // canvasHeight not used in calculation
                    visualization.effectiveScale,
                    visualization.wallX,
                    visualization.wallY
                  );

                  if (!pos) return null;

                  const objColor = getCategoryColor(obj.objectCategory);
                  const objStroke = getCategoryStroke(obj.objectCategory);
                  const isDragging = draggingObjectId === obj.id;

                  // Ensure minimum display size for small objects (at least 20px on screen)
                  const minDisplaySize = 20;
                  const displayWidth = Math.max(pos.width, minDisplaySize);
                  const displayHeight = Math.max(pos.height, minDisplaySize);

                  // Get object name for label
                  const objName = obj.name || obj.metadata?.objectId || t('roomElevation.object', 'Object');

                  // Use dragPosition if this object is being dragged, otherwise use calculated pos
                  const displayX = isDragging && dragPosition ? dragPosition.x : pos.x;
                  const displayY = isDragging && dragPosition ? dragPosition.y : pos.y;

                  // Check if object has comments
                  const commentCount = commentCounts[obj.id] || 0;
                  const hasComments = commentCount > 0;
                  const isCommentResolved = resolvedStatus[obj.id] || false;

                  // Check if object is selected (for details panel)
                  const isSelected = selectedObjectId === obj.id;

                  return (
                    <Group
                      key={`elev-obj-${obj.id}`}
                      x={displayX}
                      y={displayY}
                      draggable
                      onContextMenu={(e) => {
                        // Right-click to open context menu
                        e.evt.preventDefault();
                        const stage = e.target.getStage();
                        if (stage) {
                          const containerRect = stage.container().getBoundingClientRect();
                          const pointer = stage.getPointerPosition();
                          if (pointer) {
                            handleObjectRightClick(
                              e,
                              obj.id,
                              containerRect.left + pointer.x,
                              containerRect.top + pointer.y
                            );
                          }
                        }
                      }}
                      onDblClick={(e) => {
                        e.cancelBubble = true;
                        // Text annotations: double-click edits the note text
                        if (obj.type === 'text') {
                          setTextEditShapeId(obj.id);
                          setTextDraft(obj.text ?? '');
                          return;
                        }
                        // Other objects: open the comments popover
                        const stage = e.target.getStage();
                        if (stage) {
                          const containerRect = stage.container().getBoundingClientRect();
                          const pointer = stage.getPointerPosition();
                          if (pointer) {
                            handleOpenComments(obj.id, containerRect.left + pointer.x, containerRect.top + pointer.y);
                          }
                        }
                      }}
                      onMouseDown={(e) => {
                        // Immediately set ref to block Stage dragging (sync, before drag starts)
                        isDraggingObjectRef.current = true;
                        e.cancelBubble = true;
                      }}
                      onTouchStart={(e) => {
                        // Immediately set ref to block Stage dragging on touch devices
                        isDraggingObjectRef.current = true;
                        e.cancelBubble = true;
                      }}
                      onDragStart={(e) => {
                        e.cancelBubble = true;
                        isDraggingObjectRef.current = true;
                        setDraggingObjectId(obj.id);
                        setDragPosition({ x: pos.x, y: pos.y, width: displayWidth, height: displayHeight });
                      }}
                      onDragEnd={(e) => handleObjectDragEnd(obj, e)}
                      onClick={(e) => {
                        // Reset ref if click without drag
                        isDraggingObjectRef.current = false;
                        // Select the object (opens details panel)
                        e.cancelBubble = true;
                        setSelectedObjectId(obj.id);
                      }}
                      onDragMove={(e) => {
                        e.cancelBubble = true;
                        // Constrain vertical movement to keep object within wall bounds
                        const node = e.target;
                        const wallBottom = visualization.wallY + visualization.wallHeight;
                        const minY = visualization.wallY; // Can't go above wall top
                        const maxY = wallBottom - displayHeight; // Can't go below floor

                        // Also constrain horizontal to wall bounds
                        const minX = visualization.wallX;
                        const maxX = visualization.wallX + visualization.wallWidth - displayWidth;

                        const constrainedY = Math.max(minY, Math.min(maxY, node.y()));
                        const constrainedX = Math.max(minX, Math.min(maxX, node.x()));

                        node.y(constrainedY);
                        node.x(constrainedX);

                        // Update drag position for smart dimensions
                        setDragPosition({ x: constrainedX, y: constrainedY, width: displayWidth, height: displayHeight });
                      }}
                      onMouseEnter={(e) => {
                        // Show hover tooltip and change cursor
                        const container = e.target.getStage()?.container();
                        if (container) container.style.cursor = 'pointer';
                        setHoveredObjectId(obj.id);
                        setHoverMousePosition({ x: e.evt.clientX, y: e.evt.clientY });
                      }}
                      onMouseLeave={(e) => {
                        // Hide hover tooltip and reset cursor
                        const container = e.target.getStage()?.container();
                        if (container) container.style.cursor = 'grab';
                        setHoveredObjectId(null);
                        setHoverMousePosition(null);
                      }}
                      onMouseMove={(e) => {
                        // Update tooltip position as mouse moves over object
                        if (hoveredObjectId === obj.id) {
                          setHoverMousePosition({ x: e.evt.clientX, y: e.evt.clientY });
                        }
                      }}
                    >
                      {/* Render text note, unified object with SVG symbol, or legacy colored rectangle */}
                      {obj.type === 'text' ? (
                        <>
                          <Rect
                            width={displayWidth}
                            height={displayHeight}
                            fill="#fef9c3"
                            stroke={isSelected ? '#22c55e' : isDragging ? '#3b82f6' : '#eab308'}
                            strokeWidth={isSelected || isDragging ? 2 : 1}
                            cornerRadius={4}
                            shadowBlur={4}
                            shadowOpacity={0.15}
                          />
                          <KonvaText
                            x={6}
                            y={6}
                            width={displayWidth - 12}
                            height={displayHeight - 12}
                            text={obj.text || t('elevation.noteEmpty', 'Dubbelklicka för att skriva…')}
                            fontSize={Math.min(12, displayHeight / 3)}
                            fill={obj.text ? '#713f12' : '#a16207'}
                            wrap="word"
                            ellipsis
                            listening={false}
                          />
                        </>
                      ) : obj.metadata?.isUnifiedObject && obj.metadata?.unifiedObjectId ? (() => {
                        const unifiedDef = getUnifiedObjectById(obj.metadata.unifiedObjectId as string);
                        if (unifiedDef) {
                          const symbol = unifiedDef.elevationSymbol;
                          const [, , vbWidth, vbHeight] = symbol.viewBox.split(' ').map(Number);
                          const scaleX = displayWidth / vbWidth;
                          const scaleY = displayHeight / vbHeight;

                          return (
                            <>
                              {/* Hit area for drag/selection - must be first and visible for events */}
                              <Rect
                                x={0}
                                y={0}
                                width={displayWidth}
                                height={displayHeight}
                                fill={isDragging ? 'rgba(191, 219, 254, 0.5)' : isSelected ? 'rgba(220, 252, 231, 0.5)' : 'rgba(249, 250, 251, 0.8)'}
                                stroke={isDragging ? '#3b82f6' : isSelected ? '#22c55e' : '#d1d5db'}
                                strokeWidth={isDragging ? 3 : isSelected ? 3 : 1}
                                cornerRadius={4}
                                shadowColor={isDragging ? '#000' : isSelected ? '#22c55e' : undefined}
                                shadowBlur={isDragging ? 10 : isSelected ? 8 : 0}
                                shadowOpacity={isDragging ? 0.3 : isSelected ? 0.4 : 0}
                              />
                              {/* SVG Symbol paths */}
                              {symbol.paths.map((path, index) => (
                                <Path
                                  key={index}
                                  data={path.d}
                                  fill={path.fill || 'none'}
                                  stroke={isSelected ? '#22c55e' : isDragging ? '#3b82f6' : (path.stroke || '#374151')}
                                  strokeWidth={(path.strokeWidth || 2) * Math.min(scaleX, scaleY)}
                                  scaleX={scaleX}
                                  scaleY={scaleY}
                                  listening={false}
                                  perfectDrawEnabled={false}
                                />
                              ))}
                              {/* Object name label */}
                              {displayWidth > 50 && displayHeight > 25 && (
                                <KonvaText
                                  x={4}
                                  y={displayHeight - 14}
                                  width={displayWidth - 8}
                                  text={objName}
                                  fontSize={9}
                                  fill={isDragging ? '#1e40af' : isSelected ? '#166534' : '#6b7280'}
                                  wrap="none"
                                  ellipsis={true}
                                  listening={false}
                                />
                              )}
                            </>
                          );
                        }
                        return null;
                      })() : (
                        <>
                          {/* Legacy object rectangle */}
                          <Rect
                            x={0}
                            y={0}
                            width={displayWidth}
                            height={displayHeight}
                            fill={isDragging ? '#bfdbfe' : isSelected ? '#dcfce7' : objColor}
                            stroke={isDragging ? '#3b82f6' : isSelected ? '#22c55e' : objStroke}
                            strokeWidth={isDragging ? 3 : isSelected ? 3 : 2}
                            cornerRadius={2}
                            shadowColor={isDragging ? '#000' : isSelected ? '#22c55e' : undefined}
                            shadowBlur={isDragging ? 10 : isSelected ? 8 : 0}
                            shadowOpacity={isDragging ? 0.3 : isSelected ? 0.4 : 0}
                          />

                          {/* Object label (only if large enough) */}
                          {displayWidth > 40 && displayHeight > 20 && (
                            <KonvaText
                              x={4}
                              y={4}
                              width={displayWidth - 8}
                              text={objName}
                              fontSize={Math.min(10, displayHeight / 3)}
                              fill={isDragging ? '#1e40af' : objStroke}
                              wrap="none"
                              ellipsis={true}
                            />
                          )}

                          {/* Drag handle indicator (four dots pattern) */}
                          {displayWidth > 30 && displayHeight > 30 && (
                            <Group x={displayWidth / 2 - 6} y={displayHeight / 2 - 6}>
                              <Rect x={0} y={0} width={3} height={3} fill={objStroke} cornerRadius={1} />
                              <Rect x={6} y={0} width={3} height={3} fill={objStroke} cornerRadius={1} />
                              <Rect x={0} y={6} width={3} height={3} fill={objStroke} cornerRadius={1} />
                              <Rect x={6} y={6} width={3} height={3} fill={objStroke} cornerRadius={1} />
                            </Group>
                          )}
                        </>
                      )}

                      {/* Elevation height indicator (small text below object) */}
                      {obj.wallRelative.elevationBottom > 0 && !isDragging && (
                        <KonvaText
                          x={0}
                          y={displayHeight + 3}
                          text={`↑${formatDim(obj.wallRelative.elevationBottom)}`}
                          fontSize={8}
                          fill="#6b7280"
                        />
                      )}

                      {/* Comment indicator - shows when object has comments */}
                      {hasComments && !isDragging && (
                        <Group
                          x={displayWidth - 8}
                          y={-8}
                          onClick={(e) => {
                            e.cancelBubble = true;
                            const stage = e.target.getStage();
                            if (stage) {
                              const containerRect = stage.container().getBoundingClientRect();
                              const pointer = stage.getPointerPosition();
                              if (pointer) {
                                handleOpenComments(obj.id, containerRect.left + pointer.x, containerRect.top + pointer.y);
                              }
                            }
                          }}
                          onMouseEnter={(e) => {
                            const container = e.target.getStage()?.container();
                            if (container) container.style.cursor = 'pointer';
                          }}
                          onMouseLeave={(e) => {
                            const container = e.target.getStage()?.container();
                            if (container) container.style.cursor = 'grab';
                          }}
                        >
                          {/* Comment bubble background - green if resolved, blue if active */}
                          <Rect
                            x={0}
                            y={0}
                            width={16}
                            height={16}
                            fill={isCommentResolved ? '#22c55e' : '#3b82f6'}
                            cornerRadius={8}
                            shadowColor="#000"
                            shadowBlur={3}
                            shadowOpacity={0.2}
                          />
                          {/* Comment count or check mark */}
                          <KonvaText
                            x={isCommentResolved ? 3 : (commentCount > 9 ? 2 : 5)}
                            y={isCommentResolved ? 2 : 3}
                            text={isCommentResolved ? '✓' : (commentCount > 9 ? '9+' : String(commentCount))}
                            fontSize={isCommentResolved ? 11 : 9}
                            fontStyle="bold"
                            fill="white"
                          />
                        </Group>
                      )}

                      {/* Install indicator - green check when an electrical fixture is marked installed */}
                      {isElectricalShape(obj) && obj.metadata?.installStatus === 'installed' && !isDragging && (
                        <Group x={-8} y={-8} listening={false}>
                          <Rect x={0} y={0} width={16} height={16} fill="#22c55e" cornerRadius={8} shadowColor="#000" shadowBlur={3} shadowOpacity={0.2} />
                          <KonvaText x={3} y={2} text="✓" fontSize={11} fontStyle="bold" fill="white" />
                        </Group>
                      )}
                    </Group>
                  );
                })}

                {/* Smart dimension lines during drag */}
                {draggingObjectId && dragPosition && visualization && (
                  <Group>
                    {/* Calculate dimensions in mm */}
                    {(() => {
                      const floorY = visualization.wallY + visualization.wallHeight;
                      const objBottom = dragPosition.y + dragPosition.height;

                      // Distance from floor in mm
                      const distanceFromFloorMM = (floorY - objBottom) / visualization.effectiveScale;

                      // Distance from left wall edge in mm
                      const distanceFromLeftMM = (dragPosition.x - visualization.wallX) / visualization.effectiveScale;

                      // Distance from right wall edge in mm
                      const distanceFromRightMM = ((visualization.wallX + visualization.wallWidth) - (dragPosition.x + dragPosition.width)) / visualization.effectiveScale;

                      const dimColor = '#3b82f6'; // Blue for dimensions
                      const dimTextColor = '#1e40af';

                      return (
                        <>
                          {/* Distance from floor - vertical line on the right side of object */}
                          {distanceFromFloorMM > 5 && (
                            <>
                              <Line
                                points={[
                                  dragPosition.x + dragPosition.width + 15,
                                  objBottom,
                                  dragPosition.x + dragPosition.width + 15,
                                  floorY,
                                ]}
                                stroke={dimColor}
                                strokeWidth={1.5}
                                dash={[4, 2]}
                              />
                              {/* End caps */}
                              <Line
                                points={[
                                  dragPosition.x + dragPosition.width + 10,
                                  objBottom,
                                  dragPosition.x + dragPosition.width + 20,
                                  objBottom,
                                ]}
                                stroke={dimColor}
                                strokeWidth={1.5}
                              />
                              <Line
                                points={[
                                  dragPosition.x + dragPosition.width + 10,
                                  floorY,
                                  dragPosition.x + dragPosition.width + 20,
                                  floorY,
                                ]}
                                stroke={dimColor}
                                strokeWidth={1.5}
                              />
                              {/* Dimension label with background */}
                              <Rect
                                x={dragPosition.x + dragPosition.width + 20}
                                y={(objBottom + floorY) / 2 - 10}
                                width={55}
                                height={20}
                                fill="white"
                                cornerRadius={3}
                                stroke={dimColor}
                                strokeWidth={1}
                              />
                              <KonvaText
                                x={dragPosition.x + dragPosition.width + 24}
                                y={(objBottom + floorY) / 2 - 5}
                                text={`↑ ${formatDim(distanceFromFloorMM)}`}
                                fontSize={11}
                                fontStyle="bold"
                                fill={dimTextColor}
                              />
                            </>
                          )}

                          {/* Distance from left wall edge - horizontal line above object */}
                          {distanceFromLeftMM > 5 && (
                            <>
                              <Line
                                points={[
                                  visualization.wallX,
                                  dragPosition.y - 20,
                                  dragPosition.x,
                                  dragPosition.y - 20,
                                ]}
                                stroke={dimColor}
                                strokeWidth={1.5}
                                dash={[4, 2]}
                              />
                              {/* End caps */}
                              <Line
                                points={[
                                  visualization.wallX,
                                  dragPosition.y - 25,
                                  visualization.wallX,
                                  dragPosition.y - 15,
                                ]}
                                stroke={dimColor}
                                strokeWidth={1.5}
                              />
                              <Line
                                points={[
                                  dragPosition.x,
                                  dragPosition.y - 25,
                                  dragPosition.x,
                                  dragPosition.y - 15,
                                ]}
                                stroke={dimColor}
                                strokeWidth={1.5}
                              />
                              {/* Dimension label */}
                              <Rect
                                x={(visualization.wallX + dragPosition.x) / 2 - 25}
                                y={dragPosition.y - 38}
                                width={50}
                                height={16}
                                fill="white"
                                cornerRadius={3}
                                stroke={dimColor}
                                strokeWidth={1}
                              />
                              <KonvaText
                                x={(visualization.wallX + dragPosition.x) / 2 - 20}
                                y={dragPosition.y - 35}
                                text={formatDim(distanceFromLeftMM)}
                                fontSize={10}
                                fontStyle="bold"
                                fill={dimTextColor}
                              />
                            </>
                          )}

                          {/* Distance from right wall edge - horizontal line below the left dimension */}
                          {distanceFromRightMM > 5 && (
                            <>
                              <Line
                                points={[
                                  dragPosition.x + dragPosition.width,
                                  dragPosition.y - 20,
                                  visualization.wallX + visualization.wallWidth,
                                  dragPosition.y - 20,
                                ]}
                                stroke="#10b981" // Green for right dimension
                                strokeWidth={1.5}
                                dash={[4, 2]}
                              />
                              {/* End caps */}
                              <Line
                                points={[
                                  dragPosition.x + dragPosition.width,
                                  dragPosition.y - 25,
                                  dragPosition.x + dragPosition.width,
                                  dragPosition.y - 15,
                                ]}
                                stroke="#10b981"
                                strokeWidth={1.5}
                              />
                              <Line
                                points={[
                                  visualization.wallX + visualization.wallWidth,
                                  dragPosition.y - 25,
                                  visualization.wallX + visualization.wallWidth,
                                  dragPosition.y - 15,
                                ]}
                                stroke="#10b981"
                                strokeWidth={1.5}
                              />
                              {/* Dimension label */}
                              <Rect
                                x={(dragPosition.x + dragPosition.width + visualization.wallX + visualization.wallWidth) / 2 - 25}
                                y={dragPosition.y - 38}
                                width={50}
                                height={16}
                                fill="white"
                                cornerRadius={3}
                                stroke="#10b981"
                                strokeWidth={1}
                              />
                              <KonvaText
                                x={(dragPosition.x + dragPosition.width + visualization.wallX + visualization.wallWidth) / 2 - 20}
                                y={dragPosition.y - 35}
                                text={formatDim(distanceFromRightMM)}
                                fontSize={10}
                                fontStyle="bold"
                                fill="#047857"
                              />
                            </>
                          )}
                        </>
                      );
                    })()}
                  </Group>
                )}

                {/* Segment label */}
                <KonvaText
                  x={visualization.wallX + visualization.wallWidth / 2 - 60}
                  y={visualization.wallY + visualization.wallHeight + 30}
                  text={`${currentSegment.label} · ${getDirectionIcon(currentSegment.direction)} ${t(`directions.${currentSegment.direction}`, currentSegment.direction).toUpperCase()}`}
                  fontSize={16}
                  fontStyle="bold"
                  fill={directionColors[currentSegment.direction]}
                />
              </>
            )}

            {/* Show message if this segment has no visualization */}
            {!visualization && currentSegment && (
              <KonvaText
                x={dimensions.width / 2 - 100}
                y={dimensions.height / 2}
                text={t('roomElevation.segmentTooSmall', 'Segment is too small to display')}
                fontSize={16}
                fill="#6b7280"
              />
            )}

            {/* Measurement line */}
            {measureStart && measureEnd && (() => {
              const x1 = measureStart.x;
              const y1 = measureStart.y;
              const x2 = measureEnd.x;
              const y2 = measureEnd.y;

              const dx = x2 - x1;
              const dy = y2 - y1;
              const distancePixels = Math.sqrt(dx * dx + dy * dy);

              // Convert to mm using the effective scale from visualization
              const distanceMm = visualization ? distancePixels / visualization.effectiveScale : distancePixels;

              const midX = (x1 + x2) / 2;
              const midY = (y1 + y2) / 2;

              if (distancePixels < 5) return null;

              // Scale-independent sizes
              const strokeWidth = 2 / zoom;
              const markerSize = 6 / zoom;
              const circleRadius = 4 / zoom;
              const labelWidth = 90 / zoom;
              const labelHeight = 24 / zoom;
              const fontSize = 14 / zoom;
              const dashSize = [8 / zoom, 4 / zoom];

              return (
                <Group listening={false}>
                  {/* Main measurement line */}
                  <Line
                    points={[x1, y1, x2, y2]}
                    stroke="#ef4444"
                    strokeWidth={strokeWidth}
                    dash={dashSize}
                  />
                  {/* Start point */}
                  <KonvaCircle x={x1} y={y1} radius={circleRadius} fill="#ef4444" />
                  {/* End point */}
                  <KonvaCircle x={x2} y={y2} radius={circleRadius} fill="#ef4444" />
                  {/* X markers at endpoints */}
                  <Line
                    points={[x1 - markerSize, y1 - markerSize, x1 + markerSize, y1 + markerSize]}
                    stroke="#ef4444"
                    strokeWidth={strokeWidth}
                  />
                  <Line
                    points={[x1 - markerSize, y1 + markerSize, x1 + markerSize, y1 - markerSize]}
                    stroke="#ef4444"
                    strokeWidth={strokeWidth}
                  />
                  <Line
                    points={[x2 - markerSize, y2 - markerSize, x2 + markerSize, y2 + markerSize]}
                    stroke="#ef4444"
                    strokeWidth={strokeWidth}
                  />
                  <Line
                    points={[x2 - markerSize, y2 + markerSize, x2 + markerSize, y2 - markerSize]}
                    stroke="#ef4444"
                    strokeWidth={strokeWidth}
                  />
                  {/* Distance label with background */}
                  <Rect
                    x={midX - labelWidth / 2}
                    y={midY - labelHeight - 4 / zoom}
                    width={labelWidth}
                    height={labelHeight}
                    fill="white"
                    stroke="#ef4444"
                    strokeWidth={strokeWidth / 2}
                    cornerRadius={4 / zoom}
                  />
                  <KonvaText
                    x={midX - labelWidth / 2 + 6 / zoom}
                    y={midY - labelHeight + 4 / zoom}
                    text={formatDim(distanceMm)}
                    fontSize={fontSize}
                    fill="#ef4444"
                    fontStyle="bold"
                  />
                </Group>
              );
            })()}
          </Layer>
        </Stage>

        {/* Right-click context menu */}
        {showContextMenu && (
          <div
            className="fixed bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-[300] min-w-[160px]"
            style={{ left: showContextMenu.x, top: showContextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
              onClick={() => handleOpenComments(showContextMenu.objectId, showContextMenu.x, showContextMenu.y)}
            >
              <MessageCircle className="h-4 w-4 text-blue-500" />
              {t('quickComment.addComment', 'Lägg till kommentar')}
            </button>
            <div className="border-t my-1" />
            <button
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2 text-gray-500"
              onClick={() => setShowContextMenu(null)}
            >
              <X className="h-4 w-4" />
              {t('common.cancel', 'Avbryt')}
            </button>
          </div>
        )}

        </div>

        {/* Object Details Panel (right side) */}
        {selectedObject && (
          <ElevationObjectPanel
            object={selectedObject}
            onClose={() => setSelectedObjectId(null)}
            onOpenComments={() => {
              // Position popover to the left of the panel (roughly)
              const x = window.innerWidth - 400; // Panel is on the right
              const y = 150;
              handleOpenComments(selectedObject.id, x, y);
            }}
            commentCount={commentCounts[selectedObject.id] || 0}
            isCommentResolved={resolvedStatus[selectedObject.id] || false}
          />
        )}
      </div>

      {/* Page indicator */}
      <div className="bg-white border-t py-3 flex justify-center gap-1">
        {segmentData.map((seg, index) => (
          <button
            key={seg.segmentIndex}
            onClick={() => goToSegment(index)}
            className={cn(
              "w-2.5 h-2.5 rounded-full transition-all",
              index === currentSegmentIndex
                ? "scale-125"
                : "bg-gray-300 hover:bg-gray-400"
            )}
            style={{
              backgroundColor: index === currentSegmentIndex ? directionColors[seg.direction] : undefined,
            }}
            title={`${seg.label} (${t(`directions.${seg.direction}`, seg.direction)})`}
          />
        ))}
      </div>

      {/* Inline Comments Popover */}
      {activeComment && (
        <InlineCommentPopover
          objectId={activeComment.objectId}
          projectId={projectId}
          position={activeComment.position}
          onClose={handleCloseComments}
          onCommentCountChange={(count) => handleCommentCountChange(activeComment.objectId, count)}
          onResolvedChange={(isResolved) => handleResolvedChange(activeComment.objectId, isResolved)}
          isResolved={resolvedStatus[activeComment.objectId] || false}
        />
      )}

      {/* Hover info tooltip - shows object type and dimensions */}
      <HoverInfoTooltip
        shape={hoveredObjectId ? segmentObjects.find(obj => obj.id === hoveredObjectId) || null : null}
        mousePosition={hoverMousePosition}
        unit="mm"
      />
    </div>
  );
};

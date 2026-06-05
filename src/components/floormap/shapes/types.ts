/**
 * Shared types for shape renderer components
 */

import Konva from 'konva';
import { KonvaEventObject } from 'konva/lib/Node';
import { FloorMapShape } from '../types';

/**
 * Base props for all shape components
 */
export interface ShapeComponentProps {
  shape: FloorMapShape;
  isSelected: boolean;
  onSelect: (evt?: KonvaEventObject<MouseEvent>) => void;
  onTransform: (updates: Partial<FloorMapShape>) => void;
  shapeRefsMap: Map<string, Konva.Node>;
}

/**
 * Extended props for shapes that need view/scale context
 */
export interface ShapeWithViewProps extends ShapeComponentProps {
  viewState: {
    zoom: number;
    panX: number;
    panY: number;
  };
  scaleSettings: {
    pixelsPerMm: number;
  };
  projectSettings: {
    snapEnabled: boolean;
    showDimensions: boolean;
    unit: 'mm' | 'cm' | 'm';
    gridInterval?: number;
  };
}

/**
 * Props for wall shape with optional transform state
 */
export interface WallShapeProps extends ShapeWithViewProps {
  transformState?: {
    scaleX: number;
    scaleY: number;
    rotation: number;
    x: number;
    y: number;
  };
  /**
   * Callback for batch transforming multiple selected walls to the same length.
   * Called when Shift is held during endpoint drag.
   * @param newLengthMM The new length in millimeters to apply to all selected walls
   */
  onBatchLengthChange?: (newLengthMM: number) => void;
  /**
   * Wall index (1-based) for display purposes
   */
  wallIndex?: number;
  /**
   * Total number of walls in the plan
   */
  totalWalls?: number;
}

/**
 * Props for room shape
 */
export interface RoomShapeProps extends ShapeWithViewProps {
  onDoubleClick?: () => void;
  snapSize: number;
  isReadOnly?: boolean;
  isHighlighted?: boolean;
  /**
   * When true, only render the vertex handles (no fill, stroke, or labels).
   * Used for rendering handles above walls in a separate layer.
   */
  renderHandlesOnly?: boolean;
  /**
   * Simplified (homeowner) mode. When true, the room outline is rendered as a
   * thick wall (Model A) — there are no separate wall objects.
   */
  simplified?: boolean;
  /**
   * Opening shapes (door/window/opening lines) on the same plan. In simplified
   * mode the room wall is rendered broken at these openings (render-time only).
   */
  openings?: FloorMapShape[];
  /**
   * E4 surface/paint filter. When true and the room carries a surface finish
   * (shape.surfaceTint / surfaceLabel), tint the room area and show the finish.
   */
  showSurfaces?: boolean;
}

/**
 * Props for text shape with edit support
 */
export interface TextShapeProps extends ShapeComponentProps {
  onEdit?: (shape: FloorMapShape) => void;
}

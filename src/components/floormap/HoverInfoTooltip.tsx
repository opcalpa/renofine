/**
 * HoverInfoTooltip - Shows quick dimension info when hovering over shapes
 *
 * Follows BIM/CAD industry standard: dimensions are shown on demand via hover
 * rather than cluttering the canvas with all measurements at once.
 */
import React from 'react';
import { FloorMapShape } from './types';
import { useTranslation } from 'react-i18next';
import { formatMeasurement } from './utils/formatting';
import { getPixelsPerMeter } from './canvas/utils/scale';
import { useMeasurement } from "@/contexts/MeasurementContext";

interface HoverInfoTooltipProps {
  shape: FloorMapShape | null;
  mousePosition: { x: number; y: number } | null;
  unit: 'mm' | 'cm' | 'm';
  /** Scale used to convert room polygon points (stored in pixels) to real area. */
  pixelsPerMm: number;
}

// Calculate dimensions for different shape types
function getShapeDimensions(shape: FloorMapShape, pixelsPerMm: number): {
  length?: number;
  width?: number;
  height?: number;
  area?: number;
  type: string;
} | null {
  const coords = shape.coordinates as any;

  switch (shape.type) {
    case 'wall':
    case 'line': {
      const dx = coords.x2 - coords.x1;
      const dy = coords.y2 - coords.y1;
      const length = Math.sqrt(dx * dx + dy * dy);
      return {
        length,
        height: shape.heightMM,
        type: shape.type === 'wall' ? 'wall' : 'line',
      };
    }

    case 'window_line':
    case 'door_line':
    case 'sliding_door_line': {
      const dx = coords.x2 - coords.x1;
      const dy = coords.y2 - coords.y1;
      const length = Math.sqrt(dx * dx + dy * dy);
      const typeMap: Record<string, string> = {
        window_line: 'window',
        door_line: 'door',
        sliding_door_line: 'slidingDoor',
      };
      return {
        length,
        height: shape.heightMM,
        type: typeMap[shape.type] || shape.type,
      };
    }

    case 'rectangle': {
      const width = coords.right - coords.left;
      const height = coords.bottom - coords.top;
      return {
        width,
        length: height,
        type: 'rectangle',
      };
    }

    case 'circle': {
      const radius = coords.radius;
      return {
        width: radius * 2,
        type: 'circle',
      };
    }

    case 'room': {
      // Calculate room area from polygon points. Points are stored in pixels, so
      // convert with the active scale (px/m)² — matches the canonical room-area calc
      // in utils/roomInsights.ts. (Dividing by 1e6 instead treated px as mm and gave
      // a wildly wrong value, e.g. 0.1 m² for a 12.1 m² room.)
      const points = coords.points as { x: number; y: number }[];
      if (points && points.length >= 3) {
        let area = 0;
        for (let i = 0; i < points.length; i++) {
          const j = (i + 1) % points.length;
          area += points[i].x * points[j].y;
          area -= points[j].x * points[i].y;
        }
        area = Math.abs(area) / 2;
        const pxPerMeter = getPixelsPerMeter(pixelsPerMm);
        const areaSqM = pxPerMeter > 0 ? area / (pxPerMeter ** 2) : 0;
        return {
          area: areaSqM,
          type: 'room',
        };
      }
      return null;
    }

    case 'symbol': {
      // Wall-attached objects (outlets, switches, etc.) use wallRelative
      if (shape.wallRelative) {
        return {
          width: shape.wallRelative.width,
          height: shape.wallRelative.height,
          length: shape.wallRelative.depth,
          type: coords.symbolType || shape.symbolType || 'object',
        };
      }
      // Library objects use dimensions3D
      if (shape.dimensions3D) {
        return {
          width: shape.dimensions3D.width,
          length: shape.dimensions3D.depth,
          height: shape.dimensions3D.height,
          type: coords.symbolType || 'object',
        };
      }
      // Fallback for symbols with basic size
      if (coords.size) {
        return {
          width: coords.size,
          length: coords.size,
          type: coords.symbolType || 'symbol',
        };
      }
      return null;
    }

    case 'freehand': {
      // Check for unified objects (new SVG-based library)
      if (shape.metadata?.isUnifiedObject && shape.metadata?.unifiedObjectId) {
        const objectId = shape.metadata.unifiedObjectId as string;
        return {
          width: shape.wallRelative?.width || shape.dimensions3D?.width,
          height: shape.wallRelative?.height || shape.dimensions3D?.height,
          length: shape.wallRelative?.depth || shape.dimensions3D?.depth,
          type: objectId,
        };
      }
      // Check for wall-relative objects
      if (shape.wallRelative) {
        return {
          width: shape.wallRelative.width,
          height: shape.wallRelative.height,
          length: shape.wallRelative.depth,
          type: shape.metadata?.objectId as string || shape.objectCategory || 'object',
        };
      }
      return null;
    }

    default:
      // Check for wallRelative objects of any type (elevation objects)
      if (shape.wallRelative) {
        return {
          width: shape.wallRelative.width,
          height: shape.wallRelative.height,
          length: shape.wallRelative.depth,
          type: shape.symbolType || coords?.symbolType || shape.type,
        };
      }
      return null;
  }
}

export function HoverInfoTooltip({ shape, mousePosition, unit, pixelsPerMm }: HoverInfoTooltipProps) {
  const { t } = useTranslation();
  const ms = useMeasurement();

  if (!shape || !mousePosition) return null;

  const dims = getShapeDimensions(shape, pixelsPerMm);
  if (!dims) return null;

  // Type labels for i18n
  const typeLabels: Record<string, string> = {
    wall: t('floormap.hoverInfo.wall', 'Wall'),
    line: t('floormap.hoverInfo.line', 'Line'),
    window: t('floormap.hoverInfo.window', 'Window'),
    door: t('floormap.hoverInfo.door', 'Door'),
    slidingDoor: t('floormap.hoverInfo.slidingDoor', 'Sliding Door'),
    rectangle: t('floormap.hoverInfo.rectangle', 'Rectangle'),
    circle: t('floormap.hoverInfo.circle', 'Circle'),
    room: t('floormap.hoverInfo.room', 'Room'),
    // Electrical objects
    single_outlet: t('floormap.hoverInfo.singleOutlet', 'Single Outlet'),
    double_outlet: t('floormap.hoverInfo.doubleOutlet', 'Double Outlet'),
    light_switch: t('floormap.hoverInfo.lightSwitch', 'Light Switch'),
    dimmer_switch: t('floormap.hoverInfo.dimmerSwitch', 'Dimmer Switch'),
    data_outlet: t('floormap.hoverInfo.dataOutlet', 'Data Outlet'),
    tv_outlet: t('floormap.hoverInfo.tvOutlet', 'TV Outlet'),
    usb_outlet: t('floormap.hoverInfo.usbOutlet', 'USB Outlet'),
    floor_outlet: t('floormap.hoverInfo.floorOutlet', 'Floor Outlet'),
    ceiling_outlet: t('floormap.hoverInfo.ceilingOutlet', 'Ceiling Outlet'),
    junction_box: t('floormap.hoverInfo.junctionBox', 'Junction Box'),
    // Kitchen objects
    base_cabinet: t('floormap.hoverInfo.base_cabinet', 'Base Cabinet'),
    wall_cabinet: t('floormap.hoverInfo.wall_cabinet', 'Wall Cabinet'),
    tall_cabinet: t('floormap.hoverInfo.tall_cabinet', 'Tall Cabinet'),
    refrigerator: t('floormap.hoverInfo.refrigerator', 'Refrigerator'),
    freezer: t('floormap.hoverInfo.freezer', 'Freezer'),
    dishwasher: t('floormap.hoverInfo.dishwasher', 'Dishwasher'),
    oven: t('floormap.hoverInfo.oven', 'Oven'),
    cooktop: t('floormap.hoverInfo.cooktop', 'Cooktop'),
    range_hood: t('floormap.hoverInfo.range_hood', 'Range Hood'),
    kitchen_sink: t('floormap.hoverInfo.kitchen_sink', 'Kitchen Sink'),
  };

  const typeLabel = typeLabels[dims.type] || dims.type;

  return (
    <div
      className="fixed z-50 pointer-events-none"
      style={{
        left: mousePosition.x + 16,
        top: mousePosition.y + 16,
      }}
    >
      <div className="bg-background/95 backdrop-blur-sm border border-border rounded-lg shadow-lg px-3 py-2 text-sm">
        <div className="font-medium text-foreground mb-1">{typeLabel}</div>
        <div className="space-y-0.5 text-muted-foreground text-xs">
          {dims.length !== undefined && (
            <div className="flex justify-between gap-4">
              <span>{t('floormap.hoverInfo.length', 'L')}:</span>
              <span className="font-mono">{formatMeasurement(dims.length, unit)}</span>
            </div>
          )}
          {dims.width !== undefined && (
            <div className="flex justify-between gap-4">
              <span>{t('floormap.hoverInfo.width', 'W')}:</span>
              <span className="font-mono">{formatMeasurement(dims.width, unit)}</span>
            </div>
          )}
          {dims.height !== undefined && (
            <div className="flex justify-between gap-4">
              <span>{t('floormap.hoverInfo.height', 'H')}:</span>
              <span className="font-mono">{formatMeasurement(dims.height, unit)}</span>
            </div>
          )}
          {dims.area !== undefined && (
            <div className="flex justify-between gap-4">
              <span>{t('floormap.hoverInfo.area', 'Area')}:</span>
              <span className="font-mono">{ms.fmtArea(dims.area * 1_000_000)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

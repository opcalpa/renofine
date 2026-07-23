/**
 * Read-mostly rendering of non-wall shapes in the v2 editor (phase 1).
 *
 * Rooms, basic shapes, lines, text, images and library objects render as
 * clean simplified marks so an existing plan is fully visible while the new
 * tool system matures. Interactive editing of these types migrates in later
 * phases; selection and rigid move already work via the shape `name` id.
 */

import React from 'react';
import { Line, Rect, Circle, Text, Image as KonvaImage, Group } from 'react-konva';
import useImage from 'use-image';
import {
  FloorMapShape,
  LineCoordinates,
  RectangleCoordinates,
  CircleCoordinates,
  PolygonCoordinates,
  SymbolCoordinates,
  TextCoordinates,
} from '../../types';

interface LegacyShapesLayerProps {
  shapes: FloorMapShape[];
  planId: string | null;
  selectedIds: string[];
  zoom: number;
}

const SELECT_COLOR = '#2563eb';

const BackgroundImage: React.FC<{ shape: FloorMapShape; isSelected: boolean; zoom: number }> = ({
  shape,
  isSelected,
  zoom,
}) => {
  const [image] = useImage(shape.imageUrl ?? '', 'anonymous');
  const c = shape.coordinates as SymbolCoordinates;
  if (!image) return null;
  // Uploads create the shape with width/height 0 — fall back to natural size
  // (capped) exactly like the legacy ImageShape did.
  let width = c.width;
  let height = c.height;
  if (!width || width < 10 || !height || height < 10) {
    const scale = Math.min(1, 800 / Math.max(image.width, image.height));
    width = image.width * scale;
    height = image.height * scale;
  }
  return (
    <Group name={shape.id} x={c.x} y={c.y} listening={!shape.locked}>
      <KonvaImage
        name={shape.id}
        image={image}
        width={width}
        height={height}
        opacity={shape.imageOpacity ?? 0.5}
        perfectDrawEnabled={false}
      />
      {(isSelected || shape.locked) && (
        <Rect
          width={width}
          height={height}
          stroke={shape.locked ? '#9ca3af' : '#2563eb'}
          strokeWidth={1.5 / zoom}
          dash={shape.locked ? [6 / zoom, 4 / zoom] : undefined}
          listening={false}
          perfectDrawEnabled={false}
        />
      )}
    </Group>
  );
};

function renderShape(shape: FloorMapShape, isSelected: boolean, zoom: number): React.ReactNode {
  const stroke = isSelected ? SELECT_COLOR : shape.strokeColor || '#374151';
  const strokeWidth = Math.max(0.75, (shape.strokeWidth ?? 1.5) / zoom);

  switch (shape.type) {
    case 'room': {
      const c = shape.coordinates as PolygonCoordinates;
      if (!c?.points?.length) return null;
      const flat = c.points.flatMap((p) => [p.x, p.y]);
      const cx = c.points.reduce((sum, p) => sum + p.x, 0) / c.points.length;
      const cy = c.points.reduce((sum, p) => sum + p.y, 0) / c.points.length;
      return (
        <Group key={shape.id}>
          <Line
            name={shape.id}
            points={flat}
            closed
            fill={shape.surfaceTint || shape.color || 'rgba(96, 165, 250, 0.10)'}
            stroke={isSelected ? SELECT_COLOR : shape.strokeColor || '#93c5fd'}
            strokeWidth={strokeWidth}
            perfectDrawEnabled={false}
          />
          {shape.name && (
            <Text
              x={cx}
              y={cy}
              text={shape.area ? `${shape.name}\n${shape.area.toFixed(1)} m²` : shape.name}
              fontSize={13 / zoom}
              fill="#1f2937"
              align="center"
              offsetX={(shape.name.length * 3.5) / zoom}
              listening={false}
              perfectDrawEnabled={false}
            />
          )}
        </Group>
      );
    }
    case 'line':
    case 'measurement':
    case 'window_line':
    case 'door_line':
    case 'sliding_door_line': {
      const c = shape.coordinates as LineCoordinates;
      if (c?.x1 === undefined) return null;
      return (
        <Line
          key={shape.id}
          name={shape.id}
          points={[c.x1, c.y1, c.x2, c.y2]}
          stroke={shape.type === 'window_line' ? '#0ea5e9' : stroke}
          strokeWidth={shape.type === 'line' ? strokeWidth : strokeWidth * 2}
          hitStrokeWidth={12 / zoom}
          perfectDrawEnabled={false}
        />
      );
    }
    case 'rectangle':
    case 'triangle': {
      const c = shape.coordinates as RectangleCoordinates;
      if (c?.left === undefined) return null;
      return (
        <Rect
          key={shape.id}
          name={shape.id}
          x={c.left}
          y={c.top}
          width={c.width}
          height={c.height}
          rotation={shape.rotation ?? 0}
          fill={shape.color || 'transparent'}
          stroke={stroke}
          strokeWidth={strokeWidth}
          perfectDrawEnabled={false}
        />
      );
    }
    case 'circle': {
      const c = shape.coordinates as CircleCoordinates;
      if (c?.cx === undefined) return null;
      return (
        <Circle
          key={shape.id}
          name={shape.id}
          x={c.cx}
          y={c.cy}
          radius={c.radius}
          fill={shape.color || 'transparent'}
          stroke={stroke}
          strokeWidth={strokeWidth}
          perfectDrawEnabled={false}
        />
      );
    }
    case 'freehand':
    case 'polygon': {
      const c = shape.coordinates as PolygonCoordinates;
      if (!c?.points?.length) return null;
      return (
        <Line
          key={shape.id}
          name={shape.id}
          points={c.points.flatMap((p) => [p.x, p.y])}
          closed={shape.type === 'polygon'}
          stroke={stroke}
          strokeWidth={strokeWidth}
          hitStrokeWidth={12 / zoom}
          fill={shape.type === 'polygon' ? shape.color || 'transparent' : undefined}
          perfectDrawEnabled={false}
        />
      );
    }
    case 'text':
    case 'sticky_note': {
      const c = shape.coordinates as TextCoordinates;
      if (c?.x === undefined) return null;
      return (
        <Group key={shape.id} name={shape.id} x={c.x} y={c.y}>
          {shape.type === 'sticky_note' && (
            <Rect
              width={c.width ?? 160}
              height={c.height ?? 100}
              fill={shape.color || '#fef08a'}
              cornerRadius={4 / zoom}
              shadowBlur={4 / zoom}
              shadowOpacity={0.2}
              perfectDrawEnabled={false}
            />
          )}
          <Text
            x={shape.type === 'sticky_note' ? 8 : 0}
            y={shape.type === 'sticky_note' ? 8 : 0}
            width={c.width ? c.width - (shape.type === 'sticky_note' ? 16 : 0) : undefined}
            text={shape.text ?? ''}
            fontSize={shape.fontSize ?? 16}
            fill={shape.type === 'sticky_note' ? '#422006' : shape.color || '#111827'}
            rotation={shape.textRotation ?? 0}
            perfectDrawEnabled={false}
          />
          {isSelected && (
            <Rect
              width={c.width ?? 160}
              height={c.height ?? (shape.type === 'sticky_note' ? 100 : 24)}
              stroke={SELECT_COLOR}
              strokeWidth={1.5 / zoom}
              perfectDrawEnabled={false}
            />
          )}
        </Group>
      );
    }
    case 'symbol':
    case 'door':
    case 'opening': {
      const c = shape.coordinates as SymbolCoordinates;
      if (c?.x === undefined) return null;
      return (
        <Group key={shape.id} name={shape.id} x={c.x} y={c.y} rotation={shape.rotation ?? 0}>
          <Rect
            width={c.width}
            height={c.height}
            fill="rgba(255,255,255,0.7)"
            stroke={isSelected ? SELECT_COLOR : '#6b7280'}
            strokeWidth={1.25 / zoom}
            cornerRadius={2 / zoom}
            perfectDrawEnabled={false}
          />
          <Text
            x={2 / zoom}
            y={2 / zoom}
            width={c.width - 4 / zoom}
            text={String(shape.symbolType ?? shape.metadata?.unifiedObjectId ?? '')}
            fontSize={9 / zoom}
            fill="#4b5563"
            listening={false}
            perfectDrawEnabled={false}
          />
        </Group>
      );
    }
    default:
      return null;
  }
}

export const LegacyShapesLayer: React.FC<LegacyShapesLayerProps> = ({
  shapes,
  planId,
  selectedIds,
  zoom,
}) => {
  const selected = new Set(selectedIds);
  const visible = shapes
    .filter((s) => s.type !== 'wall')
    // Library objects render properly in ObjectsLayer
    .filter((s) => !s.metadata?.isUnifiedObject)
    .filter((s) => !planId || s.planId === planId || !s.planId)
    .filter((s) => s.shapeViewMode !== 'elevation')
    .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

  return (
    <>
      {visible.map((shape) =>
        shape.type === 'image' ? (
          <BackgroundImage
            key={shape.id}
            shape={shape}
            isSelected={selected.has(shape.id)}
            zoom={zoom}
          />
        ) : (
          renderShape(shape, selected.has(shape.id), zoom)
        )
      )}
    </>
  );
};

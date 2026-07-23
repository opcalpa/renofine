/**
 * Dimension chain for the selected wall (industry convention: Floorplanner/
 * RoomSketcher show running dimensions when a wall is selected).
 *
 * Two rows offset to the side of the wall facing AWAY from its room:
 *  - inner row: segment chain corner → opening edges → corner
 *  - outer row: total wall length
 * Pure rendering (listening=false); updates live while walls/openings move.
 */

import React from 'react';
import { Group, Line, Text } from 'react-konva';
import { FloorMapShape, PolygonCoordinates } from '../../types';
import { wallFrame, openingPlacement, Point } from '../geometry/openingGeometry';
import { formatWorldAsMm } from '../core/units';
import { pointInPolygon } from '../../utils/roomItemLink';

interface DimensionChainLayerProps {
  shapes: FloorMapShape[];
  planId: string | null;
  selectedIds: string[];
  zoom: number;
}

const CHAIN_COLOR = '#2563eb';

/** +1 or −1: which side of the wall normal points away from the wall's room. */
function outwardSign(
  frame: { a: Point; b: Point; n: Point },
  mid: Point,
  shapes: FloorMapShape[],
  planId: string | null
): number {
  const rooms = shapes.filter(
    (s) =>
      s.type === 'room' &&
      (!planId || s.planId === planId || !s.planId) &&
      Array.isArray((s.coordinates as PolygonCoordinates)?.points)
  );
  for (const dist of [12, 30]) {
    for (const side of [1, -1]) {
      const probe = { x: mid.x + frame.n.x * dist * side, y: mid.y + frame.n.y * dist * side };
      if (rooms.some((r) => pointInPolygon(probe, (r.coordinates as PolygonCoordinates).points))) {
        return -side; // room found on this side → chain goes on the other
      }
    }
  }
  return 1;
}

/** One dimension row: extension ticks at each point, lines + labels between. */
const DimensionRow: React.FC<{
  points: Point[];
  offset: Point;
  tickHalf: Point;
  fontSize: number;
  labelLift: Point;
}> = ({ points, offset, tickHalf, fontSize, labelLift }) => (
  <>
    {points.map((p, i) => (
      <Line
        key={`tick-${i}`}
        points={[
          p.x + offset.x - tickHalf.x,
          p.y + offset.y - tickHalf.y,
          p.x + offset.x + tickHalf.x,
          p.y + offset.y + tickHalf.y,
        ]}
        stroke={CHAIN_COLOR}
        strokeWidth={fontSize / 9}
        perfectDrawEnabled={false}
      />
    ))}
    {points.slice(0, -1).map((p, i) => {
      const q = points[i + 1];
      const length = Math.hypot(q.x - p.x, q.y - p.y);
      if (length < 1) return null;
      const midX = (p.x + q.x) / 2 + offset.x + labelLift.x;
      const midY = (p.y + q.y) / 2 + offset.y + labelLift.y;
      const label = formatWorldAsMm(length);
      return (
        <React.Fragment key={`seg-${i}`}>
          <Line
            points={[p.x + offset.x, p.y + offset.y, q.x + offset.x, q.y + offset.y]}
            stroke={CHAIN_COLOR}
            strokeWidth={fontSize / 9}
            perfectDrawEnabled={false}
          />
          <Text
            x={midX - label.length * fontSize * 0.28}
            y={midY - fontSize / 2}
            text={label}
            fontSize={fontSize}
            fill={CHAIN_COLOR}
            perfectDrawEnabled={false}
          />
        </React.Fragment>
      );
    })}
  </>
);

export const DimensionChainLayer: React.FC<DimensionChainLayerProps> = ({
  shapes,
  planId,
  selectedIds,
  zoom,
}) => {
  if (selectedIds.length !== 1) return null;
  const wall = shapes.find((s) => s.id === selectedIds[0] && s.type === 'wall');
  if (!wall) return null;
  const frame = wallFrame(wall);
  if (!frame) return null;

  const openings = shapes
    .filter((s) => s.type === 'opening' && s.parentWallId === wall.id)
    .map((o) => openingPlacement(o, wall))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .sort(
      (a, b) =>
        (a.center.x - frame.a.x) * frame.u.x + (a.center.y - frame.a.y) * frame.u.y -
        ((b.center.x - frame.a.x) * frame.u.x + (b.center.y - frame.a.y) * frame.u.y)
    );

  const mid = { x: (frame.a.x + frame.b.x) / 2, y: (frame.a.y + frame.b.y) / 2 };
  const sign = outwardSign(frame, mid, shapes, planId);
  const px = (n: number) => n / zoom;

  const rowOffset = (dist: number): Point => ({
    x: frame.n.x * sign * (frame.halfThickness + px(dist)),
    y: frame.n.y * sign * (frame.halfThickness + px(dist)),
  });
  const tickHalf: Point = { x: frame.n.x * px(4), y: frame.n.y * px(4) };
  const labelLift: Point = { x: frame.n.x * sign * px(10), y: frame.n.y * sign * px(10) };

  const chainPoints: Point[] = [
    frame.a,
    ...openings.flatMap((p) => [p.edgeStart, p.edgeEnd]),
    frame.b,
  ];

  return (
    <Group listening={false}>
      {/* Segment chain (only meaningful when the wall has openings) */}
      {openings.length > 0 && (
        <DimensionRow
          points={chainPoints}
          offset={rowOffset(16)}
          tickHalf={tickHalf}
          fontSize={px(10)}
          labelLift={labelLift}
        />
      )}
      {/* Total length row */}
      <DimensionRow
        points={[frame.a, frame.b]}
        offset={rowOffset(openings.length > 0 ? 38 : 16)}
        tickHalf={tickHalf}
        fontSize={px(10)}
        labelLift={labelLift}
      />
    </Group>
  );
};

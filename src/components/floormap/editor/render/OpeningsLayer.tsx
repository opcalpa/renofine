/**
 * Wall-hosted opening rendering: a filled quad "cuts" the wall graphic, then
 * the classic architectural symbol is drawn on top — door leaf + quarter-arc
 * swing, window double line, sliding door offset leaves, passage dashes.
 * All geometry derives from the host wall, so openings follow wall edits.
 */

import React from 'react';
import { Line, Arc, Group } from 'react-konva';
import { FloorMapShape } from '../../types';
import { openingPlacement } from '../geometry/openingGeometry';

interface OpeningsLayerProps {
  shapes: FloorMapShape[];
  planId: string | null;
  selectedIds: string[];
  zoom: number;
}

const SELECT_COLOR = '#2563eb';
const SYMBOL_COLOR = '#374151';

export const OpeningsLayer: React.FC<OpeningsLayerProps> = ({
  shapes,
  planId,
  selectedIds,
  zoom,
}) => {
  const selected = new Set(selectedIds);
  const wallsById = new Map(shapes.filter((s) => s.type === 'wall').map((s) => [s.id, s]));
  const openings = shapes.filter(
    (s) =>
      s.type === 'opening' &&
      s.parentWallId &&
      (s.planId === planId || !s.planId) &&
      wallsById.has(s.parentWallId)
  );

  return (
    <>
      {openings.map((opening) => {
        const wall = wallsById.get(opening.parentWallId!)!;
        const placement = openingPlacement(opening, wall);
        if (!placement) return null;
        const { rect, edgeStart, edgeEnd, widthWorld, frame } = placement;
        const isSelected = selected.has(opening.id);
        const stroke = isSelected ? SELECT_COLOR : SYMBOL_COLOR;
        const strokeWidth = Math.max(0.75, 1.25 / zoom);
        const flip = opening.openingDirection === 'right' ? -1 : 1;
        const kind = opening.openingKind ?? 'door';

        // Hinge at edgeStart (or edgeEnd when flipped); leaf swings across the wall.
        const hinge = flip === 1 ? edgeStart : edgeEnd;
        const leafDir = flip === 1 ? frame.u : { x: -frame.u.x, y: -frame.u.y };
        const swingNormal = frame.n;
        const leafEnd = {
          x: hinge.x + swingNormal.x * widthWorld * flip,
          y: hinge.y + swingNormal.y * widthWorld * flip,
        };
        const hingeAngleDeg = (Math.atan2(leafDir.y, leafDir.x) * 180) / Math.PI;

        return (
          <Group key={opening.id}>
            {/* Graphic cut through the wall */}
            <Line
              name={opening.id}
              points={rect.flatMap((p) => [p.x, p.y])}
              closed
              fill="#ffffff"
              perfectDrawEnabled={false}
            />
            {/* Jamb lines at both edges */}
            {[placement.edgeStart, placement.edgeEnd].map((edge, i) => (
              <Line
                key={i}
                points={[
                  edge.x + frame.n.x * frame.halfThickness,
                  edge.y + frame.n.y * frame.halfThickness,
                  edge.x - frame.n.x * frame.halfThickness,
                  edge.y - frame.n.y * frame.halfThickness,
                ]}
                stroke={stroke}
                strokeWidth={strokeWidth}
                listening={false}
                perfectDrawEnabled={false}
              />
            ))}

            {kind === 'door' && (
              <>
                <Line
                  name={opening.id}
                  points={[hinge.x, hinge.y, leafEnd.x, leafEnd.y]}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  hitStrokeWidth={10 / zoom}
                  perfectDrawEnabled={false}
                />
                <Arc
                  x={hinge.x}
                  y={hinge.y}
                  innerRadius={widthWorld}
                  outerRadius={widthWorld}
                  angle={90}
                  rotation={flip === 1 ? hingeAngleDeg : hingeAngleDeg - 90}
                  stroke={stroke}
                  strokeWidth={strokeWidth * 0.75}
                  dash={[4 / zoom, 3 / zoom]}
                  listening={false}
                  perfectDrawEnabled={false}
                />
              </>
            )}

            {kind === 'window' && (
              <>
                {[-0.5, 0, 0.5].map((offset) => (
                  <Line
                    key={offset}
                    name={opening.id}
                    points={[
                      edgeStart.x + frame.n.x * frame.halfThickness * offset,
                      edgeStart.y + frame.n.y * frame.halfThickness * offset,
                      edgeEnd.x + frame.n.x * frame.halfThickness * offset,
                      edgeEnd.y + frame.n.y * frame.halfThickness * offset,
                    ]}
                    stroke={offset === 0 ? stroke : SYMBOL_COLOR}
                    strokeWidth={offset === 0 ? strokeWidth : strokeWidth * 0.75}
                    hitStrokeWidth={10 / zoom}
                    perfectDrawEnabled={false}
                  />
                ))}
              </>
            )}

            {kind === 'sliding' && (
              <>
                {/* Two offset leaves overlapping at the middle */}
                <Line
                  name={opening.id}
                  points={[
                    edgeStart.x + frame.n.x * frame.halfThickness * 0.5,
                    edgeStart.y + frame.n.y * frame.halfThickness * 0.5,
                    placement.center.x + frame.u.x * widthWorld * 0.1 + frame.n.x * frame.halfThickness * 0.5,
                    placement.center.y + frame.u.y * widthWorld * 0.1 + frame.n.y * frame.halfThickness * 0.5,
                  ]}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  hitStrokeWidth={10 / zoom}
                  perfectDrawEnabled={false}
                />
                <Line
                  name={opening.id}
                  points={[
                    placement.center.x - frame.u.x * widthWorld * 0.1 - frame.n.x * frame.halfThickness * 0.5,
                    placement.center.y - frame.u.y * widthWorld * 0.1 - frame.n.y * frame.halfThickness * 0.5,
                    edgeEnd.x - frame.n.x * frame.halfThickness * 0.5,
                    edgeEnd.y - frame.n.y * frame.halfThickness * 0.5,
                  ]}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  hitStrokeWidth={10 / zoom}
                  perfectDrawEnabled={false}
                />
              </>
            )}

            {kind === 'passage' && (
              <Line
                name={opening.id}
                points={[edgeStart.x, edgeStart.y, edgeEnd.x, edgeEnd.y]}
                stroke={stroke}
                strokeWidth={strokeWidth * 0.75}
                dash={[6 / zoom, 5 / zoom]}
                hitStrokeWidth={10 / zoom}
                perfectDrawEnabled={false}
              />
            )}
          </Group>
        );
      })}
    </>
  );
};

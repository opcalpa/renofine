/**
 * Mitered wall rendering for the v2 editor.
 *
 * Each wall renders as its outline quad from the wall graph (clean corner and
 * T-junction joins) with a centerline dimension label. Selected walls get a
 * highlight plus endpoint handles (dragged via junction.move upstream).
 */

import React from 'react';
import { Line, Circle, Text } from 'react-konva';
import { FloorMapShape, LineCoordinates } from '../../types';
import { getWallGraph } from '../geometry/wallGraph';
import { formatWorldAsMm } from '../core/units';

interface WallsLayerProps {
  shapes: FloorMapShape[];
  planId: string | null;
  selectedIds: string[];
  zoom: number;
  showDimensions: boolean;
}

export const WallsLayer: React.FC<WallsLayerProps> = ({
  shapes,
  planId,
  selectedIds,
  zoom,
  showDimensions,
}) => {
  const graph = getWallGraph(shapes, planId);
  const selected = new Set(selectedIds);
  const wallById = new Map(
    shapes.filter((s) => s.type === 'wall').map((s) => [s.id, s])
  );

  return (
    <>
      {graph.outlines.map((outline) => {
        const wall = wallById.get(outline.wallId);
        if (!wall) return null;
        const isSelected = selected.has(outline.wallId);
        const flat = outline.points.flatMap((p) => [p.x, p.y]);
        return (
          <Line
            key={outline.wallId}
            name={outline.wallId}
            points={flat}
            closed
            fill={isSelected ? '#bfdbfe' : '#4b5563'}
            stroke={isSelected ? '#2563eb' : '#1f2937'}
            strokeWidth={Math.max(0.75, 1 / zoom)}
            perfectDrawEnabled={false}
          />
        );
      })}

      {/* Junction handles for selected walls */}
      {graph.junctions
        .filter((j) => j.ends.some((e) => selected.has(e.wallId)))
        .map((j) => (
          <Circle
            key={j.id}
            name={`junction:${j.at.x.toFixed(2)}:${j.at.y.toFixed(2)}`}
            x={j.at.x}
            y={j.at.y}
            radius={6 / zoom}
            fill="#ffffff"
            stroke="#2563eb"
            strokeWidth={2 / zoom}
            perfectDrawEnabled={false}
          />
        ))}

      {/* Dimension labels on wall centerlines */}
      {showDimensions &&
        graph.outlines.map((outline) => {
          const wall = wallById.get(outline.wallId);
          if (!wall) return null;
          const c = wall.coordinates as LineCoordinates;
          const length = Math.hypot(c.x2 - c.x1, c.y2 - c.y1);
          if (length * zoom < 40) return null; // too small to label
          const midX = (c.x1 + c.x2) / 2;
          const midY = (c.y1 + c.y2) / 2;
          let angle = (Math.atan2(c.y2 - c.y1, c.x2 - c.x1) * 180) / Math.PI;
          if (angle > 90 || angle < -90) angle += 180; // keep text upright
          return (
            <Text
              key={`dim-${outline.wallId}`}
              x={midX}
              y={midY}
              offsetY={14 / zoom}
              text={formatWorldAsMm(length)}
              fontSize={11 / zoom}
              fill="#374151"
              rotation={angle}
              listening={false}
              perfectDrawEnabled={false}
            />
          );
        })}
    </>
  );
};

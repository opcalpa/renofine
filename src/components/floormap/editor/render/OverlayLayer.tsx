/**
 * Overlay rendering — pure function of the editor ui store.
 *
 * Draft wall polyline with live mm label (and typed dimension input), snap
 * glyphs, alignment guides with distance badges, and the marquee box.
 * Everything here is non-interactive (listening=false on the parent layer).
 */

import React from 'react';
import { Line, Circle, Rect, Text, Group } from 'react-konva';
import { useEditorUiStore, Measurement } from '../state/uiStore';
import { formatWorldAsMm } from '../core/units';

/** A finished measure-tool distance: line, end ticks, centered mm badge. */
const MeasurementMark: React.FC<{ m: Measurement; px: (n: number) => number }> = ({ m, px }) => {
  const dx = m.to.x - m.from.x;
  const dy = m.to.y - m.from.y;
  const length = Math.hypot(dx, dy) || 1;
  const tick = px(6);
  const nx = (-dy / length) * tick;
  const ny = (dx / length) * tick;
  const midX = (m.from.x + m.to.x) / 2;
  const midY = (m.from.y + m.to.y) / 2;
  const label = formatWorldAsMm(length);
  const labelWidth = px(label.length * 6.5 + 12);
  return (
    <Group listening={false}>
      <Line
        points={[m.from.x, m.from.y, m.to.x, m.to.y]}
        stroke="#dc2626"
        strokeWidth={px(1.5)}
        perfectDrawEnabled={false}
      />
      {[m.from, m.to].map((p, i) => (
        <Line
          key={i}
          points={[p.x - nx, p.y - ny, p.x + nx, p.y + ny]}
          stroke="#dc2626"
          strokeWidth={px(1.5)}
          perfectDrawEnabled={false}
        />
      ))}
      <Rect
        x={midX - labelWidth / 2}
        y={midY - px(22)}
        width={labelWidth}
        height={px(16)}
        fill="#dc2626"
        cornerRadius={px(3)}
        perfectDrawEnabled={false}
      />
      <Text
        x={midX - labelWidth / 2}
        y={midY - px(18.5)}
        width={labelWidth}
        align="center"
        text={label}
        fontSize={px(10)}
        fill="#ffffff"
        perfectDrawEnabled={false}
      />
    </Group>
  );
};

interface OverlayLayerProps {
  zoom: number;
}

const GLYPH_COLORS: Record<string, string> = {
  endpoint: '#dc2626',
  midpoint: '#ea580c',
  alignment: '#db2777',
  grid: '#9ca3af',
  ortho: '#2563eb',
};

export const OverlayLayer: React.FC<OverlayLayerProps> = ({ zoom }) => {
  const draftPoints = useEditorUiStore((s) => s.draftPoints);
  const draftCursor = useEditorUiStore((s) => s.draftCursor);
  const draftLabel = useEditorUiStore((s) => s.draftLabel);
  const dimensionInput = useEditorUiStore((s) => s.dimensionInput);
  const snapGlyphs = useEditorUiStore((s) => s.snapGlyphs);
  const snapGuides = useEditorUiStore((s) => s.snapGuides);
  const marquee = useEditorUiStore((s) => s.marquee);
  const openingGhost = useEditorUiStore((s) => s.openingGhost);
  const measurements = useEditorUiStore((s) => s.measurements);

  const px = (n: number) => n / zoom;

  const committedFlat = draftPoints.flatMap((p) => [p.x, p.y]);
  const anchor = draftPoints[draftPoints.length - 1];
  const label = dimensionInput ? `${dimensionInput} mm ⏎` : draftLabel;

  return (
    <>
      {/* Laid-down measurements */}
      {measurements.map((m, i) => (
        <MeasurementMark key={i} m={m} px={px} />
      ))}

      {/* Committed draft polyline */}
      {draftPoints.length >= 2 && (
        <Line
          points={committedFlat}
          stroke="#2563eb"
          strokeWidth={px(2)}
          dash={[px(6), px(4)]}
          perfectDrawEnabled={false}
        />
      )}

      {/* Rubber-band segment */}
      {anchor && draftCursor && (
        <Line
          points={[anchor.x, anchor.y, draftCursor.x, draftCursor.y]}
          stroke="#2563eb"
          strokeWidth={px(2)}
          dash={[px(6), px(4)]}
          perfectDrawEnabled={false}
        />
      )}

      {/* Draft vertices */}
      {draftPoints.map((p, i) => (
        <Circle
          key={i}
          x={p.x}
          y={p.y}
          radius={px(4)}
          fill="#ffffff"
          stroke="#2563eb"
          strokeWidth={px(1.5)}
          perfectDrawEnabled={false}
        />
      ))}

      {/* Live length / typed dimension label at the cursor */}
      {draftCursor && label && (
        <Group x={draftCursor.x} y={draftCursor.y} listening={false}>
          <Rect
            x={px(12)}
            y={px(-28)}
            width={px(label.length * 7.5 + 16)}
            height={px(20)}
            fill={dimensionInput ? '#1d4ed8' : '#111827'}
            cornerRadius={px(4)}
            opacity={0.9}
            perfectDrawEnabled={false}
          />
          <Text
            x={px(20)}
            y={px(-23)}
            text={label}
            fontSize={px(11)}
            fill="#ffffff"
            perfectDrawEnabled={false}
          />
        </Group>
      )}

      {/* Alignment guides with distance badges */}
      {snapGuides.map((g, i) => (
        <React.Fragment key={i}>
          <Line
            points={[g.from.x, g.from.y, g.to.x, g.to.y]}
            stroke="#db2777"
            strokeWidth={px(1)}
            dash={[px(4), px(3)]}
            perfectDrawEnabled={false}
          />
          {g.distanceLabel && (
            <Text
              x={(g.from.x + g.to.x) / 2}
              y={(g.from.y + g.to.y) / 2 - px(14)}
              text={g.distanceLabel}
              fontSize={px(10)}
              fill="#db2777"
              perfectDrawEnabled={false}
            />
          )}
        </React.Fragment>
      ))}

      {/* Snap glyphs */}
      {snapGlyphs.map((glyph, i) => (
        <Circle
          key={i}
          x={glyph.at.x}
          y={glyph.at.y}
          radius={px(5)}
          stroke={GLYPH_COLORS[glyph.kind] ?? '#6b7280'}
          strokeWidth={px(2)}
          perfectDrawEnabled={false}
        />
      ))}

      {/* Opening placement ghost */}
      {openingGhost && (
        <Line
          points={openingGhost.rect.flatMap((p) => [p.x, p.y])}
          closed
          fill="rgba(37, 99, 235, 0.25)"
          stroke="#2563eb"
          strokeWidth={px(1.5)}
          dash={[px(5), px(3)]}
          perfectDrawEnabled={false}
        />
      )}

      {/* Marquee */}
      {marquee && (
        <Rect
          x={Math.min(marquee.start.x, marquee.end.x)}
          y={Math.min(marquee.start.y, marquee.end.y)}
          width={Math.abs(marquee.end.x - marquee.start.x)}
          height={Math.abs(marquee.end.y - marquee.start.y)}
          fill="rgba(37, 99, 235, 0.08)"
          stroke="#2563eb"
          strokeWidth={px(1)}
          perfectDrawEnabled={false}
        />
      )}
    </>
  );
};

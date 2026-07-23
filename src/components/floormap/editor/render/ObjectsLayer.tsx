/**
 * Library-object rendering for the v2 editor: proper SVG symbols (from the
 * unified catalog) at true real-world scale, selection box, a rotation grip
 * for single selection (industry convention: visible curved-arrow handle
 * outside the bounding box), and the placement ghost while the object tool
 * aims. Category visibility follows projectSettings.hiddenObjectCategories.
 */

import React from 'react';
import { Group, Path, Rect, Circle, Text } from 'react-konva';
import { FloorMapShape } from '../../types';
import {
  getUnifiedObjectById,
  isObjectCategoryHidden,
  SVGSymbol,
} from '../../objectLibrary';
import {
  getObjectDef,
  objectDimensionsMM,
  objectFootprintWorld,
  objectPlacement,
} from '../objects/objectModel';
import { useFloorMapStore } from '../../store';
import { useEditorUiStore } from '../state/uiStore';

const SELECT_COLOR = '#2563eb';

const SymbolPaths: React.FC<{ symbol: SVGSymbol; w: number; d: number }> = ({ symbol, w, d }) => {
  const [, , vbWidth, vbHeight] = symbol.viewBox.split(' ').map(Number);
  const scaleX = w / vbWidth;
  const scaleY = d / vbHeight;
  return (
    <>
      {symbol.paths.map((path, i) => (
        <Path
          key={i}
          data={path.d}
          fill={path.fill && path.fill !== 'none' ? path.fill : undefined}
          stroke={path.stroke === 'none' ? undefined : path.stroke || symbol.defaultStroke || '#374151'}
          strokeWidth={(path.strokeWidth ?? 2) * Math.min(scaleX, scaleY)}
          scaleX={scaleX}
          scaleY={scaleY}
          listening={false}
          perfectDrawEnabled={false}
        />
      ))}
    </>
  );
};

const ObjectShape: React.FC<{
  shape: FloorMapShape;
  isSelected: boolean;
  showRotateHandle: boolean;
  zoom: number;
}> = ({ shape, isSelected, showRotateHandle, zoom }) => {
  const def = getObjectDef(shape);
  const footprint = objectFootprintWorld(shape);
  if (!def || !footprint) return null;
  const { center, rotation } = objectPlacement(shape);
  const { w, d } = footprint;
  const pad = 3 / zoom;
  const gripOffset = 26 / zoom;

  return (
    <Group x={center.x} y={center.y} rotation={rotation} name={shape.id}>
      {/* Hit area covering the footprint */}
      <Rect
        name={shape.id}
        x={-w / 2 - pad}
        y={-d / 2 - pad}
        width={w + pad * 2}
        height={d + pad * 2}
        fill="rgba(0,0,0,0.001)"
        perfectDrawEnabled={false}
      />
      <Group x={-w / 2} y={-d / 2} listening={false}>
        <SymbolPaths symbol={def.floorPlanSymbol} w={w} d={d} />
      </Group>
      {/* Custom/DIY objects carry their own name + real dimensions — the whole
          point is seeing how YOUR measurements fit the room. */}
      {def.category === 'custom' && (() => {
        const dims = objectDimensionsMM(shape);
        const label = `${shape.name || def.name}\n${dims ? `${Math.round(dims.width)}×${Math.round(dims.depth)} mm` : ''}`;
        return (
          <Text
            x={-w / 2}
            y={-11 / zoom}
            width={w}
            align="center"
            text={label}
            fontSize={Math.min(11 / zoom, w / 6)}
            lineHeight={1.2}
            fill="#854d0e"
            listening={false}
            perfectDrawEnabled={false}
          />
        );
      })()}
      {isSelected && (
        <>
          <Rect
            x={-w / 2 - pad}
            y={-d / 2 - pad}
            width={w + pad * 2}
            height={d + pad * 2}
            stroke={SELECT_COLOR}
            strokeWidth={1.5 / zoom}
            listening={false}
            perfectDrawEnabled={false}
          />
          {showRotateHandle && def.wallBehavior.canRotate && (
            <>
              <Circle
                name={`objrotate:${shape.id}`}
                x={0}
                y={-d / 2 - pad - gripOffset}
                radius={7 / zoom}
                fill="#ffffff"
                stroke={SELECT_COLOR}
                strokeWidth={1.5 / zoom}
                perfectDrawEnabled={false}
              />
              <Path
                x={-4.5 / zoom}
                y={-d / 2 - pad - gripOffset - 4.5 / zoom}
                data="M2,5 a3.5,3.5 0 1 1 1,2.5 M2.6,9 l0.4,-1.5 1.5,0.4"
                stroke={SELECT_COLOR}
                strokeWidth={1.2 / zoom}
                scaleX={1 / zoom}
                scaleY={1 / zoom}
                listening={false}
                perfectDrawEnabled={false}
              />
              <Rect
                x={-0.5 / zoom}
                y={-d / 2 - pad - gripOffset + 7 / zoom}
                width={1 / zoom}
                height={gripOffset - 7 / zoom}
                fill={SELECT_COLOR}
                listening={false}
                perfectDrawEnabled={false}
              />
            </>
          )}
        </>
      )}
    </Group>
  );
};

interface ObjectsLayerProps {
  shapes: FloorMapShape[];
  planId: string | null;
  selectedIds: string[];
  zoom: number;
}

export const ObjectsLayer: React.FC<ObjectsLayerProps> = ({
  shapes,
  planId,
  selectedIds,
  zoom,
}) => {
  const hiddenCategories = useFloorMapStore((s) => s.projectSettings.hiddenObjectCategories);
  const ghost = useEditorUiStore((s) => s.objectGhost);
  const selected = new Set(selectedIds);

  const objects = shapes
    .filter((s) => s.metadata?.isUnifiedObject && typeof s.metadata?.unifiedObjectId === 'string')
    .filter((s) => !planId || s.planId === planId || !s.planId)
    .filter((s) => !isObjectCategoryHidden(s, hiddenCategories ?? []))
    .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

  const ghostDef = ghost ? getUnifiedObjectById(ghost.definitionId) : null;

  return (
    <>
      {objects.map((shape) => (
        <ObjectShape
          key={shape.id}
          shape={shape}
          isSelected={selected.has(shape.id)}
          showRotateHandle={selectedIds.length === 1}
          zoom={zoom}
        />
      ))}

      {/* Placement ghost: the real symbol at true scale, translucent */}
      {ghost && ghostDef && (
        <Group
          x={ghost.center.x}
          y={ghost.center.y}
          rotation={ghost.rotation}
          opacity={0.7}
          listening={false}
        >
          <Group
            x={-ghost.widthWorld / 2}
            y={-ghost.depthWorld / 2}
          >
            <SymbolPaths symbol={ghostDef.floorPlanSymbol} w={ghost.widthWorld} d={ghost.depthWorld} />
          </Group>
          <Rect
            x={-ghost.widthWorld / 2}
            y={-ghost.depthWorld / 2}
            width={ghost.widthWorld}
            height={ghost.depthWorld}
            stroke={ghost.snapped ? '#16a34a' : SELECT_COLOR}
            strokeWidth={1.5 / zoom}
            dash={[5 / zoom, 3 / zoom]}
            perfectDrawEnabled={false}
          />
        </Group>
      )}
    </>
  );
};

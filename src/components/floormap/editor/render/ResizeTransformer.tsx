/**
 * Interactive resize handles for the selected free shape (rectangle, triangle,
 * circle, image). A Konva Transformer attaches to the shape's node; on release
 * the scale is baked back into the shape's world-unit coordinates and committed
 * through the executor as one undo step (so it also gives the trace image the
 * drag-to-scale that the numeric width input alone couldn't).
 *
 * Walls/rooms/openings/objects and text are excluded — they have their own
 * editing (length editor, wall-magnet drag, font controls).
 */

import { useEffect, useRef } from 'react';
import { Transformer } from 'react-konva';
import Konva from 'konva';
import { useFloorMapStore } from '../../store';
import { execute } from '../core/commands';
import type { FloorMapShape } from '../../types';

const RESIZABLE = new Set<FloorMapShape['type']>(['rectangle', 'triangle', 'circle', 'image']);
const MIN_SIZE = 5; // world units

export const ResizeTransformer = ({ zoom }: { zoom: number }) => {
  const trRef = useRef<Konva.Transformer>(null);
  const shapes = useFloorMapStore((s) => s.shapes);
  const selectedShapeIds = useFloorMapStore((s) => s.selectedShapeIds);
  const activeTool = useFloorMapStore((s) => s.activeTool);

  const target =
    selectedShapeIds.length === 1
      ? shapes.find((s) => s.id === selectedShapeIds[0] && RESIZABLE.has(s.type) && !s.locked)
      : undefined;

  // Attach/detach the transformer to the target node.
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const stage = tr.getStage();
    if (!target || activeTool !== 'select' || !stage) {
      tr.nodes([]);
      tr.getLayer()?.batchDraw();
      return;
    }
    // Image renders as a Group whose inner KonvaImage shares the name — pick the
    // node that sits directly in the Layer (the outermost one).
    const matches = stage.find((n: Konva.Node) => n.name() === target.id);
    const node =
      matches.find((n) => n.getParent()?.getClassName() === 'Layer') ?? matches[0];
    if (node) {
      tr.nodes([node]);
      tr.moveToTop();
      tr.getLayer()?.batchDraw();
    } else {
      tr.nodes([]);
    }
  }, [target?.id, target?.type, activeTool, shapes]);

  const handleTransformEnd = () => {
    const tr = trRef.current;
    const node = tr?.nodes()[0] as Konva.Node | undefined;
    if (!node || !target) return;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    // Bake scale back into geometry so stored coords stay in world units.
    node.scaleX(1);
    node.scaleY(1);

    if (target.type === 'circle') {
      const c = target.coordinates as { cx: number; cy: number; radius: number };
      const radius = Math.max(MIN_SIZE, c.radius * Math.max(scaleX, scaleY));
      execute('shape.update', {
        id: target.id,
        updates: { coordinates: { cx: node.x(), cy: node.y(), radius } },
      });
    } else if (target.type === 'image') {
      const c = target.coordinates as { x: number; y: number; width: number; height: number };
      execute('shape.update', {
        id: target.id,
        updates: {
          coordinates: {
            x: node.x(),
            y: node.y(),
            width: Math.max(MIN_SIZE, c.width * scaleX),
            height: Math.max(MIN_SIZE, c.height * scaleY),
          },
        },
      });
    } else {
      // rectangle / triangle
      const c = target.coordinates as { left: number; top: number; width: number; height: number };
      execute('shape.update', {
        id: target.id,
        updates: {
          coordinates: {
            left: node.x(),
            top: node.y(),
            width: Math.max(MIN_SIZE, c.width * scaleX),
            height: Math.max(MIN_SIZE, c.height * scaleY),
          },
        },
      });
    }
  };

  return (
    <Transformer
      ref={trRef}
      rotateEnabled={false}
      keepRatio={target?.type === 'circle'}
      ignoreStroke
      anchorSize={8 / zoom}
      anchorStrokeWidth={1 / zoom}
      borderStrokeWidth={1 / zoom}
      borderStroke="#2563eb"
      anchorStroke="#2563eb"
      boundBoxFunc={(oldBox, newBox) =>
        newBox.width < MIN_SIZE || newBox.height < MIN_SIZE ? oldBox : newBox
      }
      onTransformEnd={handleTransformEnd}
    />
  );
};

/**
 * ImageShape - Renders background images on the canvas
 *
 * Used for importing floor plan images that users can trace over.
 * Supports drag, resize (with aspect ratio), and opacity control.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Image as KonvaImage, Transformer, Rect } from 'react-konva';
import Konva from 'konva';
import useImage from 'use-image';
import { ShapeComponentProps } from './types';
import { ImageCoordinates } from '../types';
import { createUnifiedDragHandlers } from '../canvas/utils';
import { useFileUrl } from '@/lib/fileUrl';

/**
 * ImageShape - Renders a background image shape
 * Typically placed below other shapes for tracing floor plans
 */
export const ImageShape = React.memo<ShapeComponentProps>(({
  shape,
  isSelected,
  onSelect,
  onTransform,
  shapeRefsMap
}) => {
  const shapeRef = useRef<Konva.Image>(null);
  const transformerRef = useRef<Konva.Transformer>(null);

  // Get unified drag handlers for multi-select support
  const dragHandlers = createUnifiedDragHandlers(shape.id);

  // Load image using Konva's useImage hook
  const signedUrl = useFileUrl(shape.imageUrl);
  const [image, status] = useImage(signedUrl || '', 'anonymous');

  // Track if image has loaded for initial sizing
  const [hasInitialized, setHasInitialized] = useState(false);

  // Store ref in shapeRefsMap for unified multi-select drag
  useEffect(() => {
    if (shapeRef.current && shapeRefsMap) {
      shapeRefsMap.set(shape.id, shapeRef.current);
      return () => {
        shapeRefsMap.delete(shape.id);
      };
    }
  }, [shape.id, shapeRefsMap]);

  // Attach transformer when selected
  useEffect(() => {
    if (isSelected && transformerRef.current && shapeRef.current) {
      transformerRef.current.nodes([shapeRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  // Initialize size from image dimensions if not set
  useEffect(() => {
    if (image && status === 'loaded' && !hasInitialized) {
      const coords = shape.coordinates as ImageCoordinates;

      // If width/height are 0 or very small, use image's natural dimensions
      if (!coords.width || coords.width < 10 || !coords.height || coords.height < 10) {
        // Scale image to fit reasonably on canvas (max 2000px initially)
        const maxDimension = 2000;
        const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));

        onTransform({
          coordinates: {
            x: coords.x,
            y: coords.y,
            width: image.width * scale,
            height: image.height * scale,
          },
        });
      }
      setHasInitialized(true);
    }
  }, [image, status, hasInitialized, shape.coordinates, onTransform]);

  // Handle transform end (resize)
  const handleTransformEnd = useCallback(() => {
    const node = shapeRef.current;
    if (!node) return;

    const scaleX = node.scaleX();
    const scaleY = node.scaleY();

    // Reset scale and update dimensions
    node.scaleX(1);
    node.scaleY(1);

    const coords = shape.coordinates as ImageCoordinates;

    onTransform({
      coordinates: {
        x: node.x(),
        y: node.y(),
        width: Math.max(50, coords.width * scaleX),
        height: Math.max(50, coords.height * scaleY),
      },
      rotation: node.rotation(),
    });
  }, [shape.coordinates, onTransform]);

  // Handle drag end
  const handleDragEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    const coords = shape.coordinates as ImageCoordinates;
    onTransform({
      coordinates: {
        ...coords,
        x: e.target.x(),
        y: e.target.y(),
      },
    });
  }, [shape.coordinates, onTransform]);

  if (shape.type !== 'image') return null;

  const coords = shape.coordinates as ImageCoordinates;
  const opacity = shape.imageOpacity ?? 0.5;
  const isLocked = shape.locked ?? false;

  // Show loading placeholder while image loads
  if (status === 'loading') {
    return (
      <Rect
        x={coords.x}
        y={coords.y}
        width={coords.width || 200}
        height={coords.height || 200}
        fill="#f3f4f6"
        stroke="#d1d5db"
        strokeWidth={1}
        dash={[5, 5]}
      />
    );
  }

  // Show error state if image failed to load
  if (status === 'failed') {
    return (
      <Rect
        x={coords.x}
        y={coords.y}
        width={coords.width || 200}
        height={coords.height || 200}
        fill="#fee2e2"
        stroke="#ef4444"
        strokeWidth={1}
      />
    );
  }

  return (
    <>
      <KonvaImage
        ref={shapeRef}
        id={`shape-${shape.id}`}
        name={shape.id}
        shapeId={shape.id}
        image={image}
        x={coords.x}
        y={coords.y}
        width={coords.width}
        height={coords.height}
        opacity={opacity}
        rotation={shape.rotation || 0}
        draggable={!isLocked}
        onClick={(e) => {
          e.cancelBubble = true;
          onSelect(e);
        }}
        onTap={(e) => {
          e.cancelBubble = true;
          onSelect(e);
        }}
        onDragStart={dragHandlers.onDragStart}
        onDragMove={dragHandlers.onDragMove}
        onDragEnd={dragHandlers.onDragEnd}
        onTransformEnd={handleTransformEnd}
        listening={true}
        // Performance optimizations
        perfectDrawEnabled={false}
      />
      {isSelected && !isLocked && (
        <Transformer
          ref={transformerRef}
          rotateEnabled={true}
          enabledAnchors={[
            'top-left',
            'top-right',
            'bottom-left',
            'bottom-right',
            'middle-left',
            'middle-right',
            'top-center',
            'bottom-center',
          ]}
          boundBoxFunc={(oldBox, newBox) => {
            // Minimum size
            if (newBox.width < 50 || newBox.height < 50) {
              return oldBox;
            }
            return newBox;
          }}
          anchorSize={8}
          anchorCornerRadius={2}
          anchorStroke="#3b82f6"
          anchorFill="white"
          borderStroke="#3b82f6"
          borderStrokeWidth={1}
          rotateAnchorOffset={20}
        />
      )}
    </>
  );
}, (prevProps, nextProps) => {
  const coordsEqual = JSON.stringify(prevProps.shape.coordinates) === JSON.stringify(nextProps.shape.coordinates);

  return (
    prevProps.shape.id === nextProps.shape.id &&
    prevProps.isSelected === nextProps.isSelected &&
    coordsEqual &&
    prevProps.shape.imageUrl === nextProps.shape.imageUrl &&
    prevProps.shape.imageOpacity === nextProps.shape.imageOpacity &&
    prevProps.shape.locked === nextProps.shape.locked &&
    prevProps.shape.rotation === nextProps.shape.rotation
  );
});

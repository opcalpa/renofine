import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Ruler, FileText, Edit2, Palette, RotateCw, Layers, ArrowUp, ArrowDown, ChevronsUp, ChevronsDown, Image as ImageIcon, Package, Lock, Unlock } from 'lucide-react';
import { FloorMapShape, SymbolCoordinates, RectangleCoordinates, LineCoordinates, PolygonCoordinates } from './types';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { CommentsSection } from '@/components/comments/CommentsSection';
import { useFloorMapStore } from './store';
import { toast } from 'sonner';
import { WallSmartDataSection } from './WallSmartDataSection';
import { ShapePhotoSection } from './ShapePhotoSection';
import { ObjectRoomItemSection } from './ObjectRoomItemSection';

interface PropertyPanelProps {
  shape: FloorMapShape;
  projectId: string;
  onClose: () => void;
  onUpdateShape: (shapeId: string, updates: Partial<FloorMapShape>) => void;
  onUpdateShapes?: (updates: Array<{ id: string; updates: Partial<FloorMapShape> }>) => void;
  pixelsPerMm: number;
  selectedShapeIds?: string[];
  allShapes?: FloorMapShape[];
  /** Wall index (1-based) for display */
  wallIndex?: number;
  /** Total number of walls */
  totalWalls?: number;
}

export const PropertyPanel: React.FC<PropertyPanelProps> = ({
  shape,
  projectId,
  onClose,
  onUpdateShape,
  onUpdateShapes,
  pixelsPerMm,
  selectedShapeIds = [],
  allShapes = [],
  wallIndex,
  totalWalls,
}) => {
  const { t } = useTranslation();
  const [isEditMode, setIsEditMode] = useState(false);
  const [editName, setEditName] = useState(shape.name || '');
  const [notes, setNotes] = useState(shape.notes || '');
  const [isEditingDimensions, setIsEditingDimensions] = useState(false);
  const [editLengthM, setEditLengthM] = useState('0');
  const [editThicknessMm, setEditThicknessMm] = useState('150');
  const [editHeightMm, setEditHeightMm] = useState('2400');

  // Visual properties state
  const [opacity, setOpacity] = useState(((shape.type === 'image' ? shape.imageOpacity : shape.opacity) ?? 1) * 100);
  const [rotation, setRotation] = useState(shape.rotation || 0);
  const [fillColor, setFillColor] = useState(shape.color || '#3b82f6');
  const [strokeColor, setStrokeColor] = useState(shape.strokeColor || '#1e40af');

  // Template group editing state
  const [isEditingGroupDimensions, setIsEditingGroupDimensions] = useState(false);
  const [editGroupWidthMm, setEditGroupWidthMm] = useState('0');
  const [editGroupHeightMm, setEditGroupHeightMm] = useState('0');

  // Object dimensions editing state (for unified objects, symbols with wallRelative)
  const [isEditingObjectDimensions, setIsEditingObjectDimensions] = useState(false);
  const [editObjectWidthMm, setEditObjectWidthMm] = useState('600');
  const [editObjectHeightMm, setEditObjectHeightMm] = useState('850');
  const [editObjectDepthMm, setEditObjectDepthMm] = useState('600');

  // Layer actions from store
  const bringForward = useFloorMapStore((state) => state.bringForward);
  const sendBackward = useFloorMapStore((state) => state.sendBackward);
  const bringToFront = useFloorMapStore((state) => state.bringToFront);
  const sendToBack = useFloorMapStore((state) => state.sendToBack);

  // Get all shapes from store if not provided via props (for elevation data calculation)
  const storeShapes = useFloorMapStore((state) => state.shapes);
  const shapesForCalculation = allShapes.length > 0 ? allShapes : storeShapes;

  // Check if this is a wall shape
  const isWall = shape.type === 'wall' || shape.type === 'line';

  // Get all selected shapes that are walls/lines (for batch dimension updates)
  const selectedWallShapes = useMemo(() => {
    if (!selectedShapeIds || selectedShapeIds.length <= 1) return [];
    return shapesForCalculation.filter(
      s => selectedShapeIds.includes(s.id) && (s.type === 'wall' || s.type === 'line')
    );
  }, [selectedShapeIds, shapesForCalculation]);

  // Number of other walls that will be updated (excluding current shape)
  const otherWallsCount = selectedWallShapes.filter(s => s.id !== shape.id).length;

  // Get elevation shapes linked to this wall
  const elevationShapes = useMemo(() => {
    if (!isWall) return [];
    return shapesForCalculation.filter(s => s.parentWallId === shape.id && s.shapeViewMode === 'elevation');
  }, [shapesForCalculation, shape.id, isWall]);

  // Calculate wall dimensions for smart data
  const wallDimensions = useMemo(() => {
    if (!isWall) return { lengthMM: 0, heightMM: 0 };
    const coords = shape.coordinates as { x1: number; y1: number; x2: number; y2: number };
    const dx = coords.x2 - coords.x1;
    const dy = coords.y2 - coords.y1;
    const lengthPixels = Math.sqrt(dx * dx + dy * dy);
    const lengthMM = lengthPixels / pixelsPerMm;
    const heightMM = shape.heightMM || 2400;
    return { lengthMM, heightMM };
  }, [shape.coordinates, shape.heightMM, isWall, pixelsPerMm]);

  // Check if this is a template group leader
  const isTemplateGroup = shape.isGroupLeader && shape.templateInfo;
  const templateInfo = shape.templateInfo;

  // Check if this is an object with editable dimensions (wallRelative or dimensions3D or unified object)
  const isEditableObject = !!(
    shape.wallRelative ||
    shape.dimensions3D ||
    (shape.metadata?.isUnifiedObject && shape.metadata?.unifiedObjectId)
  );

  // Get object dimensions from various sources
  const objectDimensions = useMemo(() => {
    if (shape.wallRelative) {
      return {
        width: shape.wallRelative.width || 0,
        height: shape.wallRelative.height || 0,
        depth: shape.wallRelative.depth || 0,
        elevationBottom: shape.wallRelative.elevationBottom || 0,
        hasWallAttachment: true,
        wallId: shape.wallRelative.wallId,
      };
    }
    if (shape.dimensions3D) {
      return {
        width: shape.dimensions3D.width || 0,
        height: shape.dimensions3D.height || 0,
        depth: shape.dimensions3D.depth || 0,
        elevationBottom: 0,
        hasWallAttachment: false,
        wallId: null,
      };
    }
    // For unified objects without explicit dimensions, try to get from coordinates
    const coords = shape.coordinates as Record<string, unknown>;
    if ('width' in coords && 'height' in coords) {
      return {
        width: (coords.width as number) / pixelsPerMm || 0,
        height: 850, // Default height for kitchen objects
        depth: (coords.height as number) / pixelsPerMm || 0, // In floorplan, 'height' is depth
        elevationBottom: 0,
        hasWallAttachment: false,
        wallId: null,
      };
    }
    return null;
  }, [shape.wallRelative, shape.dimensions3D, shape.coordinates, pixelsPerMm]);

  // Get the object type name for display
  const objectTypeName = useMemo(() => {
    if (shape.metadata?.unifiedObjectId) {
      return shape.metadata.unifiedObjectId as string;
    }
    if (shape.symbolType) {
      return shape.symbolType;
    }
    if (shape.objectCategory) {
      return shape.objectCategory;
    }
    return 'object';
  }, [shape.metadata, shape.symbolType, shape.objectCategory]);

  // Get all shapes in this group
  const groupShapes = useMemo(() => {
    if (!shape.groupId) return [];
    return shapesForCalculation.filter(s => s.groupId === shape.groupId);
  }, [shape.groupId, shapesForCalculation]);

  // Calculate the actual bounding box of the group (in case it has been transformed)
  const groupBounds = useMemo(() => {
    if (!isTemplateGroup || groupShapes.length === 0) {
      return templateInfo ? {
        widthMM: templateInfo.boundsWidth,
        heightMM: templateInfo.boundsHeight,
        depthMM: templateInfo.boundsDepth || 2400,
      } : { widthMM: 0, heightMM: 0, depthMM: 0 };
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const s of groupShapes) {
      const coords = s.coordinates;
      if ('x1' in coords && 'x2' in coords) {
        // Line/wall
        const c = coords as LineCoordinates;
        minX = Math.min(minX, c.x1, c.x2);
        minY = Math.min(minY, c.y1, c.y2);
        maxX = Math.max(maxX, c.x1, c.x2);
        maxY = Math.max(maxY, c.y1, c.y2);
      } else if ('left' in coords && 'width' in coords) {
        // Rectangle
        const c = coords as RectangleCoordinates;
        minX = Math.min(minX, c.left);
        minY = Math.min(minY, c.top);
        maxX = Math.max(maxX, c.left + c.width);
        maxY = Math.max(maxY, c.top + c.height);
      } else if ('x' in coords && 'width' in coords) {
        // Symbol
        const c = coords as SymbolCoordinates;
        minX = Math.min(minX, c.x);
        minY = Math.min(minY, c.y);
        maxX = Math.max(maxX, c.x + c.width);
        maxY = Math.max(maxY, c.y + c.height);
      } else if ('points' in coords) {
        // Polygon
        const c = coords as PolygonCoordinates;
        for (const p of c.points) {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        }
      }
    }

    const widthPixels = maxX - minX;
    const heightPixels = maxY - minY;
    return {
      widthMM: widthPixels / pixelsPerMm,
      heightMM: heightPixels / pixelsPerMm,
      depthMM: templateInfo?.boundsDepth || 2400,
    };
  }, [isTemplateGroup, groupShapes, templateInfo, pixelsPerMm]);

  const getPixelsPerMeter = (pxPerMm: number) => pxPerMm * 1000;
  
  // Initialize edit values when shape changes
  useEffect(() => {
    setEditName(shape.name || '');
    setNotes(shape.notes || '');
    setOpacity(((shape.type === 'image' ? shape.imageOpacity : shape.opacity) ?? 1) * 100);
    setRotation(shape.rotation || 0);
    setFillColor(shape.color || '#3b82f6');
    setStrokeColor(shape.strokeColor || '#1e40af');

    // Calculate initial values for walls/lines
    if (shape.type === 'wall' || shape.type === 'line') {
      const coords = shape.coordinates as any;
      const dx = coords.x2 - coords.x1;
      const dy = coords.y2 - coords.y1;
      const lengthPixels = Math.sqrt(dx * dx + dy * dy);
      const lengthMeters = lengthPixels / getPixelsPerMeter(pixelsPerMm);
      setEditLengthM(lengthMeters.toFixed(3));
      setEditThicknessMm(String(shape.thicknessMM || 150));
      setEditHeightMm(String(shape.heightMM || 2400));
    }

    // Initialize object dimension values
    if (shape.wallRelative) {
      setEditObjectWidthMm(String(Math.round(shape.wallRelative.width || 600)));
      setEditObjectHeightMm(String(Math.round(shape.wallRelative.height || 850)));
      setEditObjectDepthMm(String(Math.round(shape.wallRelative.depth || 600)));
    } else if (shape.dimensions3D) {
      setEditObjectWidthMm(String(Math.round(shape.dimensions3D.width || 600)));
      setEditObjectHeightMm(String(Math.round(shape.dimensions3D.height || 850)));
      setEditObjectDepthMm(String(Math.round(shape.dimensions3D.depth || 600)));
    }
    setIsEditingObjectDimensions(false);

    // Initialize group dimension values
    if (shape.isGroupLeader && shape.templateInfo) {
      setEditGroupWidthMm(String(Math.round(shape.templateInfo.boundsWidth)));
      setEditGroupHeightMm(String(Math.round(shape.templateInfo.boundsHeight)));
    }
  }, [shape.id, shape.isGroupLeader, shape.templateInfo]);
  
  // Auto-save notes after 1 second of no typing
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (notes !== shape.notes) {
        onUpdateShape(shape.id, { notes });
        toast.success(t('propertyPanel.notesSaved'));
      }
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [notes]);
  
  // Calculate shape-specific properties
  const getShapeProperties = () => {
    switch (shape.type) {
      case 'wall':
      case 'line': {
        const coords = shape.coordinates as any;
        const dx = coords.x2 - coords.x1;
        const dy = coords.y2 - coords.y1;
        const lengthPixels = Math.sqrt(dx * dx + dy * dy);
        const lengthMeters = lengthPixels / getPixelsPerMeter(pixelsPerMm);
        const lengthCm = lengthMeters * 100;
        const lengthMm = lengthMeters * 1000;
        
        return {
          type: t('propertyPanel.wall'),
          displayValues: [
            { label: `${t('propertyPanel.length')} (m)`, value: lengthMeters >= 1 ? `${lengthMeters.toFixed(2)} m` : `${lengthCm.toFixed(0)} cm`, highlight: true },
            { label: `${t('propertyPanel.length')} (cm)`, value: `${lengthCm.toFixed(1)} cm` },
            { label: `${t('propertyPanel.length')} (mm)`, value: `${lengthMm.toFixed(0)} mm` },
            { label: t('propertyPanel.thickness'), value: `${shape.thicknessMM || 150} mm` },
            { label: t('propertyPanel.height'), value: `${shape.heightMM || 2400} mm` },
          ]
        };
      }
      
      case 'room': {
        const coords = shape.coordinates as any;
        const points = coords.points || [];
        
        // Calculate area
        let area = 0;
        for (let i = 0; i < points.length; i++) {
          const j = (i + 1) % points.length;
          area += points[i].x * points[j].y;
          area -= points[j].x * points[i].y;
        }
        area = Math.abs(area / 2);
        const areaSqM = area / (getPixelsPerMeter(pixelsPerMm) ** 2);
        
        // Calculate perimeter
        let perimeter = 0;
        for (let i = 0; i < points.length; i++) {
          const j = (i + 1) % points.length;
          const dx = points[j].x - points[i].x;
          const dy = points[j].y - points[i].y;
          perimeter += Math.sqrt(dx * dx + dy * dy);
        }
        const perimeterM = perimeter / getPixelsPerMeter(pixelsPerMm);
        
        return {
          type: t('propertyPanel.room'),
          displayValues: [
            { label: t('propertyPanel.area'), value: `${areaSqM.toFixed(2)} m²`, highlight: true },
            { label: t('propertyPanel.perimeter'), value: `${perimeterM.toFixed(2)} m` },
            { label: t('propertyPanel.cornerCount'), value: `${points.length}` },
          ]
        };
      }
      
      case 'rectangle':
      case 'door':
      case 'opening': {
        const coords = shape.coordinates as any;
        const widthM = (coords.width || 0) / getPixelsPerMeter(pixelsPerMm);
        const heightM = (coords.height || 0) / getPixelsPerMeter(pixelsPerMm);
        const widthCm = widthM * 100;
        const heightCm = heightM * 100;
        
        return {
          type: shape.type === 'door' ? t('propertyPanel.door') : shape.type === 'opening' ? t('propertyPanel.opening') : t('propertyPanel.rectangle'),
          displayValues: [
            { label: t('propertyPanel.width'), value: widthM >= 1 ? `${widthM.toFixed(2)} m` : `${widthCm.toFixed(0)} cm`, highlight: true },
            { label: t('propertyPanel.height'), value: heightM >= 1 ? `${heightM.toFixed(2)} m` : `${heightCm.toFixed(0)} cm`, highlight: true },
          ]
        };
      }
      
      case 'circle': {
        const coords = shape.coordinates as any;
        const radiusM = (coords.radius || 0) / getPixelsPerMeter(pixelsPerMm);
        const radiusCm = radiusM * 100;
        const area = Math.PI * (coords.radius || 0) ** 2;
        const areaSqM = area / (getPixelsPerMeter(pixelsPerMm) ** 2);
        
        return {
          type: t('propertyPanel.circle'),
          displayValues: [
            { label: t('propertyPanel.radius'), value: radiusM >= 1 ? `${radiusM.toFixed(2)} m` : `${radiusCm.toFixed(0)} cm` },
            { label: t('propertyPanel.area'), value: `${areaSqM.toFixed(2)} m²`, highlight: true },
          ]
        };
      }
      
      case 'text': {
        return {
          type: t('propertyPanel.text'),
          displayValues: [
            { label: t('propertyPanel.text'), value: shape.text || '' },
            { label: t('propertyPanel.size'), value: `${shape.metadata?.lengthMM || 16}px` },
          ]
        };
      }
      
      case 'freehand':
      case 'polygon':
      case 'symbol': {
        // Check for unified objects or wall-attached objects
        if (objectDimensions) {
          const values = [];
          values.push({
            label: t('propertyPanel.width'),
            value: objectDimensions.width >= 1000
              ? `${(objectDimensions.width / 1000).toFixed(2)} m`
              : `${Math.round(objectDimensions.width)} mm`,
            highlight: true
          });
          values.push({
            label: t('propertyPanel.height'),
            value: objectDimensions.height >= 1000
              ? `${(objectDimensions.height / 1000).toFixed(2)} m`
              : `${Math.round(objectDimensions.height)} mm`,
            highlight: true
          });
          values.push({
            label: t('propertyPanel.depth'),
            value: objectDimensions.depth >= 1000
              ? `${(objectDimensions.depth / 1000).toFixed(2)} m`
              : `${Math.round(objectDimensions.depth)} mm`
          });
          if (objectDimensions.hasWallAttachment) {
            values.push({
              label: t('propertyPanel.elevationFromFloor', 'Höjd från golv'),
              value: `${Math.round(objectDimensions.elevationBottom)} mm`
            });
          }
          return {
            type: objectTypeName || t('propertyPanel.object'),
            displayValues: values
          };
        }
        return {
          type: t('propertyPanel.object'),
          displayValues: []
        };
      }

      default:
        // Check for objects with dimensions in default case too
        if (objectDimensions) {
          const values = [];
          values.push({
            label: t('propertyPanel.width'),
            value: objectDimensions.width >= 1000
              ? `${(objectDimensions.width / 1000).toFixed(2)} m`
              : `${Math.round(objectDimensions.width)} mm`,
            highlight: true
          });
          values.push({
            label: t('propertyPanel.height'),
            value: objectDimensions.height >= 1000
              ? `${(objectDimensions.height / 1000).toFixed(2)} m`
              : `${Math.round(objectDimensions.height)} mm`,
            highlight: true
          });
          values.push({
            label: t('propertyPanel.depth'),
            value: objectDimensions.depth >= 1000
              ? `${(objectDimensions.depth / 1000).toFixed(2)} m`
              : `${Math.round(objectDimensions.depth)} mm`
          });
          return {
            type: objectTypeName || t('propertyPanel.object'),
            displayValues: values
          };
        }
        return {
          type: t('propertyPanel.object'),
          displayValues: []
        };
    }
  };

  const { type, displayValues } = getShapeProperties();
  
  const handleSave = () => {
    onUpdateShape(shape.id, { 
      name: editName,
      notes: notes 
    });
    setIsEditMode(false);
    setIsEditingDimensions(false);
    toast.success(t('propertyPanel.changesSaved'));
  };
  
  const handleCancel = () => {
    setEditName(shape.name || '');
    setNotes(shape.notes || '');
    setIsEditingDimensions(false);
    
    // Reset dimension edits
    if (shape.type === 'wall' || shape.type === 'line') {
      const coords = shape.coordinates as any;
      const dx = coords.x2 - coords.x1;
      const dy = coords.y2 - coords.y1;
      const lengthPixels = Math.sqrt(dx * dx + dy * dy);
      const lengthMeters = lengthPixels / getPixelsPerMeter(pixelsPerMm);
      setEditLengthM(lengthMeters.toFixed(3));
      setEditThicknessMm(String(shape.thicknessMM || 150));
      setEditHeightMm(String(shape.heightMM || 2400));
    }
    
    setIsEditMode(false);
  };
  
  const handleSaveDimensions = () => {
    if (shape.type !== 'wall' && shape.type !== 'line') return;

    // Validate inputs
    const newLengthM = parseFloat(editLengthM);
    const newThicknessMm = parseFloat(editThicknessMm);
    const newHeightMm = parseFloat(editHeightMm);

    if (isNaN(newLengthM) || newLengthM <= 0) {
      toast.error(t('propertyPanel.invalidLength'));
      return;
    }

    if (isNaN(newThicknessMm) || newThicknessMm <= 0) {
      toast.error(t('propertyPanel.invalidThickness'));
      return;
    }

    if (isNaN(newHeightMm) || newHeightMm <= 0) {
      toast.error(t('propertyPanel.invalidHeight'));
      return;
    }

    // Check if we should batch update multiple shapes
    const shapesToUpdate = selectedWallShapes.length > 1 ? selectedWallShapes : [shape];

    if (shapesToUpdate.length > 1 && onUpdateShapes) {
      // Batch update: apply same dimensions to all selected walls
      const updates: Array<{ id: string; updates: Partial<FloorMapShape> }> = [];

      for (const wallShape of shapesToUpdate) {
        const wallCoords = wallShape.coordinates as { x1: number; y1: number; x2: number; y2: number };
        const wallDx = wallCoords.x2 - wallCoords.x1;
        const wallDy = wallCoords.y2 - wallCoords.y1;

        // Calculate new endpoint based on current angle but new length
        const wallAngle = Math.atan2(wallDy, wallDx);
        const newLengthPixels = newLengthM * getPixelsPerMeter(pixelsPerMm);
        const newX2 = wallCoords.x1 + Math.cos(wallAngle) * newLengthPixels;
        const newY2 = wallCoords.y1 + Math.sin(wallAngle) * newLengthPixels;

        updates.push({
          id: wallShape.id,
          updates: {
            coordinates: {
              x1: wallCoords.x1,
              y1: wallCoords.y1,
              x2: newX2,
              y2: newY2,
            },
            thicknessMM: newThicknessMm,
            heightMM: newHeightMm,
          },
        });
      }

      onUpdateShapes(updates);
      setIsEditingDimensions(false);
      toast.success(t('propertyPanel.batchDimensionsUpdated', { count: updates.length }));
    } else {
      // Single shape update (original behavior)
      const coords = shape.coordinates as { x1: number; y1: number; x2: number; y2: number };
      const dx = coords.x2 - coords.x1;
      const dy = coords.y2 - coords.y1;

      // Scale the wall proportionally if length changed
      const angle = Math.atan2(dy, dx);
      const newLengthPixels = newLengthM * getPixelsPerMeter(pixelsPerMm);
      const newX2 = coords.x1 + Math.cos(angle) * newLengthPixels;
      const newY2 = coords.y1 + Math.sin(angle) * newLengthPixels;

      onUpdateShape(shape.id, {
        coordinates: {
          x1: coords.x1,
          y1: coords.y1,
          x2: newX2,
          y2: newY2,
        },
        thicknessMM: newThicknessMm,
        heightMM: newHeightMm,
      });

      setIsEditingDimensions(false);
      toast.success(t('propertyPanel.dimensionsUpdated'));
    }
  };

  // Handle saving template group dimensions (scales all group shapes proportionally)
  const handleSaveGroupDimensions = () => {
    if (!isTemplateGroup || !templateInfo || groupShapes.length === 0 || !onUpdateShapes) return;

    const newWidthMM = parseFloat(editGroupWidthMm);
    const newHeightMM = parseFloat(editGroupHeightMm);

    if (isNaN(newWidthMM) || newWidthMM <= 0) {
      toast.error(t('propertyPanel.invalidWidth', 'Invalid width'));
      return;
    }
    if (isNaN(newHeightMM) || newHeightMM <= 0) {
      toast.error(t('propertyPanel.invalidHeight', 'Invalid height'));
      return;
    }

    // Calculate scale factors
    const currentWidthMM = groupBounds.widthMM;
    const currentHeightMM = groupBounds.heightMM;
    const scaleX = newWidthMM / currentWidthMM;
    const scaleY = newHeightMM / currentHeightMM;

    // Find the group center point for scaling
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of groupShapes) {
      const coords = s.coordinates;
      if ('x1' in coords && 'x2' in coords) {
        const c = coords as LineCoordinates;
        minX = Math.min(minX, c.x1, c.x2);
        minY = Math.min(minY, c.y1, c.y2);
        maxX = Math.max(maxX, c.x1, c.x2);
        maxY = Math.max(maxY, c.y1, c.y2);
      } else if ('left' in coords && 'width' in coords) {
        const c = coords as RectangleCoordinates;
        minX = Math.min(minX, c.left);
        minY = Math.min(minY, c.top);
        maxX = Math.max(maxX, c.left + c.width);
        maxY = Math.max(maxY, c.top + c.height);
      } else if ('x' in coords && 'width' in coords) {
        const c = coords as SymbolCoordinates;
        minX = Math.min(minX, c.x);
        minY = Math.min(minY, c.y);
        maxX = Math.max(maxX, c.x + c.width);
        maxY = Math.max(maxY, c.y + c.height);
      } else if ('points' in coords) {
        const c = coords as PolygonCoordinates;
        for (const p of c.points) {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        }
      }
    }
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // Build updates for all group shapes
    const updates: Array<{ id: string; updates: Partial<FloorMapShape> }> = [];

    for (const s of groupShapes) {
      const coords = s.coordinates;
      let newCoords: Record<string, unknown> = {};

      if ('x1' in coords && 'x2' in coords) {
        const c = coords as LineCoordinates;
        newCoords = {
          x1: centerX + (c.x1 - centerX) * scaleX,
          y1: centerY + (c.y1 - centerY) * scaleY,
          x2: centerX + (c.x2 - centerX) * scaleX,
          y2: centerY + (c.y2 - centerY) * scaleY,
        };
      } else if ('left' in coords && 'width' in coords) {
        const c = coords as RectangleCoordinates;
        const newLeft = centerX + (c.left - centerX) * scaleX;
        const newTop = centerY + (c.top - centerY) * scaleY;
        newCoords = {
          left: newLeft,
          top: newTop,
          width: c.width * scaleX,
          height: c.height * scaleY,
        };
      } else if ('x' in coords && 'width' in coords) {
        const c = coords as SymbolCoordinates;
        const newX = centerX + (c.x - centerX) * scaleX;
        const newY = centerY + (c.y - centerY) * scaleY;
        newCoords = {
          x: newX,
          y: newY,
          width: c.width * scaleX,
          height: c.height * scaleY,
        };
      } else if ('points' in coords) {
        const c = coords as PolygonCoordinates;
        newCoords = {
          points: c.points.map(p => ({
            x: centerX + (p.x - centerX) * scaleX,
            y: centerY + (p.y - centerY) * scaleY,
          })),
        };
      }

      // Update templateInfo bounds on the group leader
      const shapeUpdates: Partial<FloorMapShape> = { coordinates: newCoords as FloorMapShape['coordinates'] };
      if (s.isGroupLeader && s.templateInfo) {
        shapeUpdates.templateInfo = {
          ...s.templateInfo,
          boundsWidth: newWidthMM,
          boundsHeight: newHeightMM,
        };
      }

      updates.push({ id: s.id, updates: shapeUpdates });
    }

    onUpdateShapes(updates);
    setIsEditingGroupDimensions(false);
    toast.success(t('propertyPanel.groupDimensionsUpdated', `Group resized (${groupShapes.length} shapes)`));
  };

  // Handle saving object dimensions (for unified objects with wallRelative or dimensions3D)
  const handleSaveObjectDimensions = () => {
    const newWidth = parseFloat(editObjectWidthMm);
    const newHeight = parseFloat(editObjectHeightMm);
    const newDepth = parseFloat(editObjectDepthMm);

    if (isNaN(newWidth) || newWidth <= 0) {
      toast.error(t('propertyPanel.invalidWidth', 'Ogiltig bredd'));
      return;
    }
    if (isNaN(newHeight) || newHeight <= 0) {
      toast.error(t('propertyPanel.invalidHeight', 'Ogiltig höjd'));
      return;
    }
    if (isNaN(newDepth) || newDepth <= 0) {
      toast.error(t('propertyPanel.invalidDepth', 'Ogiltigt djup'));
      return;
    }

    const updates: Partial<FloorMapShape> = {};

    // Update wallRelative if present
    if (shape.wallRelative) {
      updates.wallRelative = {
        ...shape.wallRelative,
        width: newWidth,
        height: newHeight,
        depth: newDepth,
      };
    }

    // Update dimensions3D if present
    if (shape.dimensions3D) {
      updates.dimensions3D = {
        width: newWidth,
        height: newHeight,
        depth: newDepth,
      };
    }

    // Also update the visual coordinates to reflect the new dimensions
    // For freehand/polygon shapes, scale the points proportionally
    const coords = shape.coordinates as Record<string, unknown>;
    if ('points' in coords) {
      const points = coords.points as Array<{ x: number; y: number }>;
      if (points && points.length > 0) {
        // Calculate current bounds
        const minX = Math.min(...points.map(p => p.x));
        const maxX = Math.max(...points.map(p => p.x));
        const minY = Math.min(...points.map(p => p.y));
        const maxY = Math.max(...points.map(p => p.y));
        const currentWidth = maxX - minX;
        const currentDepth = maxY - minY;

        // Calculate scale factors (width in mm -> pixels)
        const oldWidthMM = shape.wallRelative?.width || shape.dimensions3D?.width || currentWidth / pixelsPerMm;
        const oldDepthMM = shape.wallRelative?.depth || shape.dimensions3D?.depth || currentDepth / pixelsPerMm;
        const scaleX = newWidth / oldWidthMM;
        const scaleY = newDepth / oldDepthMM;

        // Scale points around center
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const newPoints = points.map(p => ({
          x: centerX + (p.x - centerX) * scaleX,
          y: centerY + (p.y - centerY) * scaleY,
        }));

        updates.coordinates = { points: newPoints };
      }
    } else if ('width' in coords && 'height' in coords) {
      // Symbol coordinates - update width/height directly
      const oldWidthMM = shape.wallRelative?.width || shape.dimensions3D?.width || (coords.width as number) / pixelsPerMm;
      const oldDepthMM = shape.wallRelative?.depth || shape.dimensions3D?.depth || (coords.height as number) / pixelsPerMm;
      const scaleX = newWidth / oldWidthMM;
      const scaleY = newDepth / oldDepthMM;

      updates.coordinates = {
        ...coords,
        width: (coords.width as number) * scaleX,
        height: (coords.height as number) * scaleY,
      };
    }

    onUpdateShape(shape.id, updates);
    setIsEditingObjectDimensions(false);
    toast.success(t('propertyPanel.objectDimensionsUpdated', 'Objektmått uppdaterade'));
  };

  return (
    <div
      className="fixed top-0 right-0 h-screen w-full md:w-96 bg-white border-l-0 md:border-l-4 border-blue-500 shadow-2xl z-[100] flex flex-col"
      style={{
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        borderLeft: '4px solid #3b82f6'
      }}
    >
      {/* Mobile close bar */}
      <div className="flex items-center justify-between p-3 border-b md:hidden">
        <h3 className="font-semibold text-sm">{t('floormap.properties', 'Properties')}</h3>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0 bg-blue-50">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-blue-600" />
          <h3 className="font-semibold text-lg text-blue-900">{t('propertyPanel.objectDetails')}</h3>
          <div className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full font-medium">
            {shape.type.toUpperCase()}
          </div>
          {/* Wall number badge */}
          {isWall && wallIndex !== undefined && totalWalls !== undefined && (
            <div className="bg-gray-700 text-white text-xs px-2 py-1 rounded-full font-bold">
              #{wallIndex} / {totalWalls}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isEditMode ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancel}
              >
                {t('common.cancel')}
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
              >
                {t('common.save')}
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditMode(true)}
            >
              {t('common.edit')}
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onClose} className="h-10 w-10">
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>
      
      {/* Content - Scrollable */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Type & Name */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <Label className="text-sm font-medium text-gray-700">{t('propertyPanel.type')}</Label>
            <div className="mt-2">
              <Badge variant={shape.type === 'wall' || shape.type === 'room' ? 'default' : 'secondary'}>
                {isTemplateGroup ? templateInfo?.templateName || t('propertyPanel.templateGroup', 'Template Group') : type}
              </Badge>
              {isTemplateGroup && (
                <Badge variant="outline" className="ml-2">
                  <Package className="h-3 w-3 mr-1" />
                  {groupShapes.length} {t('propertyPanel.shapes', 'shapes')}
                </Badge>
              )}
            </div>
          </div>

          {(shape.type === 'room' || shape.name) && (
            <div className="flex-1">
              <Label className="text-sm font-medium text-gray-700">{t('common.name')}</Label>
              <div className="mt-2">
                {isEditMode ? (
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder={t('propertyPanel.enterName')}
                    className="w-full"
                  />
                ) : (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <span className="font-semibold text-gray-800">
                      {shape.name || t('propertyPanel.unnamed')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Linked room_items entry (E5.3) — for placed unified objects */}
        {shape.metadata?.isUnifiedObject && <ObjectRoomItemSection shapeId={shape.id} />}

        {/* Template Group Section */}
        {isTemplateGroup && (
          <>
            <Separator />
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-purple-600" />
                  <Label className="text-sm font-medium text-gray-700">
                    {t('propertyPanel.templateGroupDimensions', 'Group Dimensions')}
                  </Label>
                </div>
                {isEditMode && !isEditingGroupDimensions && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditGroupWidthMm(String(Math.round(groupBounds.widthMM)));
                      setEditGroupHeightMm(String(Math.round(groupBounds.heightMM)));
                      setIsEditingGroupDimensions(true);
                    }}
                    className="h-7 px-2 text-xs"
                  >
                    <Edit2 className="h-3 w-3 mr-1" />
                    {t('propertyPanel.resize', 'Resize')}
                  </Button>
                )}
              </div>

              <div className="space-y-2 bg-purple-50 rounded-lg p-3 border border-purple-200">
                {isEditingGroupDimensions ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs text-gray-600 mb-1">
                          {t('propertyPanel.widthMm', 'Width (mm)')}
                        </Label>
                        <Input
                          type="number"
                          step="1"
                          value={editGroupWidthMm}
                          onChange={(e) => setEditGroupWidthMm(e.target.value)}
                          className="h-9 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-gray-600 mb-1">
                          {t('propertyPanel.heightMm', 'Height (mm)')}
                        </Label>
                        <Input
                          type="number"
                          step="1"
                          value={editGroupHeightMm}
                          onChange={(e) => setEditGroupHeightMm(e.target.value)}
                          className="h-9 text-sm"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-purple-700">
                      {t('propertyPanel.groupScaleHint', 'All shapes in the group will scale proportionally')}
                    </p>
                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        onClick={handleSaveGroupDimensions}
                        className="flex-1 bg-purple-600 hover:bg-purple-700"
                      >
                        {t('propertyPanel.applyResize', 'Apply Resize')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setIsEditingGroupDimensions(false)}
                        className="px-3"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">{t('propertyPanel.width', 'Width')}:</span>
                      <span className="font-semibold text-purple-700">
                        {groupBounds.widthMM >= 1000
                          ? `${(groupBounds.widthMM / 1000).toFixed(2)} m`
                          : `${Math.round(groupBounds.widthMM)} mm`}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">{t('propertyPanel.height', 'Height')}:</span>
                      <span className="font-semibold text-purple-700">
                        {groupBounds.heightMM >= 1000
                          ? `${(groupBounds.heightMM / 1000).toFixed(2)} m`
                          : `${Math.round(groupBounds.heightMM)} mm`}
                      </span>
                    </div>
                    {groupBounds.depthMM > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">{t('propertyPanel.depth', 'Depth/Height')}:</span>
                        <span className="font-semibold text-purple-700">
                          {groupBounds.depthMM >= 1000
                            ? `${(groupBounds.depthMM / 1000).toFixed(2)} m`
                            : `${Math.round(groupBounds.depthMM)} mm`}
                        </span>
                      </div>
                    )}
                    {templateInfo?.category && (
                      <div className="flex justify-between items-center pt-2 border-t border-purple-200">
                        <span className="text-xs text-gray-500">{t('propertyPanel.category', 'Category')}:</span>
                        <Badge variant="outline" className="text-xs">
                          {templateInfo.category}
                        </Badge>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {/* Object Dimensions Section - for unified objects with wallRelative or dimensions3D */}
        {isEditableObject && objectDimensions && !isTemplateGroup && (
          <>
            <Separator />
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-blue-600" />
                  <Label className="text-sm font-medium text-gray-700">
                    {t('propertyPanel.objectDimensions', 'Objektmått')}
                  </Label>
                </div>
                {!isEditingObjectDimensions && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditObjectWidthMm(String(Math.round(objectDimensions.width)));
                      setEditObjectHeightMm(String(Math.round(objectDimensions.height)));
                      setEditObjectDepthMm(String(Math.round(objectDimensions.depth)));
                      setIsEditingObjectDimensions(true);
                    }}
                    className="h-7 px-2 text-xs"
                  >
                    <Edit2 className="h-3 w-3 mr-1" />
                    {t('propertyPanel.editDimensions', 'Ändra mått')}
                  </Button>
                )}
              </div>

              <div className="space-y-2 bg-blue-50 rounded-lg p-3 border border-blue-200">
                {isEditingObjectDimensions ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs text-gray-600 mb-1">
                          {t('propertyPanel.widthMm', 'Bredd (mm)')}
                        </Label>
                        <Input
                          type="number"
                          step="10"
                          value={editObjectWidthMm}
                          onChange={(e) => setEditObjectWidthMm(e.target.value)}
                          className="h-9 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-gray-600 mb-1">
                          {t('propertyPanel.heightMm', 'Höjd (mm)')}
                        </Label>
                        <Input
                          type="number"
                          step="10"
                          value={editObjectHeightMm}
                          onChange={(e) => setEditObjectHeightMm(e.target.value)}
                          className="h-9 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-gray-600 mb-1">
                          {t('propertyPanel.depthMm', 'Djup (mm)')}
                        </Label>
                        <Input
                          type="number"
                          step="10"
                          value={editObjectDepthMm}
                          onChange={(e) => setEditObjectDepthMm(e.target.value)}
                          className="h-9 text-sm"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-blue-700">
                      {t('propertyPanel.objectDimensionsHint', 'Ändrar bara detta placerade objekt, inte originalmallen')}
                    </p>
                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        onClick={handleSaveObjectDimensions}
                        className="flex-1 bg-blue-600 hover:bg-blue-700"
                      >
                        {t('propertyPanel.applyChanges', 'Spara ändringar')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setIsEditingObjectDimensions(false)}
                        className="px-3"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">{t('propertyPanel.width', 'Bredd')}:</span>
                      <span className="font-semibold text-blue-700">
                        {objectDimensions.width >= 1000
                          ? `${(objectDimensions.width / 1000).toFixed(2)} m`
                          : `${Math.round(objectDimensions.width)} mm`}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">{t('propertyPanel.height', 'Höjd')}:</span>
                      <span className="font-semibold text-blue-700">
                        {objectDimensions.height >= 1000
                          ? `${(objectDimensions.height / 1000).toFixed(2)} m`
                          : `${Math.round(objectDimensions.height)} mm`}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">{t('propertyPanel.depth', 'Djup')}:</span>
                      <span className="font-semibold text-blue-700">
                        {objectDimensions.depth >= 1000
                          ? `${(objectDimensions.depth / 1000).toFixed(2)} m`
                          : `${Math.round(objectDimensions.depth)} mm`}
                      </span>
                    </div>
                    {objectDimensions.hasWallAttachment && (
                      <div className="flex justify-between items-center pt-2 border-t border-blue-200">
                        <span className="text-xs text-gray-500">{t('propertyPanel.elevationFromFloor', 'Höjd från golv')}:</span>
                        <span className="font-semibold text-blue-600">
                          {Math.round(objectDimensions.elevationBottom)} mm
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        )}

        <Separator />

        {/* Dimensions */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Ruler className="h-4 w-4 text-gray-600" />
              <Label className="text-sm font-medium text-gray-700">{t('propertyPanel.dimensions')}</Label>
            </div>
            {isEditMode && (shape.type === 'wall' || shape.type === 'line') && !isEditingDimensions && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditingDimensions(true)}
                className="h-7 px-2 text-xs"
              >
                <Edit2 className="h-3 w-3 mr-1" />
                {t('propertyPanel.changeLength')}
              </Button>
            )}
          </div>
          
          <div className="space-y-2 bg-gray-50 rounded-lg p-3">
            {/* Show edit fields when editing wall/line dimensions */}
            {isEditingDimensions && (shape.type === 'wall' || shape.type === 'line') ? (
              <div className="space-y-4 pb-3 border-b border-gray-200">
                {/* Batch update indicator */}
                {otherWallsCount > 0 && (
                  <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-md">
                    <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                      {otherWallsCount + 1} {t('propertyPanel.selectedWalls')}
                    </Badge>
                    <span className="text-xs text-blue-700">
                      {t('propertyPanel.batchEditHint')}
                    </span>
                  </div>
                )}

                {/* Length */}
                <div>
                  <Label className="text-xs text-gray-600 mb-1">
                    {t('propertyPanel.lengthMeter')}
                  </Label>
                  <Input
                    type="number"
                    step="0.001"
                    value={editLengthM}
                    onChange={(e) => setEditLengthM(e.target.value)}
                    className="h-9 text-sm"
                    placeholder="3.450"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {t('propertyPanel.wallScalesProportionally')}
                  </p>
                </div>
                
                {/* Thickness */}
                <div>
                  <Label className="text-xs text-gray-600 mb-1">
                    {t('propertyPanel.thicknessMm')}
                  </Label>
                  <Input
                    type="number"
                    step="1"
                    value={editThicknessMm}
                    onChange={(e) => setEditThicknessMm(e.target.value)}
                    className="h-9 text-sm"
                    placeholder="150"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {t('propertyPanel.thicknessStandard')}
                  </p>
                </div>
                
                {/* Height */}
                <div>
                  <Label className="text-xs text-gray-600 mb-1">
                    {t('propertyPanel.heightMm')}
                  </Label>
                  <Input
                    type="number"
                    step="10"
                    value={editHeightMm}
                    onChange={(e) => setEditHeightMm(e.target.value)}
                    className="h-9 text-sm"
                    placeholder="2400"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {t('propertyPanel.heightStandard')}
                  </p>
                </div>
                
                {/* Action buttons */}
                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    onClick={handleSaveDimensions}
                    className="flex-1"
                  >
                    {t('propertyPanel.saveChanges')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setIsEditingDimensions(false)}
                    className="px-3"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              displayValues.map((prop, index) => (
                <div key={index} className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">{prop.label}:</span>
                  <span className={`font-${prop.highlight ? 'semibold text-blue-600' : 'medium'}`}>
                    {prop.value}
                  </span>
                </div>
              ))
            )}
            
            <Separator className="my-2" />
            
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-400 font-mono">ID:</span>
              <span className="text-xs text-gray-400 font-mono">
                {shape.id.substring(0, 8)}...
              </span>
            </div>
          </div>
        </div>

        {/* Wall Smart Data Section - only for walls */}
        {isWall && (
          <>
            <Separator />
            <WallSmartDataSection
              wall={shape}
              elevationShapes={elevationShapes}
              wallLengthMM={wallDimensions.lengthMM}
              wallHeightMM={wallDimensions.heightMM}
            />
          </>
        )}

        <Separator />

        {/* Visual Properties */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Palette className="h-4 w-4 text-gray-600" />
            <Label className="text-sm font-medium text-gray-700">{t('propertyPanel.appearance')}</Label>
          </div>

          <div className="space-y-4 bg-gray-50 rounded-lg p-3">
            {/* Opacity Slider */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <Label className="text-xs text-gray-600">{t('propertyPanel.opacity')}</Label>
                <span className="text-xs text-gray-500">{Math.round(opacity)}%</span>
              </div>
              <Slider
                value={[opacity]}
                onValueChange={(value) => {
                  setOpacity(value[0]);
                  onUpdateShape(shape.id, shape.type === 'image'
                    ? { imageOpacity: value[0] / 100 }
                    : { opacity: value[0] / 100 });
                }}
                min={0}
                max={100}
                step={1}
                className="w-full"
              />
            </div>

            {/* Lock as background — image shapes only */}
            {shape.type === 'image' && (
              <div className="flex items-center justify-between">
                <Label className="text-xs text-gray-600 flex items-center gap-1">
                  {shape.locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                  Lås som bakgrund
                </Label>
                <button
                  onClick={() => onUpdateShape(shape.id, {
                    locked: !shape.locked,
                    zIndex: !shape.locked ? -100 : 0,
                  })}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${shape.locked ? 'bg-blue-500' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${shape.locked ? 'translate-x-[18px]' : 'translate-x-1'}`} />
                </button>
              </div>
            )}

            {/* Rotation Input */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <Label className="text-xs text-gray-600 flex items-center gap-1">
                  <RotateCw className="h-3 w-3" />
                  {t('propertyPanel.rotation')}
                </Label>
                <span className="text-xs text-gray-500">{rotation}°</span>
              </div>
              <Input
                type="number"
                value={rotation}
                onChange={(e) => {
                  const value = parseFloat(e.target.value) || 0;
                  setRotation(value);
                  onUpdateShape(shape.id, { rotation: value });
                }}
                min={-360}
                max={360}
                step={1}
                className="h-8 text-sm"
              />
            </div>

            {/* Color Pickers */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-600 mb-1 block">{t('propertyPanel.fill')}</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={fillColor.startsWith('#') ? fillColor : '#3b82f6'}
                    onChange={(e) => {
                      setFillColor(e.target.value);
                      onUpdateShape(shape.id, { color: e.target.value });
                    }}
                    className="w-8 h-8 rounded border border-gray-200 cursor-pointer"
                  />
                  <Input
                    value={fillColor}
                    onChange={(e) => {
                      setFillColor(e.target.value);
                      onUpdateShape(shape.id, { color: e.target.value });
                    }}
                    className="h-8 text-xs font-mono flex-1"
                    placeholder="#3b82f6"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs text-gray-600 mb-1 block">{t('propertyPanel.stroke')}</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={strokeColor.startsWith('#') ? strokeColor : '#1e40af'}
                    onChange={(e) => {
                      setStrokeColor(e.target.value);
                      onUpdateShape(shape.id, { strokeColor: e.target.value });
                    }}
                    className="w-8 h-8 rounded border border-gray-200 cursor-pointer"
                  />
                  <Input
                    value={strokeColor}
                    onChange={(e) => {
                      setStrokeColor(e.target.value);
                      onUpdateShape(shape.id, { strokeColor: e.target.value });
                    }}
                    className="h-8 text-xs font-mono flex-1"
                    placeholder="#1e40af"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <Separator />

        {/* Layer Controls */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Layers className="h-4 w-4 text-gray-600" />
            <Label className="text-sm font-medium text-gray-700">{t('propertyPanel.layerOrder')}</Label>
            <span className="text-xs text-gray-400 ml-auto">z: {shape.zIndex ?? 0}</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                bringToFront(shape.id);
                toast.success(t('propertyPanel.movedToFront'));
              }}
              className="h-9 text-xs gap-1"
            >
              <ChevronsUp className="h-3 w-3" />
              {t('propertyPanel.bringToFront')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                sendToBack(shape.id);
                toast.success(t('propertyPanel.movedToBack'));
              }}
              className="h-9 text-xs gap-1"
            >
              <ChevronsDown className="h-3 w-3" />
              {t('propertyPanel.sendToBack')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                bringForward(shape.id);
                toast.success(t('propertyPanel.movedForward'));
              }}
              className="h-9 text-xs gap-1"
            >
              <ArrowUp className="h-3 w-3" />
              {t('propertyPanel.bringForward')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                sendBackward(shape.id);
                toast.success(t('propertyPanel.movedBackward'));
              }}
              className="h-9 text-xs gap-1"
            >
              <ArrowDown className="h-3 w-3" />
              {t('propertyPanel.sendBackward')}
            </Button>
          </div>
        </div>

        <Separator />

        {/* Notes */}
        <div>
          <Label htmlFor="notes" className="text-sm font-medium text-gray-700">
            {t('propertyPanel.notesTitle')}
          </Label>
          <p className="text-xs text-gray-500 mt-1 mb-2">
            {t('propertyPanel.notesDescription')}
          </p>
          {isEditMode ? (
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('propertyPanel.notesPlaceholder')}
              className="min-h-[120px] resize-y"
            />
          ) : (
            <div className="bg-gray-50 rounded-lg p-3 min-h-[120px]">
              <span className="text-gray-800 whitespace-pre-wrap">
                {notes || t('propertyPanel.noNotes')}
              </span>
            </div>
          )}
          <p className="text-xs text-gray-400 mt-1">
            {t('propertyPanel.autoSaveNote')}
          </p>
        </div>

        <Separator />

        {/* Photos Section */}
        <div>
          <ShapePhotoSection
            shapeId={shape.id}
            projectId={projectId}
            compact={true}
          />
        </div>

        <Separator />

        {/* Comments Section */}
        <div>
          <Label className="text-sm font-medium text-gray-700 mb-3 block">
            {t('propertyPanel.commentsTitle')}
          </Label>
          <CommentsSection
            drawingObjectId={shape.id}
            projectId={projectId}
          />
        </div>

        {/* Footer hint */}
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
          <p className="text-xs text-blue-700">
            <strong>Tips:</strong> {t('propertyPanel.tipDragToMove')}
          </p>
        </div>
      </div>
    </div>
  );
};

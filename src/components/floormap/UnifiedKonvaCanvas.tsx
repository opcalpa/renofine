import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { Stage, Layer, Line, Rect, Circle, Text as KonvaText, Group, Transformer, Path } from 'react-konva';
import { KonvaEventObject } from 'konva/lib/Node';
import Konva from 'konva';
import { useFloorMapStore } from './store';
import { FloorMapShape, ScalePreset, GridPreset, LineCoordinates } from './types';
import { v4 as uuidv4 } from 'uuid';
import { RoomDetailDialog } from './RoomDetailDialog';
import { RoomElevationView } from './RoomElevationView';
import { WallElevationView } from './WallElevationView';
import { NameRoomDialog } from './NameRoomDialog';
import { PropertyPanel } from './PropertyPanel';
import { ZoomControls } from './ZoomControls';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { saveShapesForPlan, loadShapesForPlan } from './utils/plans';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getSymbolComponent, ArchSymbolType, SYMBOL_METADATA } from './SymbolLibrary';
import { getObjectById } from './ObjectRenderer';
import { ObjectShape, ObjectDefinition } from './objectLibraryDefinitions';
import { getTemplateById, placeTemplateShapes, calculateBounds, DEFAULT_TEMPLATES } from './templateDefinitions';
import { getTemplatePlanId } from './utils/objectTemplates';
import { getUnifiedObjectById, UnifiedObjectDefinition } from './objectLibrary';
import { useTranslation } from 'react-i18next';

// Canvas module imports
import { MIN_ZOOM, MAX_ZOOM, getAdminDefaults } from './canvas/constants';
import {
  throttle,
  createUnifiedDragHandlers,
  calculateFitToContent,
  // Scale utilities
  getActiveGridLevels,
  getScaleRepresentation,
  formatDimension,
  getPixelsPerMeter,
  // Snap utilities
  getSnapSize,
  snapToGrid,
  snapDelta,
  getEdgeSnapThreshold,
  collectRoomBBoxes,
  snapRectEdgesToRooms,
  edgeSnapNudge,
  snapDoorToRoomEdge,
  // Shape connection utilities
  findConnectedShapes,
  findNearestWallEndpoint,
  areWallsConnected,
  getConnectedWalls,
} from './canvas/utils';
import { Grid } from './canvas/Grid';
import { CommentBadgesLayer } from './canvas/CommentBadgesLayer';
import { MeasurementOverlay } from './canvas/MeasurementOverlay';
import { SelectionPreviewOverlay } from './canvas/SelectionPreviewOverlay';
import { MultiSelectionBoundsOverlay } from './canvas/MultiSelectionBounds';
import { GhostPreviewOverlay } from './canvas/GhostPreviewOverlay';
import { TextInputDialog, useTextDialog } from './canvas/TextInputDialog';
import { InlineTextEditor } from './canvas/InlineTextEditor';
import { TextHtmlOverlay } from './canvas/TextHtmlOverlay';
import { useCanvasNavigation } from './hooks/useCanvasNavigation';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { cloneShapes, copyShapesToClipboard, PASTE_OFFSET } from './utils/shapeClipboard';
import { generateWallsFromRoom, generateWallsFromRooms } from './utils/roomWalls';
import { findNearestWallForPoint, getWallGeometry, wallRelativeToWorld } from './canvas/utils/wallCoordinates';
import { findNearestWall, projectOntoWall, splitWall } from './utils/wallSnap';
import { snapObjectToWall } from './canvas/utils/viewSync';
import { mapLibraryCategoryToWallCategory, shouldAttachToWall, getDefaultsForCategory } from './canvas/utils/wallObjectDefaults';

// Shape components (extracted for better maintainability)
import {
  WallShape,
  WallGroupOutline,
  WallSnapIndicator,
  RoomShape,
  RectangleShape,
  CircleShape,
  TextShape,
  FreehandShape,
  LibrarySymbolShape,
  ObjectLibraryShape,
  BezierShape,
  WindowLineShape,
  DoorLineShape,
  SlidingDoorLineShape,
  OpeningLineShape,
  ImageShape,
  StickyNoteShape,
  TemplateGroupShape,
  ConnectorShape,
  ConnectorAnchorHandles,
} from './shapes';
import { findNearestConnectableAnchor, isConnectableShape } from './canvas/connectorUtils';
import type { AnchorSide } from './types';
import { ToolContextMenu } from './ToolContextMenu';
import { Tool } from './types';
import { HoverInfoTooltip } from './HoverInfoTooltip';
import { formatMeasurement } from './utils/formatting';
import { CanvasEmptyState } from './CanvasEmptyState';
import { InlineCommentPopover } from '@/components/comments/InlineCommentPopover';
import { MessageCircle } from 'lucide-react';

// Canvas dimensions are now dynamic - read from projectSettings
// Default: 50m × 50m grid + 10m margin = 70m total (configurable in Canvas Settings)

// Dynamic default based on admin settings
const getDefaultWallThickness = () => {
  const { wallThicknessMM } = getAdminDefaults();
  return wallThicknessMM / 10; // Convert mm to pixels at scale
};

// Alias for backward compatibility (used throughout the file)
const formatDim = formatDimension;

// Alias for backward compatibility (findConnectedWalls → findConnectedShapes)
const findConnectedWalls = findConnectedShapes;

// ============================================================================
// MAIN CANVAS COMPONENT
// ============================================================================

interface UnifiedKonvaCanvasProps {
  onRoomCreated?: () => void;
  isReadOnly?: boolean;
  isDemo?: boolean;
  highlightedRoomIds?: string[];
  showPinterest?: boolean;
  simplified?: boolean;
}

export const UnifiedKonvaCanvas: React.FC<UnifiedKonvaCanvasProps> = ({ onRoomCreated, isReadOnly, isDemo, highlightedRoomIds, showPinterest, simplified }) => {
  const { t } = useTranslation();
  const stageRef = useRef<Konva.Stage>(null);
  const shapeRefs = useRef<Map<string, Konva.Node>>(new Map());
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingCanvasImage, setIsUploadingCanvasImage] = useState(false);
  
  // Unified drag system now at module level (top of file)
  // Accessible to all shape components
  
  // Track real-time transform states for multi-select transformations
  const [transformStates, setTransformStates] = useState<Record<string, {
    scaleX: number;
    scaleY: number;
    rotation: number;
    x: number;
    y: number;
  }>>({});
  
  // Navigation state
  // Canvas dimensions — track window size for responsive Stage
  const [stageSize, setStageSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const handleResize = () => setStageSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number } | null>(null);
  // Note: isSpacePressed and isShiftPressed are managed by useKeyboardShortcuts hook
  
  // Touch/pinch zoom state (managed by useCanvasNavigation hook - see below)
  
  // Double-click handling state (simplified like old canvas)
  // Use refs for synchronous access in rapid click sequences
  const lastClickTimeRef = useRef(0);
  const lastClickedShapeIdRef = useRef<string | null>(null);
  // Set when an object is placed on a mousedown so the trailing click (which fires
  // RoomShape.onClick) doesn't then select the room under the cursor — we want the
  // freshly placed object selected instead.
  const justPlacedObjectRef = useRef(false);
  const [isGroupMode, setIsGroupMode] = useState(true); // Start in group mode
  
  // Wall chaining state (for continuous wall drawing like old canvas)
  const [lastWallEndPoint, setLastWallEndPoint] = useState<{ x: number; y: number } | null>(null);
  
  // Drag selection state (box select)
  const [isBoxSelecting, setIsBoxSelecting] = useState(false);
  const [selectionBox, setSelectionBox] = useState<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null);
  const [isExtendingSelection, setIsExtendingSelection] = useState(false); // Shift+drag to add to selection
  
  // PERFORMANCE OPTIMIZATION: Throttled state updater for selection box
  // Limits updates to ~30fps instead of 60-120fps, reducing re-renders by 50-70%
  const throttledSetSelectionBox = useMemo(
    () => throttle((box: { start: { x: number; y: number }; end: { x: number; y: number } } | null) => {
      setSelectionBox(box);
    }, 33), // 33ms = ~30fps (smooth enough for visual feedback, much better performance)
    []
  );
  
  // Room detail dialog state
  const [selectedRoomForDetail, setSelectedRoomForDetail] = useState<string | null>(null);
  const [isRoomDetailOpen, setIsRoomDetailOpen] = useState(false);
  const [roomData, setRoomData] = useState<any>(null);

  // Room elevation view state (room-centric with 4 cardinal directions)
  const [roomElevationShape, setRoomElevationShape] = useState<FloorMapShape | null>(null);
  const [elevationInitialWallId, setElevationInitialWallId] = useState<string | undefined>(undefined);

  // Hover info tooltip state
  const [hoveredShapeId, setHoveredShapeId] = useState<string | null>(null);
  const [hoverMousePosition, setHoverMousePosition] = useState<{ x: number; y: number } | null>(null);

  // Connector anchor drag: tracks which shape+side the drag started from
  const connectorStartRef = useRef<{ shapeId: string; anchor: AnchorSide } | null>(null);

  // Wall elevation view state (shows combined collinear walls)
  const [wallElevationId, setWallElevationId] = useState<string | null>(null);

  // Property panel state (for all object types)
  const [showPropertyPanel, setShowPropertyPanel] = useState(false);
  const [propertyPanelShape, setPropertyPanelShape] = useState<FloorMapShape | null>(null);
  
  // Pending room creation (before naming)
  const [pendingRoom, setPendingRoom] = useState<{ points: { x: number; y: number }[] } | null>(null);
  const [isNameRoomDialogOpen, setIsNameRoomDialogOpen] = useState(false);
  const [selectedShapeForNaming, setSelectedShapeForNaming] = useState<string | null>(null);
  
  // Clipboard for copy/paste
  const [clipboard, setClipboard] = useState<FloorMapShape[]>([]);
  
  // Wall unit selection mode (for nested interaction)
  const [selectedWallUnit, setSelectedWallUnit] = useState<string[] | null>(null); // IDs of connected walls
  const [wallSelectionMode, setWallSelectionMode] = useState<'unit' | 'segment'>('unit');

  // Template group individual shape selection (double-click to select single shape in group)
  const [selectedGroupIndividualId, setSelectedGroupIndividualId] = useState<string | null>(null);

  // Text input dialog (using extracted hook)
  const textDialog = useTextDialog();

  // Context menu state (right-click)
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [recentTools, setRecentTools] = useState<Tool[]>(['wall', 'room', 'select']);

  // Comments state for floor plan objects
  const [activeComment, setActiveComment] = useState<{ objectId: string; position: { x: number; y: number } } | null>(null);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [resolvedStatus, setResolvedStatus] = useState<Record<string, boolean>>({});

  // Measurement tool state
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [measureStart, setMeasureStart] = useState<{ x: number; y: number } | null>(null);
  const [measureEnd, setMeasureEnd] = useState<{ x: number; y: number } | null>(null);

  // CAD-style numeric input state (type exact length during wall drawing)
  const [numericInput, setNumericInput] = useState<string>('');
  const [showNumericInput, setShowNumericInput] = useState(false);
  const currentMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Note: initializedViewForPlanId is now stored in Zustand store (not a ref)
  // This allows it to survive component unmounts when switching between floor/elevation views

  // Ghost preview state for stamp placement mode (library objects/symbols)
  // Shows a preview following the cursor with auto-rotation towards nearest wall
  const [ghostPreview, setGhostPreview] = useState<{
    x: number;
    y: number;
    rotation: number; // Degrees, auto-calculated from nearest wall
    nearWall: boolean; // True if snapped to a wall
  } | null>(null);

  // Handle context menu (right-click)
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenuPos(null);
  }, []);

  // Cleanup throttled function on unmount
  useEffect(() => {
    return () => {
      throttledSetSelectionBox.cancel();
    };
  }, [throttledSetSelectionBox]);

  // Fetch room data when room is selected for detail
  useEffect(() => {
    if (selectedRoomForDetail && isRoomDetailOpen) {
      const fetchRoomData = async () => {
        const { data, error } = await supabase
          .from('rooms')
          .select('*')
          .eq('id', selectedRoomForDetail)
          .single();

        if (error) {
          console.error('Failed to fetch room data:', error);
          toast.error('Kunde inte ladda rumsdata');
          setIsRoomDetailOpen(false);
          setSelectedRoomForDetail(null);
          return;
        }

        if (data) {
          setRoomData(data);
        }
      };
      fetchRoomData();
    }
  }, [selectedRoomForDetail, isRoomDetailOpen]);
  
  // PERFORMANCE: Optimized Zustand selectors - only subscribe to what we need
  // This prevents unnecessary re-renders when unrelated store values change
  const shapes = useFloorMapStore((state) => state.shapes);
  const currentPlanId = useFloorMapStore((state) => state.currentPlanId);
  const currentProjectId = useFloorMapStore((state) => state.currentProjectId);
  const viewState = useFloorMapStore((state) => state.viewState);
  const gridSettings = useFloorMapStore((state) => state.gridSettings);
  const scaleSettings = useFloorMapStore((state) => state.scaleSettings);
  const projectSettings = useFloorMapStore((state) => state.projectSettings);
  const activeTool = useFloorMapStore((state) => state.activeTool);
  const selectedShapeId = useFloorMapStore((state) => state.selectedShapeId);
  const selectedShapeIds = useFloorMapStore((state) => state.selectedShapeIds);
  const isDrawing = useFloorMapStore((state) => state.isDrawing);
  const currentDrawingPoints = useFloorMapStore((state) => state.currentDrawingPoints);
  const pendingLibrarySymbol = useFloorMapStore((state) => state.pendingLibrarySymbol);
  const pendingObjectId = useFloorMapStore((state) => state.pendingObjectId);
  const pendingTemplateId = useFloorMapStore((state) => state.pendingTemplateId);
  const pendingRoomPlacement = useFloorMapStore((state) => state.pendingRoomPlacement);
  const initializedViewForPlanId = useFloorMapStore((state) => state.initializedViewForPlanId);
  const wallSnapPreview = useFloorMapStore((state) => state.wallSnapPreview);

  // Actions (don't cause re-renders)
  const setViewState = useFloorMapStore((state) => state.setViewState);
  const setCurrentPlanId = useFloorMapStore((state) => state.setCurrentPlanId);
  const setSelectedShapeId = useFloorMapStore((state) => state.setSelectedShapeId);
  const setSelectedShapeIds = useFloorMapStore((state) => state.setSelectedShapeIds);
  const setShapes = useFloorMapStore((state) => state.setShapes);
  const setSimplified = useFloorMapStore((state) => state.setSimplified);
  const updateShape = useFloorMapStore((state) => state.updateShape);
  const updateShapes = useFloorMapStore((state) => state.updateShapes);
  const addShape = useFloorMapStore((state) => state.addShape);
  const deleteShape = useFloorMapStore((state) => state.deleteShape);
  const deleteShapes = useFloorMapStore((state) => state.deleteShapes);
  const setIsDrawing = useFloorMapStore((state) => state.setIsDrawing);
  const setCurrentDrawingPoints = useFloorMapStore((state) => state.setCurrentDrawingPoints);
  const addDrawingPoint = useFloorMapStore((state) => state.addDrawingPoint);
  const undo = useFloorMapStore((state) => state.undo);
  const redo = useFloorMapStore((state) => state.redo);
  const canUndo = useFloorMapStore((state) => state.canUndo);
  const canRedo = useFloorMapStore((state) => state.canRedo);
  const setScalePreset = useFloorMapStore((state) => state.setScalePreset);
  const setGridPreset = useFloorMapStore((state) => state.setGridPreset);
  const setPendingLibrarySymbol = useFloorMapStore((state) => state.setPendingLibrarySymbol);
  const setPendingObjectId = useFloorMapStore((state) => state.setPendingObjectId);
  const setPendingTemplateId = useFloorMapStore((state) => state.setPendingTemplateId);
  const setPendingRoomPlacement = useFloorMapStore((state) => state.setPendingRoomPlacement);
  const setActiveTool = useFloorMapStore((state) => state.setActiveTool);
  const setInitializedViewForPlanId = useFloorMapStore((state) => state.setInitializedViewForPlanId);
  const bringForward = useFloorMapStore((state) => state.bringForward);
  const sendBackward = useFloorMapStore((state) => state.sendBackward);
  const bringToFront = useFloorMapStore((state) => state.bringToFront);
  const sendToBack = useFloorMapStore((state) => state.sendToBack);

  // Canvas navigation hook (wheel zoom, touch pinch-zoom, panning)
  const {
    lastTouchDistance,
    lastTouchCenter,
    setLastTouchDistance,
    setLastTouchCenter,
    touchPanStartRef,
    constrainPan,
    handleWheel,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  } = useCanvasNavigation({
    stageRef,
    canvasWidthMeters: projectSettings.canvasWidthMeters,
    canvasHeightMeters: projectSettings.canvasHeightMeters,
    pixelsPerMm: scaleSettings.pixelsPerMm,
  });

  // Set cursor style based on active tool
  useEffect(() => {
    const container = stageRef.current?.container();
    if (!container) return;

    const drawingTools = ['wall', 'door_line', 'window_line', 'sliding_door_line', 'opening_line', 'line', 'freehand', 'rectangle', 'circle', 'text', 'sticky_note', 'room', 'bezier', 'measure', 'connector'];

    if (drawingTools.includes(activeTool)) {
      container.style.cursor = 'crosshair';
    } else if (activeTool === 'pan') {
      container.style.cursor = 'grab';
    } else {
      container.style.cursor = 'default';
    }

    return () => {
      if (container) container.style.cursor = 'default';
    };
  }, [activeTool]);

  // Handle starting a connector from an anchor dot on a shape
  const handleAnchorMouseDown = useCallback(
    (shapeId: string, anchor: AnchorSide, worldX: number, worldY: number) => {
      connectorStartRef.current = { shapeId, anchor };
      setActiveTool('connector');
      setIsBoxSelecting(true);
      setSelectionBox({ start: { x: worldX, y: worldY }, end: { x: worldX, y: worldY } });
    },
    [setActiveTool],
  );

  // Handle opening comments popover for a shape
  const handleOpenComments = useCallback((objectId?: string, screenX?: number, screenY?: number) => {
    // Use provided objectId or fall back to first selected shape
    const targetId = objectId || (selectedShapeIds.length > 0 ? selectedShapeIds[0] : null);
    if (!targetId) return;

    // Use provided position or context menu position or default
    const x = screenX ?? contextMenuPos?.x ?? 200;
    const y = screenY ?? contextMenuPos?.y ?? 200;
    setActiveComment({ objectId: targetId, position: { x, y } });
    setContextMenuPos(null);
  }, [selectedShapeIds, contextMenuPos]);

  // Handle closing comments popover
  const handleCloseComments = useCallback(() => {
    setActiveComment(null);
  }, []);

  // Handle comment count change from popover
  const handleCommentCountChange = useCallback((objectId: string, count: number) => {
    setCommentCounts(prev => ({ ...prev, [objectId]: count }));
  }, []);

  // Handle resolved state change from popover
  const handleResolvedChange = useCallback((objectId: string, isResolved: boolean) => {
    setResolvedStatus(prev => ({ ...prev, [objectId]: isResolved }));
  }, []);

  // Clear measurement when tool changes
  useEffect(() => {
    if (activeTool !== 'measure') {
      setMeasureStart(null);
      setMeasureEnd(null);
    }
    // Clear CAD numeric input when tool changes
    setNumericInput('');
    setShowNumericInput(false);
  }, [activeTool]);

  // Track tool changes to update recent tools (for context menu)
  useEffect(() => {
    if (activeTool && activeTool !== 'select') {
      setRecentTools(prev => {
        const filtered = prev.filter(t => t !== activeTool);
        return [activeTool, ...filtered].slice(0, 5);
      });
    }
  }, [activeTool]);

  // Calculate canvas dimensions from settings (in pixels)
  // SIMPLIFIED: Canvas = Working area (no margin)
  const CANVAS_WIDTH = useMemo(() => {
    return projectSettings.canvasWidthMeters * 1000 * scaleSettings.pixelsPerMm;
  }, [projectSettings.canvasWidthMeters, scaleSettings.pixelsPerMm]);
  
  const CANVAS_HEIGHT = useMemo(() => {
    return projectSettings.canvasHeightMeters * 1000 * scaleSettings.pixelsPerMm;
  }, [projectSettings.canvasHeightMeters, scaleSettings.pixelsPerMm]);
  
  // Filter shapes for current plan (excluding elevation-only shapes)
  const currentShapes = useMemo(
    () => shapes.filter(shape =>
      shape.planId === currentPlanId &&
      shape.shapeViewMode !== 'elevation' // Exclude elevation-only shapes from floor plan view
    ),
    [shapes, currentPlanId]
  );

  // Stable reference to shape IDs for fetching comments
  const shapeIdsKey = useMemo(() => currentShapes.map(s => s.id).join(','), [currentShapes]);

  // Fetch comment counts and resolved status for all shapes on canvas
  useEffect(() => {
    const fetchCommentData = async () => {
      const shapeIds = shapeIdsKey.split(',').filter(Boolean);
      if (shapeIds.length === 0) return;

      try {
        // Try fetching with is_resolved (new schema)
        let result = await supabase
          .from('comments')
          .select('drawing_object_id, is_resolved')
          .in('drawing_object_id', shapeIds);

        // Fallback if is_resolved column doesn't exist
        if (result.error?.code === '42703') {
          result = await supabase
            .from('comments')
            .select('drawing_object_id')
            .in('drawing_object_id', shapeIds);
        }

        if (result.error) {
          console.error('Error fetching comment data:', result.error);
          return;
        }

        const counts: Record<string, number> = {};
        const resolved: Record<string, boolean> = {};

        result.data?.forEach((row: { drawing_object_id: string | null; is_resolved?: boolean }) => {
          if (row.drawing_object_id) {
            counts[row.drawing_object_id] = (counts[row.drawing_object_id] || 0) + 1;
            if (row.is_resolved) {
              resolved[row.drawing_object_id] = true;
            }
          }
        });

        setCommentCounts(counts);
        setResolvedStatus(resolved);
      } catch (err) {
        console.error('Error fetching comment data:', err);
      }
    };

    fetchCommentData();
  }, [shapeIdsKey]);

  // Separate shapes into template groups and individual shapes
  const { templateGroups, individualShapes } = useMemo(() => {
    const groups: Map<string, { shapes: FloorMapShape[]; leader: FloorMapShape }> = new Map();
    const individual: FloorMapShape[] = [];

    for (const shape of currentShapes) {
      if (shape.groupId) {
        // This shape belongs to a template group
        const existing = groups.get(shape.groupId);
        if (existing) {
          existing.shapes.push(shape);
          // Update leader if this shape is the group leader
          if (shape.isGroupLeader) {
            existing.leader = shape;
          }
        } else {
          groups.set(shape.groupId, {
            shapes: [shape],
            leader: shape.isGroupLeader ? shape : shape, // Fallback to first shape
          });
        }
      } else {
        // Individual shape (not part of a group)
        individual.push(shape);
      }
    }

    return {
      templateGroups: Array.from(groups.entries()).map(([groupId, data]) => ({
        groupId,
        shapes: data.shapes,
        leader: data.leader,
      })),
      individualShapes: individual,
    };
  }, [currentShapes]);

  // Inline text editing state (WYSIWYG on canvas)
  const [inlineEditShape, setInlineEditShape] = useState<FloorMapShape | null>(null);

  // Handle double-click to edit text — opens inline editor on canvas
  const handleTextEdit = useCallback((shape: FloorMapShape) => {
    if (shape.type === 'text' || shape.type === 'sticky_note') {
      setInlineEditShape(shape);
    } else {
      textDialog.openForEdit(shape);
    }
  }, [textDialog]);
  
  // Manual save function (exposed to toolbar)
  const handleManualSave = useCallback(async () => {
    if (!currentPlanId) {
      toast.error('Ingen plan vald');
      return false;
    }
    
    // Manual save
    const success = await saveShapesForPlan(currentPlanId, shapes);
    if (success) {
      toast.success('Ritning sparad!');
    } else {
      toast.error('Kunde inte spara ritningen');
    }
    return success;
  }, [currentPlanId, shapes]);
  
  // Core image upload — takes a File, uploads to storage, places at viewport center
  const uploadImageToCanvas = useCallback(async (file: File) => {
    if (!currentPlanId) return;
    setIsUploadingCanvasImage(true);
    try {
      const projectId = useFloorMapStore.getState().currentProjectId;
      const filePath = `projects/${projectId}/Uppladdade filer/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from('project-files').upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('project-files').getPublicUrl(filePath);

      // Place at center of visible viewport
      const { viewState } = useFloorMapStore.getState();
      const cx = (window.innerWidth / 2 - viewState.panX) / viewState.zoom;
      const cy = (window.innerHeight / 2 - viewState.panY) / viewState.zoom;

      const imageShape: FloorMapShape = {
        id: uuidv4(),
        type: 'image',
        planId: currentPlanId,
        coordinates: { x: cx, y: cy, width: 0, height: 0 },
        imageUrl: publicUrl,
        imageOpacity: 0.5,
        locked: false,
        zIndex: -100,
        name: file.name,
      };
      addShape(imageShape);
      toast.success(`"${file.name}" tillagd på canvas`);
    } catch (err) {
      console.error('Image upload failed:', err);
      toast.error('Kunde inte ladda upp bilden');
    } finally {
      setIsUploadingCanvasImage(false);
      if (imageFileInputRef.current) imageFileInputRef.current.value = '';
    }
  }, [currentPlanId, addShape]);

  // File input handler (from hidden input or context menu)
  const handleCanvasImageImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Vänligen välj en bildfil'); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error('Max 10MB'); return; }
    await uploadImageToCanvas(file);
  }, [uploadImageToCanvas]);

  // Expose functions to window for toolbar
  useEffect(() => {
    (window as any).__canvasSave = handleManualSave;
    (window as any).__canvasUndo = undo;
    (window as any).__canvasRedo = redo;
    (window as any).__canvasCanUndo = canUndo();
    (window as any).__canvasCanRedo = canRedo();
    
    return () => {
      delete (window as any).__canvasSave;
      delete (window as any).__canvasUndo;
      delete (window as any).__canvasRedo;
      delete (window as any).__canvasCanUndo;
      delete (window as any).__canvasCanRedo;
    };
  }, [handleManualSave, undo, redo, canUndo, canRedo]);
  
  // Update undo/redo state in window and dispatch event (for toolbar state)
  useEffect(() => {
    const canUndoVal = canUndo();
    const canRedoVal = canRedo();
    (window as any).__canvasCanUndo = canUndoVal;
    (window as any).__canvasCanRedo = canRedoVal;
    // Dispatch event for FloorMapEditor to listen to (replaces polling)
    window.dispatchEvent(new CustomEvent('canvasUndoRedoStateChange', {
      detail: { canUndo: canUndoVal, canRedo: canRedoVal }
    }));
  }, [canUndo, canRedo, shapes]);
  
  // Load shapes when plan changes, then apply initial view
  // Note: This effect should only reset view on FIRST load of a plan, not when re-rendering
  useEffect(() => {
    if (!currentPlanId) {
      // No plan selected, clear shapes
      setShapes([]);
      setInitializedViewForPlanId(null);
      return;
    }

    // Capture whether we've already initialized at the START of the effect
    // This prevents race conditions with async operations
    // Note: Using store value instead of ref so it survives component unmount
    const wasAlreadyInitialized = initializedViewForPlanId === currentPlanId;

    const loadShapes = async () => {
      const loadedShapes = await loadShapesForPlan(currentPlanId);

      // Load room names from rooms table for room shapes
      let finalShapes = loadedShapes;
      const roomShapes = loadedShapes.filter(s => s.type === 'room' && s.roomId);
      if (roomShapes.length > 0 && currentProjectId) {
        try {
          const roomIds = roomShapes.map(s => s.roomId).filter(Boolean);
          const { data: rooms, error } = await supabase
            .from('rooms')
            .select('id, name, color')
            .in('id', roomIds);

          if (!error && rooms) {
            // Map room names and colors to shapes
            finalShapes = loadedShapes.map(shape => {
              if (shape.type === 'room' && shape.roomId) {
                const room = rooms.find(r => r.id === shape.roomId);
                if (room) {
                  // Helper to get darker color for stroke
                  const getDarkerColor = (rgbaColor: string): string => {
                    const match = rgbaColor?.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
                    if (match) {
                      const r = Math.floor(parseInt(match[1]) * 0.7);
                      const g = Math.floor(parseInt(match[2]) * 0.7);
                      const b = Math.floor(parseInt(match[3]) * 0.7);
                      return `rgba(${r}, ${g}, ${b}, 0.8)`;
                    }
                    return rgbaColor || 'rgba(41, 91, 172, 0.8)';
                  };

                  return {
                    ...shape,
                    name: room.name,
                    color: room.color || shape.color || 'rgba(59, 130, 246, 0.2)',
                    strokeColor: getDarkerColor(room.color || shape.color || 'rgba(59, 130, 246, 0.2)')
                  };
                }
              }
              return shape;
            });
          }
        } catch (error) {
          console.error('Error loading room data:', error);
        }
      }

      setShapes(finalShapes);

      // Check if AI import has centering instructions (always apply these, even if initialized)
      const aiCenterView = (window as any).__aiImportCenterView;
      if (aiCenterView) {
        setInitializedViewForPlanId(currentPlanId);
        setTimeout(() => {
          setViewState({
            zoom: aiCenterView.zoom,
            panX: aiCenterView.panX,
            panY: aiCenterView.panY,
          });
          delete (window as any).__aiImportCenterView;
          toast.success('Canvas centrerad på AI-importerade objekt');
        }, 800);
        return;
      }

      // Only apply initial view on first load for this plan
      // This prevents view reset when returning from elevation view, room detail, etc.
      // Use the captured flag from the START of the effect to avoid race conditions
      if (wasAlreadyInitialized) {
        // Already initialized for this plan - keep current view, don't reset
        return;
      }

      // Mark as initialized BEFORE setting view to prevent race conditions
      setInitializedViewForPlanId(currentPlanId);

      // Apply initial view: saved starting view → auto-fit → default center
      const plans = useFloorMapStore.getState().plans;
      const currentPlan = plans.find(p => p.id === currentPlanId);
      const savedView = currentPlan?.viewSettings?.startingView;

      if (savedView) {
        setViewState({ panX: savedView.panX, panY: savedView.panY, zoom: savedView.zoom });
      } else {
        const fitView = calculateFitToContent(
          finalShapes,
          window.innerWidth,
          window.innerHeight - 70
        );
        if (fitView) {
          setViewState(fitView);
        } else {
          setViewState({ panX: 0, panY: 0, zoom: 1 });
        }
      }
    };

    loadShapes();
  }, [currentPlanId, currentProjectId, setShapes, initializedViewForPlanId, setInitializedViewForPlanId]);

  // Mirror the simplified (homeowner) flag into the store so non-React helpers
  // (e.g. the drag system) can branch on Model A behaviour.
  useEffect(() => {
    setSimplified(!!simplified);
  }, [simplified, setSimplified]);

  // Auto-save shapes to database when they change (skip for read-only and demo)
  useEffect(() => {
    if (!currentPlanId || isReadOnly || isDemo) {
      return;
    }

    // Debounce the save to avoid excessive database writes
    const saveTimer = setTimeout(async () => {
      await saveShapesForPlan(currentPlanId, shapes);
    }, 2000); // Wait 2 seconds after last change before saving

    return () => clearTimeout(saveTimer);
  }, [shapes, currentPlanId, isReadOnly, isDemo]);
  
  // Save room to database and get roomId
  const saveRoomToDB = useCallback(async (roomShape: FloorMapShape) => {
    if (!currentProjectId) return null;
    
    try {
      const coords = roomShape.coordinates as any;
      const points = coords.points || [];
      
      // Calculate area (simple polygon area)
      let area = 0;
      for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        area += points[i].x * points[j].y;
        area -= points[j].x * points[i].y;
      }
      area = Math.abs(area / 2);
      const areaSqM = area / (getPixelsPerMeter(scaleSettings.pixelsPerMm) ** 2);
      
      // Calculate perimeter
      let perimeter = 0;
      for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        const dx = points[j].x - points[i].x;
        const dy = points[j].y - points[i].y;
        perimeter += Math.sqrt(dx * dx + dy * dy);
      }
      
      const { data, error } = await supabase
        .from("rooms")
        .insert({
          project_id: currentProjectId,
          name: roomShape.name || `Rum ${new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}`,
          description: null,
          dimensions: {
            area_sqm: areaSqM,
            // perimeter is summed in pixels above — convert to mm (matches roomInsights.ts)
            perimeter_mm: (perimeter / getPixelsPerMeter(scaleSettings.pixelsPerMm)) * 1000,
          },
          floor_plan_position: {
            points: points,
          },
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Update the shape with the database room ID
      updateShape(roomShape.id, { roomId: data.id, name: data.name });
      
      toast.success("Rum sparat!");
      
      // Notify parent component to refresh room list
      if (onRoomCreated) {
        onRoomCreated();
      }
      
      return data.id;
    } catch (error: unknown) {
      console.error("Error saving room:", error);
      toast.error("Kunde inte spara rum");
      return null;
    }
  }, [currentProjectId, scaleSettings.pixelsPerMm, updateShape]);
  
  // Reset wall chaining when tool changes
  useEffect(() => {
    if (activeTool !== 'wall') {
      setLastWallEndPoint(null);
    }
  }, [activeTool]);
  
  // Keyboard shortcuts hook (handles all keyboard interactions)
  const { isSpacePressed, isShiftPressed, confirmWallWithLengthRef } = useKeyboardShortcuts({
    isReadOnly: isReadOnly ?? false,
    undo,
    redo,
    canUndo,
    canRedo,
    addShape,
    deleteShape,
    deleteShapes,
    setSelectedShapeId,
    setSelectedShapeIds,
    selectedShapeId,
    selectedShapeIds,
    currentShapes,
    clipboard,
    setClipboard,
    currentPlanId,
    setActiveTool,
    isDrawing,
    setIsDrawing,
    currentDrawingPoints,
    setCurrentDrawingPoints,
    activeTool,
    numericInput,
    setNumericInput,
    setShowNumericInput,
    setLastWallEndPoint,
    setGhostPreview,
  });
  
  // Handle shape click - SIMPLIFIED double-click detection (like old canvas)
  const handleShapeClick = useCallback(async (shapeId: string, shapeType: string, evt?: KonvaEventObject<MouseEvent>) => {
    // Get fresh activeTool to avoid stale closures
    const { activeTool: currentTool } = useFloorMapStore.getState();

    // MEASURE TOOL - don't select shapes, let stage handler start measuring
    if (currentTool === 'measure') {
      // Don't cancel bubble - let the click pass through to stage for measuring
      return;
    }

    // ERASER TOOL - delete shape immediately (before any other logic)
    if (activeTool === 'eraser') {
      deleteShape(shapeId);
      toast.success('Objekt raderat');
      return; // Stop here, don't select or open panels
    }

    // OBJECT PLACEMENT MODE - don't select shapes, let stage handler place the object
    const { pendingObjectId, pendingLibrarySymbol } = useFloorMapStore.getState();
    if (pendingObjectId || pendingLibrarySymbol) {
      return; // Skip selection during placement mode
    }

    // An object was just placed on this gesture's mousedown; the trailing click
    // must not re-select the room under the cursor — keep the new object selected.
    if (justPlacedObjectRef.current) {
      justPlacedObjectRef.current = false;
      return;
    }

    // SCISSORS TOOL - split wall/line at click point
    if (activeTool === 'scissors') {
      const shape = currentShapes.find(s => s.id === shapeId);
      if (!shape || (shape.type !== 'wall' && shape.type !== 'line')) {
        toast.error('Välj en vägg att klippa');
        return;
      }
      
      const stage = stageRef.current;
      if (!stage) return;
      
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      
      // Transform to world coordinates
      const clickPoint = {
        x: (pointer.x - viewState.panX) / viewState.zoom,
        y: (pointer.y - viewState.panY) / viewState.zoom,
      };
      
      const coords = shape.coordinates as any;
      
      // Calculate closest point on line to click
      const dx = coords.x2 - coords.x1;
      const dy = coords.y2 - coords.y1;
      const length = Math.sqrt(dx * dx + dy * dy);
      
      if (length < 10) {
        toast.error('Väggen är för kort för att klippas');
        return;
      }
      
      // Project click point onto line
      const t = Math.max(0.1, Math.min(0.9, 
        ((clickPoint.x - coords.x1) * dx + (clickPoint.y - coords.y1) * dy) / (length * length)
      ));
      
      let splitX = coords.x1 + dx * t;
      let splitY = coords.y1 + dy * t;
      
      // SNAP SPLIT POINT TO GRID (use user's grid interval setting)
      const currentSnapSize = getSnapSize(viewState.zoom, scaleSettings.pixelsPerMm, true, projectSettings.gridInterval);
      // Use projectSettings for snap control
      if (projectSettings.snapEnabled) {
        const snappedPoint = snapToGrid({ x: splitX, y: splitY }, currentSnapSize, true);
        splitX = snappedPoint.x;
        splitY = snappedPoint.y;
        
        // Verify split point is not too close to endpoints after snapping
        const distToStart = Math.sqrt(Math.pow(splitX - coords.x1, 2) + Math.pow(splitY - coords.y1, 2));
        const distToEnd = Math.sqrt(Math.pow(splitX - coords.x2, 2) + Math.pow(splitY - coords.y2, 2));
        const minDist = currentSnapSize; // At least one grid unit from each end
        
        if (distToStart < minDist || distToEnd < minDist) {
          toast.error('Klipp-punkten är för nära väggens ändar efter snap till grid');
          return;
        }
      }
      
      // Create two new walls
      const wall1: FloorMapShape = {
        ...shape,
        id: uuidv4(),
        coordinates: {
          x1: coords.x1,
          y1: coords.y1,
          x2: splitX,
          y2: splitY,
        }
      };
      
      const wall2: FloorMapShape = {
        ...shape,
        id: uuidv4(),
        coordinates: {
          x1: splitX,
          y1: splitY,
          x2: coords.x2,
          y2: coords.y2,
        }
      };
      
      // Delete original and add two new
      deleteShape(shapeId);
      addShape(wall1);
      addShape(wall2);
      
      toast.success('Vägg klippt i två delar');
      return;
    }
    
    // GLUE TOOL - merge two connected walls
    if (activeTool === 'glue') {
      const shape = currentShapes.find(s => s.id === shapeId);
      if (!shape || (shape.type !== 'wall' && shape.type !== 'line')) {
        toast.error('Välj en vägg att limma');
        return;
      }
      
      const coords1 = shape.coordinates as any;
      const tolerance = 10; // pixels
      
      // Find walls connected to this one
      const connectedWalls = currentShapes.filter(s => {
        if (s.id === shape.id || (s.type !== 'wall' && s.type !== 'line')) return false;
        
        const coords2 = s.coordinates as any;
        
        // Check if walls are aligned (same direction)
        const dx1 = coords1.x2 - coords1.x1;
        const dy1 = coords1.y2 - coords1.y1;
        const dx2 = coords2.x2 - coords2.x1;
        const dy2 = coords2.y2 - coords2.y1;
        
        const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
        const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
        
        if (len1 === 0 || len2 === 0) return false;
        
        // Normalized vectors
        const ndx1 = dx1 / len1;
        const ndy1 = dy1 / len1;
        const ndx2 = dx2 / len2;
        const ndy2 = dy2 / len2;
        
        // Check if parallel (dot product close to 1 or -1)
        const dot = Math.abs(ndx1 * ndx2 + ndy1 * ndy2);
        if (dot < 0.95) return false; // Not aligned
        
        // Check if connected at endpoints
        const dist = (p1: {x: number, y: number}, p2: {x: number, y: number}) => 
          Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
        
        return (
          dist({x: coords1.x2, y: coords1.y2}, {x: coords2.x1, y: coords2.y1}) < tolerance ||
          dist({x: coords1.x1, y: coords1.y1}, {x: coords2.x2, y: coords2.y2}) < tolerance
        );
      });
      
      if (connectedWalls.length === 0) {
        toast.error('Ingen vägg att limma ihop med (väggar måste vara parallella och anslutna)');
        return;
      }
      
      // Merge with first connected wall
      const wall2 = connectedWalls[0];
      const coords2 = wall2.coordinates as any;
      
      // Determine merged wall endpoints
      let newX1, newY1, newX2, newY2;
      
      const dist = (p1: {x: number, y: number}, p2: {x: number, y: number}) => 
        Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
      
      if (dist({x: coords1.x2, y: coords1.y2}, {x: coords2.x1, y: coords2.y1}) < tolerance) {
        // wall1.end connects to wall2.start
        newX1 = coords1.x1;
        newY1 = coords1.y1;
        newX2 = coords2.x2;
        newY2 = coords2.y2;
      } else {
        // wall1.start connects to wall2.end
        newX1 = coords2.x1;
        newY1 = coords2.y1;
        newX2 = coords1.x2;
        newY2 = coords1.y2;
      }
      
      // Create merged wall
      const mergedWall: FloorMapShape = {
        ...shape,
        id: uuidv4(),
        coordinates: {
          x1: newX1,
          y1: newY1,
          x2: newX2,
          y2: newY2,
        }
      };
      
      // Delete both original walls and add merged
      deleteShape(shape.id);
      deleteShape(wall2.id);
      addShape(mergedWall);
      
      toast.success('Väggar limmade ihop');
      return;
    }
    
    const now = Date.now();
    const timeSinceLastClick = now - lastClickTimeRef.current;
    const currentlySelected = useFloorMapStore.getState().selectedShapeIds;

    // Double-click detection:
    // - For walls: count as double-click if clicking any wall in the selected group
    // - For other shapes: must be the same shape
    const isWallType = shapeType === 'wall' || shapeType === 'line';
    const isDoubleClickOnSameShape = timeSinceLastClick < 500 && lastClickedShapeIdRef.current === shapeId;
    const isDoubleClickOnSelectedWall = isWallType && timeSinceLastClick < 500 && currentlySelected.includes(shapeId);
    const isDoubleClick = isDoubleClickOnSameShape || isDoubleClickOnSelectedWall;

    if (isDoubleClick) {
      // DOUBLE-CLICK → Different behavior based on shape type

      const shape = currentShapes.find(s => s.id === shapeId);
      if (!shape) {
        lastClickTimeRef.current = 0;
        lastClickedShapeIdRef.current = null;
        return;
      }

      // Wall-specific 3-step logic: group → individual → property panel
      if (isWallType) {
        if (currentlySelected.length === 1 && currentlySelected[0] === shapeId) {
          // Step 3: Already individually selected → open PropertyPanel
          setSelectedShapeId(shapeId);
          setPropertyPanelShape(shape);
          setShowPropertyPanel(true);
          toast.success('Vägg markerad - Öppnar egenskapspanel');
          lastClickTimeRef.current = 0;
          lastClickedShapeIdRef.current = null;
        } else {
          // Step 2: Drill-in from group → select only this wall
          setSelectedShapeId(shapeId);
          setSelectedShapeIds([shapeId]);
          toast.success('Enskild vägg markerad');
          // Keep lastClick tracking alive for next double-click
          lastClickTimeRef.current = now;
          lastClickedShapeIdRef.current = shapeId;
        }
        return;
      }

      // Non-wall shapes: open detail panel directly
      setSelectedShapeId(shapeId);
      setSelectedShapeIds([shapeId]);

      if (shapeType === 'room' && shape.roomId) {
        setShowPropertyPanel(false);
        setPropertyPanelShape(null);
        setSelectedRoomForDetail(shape.roomId);
        setIsRoomDetailOpen(true);
        toast.success(t('floormap.openingRoomDetails', 'Opening room details'));
      } else if (shapeType === 'sticky_note' || shapeType === 'text') {
        // Skip property panel — onDblClick handler opens inline editor instead
      } else {
        setPropertyPanelShape(shape);
        setShowPropertyPanel(true);
        toast.success(t('floormap.openingPropertyPanel', 'Opening property panel'));
      }

      lastClickTimeRef.current = 0;
      lastClickedShapeIdRef.current = null;
    } else {
      // SINGLE CLICK - Miro-style selection with modifier support

      // Check for modifier keys to enable multi-select
      const isMultiSelect = evt && (evt.evt.ctrlKey || evt.evt.metaKey || evt.evt.shiftKey);

      if (isMultiSelect) {
        // MODIFIER + CLICK: Toggle selection (add/remove from current selection)
        // For walls: include all connected walls in the toggle operation
        const idsToToggle = (shapeType === 'wall' || shapeType === 'line')
          ? getConnectedWalls(shapeId, currentShapes)
          : [shapeId];

        if (currentlySelected.includes(shapeId)) {
          // Remove from selection (remove all connected walls if it's a wall)
          const newIds = currentlySelected.filter(id => !idsToToggle.includes(id));
          setSelectedShapeIds(newIds);
          toast.success(`${idsToToggle.length > 1 ? idsToToggle.length + ' anslutna väggar borttagna' : 'Objekt borttaget'} från markering`);
        } else {
          // Add to selection (add all connected walls if it's a wall)
          const newIds = [...new Set([...currentlySelected, ...idsToToggle])];
          setSelectedShapeIds(newIds);
          toast.success(`${newIds.length} objekt markerade`);
        }
      } else {
        // REGULAR CLICK: Replace selection
        // Check if shape belongs to a group (template object)
        const clickedShape = currentShapes.find(s => s.id === shapeId);
        const groupId = clickedShape?.groupId;

        if (groupId) {
          // GROUPED SHAPE: Select all shapes in the group
          const groupShapeIds = currentShapes
            .filter(s => s.groupId === groupId)
            .map(s => s.id);
          setSelectedShapeIds(groupShapeIds);
          const groupLeader = currentShapes.find(s => s.groupId === groupId && s.isGroupLeader);
          const groupName = groupLeader?.templateInfo?.templateName || 'Grupp';
          toast.success(`${groupName} markerat (${groupShapeIds.length} former)`);
        } else if (shapeType === 'wall' || shapeType === 'line') {
          // For walls: check if this wall is already individually selected
          const isAlreadyIndividuallySelected = currentlySelected.length === 1 && currentlySelected[0] === shapeId;

          if (isAlreadyIndividuallySelected) {
            // Keep individual selection - don't re-select connected walls
            // This allows double-click to work for opening property panel
          } else {
            // Auto-select all connected walls (sharing endpoints)
            const connectedWallIds = getConnectedWalls(shapeId, currentShapes);
            setSelectedShapeIds(connectedWallIds);
            if (connectedWallIds.length > 1) {
              toast.success(`${connectedWallIds.length} anslutna väggar markerade`);
            } else {
              toast.success(`Enskild vägg markerad`);
            }
          }
        } else {
          // Non-wall shapes: select just the one clicked
          setSelectedShapeIds([shapeId]);
          const shapeWord = shapeType === 'room' ? 'rum' : 'objekt';
          toast.success(`Enskilt ${shapeWord} markerat`);
        }
      }

      setSelectedWallUnit(null);
      setWallSelectionMode('unit');

      lastClickTimeRef.current = now;
      lastClickedShapeIdRef.current = shapeId;
    }
  }, [activeTool, deleteShape, addShape, viewState, gridSettings, scaleSettings, currentShapes, saveRoomToDB, setSelectedShapeId, setSelectedShapeIds, selectedShapeIds, setSelectedRoomForDetail, setIsRoomDetailOpen, setPropertyPanelShape, setShowPropertyPanel]);

  // Apply constraints to initial viewport once constrainPan is ready
  useEffect(() => {
    if (viewState.zoom === 1 && viewState.panX === 0 && viewState.panY === 0) {
      const constrained = constrainPan(0, 0, 1);
      if (constrained.panX !== 0 || constrained.panY !== 0) {
        setViewState({ ...constrained, zoom: 1 });
      }
    }
  }, [constrainPan, viewState, setViewState]);

  // Handle mouse down
  const handleMouseDown = useCallback((e: KonvaEventObject<MouseEvent>) => {
    const stage = stageRef.current;
    if (!stage) return;

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    // Get fresh state to avoid stale closures
    const { activeTool: currentTool, viewState: currentViewState } = useFloorMapStore.getState();

    // Transform to canvas coordinates
    let pos = {
      x: (pointer.x - currentViewState.panX) / currentViewState.zoom,
      y: (pointer.y - currentViewState.panY) / currentViewState.zoom,
    };

    // MEASURE TOOL - Always handle first, regardless of what's under cursor
    if (currentTool === 'measure') {
      e.cancelBubble = true;
      setIsMeasuring(true);
      setMeasureStart(pos);
      setMeasureEnd(pos);
      return;
    }

    // CRITICAL: If clicking on a shape, let the shape handle it - don't interfere.
    // EXCEPTION: during object/symbol placement mode a click anywhere — including over a
    // room polygon that fills the canvas — must place the pending object. Without this,
    // click-to-place silently fails wherever a room covers the click point (i.e. exactly
    // where you want to drop outlets/symbols), leaving drag as the only working path.
    const { pendingObjectId: pendingObjForPlacement, pendingLibrarySymbol: pendingSymForPlacement } =
      useFloorMapStore.getState();
    const isPlacingObject = Boolean(pendingObjForPlacement || pendingSymForPlacement);
    const target = e.target;
    const isShape = target !== target.getStage() && (target as any).attrs?.shapeId;
    if (isShape && !isPlacingObject) {
      // Shape will handle its own events - don't interfere
      return;
    }

    // Check for template creation from toolbar
    const templateType = (window as any).__createTemplate;
    if (templateType && currentPlanId) {
      const pixelsPerMeter = getPixelsPerMeter(scaleSettings.pixelsPerMm);
      const adminDefaults = getAdminDefaults();
      
      if (templateType === 'square2x2') {
        // Create 2x2 meter square with WALLS
        const size = 2 * pixelsPerMeter; // 2 meters in pixels
        const halfSize = size / 2;
        
        // Create 4 walls forming a square centered at click position
        const walls = [
          // Top wall
          {
            id: uuidv4(),
            planId: currentPlanId,
            type: 'wall' as const,
            coordinates: {
              x1: pos.x - halfSize,
              y1: pos.y - halfSize,
              x2: pos.x + halfSize,
              y2: pos.y - halfSize,
            },
            strokeColor: '#2d3748',
            thicknessMM: adminDefaults.wallThicknessMM,
            heightMM: adminDefaults.wallHeightMM,
          },
          // Right wall
          {
            id: uuidv4(),
            planId: currentPlanId,
            type: 'wall' as const,
            coordinates: {
              x1: pos.x + halfSize,
              y1: pos.y - halfSize,
              x2: pos.x + halfSize,
              y2: pos.y + halfSize,
            },
            strokeColor: '#2d3748',
            thicknessMM: adminDefaults.wallThicknessMM,
            heightMM: adminDefaults.wallHeightMM,
          },
          // Bottom wall
          {
            id: uuidv4(),
            planId: currentPlanId,
            type: 'wall' as const,
            coordinates: {
              x1: pos.x + halfSize,
              y1: pos.y + halfSize,
              x2: pos.x - halfSize,
              y2: pos.y + halfSize,
            },
            strokeColor: '#2d3748',
            thicknessMM: adminDefaults.wallThicknessMM,
            heightMM: adminDefaults.wallHeightMM,
          },
          // Left wall
          {
            id: uuidv4(),
            planId: currentPlanId,
            type: 'wall' as const,
            coordinates: {
              x1: pos.x - halfSize,
              y1: pos.y + halfSize,
              x2: pos.x - halfSize,
              y2: pos.y - halfSize,
            },
            strokeColor: '#2d3748',
            thicknessMM: adminDefaults.wallThicknessMM,
            heightMM: adminDefaults.wallHeightMM,
          },
        ];

        walls.forEach(wall => addShape(wall));
        toast.success('Fyrkant 2x2m skapad (4 väggar)');
      } else if (templateType === 'circle2m') {
        // Create circle with WALLS (8-sided approximation)
        const radius = 1 * pixelsPerMeter; // 1 meter radius = 2m diameter
        const segments = 8; // 8 walls for smooth circle
        
        const walls = [];
        for (let i = 0; i < segments; i++) {
          const angle1 = (i / segments) * Math.PI * 2;
          const angle2 = ((i + 1) / segments) * Math.PI * 2;
          
          const x1 = pos.x + Math.cos(angle1) * radius;
          const y1 = pos.y + Math.sin(angle1) * radius;
          const x2 = pos.x + Math.cos(angle2) * radius;
          const y2 = pos.y + Math.sin(angle2) * radius;
          
          walls.push({
            id: uuidv4(),
            planId: currentPlanId,
            type: 'wall' as const,
            coordinates: { x1, y1, x2, y2 },
            strokeColor: '#2d3748',
            thicknessMM: adminDefaults.wallThicknessMM,
            heightMM: adminDefaults.wallHeightMM,
          });
        }
        
        walls.forEach(wall => addShape(wall));
        toast.success('Cirkel ⌀2m skapad (8 väggar)');
      } else if (templateType === 'triangle') {
        // Create equilateral triangle with WALLS
        const sideLength = 2 * pixelsPerMeter;
        const height = (Math.sqrt(3) / 2) * sideLength;
        
        // Triangle points centered at click position
        const p1 = { x: pos.x, y: pos.y - height / 2 }; // Top
        const p2 = { x: pos.x - sideLength / 2, y: pos.y + height / 2 }; // Bottom left
        const p3 = { x: pos.x + sideLength / 2, y: pos.y + height / 2 }; // Bottom right
        
        const walls = [
          // Top to bottom-left
          {
            id: uuidv4(),
            planId: currentPlanId,
            type: 'wall' as const,
            coordinates: {
              x1: p1.x,
              y1: p1.y,
              x2: p2.x,
              y2: p2.y,
            },
            strokeColor: '#2d3748',
            thicknessMM: adminDefaults.wallThicknessMM,
            heightMM: adminDefaults.wallHeightMM,
          },
          // Bottom-left to bottom-right
          {
            id: uuidv4(),
            planId: currentPlanId,
            type: 'wall' as const,
            coordinates: {
              x1: p2.x,
              y1: p2.y,
              x2: p3.x,
              y2: p3.y,
            },
            strokeColor: '#2d3748',
            thicknessMM: adminDefaults.wallThicknessMM,
            heightMM: adminDefaults.wallHeightMM,
          },
          // Bottom-right to top
          {
            id: uuidv4(),
            planId: currentPlanId,
            type: 'wall' as const,
            coordinates: {
              x1: p3.x,
              y1: p3.y,
              x2: p1.x,
              y2: p1.y,
            },
            strokeColor: '#2d3748',
            thicknessMM: adminDefaults.wallThicknessMM,
            heightMM: adminDefaults.wallHeightMM,
          },
        ];
        
        walls.forEach(wall => addShape(wall));
        toast.success('Triangel skapad (3 väggar)');
      }
      
      // Clear template flag
      delete (window as any).__createTemplate;
      return;
    }

    // Check for template editor open request
    if ((window as any).__openTemplateEditor && currentProjectId) {
      delete (window as any).__openTemplateEditor;
      
      // Get template plan ID and switch to it
      getTemplatePlanId(currentProjectId).then(templatePlanId => {
        if (templatePlanId) {
          setCurrentPlanId(templatePlanId);
          toast.success('📐 Template-editor öppnad - Redigera dina objekt här!', {
            description: 'Byt tillbaka till din ritning när du är klar',
            duration: 5000,
          });
        } else {
          toast.error('Kunde inte öppna template-editor');
        }
      }).catch(() => {
        toast.error('Kunde inte öppna template-editor');
      });
      return;
    }

    // Check for door object creation from toolbar
    const doorObjectType = (window as any).__createDoorObject;
    const useTemplateSystem = (window as any).__useTemplateSystem;
    
    if (doorObjectType && currentPlanId && currentProjectId) {
      const pixelsPerMeter = getPixelsPerMeter(scaleSettings.pixelsPerMm);
      
      // Handle window (väggöppning) - this activates opening tool
      if (doorObjectType === 'window') {
        // Opening tool is already activated, no need to create object here
        delete (window as any).__createDoorObject;
        delete (window as any).__useTemplateSystem;
        return;
      }
      
      // SIMPLIFIED SYSTEM - Direct object creation with hardcoded geometry
      // No templates needed - objects are directly created as freehand shapes
      
      // Helper to create architectural objects
      const createArchObject = (
        type: string,
        points: { x: number; y: number }[],
        name: string
      ): FloorMapShape => ({
        id: uuidv4(),
        type: 'freehand',
        planId: currentPlanId,
        coordinates: { points },
        strokeColor: '#000000',
        color: '#000000',
        strokeWidth: 2,
        name,
      });
      
      let newShape: FloorMapShape | null = null;
      const scale = 100; // 100 pixels = 1 meter at 1:100
      
      // LINJER - Simple architectural lines
      if (doorObjectType === 'inner_wall') {
        newShape = createArchObject('inner_wall', [
          { x: pos.x - 50, y: pos.y },
          { x: pos.x + 50, y: pos.y }
        ], 'Innervägg');
      } else if (doorObjectType === 'outer_wall') {
        // Double line for outer wall
        addShape(createArchObject('outer_wall_1', [
          { x: pos.x - 50, y: pos.y - 3 },
          { x: pos.x + 50, y: pos.y - 3 }
        ], 'Yttervägg'));
        newShape = createArchObject('outer_wall_2', [
          { x: pos.x - 50, y: pos.y + 3 },
          { x: pos.x + 50, y: pos.y + 3 }
        ], 'Yttervägg');
      } else if (doorObjectType === 'arch_window') {
        newShape = createArchObject('window', [
          { x: pos.x - 40, y: pos.y - 10 },
          { x: pos.x + 40, y: pos.y - 10 },
          { x: pos.x + 40, y: pos.y + 10 },
          { x: pos.x - 40, y: pos.y + 10 },
          { x: pos.x - 40, y: pos.y - 10 }
        ], 'Fönster');
      } else if (doorObjectType === 'door_outward') {
        // Door with swing arc
        const arcPoints = [];
        for (let i = 0; i <= 20; i++) {
          const angle = (i / 20) * (Math.PI / 2);
          arcPoints.push({
            x: pos.x + Math.cos(angle) * 60,
            y: pos.y - Math.sin(angle) * 60
          });
        }
        newShape = createArchObject('door', arcPoints, 'Dörr');
      } else if (doorObjectType === 'sliding_door') {
        newShape = createArchObject('sliding_door', [
          { x: pos.x - 30, y: pos.y - 40 },
          { x: pos.x + 30, y: pos.y - 40 },
          { x: pos.x + 30, y: pos.y + 40 },
          { x: pos.x - 30, y: pos.y + 40 },
          { x: pos.x - 30, y: pos.y - 40 }
        ], 'Skjutdörr');
      } else if (doorObjectType === 'wall_opening') {
        newShape = createArchObject('opening', [
          { x: pos.x - 50, y: pos.y },
          { x: pos.x + 50, y: pos.y }
        ], 'Öppning');
      } else if (doorObjectType === 'half_stairs') {
        newShape = createArchObject('half_stairs', [
          { x: pos.x, y: pos.y },
          { x: pos.x, y: pos.y - 25 },
          { x: pos.x + 25, y: pos.y - 25 },
          { x: pos.x + 25, y: pos.y - 50 },
          { x: pos.x + 50, y: pos.y - 50 },
          { x: pos.x + 50, y: pos.y },
          { x: pos.x, y: pos.y }
        ], 'Halvtrappa');
      }
      
      // OBJEKT - Architectural objects
      else if (doorObjectType === 'spiral_stairs') {
        const points = [];
        for (let i = 0; i <= 32; i++) {
          const angle = (i / 32) * Math.PI * 2;
          points.push({
            x: pos.x + Math.cos(angle) * 50,
            y: pos.y + Math.sin(angle) * 50
          });
        }
        newShape = createArchObject('spiral_stairs', points, 'Spiraltrappa');
      } else if (doorObjectType === 'straight_stairs') {
        newShape = createArchObject('straight_stairs', [
          { x: pos.x - 40, y: pos.y - 60 },
          { x: pos.x + 40, y: pos.y - 60 },
          { x: pos.x + 40, y: pos.y + 60 },
          { x: pos.x - 40, y: pos.y + 60 },
          { x: pos.x - 40, y: pos.y - 60 }
        ], 'Trappa');
      } else if (doorObjectType === 'arch_bathtub') {
        newShape = createArchObject('bathtub', [
          { x: pos.x - 30, y: pos.y - 70 },
          { x: pos.x - 30, y: pos.y + 50 },
          { x: pos.x - 20, y: pos.y + 60 },
          { x: pos.x + 20, y: pos.y + 60 },
          { x: pos.x + 30, y: pos.y + 50 },
          { x: pos.x + 30, y: pos.y - 70 },
          { x: pos.x - 30, y: pos.y - 70 }
        ], 'Badkar');
      } else if (doorObjectType === 'arch_toilet') {
        const points = [];
        for (let i = 0; i <= 24; i++) {
          const angle = (i / 24) * Math.PI * 2;
          points.push({
            x: pos.x + Math.cos(angle) * 20,
            y: pos.y + Math.sin(angle) * 25
          });
        }
        newShape = createArchObject('toilet', points, 'Toalett');
      } else if (doorObjectType === 'arch_sink') {
        newShape = createArchObject('sink', [
          { x: pos.x - 25, y: pos.y - 20 },
          { x: pos.x + 25, y: pos.y - 20 },
          { x: pos.x + 25, y: pos.y + 20 },
          { x: pos.x - 25, y: pos.y + 20 },
          { x: pos.x - 25, y: pos.y - 20 }
        ], 'Handfat');
      } else if (doorObjectType === 'arch_stove') {
        newShape = createArchObject('stove', [
          { x: pos.x - 30, y: pos.y - 30 },
          { x: pos.x + 30, y: pos.y - 30 },
          { x: pos.x + 30, y: pos.y + 30 },
          { x: pos.x - 30, y: pos.y + 30 },
          { x: pos.x - 30, y: pos.y - 30 }
        ], 'Spis');
      } else if (doorObjectType === 'arch_outlet') {
        const points = [];
        for (let i = 0; i <= 20; i++) {
          const angle = (i / 20) * Math.PI * 2;
          points.push({
            x: pos.x + Math.cos(angle) * 12,
            y: pos.y + Math.sin(angle) * 12
          });
        }
        newShape = createArchObject('outlet', points, 'Eluttag');
      } else if (doorObjectType === 'arch_switch') {
        newShape = createArchObject('switch', [
          { x: pos.x - 10, y: pos.y - 10 },
          { x: pos.x + 10, y: pos.y - 10 },
          { x: pos.x + 10, y: pos.y + 10 },
          { x: pos.x - 10, y: pos.y + 10 },
          { x: pos.x - 10, y: pos.y - 10 }
        ], 'Lampknapp');
      } else if (doorObjectType === 'arch_mirror') {
        newShape = createArchObject('mirror', [
          { x: pos.x - 30, y: pos.y - 40 },
          { x: pos.x + 30, y: pos.y - 40 },
          { x: pos.x + 30, y: pos.y + 40 },
          { x: pos.x - 30, y: pos.y + 40 },
          { x: pos.x - 30, y: pos.y - 40 }
        ], 'Spegel');
      }
      
      // Add the shape
      if (newShape) {
        addShape(newShape);
        toast.success(`✨ ${newShape.name} placerad`);
      }
      
      delete (window as any).__createDoorObject;
      delete (window as any).__useTemplateSystem;
      return;
    }
    
    // ============================================================================
    // LIBRARY SYMBOL PLACEMENT - NEW Professional Architectural Objects
    // ============================================================================
    if (pendingLibrarySymbol && currentPlanId) {
      const symbolMetadata = SYMBOL_METADATA.find(s => s.type === pendingLibrarySymbol);

      if (symbolMetadata) {
        // Use ghost preview rotation (auto-calculated from nearest wall) or default to 0
        const placementRotation = ghostPreview?.rotation ?? 0;

        // Create a freehand shape that will render the library symbol
        // We store the symbol type in metadata so it can be rendered correctly
        const newShape: FloorMapShape = {
          id: uuidv4(),
          type: 'freehand',
          planId: currentPlanId,
          coordinates: {
            points: [
              // Placeholder points - the actual rendering is done by the symbol component
              { x: pos.x, y: pos.y },
              { x: pos.x + 1, y: pos.y + 1 }, // Minimal bounding box
            ]
          },
          strokeColor: '#000000',
          color: 'transparent',
          strokeWidth: 2,
          name: symbolMetadata.name,
          metadata: {
            isLibrarySymbol: true,
            symbolType: pendingLibrarySymbol,
            placementX: pos.x,
            placementY: pos.y,
            scale: 1, // Default scale - user can transform after placement
            rotation: placementRotation, // Auto-rotated towards nearest wall
          }
        };

        addShape(newShape);
        toast.success(`✨ ${symbolMetadata.name} placed`);

        // Select the newly placed object (not the room under the cursor)
        justPlacedObjectRef.current = true;
        setSelectedShapeId(newShape.id);
        setSelectedShapeIds([newShape.id]);

        // Clear the pending symbol and ghost preview
        setPendingLibrarySymbol(null);
        setGhostPreview(null);
      }

      return;
    }

    // ============================================================================
    // OBJECT LIBRARY PLACEMENT - JSON-based Architectural Objects
    // ============================================================================
    if (pendingObjectId && currentPlanId) {
      // First check for unified objects (new SVG-based library)
      const unifiedDef = getUnifiedObjectById(pendingObjectId);

      if (unifiedDef) {
        // Use ghost preview rotation (auto-calculated from nearest wall) or default to 0
        const placementRotation = ghostPreview?.rotation ?? 0;

        // Get default elevation values from unified object definition
        const defaultElevation = unifiedDef.wallBehavior.defaultElevationMM;

        // Calculate z-index for the new object (place on top of rooms)
        const maxZIndex = Math.max(
          ...shapes
            .filter(s => s.planId === currentPlanId && s.type !== 'room')
            .map(s => s.zIndex ?? 0),
          99
        );
        const newZIndex = maxZIndex + 1;

        // Create a shape that will render the unified object
        const newShape: FloorMapShape = {
          id: uuidv4(),
          type: 'freehand',
          planId: currentPlanId,
          coordinates: {
            points: [
              { x: pos.x, y: pos.y },
              { x: pos.x + 1, y: pos.y + 1 },
            ]
          },
          strokeColor: '#374151',
          color: 'transparent',
          strokeWidth: 2,
          name: unifiedDef.name,
          objectCategory: unifiedDef.category,
          zIndex: newZIndex,
          metadata: {
            isUnifiedObject: true,
            unifiedObjectId: pendingObjectId,
            placementX: pos.x,
            placementY: pos.y,
            scale: 1,
            rotation: placementRotation,
            elevationHeight: unifiedDef.dimensions.height,
            elevationBottom: defaultElevation,
            depth: unifiedDef.dimensions.depth,
          }
        };

        // If object should attach to walls
        if (unifiedDef.wallBehavior.attachesToWall) {
          const walls = shapes.filter(
            s => s.planId === currentPlanId &&
                 (s.type === 'wall' || s.type === 'line') &&
                 s.shapeViewMode !== 'elevation'
          );

          if (walls.length > 0) {
            const tempShape: FloorMapShape = {
              ...newShape,
              coordinates: {
                x: pos.x,
                y: pos.y,
                width: unifiedDef.dimensions.width * scaleSettings.pixelsPerMm,
                height: unifiedDef.dimensions.depth * scaleSettings.pixelsPerMm,
              }
            };

            const wallSnap = snapObjectToWall(tempShape, walls, 500);

            if (wallSnap) {
              newShape.wallRelative = {
                ...wallSnap.wallRelative!,
                height: unifiedDef.dimensions.height,
                elevationBottom: defaultElevation,
                depth: unifiedDef.dimensions.depth,
              };
              newShape.rotation = wallSnap.rotation;
              if (wallSnap.coordinates && 'x' in wallSnap.coordinates) {
                const snappedCoords = wallSnap.coordinates as { x: number; y: number };
                newShape.metadata!.placementX = snappedCoords.x;
                newShape.metadata!.placementY = snappedCoords.y;
              }
            }
          }
        }

        addShape(newShape);
        toast.success(`${unifiedDef.name} placed${newShape.wallRelative ? ' (wall attached)' : ''}`);

        // Select the newly placed object (not the room under the cursor)
        justPlacedObjectRef.current = true;
        setSelectedShapeId(newShape.id);
        setSelectedShapeIds([newShape.id]);

        setPendingObjectId(null);
        setGhostPreview(null);
        return;
      }

      // Fall back to legacy object library
      const objectDef = getObjectById(pendingObjectId);

      if (objectDef) {
        // Use ghost preview rotation (auto-calculated from nearest wall) or default to 0
        const placementRotation = ghostPreview?.rotation ?? 0;

        // Determine if this object should attach to walls
        const shouldSnap = shouldAttachToWall(
          objectDef.category,
          objectDef.wallMountable,
          objectDef.freestanding
        );

        // Get object category for elevation positioning
        const objectCategory = mapLibraryCategoryToWallCategory(
          objectDef.category,
          objectDef.objectCategory
        );

        // Get default elevation values for this category
        const categoryDefaults = getDefaultsForCategory(objectCategory);

        // Calculate z-index for the new object (place on top of rooms)
        // Rooms typically have zIndex around -100 to 0, so objects start at 100+
        const maxZIndex = Math.max(
          ...shapes
            .filter(s => s.planId === currentPlanId && s.type !== 'room')
            .map(s => s.zIndex ?? 0),
          99 // Minimum base for objects
        );
        const newZIndex = maxZIndex + 1;

        // Create a freehand shape that will render the object library object
        // We store the object ID in metadata so it can be rendered with ObjectRenderer
        const newShape: FloorMapShape = {
          id: uuidv4(),
          type: 'freehand',
          planId: currentPlanId,
          coordinates: {
            points: [
              // Placeholder points - the actual rendering is done by ObjectRenderer
              { x: pos.x, y: pos.y },
              { x: pos.x + 1, y: pos.y + 1 }, // Minimal bounding box
            ]
          },
          strokeColor: '#000000',
          color: 'transparent',
          strokeWidth: 2,
          name: objectDef.name,
          objectCategory: objectCategory,
          zIndex: newZIndex, // Objects always render above rooms
          metadata: {
            isObjectLibrary: true,
            objectId: pendingObjectId,
            placementX: pos.x,
            placementY: pos.y,
            scale: 1, // Default scale - user can transform after placement
            rotation: placementRotation, // Auto-rotated towards nearest wall
            // Store 3D properties from object definition for elevation view
            elevationHeight: objectDef.elevationHeight ?? objectDef.defaultHeight,
            elevationBottom: objectDef.elevationBottom ?? categoryDefaults.elevationBottom,
            depth: objectDef.depth ?? objectDef.defaultHeight,
          }
        };

        // If object should attach to walls, try to snap to nearest wall
        if (shouldSnap) {
          const walls = shapes.filter(
            s => s.planId === currentPlanId &&
                 (s.type === 'wall' || s.type === 'line') &&
                 s.shapeViewMode !== 'elevation'
          );

          if (walls.length > 0) {
            // Create a temporary shape with SymbolCoordinates for snapObjectToWall
            const tempShape: FloorMapShape = {
              ...newShape,
              coordinates: {
                x: pos.x,
                y: pos.y,
                width: objectDef.defaultWidth * scaleSettings.pixelsPerMm,
                height: objectDef.defaultHeight * scaleSettings.pixelsPerMm,
              }
            };

            const wallSnap = snapObjectToWall(tempShape, walls, 500); // 500mm threshold

            if (wallSnap) {
              // Apply wall-relative positioning
              newShape.wallRelative = {
                ...wallSnap.wallRelative!,
                // Override with object-specific elevation data
                height: objectDef.elevationHeight ?? objectDef.defaultHeight,
                elevationBottom: objectDef.elevationBottom ?? categoryDefaults.elevationBottom,
                depth: objectDef.depth ?? objectDef.defaultHeight,
              };
              newShape.rotation = wallSnap.rotation;
              // Update placement position to snapped position
              if (wallSnap.coordinates && 'x' in wallSnap.coordinates) {
                const snappedCoords = wallSnap.coordinates as { x: number; y: number };
                newShape.metadata!.placementX = snappedCoords.x;
                newShape.metadata!.placementY = snappedCoords.y;
              }
            }
          }
        }

        addShape(newShape);
        toast.success(`${objectDef.name} placed${newShape.wallRelative ? ' (wall attached)' : ''}`);

        // Select the newly placed object (not the room under the cursor)
        justPlacedObjectRef.current = true;
        setSelectedShapeId(newShape.id);
        setSelectedShapeIds([newShape.id]);

        // Clear the pending object and ghost preview
        setPendingObjectId(null);
        setGhostPreview(null);
      }

      return;
    }

    // ============================================================================
    // ROOM PLACEMENT - Place existing room from rooms list onto canvas
    // ============================================================================
    if (pendingRoomPlacement && currentPlanId) {
      const roomId = pendingRoomPlacement.roomId;
      const roomName = pendingRoomPlacement.roomName;
      const roomColor = pendingRoomPlacement.color || 'rgba(59, 130, 246, 0.2)';

      // Create a rectangular room shape at click position
      // Default size: 3m x 4m (3000mm x 4000mm)
      const defaultWidth = 3000 * scaleSettings.pixelsPerMm;
      const defaultHeight = 4000 * scaleSettings.pixelsPerMm;

      // Center the room on the click position
      let startX = pos.x - defaultWidth / 2;
      let startY = pos.y - defaultHeight / 2;

      // Magnetically nudge the placed room so it abuts neighbouring rooms.
      if (projectSettings.snapEnabled) {
        const neighbors = collectRoomBBoxes(currentShapes, currentPlanId);
        const { dx, dy } = edgeSnapNudge(
          { minX: startX, minY: startY, maxX: startX + defaultWidth, maxY: startY + defaultHeight },
          neighbors,
          getEdgeSnapThreshold(viewState.zoom)
        );
        startX += dx;
        startY += dy;
      }

      const roomPoints = [
        { x: startX, y: startY },
        { x: startX + defaultWidth, y: startY },
        { x: startX + defaultWidth, y: startY + defaultHeight },
        { x: startX, y: startY + defaultHeight },
      ];

      const newRoomShape: FloorMapShape = {
        id: uuidv4(),
        planId: currentPlanId,
        type: 'room',
        roomId: roomId, // Link to database room
        coordinates: {
          points: roomPoints,
        },
        color: roomColor,
        strokeColor: 'rgba(41, 91, 172, 0.8)',
        name: roomName,
        zIndex: -100, // Rooms render below objects/furniture
      };

      addShape(newRoomShape);

      // Update the room in the database with floor_plan_position
      const updateRoomPosition = async () => {
        try {
          const { error } = await supabase
            .from('rooms')
            .update({
              floor_plan_position: {
                points: roomPoints.map(p => ({
                  x: p.x / scaleSettings.pixelsPerMm, // Store in mm
                  y: p.y / scaleSettings.pixelsPerMm,
                })),
              },
            })
            .eq('id', roomId);

          if (error) {
            console.error('Error updating room position:', error);
          }
        } catch (err) {
          console.error('Error updating room position:', err);
        }
      };

      updateRoomPosition();

      toast.success(`🏠 "${roomName}" placerat på ritningen`);

      // Clear the pending room placement
      setPendingRoomPlacement(null);

      // Select the new room
      setSelectedShapeIds([newRoomShape.id]);

      return;
    }

    // ============================================================================
    // TEMPLATE PLACEMENT - Place saved template (group of shapes)
    // ============================================================================
    if (pendingTemplateId && currentPlanId) {
      const clickX = Math.round(pos.x);
      const clickY = Math.round(pos.y);
      
      // Template placement
      
      // Check if this is a default template (ID starts with "default-")
      const isDefaultTemplate = pendingTemplateId.startsWith('default-');
      
      if (isDefaultTemplate) {
        // Extract index from ID (e.g., "default-0" -> 0)
        const templateIndex = parseInt(pendingTemplateId.replace('default-', ''));
        const defaultTemplate = DEFAULT_TEMPLATES[templateIndex];
        
        if (!defaultTemplate) {
          toast.error('Standard-mall hittades inte');
          setPendingTemplateId(null);
          return;
        }
        
        // Convert to full template object
        const template = {
          ...defaultTemplate,
          id: pendingTemplateId,
          user_id: 'system',
          created_at: new Date().toISOString(),
        };
        // Default template loaded
        
        // Calculate bounds BEFORE placement
        const beforeBounds = calculateBounds(template.shapes);
        
        // Place all shapes from template at clicked position
        const placedShapes = placeTemplateShapes(template, pos, currentPlanId);
        
        // Calculate bounds AFTER placement
        const afterBounds = calculateBounds(placedShapes);
        
        // Shape placed
        
        if (placedShapes.length > 0) {
          // Add all shapes to canvas (they become regular editable shapes)
          placedShapes.forEach(shape => {
            addShape(shape);
          });

          toast.success(
            `✨ Mall "${template.name}" placerad (${placedShapes.length} ${
              placedShapes.length === 1 ? 'objekt' : 'objekt'
            })`
          );
        } else {
          toast.error('Kunde inte placera mall - inga objekt hittades');
        }
        
        // Clear the pending template
        setPendingTemplateId(null);
      } else if (pendingTemplateId && !isDefaultTemplate) {
        // Only query database for custom templates (not default ones)
        getTemplateById(pendingTemplateId).then(template => {
          if (template && template.shapes) {
            
            // Calculate bounds BEFORE placement
            const beforeBounds = calculateBounds(template.shapes);
            
            // Place all shapes from template at clicked position
            const placedShapes = placeTemplateShapes(template, pos, currentPlanId);
            
            // Calculate bounds AFTER placement
            const afterBounds = calculateBounds(placedShapes);

            if (placedShapes.length > 0) {
              // Add all shapes to canvas (they become regular editable shapes)
              placedShapes.forEach(shape => {
                addShape(shape);
              });

              toast.success(
                `✨ Mall "${template.name}" placerad (${placedShapes.length} ${
                  placedShapes.length === 1 ? 'objekt' : 'objekt'
                })`
              );
            } else {
              toast.error('Kunde inte placera mall - inga objekt hittades');
            }
          } else {
            toast.error('Mall hittades inte');
          }
          
          // Clear the pending template so user can continue working
          setPendingTemplateId(null);
        }).catch(error => {
          console.error('Error placing template:', error);
          toast.error('Ett fel uppstod vid placering av mall');
          setPendingTemplateId(null);
        });
      } else {
        // Invalid template ID (shouldn't happen)
        toast.error('Ogiltig mall-ID');
        setPendingTemplateId(null);
      }
      
      return;
    }
    
    // Snap to grid if enabled - uses user's grid interval setting
    // Freehand tool is NEVER snapped - always free drawing
    // Line-based tools (wall, window, door, sliding door) use wall snapping
    const forWalls = activeTool === 'wall' || activeTool === 'window_line' || activeTool === 'door_line' || activeTool === 'sliding_door_line' || activeTool === 'opening_line';
    const shouldSnap = activeTool !== 'freehand' && projectSettings.snapEnabled;
    const currentSnapSize = getSnapSize(viewState.zoom, scaleSettings.pixelsPerMm, forWalls, projectSettings.gridInterval);
    pos = snapToGrid(pos, currentSnapSize, shouldSnap);
    
    // Pan mode (spacebar or middle mouse)
    if (e.evt.button === 1 || isSpacePressed) {
      e.evt.preventDefault();
      setIsPanning(true);
      setPanStart({ x: pointer.x - viewState.panX, y: pointer.y - viewState.panY });
      return;
    }
    
    // BOX SELECTION - Drag to select multiple objects (like Figma/Canva/Photoshop)
    // Check if clicked on empty canvas (not on any shape)
    const clickedOnEmpty = e.target === stage || e.target.getType() === 'Stage';
    
    if (clickedOnEmpty && activeTool === 'select' && !e.evt.ctrlKey && !e.evt.metaKey) {
      // Start box selection (Shift = add to existing selection)
      setIsBoxSelecting(true);
      setIsExtendingSelection(e.evt.shiftKey);
      setSelectionBox({ start: pos, end: pos });
      return;
    }
    
    // ROOM TOOL - Drag to create rectangular room (fast & simple)
    if (activeTool === 'room' && !isDrawing && !isBoxSelecting) {
      // Start room creation by dragging (like box selection but creates a room)
      setIsBoxSelecting(true); // Reuse box selection state for room dragging
      setSelectionBox({ start: pos, end: pos });
      return;
    }
    
    // WALL TOOL - Click to add wall segments
    if (activeTool === 'wall' && !isDrawing) {
      setIsDrawing(true);
      addDrawingPoint(pos);
      return;
    }

    // LINE-BASED OPENING TOOLS - Click to start, click again to end (like walls)
    if ((activeTool === 'window_line' || activeTool === 'door_line' || activeTool === 'sliding_door_line' || activeTool === 'opening_line') && !isDrawing) {
      setIsDrawing(true);
      addDrawingPoint(pos);
      return;
    }

    // FREEHAND TOOL - Click to add freehand points
    if (activeTool === 'freehand' && !isDrawing) {
      setIsDrawing(true);
      addDrawingPoint(pos);
      return;
    }

    // CIRCLE TOOL - Drag to create circle (like room tool)
    if (activeTool === 'circle' && !isDrawing && !isBoxSelecting) {
      setIsBoxSelecting(true);
      setSelectionBox({ start: pos, end: pos });
      return;
    }

    // RECTANGLE TOOL - Drag to create rectangle (like room tool)
    if (activeTool === 'rectangle' && !isDrawing && !isBoxSelecting) {
      setIsBoxSelecting(true);
      setSelectionBox({ start: pos, end: pos });
      return;
    }

    // BEZIER TOOL - Drag to create curve (like circle/rectangle)
    if (activeTool === 'bezier' && !isDrawing && !isBoxSelecting) {
      setIsBoxSelecting(true);
      setSelectionBox({ start: pos, end: pos });
      return;
    }

    // CONNECTOR TOOL - Drag to create connector arrow
    if (activeTool === 'connector' && !isDrawing && !isBoxSelecting) {
      setIsBoxSelecting(true);
      setSelectionBox({ start: pos, end: pos });
      return;
    }

    // TEXT TOOL - Click to open text dialog, then drag to create text box
    if (activeTool === 'text' && !isDrawing && !isBoxSelecting) {
      setIsBoxSelecting(true);
      setSelectionBox({ start: pos, end: pos });
      return;
    }

    if (activeTool === 'sticky_note' && !isDrawing && !isBoxSelecting) {
      setIsBoxSelecting(true);
      setSelectionBox({ start: pos, end: pos });
      return;
    }
  }, [
    isPanning,
    panStart,
    isBoxSelecting,
    selectionBox,
    isDrawing,
    currentDrawingPoints,
    viewState,
    activeTool,
    gridSettings.snap,
    scaleSettings.pixelsPerMm,
    currentPlanId,
    currentProjectId,
    pendingLibrarySymbol,
    // pendingObjectId was missing here, so its closure went stale (null) and
    // click-to-place for object-library items (outlets, switches, furniture)
    // silently never fired — only drag worked. ghostPreview/shapes are read during
    // placement too (rotation + z-index), so keep them fresh as well.
    pendingObjectId,
    ghostPreview,
    shapes,
    setPendingObjectId,
    setGhostPreview,
    setViewState,
    setCurrentPlanId,
    addDrawingPoint,
    setCurrentDrawingPoints,
    throttledSetSelectionBox,
    setIsDrawing,
    setIsPanning,
    setPanStart,
    setIsBoxSelecting,
    setSelectionBox,
    setIsExtendingSelection,
    setSelectedShapeIds,
    setSelectedShapeId,
    addShape,
    setPendingLibrarySymbol,
    projectSettings.snapEnabled,
  ]);

  // Handle mouse move
  const handleMouseMove = useCallback((e: KonvaEventObject<MouseEvent>) => {
    const stage = stageRef.current;
    if (!stage) return;

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    // Get fresh viewState to avoid stale closures
    const { viewState: currentViewState } = useFloorMapStore.getState();

    // Calculate position
    const pos = {
      x: (pointer.x - currentViewState.panX) / currentViewState.zoom,
      y: (pointer.y - currentViewState.panY) / currentViewState.zoom,
    };

    // Handle measure tool movement
    if (isMeasuring) {
      setMeasureEnd(pos);
      return;
    }

    // Snap to grid if enabled - uses user's grid interval setting
    // Freehand tool is NEVER snapped - always free drawing
    // Line-based tools (wall, window, door, sliding door) use wall snapping
    const forWalls = activeTool === 'wall' || activeTool === 'window_line' || activeTool === 'door_line' || activeTool === 'sliding_door_line' || activeTool === 'opening_line';
    const shouldSnap = activeTool !== 'freehand' && projectSettings.snapEnabled;
    const currentSnapSize = getSnapSize(viewState.zoom, scaleSettings.pixelsPerMm, forWalls, projectSettings.gridInterval);
    const snappedPos = snapToGrid(pos, currentSnapSize, shouldSnap);

    // Update cursor (FIXED - was breaking during panning)
    if (isPanning && panStart) {
      // Update pan position
      const unconstrained = {
        panX: pointer.x - panStart.x,
        panY: pointer.y - panStart.y,
      };

      // Constrain pan to canvas bounds
      const constrained = constrainPan(unconstrained.panX, unconstrained.panY, viewState.zoom);

      setViewState(constrained);
      return;
    }

    // Box selection (marquee)
    if (isBoxSelecting && selectionBox) {
      throttledSetSelectionBox({ start: selectionBox.start, end: snappedPos });
      return;
    }

    // Drawing mode - add points (for wall, freehand, and line-based openings)
    if (isDrawing && (activeTool === 'wall' || activeTool === 'freehand' || activeTool === 'window_line' || activeTool === 'door_line' || activeTool === 'sliding_door_line' || activeTool === 'opening_line')) {
      // Freehand uses raw pos (no snap), walls and line tools use snapped pos
      const drawPos = activeTool === 'freehand' ? pos : snappedPos;
      addDrawingPoint(drawPos);
      // Track current mouse position for CAD numeric input overlay
      currentMousePosRef.current = snappedPos;
      return;
    }

    // Ghost preview for stamp placement mode (library objects/symbols)
    // When user has selected an object from library, show preview at cursor
    const { pendingObjectId, pendingLibrarySymbol } = useFloorMapStore.getState();
    if (pendingObjectId || pendingLibrarySymbol) {
      // Get all walls to detect nearest one
      const walls = shapes.filter(s => s.type === 'wall');

      // Find nearest wall within 300mm (snapping distance)
      const WALL_SNAP_DISTANCE = 300; // mm
      const nearestWall = findNearestWallForPoint(snappedPos.x, snappedPos.y, walls, WALL_SNAP_DISTANCE);

      let rotation = 0;
      let nearWall = false;

      if (nearestWall) {
        // Calculate rotation to face the wall
        // Wall angle is the direction the wall runs, we want to face perpendicular to it
        const wallGeom = getWallGeometry(nearestWall.wall);
        if (wallGeom) {
          // Wall angle in degrees + 90 to face the wall (perpendicular)
          // The object should "face into" the room, away from the wall
          const wallAngleDeg = (wallGeom.angle * 180) / Math.PI;

          // Determine which side of the wall we're on using the normal vector
          const toPointX = snappedPos.x - wallGeom.x1;
          const toPointY = snappedPos.y - wallGeom.y1;
          const dotNormal = toPointX * wallGeom.normalX + toPointY * wallGeom.normalY;

          // If on the "normal" side, rotate to face that direction; otherwise rotate 180°
          if (dotNormal >= 0) {
            rotation = wallAngleDeg + 90;
          } else {
            rotation = wallAngleDeg - 90;
          }

          // Normalize rotation to 0-360
          rotation = ((rotation % 360) + 360) % 360;
          nearWall = true;
        }
      }

      setGhostPreview({
        x: snappedPos.x,
        y: snappedPos.y,
        rotation,
        nearWall,
      });
      return;
    } else {
      // Clear ghost preview if no pending object
      if (ghostPreview) {
        setGhostPreview(null);
      }
    }

    // Hover detection for info tooltip (only when not actively doing something)
    // Only show tooltip when using select tool and not drawing/panning/box-selecting
    if (activeTool === 'select' && !isPanning && !isDrawing && !isBoxSelecting) {
      const target = e.target;
      const shapeId = (target as any).attrs?.shapeId;
      if (shapeId && shapeId !== hoveredShapeId) {
        setHoveredShapeId(shapeId);
        setHoverMousePosition({ x: e.evt.clientX, y: e.evt.clientY });
      } else if (!shapeId && hoveredShapeId) {
        setHoveredShapeId(null);
        setHoverMousePosition(null);
      } else if (shapeId) {
        // Update position for same shape
        setHoverMousePosition({ x: e.evt.clientX, y: e.evt.clientY });
      }
    } else if (hoveredShapeId) {
      // Clear hover when doing other actions
      setHoveredShapeId(null);
      setHoverMousePosition(null);
    }
  }, [isPanning, panStart, isBoxSelecting, selectionBox, isDrawing, currentDrawingPoints, viewState, activeTool, gridSettings.snap, scaleSettings.pixelsPerMm, setViewState, addDrawingPoint, setCurrentDrawingPoints, throttledSetSelectionBox, projectSettings.snapEnabled, constrainPan, shapes, ghostPreview, hoveredShapeId]);
  
  // Handle mouse up
  const handleMouseUp = useCallback((e: KonvaEventObject<MouseEvent>) => {
    // Finish measuring - keep measurement visible until tool changes
    if (isMeasuring) {
      setIsMeasuring(false);
      // Don't clear measureStart/measureEnd - measurement stays visible
      return;
    }

    // Stop panning
    if (isPanning) {
      setIsPanning(false);
      setPanStart(null);
      return;
    }
    
    // Stop box selection OR room creation
    if (isBoxSelecting) {
      setIsBoxSelecting(false);
      
      // ROOM TOOL - Create rectangular room from drag box
      if (activeTool === 'room' && selectionBox) {
        const minSize = 100 * scaleSettings.pixelsPerMm; // 100mm minimum

        // Magnetically snap the drawn rectangle's edges to neighbouring rooms so
        // adjacent rooms share an exact boundary (→ single shared auto-wall).
        let rect = {
          minX: Math.min(selectionBox.start.x, selectionBox.end.x),
          maxX: Math.max(selectionBox.start.x, selectionBox.end.x),
          minY: Math.min(selectionBox.start.y, selectionBox.end.y),
          maxY: Math.max(selectionBox.start.y, selectionBox.end.y),
        };
        if (projectSettings.snapEnabled) {
          const neighbors = collectRoomBBoxes(currentShapes, currentPlanId);
          rect = snapRectEdgesToRooms(rect, neighbors, getEdgeSnapThreshold(viewState.zoom), minSize);
        }
        const { minX, maxX, minY, maxY } = rect;

        // Only create room if box is big enough (minimum 100mm x 100mm)
        const width = maxX - minX;
        const height = maxY - minY;

        if (width >= minSize && height >= minSize) {
          // Create 4 corner points for rectangular room
          const roomPoints = [
            { x: minX, y: minY }, // Top-left
            { x: maxX, y: minY }, // Top-right
            { x: maxX, y: maxY }, // Bottom-right
            { x: minX, y: maxY }, // Bottom-left
          ];
          
          const roomId = uuidv4();
          const newRoom: FloorMapShape = {
            id: roomId,
            planId: currentPlanId,
            type: 'room',
            coordinates: {
              points: roomPoints,
            },
            color: 'rgba(59, 130, 246, 0.2)',
            strokeColor: 'rgba(41, 91, 172, 0.8)',
            zIndex: -100, // Rooms render below objects/furniture
          };
          
          addShape(newRoom);
          
          // Open name dialog after creating room
          setTimeout(() => {
            setSelectedShapeForNaming(roomId);
            setIsNameRoomDialogOpen(true);
          }, 100);
          
          toast.success('Rum skapat - ge det ett namn!');
        } else {
          toast.error('Rummet är för litet - dra en större yta');
        }
        
        setSelectionBox(null);
        return;
      }

      // CIRCLE TOOL - Create circle from drag box
      if (activeTool === 'circle' && selectionBox && currentPlanId) {
        const centerX = (selectionBox.start.x + selectionBox.end.x) / 2;
        const centerY = (selectionBox.start.y + selectionBox.end.y) / 2;
        const width = Math.abs(selectionBox.end.x - selectionBox.start.x);
        const height = Math.abs(selectionBox.end.y - selectionBox.start.y);
        const radius = Math.max(width, height) / 2;

        // Minimum radius (50mm)
        const minRadius = 50 * scaleSettings.pixelsPerMm;

        if (radius >= minRadius) {
          const newCircle: FloorMapShape = {
            id: uuidv4(),
            planId: currentPlanId,
            type: 'circle',
            coordinates: {
              cx: centerX,
              cy: centerY,
              radius,
            },
            color: 'rgba(147, 197, 253, 0.3)',
            strokeColor: '#3b82f6',
            strokeWidth: 2,
          };
          addShape(newCircle);
          toast.success('Cirkel skapad');
        } else {
          toast.error('Cirkeln är för liten - dra en större yta');
        }

        setSelectionBox(null);
        return;
      }

      // RECTANGLE TOOL - Create rectangle from drag box
      if (activeTool === 'rectangle' && selectionBox && currentPlanId) {
        const minX = Math.min(selectionBox.start.x, selectionBox.end.x);
        const maxX = Math.max(selectionBox.start.x, selectionBox.end.x);
        const minY = Math.min(selectionBox.start.y, selectionBox.end.y);
        const maxY = Math.max(selectionBox.start.y, selectionBox.end.y);

        const width = maxX - minX;
        const height = maxY - minY;
        const minSize = 50 * scaleSettings.pixelsPerMm; // 50mm minimum

        if (width >= minSize && height >= minSize) {
          const newRect: FloorMapShape = {
            id: uuidv4(),
            planId: currentPlanId,
            type: 'rectangle',
            coordinates: {
              left: minX,
              top: minY,
              width,
              height,
            },
            color: 'rgba(167, 243, 208, 0.3)',
            strokeColor: '#10b981',
            strokeWidth: 2,
          };
          addShape(newRect);
          toast.success('Rektangel skapad');
        } else {
          toast.error('Rektangeln är för liten - dra en större yta');
        }

        setSelectionBox(null);
        return;
      }

      // CONNECTOR TOOL - Create arrow from drag (start → end), with optional shape anchoring
      if (activeTool === 'connector' && selectionBox && currentPlanId) {
        const start = selectionBox.start;
        const end = selectionBox.end;
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const minDistance = 20 * scaleSettings.pixelsPerMm; // 20mm minimum

        if (distance >= minDistance) {
          // Check if we started from an anchor dot
          const startBinding = connectorStartRef.current;

          // Detect if end point is near a connectable shape anchor
          const endBinding = findNearestConnectableAnchor(
            currentShapes,
            end.x,
            end.y,
            startBinding?.shapeId,
            50,
          );

          const finalEndX = endBinding ? endBinding.point.x : end.x;
          const finalEndY = endBinding ? endBinding.point.y : end.y;

          const newConnector: FloorMapShape = {
            id: uuidv4(),
            planId: currentPlanId,
            type: 'connector',
            coordinates: { x1: start.x, y1: start.y, x2: finalEndX, y2: finalEndY } as LineCoordinates,
            startShapeId: startBinding?.shapeId,
            startAnchor: startBinding?.anchor,
            endShapeId: endBinding?.shape.id,
            endAnchor: endBinding?.anchor,
            strokeColor: '#6366f1',
            strokeWidth: 2,
          };
          addShape(newConnector);
        } else {
          toast.error('Dra längre för att skapa en koppling');
        }

        // Always clear the start binding
        connectorStartRef.current = null;

        setSelectionBox(null);
        return;
      }

      // BEZIER TOOL - Create curve from drag box (control point auto-calculated)
      if (activeTool === 'bezier' && selectionBox && currentPlanId) {
        const start = selectionBox.start;
        const end = selectionBox.end;

        // Calculate distance
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const minDistance = 50 * scaleSettings.pixelsPerMm; // 50mm minimum

        if (distance >= minDistance) {
          // Calculate control point: perpendicular offset from midpoint
          // This creates a nice arc shape
          const midX = (start.x + end.x) / 2;
          const midY = (start.y + end.y) / 2;

          // Perpendicular vector (rotate 90 degrees)
          const perpX = -dy;
          const perpY = dx;

          // Normalize and scale (30% of distance for nice curve)
          const perpLength = Math.sqrt(perpX * perpX + perpY * perpY);
          const curveAmount = distance * 0.3;
          const controlX = midX + (perpX / perpLength) * curveAmount;
          const controlY = midY + (perpY / perpLength) * curveAmount;

          const newBezier: FloorMapShape = {
            id: uuidv4(),
            planId: currentPlanId,
            type: 'bezier',
            coordinates: {
              start: { x: start.x, y: start.y },
              control: { x: controlX, y: controlY },
              end: { x: end.x, y: end.y },
            },
            strokeColor: '#8b5cf6',
            strokeWidth: 2,
          };
          addShape(newBezier);
          toast.success('Kurva skapad - dra kontrollpunkten för att justera');
        } else {
          toast.error('Kurvan är för kort - dra längre');
        }

        setSelectionBox(null);
        return;
      }

      // TEXT TOOL - Open text dialog with position for text box
      if (activeTool === 'sticky_note' && selectionBox && currentPlanId) {
        const minX = Math.min(selectionBox.start.x, selectionBox.end.x);
        const maxX = Math.max(selectionBox.start.x, selectionBox.end.x);
        const minY = Math.min(selectionBox.start.y, selectionBox.end.y);
        const maxY = Math.max(selectionBox.start.y, selectionBox.end.y);
        const w = maxX - minX;
        const h = maxY - minY;
        const newShape: FloorMapShape = {
          id: uuidv4(),
          type: 'sticky_note',
          planId: currentPlanId,
          coordinates: { x: minX, y: minY, width: w >= 40 ? w : 200, height: h >= 40 ? h : 150 },
          text: '',
          zIndex: currentShapes.length,
        };
        addShape(newShape);
        setSelectedShapeIds([newShape.id]);
        setActiveTool('select');
        setSelectionBox(null);
        return;
      }

      if (activeTool === 'text' && selectionBox && currentPlanId) {
        const minX = Math.min(selectionBox.start.x, selectionBox.end.x);
        const maxX = Math.max(selectionBox.start.x, selectionBox.end.x);
        const minY = Math.min(selectionBox.start.y, selectionBox.end.y);
        const maxY = Math.max(selectionBox.start.y, selectionBox.end.y);

        const width = maxX - minX;
        const height = maxY - minY;
        const minSize = 50; // 50 pixels minimum for text box

        // If dragged a box, use that size; otherwise default box size (in pixels)
        // Default: 200x50 pixels which is a reasonable text box size
        const boxWidth = width >= minSize ? width : 200;
        const boxHeight = height >= minSize ? height : 50;

        // Open text dialog with position
        textDialog.openForCreate({
          x: minX,
          y: minY,
          width: boxWidth,
          height: boxHeight,
        });
        setSelectionBox(null);
        return;
      }

      // SELECT TOOL - Select all shapes that INTERSECT with the box (not just fully contained)
      if (activeTool === 'select' && selectionBox) {
        const boxMinX = Math.min(selectionBox.start.x, selectionBox.end.x);
        const boxMaxX = Math.max(selectionBox.start.x, selectionBox.end.x);
        const boxMinY = Math.min(selectionBox.start.y, selectionBox.end.y);
        const boxMaxY = Math.max(selectionBox.start.y, selectionBox.end.y);
        
        const selectedIds = currentShapes
          .filter(shape => {
            const coords = shape.coordinates as any;
            
            // WALL / LINE - check if line intersects with box
            if (shape.type === 'wall' || shape.type === 'line') {
              const wallMinX = Math.min(coords.x1, coords.x2);
              const wallMaxX = Math.max(coords.x1, coords.x2);
              const wallMinY = Math.min(coords.y1, coords.y2);
              const wallMaxY = Math.max(coords.y1, coords.y2);
              
              // Check if wall bounding box intersects with selection box
              return !(wallMaxX < boxMinX || wallMinX > boxMaxX || 
                       wallMaxY < boxMinY || wallMinY > boxMaxY);
            }
            
            // ROOM - check if any vertex is inside box
            if (shape.type === 'room' && coords.points) {
              return coords.points.some((p: { x: number; y: number }) => 
                p.x >= boxMinX && p.x <= boxMaxX &&
                p.y >= boxMinY && p.y <= boxMaxY
              );
            }
            
            // RECTANGLE - check if rect intersects with box
            if (shape.type === 'rectangle' && coords.left !== undefined) {
              const rectMinX = coords.left;
              const rectMaxX = coords.left + coords.width;
              const rectMinY = coords.top;
              const rectMaxY = coords.top + coords.height;
              
              return !(rectMaxX < boxMinX || rectMinX > boxMaxX || 
                       rectMaxY < boxMinY || rectMinY > boxMaxY);
            }
            
            // CIRCLE - check if circle center is in box or circle intersects box
            if (shape.type === 'circle' && coords.cx !== undefined) {
              const inBox = coords.cx >= boxMinX && coords.cx <= boxMaxX &&
                           coords.cy >= boxMinY && coords.cy <= boxMaxY;
              
              // Also check if any part of circle intersects box edges
              const intersectsEdge = 
                (coords.cx + coords.radius >= boxMinX && coords.cx - coords.radius <= boxMaxX &&
                 coords.cy + coords.radius >= boxMinY && coords.cy - coords.radius <= boxMaxY);
              
              return inBox || intersectsEdge;
            }
            
            // TEXT - check if text position is in box
            if (shape.type === 'text' && coords.x !== undefined) {
              return coords.x >= boxMinX && coords.x <= boxMaxX &&
                     coords.y >= boxMinY && coords.y <= boxMaxY;
            }

            // STICKY NOTE - check if any part of the note intersects box
            if (shape.type === 'sticky_note' && coords.x !== undefined) {
              const endX = coords.x + (coords.width || 200);
              const endY = coords.y + (coords.height || 150);
              return !(endX < boxMinX || coords.x > boxMaxX || endY < boxMinY || coords.y > boxMaxY);
            }
            
            // FREEHAND / POLYGON - check if any point is in box
            if ((shape.type === 'freehand' || shape.type === 'polygon') && coords.points) {
              return coords.points.some((p: { x: number; y: number }) =>
                p.x >= boxMinX && p.x <= boxMaxX &&
                p.y >= boxMinY && p.y <= boxMaxY
              );
            }

            // BEZIER - check if any of the 3 points is in box
            if (shape.type === 'bezier') {
              const points = [coords.start, coords.control, coords.end];
              return points.some((p: { x: number; y: number }) =>
                p.x >= boxMinX && p.x <= boxMaxX &&
                p.y >= boxMinY && p.y <= boxMaxY
              );
            }

            // IMAGE - check if image rect intersects with box
            if (shape.type === 'image' && coords.x !== undefined) {
              const imgMinX = coords.x;
              const imgMaxX = coords.x + (coords.width || 0);
              const imgMinY = coords.y;
              const imgMaxY = coords.y + (coords.height || 0);
              return imgMinX <= boxMaxX && imgMaxX >= boxMinX &&
                     imgMinY <= boxMaxY && imgMaxY >= boxMinY;
            }

            return false;
          })
          .map(shape => shape.id);
        
        // If Shift was held, add to existing selection instead of replacing
        if (isExtendingSelection) {
          const existingIds = selectedShapeIds;
          const combinedIds = [...new Set([...existingIds, ...selectedIds])];
          setSelectedShapeIds(combinedIds);
          if (selectedIds.length > 0) {
            toast.success(`${selectedIds.length} objekt tillagda (totalt ${combinedIds.length})`);
          }
        } else {
          setSelectedShapeIds(selectedIds);
          if (selectedIds.length > 0) {
            toast.success(`${selectedIds.length} objekt markerade`);
          }
        }
      }
      setSelectionBox(null);
      setIsExtendingSelection(false);
      return;
    }
    
    // Complete drawing
    if (isDrawing && currentDrawingPoints.length >= 2 && currentPlanId) {
      let start = currentDrawingPoints[0];
      let end = currentDrawingPoints[currentDrawingPoints.length - 1];
      
      let newShape: FloorMapShape | null = null;
      
      if (activeTool === 'wall') {
        // Check for custom wall thickness from toolbar (e.g., outer wall)
        const customThickness = (window as any).__wallThickness;
        const wallThickness = customThickness || projectSettings.wallThicknessMM || 200;
        const wallDefaults = getAdminDefaults();

        // Clear custom thickness after use
        if (customThickness) {
          delete (window as any).__wallThickness;
          delete (window as any).__wallType;
        }

        // Create wall
        newShape = {
          id: uuidv4(),
          planId: currentPlanId,
          type: 'wall',
          coordinates: {
            x1: start.x,
            y1: start.y,
            x2: end.x,
            y2: end.y,
          },
          strokeColor: '#2d3748',
          thicknessMM: wallThickness,
          heightMM: wallDefaults.wallHeightMM,
        };
      } else if (activeTool === 'freehand') {
        // Create freehand
        newShape = {
          id: uuidv4(),
          planId: currentPlanId,
          type: 'freehand',
          coordinates: {
            points: currentDrawingPoints,
          },
          strokeColor: '#000000',
          strokeWidth: 2,
        };
      } else if (activeTool === 'window_line') {
        // Calculate length and apply default if too small (single click)
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const defaultWindowWidthMM = 1000; // 1000mm standard window
        const defaultWindowWidthPx = defaultWindowWidthMM * scaleSettings.pixelsPerMm;
        const minLength = 50; // Minimum to consider as "dragged"

        let finalEnd = end;
        if (length < minLength) {
          // Single click - use default horizontal window (converted to pixels)
          finalEnd = { x: start.x + defaultWindowWidthPx, y: start.y };
        }

        newShape = {
          id: uuidv4(),
          planId: currentPlanId,
          type: 'window_line',
          coordinates: {
            x1: start.x,
            y1: start.y,
            x2: finalEnd.x,
            y2: finalEnd.y,
          },
          strokeColor: '#3b82f6', // Blue for windows
          thicknessMM: 100, // Window frame thickness
        };
        toast.success('Fönster skapat');
      } else if (activeTool === 'door_line') {
        // Calculate length and apply default if too small (single click)
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const defaultDoorWidthMM = 900; // 900mm standard door
        const defaultDoorWidthPx = defaultDoorWidthMM * scaleSettings.pixelsPerMm;
        const minLength = 50;

        let finalEnd = end;
        if (length < minLength) {
          // Single click - use default horizontal door (converted to pixels)
          finalEnd = { x: start.x + defaultDoorWidthPx, y: start.y };
        }

        newShape = {
          id: uuidv4(),
          planId: currentPlanId,
          type: 'door_line',
          coordinates: {
            x1: start.x,
            y1: start.y,
            x2: finalEnd.x,
            y2: finalEnd.y,
          },
          strokeColor: '#8b5cf6', // Purple for doors
          thicknessMM: 50, // Door frame thickness
          openingDirection: 'right', // Default to right opening
        };
        toast.success('Dörr skapad (dubbelklicka för att byta öppningsriktning)');
      } else if (activeTool === 'sliding_door_line') {
        // Calculate length and apply default if too small (single click)
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const defaultSlidingDoorWidthMM = 1800; // 1800mm standard sliding door
        const defaultSlidingDoorWidthPx = defaultSlidingDoorWidthMM * scaleSettings.pixelsPerMm;
        const minLength = 50;

        let finalEnd = end;
        if (length < minLength) {
          // Single click - use default horizontal sliding door (converted to pixels)
          finalEnd = { x: start.x + defaultSlidingDoorWidthPx, y: start.y };
        }

        newShape = {
          id: uuidv4(),
          planId: currentPlanId,
          type: 'sliding_door_line',
          coordinates: {
            x1: start.x,
            y1: start.y,
            x2: finalEnd.x,
            y2: finalEnd.y,
          },
          strokeColor: '#10b981', // Green for sliding doors
          thicknessMM: 50, // Frame thickness
        };
        toast.success('Skjutdörr skapad');
      }

      // OPENING LINE (wall opening/gap)
      if (activeTool === 'opening_line' && currentDrawingPoints.length >= 1) {
        const defaultOpeningWidthMM = 900; // 90cm default opening width
        const defaultOpeningWidthPx = defaultOpeningWidthMM * scaleSettings.pixelsPerMm;
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const minLength = 50;

        let finalEnd = end;
        if (length < minLength) {
          // Single click - use default horizontal opening (converted to pixels)
          finalEnd = { x: start.x + defaultOpeningWidthPx, y: start.y };
        }

        newShape = {
          id: uuidv4(),
          planId: currentPlanId,
          type: 'opening_line',
          coordinates: {
            x1: start.x,
            y1: start.y,
            x2: finalEnd.x,
            y2: finalEnd.y,
          },
          strokeColor: '#f97316', // Orange for openings
          thicknessMM: 50, // Frame thickness
        };
        toast.success('Väggöppning skapad');
      }

      if (newShape) {
        addShape(newShape);

        // Auto-snap openings (doors, windows, openings) to walls and break the wall
        const openingTypes = ['door_line', 'window_line', 'sliding_door_line', 'opening_line'];
        if (openingTypes.includes(newShape.type) && simplified) {
          // Model A: walls are room outlines, not objects. Snap the opening onto the
          // nearest room edge and DON'T split any wall (which is what created stray
          // wall fragments). Keeps the door sitting in the wall between rooms.
          const oc = newShape.coordinates as { x1: number; y1: number; x2: number; y2: number };
          // Anchor on the click/start point (which the user puts on the wall), not the
          // midpoint — a default horizontal door's midpoint sits far from a vertical wall.
          const anchor = { x: oc.x1, y: oc.y1 };
          const lengthPx = Math.hypot(oc.x2 - oc.x1, oc.y2 - oc.y1) || 900 * scaleSettings.pixelsPerMm;
          const rooms = currentShapes.filter(s => s.type === 'room' && s.planId === currentPlanId);
          const snapped = snapDoorToRoomEdge(anchor, lengthPx, rooms, currentPlanId, 40 / viewState.zoom);
          if (snapped) {
            updateShape(newShape.id, { coordinates: snapped });
            toast.success('Dörr placerad i vägg');
          }
        } else if (openingTypes.includes(newShape.type)) {
          const openingCoords = newShape.coordinates as { x1: number; y1: number; x2: number; y2: number };
          const walls = shapes.filter(
            s => s.planId === currentPlanId &&
                 s.type === 'wall' &&
                 s.id !== newShape.id
          );

          // Find nearest wall within 50 pixels
          const nearest = findNearestWall(openingCoords, walls, 50);

          if (nearest) {
            const wallCoords = nearest.wall.coordinates as { x1: number; y1: number; x2: number; y2: number };
            const snappedCoords = projectOntoWall(openingCoords, wallCoords);
            const wallSegments = splitWall(wallCoords, snappedCoords);

            // Use store action to snap opening and split wall
            const state = useFloorMapStore.getState();
            state.applyWallSnap(
              newShape.id,
              { coordinates: snappedCoords, attachedToWall: nearest.wall.id, positionOnWall: nearest.t },
              nearest.wall.id,
              wallSegments.map(seg => ({
                color: nearest.wall.color,
                strokeColor: nearest.wall.strokeColor,
                strokeWidth: nearest.wall.strokeWidth,
                heightMM: nearest.wall.heightMM,
                thicknessMM: nearest.wall.thicknessMM,
                coordinates: seg,
              }))
            );
            toast.success('Öppning placerad på vägg');
          }
        }
      }

      // Clear CAD numeric input after drawing completes
      setNumericInput('');
      setShowNumericInput(false);

      setIsDrawing(false);
      setCurrentDrawingPoints([]);
      return;
    }
  }, [isPanning, isBoxSelecting, selectionBox, isDrawing, isExtendingSelection, selectedShapeIds, currentDrawingPoints, currentPlanId, activeTool, currentShapes, viewState, gridSettings.snap, scaleSettings.pixelsPerMm, addShape, setIsDrawing, setCurrentDrawingPoints, setSelectedShapeIds, setSelectedShapeId, setIsPanning, setPanStart, setIsBoxSelecting, setSelectionBox, updateShape, projectSettings, shapes]);

  // CAD-style: Confirm wall with exact length (typed in mm)
  const confirmWallWithLength = useCallback((lengthMM: number) => {
    if (currentDrawingPoints.length === 0 || !currentPlanId) return;

    const start = currentDrawingPoints[0];
    const mousePos = currentMousePosRef.current;

    // Calculate direction vector from start to current mouse
    const dx = mousePos.x - start.x;
    const dy = mousePos.y - start.y;
    const currentLength = Math.sqrt(dx * dx + dy * dy);

    if (currentLength === 0) {
      toast.error('Flytta musen för att ange riktning');
      return;
    }

    // Normalize direction and scale to desired length in pixels
    const targetLengthPixels = lengthMM * scaleSettings.pixelsPerMm;
    const scale = targetLengthPixels / currentLength;

    const end = {
      x: start.x + dx * scale,
      y: start.y + dy * scale,
    };

    // Get wall settings
    const customThickness = (window as any).__wallThickness;
    const wallThickness = customThickness || projectSettings.wallThicknessMM || 200;
    const wallDefaults = getAdminDefaults();

    // Clear custom thickness after use
    if (customThickness) {
      delete (window as any).__wallThickness;
      delete (window as any).__wallType;
    }

    // Create wall with exact length
    const newShape: FloorMapShape = {
      id: uuidv4(),
      planId: currentPlanId,
      type: 'wall',
      coordinates: {
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
      },
      strokeColor: '#2d3748',
      thicknessMM: wallThickness,
      heightMM: wallDefaults.wallHeightMM,
    };

    addShape(newShape);
    toast.success(`Vägg skapad: ${lengthMM} mm`);

    // Reset state
    setNumericInput('');
    setShowNumericInput(false);
    setIsDrawing(false);
    setCurrentDrawingPoints([]);
  }, [currentDrawingPoints, currentPlanId, scaleSettings.pixelsPerMm, projectSettings.wallThicknessMM, addShape, setIsDrawing, setCurrentDrawingPoints]);

  // Update confirmWallWithLength ref for keyboard handler access
  useEffect(() => {
    confirmWallWithLengthRef.current = confirmWallWithLength;
  }, [confirmWallWithLength]);

  // Handle stage click - ONLY for empty space, NOT for shapes
  const handleStageClick = useCallback((e: KonvaEventObject<MouseEvent>) => {
    // CRITICAL: Only handle clicks on empty stage, not on shapes
    // Shapes handle their own clicks via onClick handlers
    const clickedOnEmpty = e.target === e.target.getStage();

    if (!clickedOnEmpty) {
      // Clicked on a shape - let the shape's onClick handler deal with it
      // Don't interfere here
      return;
    }

    // Only handle clicks on empty space
    // Select tool - clear selection when clicking empty space
    if (activeTool === 'select') {
      setSelectedShapeIds([]);
      setSelectedShapeId(null);
      setSelectedGroupIndividualId(null); // Clear individual group selection
    }
  }, [activeTool, setSelectedShapeIds, setSelectedShapeId]);
  
  // Handle shape transformation
  const handleShapeTransform = useCallback((shapeId: string, updates: Partial<FloorMapShape>) => {
    updateShape(shapeId, updates);
  }, [updateShape]);

  // Handle template group transformation (move, rotate, scale)
  const handleGroupTransform = useCallback((updates: Array<{ id: string; updates: Partial<FloorMapShape> }>) => {
    if (updates.length === 0) return;
    updateShapes(updates);
  }, [updateShapes]);

  // Handle template group selection
  const handleGroupSelect = useCallback((groupId: string, evt?: KonvaEventObject<MouseEvent>) => {
    if (evt) {
      evt.cancelBubble = true;
    }
    // Clear any individual shape selection within group
    setSelectedGroupIndividualId(null);

    // Select all shapes in the group
    const groupShapeIds = currentShapes
      .filter(s => s.groupId === groupId)
      .map(s => s.id);
    setSelectedShapeIds(groupShapeIds);

    // Find the group leader to show in PropertyPanel
    const groupLeader = currentShapes.find(s => s.groupId === groupId && s.isGroupLeader);
    const groupName = groupLeader?.templateInfo?.templateName || 'Mall';

    // Show PropertyPanel with group leader
    if (groupLeader) {
      setPropertyPanelShape(groupLeader);
      setShowPropertyPanel(true);
    }

    toast.success(`${groupName} markerad`);
  }, [currentShapes, setSelectedShapeIds, setPropertyPanelShape, setShowPropertyPanel]);

  // Handle individual shape selection within a template group (double-click)
  const handleGroupIndividualSelect = useCallback((shapeId: string, evt?: KonvaEventObject<MouseEvent>) => {
    if (evt) {
      evt.cancelBubble = true;
    }
    setSelectedGroupIndividualId(shapeId);

    // Find the shape to show info
    const shape = currentShapes.find(s => s.id === shapeId);
    if (shape) {
      setPropertyPanelShape(shape);
      setShowPropertyPanel(true);
      toast.success('Enskild form markerad');
    }
  }, [currentShapes, setPropertyPanelShape, setShowPropertyPanel]);

  // Handle opening property panel for individual shape (second double-click)
  const handleGroupOpenPropertyPanel = useCallback((shape: FloorMapShape) => {
    setPropertyPanelShape(shape);
    setShowPropertyPanel(true);
  }, [setPropertyPanelShape, setShowPropertyPanel]);

  // Handle batch length change for walls (Shift+drag endpoint)
  // Applies the same length to all other selected walls while preserving their angles
  const handleBatchWallLengthChange = useCallback((sourceShapeId: string, newLengthMM: number) => {
    const currentShapes = useFloorMapStore.getState().shapes;
    const currentSelectedIds = useFloorMapStore.getState().selectedShapeIds;

    // Line-based shape types that can be batch-synced
    const lineTypes = ['wall', 'line', 'window_line', 'door_line', 'sliding_door_line', 'opening_line'];

    // Get all selected wall/line shapes except the source (which was already updated)
    const otherSelectedWalls = currentShapes.filter(
      s => currentSelectedIds.includes(s.id) &&
           s.id !== sourceShapeId &&
           lineTypes.includes(s.type)
    );

    if (otherSelectedWalls.length === 0) return;

    const newLengthPixels = newLengthMM * scaleSettings.pixelsPerMm;

    // Build batch updates
    const updates: Array<{ id: string; updates: Partial<FloorMapShape> }> = [];

    for (const wall of otherSelectedWalls) {
      const wallCoords = wall.coordinates as { x1: number; y1: number; x2: number; y2: number };
      const dx = wallCoords.x2 - wallCoords.x1;
      const dy = wallCoords.y2 - wallCoords.y1;

      // Calculate current angle (preserve it)
      const angle = Math.atan2(dy, dx);

      // Calculate new endpoint based on same angle but new length
      const newX2 = wallCoords.x1 + Math.cos(angle) * newLengthPixels;
      const newY2 = wallCoords.y1 + Math.sin(angle) * newLengthPixels;

      updates.push({
        id: wall.id,
        updates: {
          coordinates: {
            x1: wallCoords.x1,
            y1: wallCoords.y1,
            x2: newX2,
            y2: newY2,
          }
        }
      });
    }

    if (updates.length > 0) {
      updateShapes(updates);
      toast.success(`${updates.length + 1} objekt synkade till samma längd (Shift+drag)`);
    }
  }, [scaleSettings.pixelsPerMm, updateShapes]);

  // Transformer removed - shapes handle their own drag and selection
  // Multi-select is handled by unified drag system

  // Main render
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        touchAction: 'none', // Prevent browser zoom/pan on touch
      }}
      onContextMenu={handleContextMenu}
    >
      {/* Zoom in/out + fit-to-screen controls (bottom-right) */}
      <ZoomControls />

      {/* Hidden file input for image import from context menu */}
      <input
        ref={imageFileInputRef}
        type="file"
        accept="image/*"
        onChange={handleCanvasImageImport}
        className="hidden"
      />

      {/* Empty state — shown when canvas has no shapes */}
      {currentShapes.length === 0 && !isReadOnly && (
        <CanvasEmptyState
          simplified={simplified}
          onAIImport={() => window.dispatchEvent(new CustomEvent('openAIImport'))}
          onDrawRoom={() => setActiveTool('room')}
          onImageFile={uploadImageToCanvas}
        />
      )}

      {/* Text Input Dialog (fallback for new text creation) */}
      <TextInputDialog
        state={textDialog.state}
        onStateChange={textDialog.updateState}
        onSubmit={addShape}
        onUpdate={updateShape}
        currentPlanId={currentPlanId}
      />

      {/* HTML overlay for shapes with rich text (renders formatted text over Konva) */}
      <TextHtmlOverlay
        shapes={currentShapes}
        viewState={viewState}
        editingShapeId={inlineEditShape?.id ?? null}
      />

      {/* Inline text editor — WYSIWYG on canvas */}
      {inlineEditShape && (
        <InlineTextEditor
          shape={inlineEditShape}
          viewState={viewState}
          onSave={(id, updates) => updateShape(id, updates)}
          onClose={() => setInlineEditShape(null)}
        />
      )}
      
      {/* Name Room Dialog */}
      <NameRoomDialog
        open={isNameRoomDialogOpen}
        onOpenChange={setIsNameRoomDialogOpen}
        onConfirm={async (name, color) => {
          if (selectedShapeForNaming) {
            const shape = currentShapes.find(s => s.id === selectedShapeForNaming);
            if (shape && shape.type === 'room') {
              // Update local shape with name and optional preset color
              const updates: Partial<FloorMapShape> = { name };
              if (color) {
                updates.style = { ...(shape.style || {}), fill: color, fillOpacity: 0.3 };
              }
              updateShape(selectedShapeForNaming, updates);
              // Save room to database and get roomId
              const roomId = await saveRoomToDB({ ...shape, name });
              if (roomId) {
                toast.success(`Rum "${name}" sparat!`);
              }

              // Model A (simplified): the room's own outline IS the wall — we no
              // longer create separate wall objects. Clear any legacy auto-walls on
              // this plan so they don't double up with the room outlines.
              if (simplified) {
                const oldAutoWalls = currentShapes.filter(
                  s => s.type === 'wall' && s.planId === currentPlanId && s.metadata?.autoGenerated
                );
                if (oldAutoWalls.length > 0) {
                  deleteShapes(oldAutoWalls.map(w => w.id));
                }
              }
            }
          }
          setIsNameRoomDialogOpen(false);
          setSelectedShapeForNaming(null);
        }}
        onCancel={() => {
          setIsNameRoomDialogOpen(false);
          setSelectedShapeForNaming(null);
        }}
      />
      
      {/* Room Detail Dialog */}
      {currentProjectId && (
        <RoomDetailDialog
          open={isRoomDetailOpen}
          onOpenChange={setIsRoomDetailOpen}
          room={roomData}
          projectId={currentProjectId}
          onRoomUpdated={() => {
            setRoomData(null);
            setSelectedRoomForDetail(null);
          }}
          onViewElevation={() => {
            // Find the room shape by roomId
            const roomShape = currentShapes.find(s => s.roomId === selectedRoomForDetail);
            if (roomShape) {
              // Clear any previous wall selection - start at first wall (wall #1)
              setElevationInitialWallId(undefined);
              setRoomElevationShape(roomShape);
            }
          }}
        />
      )}

      {/* Room Elevation View */}
      {roomElevationShape && currentProjectId && (
        <RoomElevationView
          room={roomElevationShape}
          projectId={currentProjectId}
          initialWallId={elevationInitialWallId}
          onClose={() => {
            setRoomElevationShape(null);
            setElevationInitialWallId(undefined);
          }}
        />
      )}

      {/* Wall Elevation View - shows combined collinear walls */}
      {wallElevationId && currentProjectId && (
        <WallElevationView
          wallId={wallElevationId}
          projectId={currentProjectId}
          onClose={() => setWallElevationId(null)}
        />
      )}

      {/* Property Panel */}
      {/* PropertyPanel - for all shapes EXCEPT rooms (rooms use RoomDetailDialog) */}
      {showPropertyPanel && propertyPanelShape && currentProjectId && propertyPanelShape.type !== 'room' && (
        (() => {
          // Calculate wall index for display
          const isWall = propertyPanelShape.type === 'wall' || propertyPanelShape.type === 'line';
          const walls = isWall ? currentShapes.filter(s => s.type === 'wall' || s.type === 'line') : [];
          const wallIndex = isWall ? walls.findIndex(w => w.id === propertyPanelShape.id) + 1 : undefined;
          const totalWalls = isWall ? walls.length : undefined;

          return (
          <PropertyPanel
            shape={propertyPanelShape}
            projectId={currentProjectId}
            pixelsPerMm={scaleSettings.pixelsPerMm}
            selectedShapeIds={selectedShapeIds}
            allShapes={currentShapes}
            wallIndex={wallIndex}
            totalWalls={totalWalls}
            onClose={() => {
              setShowPropertyPanel(false);
              setPropertyPanelShape(null);
            }}
            onUpdateShape={(shapeId, updates) => {
              updateShape(shapeId, updates);
              setPropertyPanelShape({ ...propertyPanelShape, ...updates });
            }}
            onUpdateShapes={(updates) => {
              updateShapes(updates);
              // Update the property panel shape if it was included in the batch
              const currentShapeUpdate = updates.find(u => u.id === propertyPanelShape.id);
              if (currentShapeUpdate) {
                setPropertyPanelShape({ ...propertyPanelShape, ...currentShapeUpdate.updates });
              }
            }}
          />
          );
        })()
      )}

      {/* Floating Wall Elevation Button - Shows when a wall is selected */}
      {(() => {
        // Check if a wall is selected (single selection)
        const selectedWall = selectedShapeIds.length === 1
          ? currentShapes.find(s => s.id === selectedShapeIds[0] && (s.type === 'wall' || s.type === 'line'))
          : null;

        if (!selectedWall) return null;

        // Calculate button position near the wall's midpoint
        const wallCoords = selectedWall.coordinates as { x1: number; y1: number; x2: number; y2: number };
        if (!wallCoords.x1) return null;

        const wallMidX = (wallCoords.x1 + wallCoords.x2) / 2;
        const wallMidY = (wallCoords.y1 + wallCoords.y2) / 2;

        // Convert to screen coordinates
        const screenX = wallMidX * scaleSettings.pixelsPerMm * viewState.zoom + viewState.panX;
        const screenY = wallMidY * scaleSettings.pixelsPerMm * viewState.zoom + viewState.panY;

        // Only show if on screen
        if (screenX < 0 || screenX > window.innerWidth || screenY < 0 || screenY > window.innerHeight) {
          return null;
        }

        return (
          <button
            onClick={() => {
              // Open combined wall elevation view for this wall
              // This shows all collinear (same-line) wall segments plus openings
              setWallElevationId(selectedWall.id);
            }}
            className="fixed z-50 flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-full shadow-lg transition-all hover:scale-105"
            style={{
              left: `${Math.min(Math.max(screenX - 60, 60), window.innerWidth - 180)}px`,
              top: `${Math.min(Math.max(screenY - 50, 60), window.innerHeight - 60)}px`,
            }}
            title="Visa väggvy (Elevation)"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
            <span className="text-sm font-medium">Väggvy</span>
          </button>
        );
      })()}

      {/* Konva Stage */}
      <Stage
        ref={stageRef}
        width={stageSize.w}
        height={stageSize.h}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleStageClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
        scaleX={viewState.zoom}
        scaleY={viewState.zoom}
        x={viewState.panX}
        y={viewState.panY}
        draggable={false}
      >
        <Layer>
          {/* Grid */}
          <Grid
            viewState={viewState}
            scaleSettings={scaleSettings}
            projectSettings={projectSettings}
          />
          
          {/* Drawing preview - for walls and freehand */}
          {isDrawing && currentDrawingPoints.length > 0 && (
            <Line
              points={currentDrawingPoints.flatMap(p => [p.x, p.y])}
              stroke="#3b82f6"
              strokeWidth={2 / viewState.zoom}
              dash={[10 / viewState.zoom, 5 / viewState.zoom]}
              listening={false}
            />
          )}

          {/* Live length label for straight line tools (wall/window/door/opening).
              The created shape spans first→last point, so label that span's midpoint. */}
          {isDrawing && currentDrawingPoints.length >= 2 &&
            (activeTool === 'wall' || activeTool === 'window_line' || activeTool === 'door_line' ||
             activeTool === 'sliding_door_line' || activeTool === 'opening_line') &&
            (() => {
              const a = currentDrawingPoints[0];
              const b = currentDrawingPoints[currentDrawingPoints.length - 1];
              const lenMm = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2) / scaleSettings.pixelsPerMm;
              if (lenMm < 1) return null;
              const fontSize = 12 / viewState.zoom;
              const pad = 4 / viewState.zoom;
              const label = formatMeasurement(lenMm, projectSettings.unit);
              const w = label.length * fontSize * 0.62 + pad * 2;
              const h = fontSize + pad * 1.5;
              const offset = 14 / viewState.zoom; // lift the chip off the line
              return (
                <Group x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - offset} listening={false}>
                  <Rect x={-w / 2} y={-h / 2} width={w} height={h} fill="rgba(255,255,255,0.92)" cornerRadius={3 / viewState.zoom} />
                  <KonvaText x={-w / 2} y={-h / 2} width={w} height={h} text={label} fontSize={fontSize} fill="#2563eb" align="center" verticalAlign="middle" />
                </Group>
              );
            })()}

          {/* Ghost preview for stamp placement mode (library objects/symbols) */}
          <GhostPreviewOverlay
            ghostPreview={ghostPreview}
            pendingLibrarySymbol={pendingLibrarySymbol}
            pendingObjectId={pendingObjectId}
            zoom={viewState.zoom}
            pixelsPerMm={scaleSettings.pixelsPerMm}
          />

          {/* Selection/creation preview (box, circle, bezier) */}
          <SelectionPreviewOverlay
            isBoxSelecting={isBoxSelecting}
            selectionBox={selectionBox}
            activeTool={activeTool}
            zoom={viewState.zoom}
            pixelsPerMm={scaleSettings.pixelsPerMm}
            unit={projectSettings.unit}
          />

          {/* Measurement line - for ruler/measure tool */}
          <MeasurementOverlay
            measureStart={measureStart}
            measureEnd={measureEnd}
            zoom={viewState.zoom}
            pixelsPerMm={scaleSettings.pixelsPerMm}
          />

          {/* Multi-selection bounding box - visual indicator for group selection */}
          <MultiSelectionBoundsOverlay
            selectedShapeIds={selectedShapeIds}
            currentShapes={currentShapes}
            isBoxSelecting={isBoxSelecting}
            zoom={viewState.zoom}
          />

          {/* Template Groups - rendered as unified transformable units */}
          <Group listening={!isReadOnly && activeTool !== 'measure'}>
            {templateGroups.map(({ groupId, shapes: groupShapes, leader }) => {
              const isGroupSelected = groupShapes.some(s => selectedShapeIds.includes(s.id));
              // Check if any shape in this group is individually selected
              const individualId = groupShapes.find(s => s.id === selectedGroupIndividualId)?.id || null;
              return (
                <TemplateGroupShape
                  key={`group-${groupId}`}
                  shapes={groupShapes}
                  groupLeader={leader}
                  isSelected={!isReadOnly && isGroupSelected}
                  selectedIndividualId={individualId}
                  onSelect={() => handleGroupSelect(groupId)}
                  onSelectIndividual={handleGroupIndividualSelect}
                  onOpenPropertyPanel={handleGroupOpenPropertyPanel}
                  onTransformGroup={handleGroupTransform}
                  pixelsPerMm={scaleSettings.pixelsPerMm}
                  gridSnapSize={projectSettings.snapEnabled ? projectSettings.gridInterval * scaleSettings.pixelsPerMm : 0}
                  snapEnabled={projectSettings.snapEnabled}
                  showDimensions={projectSettings.showDimensions}
                />
              );
            })}
          </Group>

          {/* Room shapes - rendered first (bottom layer), always listening for read-only click-through, disabled in measure mode */}
          <Group listening={activeTool !== 'measure'}>
          {(() => {
            const sortedShapes = [...individualShapes].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
            return sortedShapes.filter(s => s.type === 'room').map((shape) => {
              const isSelected = isReadOnly ? false : selectedShapeIds.includes(shape.id);
              const openRoomDetail = () => {
                if (shape.roomId) {
                  setShowPropertyPanel(false);
                  setPropertyPanelShape(null);
                  setSelectedRoomForDetail(shape.roomId);
                  setIsRoomDetailOpen(true);
                  toast.success(t('floormap.openingRoomDetails', 'Opening room details'));
                } else {
                  toast.info(t('floormap.roomMustBeSavedFirst', 'Room must be named and saved first.'));
                }
              };
              const handleSelect = isReadOnly
                ? (() => { openRoomDetail(); })
                : (evt?: KonvaEventObject<MouseEvent>) => handleShapeClick(shape.id, shape.type, evt);
              const handleTransform = isReadOnly ? (() => {}) : (updates: Partial<FloorMapShape>) => handleShapeTransform(shape.id, updates);
              const handleRoomDoubleClick = openRoomDetail;
              const roomIsHighlighted = !!(highlightedRoomIds && shape.roomId && highlightedRoomIds.includes(shape.roomId));
              return (
                <RoomShape
                  key={shape.id}
                  shape={shape}
                  isSelected={isSelected}
                  onSelect={handleSelect}
                  onDoubleClick={handleRoomDoubleClick}
                  onTransform={handleTransform}
                  shapeRefsMap={shapeRefs.current}
                  viewState={viewState}
                  scaleSettings={scaleSettings}
                  projectSettings={projectSettings}
                  snapSize={100 * scaleSettings.pixelsPerMm}
                  isReadOnly={isReadOnly}
                  isHighlighted={roomIsHighlighted}
                  simplified={simplified}
                />
              );
            });
          })()}
          </Group>

          {/* Non-room individual shapes - sorted by zIndex, disabled in read-only and measure mode */}
          <Group listening={!isReadOnly && activeTool !== 'measure'}>
          {/* Unified wall outlines - renders merged L-shapes FIRST (underneath shapes).
              In simplified mode (Model A) the room outline is the wall, so auto-generated
              wall objects are hidden — only manually drawn walls (pro) still render. */}
          <WallGroupOutline
            walls={currentShapes.filter(s => (s.type === 'wall' || s.type === 'line') && !(simplified && s.metadata?.autoGenerated))}
            selectedIds={selectedShapeIds}
            zoom={viewState.zoom}
          />
          {/* Wall snap indicator - visual feedback during drag */}
          {wallSnapPreview && (
            <WallSnapIndicator
              wallId={wallSnapPreview.wallId}
              snapPoint={wallSnapPreview.snapPoint}
              snapRotation={wallSnapPreview.snapRotation}
              walls={currentShapes.filter(s => s.type === 'wall' || s.type === 'line')}
              zoom={viewState.zoom}
            />
          )}
          {(() => {
            // Pre-calculate wall indices for display
            const sortedShapes = [...individualShapes].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
            // Model A: hide auto-generated wall objects in simplified mode (room outline = wall).
            const nonRoomShapes = sortedShapes.filter(
              s => s.type !== 'room' && !(simplified && (s.type === 'wall' || s.type === 'line') && s.metadata?.autoGenerated)
            );
            const walls = nonRoomShapes.filter(s => s.type === 'wall' || s.type === 'line');
            const wallIndexMap = new Map<string, number>();
            walls.forEach((wall, idx) => wallIndexMap.set(wall.id, idx + 1));
            const totalWalls = walls.length;

            return nonRoomShapes.map((shape) => {
            const isSelected = isReadOnly ? false : selectedShapeIds.includes(shape.id);
            const handleSelect = isReadOnly ? undefined : (evt?: KonvaEventObject<MouseEvent>) => handleShapeClick(shape.id, shape.type, evt);
            const handleTransform = isReadOnly ? (() => {}) : (updates: Partial<FloorMapShape>) => handleShapeTransform(shape.id, updates);

            if (shape.type === 'freehand' || shape.type === 'polygon') {
              if (shape.metadata?.isLibrarySymbol) {
                return (<LibrarySymbolShape key={shape.id} shape={shape} isSelected={isSelected} onSelect={handleSelect} onTransform={handleTransform} shapeRefsMap={shapeRefs.current} />);
              }
              // Render unified objects (new SVG-based library)
              if (shape.metadata?.isUnifiedObject && shape.metadata?.unifiedObjectId) {
                const unifiedDef = getUnifiedObjectById(shape.metadata.unifiedObjectId as string);
                if (unifiedDef) {
                  const scale = (shape.metadata.scale as number) || 1;
                  let posX = (shape.metadata.placementX as number) || 0;
                  let posY = (shape.metadata.placementY as number) || 0;
                  let rotation = shape.rotation || 0;

                  // If object has wallRelative data, calculate position from wall
                  if (shape.wallRelative?.wallId) {
                    const wall = shapes.find(s => s.id === shape.wallRelative?.wallId);
                    if (wall) {
                      // Wall coordinates are in pixels, wallRelative distances are in mm
                      // We need to:
                      // 1. Get wall geometry (in pixels)
                      // 2. Calculate position along wall using mm distances converted to pixels
                      const wallCoords = wall.coordinates as { x1: number; y1: number; x2: number; y2: number };
                      if (wallCoords && typeof wallCoords.x1 === 'number') {
                        const dx = wallCoords.x2 - wallCoords.x1;
                        const dy = wallCoords.y2 - wallCoords.y1;
                        const wallLengthPx = Math.sqrt(dx * dx + dy * dy);
                        const angle = Math.atan2(dy, dx);

                        // Unit vectors
                        const unitX = dx / wallLengthPx;
                        const unitY = dy / wallLengthPx;
                        const normalX = -unitY;
                        const normalY = unitX;

                        // Convert mm distances to pixels
                        const distAlongPx = (shape.wallRelative.distanceFromWallStart + shape.wallRelative.width / 2) * scaleSettings.pixelsPerMm;
                        const perpOffsetPx = (shape.wallRelative.perpendicularOffset + shape.wallRelative.depth / 2) * scaleSettings.pixelsPerMm;

                        // Calculate position
                        posX = wallCoords.x1 + distAlongPx * unitX + perpOffsetPx * normalX;
                        posY = wallCoords.y1 + distAlongPx * unitY + perpOffsetPx * normalY;
                        rotation = (angle * 180) / Math.PI;
                      }
                    }
                  }

                  const symbol = unifiedDef.floorPlanSymbol;
                  const width = unifiedDef.dimensions.width * scaleSettings.pixelsPerMm * scale;
                  const height = unifiedDef.dimensions.depth * scaleSettings.pixelsPerMm * scale;
                  const [, , vbWidth, vbHeight] = symbol.viewBox.split(' ').map(Number);
                  const scaleX = width / vbWidth;
                  const scaleY = height / vbHeight;
                  const canSelect = activeTool === 'select';

                  // Track if object is wall-attached (for visual indicator)
                  const isWallAttached = Boolean(shape.wallRelative?.wallId);

                  // Comment count for this object
                  const objectCommentCount = commentCounts[shape.id] || 0;
                  const hasComments = objectCommentCount > 0;
                  const isCommentResolved = resolvedStatus[shape.id] || false;

                  return (
                    <Group
                      key={shape.id}
                      id={shape.id}
                      name={shape.id}
                      x={posX}
                      y={posY}
                      rotation={rotation}
                      draggable={canSelect}
                      listening={canSelect}
                      onClick={(e) => {
                        e.cancelBubble = true;
                        handleSelect(e);
                      }}
                      onTap={(e) => {
                        e.cancelBubble = true;
                        handleSelect(e);
                      }}
                      onDragStart={(e) => {
                        e.cancelBubble = true;
                      }}
                      onDragEnd={(e) => {
                        e.cancelBubble = true;
                        // Get new position from drag
                        const newX = e.target.x();
                        const newY = e.target.y();

                        // Find nearest wall within threshold (300mm = 30cm)
                        const WALL_SNAP_THRESHOLD_MM = 300;
                        const thresholdPx = WALL_SNAP_THRESHOLD_MM * scaleSettings.pixelsPerMm;
                        const walls = shapes.filter(s => s.type === 'wall' || s.type === 'line');

                        let nearestWall: FloorMapShape | null = null;
                        let nearestDist = thresholdPx;
                        let nearestT = 0;

                        for (const wall of walls) {
                          const wc = wall.coordinates as { x1: number; y1: number; x2: number; y2: number };
                          if (!wc || typeof wc.x1 !== 'number') continue;

                          // Calculate distance from point to wall segment
                          const dx = wc.x2 - wc.x1;
                          const dy = wc.y2 - wc.y1;
                          const wallLenSq = dx * dx + dy * dy;
                          if (wallLenSq === 0) continue;

                          // Project point onto wall line
                          let t = ((newX - wc.x1) * dx + (newY - wc.y1) * dy) / wallLenSq;
                          t = Math.max(0, Math.min(1, t)); // Clamp to wall segment

                          const projX = wc.x1 + t * dx;
                          const projY = wc.y1 + t * dy;
                          const dist = Math.sqrt((newX - projX) ** 2 + (newY - projY) ** 2);

                          if (dist < nearestDist) {
                            nearestDist = dist;
                            nearestWall = wall;
                            nearestT = t;
                          }
                        }

                        if (nearestWall) {
                          // Snap to wall - calculate wall-relative position
                          const wc = nearestWall.coordinates as { x1: number; y1: number; x2: number; y2: number };
                          const dx = wc.x2 - wc.x1;
                          const dy = wc.y2 - wc.y1;
                          const wallLengthPx = Math.sqrt(dx * dx + dy * dy);
                          const wallLengthMM = wallLengthPx / scaleSettings.pixelsPerMm;

                          // Distance along wall in mm
                          const distAlongMM = nearestT * wallLengthMM - (unifiedDef.dimensions.width / 2);

                          // Perpendicular offset in mm (how far from wall center)
                          const perpDistPx = nearestDist;
                          const perpDistMM = perpDistPx / scaleSettings.pixelsPerMm - (unifiedDef.dimensions.depth / 2);

                          // Preserve elevation or use default
                          const elevationBottom = shape.wallRelative?.elevationBottom ??
                            unifiedDef.wallBehavior.defaultElevationMM;

                          updateShape(shape.id, {
                            wallRelative: {
                              wallId: nearestWall.id,
                              distanceFromWallStart: Math.max(0, distAlongMM),
                              perpendicularOffset: Math.max(0, perpDistMM),
                              elevationBottom,
                              width: unifiedDef.dimensions.width,
                              height: unifiedDef.dimensions.height,
                              depth: unifiedDef.dimensions.depth,
                            },
                            metadata: {
                              ...shape.metadata,
                              placementX: newX,
                              placementY: newY,
                            },
                          });
                        } else {
                          // No wall nearby - make freestanding (remove wallRelative)
                          updateShape(shape.id, {
                            wallRelative: undefined,
                            metadata: {
                              ...shape.metadata,
                              placementX: newX,
                              placementY: newY,
                            },
                          });
                        }

                        // Reset node position (store update will re-render)
                        e.target.position({ x: posX, y: posY });
                      }}
                      onDblClick={(e) => {
                        e.cancelBubble = true;
                        // Open property panel on double-click
                        setPropertyPanelShape(shape);
                        setShowPropertyPanel(true);
                      }}
                      onContextMenu={(e) => {
                        e.evt.preventDefault();
                        e.cancelBubble = true;
                        // Open comment popover on right-click
                        const stage = e.target.getStage();
                        if (stage) {
                          const containerRect = stage.container().getBoundingClientRect();
                          const pointer = stage.getPointerPosition();
                          if (pointer) {
                            setActiveComment({
                              objectId: shape.id,
                              position: {
                                x: containerRect.left + pointer.x,
                                y: containerRect.top + pointer.y,
                              },
                            });
                          }
                        }
                      }}
                      onMouseEnter={(e) => {
                        const container = e.target.getStage()?.container();
                        if (container) container.style.cursor = 'pointer';
                        setHoveredShapeId(shape.id);
                        setHoverMousePosition({ x: e.evt.clientX, y: e.evt.clientY });
                      }}
                      onMouseLeave={(e) => {
                        const container = e.target.getStage()?.container();
                        if (container) container.style.cursor = activeTool === 'select' ? 'default' : 'crosshair';
                        setHoveredShapeId(null);
                        setHoverMousePosition(null);
                      }}
                      onMouseMove={(e) => {
                        if (hoveredShapeId === shape.id) {
                          setHoverMousePosition({ x: e.evt.clientX, y: e.evt.clientY });
                        }
                      }}
                      ref={(node) => {
                        if (node) shapeRefs.current.set(shape.id, node);
                      }}
                    >
                      {/* Hit area with shapeId for hover detection */}
                      <Rect
                        x={-width / 2 - 4 / viewState.zoom}
                        y={-height / 2 - 4 / viewState.zoom}
                        width={width + 8 / viewState.zoom}
                        height={height + 8 / viewState.zoom}
                        fill="transparent"
                        shapeId={shape.id}
                      />
                      {/* Selection highlight */}
                      {isSelected && (
                        <Rect
                          x={-width / 2 - 4 / viewState.zoom}
                          y={-height / 2 - 4 / viewState.zoom}
                          width={width + 8 / viewState.zoom}
                          height={height + 8 / viewState.zoom}
                          fill="rgba(59, 130, 246, 0.1)"
                          stroke="#3b82f6"
                          strokeWidth={2 / viewState.zoom}
                          dash={[4 / viewState.zoom, 4 / viewState.zoom]}
                          listening={false}
                        />
                      )}
                      {/* Wall attachment indicator */}
                      {isWallAttached && (
                        <Line
                          points={[0, -height/2 - 2/viewState.zoom, 0, height/2 + 2/viewState.zoom]}
                          stroke={isSelected ? '#3b82f6' : '#9ca3af'}
                          strokeWidth={3 / viewState.zoom}
                          lineCap="round"
                          listening={false}
                        />
                      )}
                      {/* SVG Symbol */}
                      <Group x={-width / 2} y={-height / 2}>
                        {symbol.paths.map((path, index) => (
                          <Path
                            key={index}
                            data={path.d}
                            fill={path.fill || 'none'}
                            stroke={isSelected ? '#3b82f6' : (path.stroke || '#374151')}
                            strokeWidth={(path.strokeWidth || 2) * Math.min(scaleX, scaleY)}
                            scaleX={scaleX}
                            scaleY={scaleY}
                            listening={false}
                            perfectDrawEnabled={false}
                          />
                        ))}
                      </Group>
                    </Group>
                  );
                }
              }
              if (shape.metadata?.isObjectLibrary) {
                return (<ObjectLibraryShape key={shape.id} shape={shape} isSelected={isSelected} onSelect={handleSelect} onTransform={handleTransform} shapeRefsMap={shapeRefs.current} />);
              }
              return (<FreehandShape key={shape.id} shape={shape} isSelected={isSelected} onSelect={handleSelect} onTransform={handleTransform} shapeRefsMap={shapeRefs.current} />);
            }

            if (shape.type === 'wall' || shape.type === 'line') {
              const handleBatchLength = (newLengthMM: number) => handleBatchWallLengthChange(shape.id, newLengthMM);
              const wallIndex = wallIndexMap.get(shape.id);
              return (<WallShape key={shape.id} shape={shape} isSelected={isSelected} onSelect={handleSelect} onTransform={handleTransform} shapeRefsMap={shapeRefs.current} viewState={viewState} scaleSettings={scaleSettings} projectSettings={projectSettings} onBatchLengthChange={handleBatchLength} wallIndex={wallIndex} totalWalls={totalWalls} />);
            }
            
            if (shape.type === 'rectangle') {
              return (<RectangleShape key={shape.id} shape={shape} isSelected={isSelected} onSelect={handleSelect} onTransform={handleTransform} shapeRefsMap={shapeRefs.current} />);
            }
            
            if (shape.type === 'circle') {
              return (<CircleShape key={shape.id} shape={shape} isSelected={isSelected} onSelect={handleSelect} onTransform={handleTransform} shapeRefsMap={shapeRefs.current} />);
            }
            
            if (shape.type === 'text') {
              if (inlineEditShape?.id === shape.id) return null;
              return (<TextShape key={shape.id} shape={shape} isSelected={isSelected} onSelect={handleSelect} onTransform={handleTransform} shapeRefsMap={shapeRefs.current} onEdit={handleTextEdit} />);
            }

            if (shape.type === 'sticky_note') {
              // Hide Konva shape while inline editor is open (avoids visual duplication)
              if (inlineEditShape?.id === shape.id) return null;
              return (<StickyNoteShape key={shape.id} shape={shape} isSelected={isSelected} onSelect={handleSelect} onTransform={handleTransform} shapeRefsMap={shapeRefs.current} onEdit={handleTextEdit} />);
            }

            if (shape.type === 'bezier') {
              return (<BezierShape key={shape.id} shape={shape} isSelected={isSelected} onSelect={handleSelect} onTransform={handleTransform} shapeRefsMap={shapeRefs.current} viewState={viewState} scaleSettings={scaleSettings} projectSettings={projectSettings} />);
            }

            if (shape.type === 'connector') {
              return (<ConnectorShape key={shape.id} shape={shape} isSelected={isSelected} onSelect={handleSelect} onTransform={handleTransform} shapeRefsMap={shapeRefs.current} viewState={viewState} scaleSettings={scaleSettings} projectSettings={projectSettings} />);
            }

            // Line-based opening shapes (window, door, sliding door)
            if (shape.type === 'window_line') {
              const handleBatchLength = (newLengthMM: number) => handleBatchWallLengthChange(shape.id, newLengthMM);
              return (<WindowLineShape key={shape.id} shape={shape} isSelected={isSelected} onSelect={handleSelect} onTransform={handleTransform} shapeRefsMap={shapeRefs.current} viewState={viewState} scaleSettings={scaleSettings} projectSettings={projectSettings} onBatchLengthChange={handleBatchLength} />);
            }

            if (shape.type === 'door_line') {
              const handleBatchLength = (newLengthMM: number) => handleBatchWallLengthChange(shape.id, newLengthMM);
              return (<DoorLineShape key={shape.id} shape={shape} isSelected={isSelected} onSelect={handleSelect} onTransform={handleTransform} shapeRefsMap={shapeRefs.current} viewState={viewState} scaleSettings={scaleSettings} projectSettings={projectSettings} onBatchLengthChange={handleBatchLength} />);
            }

            if (shape.type === 'sliding_door_line') {
              const handleBatchLength = (newLengthMM: number) => handleBatchWallLengthChange(shape.id, newLengthMM);
              return (<SlidingDoorLineShape key={shape.id} shape={shape} isSelected={isSelected} onSelect={handleSelect} onTransform={handleTransform} shapeRefsMap={shapeRefs.current} viewState={viewState} scaleSettings={scaleSettings} projectSettings={projectSettings} onBatchLengthChange={handleBatchLength} />);
            }

            if (shape.type === 'opening_line') {
              const handleBatchLength = (newLengthMM: number) => handleBatchWallLengthChange(shape.id, newLengthMM);
              return (<OpeningLineShape key={shape.id} shape={shape} isSelected={isSelected} onSelect={handleSelect} onTransform={handleTransform} shapeRefsMap={shapeRefs.current} viewState={viewState} scaleSettings={scaleSettings} projectSettings={projectSettings} onBatchLengthChange={handleBatchLength} />);
            }

            // Background image shapes
            if (shape.type === 'image') {
              return (<ImageShape key={shape.id} shape={shape} isSelected={isSelected} onSelect={handleSelect} onTransform={handleTransform} shapeRefsMap={shapeRefs.current} />);
            }

            return null;
          });
          })()}
          </Group>

          {/* Selected room vertex handles - rendered ABOVE walls for easier editing */}
          {/* This is a separate pass that only renders handles for selected rooms */}
          <Group listening={!isReadOnly && activeTool !== 'measure'}>
            {(() => {
              const rooms = currentShapes.filter(s => s.type === 'room');
              const selectedRooms = rooms.filter(room => selectedShapeIds.includes(room.id));

              return selectedRooms.map(shape => {
                const handleTransform = isReadOnly ? (() => {}) : (updates: Partial<FloorMapShape>) => handleShapeTransform(shape.id, updates);
                return (
                  <RoomShape
                    key={`handles-${shape.id}`}
                    shape={shape}
                    isSelected={true}
                    onSelect={() => {}}
                    onDoubleClick={() => {}}
                    onTransform={handleTransform}
                    shapeRefsMap={shapeRefs.current}
                    viewState={viewState}
                    scaleSettings={scaleSettings}
                    projectSettings={projectSettings}
                    snapSize={100 * scaleSettings.pixelsPerMm}
                    isReadOnly={isReadOnly}
                    renderHandlesOnly={true}
                  />
                );
              });
            })()}
          </Group>

          {/* Transformer removed - shapes handle their own selection visual (blue stroke) */}
          {/* Multi-select dragging handled by unified drag system */}

          {/* Connector anchor handles - Miro-style dots on hovered or selected connectable shapes */}
          {!isReadOnly && activeTool === 'select' && (() => {
            const targetId =
              hoveredShapeId ||
              (selectedShapeIds.length === 1 ? selectedShapeIds[0] : null);
            if (!targetId) return null;
            const target = currentShapes.find(s => s.id === targetId);
            if (!target || !isConnectableShape(target)) return null;
            return (
              <ConnectorAnchorHandles
                key={`anchors-${targetId}`}
                shape={target}
                zoom={viewState.zoom}
                onAnchorMouseDown={handleAnchorMouseDown}
              />
            );
          })()}

          {/* Comment indicators - blue badges on shapes with comments */}
          <CommentBadgesLayer
            shapes={currentShapes}
            allShapes={shapes}
            commentCounts={commentCounts}
            resolvedStatus={resolvedStatus}
            viewState={viewState}
            scaleSettings={scaleSettings}
            onBadgeClick={handleOpenComments}
          />
        </Layer>
      </Stage>

      {/* CAD-style numeric input overlay - shows typed length during wall drawing */}
      {showNumericInput && isDrawing && currentDrawingPoints.length > 0 && (
        <div
          style={{
            position: 'fixed',
            left: currentMousePosRef.current.x * viewState.zoom + viewState.panX + 20,
            top: currentMousePosRef.current.y * viewState.zoom + viewState.panY - 30,
            background: '#1e293b',
            color: '#fff',
            padding: '6px 12px',
            borderRadius: '6px',
            fontSize: '14px',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            fontWeight: 600,
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            pointerEvents: 'none',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <span style={{ color: '#60a5fa' }}>{numericInput || '0'}</span>
          <span style={{ color: '#94a3b8', fontSize: '12px' }}>mm</span>
          <span style={{ color: '#475569', fontSize: '11px', marginLeft: '8px' }}>Enter ↵</span>
        </div>
      )}


      {/* Context Menu (right-click) */}
      {contextMenuPos && (
        <ToolContextMenu
          x={contextMenuPos.x}
          y={contextMenuPos.y}
          recentTools={recentTools}
          onSelectTool={(tool) => {
            setActiveTool(tool);
            closeContextMenu();
          }}
          onClose={closeContextMenu}
          onOpenAIImport={() => {
            window.dispatchEvent(new CustomEvent('openAIImport'));
          }}
          onOpenImageImport={() => {
            imageFileInputRef.current?.click();
          }}
          onOpenPinterestImport={showPinterest ? () => {
            window.dispatchEvent(new CustomEvent('openPinterestImport'));
          } : undefined}
          onOpenTemplates={() => {
            window.dispatchEvent(new CustomEvent('openTemplateGallery'));
          }}
          // Selection-related props
          hasSelection={selectedShapeIds.length > 0}
          selectionCount={selectedShapeIds.length}
          selectionType={selectedShapeIds.length > 0 ? currentShapes.find(s => s.id === selectedShapeIds[0])?.type : undefined}
          hasRoomInSelection={selectedShapeIds.some(id => currentShapes.find(s => s.id === id)?.type === 'room')}
          hasWallInSelection={selectedShapeIds.some(id => {
            const shape = currentShapes.find(s => s.id === id);
            return shape?.type === 'wall' || shape?.type === 'line';
          })}
          onAddComment={selectedShapeIds.length === 1 ? () => handleOpenComments() : undefined}
          commentCount={selectedShapeIds.length === 1 ? commentCounts[selectedShapeIds[0]] : undefined}
          isCommentResolved={selectedShapeIds.length === 1 ? resolvedStatus[selectedShapeIds[0]] : undefined}
          onShowProperties={() => {
            // Find the selected shape(s) and open property panel
            if (selectedShapeIds.length > 0) {
              const firstSelectedShape = currentShapes.find(s => s.id === selectedShapeIds[0]);
              if (firstSelectedShape) {
                // For rooms with roomId, open room detail dialog
                if (firstSelectedShape.type === 'room' && firstSelectedShape.roomId) {
                  setShowPropertyPanel(false);
                  setPropertyPanelShape(null);
                  setSelectedRoomForDetail(firstSelectedShape.roomId);
                  setIsRoomDetailOpen(true);
                } else {
                  // For other shapes, open property panel
                  setSelectedShapeId(firstSelectedShape.id);
                  setPropertyPanelShape(firstSelectedShape);
                  setShowPropertyPanel(true);
                }
              }
            }
          }}
          onDeleteSelection={() => {
            if (selectedShapeIds.length > 0) {
              const deletingRooms = simplified && selectedShapeIds.some(
                id => currentShapes.find(s => s.id === id)?.type === 'room'
              );
              deleteShapes(selectedShapeIds);
              setSelectedShapeIds([]);
              toast.success(`${selectedShapeIds.length > 1 ? selectedShapeIds.length + ' objekt' : 'Objekt'} borttaget`);

              // Regenerate auto-walls when rooms are deleted in simplified mode
              if (deletingRooms) {
                const remaining = useFloorMapStore.getState().shapes;
                const oldAutoWalls = remaining.filter(
                  s => s.type === 'wall' && s.planId === currentPlanId && s.metadata?.autoGenerated
                );
                if (oldAutoWalls.length > 0) {
                  deleteShapes(oldAutoWalls.map(w => w.id));
                }
                const allRooms = remaining.filter(
                  s => s.type === 'room' && s.planId === currentPlanId && !selectedShapeIds.includes(s.id)
                );
                const manualWalls = remaining.filter(
                  s => s.type === 'wall' && s.planId === currentPlanId && !s.metadata?.autoGenerated && !selectedShapeIds.includes(s.id)
                );
                if (allRooms.length > 0) {
                  const newWalls = generateWallsFromRooms(
                    allRooms, uuidv4, { planId: currentPlanId || undefined }, manualWalls
                  );
                  for (const wall of newWalls) {
                    wall.metadata = { ...wall.metadata, autoGenerated: true };
                    addShape(wall);
                  }
                }
              }
            }
          }}
          onBringForward={() => {
            if (selectedShapeIds.length > 0) {
              selectedShapeIds.forEach(id => bringForward(id));
            }
          }}
          onSendBackward={() => {
            if (selectedShapeIds.length > 0) {
              selectedShapeIds.forEach(id => sendBackward(id));
            }
          }}
          onBringToFront={() => {
            if (selectedShapeIds.length > 0) {
              selectedShapeIds.forEach(id => bringToFront(id));
            }
          }}
          onSendToBack={() => {
            if (selectedShapeIds.length > 0) {
              selectedShapeIds.forEach(id => sendToBack(id));
            }
          }}
          onCreateWallsFromRoom={() => {
            // Find all selected rooms
            const selectedRooms = selectedShapeIds
              .map(id => currentShapes.find(s => s.id === id))
              .filter((s): s is FloorMapShape => s?.type === 'room');

            if (selectedRooms.length > 0) {
              const { wallThicknessMM, wallHeightMM } = getAdminDefaults();

              // Get existing walls to avoid duplicates
              const existingWalls = currentShapes.filter(s => s.type === 'wall' || s.type === 'line');

              // Generate walls with automatic deduplication
              // This prevents duplicate walls where rooms share edges
              const walls = generateWallsFromRooms(selectedRooms, uuidv4, {
                heightMM: wallHeightMM,
                thicknessMM: wallThicknessMM,
                planId: currentPlanId || undefined,
              }, existingWalls);

              walls.forEach(wall => addShape(wall));

              if (walls.length > 0) {
                const roomText = selectedRooms.length === 1 ? 'rummet' : `${selectedRooms.length} rum`;
                const dedupNote = selectedRooms.length > 1 ? ' (utan dubbletter)' : '';
                toast.success(`${walls.length} väggar skapade runt ${roomText}${dedupNote}`);
              }
            }
          }}
          onViewElevation={() => {
            // Find selected room or wall
            if (selectedShapeIds.length > 0) {
              const firstSelected = currentShapes.find(s => s.id === selectedShapeIds[0]);
              if (!firstSelected) return;

              // If a room is selected, show room-centric elevation view
              if (firstSelected.type === 'room') {
                setElevationInitialWallId(undefined); // No specific wall
                setRoomElevationShape(firstSelected);
                return;
              }

              // If a wall is selected, show wall-centric elevation view
              // This shows the entire "logical wall" - all collinear segments plus openings
              if (firstSelected.type === 'wall' || firstSelected.type === 'line') {
                setWallElevationId(firstSelected.id);
              }
            }
          }}
          isSelectionLocked={selectedShapeIds.length > 0 && selectedShapeIds.every(
            id => currentShapes.find(s => s.id === id)?.locked
          )}
          onToggleLock={() => {
            if (selectedShapeIds.length === 0) return;
            const allLocked = selectedShapeIds.every(
              id => currentShapes.find(s => s.id === id)?.locked
            );
            selectedShapeIds.forEach(id => {
              updateShape(id, { locked: !allLocked });
            });
          }}
        />
      )}

      {/* Hover info tooltip - shows dimensions on hover (BIM/CAD standard) */}
      <HoverInfoTooltip
        // Suppress the hover tooltip for a shape that's already selected — its
        // dimensions are shown via the property panel / handles, and because a room
        // polygon fills the canvas the tooltip otherwise reads as permanently "stuck".
        shape={
          hoveredShapeId &&
          hoveredShapeId !== selectedShapeId &&
          !selectedShapeIds.includes(hoveredShapeId)
            ? currentShapes.find(s => s.id === hoveredShapeId) || null
            : null
        }
        mousePosition={hoverMousePosition}
        unit={projectSettings.unit}
        pixelsPerMm={scaleSettings.pixelsPerMm}
      />

      {/* Inline Comments Popover */}
      {activeComment && (
        <InlineCommentPopover
          objectId={activeComment.objectId}
          projectId={currentProjectId}
          position={activeComment.position}
          onClose={handleCloseComments}
          onCommentCountChange={(count) => handleCommentCountChange(activeComment.objectId, count)}
          onResolvedChange={(isResolved) => handleResolvedChange(activeComment.objectId, isResolved)}
          isResolved={resolvedStatus[activeComment.objectId] || false}
        />
      )}
    </div>
  );
};

export default UnifiedKonvaCanvas;

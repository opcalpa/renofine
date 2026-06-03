import { create } from 'zustand';
import { FloorMapShape, FloorMapPlan, ViewMode, Tool, GridSettings, ViewState, SymbolType, ScaleSettings, ScalePreset, GridPreset, WallRelativePosition, WallObjectCategory, Position3D, Rotation3D, LineCoordinates } from './types';
import { Unit, Scale, getDefaultGridInterval } from './utils/formatting';
import { snapObjectToWall, syncFromElevation, setObjectCategory as setObjectCategoryUtil } from './canvas/utils/viewSync';
import { wallRelativeToWorld } from './canvas/utils/wallCoordinates';
import { generateWallsFromRooms } from './utils/roomWalls';
import { v4 as uuidv4 } from 'uuid';

// Scale presets: 1px = X mm
const SCALE_PRESETS: Record<ScalePreset, ScaleSettings> = {
  architectural: { pixelsPerMm: 0.5, name: 'Architectural 1:20', description: 'Professional building plans' }, // 1px = 2mm (1:20 scale)
  detailed: { pixelsPerMm: 0.2, name: 'Detailed 1:50', description: 'For small rooms/details' }, // 1px = 5mm (1:50 scale)
  standard: { pixelsPerMm: 0.1, name: 'Standard 1:100', description: 'Default for most apartments/houses' }, // 1px = 10mm (1:100 scale)
  overview: { pixelsPerMm: 0.02, name: 'Overview 1:500', description: 'For larger floor plans or gardens' }, // 1px = 50mm (1:500 scale)
};

// Grid size presets
const GRID_PRESETS: Record<GridPreset, number> = {
  fine: 50, // 50mm grid
  standard: 100, // 100mm grid
  coarse: 500, // 500mm grid
};

// ============================================================================
// PROJECT SETTINGS - Centralized Canvas Environment Configuration
// ============================================================================
export interface ProjectSettings {
  // Visual scale - affects rendering density, NOT coordinates
  scale: Scale;
  
  // Display unit preference - affects labels, NOT storage
  unit: Unit;
  
  // Grid interval in millimeters
  gridInterval: number;
  
  // Grid visibility
  gridVisible: boolean;
  
  // Snap to grid enabled
  snapEnabled: boolean;
  
  // Additional workspace preferences
  showDimensions: boolean; // Auto-show dimension labels
  showAreaLabels: boolean; // Auto-show area labels for rooms
  
  // Canvas dimensions (in meters) - NEW
  canvasWidthMeters: number; // Working area width
  canvasHeightMeters: number; // Working area height
  canvasMarginMeters: number; // Margin outside grid area
}

// Default project settings
const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  scale: '1:100',
  unit: 'mm',
  gridInterval: 100, // 10cm default - smooth for furniture, walls snap well
  gridVisible: true,
  snapEnabled: true,
  showDimensions: false, // Off by default - hover tooltip shows dimensions instead
  showAreaLabels: true,
  canvasWidthMeters: 50, // 50m × 50m working area
  canvasHeightMeters: 50,
  canvasMarginMeters: 0, // No margin - grid covers entire canvas
};

interface FloorMapStore {
  // Project context
  currentProjectId: string | null;
  /** Simplified (homeowner) mode — Model A: room outlines are the walls, openings
   *  snap to room edges instead of splitting separate wall objects. */
  simplified: boolean;

  // Plans
  plans: FloorMapPlan[];
  currentPlanId: string | null;

  // Shapes
  shapes: FloorMapShape[];
  selectedShapeId: string | null;
  selectedShapeIds: string[]; // For multi-select
  pendingSymbolType: SymbolType | null;
  
  // Library symbols - NEW
  pendingLibrarySymbol: string | null; // ArchSymbolType from SymbolLibrary
  pendingObjectId: string | null; // ObjectDefinition ID from ObjectLibrary
  pendingTemplateId: string | null; // Template ID from Template Gallery
  pendingRoomPlacement: { roomId: string; roomName: string; color?: string } | null; // Room from list to place on canvas

  // History for Undo/Redo
  history: FloorMapShape[][];
  historyIndex: number;

  // Drawing state
  isDrawing: boolean;
  isPanning: boolean;
  currentDrawingPoints: { x: number; y: number }[];

  // View
  viewMode: ViewMode;
  activeTool: Tool;
  recentTools: Tool[];
  viewState: ViewState;
  gridSettings: GridSettings;
  scaleSettings: ScaleSettings;
  initializedViewForPlanId: string | null; // Track which plan has had view initialized (survives unmount)

  // Project Settings (NEW - Centralized workspace configuration)
  projectSettings: ProjectSettings;

  // Wall snap preview (visual feedback during drag)
  wallSnapPreview: {
    wallId: string;
    snapPoint: { x: number; y: number };
    snapRotation: number;
  } | null;
  
  // Actions - Plans
  setCurrentProjectId: (id: string | null) => void;
  setSimplified: (v: boolean) => void;
  setPlans: (plans: FloorMapPlan[]) => void;
  addPlan: (plan: FloorMapPlan) => void;
  updatePlan: (id: string, updates: Partial<FloorMapPlan>) => void;
  deletePlan: (id: string) => void;
  setCurrentPlanId: (id: string | null) => void;
  
  // Actions - Shapes
  setShapes: (shapes: FloorMapShape[]) => void;
  addShape: (shape: FloorMapShape) => void;
  updateShape: (id: string, updates: Partial<FloorMapShape>) => void;
  updateShapes: (updates: Array<{ id: string; updates: Partial<FloorMapShape> }>) => void;
  deleteShape: (id: string) => void;
  deleteShapes: (ids: string[]) => void;
  regenerateAutoWalls: () => void;
  setSelectedShapeId: (id: string | null) => void;
  setSelectedShapeIds: (ids: string[]) => void;
  setPendingSymbolType: (type: SymbolType | null) => void;
  clearSelection: () => void;
  
  // Actions - Library symbols (NEW)
  setPendingLibrarySymbol: (symbolType: string | null) => void;
  setPendingObjectId: (objectId: string | null) => void;
  setPendingTemplateId: (templateId: string | null) => void;
  setPendingRoomPlacement: (room: { roomId: string; roomName: string; color?: string } | null) => void;
  centerOnRoom: (roomId: string) => void;
  
  // Actions - Drawing state
  setIsDrawing: (isDrawing: boolean) => void;
  setIsPanning: (isPanning: boolean) => void;
  setCurrentDrawingPoints: (points: { x: number; y: number }[]) => void;
  addDrawingPoint: (point: { x: number; y: number }) => void;
  
  // Actions - History
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  saveToHistory: () => void;
  
  // Actions - View
  setViewMode: (mode: ViewMode) => void;
  setActiveTool: (tool: Tool) => void;
  setViewState: (state: Partial<ViewState>) => void;
  setGridSettings: (settings: Partial<GridSettings>) => void;
  setScaleSettings: (settings: Partial<ScaleSettings>) => void;
  setScalePreset: (preset: ScalePreset) => void;
  setGridPreset: (preset: GridPreset) => void;
  applyViewSettings: (settings: Partial<ViewState & { mode: ViewMode }>) => void;
  setInitializedViewForPlanId: (id: string | null) => void;
  
  // Actions - Project Settings (NEW)
  setProjectSettings: (settings: Partial<ProjectSettings>) => void;
  setScale: (scale: Scale) => void;
  setUnit: (unit: Unit) => void;
  setGridInterval: (interval: number) => void;
  toggleGrid: () => void;
  toggleSnap: () => void;
  toggleDimensions: () => void;
  toggleAreaLabels: () => void;
  setCanvasSize: (widthMeters: number, heightMeters: number) => void;
  setCanvasMargin: (marginMeters: number) => void;

  // Actions - Wall Snap Preview
  setWallSnapPreview: (preview: { wallId: string; snapPoint: { x: number; y: number }; snapRotation: number } | null) => void;

  // Actions - Layering
  bringForward: (shapeId: string) => void;
  sendBackward: (shapeId: string) => void;
  bringToFront: (shapeId: string) => void;
  sendToBack: (shapeId: string) => void;

  // Actions - Wall Snap
  applyWallSnap: (
    openingId: string,
    openingUpdates: Partial<FloorMapShape>,
    wallIdToDelete: string,
    newWallSegments: Array<Partial<FloorMapShape>>
  ) => void;

  // Merge two wall segments into one (used when door is removed from gap)
  mergeWalls: (
    wall1Id: string,
    wall2Id: string,
    mergedCoords: { x1: number; y1: number; x2: number; y2: number }
  ) => void;

  // Wall-relative positioning actions (for floorplan/elevation sync)
  updateShapeWallRelative: (shapeId: string, wallRelative: Partial<WallRelativePosition>) => void;
  snapShapeToWall: (shapeId: string) => void;
  syncShapeFromElevation: (
    shapeId: string,
    elevationX: number,
    elevationY: number,
    width: number,
    height: number,
    canvasParams: {
      wallHeightMM: number;
      effectiveScale: number;
      wallXOffset: number;
      wallYOffset: number;
    }
  ) => void;
  setShapeObjectCategory: (shapeId: string, category: WallObjectCategory) => void;

  // 3D View sync actions (for bidirectional 2D/3D editing)
  updateObjectFrom3D: (shapeId: string, position3D: Position3D, rotation3D?: Rotation3D) => void;
  updateObjectFrom2D: (shapeId: string, x: number, y: number, rotation?: number) => void;

  // Getters
  getSelectedShape: () => FloorMapShape | null;
  getCurrentPlan: () => FloorMapPlan | null;

  // Group helpers (for template objects)
  getShapesInGroup: (groupId: string) => FloorMapShape[];
  getGroupLeader: (groupId: string) => FloorMapShape | null;
  selectGroup: (groupId: string) => void;
  isShapeInGroup: (shapeId: string) => boolean;
  getGroupIdForShape: (shapeId: string) => string | null;
}

export const useFloorMapStore = create<FloorMapStore>((set, get) => ({
  // Initial state
  currentProjectId: null,
  simplified: false,
  plans: [],
  currentPlanId: null,
  shapes: [],
  selectedShapeId: null,
  selectedShapeIds: [],
  pendingSymbolType: null,
  pendingLibrarySymbol: null, // NEW: For architectural symbol placement
  pendingObjectId: null, // NEW: For object library placement
  pendingTemplateId: null, // NEW: For template gallery placement
  pendingRoomPlacement: null, // NEW: For placing existing room from list onto canvas
  history: [[]],
  historyIndex: 0,
  isDrawing: false,
  isPanning: false,
  currentDrawingPoints: [],
  viewMode: 'floor',
  activeTool: 'select',
  recentTools: ['wall', 'door', 'select'], // Default recent tools
  initializedViewForPlanId: null, // Track which plan has had its view initialized (survives component unmount)
  viewState: {
    zoom: 1,
    panX: 0,
    panY: 0,
  },
  gridSettings: {
    show: true,
    snap: true,
    size: 500, // 500mm = 50cm grid
    unit: 'mm', // Default unit
  },
  scaleSettings: {
    pixelsPerMm: 0.1, // 0.1 pixels = 1mm (1:100 scale, 100px = 1m)
    name: 'Standard',
    description: 'Default for most apartments/houses',
  },
  
  // Project Settings (NEW - Centralized configuration)
  projectSettings: DEFAULT_PROJECT_SETTINGS,

  // Wall snap preview (visual feedback during drag)
  wallSnapPreview: null,

  // Plan Actions
  setCurrentProjectId: (id) => set({ currentProjectId: id }),
  setSimplified: (v) => set({ simplified: v }),
  
  setPlans: (plans) => set({ plans }),
  
  addPlan: (plan) => set((state) => ({
    plans: [...state.plans, plan],
  })),
  
  updatePlan: (id, updates) => set((state) => ({
    plans: state.plans.map((plan) =>
      plan.id === id ? { ...plan, ...updates } : plan
    ),
  })),
  
  deletePlan: (id) => set((state) => ({
    plans: state.plans.filter((plan) => plan.id !== id),
    currentPlanId: state.currentPlanId === id ? null : state.currentPlanId,
  })),
  
  setCurrentPlanId: (id) => set({ currentPlanId: id }),
  
  // Actions
  setShapes: (shapes) => set((state) => {
    // When loading shapes from DB, reset history
    const newHistory = [JSON.parse(JSON.stringify(shapes))];
    return {
      shapes,
      history: newHistory,
      historyIndex: 0,
    };
  }),
  
  addShape: (shape) => set((state) => {
    const newShapes = [...state.shapes, shape];
    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(newShapes)));
    return {
      shapes: newShapes,
      history: newHistory,
      historyIndex: newHistory.length - 1,
    };
  }),
  
  updateShape: (id, updates) => set((state) => {
    const newShapes = state.shapes.map((shape) =>
      shape.id === id ? { ...shape, ...updates } : shape
    );
    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(newShapes)));
    return {
      shapes: newShapes,
      history: newHistory,
      historyIndex: newHistory.length - 1,
    };
  }),

  updateShapes: (updates) => set((state) => {
    const updateMap = new Map(updates.map(u => [u.id, u.updates]));
    const newShapes = state.shapes.map((shape) => {
      const shapeUpdates = updateMap.get(shape.id);
      return shapeUpdates ? { ...shape, ...shapeUpdates } : shape;
    });
    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(newShapes)));
    return {
      shapes: newShapes,
      history: newHistory,
      historyIndex: newHistory.length - 1,
    };
  }),
  
  deleteShape: (id) => set((state) => {
    const newShapes = state.shapes.filter((shape) => shape.id !== id);
    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(newShapes)));
    return {
      shapes: newShapes,
      selectedShapeId: state.selectedShapeId === id ? null : state.selectedShapeId,
      selectedShapeIds: state.selectedShapeIds.filter(sid => sid !== id),
      history: newHistory,
      historyIndex: newHistory.length - 1,
    };
  }),

  deleteShapes: (ids) => set((state) => {
    const idsSet = new Set(ids);
    const newShapes = state.shapes.filter((shape) => !idsSet.has(shape.id));
    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(newShapes)));
    return {
      shapes: newShapes,
      selectedShapeId: idsSet.has(state.selectedShapeId!) ? null : state.selectedShapeId,
      selectedShapeIds: state.selectedShapeIds.filter(sid => !idsSet.has(sid)),
      history: newHistory,
      historyIndex: newHistory.length - 1,
    };
  }),
  
  // Rebuild auto-generated walls from the current rooms on the active plan.
  // Used in simplified mode after a room is deleted or resized so wall outlines
  // stay in sync (and no orphaned "ghost" walls linger). No-op in pro mode,
  // detected by the absence of any existing auto-generated walls.
  regenerateAutoWalls: () => set((state) => {
    const planId = state.currentPlanId;
    const hadAutoWalls = state.shapes.some(
      (s) => s.type === 'wall' && s.planId === planId && s.metadata?.autoGenerated
    );
    if (!hadAutoWalls) return {};

    const withoutAuto = state.shapes.filter(
      (s) => !(s.type === 'wall' && s.planId === planId && s.metadata?.autoGenerated)
    );
    const rooms = withoutAuto.filter((s) => s.type === 'room' && s.planId === planId);
    const manualWalls = withoutAuto.filter(
      (s) => s.type === 'wall' && s.planId === planId && !s.metadata?.autoGenerated
    );
    const newWalls = generateWallsFromRooms(
      rooms,
      uuidv4,
      { planId: planId || undefined },
      manualWalls
    );
    for (const wall of newWalls) {
      wall.metadata = { ...wall.metadata, autoGenerated: true };
    }
    const newShapes = [...withoutAuto, ...newWalls];
    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(newShapes)));
    return {
      shapes: newShapes,
      history: newHistory,
      historyIndex: newHistory.length - 1,
    };
  }),

  setSelectedShapeId: (id) => set({
    selectedShapeId: id,
    // Only update selectedShapeIds if we're selecting a single item
    // Don't overwrite multi-select!
    selectedShapeIds: id ? [id] : [] 
  }),
  
  setSelectedShapeIds: (ids) => set({ 
    selectedShapeIds: ids,
    // Set selectedShapeId to first item for compatibility
    selectedShapeId: ids.length > 0 ? ids[0] : null
  }),

  clearSelection: () => set({ selectedShapeId: null, selectedShapeIds: [] }),
  
  setPendingSymbolType: (type) => set({ pendingSymbolType: type }),
  
  // Library symbol actions (NEW)
  setPendingLibrarySymbol: (symbolType) => set({ 
    pendingLibrarySymbol: symbolType,
    pendingObjectId: null, // Clear object ID when setting symbol
    activeTool: symbolType ? 'symbol' : 'select' // Auto-switch to symbol placement mode
  }),
  
  // Object library actions (NEW)
  setPendingObjectId: (objectId) => set({ 
    pendingObjectId: objectId,
    pendingLibrarySymbol: null, // Clear symbol when setting object
    pendingTemplateId: null, // Clear template when setting object
    activeTool: objectId ? 'object' : 'select' // Auto-switch to object placement mode
  }),
  
  // Template gallery actions (NEW)
  setPendingTemplateId: (templateId) => set({
    pendingTemplateId: templateId,
    pendingLibrarySymbol: null, // Clear symbol when setting template
    pendingObjectId: null, // Clear object when setting template
    activeTool: templateId ? 'select' : 'select' // Keep select tool for template placement
  }),

  // Room placement from list (NEW)
  setPendingRoomPlacement: (room) => set({
    pendingRoomPlacement: room,
    pendingLibrarySymbol: null,
    pendingObjectId: null,
    pendingTemplateId: null,
    activeTool: room ? 'room' : 'select'
  }),

  // Center view on a specific room by roomId
  centerOnRoom: (roomId) => set((state) => {
    const roomShape = state.shapes.find(s => s.roomId === roomId && s.type === 'room');
    if (!roomShape || !roomShape.coordinates?.points) {
      console.warn('centerOnRoom: Room shape not found for roomId:', roomId);
      return state;
    }

    // Calculate center of room (coordinates are in pixels)
    const points = roomShape.coordinates.points;
    const centerX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
    const centerY = points.reduce((sum, p) => sum + p.y, 0) / points.length;

    // Calculate room bounds for optimal zoom
    const minX = Math.min(...points.map(p => p.x));
    const maxX = Math.max(...points.map(p => p.x));
    const minY = Math.min(...points.map(p => p.y));
    const maxY = Math.max(...points.map(p => p.y));
    const roomWidth = maxX - minX;
    const roomHeight = maxY - minY;

    // Get viewport dimensions (use window size as the stage does)
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;

    // Calculate zoom to fit room with padding (show room at ~60% of viewport)
    const paddingFactor = 0.6;
    const zoomToFitWidth = (viewportWidth * paddingFactor) / roomWidth;
    const zoomToFitHeight = (viewportHeight * paddingFactor) / roomHeight;
    const optimalZoom = Math.min(zoomToFitWidth, zoomToFitHeight, 2); // Cap at 2x zoom
    const zoom = Math.max(optimalZoom, 0.3); // Minimum 0.3x zoom

    // Calculate pan to center the room in the viewport
    // Formula: panX = viewportWidth/2 - centerX * zoom
    const panX = (viewportWidth / 2) - (centerX * zoom);
    const panY = (viewportHeight / 2) - (centerY * zoom);

    return {
      viewState: {
        ...state.viewState,
        panX,
        panY,
        zoom
      },
      selectedShapeId: roomShape.id, // Select the room shape
      selectedShapeIds: [roomShape.id]
    };
  }),

  // Drawing state actions
  setIsDrawing: (isDrawing) => set({ isDrawing }),
  
  setIsPanning: (isPanning) => set({ isPanning }),
  
  setCurrentDrawingPoints: (points) => set({ currentDrawingPoints: points }),
  
  addDrawingPoint: (point) => set((state) => ({
    currentDrawingPoints: [...state.currentDrawingPoints, point]
  })),
  
  setViewMode: (mode) => set({ viewMode: mode }),
  
  setActiveTool: (tool) => set((state) => {
    // Update recent tools - add to front and remove duplicates
    const newRecentTools = [tool, ...state.recentTools.filter(t => t !== tool)].slice(0, 5);
    return { 
      activeTool: tool,
      recentTools: newRecentTools
    };
  }),
  
  setViewState: (state) => set((prev) => ({
    viewState: { ...prev.viewState, ...state },
  })),

  setInitializedViewForPlanId: (id) => set({ initializedViewForPlanId: id }),

  setGridSettings: (settings) => set((prev) => ({
    gridSettings: { ...prev.gridSettings, ...settings },
  })),

  setScaleSettings: (settings) => set((prev) => ({
    scaleSettings: { ...prev.scaleSettings, ...settings },
  })),

  setScalePreset: (preset) => set(() => ({
    scaleSettings: SCALE_PRESETS[preset],
  })),

  setGridPreset: (preset) => set((prev) => ({
    gridSettings: { ...prev.gridSettings, size: GRID_PRESETS[preset] },
  })),
  
  applyViewSettings: (settings) => set((state) => {
    const newState: any = {};
    
    if (settings.zoom !== undefined || settings.panX !== undefined || settings.panY !== undefined) {
      newState.viewState = {
        ...state.viewState,
        ...(settings.zoom !== undefined && { zoom: settings.zoom }),
        ...(settings.panX !== undefined && { panX: settings.panX }),
        ...(settings.panY !== undefined && { panY: settings.panY }),
      };
    }
    
    if (settings.mode !== undefined) {
      newState.viewMode = settings.mode;
    }
    
    return newState;
  }),
  
  // History Actions
  undo: () => set((state) => {
    if (state.historyIndex > 0) {
      const newIndex = state.historyIndex - 1;
      const newShapes = JSON.parse(JSON.stringify(state.history[newIndex]));
      return {
        shapes: newShapes,
        historyIndex: newIndex,
        selectedShapeId: null,
        selectedShapeIds: [],
      };
    }
    return state;
  }),
  
  redo: () => set((state) => {
    if (state.historyIndex < state.history.length - 1) {
      const newIndex = state.historyIndex + 1;
      const newShapes = JSON.parse(JSON.stringify(state.history[newIndex]));
      return {
        shapes: newShapes,
        historyIndex: newIndex,
        selectedShapeId: null,
        selectedShapeIds: [],
      };
    }
    return state;
  }),
  
  canUndo: () => {
    const state = get();
    return state.historyIndex > 0;
  },
  
  canRedo: () => {
    const state = get();
    return state.historyIndex < state.history.length - 1;
  },
  
  saveToHistory: () => set((state) => {
    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(state.shapes)));
    return {
      history: newHistory,
      historyIndex: newHistory.length - 1,
    };
  }),
  
  // Wall Snap Action
  applyWallSnap: (openingId, openingUpdates, wallIdToDelete, newWallSegments) => set((state) => {
    const originalWall = state.shapes.find(s => s.id === wallIdToDelete);
    // Update opening, remove original wall, add new wall segments
    let newShapes = state.shapes
      .filter(s => s.id !== wallIdToDelete)
      .map(s => s.id === openingId ? { ...s, ...openingUpdates } : s);

    // Add new wall segments inheriting properties from original wall
    for (const seg of newWallSegments) {
      const newWall: FloorMapShape = {
        id: crypto.randomUUID(),
        type: 'wall',
        coordinates: seg.coordinates!,
        color: seg.color ?? originalWall?.color,
        strokeColor: seg.strokeColor ?? originalWall?.strokeColor,
        strokeWidth: seg.strokeWidth ?? originalWall?.strokeWidth,
        heightMM: seg.heightMM ?? originalWall?.heightMM,
        thicknessMM: seg.thicknessMM ?? originalWall?.thicknessMM,
        zIndex: originalWall?.zIndex,
        planId: originalWall?.planId,
      };
      newShapes.push(newWall);
    }

    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(newShapes)));
    return {
      shapes: newShapes,
      history: newHistory,
      historyIndex: newHistory.length - 1,
    };
  }),

  // Merge Walls Action - combines two wall segments into one
  mergeWalls: (wall1Id, wall2Id, mergedCoords) => set((state) => {
    const wall1 = state.shapes.find(s => s.id === wall1Id);
    const wall2 = state.shapes.find(s => s.id === wall2Id);

    if (!wall1 || !wall2) return state;

    // Remove both wall segments
    let newShapes = state.shapes.filter(s => s.id !== wall1Id && s.id !== wall2Id);

    // Create merged wall inheriting properties from wall1
    const mergedWall: FloorMapShape = {
      id: crypto.randomUUID(),
      type: 'wall',
      coordinates: mergedCoords,
      color: wall1.color,
      strokeColor: wall1.strokeColor,
      strokeWidth: wall1.strokeWidth,
      heightMM: wall1.heightMM,
      thicknessMM: wall1.thicknessMM,
      zIndex: wall1.zIndex,
      planId: wall1.planId,
    };
    newShapes.push(mergedWall);

    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(newShapes)));
    return {
      shapes: newShapes,
      history: newHistory,
      historyIndex: newHistory.length - 1,
    };
  }),

  // ============================================================================
  // WALL-RELATIVE POSITIONING ACTIONS (Floorplan/Elevation Sync)
  // ============================================================================

  updateShapeWallRelative: (shapeId, wallRelative) => set((state) => {
    const shape = state.shapes.find(s => s.id === shapeId);
    if (!shape) return state;

    // Merge wall-relative data
    const newWallRelative: WallRelativePosition = shape.wallRelative
      ? { ...shape.wallRelative, ...wallRelative }
      : wallRelative as WallRelativePosition;

    // Find the wall to calculate new world coordinates
    const wall = state.shapes.find(s => s.id === newWallRelative.wallId);

    // Calculate new world position from wall-relative data (for bidirectional sync)
    let newMetadata = shape.metadata;
    if (wall && shape.metadata?.isObjectLibrary) {
      const worldPos = wallRelativeToWorld(newWallRelative, wall);
      if (worldPos) {
        newMetadata = {
          ...shape.metadata,
          placementX: worldPos.x - (newWallRelative.width / 2) * (state.scaleSettings?.pixelsPerMm || 0.1),
          placementY: worldPos.y - (newWallRelative.depth / 2) * (state.scaleSettings?.pixelsPerMm || 0.1),
          rotation: worldPos.rotation,
        };
      }
    }

    const newShapes = state.shapes.map(s => {
      if (s.id === shapeId) {
        return {
          ...s,
          wallRelative: newWallRelative,
          rotation: newMetadata !== shape.metadata ? (newMetadata as any)?.rotation : s.rotation,
          metadata: newMetadata,
        };
      }
      return s;
    });

    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(newShapes)));

    return {
      shapes: newShapes,
      history: newHistory,
      historyIndex: newHistory.length - 1,
    };
  }),

  snapShapeToWall: (shapeId) => set((state) => {
    const shape = state.shapes.find(s => s.id === shapeId);
    if (!shape) return state;

    // Get all walls from the same plan
    const walls = state.shapes.filter(
      s => s.planId === shape.planId && (s.type === 'wall' || s.type === 'line') && s.shapeViewMode !== 'elevation'
    );

    const updates = snapObjectToWall(shape, walls, 500);
    if (!updates) return state;

    const newShapes = state.shapes.map(s => {
      if (s.id === shapeId) {
        return { ...s, ...updates };
      }
      return s;
    });

    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(newShapes)));

    return {
      shapes: newShapes,
      history: newHistory,
      historyIndex: newHistory.length - 1,
    };
  }),

  syncShapeFromElevation: (shapeId, elevationX, elevationY, width, height, canvasParams) => set((state) => {
    const shape = state.shapes.find(s => s.id === shapeId);
    if (!shape || !shape.wallRelative?.wallId) return state;

    const wall = state.shapes.find(s => s.id === shape.wallRelative!.wallId);
    if (!wall) return state;

    const updates = syncFromElevation(shape, wall, elevationX, elevationY, width, height, canvasParams);
    if (!updates) return state;

    const newShapes = state.shapes.map(s => {
      if (s.id === shapeId) {
        return { ...s, ...updates };
      }
      return s;
    });

    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(newShapes)));

    return {
      shapes: newShapes,
      history: newHistory,
      historyIndex: newHistory.length - 1,
    };
  }),

  setShapeObjectCategory: (shapeId, category) => set((state) => {
    const shape = state.shapes.find(s => s.id === shapeId);
    if (!shape) return state;

    const updates = setObjectCategoryUtil(shape, category);

    const newShapes = state.shapes.map(s => {
      if (s.id === shapeId) {
        return { ...s, ...updates };
      }
      return s;
    });

    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(newShapes)));

    return {
      shapes: newShapes,
      history: newHistory,
      historyIndex: newHistory.length - 1,
    };
  }),

  // ============================================================================
  // 3D VIEW SYNC ACTIONS (Bidirectional 2D/3D Editing)
  // ============================================================================

  updateObjectFrom3D: (shapeId, position3D, rotation3D) => set((state) => {
    const shape = state.shapes.find(s => s.id === shapeId);
    if (!shape) return state;

    // Update position3D
    const newPosition3D = { ...position3D };

    // If wall-attached, recalculate wallRelative
    let newWallRelative = shape.wallRelative;
    if (shape.wallRelative?.wallId) {
      const wall = state.shapes.find(s => s.id === shape.wallRelative?.wallId);
      if (wall) {
        const wallCoords = wall.coordinates as LineCoordinates;
        if (wallCoords && wallCoords.x1 !== undefined) {
          // Calculate wall-relative position from world 3D position
          const dx = wallCoords.x2 - wallCoords.x1;
          const dy = wallCoords.y2 - wallCoords.y1;
          const wallLength = Math.sqrt(dx * dx + dy * dy);
          const wallAngle = Math.atan2(dy, dx);

          // Project 3D position onto wall line
          // Convert 3D Y (up) back to floor plan coordinates
          const fpX = position3D.x;
          const fpY = position3D.y; // In 3D, y is vertical, but we use position3D.y for floor plan Y

          // Calculate distance from wall start along wall direction
          const relX = fpX - wallCoords.x1;
          const relY = fpY - wallCoords.y1;
          const distanceFromWallStart = (relX * dx + relY * dy) / wallLength;

          // Calculate perpendicular offset
          const perpOffset = (-relX * dy + relY * dx) / wallLength;

          newWallRelative = {
            ...shape.wallRelative,
            distanceFromWallStart,
            perpendicularOffset: perpOffset,
            elevationBottom: position3D.z,
          };
        }
      }
    }

    // Update 2D placement metadata for sync
    const newMetadata = {
      ...shape.metadata,
      placementX: position3D.x,
      placementY: position3D.y,
      rotation: rotation3D ? rotation3D.y * (180 / Math.PI) : shape.rotation,
    };

    const newShapes = state.shapes.map(s => {
      if (s.id === shapeId) {
        return {
          ...s,
          position3D: newPosition3D,
          rotation3D,
          wallRelative: newWallRelative,
          metadata: newMetadata,
          rotation: rotation3D ? rotation3D.y * (180 / Math.PI) : s.rotation,
        };
      }
      return s;
    });

    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(newShapes)));

    return {
      shapes: newShapes,
      history: newHistory,
      historyIndex: newHistory.length - 1,
    };
  }),

  updateObjectFrom2D: (shapeId, x, y, rotation) => set((state) => {
    const shape = state.shapes.find(s => s.id === shapeId);
    if (!shape) return state;

    // Calculate 3D position from 2D coordinates
    const dims = shape.dimensions3D || { width: 500, height: 500, depth: 500 };
    const elevation = shape.wallRelative?.elevationBottom || 0;

    const newPosition3D: Position3D = {
      x,
      y,
      z: elevation,
    };

    const newRotation3D: Rotation3D | undefined = rotation !== undefined ? {
      x: 0,
      y: rotation * (Math.PI / 180),
      z: 0,
    } : shape.rotation3D;

    // Update metadata
    const newMetadata = {
      ...shape.metadata,
      placementX: x,
      placementY: y,
      rotation,
    };

    const newShapes = state.shapes.map(s => {
      if (s.id === shapeId) {
        return {
          ...s,
          position3D: newPosition3D,
          rotation3D: newRotation3D,
          rotation: rotation ?? s.rotation,
          metadata: newMetadata,
        };
      }
      return s;
    });

    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(newShapes)));

    return {
      shapes: newShapes,
      history: newHistory,
      historyIndex: newHistory.length - 1,
    };
  }),

  // Getters
  getSelectedShape: () => {
    const state = get();
    return state.shapes.find((s) => s.id === state.selectedShapeId) || null;
  },

  getCurrentPlan: () => {
    const state = get();
    return state.plans.find((p) => p.id === state.currentPlanId) || null;
  },

  // Group helpers (for template objects)
  getShapesInGroup: (groupId: string) => {
    const state = get();
    return state.shapes.filter(s => s.groupId === groupId);
  },

  getGroupLeader: (groupId: string) => {
    const state = get();
    return state.shapes.find(s => s.groupId === groupId && s.isGroupLeader) || null;
  },

  selectGroup: (groupId: string) => {
    const state = get();
    const groupShapeIds = state.shapes
      .filter(s => s.groupId === groupId)
      .map(s => s.id);
    set({ selectedShapeIds: groupShapeIds, selectedShapeId: groupShapeIds[0] || null });
  },

  isShapeInGroup: (shapeId: string) => {
    const state = get();
    const shape = state.shapes.find(s => s.id === shapeId);
    return !!shape?.groupId;
  },

  getGroupIdForShape: (shapeId: string) => {
    const state = get();
    const shape = state.shapes.find(s => s.id === shapeId);
    return shape?.groupId || null;
  },

  // ============================================================================
  // PROJECT SETTINGS ACTIONS (NEW)
  // ============================================================================
  
  setProjectSettings: (settings) => set((state) => ({
    projectSettings: { ...state.projectSettings, ...settings },
  })),
  
  setScale: (scale) => set((state) => {
    const newGridInterval = getDefaultGridInterval(scale);
    return {
      projectSettings: {
        ...state.projectSettings,
        scale,
        gridInterval: newGridInterval, // Auto-adjust grid to scale
      },
    };
  }),
  
  setUnit: (unit) => set((state) => ({
    projectSettings: { ...state.projectSettings, unit },
  })),
  
  setGridInterval: (gridInterval) => set((state) => ({
    projectSettings: { ...state.projectSettings, gridInterval },
  })),
  
  toggleGrid: () => set((state) => ({
    projectSettings: {
      ...state.projectSettings,
      gridVisible: !state.projectSettings.gridVisible,
    },
  })),
  
  toggleSnap: () => set((state) => ({
    projectSettings: {
      ...state.projectSettings,
      snapEnabled: !state.projectSettings.snapEnabled,
    },
  })),
  
  toggleDimensions: () => set((state) => ({
    projectSettings: {
      ...state.projectSettings,
      showDimensions: !state.projectSettings.showDimensions,
    },
  })),
  
  toggleAreaLabels: () => set((state) => ({
    projectSettings: {
      ...state.projectSettings,
      showAreaLabels: !state.projectSettings.showAreaLabels,
    },
  })),
  
  setCanvasSize: (widthMeters, heightMeters) => set((state) => ({
    projectSettings: {
      ...state.projectSettings,
      canvasWidthMeters: widthMeters,
      canvasHeightMeters: heightMeters,
    },
  })),
  
  setCanvasMargin: (marginMeters) => set((state) => ({
    projectSettings: {
      ...state.projectSettings,
      canvasMarginMeters: marginMeters,
    },
  })),

  // Wall snap preview (visual feedback during drag)
  setWallSnapPreview: (preview) => set({ wallSnapPreview: preview }),

  // ============================================================================
  // LAYERING ACTIONS (Z-Index Management)
  // ============================================================================

  bringForward: (shapeId) => set((state) => {
    const shapeIndex = state.shapes.findIndex(s => s.id === shapeId);
    if (shapeIndex === -1) return state;

    const shape = state.shapes[shapeIndex];
    const currentZIndex = shape.zIndex ?? 0;

    // Find the next highest zIndex among all shapes
    const higherShapes = state.shapes.filter(s => (s.zIndex ?? 0) > currentZIndex);
    if (higherShapes.length === 0) return state; // Already at front

    // Find the minimum zIndex that's higher than current
    const nextZIndex = Math.min(...higherShapes.map(s => s.zIndex ?? 0));

    // Swap z-indices
    const newShapes = state.shapes.map(s => {
      if (s.id === shapeId) return { ...s, zIndex: nextZIndex };
      if ((s.zIndex ?? 0) === nextZIndex) return { ...s, zIndex: currentZIndex };
      return s;
    });

    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(newShapes)));

    return {
      shapes: newShapes,
      history: newHistory,
      historyIndex: newHistory.length - 1,
    };
  }),

  sendBackward: (shapeId) => set((state) => {
    const shapeIndex = state.shapes.findIndex(s => s.id === shapeId);
    if (shapeIndex === -1) return state;

    const shape = state.shapes[shapeIndex];
    const currentZIndex = shape.zIndex ?? 0;

    // Find the next lowest zIndex among all shapes
    const lowerShapes = state.shapes.filter(s => (s.zIndex ?? 0) < currentZIndex);
    if (lowerShapes.length === 0) return state; // Already at back

    // Find the maximum zIndex that's lower than current
    const prevZIndex = Math.max(...lowerShapes.map(s => s.zIndex ?? 0));

    // Swap z-indices
    const newShapes = state.shapes.map(s => {
      if (s.id === shapeId) return { ...s, zIndex: prevZIndex };
      if ((s.zIndex ?? 0) === prevZIndex) return { ...s, zIndex: currentZIndex };
      return s;
    });

    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(newShapes)));

    return {
      shapes: newShapes,
      history: newHistory,
      historyIndex: newHistory.length - 1,
    };
  }),

  bringToFront: (shapeId) => set((state) => {
    const shapeIndex = state.shapes.findIndex(s => s.id === shapeId);
    if (shapeIndex === -1) return state;

    // Find the highest zIndex
    const maxZIndex = Math.max(...state.shapes.map(s => s.zIndex ?? 0), 0);

    const newShapes = state.shapes.map(s => {
      if (s.id === shapeId) return { ...s, zIndex: maxZIndex + 1 };
      return s;
    });

    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(newShapes)));

    return {
      shapes: newShapes,
      history: newHistory,
      historyIndex: newHistory.length - 1,
    };
  }),

  sendToBack: (shapeId) => set((state) => {
    const shapeIndex = state.shapes.findIndex(s => s.id === shapeId);
    if (shapeIndex === -1) return state;

    // Find the lowest zIndex
    const minZIndex = Math.min(...state.shapes.map(s => s.zIndex ?? 0), 0);

    const newShapes = state.shapes.map(s => {
      if (s.id === shapeId) return { ...s, zIndex: minZIndex - 1 };
      return s;
    });

    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(newShapes)));

    return {
      shapes: newShapes,
      history: newHistory,
      historyIndex: newHistory.length - 1,
    };
  }),
}));

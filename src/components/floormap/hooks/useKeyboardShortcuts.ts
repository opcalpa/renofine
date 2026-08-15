/**
 * Keyboard Shortcuts Hook
 *
 * Handles all keyboard shortcuts for the floor plan canvas:
 * - Space: Pan mode
 * - Shift: Rotation snapping
 * - Delete/Backspace: Delete selected
 * - Cmd/Ctrl+Z: Undo
 * - Cmd/Ctrl+Shift+Z or Ctrl+Y: Redo
 * - Cmd/Ctrl+A: Select all
 * - Cmd/Ctrl+C/V/D: Copy/Paste/Duplicate
 * - Cmd/Ctrl+S: Save
 * - V/W/R/C/T/P/B/E/M: Tool shortcuts
 * - [/]: Layer ordering
 * - Escape: Cancel operation
 * - 0-9/Enter: CAD numeric input for wall length
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useFloorMapStore } from '../store';
import { FloorMapShape } from '../types';
import { cloneShapes, PASTE_OFFSET } from '../utils/shapeClipboard';

interface UseKeyboardShortcutsProps {
  isReadOnly: boolean;
  // Values that need refs for fresh access in keyboard handler
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  addShape: (shape: FloorMapShape) => void;
  deleteShape: (id: string) => void;
  deleteShapes: (ids: string[]) => void;
  setSelectedShapeId: (id: string | null) => void;
  setSelectedShapeIds: (ids: string[]) => void;
  selectedShapeId: string | null;
  selectedShapeIds: string[];
  currentShapes: FloorMapShape[];
  clipboard: FloorMapShape[];
  setClipboard: (shapes: FloorMapShape[]) => void;
  currentPlanId: string | null;
  setActiveTool: (tool: string) => void;
  isDrawing: boolean;
  setIsDrawing: (drawing: boolean) => void;
  currentDrawingPoints: { x: number; y: number }[];
  setCurrentDrawingPoints: (points: { x: number; y: number }[]) => void;
  activeTool: string;
  numericInput: string;
  setNumericInput: (input: string | ((prev: string) => string)) => void;
  setShowNumericInput: (show: boolean) => void;
  setLastWallEndPoint: (point: { x: number; y: number } | null) => void;
  setGhostPreview: (preview: { x: number; y: number; rotation: number; nearWall: boolean } | null) => void;
}

interface UseKeyboardShortcutsReturn {
  isSpacePressed: boolean;
  isShiftPressed: boolean;
  confirmWallWithLengthRef: React.MutableRefObject<((lengthMM: number) => void) | null>;
}

export function useKeyboardShortcuts({
  isReadOnly,
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
}: UseKeyboardShortcutsProps): UseKeyboardShortcutsReturn {
  // Key state
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isShiftPressed, setIsShiftPressed] = useState(false);

  // Ref for external use (wall drawing confirmation)
  const confirmWallWithLengthRef = useRef<((lengthMM: number) => void) | null>(null);

  // Refs to avoid stale closures in keyboard handlers
  const undoRef = useRef(undo);
  const redoRef = useRef(redo);
  const canUndoRef = useRef(canUndo);
  const canRedoRef = useRef(canRedo);
  const addShapeRef = useRef(addShape);
  const deleteShapeRef = useRef(deleteShape);
  const deleteShapesRef = useRef(deleteShapes);
  const setSelectedShapeIdRef = useRef(setSelectedShapeId);
  const setSelectedShapeIdsRef = useRef(setSelectedShapeIds);
  const selectedShapeIdRef = useRef(selectedShapeId);
  const selectedShapeIdsRef = useRef(selectedShapeIds);
  const currentShapesRef = useRef(currentShapes);
  const clipboardRef = useRef(clipboard);
  const currentPlanIdRef = useRef(currentPlanId);
  const setActiveToolRef = useRef(setActiveTool);
  const isDrawingRef = useRef(isDrawing);
  const currentDrawingPointsRef = useRef(currentDrawingPoints);
  const activeToolRef = useRef(activeTool);
  const numericInputRef = useRef(numericInput);

  // Update refs whenever values change
  useEffect(() => {
    undoRef.current = undo;
    redoRef.current = redo;
    canUndoRef.current = canUndo;
    canRedoRef.current = canRedo;
    addShapeRef.current = addShape;
    deleteShapeRef.current = deleteShape;
    deleteShapesRef.current = deleteShapes;
    setSelectedShapeIdRef.current = setSelectedShapeId;
    setSelectedShapeIdsRef.current = setSelectedShapeIds;
    selectedShapeIdRef.current = selectedShapeId;
    selectedShapeIdsRef.current = selectedShapeIds;
    currentShapesRef.current = currentShapes;
    clipboardRef.current = clipboard;
    currentPlanIdRef.current = currentPlanId;
    setActiveToolRef.current = setActiveTool;
    isDrawingRef.current = isDrawing;
    currentDrawingPointsRef.current = currentDrawingPoints;
    activeToolRef.current = activeTool;
    numericInputRef.current = numericInput;
  }, [
    undo, redo, canUndo, canRedo, addShape, deleteShape, deleteShapes,
    setSelectedShapeId, setSelectedShapeIds, selectedShapeId, selectedShapeIds,
    currentShapes, clipboard, currentPlanId, setActiveTool,
    isDrawing, currentDrawingPoints, activeTool, numericInput
  ]);

  // Main keyboard handler effect
  useEffect(() => {
    // Detect OS for proper modifier key
    const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if typing in input
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;

      // Use Cmd on Mac, Ctrl on Windows
      const modKey = isMac ? e.metaKey : e.ctrlKey;

      // Space - Pan mode
      if (e.code === 'Space' && !e.repeat && !isTyping) {
        e.preventDefault();
        setIsSpacePressed(true);
      }

      // Shift - Rotation snapping (45° increments)
      if (e.key === 'Shift' && !e.repeat && !isTyping) {
        setIsShiftPressed(true);
      }

      // CAD-style numeric input during wall drawing
      const isWallDrawingActive = isDrawingRef.current && activeToolRef.current === 'wall' && currentDrawingPointsRef.current.length > 0;

      if (isWallDrawingActive && !isTyping) {
        // Digit keys (0-9)
        if (/^[0-9]$/.test(e.key)) {
          e.preventDefault();
          setNumericInput(prev => prev + e.key);
          setShowNumericInput(true);
          return;
        }

        // Backspace - remove last digit
        if (e.key === 'Backspace' && numericInputRef.current.length > 0) {
          e.preventDefault();
          setNumericInput(prev => prev.slice(0, -1));
          if (numericInputRef.current.length === 1) {
            setShowNumericInput(false);
          }
          return;
        }

        // Enter - confirm wall with typed length
        if (e.key === 'Enter' && numericInputRef.current.length > 0) {
          e.preventDefault();
          if (confirmWallWithLengthRef.current) {
            confirmWallWithLengthRef.current(parseFloat(numericInputRef.current));
          }
          return;
        }
      }

      // Escape - cancel operation and return to select tool
      if (e.key === 'Escape' && !isTyping) {
        e.preventDefault();

        // Clear CAD numeric input
        setNumericInput('');
        setShowNumericInput(false);

        // Cancel any active drawing operations
        setLastWallEndPoint(null);
        setIsDrawing(false);
        setCurrentDrawingPoints([]);

        // Clear ghost preview and pending library objects
        setGhostPreview(null);
        const { setPendingObjectId, setPendingLibrarySymbol } = useFloorMapStore.getState();
        setPendingObjectId(null);
        setPendingLibrarySymbol(null);

        // Return to select tool
        setActiveToolRef.current('select');

        toast.info('Återgick till markör-verktyget');
      }

      // Delete key (disabled in read-only mode)
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isTyping && !isReadOnly && !isWallDrawingActive) {
        e.preventDefault();
        const selIds = selectedShapeIdsRef.current.length > 0
          ? [...selectedShapeIdsRef.current]
          : (selectedShapeIdRef.current ? [selectedShapeIdRef.current] : []);
        const st = useFloorMapStore.getState();
        const roomShapes = st.shapes.filter(s => selIds.includes(s.id) && s.type === 'room' && s.roomId);
        if (roomShapes.length > 0) {
          // Room-linked shapes: defer to the shared delete-intent dialog rather
          // than silently orphaning the room entity (phantom in the rooms list).
          st.setPendingRoomShapeDeletion({
            shapeIds: selIds,
            rooms: roomShapes.map(s => ({ shapeId: s.id, roomId: s.roomId as string })),
            via: 'v1',
          });
        } else if (selectedShapeIdsRef.current.length > 0) {
          deleteShapesRef.current(selectedShapeIdsRef.current);
        } else if (selectedShapeIdRef.current) {
          deleteShapeRef.current(selectedShapeIdRef.current);
        }
      }

      // Undo: Cmd+Z (Mac) or Ctrl+Z (Windows)
      const isZKey = e.key.toLowerCase() === 'z' || e.code === 'KeyZ';

      if (modKey && isZKey && !e.shiftKey && !isTyping) {
        e.preventDefault();
        if (canUndoRef.current()) {
          undoRef.current();
          toast.success('Ångrad');
        } else {
          toast.info('Inget att ångra');
        }
      }

      // Redo: Cmd+Shift+Z (Mac) or Ctrl+Y (Windows)
      if (!isTyping && modKey) {
        const isYKey = e.key.toLowerCase() === 'y' || e.code === 'KeyY';
        const isRedoKey = (isMac && e.shiftKey && isZKey) || (!isMac && isYKey);

        if (isRedoKey) {
          e.preventDefault();
          if (canRedoRef.current()) {
            redoRef.current();
            toast.success('Gjort om');
          } else {
            toast.info('Inget att göra om');
          }
        }
      }

      // Select All: Cmd+A
      if (modKey && e.key.toLowerCase() === 'a' && !isTyping) {
        e.preventDefault();
        const allIds = currentShapesRef.current.map(s => s.id);
        setSelectedShapeIdsRef.current(allIds);
        if (allIds.length > 0) {
          toast.success(`${allIds.length} objekt markerade`);
        }
      }

      // Copy: Cmd+C
      if (modKey && e.key.toLowerCase() === 'c' && !isTyping) {
        e.preventDefault();
        if (selectedShapeIdsRef.current.length > 0 || selectedShapeIdRef.current) {
          const shapesToCopy = selectedShapeIdsRef.current.length > 0
            ? currentShapesRef.current.filter(s => selectedShapeIdsRef.current.includes(s.id))
            : selectedShapeIdRef.current
              ? currentShapesRef.current.filter(s => s.id === selectedShapeIdRef.current)
              : [];

          if (shapesToCopy.length > 0) {
            setClipboard(shapesToCopy);
            toast.success(`${shapesToCopy.length} objekt kopierade`);
          }
        }
      }

      // Paste: Cmd+V
      if (modKey && e.key.toLowerCase() === 'v' && !isTyping) {
        e.preventDefault();
        if (clipboardRef.current.length > 0 && currentPlanIdRef.current) {
          const newShapes = cloneShapes(clipboardRef.current, currentPlanIdRef.current, PASTE_OFFSET);
          newShapes.forEach(shape => addShapeRef.current(shape));
          setSelectedShapeIdsRef.current(newShapes.map(s => s.id));
          toast.success(`${newShapes.length} objekt inklistrade`);
        }
      }

      // Duplicate: Cmd+D
      if (modKey && e.key.toLowerCase() === 'd' && !isTyping) {
        e.preventDefault();
        if ((selectedShapeIdsRef.current.length > 0 || selectedShapeIdRef.current) && currentPlanIdRef.current) {
          const shapesToDuplicate = selectedShapeIdsRef.current.length > 0
            ? currentShapesRef.current.filter(s => selectedShapeIdsRef.current.includes(s.id))
            : selectedShapeIdRef.current
              ? currentShapesRef.current.filter(s => s.id === selectedShapeIdRef.current)
              : [];

          if (shapesToDuplicate.length > 0) {
            const newShapes = cloneShapes(shapesToDuplicate, currentPlanIdRef.current, PASTE_OFFSET);
            newShapes.forEach(shape => addShapeRef.current(shape));
            setSelectedShapeIdsRef.current(newShapes.map(s => s.id));
            toast.success(`${newShapes.length} objekt duplicerade`);
          }
        }
      }

      // Save: Cmd+S
      if (modKey && e.key.toLowerCase() === 's' && !isTyping) {
        e.preventDefault();
        if ((window as unknown as { __canvasSave?: () => void }).__canvasSave) {
          (window as unknown as { __canvasSave?: () => void }).__canvasSave?.();
        }
      }

      // Lock/Unlock: Cmd+L
      if (modKey && e.key.toLowerCase() === 'l' && !isTyping && !isReadOnly) {
        e.preventDefault();
        const store = useFloorMapStore.getState();
        const ids = store.selectedShapeIds;
        if (ids.length > 0) {
          const allLocked = ids.every(id => store.shapes.find(s => s.id === id)?.locked);
          ids.forEach(id => store.updateShape(id, { locked: !allLocked }));
          toast.success(allLocked ? 'Upplåst' : 'Låst');
        }
      }

      // ===== TOOL SHORTCUTS (single keys without modifiers) =====
      if (!modKey && !e.shiftKey && !isTyping) {
        const key = e.key.toLowerCase();

        // V - Select tool
        if (key === 'v') {
          e.preventDefault();
          setActiveToolRef.current('select');
        }
        // P - Freehand/Pen tool
        else if (key === 'p') {
          e.preventDefault();
          setActiveToolRef.current('freehand');
        }
        // C - Circle tool
        else if (key === 'c') {
          e.preventDefault();
          setActiveToolRef.current('circle');
        }
        // R - Rectangle tool
        else if (key === 'r') {
          e.preventDefault();
          setActiveToolRef.current('rectangle');
        }
        // B - Bezier curve tool
        else if (key === 'b') {
          e.preventDefault();
          setActiveToolRef.current('bezier');
        }
        // W - Wall tool
        else if (key === 'w') {
          e.preventDefault();
          setActiveToolRef.current('wall');
        }
        // T - Text tool
        else if (key === 't') {
          e.preventDefault();
          setActiveToolRef.current('text');
        }
        // E - Eraser tool
        else if (key === 'e') {
          e.preventDefault();
          setActiveToolRef.current('eraser');
        }
        // M - Measure/Ruler tool
        else if (key === 'm') {
          e.preventDefault();
          setActiveToolRef.current('measure');
        }
        // N - Sticky Note tool
        else if (key === 'n') {
          e.preventDefault();
          setActiveToolRef.current('sticky_note');
        }
        // ] - Bring Forward
        else if (key === ']') {
          e.preventDefault();
          const store = useFloorMapStore.getState();
          if (store.selectedShapeIds.length > 0) {
            store.selectedShapeIds.forEach(id => store.bringForward(id));
            toast.success('Flyttat framåt');
          }
        }
        // [ - Send Backward
        else if (key === '[') {
          e.preventDefault();
          const store = useFloorMapStore.getState();
          if (store.selectedShapeIds.length > 0) {
            store.selectedShapeIds.forEach(id => store.sendBackward(id));
            toast.success('Flyttat bakåt');
          }
        }
      }

      // Cmd/Ctrl + ] - Bring to Front
      if (modKey && e.key === ']' && !isTyping) {
        e.preventDefault();
        const store = useFloorMapStore.getState();
        if (store.selectedShapeIds.length > 0) {
          store.selectedShapeIds.forEach(id => store.bringToFront(id));
          toast.success('Flyttat längst fram');
        }
      }

      // Cmd/Ctrl + [ - Send to Back
      if (modKey && e.key === '[' && !isTyping) {
        e.preventDefault();
        const store = useFloorMapStore.getState();
        if (store.selectedShapeIds.length > 0) {
          store.selectedShapeIds.forEach(id => store.sendToBack(id));
          toast.success('Flyttat längst bak');
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
      if (e.key === 'Shift') {
        setIsShiftPressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isReadOnly, setNumericInput, setShowNumericInput, setLastWallEndPoint, setIsDrawing, setCurrentDrawingPoints, setGhostPreview, setClipboard]);

  return {
    isSpacePressed,
    isShiftPressed,
    confirmWallWithLengthRef,
  };
}

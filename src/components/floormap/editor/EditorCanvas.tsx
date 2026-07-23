/**
 * EditorCanvas — the v2 floor plan canvas (behind the editorV2 flag).
 *
 * Owns the Konva stage, view transform (wheel zoom to cursor, space-drag
 * pan), the ToolController pipeline, plan shape load/save, and the layer
 * stack: grid → legacy shapes → mitered walls → overlay. All mutations go
 * through editor commands; history lives in the patch executor.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer } from 'react-konva';
import Konva from 'konva';
import { KonvaEventObject } from 'konva/lib/Node';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useFloorMapStore } from '../store';
import { supabase } from '@/integrations/supabase/client';
import { loadShapesForPlan, saveShapesForPlan } from '../utils/plans';
import Grid from '../canvas/Grid';
import { calculateFitToContent } from '../canvas/utils/fitToContent';
import { EditorHud } from './EditorHud';
import { FloatingSelectionToolbar } from './FloatingSelectionToolbar';
import { WallLengthEditor } from './WallLengthEditor';
import { TextEditor } from './TextEditor';
import { RoomNamingController } from './RoomNamingController';
import { WallsLayer } from './render/WallsLayer';
import { LegacyShapesLayer } from './render/LegacyShapesLayer';
import { ObjectsLayer } from './render/ObjectsLayer';
import { OpeningsLayer } from './render/OpeningsLayer';
import { OverlayLayer } from './render/OverlayLayer';
import { ToolController } from './tools/ToolController';
import { resetHistory, canUndo, canRedo, undo, redo } from './core/executor';
import { execute } from './core/commands';
import { migrateShapes } from './migration/migrateShapes';
import { placeRoomOnPlan } from './placeRoomFromList';
import { useEditorUiStore } from './state/uiStore';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
const AUTOSAVE_DEBOUNCE_MS = 2500;

interface EditorCanvasProps {
  isReadOnly?: boolean;
}

export const EditorCanvas = ({ isReadOnly }: EditorCanvasProps) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });

  const shapes = useFloorMapStore((s) => s.shapes);
  const currentPlanId = useFloorMapStore((s) => s.currentPlanId);
  const selectedShapeIds = useFloorMapStore((s) => s.selectedShapeIds);
  const viewState = useFloorMapStore((s) => s.viewState);
  const activeTool = useFloorMapStore((s) => s.activeTool);
  const scaleSettings = useFloorMapStore((s) => s.scaleSettings);
  const projectSettings = useFloorMapStore((s) => s.projectSettings);
  const dirtyCounter = useEditorUiStore((s) => s.dirtyCounter);

  const controller = useMemo(() => new ToolController(), []);

  // Container-driven stage sizing
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setSize({ width: el.clientWidth, height: el.clientHeight });
    });
    observer.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    return () => observer.disconnect();
  }, []);

  // Load shapes for the current plan, then zoom to fit its content so
  // freshly imported plans (AI import lands on a new plan) are visible
  // immediately instead of sitting off-screen.
  useEffect(() => {
    if (!currentPlanId) return;
    let cancelled = false;
    (async () => {
      const loaded = migrateShapes(await loadShapesForPlan(currentPlanId));
      if (cancelled) return;

      // The user may have drawn while the plan was still loading (plan id
      // resolves asynchronously on first open). Never wipe those edits —
      // merge them on top of the loaded shapes and adopt them into the plan.
      const store = useFloorMapStore.getState();
      const loadedIds = new Set(loaded.map((s) => s.id));
      const localUnsaved = canUndo()
        ? store.shapes
            .filter((s) => !loadedIds.has(s.id))
            .map((s) => (s.planId ? s : { ...s, planId: currentPlanId }))
        : [];
      store.setShapes([...loaded, ...localUnsaved]);
      if (localUnsaved.length === 0) resetHistory();

      const el = containerRef.current;
      const planShapes = loaded.filter((s) => s.planId === currentPlanId || !s.planId);
      if (el && planShapes.length > 0 && localUnsaved.length === 0) {
        const fitted = calculateFitToContent(planShapes, el.clientWidth, el.clientHeight);
        if (fitted) useFloorMapStore.getState().setViewState(fitted);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentPlanId]);

  // "Visa på planritningen" from room details: center + select the room's
  // shape once its plan is loaded; switch plan first if it lives elsewhere.
  const pendingFocusRoomId = useFloorMapStore((s) => s.pendingFocusRoomId);
  const focusLookupRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingFocusRoomId) return;
    const store = useFloorMapStore.getState();
    const target = store.shapes.find(
      (s) => s.type === 'room' && s.roomId === pendingFocusRoomId
    );
    if (target) {
      store.centerOnRoom(pendingFocusRoomId);
      store.setPendingFocusRoomId(null);
      focusLookupRef.current = null;
      return;
    }
    // Not on the loaded plan — look up which plan hosts it (once per request).
    if (focusLookupRef.current === pendingFocusRoomId) return;
    focusLookupRef.current = pendingFocusRoomId;
    (async () => {
      const { data } = await supabase
        .from('floor_map_shapes')
        .select('plan_id')
        .eq('room_id', pendingFocusRoomId)
        .limit(1)
        .maybeSingle();
      const fresh = useFloorMapStore.getState();
      if (fresh.pendingFocusRoomId !== pendingFocusRoomId) return;
      if (data?.plan_id && data.plan_id !== fresh.currentPlanId) {
        fresh.setCurrentPlanId(data.plan_id); // load effect re-runs → this effect centers
      } else if (!data?.plan_id) {
        fresh.setPendingFocusRoomId(null);
        toast.info(t('floormap.roomNotOnPlan', 'Rummet är inte utritat på någon planritning'));
      }
    })();
  }, [pendingFocusRoomId, shapes, t]);

  // "Placera på planritningen": pre-place an unplaced room at view center,
  // then center/select it so the user can immediately adjust the corners.
  const pendingPlaceRoom = useFloorMapStore((s) => s.pendingPlaceRoom);
  useEffect(() => {
    if (!pendingPlaceRoom || !currentPlanId || isReadOnly) return;
    const store = useFloorMapStore.getState();
    // Already placed (stale request or double-fire): just focus it.
    const existing = store.shapes.find(
      (s) => s.type === 'room' && s.roomId === pendingPlaceRoom.roomId
    );
    store.setPendingPlaceRoom(null);
    if (existing) {
      store.centerOnRoom(pendingPlaceRoom.roomId);
      return;
    }
    const el = containerRef.current;
    const { viewState: view } = store;
    const viewCenter = {
      x: ((el?.clientWidth ?? 1200) / 2 - view.panX) / view.zoom,
      y: ((el?.clientHeight ?? 800) / 2 - view.panY) / view.zoom,
    };
    const placed = placeRoomOnPlan(pendingPlaceRoom, viewCenter);
    if (placed) {
      useFloorMapStore.getState().centerOnRoom(pendingPlaceRoom.roomId);
      toast.success(
        t(
          'floormap.roomPlacedAdjust',
          '"{{name}}" är utplacerat — dra i hörnen för att justera måtten',
          { name: pendingPlaceRoom.name }
        )
      );
    }
  }, [pendingPlaceRoom, currentPlanId, isReadOnly, t]);

  // Keep the controller in sync with the store tool
  useEffect(() => {
    controller.setActiveTool(activeTool);
  }, [activeTool, controller]);

  useEffect(() => () => controller.dispose(), [controller]);

  const save = useCallback(async (): Promise<boolean> => {
    const { currentPlanId: planId, shapes: current } = useFloorMapStore.getState();
    if (!planId) return false;
    const ok = await saveShapesForPlan(planId, current);
    if (!ok) toast.error(t('floormap.saveFailed', 'Kunde inte spara planritningen'));
    return ok;
  }, [t]);

  // Debounced autosave on committed changes
  useEffect(() => {
    if (isReadOnly || dirtyCounter === 0) return;
    const timer = setTimeout(save, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [dirtyCounter, isReadOnly, save]);

  // Compatibility bridge for the legacy toolbar (removed in phase 5 when the
  // new EditorToolbar replaces SimpleToolbar/HomeownerToolbar).
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__canvasSave = save;
    w.__canvasUndo = () => {
      undo();
      emitHistoryState();
    };
    w.__canvasRedo = () => {
      redo();
      emitHistoryState();
    };
    const emitHistoryState = () => {
      window.dispatchEvent(
        new CustomEvent('canvasUndoRedoStateChange', {
          detail: { canUndo: canUndo(), canRedo: canRedo() },
        })
      );
    };
    emitHistoryState();
    return () => {
      delete w.__canvasSave;
      delete w.__canvasUndo;
      delete w.__canvasRedo;
    };
  }, [save]);

  // Emit history-state changes for the legacy top bar buttons
  const uiCanUndo = useEditorUiStore((s) => s.canUndo);
  const uiCanRedo = useEditorUiStore((s) => s.canRedo);
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('canvasUndoRedoStateChange', {
        detail: { canUndo: uiCanUndo, canRedo: uiCanRedo },
      })
    );
  }, [uiCanUndo, uiCanRedo]);

  // Dev-only debug handle for automated verification (MCP/e2e). Not part of
  // the product surface; stripped from production behavior by the DEV guard.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as Record<string, unknown>;
    w.__rfEditorDebug = {
      getShapes: () => useFloorMapStore.getState().shapes,
      getUi: () => useEditorUiStore.getState(),
      getView: () => useFloorMapStore.getState().viewState,
      getTool: () => useFloorMapStore.getState().activeTool,
      execute,
      placeRoom: (req: { roomId: string; name: string; color?: string | null; areaSqm?: number | null }) =>
        useFloorMapStore.getState().setPendingPlaceRoom(req),
      isReadOnly,
    };
    return () => {
      delete w.__rfEditorDebug;
    };
  }, [isReadOnly]);

  // Keyboard pipeline
  useEffect(() => {
    if (isReadOnly) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (controller.onKeyDown(e)) e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => controller.onKeyUp(e);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [controller, isReadOnly]);

  // Wheel: zoom to cursor (pinch/ctrl included), trackpad pan otherwise
  const handleWheel = useCallback((e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const store = useFloorMapStore.getState();
    const { zoom, panX, panY } = store.viewState;
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;

    if (e.evt.ctrlKey || e.evt.metaKey) {
      const scaleBy = Math.exp(-e.evt.deltaY * 0.01);
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * scaleBy));
      const worldX = (pointer.x - panX) / zoom;
      const worldY = (pointer.y - panY) / zoom;
      store.setViewState({
        zoom: newZoom,
        panX: pointer.x - worldX * newZoom,
        panY: pointer.y - worldY * newZoom,
      });
    } else {
      store.setViewState({ panX: panX - e.evt.deltaX, panY: panY - e.evt.deltaY });
    }
  }, []);

  const pointerHandlers = isReadOnly
    ? {}
    : {
        onPointerDown: (e: KonvaEventObject<PointerEvent>) =>
          stageRef.current && controller.onPointerDown(e, stageRef.current),
        onPointerMove: (e: KonvaEventObject<PointerEvent>) =>
          stageRef.current && controller.onPointerMove(e, stageRef.current),
        onPointerUp: (e: KonvaEventObject<PointerEvent>) =>
          stageRef.current && controller.onPointerUp(e, stageRef.current),
        onDblClick: (e: KonvaEventObject<MouseEvent>) =>
          stageRef.current && controller.onDoubleClick(e, stageRef.current),
        // Konva emits 'pointerdblclick' (not 'dblclick') for pointer-event input
        onPointerDblClick: (e: KonvaEventObject<PointerEvent>) =>
          stageRef.current && controller.onDoubleClick(e, stageRef.current),
      };

  return (
    <div ref={containerRef} className="relative w-full h-full bg-muted/30" data-testid="editor-v2-canvas">
      <EditorHud />
      {!isReadOnly && <FloatingSelectionToolbar />}
      {!isReadOnly && <WallLengthEditor />}
      {!isReadOnly && <TextEditor />}
      <RoomNamingController isReadOnly={isReadOnly} />
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        x={viewState.panX}
        y={viewState.panY}
        scaleX={viewState.zoom}
        scaleY={viewState.zoom}
        onWheel={handleWheel}
        {...pointerHandlers}
      >
        <Layer listening={false}>
          <Grid
            viewState={viewState}
            scaleSettings={scaleSettings}
            projectSettings={projectSettings}
          />
        </Layer>
        <Layer>
          <LegacyShapesLayer
            shapes={shapes}
            planId={currentPlanId}
            selectedIds={selectedShapeIds}
            zoom={viewState.zoom}
          />
          <WallsLayer
            shapes={shapes}
            planId={currentPlanId}
            selectedIds={selectedShapeIds}
            zoom={viewState.zoom}
            showDimensions
          />
          <OpeningsLayer
            shapes={shapes}
            planId={currentPlanId}
            selectedIds={selectedShapeIds}
            zoom={viewState.zoom}
          />
          <ObjectsLayer
            shapes={shapes}
            planId={currentPlanId}
            selectedIds={selectedShapeIds}
            zoom={viewState.zoom}
          />
        </Layer>
        <Layer listening={false}>
          <OverlayLayer zoom={viewState.zoom} />
        </Layer>
      </Stage>
    </div>
  );
};

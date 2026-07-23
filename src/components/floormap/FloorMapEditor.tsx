import { useState, useEffect, useCallback, useRef, Suspense, lazy } from "react";
import { SimpleToolbar } from "./SimpleToolbar";
import { HomeownerToolbar } from "./HomeownerToolbar";
import { MobileCanvasToolbar } from "./MobileCanvasToolbar";
import { UnifiedKonvaCanvas } from "./UnifiedKonvaCanvas";
import { EditorCanvas } from "./editor/EditorCanvas";
import { EditorToolbar } from "./editor/EditorToolbar";
import { isEditorV2Enabled } from "./editor/flag";
import { useEditorUiStore } from "./editor/state/uiStore";
import { supabase } from "@/integrations/supabase/client";
import { RoomElevationView } from "./RoomElevationView";
import { RoomDetailDialog } from "./RoomDetailDialog";
import { RoomPickerDialog } from "./RoomPickerDialog";
import { SpacePlannerTopBar } from "./SpacePlannerTopBar";
import { PropertyInsightsPanel } from "./PropertyInsightsPanel";
import { useFloorMapStore } from "./store";
import { FloorMapShape } from "./types";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { loadPlansFromDB, createPlanInDB } from "./utils/plans";
import { Box, Loader2 } from "lucide-react";
import { useOnboarding } from "@/hooks/useOnboarding";
import { CanvasHint } from "@/components/onboarding/CanvasHint";

// Lazy load the 3D view for code splitting (reduces initial bundle size)
const ThreeDFloorPlan = lazy(() => import("./3d/ThreeDFloorPlan"));

interface FloorMapEditorProps {
  projectId: string;
  projectName?: string;
  onBack?: () => void;
  backLabel?: string;
  isReadOnly?: boolean;
  isDemo?: boolean;
  highlightedRoomIds?: string[];
  showPinterest?: boolean;
  simplified?: boolean;
}

export const FloorMapEditor = ({ projectId, projectName, onBack, backLabel, isReadOnly, isDemo, highlightedRoomIds, showPinterest, simplified }: FloorMapEditorProps) => {
  const { t } = useTranslation();
  const {
    plans,
    currentPlanId,
    shapes,
    viewMode,
    selectedShapeIds,
    setCurrentProjectId,
    setPlans,
    setCurrentPlanId,
  } = useFloorMapStore();

  const onboarding = useOnboarding();
  const [canvasHintDismissed, setCanvasHintDismissed] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [canUndoState, setCanUndoState] = useState(false);
  const [canRedoState, setCanRedoState] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<any>(null);
  const [roomDialogOpen, setRoomDialogOpen] = useState(false);

  // Room-based elevation view state
  const [elevationRoom, setElevationRoom] = useState<FloorMapShape | null>(null);
  const [roomPickerOpen, setRoomPickerOpen] = useState(false);

  // Show room picker when entering elevation mode without a room selected
  // Auto-select room if one is already selected on the floor plan
  useEffect(() => {
    if (viewMode === 'elevation' && !elevationRoom) {
      // Check if a room is already selected on the floor plan
      if (selectedShapeIds.length === 1) {
        const selectedShape = shapes.find(s => s.id === selectedShapeIds[0]);
        if (selectedShape?.type === 'room') {
          // Room is selected, use it directly for elevation view
          setElevationRoom(selectedShape);
          return;
        }
      }
      // No room selected, show the room picker
      setRoomPickerOpen(true);
    }
  }, [viewMode, elevationRoom, selectedShapeIds, shapes]);

  // Clear elevation room when leaving elevation mode
  useEffect(() => {
    if (viewMode !== 'elevation') {
      setElevationRoom(null);
    }
  }, [viewMode]);

  // Update undo/redo state from canvas via event (replaces polling)
  useEffect(() => {
    const handleUndoRedoChange = (e: CustomEvent<{ canUndo: boolean; canRedo: boolean }>) => {
      setCanUndoState(e.detail.canUndo);
      setCanRedoState(e.detail.canRedo);
    };

    window.addEventListener('canvasUndoRedoStateChange', handleUndoRedoChange as EventListener);
    return () => window.removeEventListener('canvasUndoRedoStateChange', handleUndoRedoChange as EventListener);
  }, []);

  // Keyboard shortcuts - MINIMAL (most handled in UnifiedKonvaCanvas)
  useEffect(() => {
    // Detect OS for proper modifier key
    const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle shortcuts that are specific to FloorMapEditor
      // All canvas shortcuts (Ctrl+Z/Y/C/V/D/A, Delete, etc.) are in UnifiedKonvaCanvas
      
      // Use Cmd on Mac, Ctrl on Windows - simplified
      const modKey = isMac ? e.metaKey : e.ctrlKey;
      
      // Save - keep here as it's a top-level action
      // NOTE: Do NOT handle Z/Y here - those are canvas undo/redo
      if (modKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveShapes();
      }
      
      // Explicitly do NOT handle Z, Y (undo/redo) - let canvas handle those
      // Do NOT call e.preventDefault() or e.stopPropagation() for other keys
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Prevent accidental browser back navigation from swipe gestures
  // This pushes a "guard" history state - if user swipes back, they stay on the page
  useEffect(() => {
    // Only add guard if we're in floor plan mode
    if (viewMode !== 'floor') return;

    const guardState = { isFloorPlannerGuard: true };

    // Push a guard state to history
    window.history.pushState(guardState, '');

    const handlePopState = (e: PopStateEvent) => {
      // If we popped our guard state, push it back
      if (!e.state?.isFloorPlannerGuard) {
        window.history.pushState(guardState, '');
      }
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      // Clean up: go back to remove our guard state if it's still there
      if (window.history.state?.isFloorPlannerGuard) {
        window.history.back();
      }
    };
  }, [viewMode]);

  // Initialize project context
  useEffect(() => {
    setCurrentProjectId(projectId);
  }, [projectId, setCurrentProjectId]);

  // Load plans on mount
  useEffect(() => {
    loadInitialData();
  }, [projectId]);

  // Mark enterCanvas step as complete when user enters the canvas
  useEffect(() => {
    if (onboarding.isStepActive("enterCanvas")) {
      onboarding.markStepComplete("enterCanvas");
    }
  }, [onboarding.currentStepKey]);

  const loadInitialData = async () => {
    // Load all plans for this project
    const loadedPlans = await loadPlansFromDB(projectId);
    if (loadedPlans.length === 0) {
      // Create a default plan if none exist
      const defaultPlan = await createPlanInDB(projectId, t("Floor Plan 1"));
      if (defaultPlan) {
        setPlans([defaultPlan]);
        setCurrentPlanId(defaultPlan.id);
      }
    } else {
      setPlans(loadedPlans);
      const defaultPlan = loadedPlans.find((p) => p.isDefault) || loadedPlans[0];
      setCurrentPlanId(defaultPlan.id);
    }
  };

  // Note: Auto-save is now handled by the canvas component itself

  const saveShapes = async () => {
    if (isSaving) return;

    setIsSaving(true);
    // Use canvas save function instead of plan save
    if ((window as any).__canvasSave) {
      const success = await (window as any).__canvasSave();
      if (success) {
        setHasUnsavedChanges(false);
        // toast.success is already shown in canvas save function
      }
    } else {
      toast.error('Canvas save function not available');
    }
    setIsSaving(false);
  };

  const handleManualSave = () => {
    saveShapes();
  };

  const handleDelete = () => {
    // Delete is handled in the canvas with Delete key
    toast.info(t("Press Delete or Backspace to remove the selected object"));
  };

  const handleUndo = () => {
    // Call canvas undo directly
    if ((window as any).__canvasUndo) {
      (window as any).__canvasUndo();
      toast.success(t("Undone"));
    }
  };

  const handleRedo = () => {
    // Call canvas redo directly
    if ((window as any).__canvasRedo) {
      (window as any).__canvasRedo();
      toast.success(t("Redone"));
    }
  };

  const handleRoomClick = (room: any) => {
    setSelectedRoom(room);
    setRoomDialogOpen(true);
  };

  // v2 editor: double-clicking a linked room on the canvas requests the
  // room-details panel (same Sheet as the rooms list) via the editor ui store.
  const roomDetailsRoomId = useEditorUiStore((s) => s.roomDetailsRoomId);
  useEffect(() => {
    if (!roomDetailsRoomId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("*")
        .eq("id", roomDetailsRoomId)
        .maybeSingle();
      useEditorUiStore.getState().setRoomDetailsRoomId(null);
      if (cancelled) return;
      if (error || !data) {
        toast.error(t("floormap.roomDetailsLoadFailed", "Kunde inte hämta rumsdetaljerna"));
        return;
      }
      setSelectedRoom(data);
      setRoomDialogOpen(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [roomDetailsRoomId, t]);

  const handleRoomUpdated = () => {
    // Refresh rooms list
    setSelectedRoom(null);
    // Increment trigger to notify canvas of room updates
    setRoomUpdateTrigger(prev => prev + 1);
  };

  const [roomUpdateTrigger, setRoomUpdateTrigger] = useState(0);

  return (
    <div className="flex flex-col h-full">
      {/* Top Bar with Plan Selector */}
      <SpacePlannerTopBar projectId={projectId} projectName={projectName} onBack={onBack} backLabel={backLabel} isReadOnly={isReadOnly} />
      
      <style dangerouslySetInnerHTML={{
        __html: `
          .canvas-scroll-area, .canvas-scrollable-container {
            scroll-behavior: smooth;
            touch-action: none;
            overscroll-behavior: contain;
            scrollbar-width: thin;
            scrollbar-color: rgba(0, 0, 0, 0.2) rgba(0, 0, 0, 0.05);
          }
          .canvas-scroll-area::-webkit-scrollbar,
          .canvas-scrollable-container::-webkit-scrollbar {
            width: 14px;
            height: 14px;
          }
          .canvas-scroll-area::-webkit-scrollbar-track,
          .canvas-scrollable-container::-webkit-scrollbar-track {
            background: rgba(0, 0, 0, 0.05);
          }
          .canvas-scroll-area::-webkit-scrollbar-thumb,
          .canvas-scrollable-container::-webkit-scrollbar-thumb {
            background: rgba(0, 0, 0, 0.3);
            border-radius: 0px;
            border: 2px solid rgba(0, 0, 0, 0.05);
            transition: background 0.2s ease;
          }
          .canvas-scroll-area::-webkit-scrollbar-thumb:hover,
          .canvas-scrollable-container::-webkit-scrollbar-thumb:hover {
            background: rgba(0, 0, 0, 0.4);
          }
          .canvas-scroll-area::-webkit-scrollbar-thumb:active,
          .canvas-scrollable-container::-webkit-scrollbar-thumb:active {
            background: rgba(0, 0, 0, 0.5);
          }
          .canvas-scroll-area::-webkit-scrollbar-corner,
          .canvas-scrollable-container::-webkit-scrollbar-corner {
            background: rgba(0, 0, 0, 0.05);
          }
        `
      }} />
      <div className={`flex flex-1 relative ${isDemo ? 'pt-[96px]' : 'pt-14'}`}> {/* Padding for fixed TopBar + optional demo banner */}
        {/* Left Toolbar - Show in floor plan mode when editable, or always in demo.
            v2: ONE consolidated rail (industry-consensus 8 slots) for both roles. */}
        {viewMode === 'floor' && (!isReadOnly || isDemo) && isEditorV2Enabled() && (
          <EditorToolbar projectId={projectId} />
        )}
        {viewMode === 'floor' && (!isReadOnly || isDemo) && !isEditorV2Enabled() && (
          simplified ? (
            <>
              {/* Desktop: full vertical toolbar */}
              <HomeownerToolbar
                projectId={projectId}
                onSave={handleManualSave}
                onDelete={handleDelete}
                onUndo={handleUndo}
                onRedo={handleRedo}
                canUndo={canUndoState}
                canRedo={canRedoState}
              />
              {/* Mobile: compact bottom toolbar */}
              <MobileCanvasToolbar
                projectId={projectId}
                onSave={handleManualSave}
                onDelete={handleDelete}
                onUndo={handleUndo}
                onRedo={handleRedo}
                canUndo={canUndoState}
                canRedo={canRedoState}
              />
            </>
          ) : (
            <SimpleToolbar
              projectId={projectId}
              onSave={handleManualSave}
              onDelete={handleDelete}
              onUndo={handleUndo}
              onRedo={handleRedo}
              canUndo={canUndoState}
              canRedo={canRedoState}
              isDemo={isDemo}
              showPinterest={showPinterest}
            />
          )
        )}

        {/* Main Canvas Area - Switch based on viewMode */}
        {viewMode === 'floor' && isEditorV2Enabled() && (
          <main className="flex-1 overflow-hidden relative">
            <EditorCanvas isReadOnly={isReadOnly && !isDemo} />
            {!isReadOnly && <PropertyInsightsPanel />}
          </main>
        )}

        {viewMode === 'floor' && !isEditorV2Enabled() && (
          <main className="flex-1 overflow-hidden canvas-scroll-area relative">
            <UnifiedKonvaCanvas
              onRoomCreated={() => {
                setRoomUpdateTrigger(prev => prev + 1);
                // Mark drawRoom step as complete when user draws a room
                if (onboarding.isStepActive("drawRoom")) {
                  onboarding.markStepComplete("drawRoom");
                }
              }}
              isReadOnly={isReadOnly && !isDemo}
              isDemo={isDemo}
              highlightedRoomIds={highlightedRoomIds}
              showPinterest={showPinterest}
              simplified={simplified}
            />
            {/* Property insights panel — always visible (includes grid toggle) */}
            {!isReadOnly && <PropertyInsightsPanel />}
            {/* Onboarding canvas hint */}
            {!isReadOnly && !canvasHintDismissed && !onboarding.isDismissed && onboarding.currentStep?.canvasHintKey && (
              <CanvasHint
                currentStepKey={onboarding.currentStepKey}
                canvasHintKey={onboarding.currentStep.canvasHintKey}
                onDismiss={() => setCanvasHintDismissed(true)}
              />
            )}
          </main>
        )}

        {viewMode === 'elevation' && (
          <main className="flex-1 overflow-hidden relative">
            {/* Single room-centric elevation view. When no room is chosen yet the
                RoomPickerDialog overlays this area; cancelling it returns to floor. */}
            {elevationRoom && (
              <RoomElevationView
                room={elevationRoom}
                projectId={projectId}
                onClose={() => {
                  setElevationRoom(null);
                  useFloorMapStore.getState().setViewMode('floor');
                }}
              />
            )}
          </main>
        )}

        {viewMode === '3d' && (
          <main className="flex-1 overflow-hidden relative">
            <Suspense fallback={
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-b from-sky-100 to-sky-50">
                <div className="text-center">
                  <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">{t("floormap.loading3DView")}</p>
                </div>
              </div>
            }>
              <ThreeDFloorPlan projectId={projectId} />
            </Suspense>
          </main>
        )}

      </div>

      {/* Room Detail Dialog */}
      <RoomDetailDialog
        room={selectedRoom}
        projectId={projectId}
        open={roomDialogOpen}
        onOpenChange={setRoomDialogOpen}
        onRoomUpdated={handleRoomUpdated}
        onPlaceItemOnPlan={(args) => useFloorMapStore.getState().setPendingItemPlacement(args)}
      />

      {/* Room Picker Dialog for elevation view */}
      <RoomPickerDialog
        open={roomPickerOpen}
        onOpenChange={(open) => {
          setRoomPickerOpen(open);
          // If closing without selecting, go back to floor plan
          if (!open && !elevationRoom) {
            useFloorMapStore.getState().setViewMode('floor');
          }
        }}
        rooms={shapes.filter(s => s.type === 'room' && s.planId === currentPlanId)}
        onSelectRoom={(room) => {
          setElevationRoom(room);
          setRoomPickerOpen(false);
          useFloorMapStore.getState().setViewMode('elevation');
        }}
      />

      {/* Save indicator */}
      {isSaving && (
        <div className="fixed bottom-4 right-4 bg-primary text-primary-foreground px-4 py-2 rounded-lg shadow-lg">
          {t("Saving...")}
        </div>
      )}
    </div>
  );
};

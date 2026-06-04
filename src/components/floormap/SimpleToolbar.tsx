import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  MousePointer2,
  Pencil,
  Minus,
  Eraser,
  Save,
  Undo,
  Redo,
  Trash2,
  ZoomIn,
  ZoomOut,
  Home,
  Type,
  Scissors,
  Link,
  Square,
  Circle,
  Triangle,
  Sparkles,
  Copy,
  Bookmark,
  Spline,
  ImagePlus,
  Loader2,
  Plus,
  Shapes,
  Building2,
  LucideIcon,
  Ruler,
  Frame,
  Grid3X3,
  Plug,
  StickyNote,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { CanvasSettingsPopover } from "./CanvasSettingsPopover";
import { AIFloorPlanImport } from "@/components/project/AIFloorPlanImport";
import { TemplateGallery } from "./TemplateGallery";
import { TemplateGalleryDropdown } from "./TemplateGalleryDropdown";
import { SaveTemplateDialog } from "./SaveTemplateDialog";
import { LayerControls } from "./toolbar";
import { supabase } from "@/integrations/supabase/client";
import { v4 as uuidv4 } from 'uuid';
import { FloorMapShape } from "./types";
import { updatePlanInDB } from "./utils/plans";
import { fetchPinterestPin, parsePinterestPinUrl } from "@/services/pinterestOEmbed";
import { generateWallsFromRooms } from "./utils/roomWalls";
import { getAdminDefaults } from "./canvas/constants";
import { useOnboarding } from "@/hooks/useOnboarding";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Pinterest Logo SVG
const PinterestLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738.098.119.112.224.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z" />
  </svg>
);

// Custom icons
const OuterWallIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="4" y1="11" x2="20" y2="11" strokeWidth="2.5" />
    <line x1="4" y1="13" x2="20" y2="13" strokeWidth="2.5" />
  </svg>
);

const WindowLineIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="4" y1="10" x2="20" y2="10" strokeWidth="1" />
    <line x1="4" y1="14" x2="20" y2="14" strokeWidth="1" />
    <line x1="12" y1="10" x2="12" y2="14" strokeWidth="1" />
  </svg>
);

const DoorLineIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="4" y1="12" x2="14" y2="12" strokeWidth="2" />
    <path d="M 14 12 Q 14 6 20 6" fill="none" strokeWidth="1" />
    <line x1="14" y1="12" x2="20" y2="6" strokeWidth="1" strokeDasharray="2,1" />
  </svg>
);

const SlidingDoorLineIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="4" y1="11" x2="14" y2="11" strokeWidth="2" />
    <line x1="10" y1="13" x2="20" y2="13" strokeWidth="2" />
    <path d="M 16 10 L 19 12 L 16 14" fill="none" strokeWidth="1" />
  </svg>
);

const OpeningLineIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="6" y1="8" x2="6" y2="16" strokeWidth="2" />
    <line x1="18" y1="8" x2="18" y2="16" strokeWidth="2" />
    <line x1="6" y1="12" x2="18" y2="12" strokeWidth="1" strokeDasharray="2,2" />
  </svg>
);

import { useFloorMapStore } from "./store";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { ObjectLibraryPanel } from "./objectLibrary/ObjectLibraryPanel";
import { UnifiedObjectDefinition } from "./objectLibrary/types";

interface ToolItem {
  id: string;
  icon: LucideIcon | React.FC<{ className?: string }>;
  label: string;
  description?: string;
  shortcut?: string;
  onClick: () => void;
}

interface ToolCategoryProps {
  icon: LucideIcon | React.FC<{ className?: string }>;
  label: string;
  items: ToolItem[];
  isOpen: boolean;
  onToggle: () => void;
  activeItemId?: string;
  gradient?: string;
}

// Expandable tool category (Miro-style popover flyout)
const ToolCategory = ({ icon: Icon, label, items, isOpen, onToggle, activeItemId, gradient }: ToolCategoryProps) => {
  const hasActiveItem = items.some(item => item.id === activeItemId);

  return (
    <Popover open={isOpen} onOpenChange={onToggle}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant={hasActiveItem ? "default" : "ghost"}
              size="icon"
              className={cn(
                "w-10 h-10 relative",
                hasActiveItem && "bg-primary text-primary-foreground",
                gradient && !hasActiveItem && gradient
              )}
            >
              <Icon className="h-5 w-5" />
              <Plus className="h-2.5 w-2.5 absolute bottom-0.5 right-0.5 opacity-70" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="right"><p>{label}</p></TooltipContent>
      </Tooltip>

      <PopoverContent
        side="right"
        align="start"
        className={cn(
          "w-52 p-2 ml-2",
          "bg-white/95 backdrop-blur-xl",
          "border border-white/20",
          "rounded-xl shadow-lg shadow-black/10",
          "animate-in fade-in slide-in-from-left-2 duration-200"
        )}
      >
        <div className="flex flex-col gap-1">
          <div className="px-2 py-1.5 text-sm font-semibold border-b border-border/50 mb-1 text-gray-700">
            {label}
          </div>
          {items.map((item) => {
            const ItemIcon = item.icon;
            const isActive = item.id === activeItemId;
            return (
              <Button
                key={item.id}
                variant={isActive ? "secondary" : "ghost"}
                size="sm"
                className={cn(
                  "w-full justify-start gap-3 h-9 px-2",
                  "hover:bg-black/5",
                  isActive && "bg-primary/10 text-primary"
                )}
                onClick={() => { item.onClick(); onToggle(); }}
              >
                <ItemIcon className={cn("h-4 w-4 shrink-0", isActive && "text-primary")} />
                <div className="flex flex-col items-start flex-1 min-w-0">
                  <span className="text-sm truncate">{item.label}</span>
                  {item.description && (
                    <span className="text-xs text-muted-foreground truncate">{item.description}</span>
                  )}
                </div>
                {item.shortcut && (
                  <span className="text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded shrink-0">
                    {item.shortcut}
                  </span>
                )}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};

interface SimpleToolbarProps {
  projectId: string;
  onSave: () => void;
  onDelete: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  isDemo?: boolean;
  showPinterest?: boolean;
}

export const SimpleToolbar = ({
  projectId,
  onSave,
  onDelete,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  isDemo,
  showPinterest,
}: SimpleToolbarProps) => {
  const { t } = useTranslation();
  const {
    activeTool, setActiveTool,
    viewState, setViewState,
    selectedShapeIds, addShape,
    currentPlanId, pendingObjectId, setPendingObjectId,
    toggleGrid,
  } = useFloorMapStore();
  const shapes = useFloorMapStore(s => s.shapes);
  const plans = useFloorMapStore(s => s.plans);
  const projectSettings = useFloorMapStore(s => s.projectSettings);
  const updatePlan = useFloorMapStore(s => s.updatePlan);
  const onboarding = useOnboarding();

  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [aiImportOpen, setAiImportOpen] = useState(false);
  const [templateGalleryOpen, setTemplateGalleryOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [objectLibraryOpen, setObjectLibraryOpen] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [pinterestDialogOpen, setPinterestDialogOpen] = useState(false);
  const [pinterestUrlInput, setPinterestUrlInput] = useState("");
  const [pinterestUrlError, setPinterestUrlError] = useState<string | null>(null);
  const [importingPin, setImportingPin] = useState(false);

  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const modKey = isMac ? '⌘' : 'Ctrl';

  const currentPlan = plans.find(p => p.id === currentPlanId);
  const hasStartingView = Boolean(currentPlan?.viewSettings?.startingView);

  const handleToggleStartingView = useCallback(async () => {
    if (!currentPlanId || !currentPlan) return;
    if (hasStartingView) {
      const newSettings = { ...currentPlan.viewSettings, startingView: null };
      updatePlan(currentPlanId, { viewSettings: newSettings });
      await updatePlanInDB(currentPlanId, { viewSettings: newSettings });
      toast.success(t('canvas.startingViewCleared', 'Starting view cleared — will auto-fit to content'));
    } else {
      const newSettings = {
        ...currentPlan.viewSettings,
        startingView: { panX: viewState.panX, panY: viewState.panY, zoom: viewState.zoom },
      };
      updatePlan(currentPlanId, { viewSettings: newSettings });
      await updatePlanInDB(currentPlanId, { viewSettings: newSettings });
      toast.success(t('canvas.startingViewSaved', 'Starting view saved'));
    }
  }, [currentPlanId, currentPlan, hasStartingView, viewState, updatePlan, t]);

  const selectedRooms = useMemo(
    () => selectedShapeIds
      .map(id => shapes.find(s => s.id === id))
      .filter((s): s is FloorMapShape => s?.type === 'room'),
    [selectedShapeIds, shapes]
  );
  const hasSelectedRooms = selectedRooms.length > 0;

  const handleCreateWallsFromRoom = useCallback(() => {
    if (selectedRooms.length === 0) return;
    const { wallThicknessMM, wallHeightMM } = getAdminDefaults();
    const existingWalls = shapes.filter(s => s.type === 'wall' || s.type === 'line');
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
      if (onboarding.isStepActive("generateWalls")) {
        onboarding.markStepComplete("generateWalls");
      }
    }
  }, [selectedRooms, shapes, currentPlanId, addShape, onboarding]);

  useEffect(() => {
    const handleOpenTemplateGallery = () => setTemplateGalleryOpen(true);
    const handleOpenAIImport = () => setAiImportOpen(true);
    const handleOpenImageImport = () => imageInputRef.current?.click();
    const handleOpenPinterestImport = () => {
      setPinterestUrlInput("");
      setPinterestUrlError(null);
      setPinterestDialogOpen(true);
    };
    window.addEventListener('openTemplateGallery', handleOpenTemplateGallery);
    window.addEventListener('openAIImport', handleOpenAIImport);
    window.addEventListener('openImageImport', handleOpenImageImport);
    window.addEventListener('openPinterestImport', handleOpenPinterestImport);
    return () => {
      window.removeEventListener('openTemplateGallery', handleOpenTemplateGallery);
      window.removeEventListener('openAIImport', handleOpenAIImport);
      window.removeEventListener('openImageImport', handleOpenImageImport);
      window.removeEventListener('openPinterestImport', handleOpenPinterestImport);
    };
  }, []);

  const toggleCategory = (category: string) => {
    setOpenCategory(openCategory === category ? null : category);
  };

  const handleWallConstruction = (templateType: 'square2x2' | 'circle2m' | 'triangle' | 'outer_wall') => {
    if (templateType === 'outer_wall') {
      setActiveTool('wall');
      (window as any).__wallType = 'outer';
      (window as any).__wallThickness = 300;
      toast.info('Yttervägg aktiverat (300mm)');
    } else {
      (window as any).__createTemplate = templateType;
      setActiveTool('select');
    }
  };

  const handleZoom = (direction: 'in' | 'out') => {
    const factor = direction === 'in' ? 1.2 : 1 / 1.2;
    const newZoom = Math.max(0.2, Math.min(5, viewState.zoom * factor));
    setViewState({ zoom: newZoom });
  };

  const handleImageImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Vänligen välj en bildfil'); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error('Max 10MB'); return; }
    setIsUploadingImage(true);
    try {
      const filePath = `projects/${projectId}/Uppladdade filer/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from('project-files').upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('project-files').getPublicUrl(filePath);
      const cx = (window.innerWidth / 2 - viewState.panX) / viewState.zoom;
      const cy = (window.innerHeight / 2 - viewState.panY) / viewState.zoom;
      const imageShape: FloorMapShape = {
        id: uuidv4(),
        type: 'image',
        planId: currentPlanId || undefined,
        coordinates: { x: cx, y: cy, width: 0, height: 0 },
        imageUrl: publicUrl,
        imageOpacity: 0.5,
        locked: false,
        zIndex: -100,
        name: file.name,
      };
      addShape(imageShape);
      toast.success(`"${file.name}" tillagd`);
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error('Kunde inte ladda upp');
    } finally {
      setIsUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  }, [projectId, addShape, currentPlanId, viewState]);

  const handlePinterestImport = useCallback(async () => {
    const url = pinterestUrlInput.trim();
    if (!url) { setPinterestUrlError("Ange en Pinterest pin URL"); return; }
    if (!parsePinterestPinUrl(url)) { setPinterestUrlError("Ogiltig Pinterest pin URL. Använd format: pinterest.com/pin/123456789/"); return; }
    setImportingPin(true);
    setPinterestUrlError(null);
    try {
      const pinData = await fetchPinterestPin(url, projectId);
      const imageShape: FloorMapShape = {
        id: uuidv4(),
        type: 'image',
        planId: currentPlanId || undefined,
        coordinates: { x: 500, y: 500, width: pinData.width || 0, height: pinData.height || 0 },
        imageUrl: pinData.storageUrl || pinData.imageUrl,
        imageOpacity: 1,
        locked: false,
        zIndex: 0,
        name: pinData.title || 'Pinterest pin',
        metadata: { source: 'pinterest', sourceUrl: pinData.sourceUrl, pinId: pinData.pinId },
      };
      addShape(imageShape);
      toast.success(`"${pinData.title}" tillagd på canvas`);
      setPinterestDialogOpen(false);
      setPinterestUrlInput("");
    } catch (error) {
      console.error("Error importing pin:", error);
      if (error instanceof Error) setPinterestUrlError(error.message);
      else toast.error("Kunde inte importera pin");
    } finally {
      setImportingPin(false);
    }
  }, [pinterestUrlInput, addShape, currentPlanId, projectId]);

  // ── Tool arrays ─────────────────────────────────────────────────────────────

  // Architectural openings — niche, in a popover
  const openingTools: ToolItem[] = [
    { id: 'door_line', icon: DoorLineIcon, label: 'Dörr', onClick: () => setActiveTool('door_line') },
    { id: 'window_line', icon: WindowLineIcon, label: 'Fönster', onClick: () => setActiveTool('window_line') },
    { id: 'sliding_door_line', icon: SlidingDoorLineIcon, label: 'Skjutdörr', onClick: () => setActiveTool('sliding_door_line') },
    { id: 'opening_line', icon: OpeningLineIcon, label: 'Väggöppning', onClick: () => setActiveTool('opening_line') },
    { id: 'outer_wall', icon: OuterWallIcon, label: 'Yttervägg (300mm)', onClick: () => handleWallConstruction('outer_wall') },
    { id: 'square2x2', icon: Square, label: 'Fyrkant 2×2 m', onClick: () => handleWallConstruction('square2x2') },
    { id: 'triangle', icon: Triangle, label: 'Triangel', onClick: () => handleWallConstruction('triangle') },
  ];

  // Generic shapes & editing tools — in a popover
  const shapeTools: ToolItem[] = [
    { id: 'rectangle', icon: Square, label: 'Rektangel', shortcut: 'R', onClick: () => setActiveTool('rectangle') },
    { id: 'circle', icon: Circle, label: 'Cirkel', shortcut: 'C', onClick: () => setActiveTool('circle') },
    { id: 'freehand', icon: Pencil, label: 'Frihand', shortcut: 'P', onClick: () => setActiveTool('freehand') },
    { id: 'bezier', icon: Spline, label: 'Kurva', shortcut: 'B', onClick: () => setActiveTool('bezier') },
    { id: 'connector', icon: ArrowRight, label: 'Koppling', onClick: () => setActiveTool('connector') },
    { id: 'eraser', icon: Eraser, label: 'Sudd', shortcut: 'E', onClick: () => setActiveTool('eraser') },
    { id: 'scissors', icon: Scissors, label: 'Dela linje', onClick: () => setActiveTool('scissors') },
    { id: 'glue', icon: Link, label: 'Klistra ihop', onClick: () => setActiveTool('glue') },
  ];

  const isObjectActive = activeTool === 'object';

  const handleSelectObject = useCallback((definition: UnifiedObjectDefinition) => {
    setPendingObjectId(definition.id);
    setObjectLibraryOpen(false);
    toast.success(t('objectLibrary.objectSelected', { name: definition.name, defaultValue: `${definition.name} vald - klicka på canvas för att placera` }));
  }, [setPendingObjectId, t]);

  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  // All categories used in mobile sheet
  const allMobileCategories = [
    { icon: Building2, label: 'Öppningar', items: openingTools },
    { icon: Shapes, label: 'Former & verktyg', items: shapeTools },
  ];

  return (
    <>
    {/* ── Mobile toolbar ─────────────────────────────────────────────────────── */}
    <div className={cn("md:hidden fixed left-2 w-11 bg-white/90 backdrop-blur-xl border border-white/20 rounded-2xl shadow-lg shadow-black/5 flex flex-col items-center py-2 gap-1 z-50", isDemo ? "top-[104px]" : "top-20")}>
      <Button variant={activeTool === 'select' ? 'default' : 'ghost'} size="icon" onClick={() => setActiveTool('select')} className={cn("w-9 h-9", activeTool === 'select' && "bg-primary text-primary-foreground")}>
        <MousePointer2 className="h-4 w-4" />
      </Button>
      <Button variant={activeTool === 'room' ? 'default' : 'ghost'} size="icon" onClick={() => setActiveTool('room')} className={cn("w-9 h-9", activeTool === 'room' && "bg-primary text-primary-foreground")}>
        <Home className="h-4 w-4" />
      </Button>
      <Button variant={activeTool === 'wall' ? 'default' : 'ghost'} size="icon" onClick={() => setActiveTool('wall')} className={cn("w-9 h-9", activeTool === 'wall' && "bg-primary text-primary-foreground")}>
        <Minus className="h-4 w-4" />
      </Button>
      <Button variant={activeTool === 'measure' ? 'default' : 'ghost'} size="icon" onClick={() => setActiveTool('measure')} className={cn("w-9 h-9", activeTool === 'measure' && "bg-red-500 text-white")}>
        <Ruler className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={onUndo} disabled={!canUndo} className="w-9 h-9">
        <Undo className="h-4 w-4" />
      </Button>
      <Separator className="w-6 my-0.5" />
      <Sheet open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="w-9 h-9">
            <Shapes className="h-4 w-4" />
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="max-h-[70vh] overflow-y-auto">
          <SheetHeader><SheetTitle>Verktyg</SheetTitle></SheetHeader>
          <div className="py-4 space-y-6">
            <Button variant={activeTool === 'select' ? 'default' : 'outline'} className="w-full justify-start gap-3" onClick={() => { setActiveTool('select'); setMobileSheetOpen(false); }}>
              <MousePointer2 className="h-5 w-5" />Välj (V)
            </Button>
            <Button variant={activeTool === 'room' ? 'default' : 'outline'} className="w-full justify-start gap-3" onClick={() => { setActiveTool('room'); setMobileSheetOpen(false); }}>
              <Home className="h-5 w-5" />Rita rum
            </Button>
            <Button variant={activeTool === 'wall' ? 'default' : 'outline'} className="w-full justify-start gap-3" onClick={() => { setActiveTool('wall'); setMobileSheetOpen(false); }}>
              <Minus className="h-5 w-5" />Rita vägg (W)
            </Button>
            <Button variant={activeTool === 'text' ? 'default' : 'outline'} className="w-full justify-start gap-3" onClick={() => { setActiveTool('text'); setMobileSheetOpen(false); }}>
              <Type className="h-5 w-5" />Text (T)
            </Button>
            <Button variant={activeTool === 'sticky_note' ? 'default' : 'outline'} className="w-full justify-start gap-3" onClick={() => { setActiveTool('sticky_note'); setMobileSheetOpen(false); }}>
              <StickyNote className="h-5 w-5" />Sticky note (N)
            </Button>
            {allMobileCategories.map((cat) => (
              <div key={cat.label}>
                <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-muted-foreground">
                  <cat.icon className="h-4 w-4" />{cat.label}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {cat.items.map((item) => {
                    const ItemIcon = item.icon;
                    const isActive = item.id === activeTool;
                    return (
                      <Button key={item.id} variant={isActive ? 'default' : 'outline'} size="sm" className="flex flex-col items-center gap-1 h-auto py-3" onClick={() => { item.onClick(); setMobileSheetOpen(false); }}>
                        <ItemIcon className="h-5 w-5" />
                        <span className="text-[10px] leading-tight">{item.label}</span>
                      </Button>
                    );
                  })}
                </div>
              </div>
            ))}
            <div>
              <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-muted-foreground">Åtgärder</div>
              <div className="grid grid-cols-3 gap-2">
                <Button variant="outline" size="sm" className="flex flex-col items-center gap-1 h-auto py-3" onClick={() => { onUndo(); setMobileSheetOpen(false); }} disabled={!canUndo}>
                  <Undo className="h-5 w-5" /><span className="text-[10px]">Ångra</span>
                </Button>
                <Button variant="outline" size="sm" className="flex flex-col items-center gap-1 h-auto py-3" onClick={() => { onRedo(); setMobileSheetOpen(false); }} disabled={!canRedo}>
                  <Redo className="h-5 w-5" /><span className="text-[10px]">Gör om</span>
                </Button>
                <Button variant="outline" size="sm" className="flex flex-col items-center gap-1 h-auto py-3" onClick={() => { onDelete(); setMobileSheetOpen(false); }}>
                  <Trash2 className="h-5 w-5" /><span className="text-[10px]">Ta bort</span>
                </Button>
                <Button variant="outline" size="sm" className="flex flex-col items-center gap-1 h-auto py-3" onClick={() => { onSave(); setMobileSheetOpen(false); }}>
                  <Save className="h-5 w-5" /><span className="text-[10px]">Spara</span>
                </Button>
                <Button variant={hasStartingView ? "default" : "outline"} size="sm" className="flex flex-col items-center gap-1 h-auto py-3" onClick={() => { handleToggleStartingView(); setMobileSheetOpen(false); }}>
                  <Frame className="h-5 w-5" /><span className="text-[10px]">{hasStartingView ? t('canvas.clearStartingView', 'Clear view') : t('canvas.setStartingView', 'Set view')}</span>
                </Button>
                {hasSelectedRooms && (
                  <Button variant="outline" size="sm" className="flex flex-col items-center gap-1 h-auto py-3 border-green-300 bg-green-50" onClick={() => { handleCreateWallsFromRoom(); setMobileSheetOpen(false); }}>
                    <Grid3X3 className="h-5 w-5 text-green-600" /><span className="text-[10px]">Skapa väggar</span>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleGrid}
        className={cn("w-9 h-9", projectSettings.gridVisible && "text-blue-600 bg-blue-50")}
      >
        <Grid3X3 className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={onSave} className="w-9 h-9">
        <Save className="h-4 w-4" />
      </Button>
    </div>

    {/* ── Desktop toolbar ─────────────────────────────────────────────────────── */}
    <div className={cn("hidden md:flex fixed left-4 w-14 bottom-4 bg-white/90 backdrop-blur-xl border border-white/20 rounded-2xl shadow-lg shadow-black/5 flex-col z-50", isDemo ? "top-[104px]" : "top-20")}>
      {/* Hidden file input */}
      <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImageImport} className="hidden" />

      {/* Scrollable tools section */}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center py-3 gap-1" style={{ scrollbarWidth: 'none' }}>

      {/* ── Select ── */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant={activeTool === 'select' ? "default" : "ghost"} size="icon" onClick={() => setActiveTool('select')} className={cn("w-10 h-10", activeTool === 'select' && "bg-primary text-primary-foreground")}>
            <MousePointer2 className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">Välj (V)</TooltipContent>
      </Tooltip>

      <Separator className="w-8 my-0.5" />

      {/* ── Annotation — top of list so always visible ── */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant={activeTool === 'sticky_note' ? "default" : "ghost"} size="icon" onClick={() => setActiveTool('sticky_note')} className={cn("w-10 h-10", activeTool === 'sticky_note' && "bg-amber-400 text-white hover:bg-amber-500")}>
            <StickyNote className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">Post-it lapp</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant={activeTool === 'text' ? "default" : "ghost"} size="icon" onClick={() => setActiveTool('text')} className={cn("w-10 h-10", activeTool === 'text' && "bg-primary text-primary-foreground")}>
            <Type className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">Text (T)</TooltipContent>
      </Tooltip>

      <Separator className="w-8 my-0.5" />

      {/* ── Core Architecture ── */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant={activeTool === 'room' ? "default" : "ghost"} size="icon" onClick={() => setActiveTool('room')} className={cn("w-10 h-10", activeTool === 'room' && "bg-primary text-primary-foreground")}>
            <Home className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">Rita rum</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant={activeTool === 'wall' ? "default" : "ghost"} size="icon" onClick={() => setActiveTool('wall')} className={cn("w-10 h-10", activeTool === 'wall' && "bg-primary text-primary-foreground")}>
            <Minus className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">Rita vägg (W)</TooltipContent>
      </Tooltip>

      {/* Openings popover — Door, Window, SlidingDoor, Opening, special walls */}
      <ToolCategory
        icon={DoorLineIcon}
        label="Öppningar"
        items={openingTools}
        isOpen={openCategory === 'openings'}
        onToggle={() => toggleCategory('openings')}
        activeItemId={activeTool}
      />

      {/* Contextual: create walls from selected rooms */}
      {hasSelectedRooms && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={handleCreateWallsFromRoom} className="w-10 h-10 bg-green-50 hover:bg-green-100 border border-green-300">
              <Grid3X3 className="h-5 w-5 text-green-600" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Skapa väggar ({selectedRooms.length} rum)</TooltipContent>
        </Tooltip>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant={activeTool === 'measure' ? "default" : "ghost"} size="icon" onClick={() => setActiveTool('measure')} className={cn("w-10 h-10", activeTool === 'measure' && "bg-red-500 text-white hover:bg-red-600")}>
            <Ruler className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">Mät avstånd (M)</TooltipContent>
      </Tooltip>

      <Separator className="w-8 my-0.5" />

      {/* ── Import ── */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="w-10 h-10" onClick={() => imageInputRef.current?.click()} disabled={isUploadingImage}>
            {isUploadingImage ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">Importera bild</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="w-10 h-10 text-purple-600 hover:bg-purple-50 hover:text-purple-700" onClick={() => setAiImportOpen(true)}>
            <Sparkles className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">AI-tolka ritning</TooltipContent>
      </Tooltip>

      {/* Shapes & tools popover */}
      <ToolCategory
        icon={Shapes}
        label="Former & verktyg"
        items={shapeTools}
        isOpen={openCategory === 'shapes'}
        onToggle={() => toggleCategory('shapes')}
        activeItemId={activeTool}
      />

      <Separator className="w-8 my-0.5" />

      {/* ── Library ── */}
      <Popover open={objectLibraryOpen} onOpenChange={setObjectLibraryOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button variant={isObjectActive ? "default" : "ghost"} size="icon" className={cn("w-10 h-10", isObjectActive && "bg-primary text-primary-foreground")}>
                <Plug className="h-5 w-5" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="right">{t('objectLibrary.title', 'Objektbibliotek')}</TooltipContent>
        </Tooltip>
        <PopoverContent side="right" align="start" className="w-64 h-80 p-0 ml-2">
          <ObjectLibraryPanel onSelectObject={handleSelectObject} selectedObjectId={pendingObjectId || undefined} viewMode="floorplan" />
        </PopoverContent>
      </Popover>

      <Tooltip>
        <TooltipTrigger asChild>
          <div>
            <TemplateGalleryDropdown trigger={
              <Button variant="ghost" size="icon" className="w-10 h-10">
                <Copy className="h-5 w-5" />
              </Button>
            } />
          </div>
        </TooltipTrigger>
        <TooltipContent side="right">Mall Galleri</TooltipContent>
      </Tooltip>

      {selectedShapeIds.length > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={() => setSaveTemplateOpen(true)} className="w-10 h-10 bg-blue-50 hover:bg-blue-100 border border-blue-300">
              <Bookmark className="h-5 w-5 text-blue-600" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Spara som mall ({selectedShapeIds.length})</TooltipContent>
        </Tooltip>
      )}

      <Separator className="w-8 my-0.5" />

      {/* ── Zoom ── */}
      <div className="flex flex-col items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={() => handleZoom('in')} className="w-8 h-8">
              <ZoomIn className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Zooma in</TooltipContent>
        </Tooltip>
        <span className="text-[10px] text-muted-foreground">{Math.round(viewState.zoom * 100)}%</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={() => handleZoom('out')} className="w-8 h-8">
              <ZoomOut className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Zooma ut</TooltipContent>
        </Tooltip>
      </div>

      <Separator className="w-8 my-0.5" />

      {/* ── History & delete ── */}
      <div className="flex gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={onUndo} disabled={!canUndo} className="w-8 h-8">
              <Undo className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Ångra ({modKey}+Z)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={onRedo} disabled={!canRedo} className="w-8 h-8">
              <Redo className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Gör om</TooltipContent>
        </Tooltip>
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" onClick={onDelete} className="w-10 h-10">
            <Trash2 className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">Ta bort</TooltipContent>
      </Tooltip>

      <LayerControls className="w-10 h-10" />

      </div>{/* end scrollable tools section */}

      {/* ── Pinned bottom: view & settings ── */}
      <div className="shrink-0 flex flex-col items-center gap-1 pb-3 pt-1 border-t border-border/50">

        {/* Grid toggle — dedicated, always visible */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleGrid}
              className={cn(
                "w-10 h-10 transition-colors",
                projectSettings.gridVisible
                  ? "text-blue-600 bg-blue-50 hover:bg-blue-100"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Grid3X3 className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {projectSettings.gridVisible ? 'Dölj rutnät' : 'Visa rutnät'}
          </TooltipContent>
        </Tooltip>

        <CanvasSettingsPopover />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={handleToggleStartingView} className={cn("w-10 h-10", hasStartingView && "text-primary bg-primary/10")}>
              <Frame className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {hasStartingView ? t('canvas.clearStartingView', 'Clear starting view') : t('canvas.setStartingView', 'Set starting view')}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={onSave} className="w-10 h-10">
              <Save className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Spara ({modKey}+S)</TooltipContent>
        </Tooltip>

      </div>{/* end pinned bottom */}

      {/* ── Dialogs (outside scroll, inside toolbar for co-location) ── */}
      <AIFloorPlanImport projectId={projectId} open={aiImportOpen} onOpenChange={setAiImportOpen} onImportComplete={() => setAiImportOpen(false)} />
      <TemplateGallery open={templateGalleryOpen} onOpenChange={setTemplateGalleryOpen} />
      <SaveTemplateDialog
        open={saveTemplateOpen}
        onOpenChange={setSaveTemplateOpen}
        selectedShapes={useFloorMapStore.getState().shapes.filter(s => useFloorMapStore.getState().selectedShapeIds.includes(s.id))}
        onSaveSuccess={() => toast.success('Mall sparad!')}
      />

      <Dialog open={pinterestDialogOpen} onOpenChange={setPinterestDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PinterestLogo className="h-5 w-5 text-[#E60023]" />
              Importera Pinterest Pin
            </DialogTitle>
            <DialogDescription>
              Klistra in länken till en Pinterest pin för att lägga till bilden på canvas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="pin-url">Pin URL</Label>
              <div className="relative">
                <Link className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="pin-url"
                  placeholder="pinterest.com/pin/123456789/"
                  value={pinterestUrlInput}
                  onChange={(e) => { setPinterestUrlInput(e.target.value); setPinterestUrlError(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !importingPin) handlePinterestImport(); }}
                  className="pl-9"
                  disabled={importingPin}
                />
              </div>
              {pinterestUrlError && <p className="text-sm text-red-500">{pinterestUrlError}</p>}
              <p className="text-xs text-muted-foreground">Öppna en pin på Pinterest och kopiera URL:en från webbläsaren.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPinterestDialogOpen(false)} disabled={importingPin}>Avbryt</Button>
            <Button onClick={handlePinterestImport} disabled={importingPin} className="bg-[#E60023] hover:bg-[#ad081b]">
              {importingPin ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Importerar...</> : "Importera"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isUploadingImage && (
        <div className="absolute inset-0 bg-white/80 rounded-2xl flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}
    </div>
    </>
  );
};

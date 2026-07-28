/**
 * EditorToolbar — the single v2 left rail (replaces SimpleToolbar/
 * HomeownerToolbar when the v2 editor is active).
 *
 * Industry-consensus layout (Floorplanner/RoomSketcher/Figma research):
 * max 8 slots — Välj, Vägg, Rum, Öppning (flyout: dörr/fönster/skjut/passage),
 * Objekt (library panel), Mät, Text, and an Underlag utility flyout (trace
 * image + AI import) — plus undo/redo at the bottom. Everything object- or
 * plan-specific lives in contextual UI (floating selection toolbar, top-bar
 * view settings), never in the rail.
 */

import { useRef, useState } from 'react';
import {
  Blocks,
  Circle,
  DoorOpen,
  ImagePlus,
  Minus,
  MousePointer2,
  PanelsTopLeft,
  PenLine,
  Redo2,
  Ruler,
  Shapes,
  Sparkles,
  Square,
  Type,
  Undo2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { AIFloorPlanImport } from '@/components/project/AIFloorPlanImport';
import { useFloorMapStore } from '../store';
import { Tool } from '../types';
import { ObjectLibraryPanel } from '../objectLibrary/ObjectLibraryPanel';
import { TemplatesPanelV2 } from './TemplatesPanelV2';
import { uploadPlanImage } from '../utils/uploadPlanImage';
import { undo, redo } from './core/executor';
import { useEditorUiStore } from './state/uiStore';

const OPENING_TOOLS: Array<{ tool: Tool; labelKey: string; fallback: string }> = [
  { tool: 'door_line', labelKey: 'floormap.tools.door', fallback: 'Dörr' },
  { tool: 'window_line', labelKey: 'floormap.tools.window', fallback: 'Fönster' },
  { tool: 'sliding_door_line', labelKey: 'floormap.tools.slidingDoor', fallback: 'Skjutdörr' },
  { tool: 'opening_line', labelKey: 'floormap.tools.passage', fallback: 'Passage' },
];

const SHAPE_TOOLS: Array<{ tool: Tool; icon: typeof Minus; labelKey: string; fallback: string }> = [
  { tool: 'line', icon: Minus, labelKey: 'floormap.tools.line', fallback: 'Linje' },
  { tool: 'rectangle', icon: Square, labelKey: 'floormap.tools.rectangle', fallback: 'Rektangel' },
  { tool: 'circle', icon: Circle, labelKey: 'floormap.tools.circle', fallback: 'Cirkel' },
];

const RAIL_BUTTON =
  'flex h-10 w-10 items-center justify-center rounded-lg transition-colors';

const RailButton = ({
  active,
  label,
  shortcut,
  onClick,
  children,
  testId,
}: {
  active?: boolean;
  label: string;
  shortcut?: string;
  onClick: () => void;
  children: React.ReactNode;
  testId?: string;
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <button
        data-testid={testId}
        onClick={onClick}
        className={cn(
          RAIL_BUTTON,
          active
            ? 'bg-primary text-primary-foreground'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        )}
      >
        {children}
      </button>
    </TooltipTrigger>
    <TooltipContent side="right">
      {label}
      {shortcut ? ` (${shortcut})` : ''}
    </TooltipContent>
  </Tooltip>
);

interface EditorToolbarProps {
  projectId: string;
}

export const EditorToolbar = ({ projectId }: EditorToolbarProps) => {
  const { t } = useTranslation();
  const activeTool = useFloorMapStore((s) => s.activeTool);
  const setActiveTool = useFloorMapStore((s) => s.setActiveTool);
  const pendingObjectId = useFloorMapStore((s) => s.pendingObjectId);
  const setPendingObjectId = useFloorMapStore((s) => s.setPendingObjectId);
  const canUndo = useEditorUiStore((s) => s.canUndo);
  const canRedo = useEditorUiStore((s) => s.canRedo);

  const [openingOpen, setOpeningOpen] = useState(false);
  const [shapesOpen, setShapesOpen] = useState(false);
  const [objectsOpen, setObjectsOpen] = useState(false);
  const [objectsTab, setObjectsTab] = useState<'objects' | 'templates'>('objects');
  const [underlayOpen, setUnderlayOpen] = useState(false);
  const [aiImportOpen, setAiImportOpen] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const isOpeningActive = OPENING_TOOLS.some((o) => o.tool === activeTool);
  const isShapeActive = SHAPE_TOOLS.some((s) => s.tool === activeTool);

  const handleImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const store = useFloorMapStore.getState();
    const { viewState } = store;
    const viewCenter = {
      x: (window.innerWidth / 2 - viewState.panX) / viewState.zoom,
      y: (window.innerHeight / 2 - viewState.panY) / viewState.zoom,
    };
    const shape = await uploadPlanImage(
      projectId,
      file,
      store.currentPlanId || undefined,
      viewCenter
    );
    if (shape) {
      store.addShape(shape);
      toast.success(
        t('floormap.imageAddedTrace', '"{{name}}" tillagd — markera bilden och lås den för kalkering', {
          name: file.name,
        })
      );
    }
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  return (
    <div
      className="absolute left-3 top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-1 rounded-xl border bg-white p-1.5 shadow-lg"
      data-testid="editor-v2-toolbar"
    >
      <RailButton
        active={activeTool === 'select'}
        label={t('floormap.tools.select', 'Välj')}
        shortcut="V"
        onClick={() => setActiveTool('select')}
        testId="tool-select"
      >
        <MousePointer2 className="h-5 w-5" />
      </RailButton>

      <RailButton
        active={activeTool === 'wall'}
        label={t('floormap.tools.wall', 'Vägg')}
        shortcut="W"
        onClick={() => setActiveTool('wall')}
        testId="tool-wall"
      >
        <PenLine className="h-5 w-5" />
      </RailButton>

      <RailButton
        active={activeTool === 'room'}
        label={t('floormap.tools.room', 'Rum')}
        shortcut="R"
        onClick={() => setActiveTool('room')}
        testId="tool-room"
      >
        <Square className="h-5 w-5" />
      </RailButton>

      {/* Öppning flyout — one slot, four subtypes, last used becomes the face */}
      <Popover open={openingOpen} onOpenChange={setOpeningOpen}>
        <PopoverTrigger asChild>
          <button
            data-testid="tool-opening"
            className={cn(
              RAIL_BUTTON,
              isOpeningActive
                ? 'bg-primary text-primary-foreground'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            )}
            title={`${t('floormap.tools.opening', 'Öppning')} (D)`}
          >
            <DoorOpen className="h-5 w-5" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="right" align="start" className="w-40 p-1 ml-2">
          {OPENING_TOOLS.map((o) => (
            <button
              key={o.tool}
              className={cn(
                'flex w-full items-center rounded-md px-2 py-1.5 text-sm transition-colors',
                activeTool === o.tool ? 'bg-primary/10 text-primary' : 'hover:bg-gray-100'
              )}
              onClick={() => {
                setActiveTool(o.tool);
                setOpeningOpen(false);
              }}
            >
              {t(o.labelKey, o.fallback)}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      {/* Objekt library panel */}
      <Popover open={objectsOpen} onOpenChange={setObjectsOpen}>
        <PopoverTrigger asChild>
          <button
            data-testid="tool-objects"
            className={cn(
              RAIL_BUTTON,
              activeTool === 'object'
                ? 'bg-primary text-primary-foreground'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            )}
            title={`${t('floormap.tools.objects', 'Objekt')} (O)`}
          >
            <Blocks className="h-5 w-5" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="right" align="start" className="ml-2 flex h-96 w-72 flex-col p-0">
          {/* Objekt | Mallar tab strip (P2: templates surfaced in v2) */}
          <div className="flex shrink-0 border-b text-xs">
            {(
              [
                ['objects', t('floormap.tools.objects', 'Objekt')],
                ['templates', t('templates.tabLabel', 'Mallar')],
              ] as const
            ).map(([tab, label]) => (
              <button
                key={tab}
                data-testid={`objects-tab-${tab}`}
                className={cn(
                  'flex-1 border-b-2 px-2 py-1.5 font-medium transition-colors',
                  objectsTab === tab
                    ? 'border-primary text-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                )}
                onClick={() => setObjectsTab(tab)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            {objectsTab === 'objects' ? (
              <ObjectLibraryPanel
                onSelectObject={(def) => {
                  setPendingObjectId(def.id);
                  setObjectsOpen(false);
                }}
                selectedObjectId={pendingObjectId || undefined}
                viewMode="floorplan"
              />
            ) : (
              <TemplatesPanelV2 onPlaced={() => setObjectsOpen(false)} />
            )}
          </div>
        </PopoverContent>
      </Popover>

      <RailButton
        active={activeTool === 'measure'}
        label={t('floormap.tools.measure', 'Mät')}
        shortcut="M"
        onClick={() => setActiveTool('measure')}
        testId="tool-measure"
      >
        <Ruler className="h-5 w-5" />
      </RailButton>

      <RailButton
        active={activeTool === 'text'}
        label={t('floormap.tools.text', 'Text')}
        shortcut="T"
        onClick={() => setActiveTool('text')}
        testId="tool-text"
      >
        <Type className="h-5 w-5" />
      </RailButton>

      {/* Former flyout — DIY sketch primitives: line / rectangle / circle */}
      <Popover open={shapesOpen} onOpenChange={setShapesOpen}>
        <PopoverTrigger asChild>
          <button
            data-testid="tool-shapes"
            className={cn(
              RAIL_BUTTON,
              isShapeActive
                ? 'bg-primary text-primary-foreground'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            )}
            title={t('floormap.tools.shapes', 'Former (linje, rektangel, cirkel)')}
          >
            <Shapes className="h-5 w-5" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="right" align="start" className="w-40 p-1 ml-2">
          {SHAPE_TOOLS.map((s) => (
            <button
              key={s.tool}
              data-testid={`tool-shape-${s.tool}`}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                activeTool === s.tool ? 'bg-primary/10 text-primary' : 'hover:bg-gray-100'
              )}
              onClick={() => {
                setActiveTool(s.tool);
                setShapesOpen(false);
              }}
            >
              <s.icon className="h-4 w-4 text-gray-500" />
              {t(s.labelKey, s.fallback)}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      <div className="my-0.5 h-px w-8 bg-gray-200" />

      {/* Underlag utility flyout: trace image + AI import */}
      <Popover open={underlayOpen} onOpenChange={setUnderlayOpen}>
        <PopoverTrigger asChild>
          <button
            data-testid="tool-underlay"
            className={cn(RAIL_BUTTON, 'text-gray-600 hover:bg-gray-100 hover:text-gray-900')}
            title={t('floormap.tools.underlay', 'Underlag & import')}
          >
            <ImagePlus className="h-5 w-5" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="right" align="start" className="ml-2 w-56 p-1">
          <button
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-gray-100"
            onClick={() => {
              imageInputRef.current?.click();
              setUnderlayOpen(false);
            }}
          >
            <PanelsTopLeft className="h-4 w-4 text-gray-500" />
            {t('floormap.uploadTraceImage', 'Ladda upp ritning (kalkera)')}
          </button>
          <button
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-gray-100"
            onClick={() => {
              setAiImportOpen(true);
              setUnderlayOpen(false);
            }}
          >
            <Sparkles className="h-4 w-4 text-gray-500" />
            {t('floormap.aiImport', 'AI-tolka planritning')}
          </button>
        </PopoverContent>
      </Popover>

      <div className="my-0.5 h-px w-8 bg-gray-200" />

      <RailButton
        label={t('floormap.undo', 'Ångra')}
        shortcut="Cmd+Z"
        onClick={() => undo()}
      >
        <Undo2 className={cn('h-5 w-5', !canUndo && 'opacity-30')} />
      </RailButton>
      <RailButton
        label={t('floormap.redo', 'Gör om')}
        shortcut="Cmd+Shift+Z"
        onClick={() => redo()}
      >
        <Redo2 className={cn('h-5 w-5', !canRedo && 'opacity-30')} />
      </RailButton>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageFile}
        className="hidden"
      />
      <AIFloorPlanImport
        projectId={projectId}
        open={aiImportOpen}
        onOpenChange={setAiImportOpen}
        onImportComplete={() => setAiImportOpen(false)}
      />
    </div>
  );
};

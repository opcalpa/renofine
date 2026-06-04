import { memo, useState, useEffect, useRef, useCallback } from "react";
import { Tool } from "./types";
import {
  MousePointer2,
  Minus,
  Home,
  Square,
  Circle,
  Type,
  Pencil,
  Eraser,
  Scissors,
  Link,
  Spline,
  ImagePlus,
  Sparkles,
  Copy,
  Info,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowUpToLine,
  ArrowDownToLine,
  Layers,
  Grid3X3,
  PanelLeft,
  MessageCircle,
  Lock,
  Unlock,
  ChevronRight,
  StickyNote,
  Clock,
  PenTool,
  Plus,
} from "lucide-react";

// Custom icons
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
  </svg>
);

const OpeningLineIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="6" y1="8" x2="6" y2="16" strokeWidth="2" />
    <line x1="18" y1="8" x2="18" y2="16" strokeWidth="2" />
    <line x1="6" y1="12" x2="18" y2="12" strokeWidth="1" strokeDasharray="2,2" />
  </svg>
);

// Pinterest Logo SVG
const PinterestLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738.098.119.112.224.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z" />
  </svg>
);

interface ToolContextMenuProps {
  x: number;
  y: number;
  recentTools: Tool[];
  onSelectTool: (tool: Tool) => void;
  onClose: () => void;
  onOpenAIImport?: () => void;
  onOpenImageImport?: () => void;
  onOpenPinterestImport?: () => void;
  onOpenTemplates?: () => void;
  // Selection-related actions
  hasSelection?: boolean;
  selectionCount?: number;
  selectionType?: string;
  hasRoomInSelection?: boolean;
  onShowProperties?: () => void;
  onDeleteSelection?: () => void;
  // Layer ordering actions
  onBringForward?: () => void;
  onSendBackward?: () => void;
  onBringToFront?: () => void;
  onSendToBack?: () => void;
  // Room-specific actions
  onCreateWallsFromRoom?: () => void;
  // Elevation view
  onViewElevation?: () => void;
  hasWallInSelection?: boolean;
  // Comments
  onAddComment?: () => void;
  commentCount?: number;
  isCommentResolved?: boolean;
  // Lock/unlock
  onToggleLock?: () => void;
  isSelectionLocked?: boolean;
}

type IconComponent = React.FC<{ className?: string }>;

const getToolIcon = (tool: Tool): IconComponent => {
  switch (tool) {
    case 'select': return MousePointer2;
    case 'wall': return Minus;
    case 'room': return Home;
    case 'rectangle': return Square;
    case 'circle': return Circle;
    case 'text': return Type;
    case 'freehand': return Pencil;
    case 'eraser': return Eraser;
    case 'scissors': return Scissors;
    case 'glue': return Link;
    case 'bezier': return Spline;
    case 'window_line': return WindowLineIcon;
    case 'door_line': return DoorLineIcon;
    case 'sliding_door_line': return DoorLineIcon;
    case 'opening_line': return OpeningLineIcon;
    default: return MousePointer2;
  }
};

const getToolName = (tool: Tool): string => {
  switch (tool) {
    case 'select': return 'Välj';
    case 'wall': return 'Vägg';
    case 'room': return 'Rum';
    case 'rectangle': return 'Rektangel';
    case 'circle': return 'Cirkel';
    case 'text': return 'Text';
    case 'freehand': return 'Frihand';
    case 'eraser': return 'Sudd';
    case 'scissors': return 'Sax';
    case 'glue': return 'Klistra';
    case 'bezier': return 'Kurva';
    case 'window_line': return 'Fönster';
    case 'door_line': return 'Dörr';
    case 'sliding_door_line': return 'Skjutdörr';
    case 'opening_line': return 'Väggöppning';
    default: return tool;
  }
};

// Submenu flyout item
const SubMenuItem = ({ icon: Icon, label, onClick, iconClass = "text-gray-600", shortcut }: {
  icon: IconComponent;
  label: string;
  onClick: () => void;
  iconClass?: string;
  shortcut?: string;
}) => (
  <button
    className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-blue-50 transition-colors text-left"
    onClick={onClick}
  >
    <Icon className={`w-3.5 h-3.5 ${iconClass}`} />
    <span className="text-sm text-gray-700">{label}</span>
    {shortcut && <span className="ml-auto text-[10px] text-gray-400">{shortcut}</span>}
  </button>
);

// Menu item with chevron for submenus
const SubMenuTrigger = ({ icon: Icon, label, isOpen, iconClass = "text-gray-600", onMouseEnter, onMouseLeave, onClick }: {
  icon: IconComponent;
  label: string;
  isOpen: boolean;
  iconClass?: string;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick: () => void;
}) => (
  <button
    className={`w-full px-3 py-1.5 flex items-center gap-2.5 transition-colors text-left ${isOpen ? 'bg-blue-50' : 'hover:bg-blue-50'}`}
    onMouseEnter={onMouseEnter}
    onMouseLeave={onMouseLeave}
    onClick={onClick}
  >
    <Icon className={`w-3.5 h-3.5 ${iconClass}`} />
    <span className="text-sm text-gray-700">{label}</span>
    <ChevronRight className="w-3 h-3 text-gray-400 ml-auto" />
  </button>
);

// Flyout submenu container — opens left if near right edge
const FlyoutSubmenu = ({ isOpen, parentRef, onMouseEnter, onMouseLeave, children }: {
  isOpen: boolean;
  parentRef: React.RefObject<HTMLDivElement | null>;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  children: React.ReactNode;
}) => {
  const [openLeft, setOpenLeft] = useState(false);

  useEffect(() => {
    if (isOpen && parentRef.current) {
      const rect = parentRef.current.getBoundingClientRect();
      setOpenLeft(rect.right + 200 > window.innerWidth);
    }
  }, [isOpen, parentRef]);

  if (!isOpen) return null;

  return (
    <div
      className={`absolute top-0 ${openLeft ? 'right-full mr-1' : 'left-full ml-1'} bg-white/95 backdrop-blur-xl rounded-lg shadow-2xl border border-gray-200/50 py-1 min-w-[170px] z-10`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </div>
  );
};

// Drawing tools available in submenu
const DRAW_TOOLS: { tool: Tool; icon: IconComponent; label: string; iconClass: string }[] = [
  { tool: 'wall', icon: Minus, label: 'Vägg', iconClass: 'text-gray-600' },
  { tool: 'room', icon: Home, label: 'Rum', iconClass: 'text-green-600' },
  { tool: 'rectangle', icon: Square, label: 'Rektangel', iconClass: 'text-blue-500' },
  { tool: 'circle', icon: Circle, label: 'Cirkel', iconClass: 'text-blue-500' },
  { tool: 'freehand', icon: Pencil, label: 'Frihand', iconClass: 'text-orange-500' },
  { tool: 'bezier', icon: Spline, label: 'Kurva', iconClass: 'text-purple-500' },
  { tool: 'window_line', icon: WindowLineIcon, label: 'Fönster', iconClass: 'text-cyan-600' },
  { tool: 'door_line', icon: DoorLineIcon, label: 'Dörr', iconClass: 'text-cyan-600' },
  { tool: 'opening_line', icon: OpeningLineIcon, label: 'Väggöppning', iconClass: 'text-cyan-600' },
];

export const ToolContextMenu = memo(({
  x,
  y,
  recentTools,
  onSelectTool,
  onClose,
  onOpenAIImport,
  onOpenImageImport,
  onOpenPinterestImport,
  onOpenTemplates,
  hasSelection,
  selectionCount,
  selectionType,
  hasRoomInSelection,
  onShowProperties,
  onDeleteSelection,
  onBringForward,
  onSendBackward,
  onBringToFront,
  onSendToBack,
  onCreateWallsFromRoom,
  onViewElevation,
  hasWallInSelection,
  onAddComment,
  commentCount,
  isCommentResolved,
  onToggleLock,
  isSelectionLocked,
}: ToolContextMenuProps) => {
  const [openSub, setOpenSub] = useState<string | null>(null);

  // Refs for flyout positioning
  const layerRef = useRef<HTMLDivElement>(null);
  const drawRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLDivElement>(null);
  const recentRef = useRef<HTMLDivElement>(null);

  const topTools = recentTools.slice(0, 3);
  const hasImportActions = onOpenAIImport || onOpenImageImport || onOpenPinterestImport;
  const hasLayerActions = onBringForward || onSendBackward || onBringToFront || onSendToBack;

  // Adjust position to keep menu on screen
  const menuWidth = 210;
  const menuHeight = hasSelection ? 320 : 200;
  const adjustedX = Math.min(x, window.innerWidth - menuWidth - 20);
  const adjustedY = Math.min(y, window.innerHeight - menuHeight - 20);

  const openSubmenu = useCallback((name: string) => setOpenSub(name), []);
  const closeSubmenu = useCallback(() => setOpenSub(null), []);

  const getSelectionLabel = () => {
    if (!hasSelection || !selectionCount) return '';
    if (selectionCount === 1) {
      switch (selectionType) {
        case 'wall':
        case 'line': return '1 vägg markerad';
        case 'room': return '1 rum markerat';
        default: return '1 objekt markerat';
      }
    }
    return `${selectionCount} objekt markerade`;
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100]"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />

      {/* Context Menu */}
      <div
        className="fixed z-[101] bg-white/95 backdrop-blur-xl rounded-xl shadow-2xl border border-gray-200/50 py-1 min-w-[210px] animate-in fade-in zoom-in-95 duration-100"
        style={{
          left: `${adjustedX}px`,
          top: `${adjustedY}px`,
        }}
      >
        {/* === SELECTION SECTION === */}
        {hasSelection && (
          <>
            <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              {getSelectionLabel()}
            </div>

            {onShowProperties && (
              <button
                className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-blue-50 transition-colors text-left"
                onClick={() => { onShowProperties(); onClose(); }}
              >
                <Info className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-sm text-gray-700">Visa egenskaper</span>
                <span className="ml-auto text-[10px] text-gray-400">⌘I</span>
              </button>
            )}

            {onAddComment && (
              <button
                className={`w-full px-3 py-1.5 flex items-center gap-2.5 transition-colors text-left ${
                  isCommentResolved ? 'hover:bg-green-50' : 'hover:bg-blue-50'
                }`}
                onClick={() => { onAddComment(); onClose(); }}
              >
                <MessageCircle className={`w-3.5 h-3.5 ${isCommentResolved ? 'text-green-500' : 'text-blue-500'}`} />
                <span className="text-sm text-gray-700">
                  {isCommentResolved
                    ? 'Kommentarer \u2713'
                    : commentCount && commentCount > 0
                      ? `Kommentarer (${commentCount})`
                      : 'Lägg till kommentar'
                  }
                </span>
              </button>
            )}

            {onToggleLock && (
              <button
                className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-amber-50 transition-colors text-left"
                onClick={() => { onToggleLock(); onClose(); }}
              >
                {isSelectionLocked
                  ? <Unlock className="w-3.5 h-3.5 text-amber-500" />
                  : <Lock className="w-3.5 h-3.5 text-amber-500" />
                }
                <span className="text-sm text-gray-700">
                  {isSelectionLocked ? 'Lås upp' : 'Lås'}
                </span>
                <span className="ml-auto text-[10px] text-gray-400">⌘L</span>
              </button>
            )}

            {onDeleteSelection && (
              <button
                className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-red-50 transition-colors text-left"
                onClick={() => { onDeleteSelection(); onClose(); }}
              >
                <Trash2 className="w-3.5 h-3.5 text-red-500" />
                <span className="text-sm text-gray-700">Ta bort</span>
                <span className="ml-auto text-[10px] text-gray-400">⌫</span>
              </button>
            )}

            {/* Room-specific actions */}
            {(selectionType === 'room' || hasRoomInSelection) && onCreateWallsFromRoom && (
              <button
                className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-green-50 transition-colors text-left"
                onClick={() => { onCreateWallsFromRoom(); onClose(); }}
              >
                <Grid3X3 className="w-3.5 h-3.5 text-green-600" />
                <span className="text-sm text-gray-700">Skapa väggar</span>
              </button>
            )}

            {/* Elevation view */}
            {onViewElevation && (selectionType === 'room' || hasRoomInSelection) && (
              <button
                className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-purple-50 transition-colors text-left"
                onClick={() => { onViewElevation(); onClose(); }}
              >
                <PanelLeft className="w-3.5 h-3.5 text-purple-600" />
                <span className="text-sm text-gray-700">Väggvy</span>
              </button>
            )}

            {/* Lagerordning submenu */}
            {hasLayerActions && (
              <div ref={layerRef} className="relative">
                <SubMenuTrigger
                  icon={Layers}
                  label="Lagerordning"
                  isOpen={openSub === 'layer'}
                  iconClass="text-gray-500"
                  onMouseEnter={() => openSubmenu('layer')}
                  onMouseLeave={closeSubmenu}
                  onClick={() => setOpenSub(s => s === 'layer' ? null : 'layer')}
                />
                <FlyoutSubmenu
                  isOpen={openSub === 'layer'}
                  parentRef={layerRef}
                  onMouseEnter={() => openSubmenu('layer')}
                  onMouseLeave={closeSubmenu}
                >
                  {onBringToFront && (
                    <SubMenuItem icon={ArrowUpToLine} label="Överst" iconClass="text-gray-500" onClick={() => { onBringToFront(); onClose(); }} />
                  )}
                  {onSendToBack && (
                    <SubMenuItem icon={ArrowDownToLine} label="Underst" iconClass="text-gray-500" onClick={() => { onSendToBack(); onClose(); }} />
                  )}
                  {onBringForward && (
                    <SubMenuItem icon={ArrowUp} label="Framåt" iconClass="text-gray-500" onClick={() => { onBringForward(); onClose(); }} />
                  )}
                  {onSendBackward && (
                    <SubMenuItem icon={ArrowDown} label="Bakåt" iconClass="text-gray-500" onClick={() => { onSendBackward(); onClose(); }} />
                  )}
                </FlyoutSubmenu>
              </div>
            )}

            <div className="my-1 border-t border-gray-100" />
          </>
        )}

        {/* === SNABBÅTGÄRDER === */}
        <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
          Snabbåtgärder
        </div>

        {/* Senaste verktyg submenu */}
        {topTools.length > 0 && (
          <div ref={recentRef} className="relative">
            <SubMenuTrigger
              icon={Clock}
              label="Senaste verktyg"
              isOpen={openSub === 'recent'}
              iconClass="text-gray-500"
              onMouseEnter={() => openSubmenu('recent')}
              onMouseLeave={closeSubmenu}
              onClick={() => setOpenSub(s => s === 'recent' ? null : 'recent')}
            />
            <FlyoutSubmenu
              isOpen={openSub === 'recent'}
              parentRef={recentRef}
              onMouseEnter={() => openSubmenu('recent')}
              onMouseLeave={closeSubmenu}
            >
              {topTools.map((tool, i) => {
                const Icon = getToolIcon(tool);
                return (
                  <SubMenuItem
                    key={`${tool}-${i}`}
                    icon={Icon}
                    label={getToolName(tool)}
                    iconClass="text-gray-600"
                    onClick={() => { onSelectTool(tool); onClose(); }}
                    shortcut={i === 0 ? 'Senast' : undefined}
                  />
                );
              })}
            </FlyoutSubmenu>
          </div>
        )}

        {/* Rita verktyg submenu */}
        <div ref={drawRef} className="relative">
          <SubMenuTrigger
            icon={PenTool}
            label="Rita verktyg"
            isOpen={openSub === 'draw'}
            iconClass="text-indigo-500"
            onMouseEnter={() => openSubmenu('draw')}
            onMouseLeave={closeSubmenu}
            onClick={() => setOpenSub(s => s === 'draw' ? null : 'draw')}
          />
          <FlyoutSubmenu
            isOpen={openSub === 'draw'}
            parentRef={drawRef}
            onMouseEnter={() => openSubmenu('draw')}
            onMouseLeave={closeSubmenu}
          >
            {DRAW_TOOLS.map(({ tool, icon, label, iconClass }) => (
              <SubMenuItem
                key={tool}
                icon={icon}
                label={label}
                iconClass={iconClass}
                onClick={() => { onSelectTool(tool); onClose(); }}
              />
            ))}
          </FlyoutSubmenu>
        </div>

        {/* Lägg till submenu (text, sticky, comment) */}
        <div ref={addRef} className="relative">
          <SubMenuTrigger
            icon={Plus}
            label="Lägg till"
            isOpen={openSub === 'add'}
            iconClass="text-amber-600"
            onMouseEnter={() => openSubmenu('add')}
            onMouseLeave={closeSubmenu}
            onClick={() => setOpenSub(s => s === 'add' ? null : 'add')}
          />
          <FlyoutSubmenu
            isOpen={openSub === 'add'}
            parentRef={addRef}
            onMouseEnter={() => openSubmenu('add')}
            onMouseLeave={closeSubmenu}
          >
            <SubMenuItem
              icon={Type}
              label="Fri text"
              iconClass="text-amber-600"
              onClick={() => { onSelectTool('text'); onClose(); }}
            />
            <SubMenuItem
              icon={StickyNote}
              label="Post-it lapp"
              iconClass="text-amber-400"
              onClick={() => { onSelectTool('sticky_note'); onClose(); }}
            />
            {onAddComment ? (
              <SubMenuItem
                icon={MessageCircle}
                label={
                  isCommentResolved
                    ? 'Kommentar \u2713'
                    : commentCount && commentCount > 0
                      ? `Kommentar (${commentCount})`
                      : 'Kommentar'
                }
                iconClass="text-blue-500"
                onClick={() => { onAddComment(); onClose(); }}
              />
            ) : (
              <div className="w-full px-3 py-1.5 flex items-center gap-2.5 opacity-40 cursor-default">
                <MessageCircle className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-sm text-gray-700">Kommentar</span>
              </div>
            )}
          </FlyoutSubmenu>
        </div>

        {/* Importera bild submenu */}
        {hasImportActions && (
          <div ref={importRef} className="relative">
            <SubMenuTrigger
              icon={ImagePlus}
              label="Importera bild"
              isOpen={openSub === 'import'}
              iconClass="text-blue-500"
              onMouseEnter={() => openSubmenu('import')}
              onMouseLeave={closeSubmenu}
              onClick={() => setOpenSub(s => s === 'import' ? null : 'import')}
            />
            <FlyoutSubmenu
              isOpen={openSub === 'import'}
              parentRef={importRef}
              onMouseEnter={() => openSubmenu('import')}
              onMouseLeave={closeSubmenu}
            >
              {onOpenImageImport && (
                <SubMenuItem icon={ImagePlus} label="Från dator" iconClass="text-blue-500" onClick={() => { onOpenImageImport(); onClose(); }} />
              )}
              {onOpenAIImport && (
                <SubMenuItem icon={Sparkles} label="AI-tolka ritning" iconClass="text-purple-500" onClick={() => { onOpenAIImport(); onClose(); }} />
              )}
              {onOpenPinterestImport && (
                <SubMenuItem icon={PinterestLogo} label="Pinterest pin" iconClass="text-[#E60023]" onClick={() => { onOpenPinterestImport(); onClose(); }} />
              )}
            </FlyoutSubmenu>
          </div>
        )}

        {onOpenTemplates && (
          <button
            className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-blue-50 transition-colors text-left"
            onClick={() => { onOpenTemplates(); onClose(); }}
          >
            <Copy className="w-3.5 h-3.5 text-gray-600" />
            <span className="text-sm text-gray-700">Mallar</span>
          </button>
        )}
      </div>
    </>
  );
});

ToolContextMenu.displayName = "ToolContextMenu";

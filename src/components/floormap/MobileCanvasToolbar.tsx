/**
 * MobileCanvasToolbar — compact floating bottom toolbar for mobile canvas
 *
 * Optimised for touch: large tap targets, essential tools only.
 * Shown only on viewports < 768px (md breakpoint).
 *
 * Primary actions: Select, Objects, Post-it, Photo (import), More
 * Objects opens a bottom sheet with the object library (electrical, furniture…);
 * picking one arms placement so the next tap on the canvas drops it.
 * Secondary (sheet): Text, Connector, Comment, Undo, Redo, Delete, Save
 */

import React, { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { v4 as uuidv4 } from 'uuid';
import {
  MousePointer2,
  StickyNote,
  Camera,
  MessageCircle,
  MoreHorizontal,
  Armchair,
  Type,
  ArrowRight,
  Undo2,
  Redo2,
  Trash2,
  Save,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useFloorMapStore } from './store';
import { ObjectLibraryPanel } from './objectLibrary/ObjectLibraryPanel';
import type { UnifiedObjectDefinition } from './objectLibrary/types';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { Tool, FloorMapShape } from './types';

interface MobileCanvasToolbarProps {
  projectId: string;
  onSave: () => void;
  onDelete: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

interface ToolBtnProps {
  icon: React.ElementType;
  label: string;
  isActive?: boolean;
  onClick: () => void;
  disabled?: boolean;
}

const ToolBtn: React.FC<ToolBtnProps> = ({
  icon: Icon,
  label,
  isActive,
  onClick,
  disabled,
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={cn(
      'flex flex-col items-center justify-center gap-0.5 min-w-[52px] py-2 rounded-lg transition-colors',
      disabled && 'opacity-30',
      isActive
        ? 'bg-primary text-primary-foreground'
        : 'text-muted-foreground active:bg-accent',
    )}
  >
    <Icon className="h-5 w-5" />
    <span className="text-[10px] leading-tight">{label}</span>
  </button>
);

export const MobileCanvasToolbar: React.FC<MobileCanvasToolbarProps> = ({
  projectId,
  onSave,
  onDelete,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}) => {
  const { t } = useTranslation();
  const { activeTool, setActiveTool, setPendingObjectId, addShape, currentPlanId, viewState } =
    useFloorMapStore();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [objectsOpen, setObjectsOpen] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const selectTool = useCallback(
    (tool: Tool) => {
      setActiveTool(tool);
      setSheetOpen(false);
    },
    [setActiveTool],
  );

  // Arm an object for placement; the next canvas tap drops it (touch fires the
  // same placement path as a mouse click via compatibility events).
  const handleSelectObject = useCallback(
    (definition: UnifiedObjectDefinition) => {
      setPendingObjectId(definition.id);
      setObjectsOpen(false);
      toast.success(
        t('objectLibrary.objectSelected', `${definition.name} vald — tryck på ritningen för att placera`),
      );
    },
    [setPendingObjectId, t],
  );

  // Import a photo (camera or library) and drop it on the canvas as a
  // half-opacity background to trace or annotate on.
  const handleImageImport = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        toast.error(t('floormap.image.notAnImage', 'Vänligen välj en bildfil'));
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error(t('floormap.image.tooLarge', 'Max 10MB'));
        return;
      }
      setIsUploadingImage(true);
      try {
        const filePath = `projects/${projectId}/Uppladdade filer/${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from('project-files')
          .upload(filePath, file);
        if (uploadError) throw uploadError;
        const {
          data: { publicUrl },
        } = supabase.storage.from('project-files').getPublicUrl(filePath);
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
        toast.success(t('floormap.image.added', `"${file.name}" tillagd`, { name: file.name }));
      } catch (error) {
        console.error('Error uploading image:', error);
        toast.error(t('floormap.image.uploadFailed', 'Kunde inte ladda upp'));
      } finally {
        setIsUploadingImage(false);
        if (imageInputRef.current) imageInputRef.current.value = '';
      }
    },
    [projectId, addShape, currentPlanId, viewState, t],
  );

  return (
    <div className="md:hidden fixed bottom-0 inset-x-0 z-40 pb-[env(safe-area-inset-bottom)]">
      {/* Hidden image input (camera or library on mobile) */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageImport}
        className="hidden"
      />
      <div className="flex items-center justify-around bg-background/95 backdrop-blur-sm border-t shadow-lg px-2 py-1">
        {/* Select */}
        <ToolBtn
          icon={MousePointer2}
          label={t('floormap.tools.select', 'Välj')}
          isActive={activeTool === 'select'}
          onClick={() => selectTool('select')}
        />

        {/* Objects — opens the object library sheet (electrical, furniture…) */}
        <Sheet open={objectsOpen} onOpenChange={setObjectsOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="flex flex-col items-center justify-center gap-0.5 min-w-[52px] py-2 rounded-lg text-muted-foreground active:bg-accent"
            >
              <Armchair className="h-5 w-5" />
              <span className="text-[10px] leading-tight">
                {t('objectLibrary.title', 'Objekt')}
              </span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="pb-[env(safe-area-inset-bottom)] max-h-[70vh] p-0">
            <SheetHeader className="px-4 pt-4 pb-2">
              <SheetTitle>{t('objectLibrary.title', 'Objekt')}</SheetTitle>
            </SheetHeader>
            <div className="max-h-[55vh] overflow-y-auto">
              <ObjectLibraryPanel onSelectObject={handleSelectObject} viewMode="floorplan" />
            </div>
          </SheetContent>
        </Sheet>

        {/* Post-it */}
        <ToolBtn
          icon={StickyNote}
          label="Post-it"
          isActive={activeTool === 'sticky_note'}
          onClick={() => selectTool('sticky_note')}
        />

        {/* Photo — import an image to trace/annotate on (camera or library) */}
        <ToolBtn
          icon={Camera}
          label={t('common.photo', 'Foto')}
          disabled={isUploadingImage}
          onClick={() => imageInputRef.current?.click()}
        />

        {/* More — opens sheet */}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="flex flex-col items-center justify-center gap-0.5 min-w-[52px] py-2 rounded-lg text-muted-foreground active:bg-accent"
            >
              <MoreHorizontal className="h-5 w-5" />
              <span className="text-[10px] leading-tight">
                {t('common.more', 'Mer')}
              </span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="pb-[env(safe-area-inset-bottom)]">
            <SheetHeader>
              <SheetTitle>{t('floormap.tools.moreTools', 'Fler verktyg')}</SheetTitle>
            </SheetHeader>
            <div className="grid grid-cols-4 gap-3 py-4">
              <ToolBtn
                icon={Type}
                label={t('floormap.tools.text', 'Text')}
                isActive={activeTool === 'text'}
                onClick={() => selectTool('text')}
              />
              <ToolBtn
                icon={ArrowRight}
                label={t('floormap.tools.connector', 'Koppling')}
                isActive={activeTool === 'connector'}
                onClick={() => selectTool('connector')}
              />
              <ToolBtn
                icon={MessageCircle}
                label={t('comments.thread', 'Kommentar')}
                onClick={() => selectTool('select')}
              />
              <ToolBtn
                icon={Undo2}
                label={t('common.undo', 'Ångra')}
                onClick={onUndo}
                disabled={!canUndo}
              />
              <ToolBtn
                icon={Redo2}
                label={t('common.redo', 'Gör om')}
                onClick={onRedo}
                disabled={!canRedo}
              />
              <ToolBtn
                icon={Trash2}
                label={t('common.delete', 'Radera')}
                onClick={() => { onDelete(); setSheetOpen(false); }}
              />
              <ToolBtn
                icon={Save}
                label={t('common.save', 'Spara')}
                onClick={() => { onSave(); setSheetOpen(false); }}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
};

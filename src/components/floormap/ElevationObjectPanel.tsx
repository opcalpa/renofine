/**
 * ElevationObjectPanel - Right-side panel for editing object properties in elevation view
 *
 * Shows when an object is selected in the elevation view.
 * Allows editing dimensions, viewing/adding comments, and deleting objects.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, MessageCircle, Trash2, Move, Ruler, ChevronRight, Save, CheckCircle2, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { FloorMapShape, WallObjectCategory } from './types';
import { useFloorMapStore } from './store';
import { isElectricalShape } from './objectLibrary';
import { cn } from '@/lib/utils';

interface ElevationObjectPanelProps {
  object: FloorMapShape;
  onClose: () => void;
  onOpenComments: () => void;
  commentCount?: number;
  isCommentResolved?: boolean;
}

// Category display names
const categoryNames: Record<WallObjectCategory, { sv: string; en: string }> = {
  floor_cabinet: { sv: 'Golvskåp', en: 'Floor Cabinet' },
  wall_cabinet: { sv: 'Väggskåp', en: 'Wall Cabinet' },
  countertop: { sv: 'Bänkskiva', en: 'Countertop' },
  appliance_floor: { sv: 'Golvapparat', en: 'Floor Appliance' },
  appliance_wall: { sv: 'Väggapparat', en: 'Wall Appliance' },
  window: { sv: 'Fönster', en: 'Window' },
  door: { sv: 'Dörr', en: 'Door' },
  decoration: { sv: 'Dekoration', en: 'Decoration' },
  electrical_outlet: { sv: 'Eluttag', en: 'Electrical Outlet' },
  electrical_switch: { sv: 'Strömbrytare', en: 'Light Switch' },
  custom: { sv: 'Anpassad', en: 'Custom' },
};

// Category icons/colors
const categoryColors: Record<string, string> = {
  electrical_outlet: 'bg-amber-100 text-amber-700 border-amber-300',
  electrical_switch: 'bg-amber-100 text-amber-700 border-amber-300',
  door: 'bg-purple-100 text-purple-700 border-purple-300',
  window: 'bg-sky-100 text-sky-700 border-sky-300',
  floor_cabinet: 'bg-orange-100 text-orange-700 border-orange-300',
  wall_cabinet: 'bg-orange-100 text-orange-700 border-orange-300',
  default: 'bg-gray-100 text-gray-700 border-gray-300',
};

export const ElevationObjectPanel: React.FC<ElevationObjectPanelProps> = ({
  object,
  onClose,
  onOpenComments,
  commentCount = 0,
  isCommentResolved = false,
}) => {
  const { t, i18n } = useTranslation();
  const { updateShapeWallRelative, deleteShape, updateShape } = useFloorMapStore();
  const lang = i18n.language.startsWith('sv') ? 'sv' : 'en';

  // Install status (control checklist) — only meaningful for electrical fixtures.
  const isElectrical = isElectricalShape(object);
  const isInstalled = object.metadata?.installStatus === 'installed';
  const toggleInstalled = useCallback(() => {
    updateShape(object.id, {
      metadata: {
        ...object.metadata,
        installStatus: isInstalled ? 'planned' : 'installed',
      },
    });
  }, [object.id, object.metadata, isInstalled, updateShape]);

  // Local state for form fields
  const [width, setWidth] = useState<number>(object.wallRelative?.width || 0);
  const [height, setHeight] = useState<number>(object.wallRelative?.height || 0);
  const [elevationBottom, setElevationBottom] = useState<number>(object.wallRelative?.elevationBottom || 0);
  const [distanceFromStart, setDistanceFromStart] = useState<number>(object.wallRelative?.distanceFromWallStart || 0);
  const [hasChanges, setHasChanges] = useState(false);

  // Reset form when object changes
  useEffect(() => {
    setWidth(object.wallRelative?.width || 0);
    setHeight(object.wallRelative?.height || 0);
    setElevationBottom(object.wallRelative?.elevationBottom || 0);
    setDistanceFromStart(object.wallRelative?.distanceFromWallStart || 0);
    setHasChanges(false);
  }, [object.id, object.wallRelative]);

  // Track changes
  const handleFieldChange = useCallback((
    setter: React.Dispatch<React.SetStateAction<number>>,
    value: string
  ) => {
    const numValue = parseFloat(value) || 0;
    setter(numValue);
    setHasChanges(true);
  }, []);

  // Save changes
  const handleSave = useCallback(() => {
    if (!object.wallRelative) return;

    updateShapeWallRelative(object.id, {
      width,
      height,
      elevationBottom: Math.max(0, elevationBottom),
      distanceFromWallStart: Math.max(0, distanceFromStart),
    });
    setHasChanges(false);
  }, [object.id, object.wallRelative, width, height, elevationBottom, distanceFromStart, updateShapeWallRelative]);

  // Delete object
  const handleDelete = useCallback(() => {
    if (window.confirm(t('elevation.confirmDelete', 'Är du säker på att du vill ta bort detta objekt?'))) {
      deleteShape(object.id);
      onClose();
    }
  }, [object.id, deleteShape, onClose, t]);

  // Get category info
  const category = object.objectCategory || 'custom';
  const categoryName = categoryNames[category]?.[lang] || category;
  const categoryColorClass = categoryColors[category] || categoryColors.default;

  // Get object name
  const objectName = object.name || object.metadata?.objectId || categoryName;

  return (
    <div className="w-72 bg-white border-l border-gray-200 flex flex-col h-full shadow-lg">
      {/* Header */}
      <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center border",
            categoryColorClass
          )}>
            {category.includes('outlet') || category.includes('switch') ? '⚡' :
             category === 'door' ? '🚪' :
             category === 'window' ? '🪟' :
             category.includes('cabinet') ? '🗄️' : '📦'}
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-sm truncate">{objectName}</h3>
            <p className="text-xs text-gray-500">{categoryName}</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Install status (control checklist) — electrical fixtures only */}
      {isElectrical && (
        <button
          onClick={toggleInstalled}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 border-b text-sm font-medium transition-colors text-left",
            isInstalled
              ? "bg-green-50 text-green-700 hover:bg-green-100"
              : "bg-white text-gray-600 hover:bg-gray-50"
          )}
        >
          {isInstalled ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
          {isInstalled
            ? t('elevation.installed', 'Installerad')
            : t('elevation.markInstalled', 'Markera som installerad')}
        </button>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Dimensions section */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Ruler className="h-4 w-4 text-gray-500" />
            <h4 className="font-medium text-sm">{t('elevation.dimensions', 'Dimensioner')}</h4>
          </div>

          <div className="space-y-3">
            {/* Width */}
            <div className="flex items-center gap-2">
              <Label className="w-24 text-xs text-gray-600">
                {t('elevation.width', 'Bredd')}
              </Label>
              <div className="flex-1 flex items-center gap-1">
                <Input
                  type="number"
                  value={width}
                  onChange={(e) => handleFieldChange(setWidth, e.target.value)}
                  className="h-8 text-sm"
                  min={0}
                  step={10}
                />
                <span className="text-xs text-gray-500 w-8">mm</span>
              </div>
            </div>

            {/* Height */}
            <div className="flex items-center gap-2">
              <Label className="w-24 text-xs text-gray-600">
                {t('elevation.height', 'Höjd')}
              </Label>
              <div className="flex-1 flex items-center gap-1">
                <Input
                  type="number"
                  value={height}
                  onChange={(e) => handleFieldChange(setHeight, e.target.value)}
                  className="h-8 text-sm"
                  min={0}
                  step={10}
                />
                <span className="text-xs text-gray-500 w-8">mm</span>
              </div>
            </div>

            <Separator className="my-2" />

            {/* Elevation from floor */}
            <div className="flex items-center gap-2">
              <Label className="w-24 text-xs text-gray-600">
                {t('elevation.fromFloor', 'Från golv')}
              </Label>
              <div className="flex-1 flex items-center gap-1">
                <Input
                  type="number"
                  value={elevationBottom}
                  onChange={(e) => handleFieldChange(setElevationBottom, e.target.value)}
                  className="h-8 text-sm"
                  min={0}
                  step={50}
                />
                <span className="text-xs text-gray-500 w-8">mm</span>
              </div>
            </div>

            {/* Distance from wall start */}
            <div className="flex items-center gap-2">
              <Label className="w-24 text-xs text-gray-600">
                {t('elevation.fromWallEdge', 'Från väggkant')}
              </Label>
              <div className="flex-1 flex items-center gap-1">
                <Input
                  type="number"
                  value={distanceFromStart}
                  onChange={(e) => handleFieldChange(setDistanceFromStart, e.target.value)}
                  className="h-8 text-sm"
                  min={0}
                  step={50}
                />
                <span className="text-xs text-gray-500 w-8">mm</span>
              </div>
            </div>
          </div>

          {/* Save button */}
          {hasChanges && (
            <Button
              onClick={handleSave}
              className="w-full mt-3 bg-blue-500 hover:bg-blue-600"
              size="sm"
            >
              <Save className="h-4 w-4 mr-2" />
              {t('common.save', 'Spara')}
            </Button>
          )}
        </div>

        <Separator />

        {/* Comments section */}
        <div>
          <button
            onClick={onOpenComments}
            className="w-full flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <MessageCircle className={cn(
                "h-4 w-4",
                isCommentResolved ? "text-gray-400" : "text-blue-500"
              )} />
              <span className="text-sm font-medium">
                {t('quickComment.comments', 'Kommentarer')}
              </span>
              {commentCount > 0 && (
                <Badge
                  variant={isCommentResolved ? "outline" : "secondary"}
                  className={cn(
                    "text-xs",
                    isCommentResolved && "text-gray-400 border-gray-300"
                  )}
                >
                  {isCommentResolved ? '✓' : commentCount}
                </Badge>
              )}
            </div>
            <ChevronRight className="h-4 w-4 text-gray-400" />
          </button>
        </div>

        <Separator />

        {/* Object info */}
        <div className="text-xs text-gray-400 space-y-1">
          <p>ID: {object.id.slice(0, 8)}...</p>
          {object.wallRelative?.wallId && (
            <p>Vägg: {object.wallRelative.wallId.slice(0, 8)}...</p>
          )}
        </div>
      </div>

      {/* Footer - Delete button */}
      <div className="p-4 border-t bg-gray-50">
        <Button
          variant="outline"
          className="w-full text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
          onClick={handleDelete}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          {t('common.delete', 'Ta bort')}
        </Button>
      </div>
    </div>
  );
};

export default ElevationObjectPanel;

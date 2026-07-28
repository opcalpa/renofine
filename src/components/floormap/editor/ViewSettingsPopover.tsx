/**
 * Top-bar view settings for the v2 editor (Figma-style view menu):
 * grid, snap, wall dimensions, room area labels and display unit.
 * Only affects what is SHOWN — drawing defaults stay in contextual UI.
 */

import { useMemo } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { useMeasurement } from '@/contexts/MeasurementContext';
import { useFloorMapStore } from '../store';
import { getShapeObjectCategory } from '../objectLibrary';

// Object-library category → [i18n key, fallback]. Mirrors the v1 canvas filter.
const OBJECT_CATEGORY_LABELS: Record<string, [string, string]> = {
  electrical: ['roomItems.catElectrical', 'El-objekt'],
  kitchen: ['canvas.objectCatKitchen', 'Köksobjekt'],
  plumbing: ['roomItems.catPlumbing', 'VVS'],
  ventilation: ['roomItems.catVentilation', 'Ventilation'],
  appliance: ['roomItems.catAppliance', 'Vitvaror'],
};

const GRID_INTERVAL_OPTIONS = [
  { value: 50, labelKey: 'canvas.gridFine' },
  { value: 100, labelKey: 'canvas.grid10cm' },
  { value: 250, labelKey: 'canvas.grid25cm' },
  { value: 500, labelKey: 'canvas.gridStandard' },
  { value: 1000, labelKey: 'canvas.grid1m' },
  { value: 2000, labelKey: 'canvas.gridCoarse' },
];

export const ViewSettingsPopover = () => {
  const { t } = useTranslation();
  const { units: systemUnits } = useMeasurement();
  const {
    projectSettings,
    toggleGrid,
    setGridInterval,
    toggleSnap,
    toggleDimensions,
    toggleAreaLabels,
    toggleSurfacePatterns,
    toggleFinishLabels,
    toggleObjectCategory,
    setUnit,
    shapes,
  } = useFloorMapStore();
  const surfacesVisible = !projectSettings.hiddenObjectCategories.includes('surface');

  // Object categories actually present on the canvas — each gets a show/hide
  // toggle (the store + ObjectsLayer already honour hiddenObjectCategories;
  // v1's CanvasSettingsPopover had this, v2 was missing it).
  const presentObjectCategories = useMemo(() => {
    const set = new Set<string>();
    for (const s of shapes) {
      const cat = getShapeObjectCategory(s);
      if (cat) set.add(cat);
    }
    return [...set].sort();
  }, [shapes]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2 text-xs text-muted-foreground"
          title={t('floormap.viewSettings', 'Visning')}
          data-testid="view-settings-trigger"
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span className="hidden lg:inline">{t('floormap.viewSettings', 'Visning')}</span>
        </Button>
      </PopoverTrigger>
      {/* z above the demo banner (z-[59]) which otherwise covers the top rows */}
      <PopoverContent align="end" sideOffset={8} className="w-72 z-[70]">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="v2-show-grid" className="text-sm font-normal">
              {t('canvas.showGrid', 'Visa rutnät')}
            </Label>
            <Switch
              id="v2-show-grid"
              checked={projectSettings.gridVisible}
              onCheckedChange={toggleGrid}
            />
          </div>

          {projectSettings.gridVisible && (
            <div className="flex items-center justify-between gap-3">
              <Label className="text-sm font-normal text-muted-foreground">
                {t('canvas.gridSpacing', 'Rutnätstäthet')}
              </Label>
              <Select
                value={projectSettings.gridInterval.toString()}
                onValueChange={(value) => setGridInterval(parseInt(value, 10))}
              >
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GRID_INTERVAL_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value.toString()}>
                      {t(option.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center justify-between">
            <Label htmlFor="v2-snap" className="text-sm font-normal">
              {t('canvas.snapToGrid', 'Snäpp till rutnät')}
            </Label>
            <Switch
              id="v2-snap"
              checked={projectSettings.snapEnabled}
              onCheckedChange={toggleSnap}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <Label htmlFor="v2-show-dimensions" className="text-sm font-normal">
              {t('canvas.showDimensions', 'Visa väggmått')}
            </Label>
            <Switch
              id="v2-show-dimensions"
              checked={projectSettings.showDimensions}
              onCheckedChange={toggleDimensions}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="v2-show-areas" className="text-sm font-normal">
              {t('canvas.showAreaLabels', 'Visa rumsareor')}
            </Label>
            <Switch
              id="v2-show-areas"
              checked={projectSettings.showAreaLabels}
              onCheckedChange={toggleAreaLabels}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="v2-show-surfaces" className="text-sm font-normal">
              {t('canvas.surfaceVisibility', 'Ytor & färg')}
            </Label>
            <Switch
              id="v2-show-surfaces"
              checked={surfacesVisible}
              onCheckedChange={() => toggleObjectCategory('surface')}
            />
          </div>

          {surfacesVisible && (
            <div className="flex items-center justify-between">
              <Label htmlFor="v2-show-patterns" className="text-sm font-normal">
                {t('canvas.showFloorPatterns', 'Ytmönster (golv & vägg)')}
              </Label>
              <Switch
                id="v2-show-patterns"
                checked={projectSettings.showSurfacePatterns}
                onCheckedChange={toggleSurfacePatterns}
              />
            </div>
          )}

          <div className="flex items-center justify-between">
            <Label htmlFor="v2-show-finish-labels" className="text-sm font-normal">
              {t('canvas.showFinishLabels', 'Färgkoder på väggar')}
            </Label>
            <Switch
              id="v2-show-finish-labels"
              checked={projectSettings.showFinishLabels}
              onCheckedChange={toggleFinishLabels}
            />
          </div>

          {/* Per-work-type filter: show/hide placed objects by category. Only
              categories actually on the canvas get a toggle. */}
          {presentObjectCategories.length > 0 && (
            <>
              <Separator />
              <Label className="text-xs font-medium text-muted-foreground">
                {t('canvas.objectVisibility', 'Visa objekt')}
              </Label>
              {presentObjectCategories.map((cat) => {
                const [labelKey, fallback] =
                  OBJECT_CATEGORY_LABELS[cat] ?? [`roomItems.cat${cat}`, cat];
                return (
                  <div key={cat} className="flex items-center justify-between">
                    <Label htmlFor={`v2-show-cat-${cat}`} className="text-sm font-normal">
                      {t(labelKey, fallback)}
                    </Label>
                    <Switch
                      id={`v2-show-cat-${cat}`}
                      data-testid={`v2-cat-toggle-${cat}`}
                      checked={!projectSettings.hiddenObjectCategories.includes(cat)}
                      onCheckedChange={() => toggleObjectCategory(cat)}
                    />
                  </div>
                );
              })}
            </>
          )}

          <Separator />

          <div className="flex items-center justify-between gap-3">
            <Label className="text-sm font-normal">
              {t('canvas.displayUnit', 'Enhet')}
            </Label>
            <div className="flex gap-1">
              {systemUnits.map((unit) => (
                <Button
                  key={unit}
                  variant={projectSettings.unit === unit ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => setUnit(unit)}
                >
                  {unit}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

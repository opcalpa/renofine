/**
 * Top-bar view settings for the v2 editor (Figma-style view menu):
 * grid, snap, wall dimensions, room area labels and display unit.
 * Only affects what is SHOWN — drawing defaults stay in contextual UI.
 */

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
    setUnit,
  } = useFloorMapStore();

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
      <PopoverContent align="end" sideOffset={8} className="w-72">
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

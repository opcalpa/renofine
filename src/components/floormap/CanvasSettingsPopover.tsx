/**
 * Canvas Settings Popover
 * Centralized workspace environment configuration
 * Separated from drawing tools to reduce cognitive load
 */

import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useMeasurement } from "@/contexts/MeasurementContext";
import { Settings, Grid3x3, Ruler, Magnet, Maximize2, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useFloorMapStore } from "./store";
import { getShapeObjectCategory } from "./objectLibrary";
import { Scale, Unit } from "./utils/formatting";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

// localStorage keys for persistent settings
const WALL_THICKNESS_KEY = "admin_wallThickness";
const WALL_HEIGHT_KEY = "admin_wallHeight";

// Object-library category → [i18n key, fallback]. Drives the canvas category filter labels.
const OBJECT_CATEGORY_LABELS: Record<string, [string, string]> = {
  electrical: ["roomItems.catElectrical", "El-objekt"],
  kitchen: ["canvas.objectCatKitchen", "Köksobjekt"],
  plumbing: ["roomItems.catPlumbing", "VVS"],
  ventilation: ["roomItems.catVentilation", "Ventilation"],
  appliance: ["roomItems.catAppliance", "Vitvaror"],
};

export const CanvasSettingsPopover = () => {
  const { t } = useTranslation();
  const { system, units: systemUnits } = useMeasurement();
  const {
    projectSettings,
    setScale,
    setUnit,
    setGridInterval,
    toggleGrid,
    toggleSnap,
    toggleDimensions,
    toggleAreaLabels,
    toggleObjectCategory,
    setCanvasSize,
    shapes,
  } = useFloorMapStore();

  // Object categories actually present on the canvas — each gets a filter toggle.
  const presentObjectCategories = useMemo(() => {
    const set = new Set<string>();
    for (const s of shapes) {
      const cat = getShapeObjectCategory(s);
      if (cat) set.add(cat);
    }
    return [...set].sort();
  }, [shapes]);

  // Wall defaults (persisted in localStorage)
  const [wallThickness, setWallThickness] = useState<string>("150");
  const [wallHeight, setWallHeight] = useState<string>("2400");

  // Load wall settings from localStorage on mount
  useEffect(() => {
    const savedThickness = localStorage.getItem(WALL_THICKNESS_KEY);
    const savedHeight = localStorage.getItem(WALL_HEIGHT_KEY);
    if (savedThickness) setWallThickness(savedThickness);
    if (savedHeight) setWallHeight(savedHeight);
  }, []);

  // Save wall thickness to localStorage
  const handleWallThicknessChange = (value: string) => {
    setWallThickness(value);
    localStorage.setItem(WALL_THICKNESS_KEY, value);
  };

  // Save wall height to localStorage
  const handleWallHeightChange = (value: string) => {
    setWallHeight(value);
    localStorage.setItem(WALL_HEIGHT_KEY, value);
  };

  const gridIntervalOptions = [
    { value: 50, labelKey: 'canvas.gridFine' },
    { value: 100, labelKey: 'canvas.grid10cm' },
    { value: 250, labelKey: 'canvas.grid25cm' },
    { value: 500, labelKey: 'canvas.gridStandard' },
    { value: 1000, labelKey: 'canvas.grid1m' },
    { value: 2000, labelKey: 'canvas.gridCoarse' },
  ];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="w-10 h-10"
          title={t('common.settings')}
        >
          <Settings className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 max-h-[80vh] overflow-y-auto" side="right" align="start" sideOffset={8} collisionPadding={16}>
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold mb-3 flex items-center gap-2">
              <Settings className="h-4 w-4" />
              {t('canvas.settings')}
            </h4>
            <p className="text-xs text-muted-foreground mb-4">
              {t('canvas.settingsDescription')}
            </p>
          </div>

          <Separator />

          {/* Wall Defaults */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2 font-semibold">
              <Layers className="h-3.5 w-3.5" />
              {t('canvas.wallDefaults')}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t('canvas.wallDefaultsDesc')}
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="wall-thickness" className="text-xs">
                  {t('canvas.thickness')} (mm)
                </Label>
                <Input
                  id="wall-thickness"
                  type="number"
                  min="50"
                  max="500"
                  step="10"
                  value={wallThickness}
                  onChange={(e) => handleWallThicknessChange(e.target.value)}
                  className="h-8"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wall-height" className="text-xs">
                  {t('canvas.height')} (mm)
                </Label>
                <Input
                  id="wall-height"
                  type="number"
                  min="1000"
                  max="5000"
                  step="100"
                  value={wallHeight}
                  onChange={(e) => handleWallHeightChange(e.target.value)}
                  className="h-8"
                />
              </div>
            </div>

            {/* Quick Presets for walls */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7 flex-1"
                onClick={() => {
                  handleWallThicknessChange("100");
                  handleWallHeightChange("2400");
                }}
              >
                {t('canvas.innerWall')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7 flex-1"
                onClick={() => {
                  handleWallThicknessChange("200");
                  handleWallHeightChange("2400");
                }}
              >
                {t('canvas.outerWall')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7 flex-1"
                onClick={() => {
                  handleWallThicknessChange("150");
                  handleWallHeightChange("2700");
                }}
              >
                {t('canvas.highCeiling')}
              </Button>
            </div>
          </div>

          <Separator />

          {/* Scale Selector */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Ruler className="h-3.5 w-3.5" />
              {t('canvas.scale')}
            </Label>
            <Select
              value={projectSettings.scale}
              onValueChange={(value) => setScale(value as Scale)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1:20">1:20 ({t('canvas.scaleDetailed')})</SelectItem>
                <SelectItem value="1:50">1:50 ({t('canvas.scaleStandardDetail')})</SelectItem>
                <SelectItem value="1:100">1:100 ({t('canvas.scaleStandard')})</SelectItem>
                <SelectItem value="1:500">1:500 ({t('canvas.scaleOverview')})</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t('canvas.scaleDescription')}
            </p>
          </div>

          <Separator />

          {/* Unit Toggle */}
          <div className="space-y-2">
            <Label>{t('canvas.displayUnit')}</Label>
            <div className="flex gap-2">
              {systemUnits.map((unit) => (
                <Button
                  key={unit}
                  variant={projectSettings.unit === unit ? "default" : "outline"}
                  size="sm"
                  onClick={() => setUnit(unit)}
                  className="flex-1"
                >
                  {unit}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('canvas.unitDescription')}
            </p>
          </div>

          <Separator />

          {/* Grid Settings */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Grid3x3 className="h-3.5 w-3.5" />
              {t('canvas.gridConfig')}
            </Label>

            {/* Grid Visibility */}
            <div className="flex items-center justify-between">
              <Label htmlFor="grid-visible" className="text-sm font-normal">
                {t('canvas.showGrid')}
              </Label>
              <Switch
                id="grid-visible"
                checked={projectSettings.gridVisible}
                onCheckedChange={toggleGrid}
              />
            </div>

            {/* Grid Interval */}
            <div className="space-y-2">
              <Label className="text-sm">{t('canvas.gridSpacing')}</Label>
              <Select
                value={projectSettings.gridInterval.toString()}
                onValueChange={(value) => setGridInterval(parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {gridIntervalOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value.toString()}>
                      {t(option.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Snap to Grid */}
            <div className="flex items-center justify-between">
              <Label htmlFor="snap-enabled" className="text-sm font-normal flex items-center gap-2">
                <Magnet className="h-3.5 w-3.5" />
                {t('canvas.snapToGrid')}
              </Label>
              <Switch
                id="snap-enabled"
                checked={projectSettings.snapEnabled}
                onCheckedChange={toggleSnap}
              />
            </div>
          </div>

          <Separator />

          {/* Canvas Size */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold flex items-center gap-2">
              <Maximize2 className="h-3.5 w-3.5" />
              {t('canvas.canvasSize')}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t('canvas.canvasSizeDesc')}
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="canvas-width" className="text-xs">
                  {t('canvas.widthM')}
                </Label>
                <Input
                  id="canvas-width"
                  type="number"
                  min="10"
                  max="200"
                  step="5"
                  value={projectSettings.canvasWidthMeters}
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || 30;
                    setCanvasSize(value, projectSettings.canvasHeightMeters);
                  }}
                  className="h-8"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="canvas-height" className="text-xs">
                  {t('canvas.heightM')}
                </Label>
                <Input
                  id="canvas-height"
                  type="number"
                  min="10"
                  max="200"
                  step="5"
                  value={projectSettings.canvasHeightMeters}
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || 30;
                    setCanvasSize(projectSettings.canvasWidthMeters, value);
                  }}
                  className="h-8"
                />
              </div>
            </div>

            {/* Quick Presets */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7 flex-1"
                onClick={() => setCanvasSize(20, 20)}
              >
                20×20m
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7 flex-1"
                onClick={() => setCanvasSize(30, 30)}
              >
                30×30m
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7 flex-1"
                onClick={() => setCanvasSize(50, 50)}
              >
                50×50m
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('canvas.standardSizes')}
            </p>
          </div>

          <Separator />

          {/* Display Options */}
          <div className="space-y-3">
            <Label>{t('canvas.displayOptions')}</Label>

            {/* Show Dimensions */}
            <div className="flex items-center justify-between">
              <Label htmlFor="show-dimensions" className="text-sm font-normal">
                {t('canvas.showDimensions')}
              </Label>
              <Switch
                id="show-dimensions"
                checked={projectSettings.showDimensions}
                onCheckedChange={toggleDimensions}
              />
            </div>
            <p className="text-xs text-muted-foreground -mt-1">
              {t('canvas.dimensionsDesc')}
            </p>

            {/* Show Area Labels */}
            <div className="flex items-center justify-between">
              <Label htmlFor="show-area" className="text-sm font-normal">
                {t('canvas.showAreaLabels')}
              </Label>
              <Switch
                id="show-area"
                checked={projectSettings.showAreaLabels}
                onCheckedChange={toggleAreaLabels}
              />
            </div>

            {/* Category filter: show/hide placed objects per category. Only the
                categories actually present on the canvas get a toggle. */}
            {presentObjectCategories.length > 0 && (
              <>
                <Separator className="my-1" />
                <Label className="text-xs font-medium text-muted-foreground">
                  {t('canvas.objectVisibility', 'Visa objekt')}
                </Label>
                {presentObjectCategories.map((cat) => {
                  const [labelKey, fallback] = OBJECT_CATEGORY_LABELS[cat] ?? [`roomItems.cat${cat}`, cat];
                  return (
                    <div key={cat} className="flex items-center justify-between">
                      <Label htmlFor={`show-cat-${cat}`} className="text-sm font-normal">
                        {t(labelKey, fallback)}
                      </Label>
                      <Switch
                        id={`show-cat-${cat}`}
                        checked={!projectSettings.hiddenObjectCategories.includes(cat)}
                        onCheckedChange={() => toggleObjectCategory(cat)}
                      />
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {/* Current Settings Summary */}
          <div className="mt-4 p-3 bg-muted/50 rounded-md">
            <p className="text-xs font-medium mb-2">{t('canvas.activeConfig')}</p>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <span>{t('floormap.wall')}: {wallThickness}×{wallHeight}mm</span>
              <span>{t('canvas.scale')}: {projectSettings.scale}</span>
              <span>{t('canvas.unit')}: {projectSettings.unit}</span>
              <span>{t('canvas.grid')}: {projectSettings.gridInterval}mm</span>
              <span>{t('canvas.snap')}: {projectSettings.snapEnabled ? t('canvas.on') : t('canvas.off')}</span>
              <span>{t('canvas.workspace')}: {projectSettings.canvasWidthMeters}×{projectSettings.canvasHeightMeters}m</span>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

import { useTranslation } from "react-i18next";
import { Settings2, Check, Layers, ArrowUp, ArrowDown, ArrowUpToLine, ArrowDownToLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ROOM_COLOR_OPTIONS } from "./constants";
import { useState, useEffect, useMemo } from "react";
import { useFloorMapStore } from "../store";

// Helper function to get darker version for stroke (70% darker)
const getDarkerColor = (rgbaColor: string): string => {
  const match = rgbaColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (match) {
    const r = Math.floor(parseInt(match[1]) * 0.7);
    const g = Math.floor(parseInt(match[2]) * 0.7);
    const b = Math.floor(parseInt(match[3]) * 0.7);
    return `rgba(${r}, ${g}, ${b}, 0.8)`;
  }
  return rgbaColor;
};

// Parse opacity from RGBA color string
const parseOpacity = (rgbaColor: string): number => {
  const match = rgbaColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (match && match[4]) {
    return parseFloat(match[4]);
  }
  return 0.2;
};

// Update opacity in RGBA color string
const setOpacityInColor = (rgbaColor: string, opacity: number): string => {
  const match = rgbaColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (match) {
    return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${opacity})`;
  }
  return rgbaColor;
};

// Get the base color (RGB) from RGBA
const getBaseColor = (rgbaColor: string): string => {
  const match = rgbaColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (match) {
    return `rgba(${match[1]}, ${match[2]}, ${match[3]}, 1)`;
  }
  return rgbaColor;
};

interface CanvasSettingsPopoverProps {
  roomId: string | null;
  color: string;
  onColorChange: (color: string) => void;
  /** When set, replaces the default Settings2 ghost button. Use for a colored-dot trigger in v2 hero. */
  customTrigger?: React.ReactNode;
}

export function CanvasSettingsPopover({
  roomId,
  color,
  onColorChange,
  customTrigger,
}: CanvasSettingsPopoverProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [tempColor, setTempColor] = useState(color);

  const currentOpacity = useMemo(() => parseOpacity(color), [color]);
  const [opacity, setOpacity] = useState(currentOpacity);

  const { shapes, updateShape, bringForward, sendBackward, bringToFront, sendToBack } = useFloorMapStore();

  const roomShape = useMemo(() => {
    if (!roomId) return null;
    return shapes.find(s => s.roomId === roomId && s.type === 'room');
  }, [shapes, roomId]);

  const shapeZIndex = roomShape?.zIndex ?? 0;

  useEffect(() => {
    setOpacity(parseOpacity(color));
  }, [color]);

  const handleOpacityChange = (values: number[]) => {
    const newOpacity = values[0];
    setOpacity(newOpacity);
    const newColor = setOpacityInColor(color, newOpacity);
    onColorChange(newColor);
    if (roomShape) {
      updateShape(roomShape.id, {
        color: newColor,
        strokeColor: getDarkerColor(newColor),
      });
    }
  };

  const handleBringForward = () => roomShape && bringForward(roomShape.id);
  const handleSendBackward = () => roomShape && sendBackward(roomShape.id);
  const handleBringToFront = () => roomShape && bringToFront(roomShape.id);
  const handleSendToBack = () => roomShape && sendToBack(roomShape.id);

  const applyColorSelection = (colorToApply?: string) => {
    const baseColor = colorToApply ?? tempColor;
    const colorWithOpacity = setOpacityInColor(baseColor, opacity);
    onColorChange(colorWithOpacity);
    if (roomShape) {
      updateShape(roomShape.id, {
        color: colorWithOpacity,
        strokeColor: getDarkerColor(colorWithOpacity),
      });
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {customTrigger ? (
          <button
            type="button"
            title={t("rooms.canvasSettings")}
            aria-label={t("rooms.canvasSettings")}
            className="cursor-pointer border-0 bg-transparent p-0"
          >
            {customTrigger}
          </button>
        ) : (
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Settings2 className="h-4 w-4" />
            <span className="sr-only">{t("rooms.canvasSettings")}</span>
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-4">
          <div className="font-medium text-sm">{t("rooms.canvasSettings")}</div>

          {/* Color picker */}
          <div className="space-y-2">
            <Label className="text-xs">{t("rooms.roomColor")}</Label>
            <div className="grid grid-cols-4 gap-2">
              {ROOM_COLOR_OPTIONS.map((colorOption) => {
                const previewColor = setOpacityInColor(colorOption.color, opacity);
                const isSelected = getBaseColor(tempColor) === getBaseColor(colorOption.color);

                return (
                  <button
                    key={colorOption.hex}
                    type="button"
                    onClick={() => {
                      const newColor = setOpacityInColor(colorOption.color, opacity);
                      setTempColor(newColor);
                      applyColorSelection(colorOption.color);
                    }}
                    className={`
                      w-8 h-8 rounded-full border-2 transition-all
                      ${isSelected ? "border-slate-900 scale-110" : "border-transparent hover:border-slate-300"}
                    `}
                    style={{ backgroundColor: previewColor }}
                    title={t(colorOption.nameKey)}
                  />
                );
              })}
            </div>
          </div>

          {/* Opacity slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">{t("canvasSettings.transparency", "Transparency")}</Label>
              <span className="text-xs text-muted-foreground">
                {Math.round(opacity * 100)}%
              </span>
            </div>
            <Slider
              value={[opacity]}
              onValueChange={handleOpacityChange}
              min={0.05}
              max={0.8}
              step={0.05}
            />
          </div>

          {/* Layer ordering */}
          {roomId && roomShape && (
            <div className="space-y-2 pt-2 border-t">
              <div className="flex items-center gap-2">
                <Layers className="h-3.5 w-3.5 text-gray-600" />
                <Label className="text-xs">{t("canvasSettings.layerOrder", "Layer Order")}</Label>
              </div>
              <div className="grid grid-cols-2 gap-1">
                <Button type="button" variant="outline" size="sm" onClick={handleSendToBack} className="text-xs h-7">
                  <ArrowDownToLine className="h-3 w-3 mr-1" />
                  {t("canvasSettings.sendToBack", "Back")}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={handleBringToFront} className="text-xs h-7">
                  <ArrowUpToLine className="h-3 w-3 mr-1" />
                  {t("canvasSettings.bringToFront", "Front")}
                </Button>
              </div>
              <div className="text-xs text-center text-muted-foreground">
                {t("canvasSettings.currentLayer", "Layer")}: {shapeZIndex}
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

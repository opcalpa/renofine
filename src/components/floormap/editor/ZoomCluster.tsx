/**
 * Bottom-right zoom cluster (Figma convention): − / percent menu / +.
 * Zooming keeps the viewport center fixed; the percent menu offers
 * fit-to-plan and zoom-to-100%.
 */

import { ChevronDown, Minus, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useFloorMapStore } from '../store';
import { calculateFitToContent } from '../canvas/utils/fitToContent';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.2;

interface ZoomClusterProps {
  containerSize: { width: number; height: number };
}

export const ZoomCluster = ({ containerSize }: ZoomClusterProps) => {
  const { t } = useTranslation();
  const zoom = useFloorMapStore((s) => s.viewState.zoom);

  const setZoomCentered = (targetZoom: number) => {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, targetZoom));
    const { viewState, setViewState } = useFloorMapStore.getState();
    const cx = containerSize.width / 2;
    const cy = containerSize.height / 2;
    const ratio = clamped / viewState.zoom;
    setViewState({
      zoom: clamped,
      panX: cx - (cx - viewState.panX) * ratio,
      panY: cy - (cy - viewState.panY) * ratio,
    });
  };

  const fitToPlan = () => {
    const store = useFloorMapStore.getState();
    const planShapes = store.shapes.filter(
      (s) => s.planId === store.currentPlanId || !s.planId
    );
    const fitted = calculateFitToContent(
      planShapes,
      containerSize.width,
      containerSize.height
    );
    if (fitted) store.setViewState(fitted);
  };

  return (
    <div
      className="absolute bottom-4 right-20 z-30 flex items-center rounded-lg border bg-white shadow-lg"
      data-testid="zoom-cluster"
    >
      <button
        className="flex h-9 w-9 items-center justify-center rounded-l-lg text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
        title={t('floormap.zoom.out', 'Zooma ut')}
        onClick={() => setZoomCentered(zoom / ZOOM_STEP)}
      >
        <Minus className="h-4 w-4" />
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex h-9 min-w-[64px] items-center justify-center gap-1 px-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100"
            title={t('floormap.zoom.menu', 'Zoomalternativ')}
          >
            {Math.round(zoom * 100)}%
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="w-52">
          <DropdownMenuItem onClick={fitToPlan}>
            {t('floormap.zoom.fit', 'Anpassa till ritningen')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setZoomCentered(1)}>
            {t('floormap.zoom.to100', 'Zooma till 100 %')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setZoomCentered(zoom * ZOOM_STEP)}>
            {t('floormap.zoom.in', 'Zooma in')}
            <DropdownMenuShortcut>+</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setZoomCentered(zoom / ZOOM_STEP)}>
            {t('floormap.zoom.out', 'Zooma ut')}
            <DropdownMenuShortcut>−</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <button
        className="flex h-9 w-9 items-center justify-center rounded-r-lg text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
        title={t('floormap.zoom.in', 'Zooma in')}
        onClick={() => setZoomCentered(zoom * ZOOM_STEP)}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
};

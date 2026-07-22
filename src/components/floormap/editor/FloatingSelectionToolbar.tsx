/**
 * Floating mini-toolbar anchored above the current selection (Figma-style):
 * rotate 90°, mirror, duplicate, delete — plus align/distribute when several
 * shapes are selected and flip for a single opening. All actions go through
 * editor commands, so each is one undoable step.
 */

import { useMemo } from 'react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceBetween,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceBetween,
  ArrowLeftRight,
  Copy,
  FlipHorizontal2,
  FlipVertical2,
  RotateCw,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useFloorMapStore } from '../store';
import { useEditorUiStore } from './state/uiStore';
import { execute } from './core/commands';
import { unionBounds } from './geometry/bounds';
import type { AlignMode } from './core/selectionOps';

const BUTTON_CLASS =
  'flex h-8 w-8 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors';

export const FloatingSelectionToolbar = () => {
  const { t } = useTranslation();
  const shapes = useFloorMapStore((s) => s.shapes);
  const selectedShapeIds = useFloorMapStore((s) => s.selectedShapeIds);
  const viewState = useFloorMapStore((s) => s.viewState);
  const activeTool = useFloorMapStore((s) => s.activeTool);
  const marquee = useEditorUiStore((s) => s.marquee);

  const selected = useMemo(
    () => shapes.filter((s) => selectedShapeIds.includes(s.id) && !s.locked),
    [shapes, selectedShapeIds]
  );
  const transformables = useMemo(
    () => selected.filter((s) => s.type !== 'opening' && s.type !== 'image'),
    [selected]
  );

  const anchor = useMemo(() => {
    const bounds = unionBounds(selected);
    if (!bounds) return null;
    return {
      x: ((bounds.minX + bounds.maxX) / 2) * viewState.zoom + viewState.panX,
      y: bounds.minY * viewState.zoom + viewState.panY,
    };
  }, [selected, viewState]);

  if (activeTool !== 'select' || marquee || selected.length === 0 || !anchor) return null;

  const ids = selected.map((s) => s.id);
  const singleOpening = selected.length === 1 && selected[0].type === 'opening';
  const canTransform = transformables.length > 0;
  const canAlign = transformables.length >= 2;
  const canDistribute = transformables.length >= 3;

  const align = (mode: AlignMode) => execute('selection.align', { ids, mode });

  return (
    <div
      className="absolute z-30 flex items-center gap-0.5 rounded-lg border bg-white p-1 shadow-lg"
      data-testid="selection-toolbar"
      style={{
        left: anchor.x,
        top: Math.max(anchor.y - 48, 8),
        transform: 'translateX(-50%)',
      }}
    >
      {singleOpening ? (
        <button
          className={BUTTON_CLASS}
          title={t('floormap.selection.flipOpening', 'Vänd öppning (F)')}
          onClick={() => execute('opening.flip', { id: selected[0].id })}
        >
          <ArrowLeftRight className="h-4 w-4" />
        </button>
      ) : (
        canTransform && (
          <>
            <button
              className={BUTTON_CLASS}
              title={t('floormap.selection.rotate90', 'Rotera 90°')}
              onClick={() => execute('selection.rotate', { ids })}
            >
              <RotateCw className="h-4 w-4" />
            </button>
            <button
              className={BUTTON_CLASS}
              title={t('floormap.selection.mirrorH', 'Spegla horisontellt')}
              onClick={() => execute('selection.mirror', { ids, direction: 'horizontal' })}
            >
              <FlipHorizontal2 className="h-4 w-4" />
            </button>
            <button
              className={BUTTON_CLASS}
              title={t('floormap.selection.mirrorV', 'Spegla vertikalt')}
              onClick={() => execute('selection.mirror', { ids, direction: 'vertical' })}
            >
              <FlipVertical2 className="h-4 w-4" />
            </button>
          </>
        )
      )}

      {!singleOpening && (
        <button
          className={BUTTON_CLASS}
          title={t('floormap.selection.duplicate', 'Duplicera (Cmd+D)')}
          onClick={() => execute('selection.duplicate', { ids })}
        >
          <Copy className="h-4 w-4" />
        </button>
      )}

      {canAlign && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={BUTTON_CLASS}
              title={t('floormap.selection.alignMenu', 'Justera & fördela')}
            >
              <AlignStartVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-48">
            <DropdownMenuLabel>{t('floormap.selection.align', 'Justera')}</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => align('left')}>
              <AlignStartVertical className="mr-2 h-4 w-4" />
              {t('floormap.selection.alignLeft', 'Vänsterkanter')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => align('centerX')}>
              <AlignCenterVertical className="mr-2 h-4 w-4" />
              {t('floormap.selection.alignCenterX', 'Centrera horisontellt')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => align('right')}>
              <AlignEndVertical className="mr-2 h-4 w-4" />
              {t('floormap.selection.alignRight', 'Högerkanter')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => align('top')}>
              <AlignStartHorizontal className="mr-2 h-4 w-4" />
              {t('floormap.selection.alignTop', 'Överkanter')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => align('centerY')}>
              <AlignCenterHorizontal className="mr-2 h-4 w-4" />
              {t('floormap.selection.alignCenterY', 'Centrera vertikalt')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => align('bottom')}>
              <AlignEndHorizontal className="mr-2 h-4 w-4" />
              {t('floormap.selection.alignBottom', 'Underkanter')}
            </DropdownMenuItem>
            {canDistribute && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>
                  {t('floormap.selection.distribute', 'Fördela')}
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => execute('selection.distribute', { ids, axis: 'horizontal' })}
                >
                  <AlignHorizontalSpaceBetween className="mr-2 h-4 w-4" />
                  {t('floormap.selection.distributeH', 'Jämnt horisontellt')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => execute('selection.distribute', { ids, axis: 'vertical' })}
                >
                  <AlignVerticalSpaceBetween className="mr-2 h-4 w-4" />
                  {t('floormap.selection.distributeV', 'Jämnt vertikalt')}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <div className="mx-0.5 h-5 w-px bg-gray-200" />
      <button
        className={`${BUTTON_CLASS} hover:bg-red-50 hover:text-red-600`}
        title={t('floormap.selection.delete', 'Radera (Delete)')}
        onClick={() => execute('shape.delete', { ids })}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
};

/**
 * Editor HUD — small DOM overlays on top of the v2 canvas:
 *
 * - Version badge ("Ny ritmotor · beta") with a one-click switch back to the
 *   old editor, so it is always obvious which editor is active.
 * - Image lock controls: select an image → "Lås bildposition" pins it as a
 *   trace-over underlay (not selectable/movable); a chip appears while any
 *   image on the plan is locked, with one click to unlock.
 */

import { useMemo } from 'react';
import { Lock, LockOpen, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useFloorMapStore } from '../store';
import { execute } from './core/commands';

const STORAGE_KEY = 'renofine.editorV2';

export const EditorHud = () => {
  const { t } = useTranslation();
  const shapes = useFloorMapStore((s) => s.shapes);
  const currentPlanId = useFloorMapStore((s) => s.currentPlanId);
  const selectedShapeIds = useFloorMapStore((s) => s.selectedShapeIds);

  const planImages = useMemo(
    () =>
      shapes.filter(
        (s) => s.type === 'image' && (s.planId === currentPlanId || !s.planId)
      ),
    [shapes, currentPlanId]
  );

  const selectedImage = useMemo(
    () => planImages.find((s) => selectedShapeIds.includes(s.id) && !s.locked) ?? null,
    [planImages, selectedShapeIds]
  );

  const lockedImages = useMemo(() => planImages.filter((s) => s.locked), [planImages]);

  const lockImage = (id: string) => {
    execute('shape.update', { id, updates: { locked: true } });
    useFloorMapStore.getState().clearSelection();
    toast.success(
      t('floormap.imageLocked', 'Bilden är låst — rita ovanpå. Lås upp via knappen nere till höger.')
    );
  };

  const unlockImages = () => {
    for (const image of lockedImages) {
      execute('shape.update', { id: image.id, updates: { locked: false } });
    }
    toast.success(t('floormap.imageUnlocked', 'Bilden är upplåst och kan flyttas igen.'));
  };

  const switchToV1 = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    const url = new URL(window.location.href);
    url.searchParams.set('editor', 'v1');
    window.location.href = url.toString();
  };

  return (
    <>
      {/* Version badge — always visible so there is never doubt which editor is active */}
      <div className="absolute top-2 right-2 z-20 flex items-center gap-1.5 rounded-full bg-emerald-700 text-white pl-3 pr-1.5 py-1 shadow-md">
        <Sparkles className="h-3.5 w-3.5" />
        <span className="text-xs font-medium">
          {t('floormap.editorV2Badge', 'Ny ritmotor · beta')}
        </span>
        <button
          onClick={switchToV1}
          className="text-[10px] leading-none rounded-full bg-emerald-800/80 hover:bg-emerald-900 px-2 py-1 transition-colors"
          title={t('floormap.editorV2SwitchBack', 'Byt till gamla editorn')}
        >
          {t('floormap.editorV2SwitchShort', 'Byt till v1')}
        </button>
      </div>

      {/* Lock action for the selected image */}
      {selectedImage && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
          <Button size="sm" className="shadow-lg" onClick={() => lockImage(selectedImage.id)}>
            <Lock className="h-4 w-4 mr-1.5" />
            {t('floormap.lockImagePosition', 'Lås bildposition')}
          </Button>
        </div>
      )}

      {/* Unlock chip while any image on the plan is locked (above the zoom cluster) */}
      {lockedImages.length > 0 && (
        <div className="absolute bottom-16 right-4 z-20">
          <Button variant="secondary" size="sm" className="shadow-md" onClick={unlockImages}>
            <LockOpen className="h-4 w-4 mr-1.5" />
            {t('floormap.unlockImage', 'Lås upp bild')}
            {lockedImages.length > 1 ? ` (${lockedImages.length})` : ''}
          </Button>
        </div>
      )}
    </>
  );
};

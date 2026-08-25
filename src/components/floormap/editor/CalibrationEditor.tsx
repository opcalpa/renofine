/**
 * Inline scale-calibration prompt — opens once the calibrate tool has its two
 * points, and asks the one question that turns a background image into a
 * drawing you can build on: how long is that in reality?
 *
 * The layer is scaled about the first clicked point, so what the person just
 * pointed at stays put and the plan grows or shrinks around it.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useImage from 'use-image';
import { toast } from 'sonner';
import { useFloorMapStore } from '../store';
import { useEditorUiStore } from './state/uiStore';
import { execute, CALIBRATE_MIN_MM, CALIBRATE_MAX_MM } from './core/commands';
import { worldToMm } from './core/units';
import { effectiveImageSize } from './render/imageSize';
import { useFileUrl } from '@/lib/fileUrl';
import type { ImageCoordinates } from '../types';

export const CalibrationEditor = () => {
  const { t } = useTranslation();
  const calibration = useEditorUiStore((s) => s.calibration);
  const shapes = useFloorMapStore((s) => s.shapes);
  const viewState = useFloorMapStore((s) => s.viewState);
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');

  const shape = useMemo(
    () => shapes.find((s) => s.id === calibration?.shapeId) ?? null,
    [shapes, calibration?.shapeId],
  );

  // The layer may still be sized 0/0 from an old upload, in which case the
  // renderer substitutes the natural size. Load the same bitmap so we scale
  // what is actually on screen rather than a stored zero.
  const signedUrl = useFileUrl(shape?.imageUrl);
  const [image] = useImage(signedUrl ?? '', 'anonymous');

  /**
   * Calibrating rescales the LAYER, not what has already been traced on top of
   * it. Done first (the intended order) that is exactly right. Done after
   * tracing, the drawn walls keep their own millimetres and stop lining up with
   * the image — so say so before it happens rather than let it look like a bug.
   */
  const tracedCount = useMemo(() => {
    if (!calibration) return 0;
    const planId = shape?.planId;
    return shapes.filter((s) => s.planId === planId && s.type !== 'image').length;
  }, [shapes, shape?.planId, calibration]);

  const mid = useMemo(() => {
    if (!calibration) return null;
    return {
      x: ((calibration.from.x + calibration.to.x) / 2) * viewState.zoom + viewState.panX,
      y: ((calibration.from.y + calibration.to.y) / 2) * viewState.zoom + viewState.panY,
    };
  }, [calibration, viewState]);

  useEffect(() => {
    if (calibration) {
      setValue('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [calibration]);

  if (!calibration || !shape || !mid) return null;

  const close = () => useEditorUiStore.getState().setCalibration(null);

  const commitScale = () => {
    const realMM = parseInt(value, 10);
    if (!Number.isFinite(realMM) || realMM < CALIBRATE_MIN_MM || realMM > CALIBRATE_MAX_MM) {
      close();
      return;
    }

    const effective = effectiveImageSize(
      shape.coordinates as ImageCoordinates,
      image ? { width: image.width, height: image.height } : null,
    );

    const factor = execute('image.calibrate', {
      id: shape.id,
      from: calibration.from,
      to: calibration.to,
      realMM,
      effective,
    });

    if (factor === null) {
      toast.error(
        t('floormap.calibrate.failed', 'Kunde inte kalibrera — dra en längre sträcka och försök igen'),
      );
    } else {
      // Say what changed in the units the person thinks in, not as a factor.
      const spanMM = Math.round(worldToMm(effective.width * factor));
      toast.success(
        t('floormap.calibrate.done', 'Skalan är satt — ritningen är nu {{span}} m bred', {
          span: (spanMM / 1000).toLocaleString('sv-SE', { maximumFractionDigits: 2 }),
        }),
      );
    }
    close();
  };

  return (
    <div
      className="absolute z-30"
      style={{ left: mid.x, top: mid.y, transform: 'translate(-50%, -130%)' }}
      data-testid="calibration-editor"
    >
      <div className="flex flex-col gap-1 rounded-md border bg-white px-2 py-1.5 shadow-lg">
        <span className="text-[11px] leading-tight text-muted-foreground">
          {t('floormap.calibrate.prompt', 'Hur lång är sträckan i verkligheten?')}
        </span>
        {tracedCount > 0 && (
          <span className="max-w-[15rem] text-[11px] leading-tight text-amber-600">
            {t(
              'floormap.calibrate.tracedWarning',
              'Obs: bara ritningen skalas om. Det du redan ritat följer inte med.'
            )}
          </span>
        )}
        <div className="flex items-center gap-1">
          <input
            ref={inputRef}
            type="number"
            autoFocus
            className="h-7 w-24 rounded border px-1.5 text-right text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            value={value}
            min={CALIBRATE_MIN_MM}
            step={10}
            placeholder="3400"
            data-testid="calibration-input"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitScale();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                close();
              }
              e.stopPropagation();
            }}
          />
          <span className="text-xs text-muted-foreground">mm</span>
        </div>
      </div>
    </div>
  );
};

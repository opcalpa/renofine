/**
 * Trace a layer, one confirmed step at a time.
 *
 * A hand sketch is the low-confidence case. Dropping a whole floor plan on
 * someone and leaving them to clean it up is how a helpful feature becomes a
 * chore, so this applies ONE kind of thing at a time — rooms, then walls, then
 * doors and fixtures — and shows each on the canvas before asking whether to
 * keep it.
 *
 * A FLOATING PANEL, not a dialog: the question is "does this look right?", and
 * a modal centred over the drawing hides the very thing being judged. It sits
 * at the bottom edge, out of the way of the plan.
 *
 * Each step is one transaction, so "ångra steget" is the editor's own undo and
 * behaves like every other undo in the app. Nothing is written to a new plan
 * behind the person's back.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useFloorMapStore } from '../store';
import { useEditorUiStore } from './state/uiStore';
import { execute, transaction } from './core/commands';
import { undo } from './core/executor';
import { analyzeLayer, type TraceResult, type TraceStageId } from '@/services/traceLayer';

const STAGE_LABELS: Record<TraceStageId, { key: string; fallback: string }> = {
  rooms: { key: 'floormap.trace.stageRooms', fallback: 'rum' },
  walls: { key: 'floormap.trace.stageWalls', fallback: 'väggar' },
  details: { key: 'floormap.trace.stageDetails', fallback: 'dörrar och fast inredning' },
};

export const TraceLayerPanel = () => {
  const { t } = useTranslation();
  const traceLayerId = useEditorUiStore((s) => s.traceLayerId);
  const shapes = useFloorMapStore((s) => s.shapes);

  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<TraceResult | null>(null);
  const [index, setIndex] = useState(0);
  /** True once this stage's shapes are on the canvas, awaiting a verdict. */
  const [applied, setApplied] = useState(false);

  const layer = useMemo(
    () => shapes.find((s) => s.id === traceLayerId) ?? null,
    [shapes, traceLayerId],
  );

  const close = useCallback(() => {
    useEditorUiStore.getState().setTraceLayerId(null);
  }, []);

  useEffect(() => {
    if (!traceLayerId) {
      setResult(null);
      setIndex(0);
      setApplied(false);
      setAnalyzing(false);
      return;
    }
    // Read the layer once, when the run starts. Re-reading on every shape change
    // would re-analyze the drawing each time a stage lands on the canvas.
    const target = useFloorMapStore.getState().shapes.find((s) => s.id === traceLayerId);
    if (!target) return;

    let cancelled = false;
    setAnalyzing(true);
    void analyzeLayer(target)
      .then((r) => {
        if (cancelled) return;
        if (!r) {
          toast.error(t('floormap.trace.failed', 'Kunde inte läsa ritningen'));
          close();
          return;
        }
        setResult(r);
        if (r.scaleWasGuessed) {
          toast.warning(
            t(
              'floormap.trace.uncalibrated',
              'Lagret har ingen satt skala — måtten blir gissningar. Kalibrera först för riktiga mått.'
            )
          );
        }
      })
      .catch(() => {
        if (cancelled) return;
        toast.error(t('floormap.trace.failed', 'Kunde inte läsa ritningen'));
        close();
      })
      .finally(() => {
        if (!cancelled) setAnalyzing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [traceLayerId, close, t]);

  const stages = result?.stages ?? [];
  const stage = stages[index];
  const done = result !== null && index >= stages.length;

  /** A stage with nothing in it is skipped, never shown as an empty question. */
  useEffect(() => {
    if (!stage || applied) return;
    if (stage.shapes.length === 0) setIndex((i) => i + 1);
  }, [stage, applied]);

  if (!traceLayerId || !layer) return null;

  const label = (id: TraceStageId) => t(STAGE_LABELS[id].key, STAGE_LABELS[id].fallback);

  const applyStage = () => {
    // An empty stage pushes no patches, and a later undo would then take back
    // whatever came BEFORE it. Empty stages never reach here.
    if (!stage || stage.shapes.length === 0) return;
    transaction(label(stage.id), () => {
      for (const shape of stage.shapes) {
        execute('shape.add', { shape });
      }
    });
    setApplied(true);
  };

  const keep = () => {
    setApplied(false);
    setIndex((i) => i + 1);
  };

  const discard = () => {
    // The whole stage went in as one transaction, so one undo takes it out.
    undo();
    setApplied(false);
    setIndex((i) => i + 1);
  };

  return (
    <div
      className="absolute bottom-6 left-1/2 z-30 w-[min(30rem,calc(100%-2rem))] -translate-x-1/2"
      data-testid="trace-layer-panel"
    >
      <div className="rounded-xl border bg-white p-3 shadow-lg">
        <div className="mb-1 flex items-start justify-between gap-2">
          <p className="text-sm font-medium">{t('floormap.trace.title', 'Rita av ritningen')}</p>
          <button
            className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            onClick={close}
            aria-label={t('common.close', 'Stäng')}
            data-testid="trace-close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {analyzing ? (
          <div className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('floormap.trace.analyzing', 'Läser ritningen…')}
          </div>
        ) : done ? (
          <div className="space-y-2" data-testid="trace-done">
            <p className="text-sm text-muted-foreground">
              {t(
                'floormap.trace.done',
                'Klart. Kontrollera måtten mot ritningen innan du bygger vidare.'
              )}
            </p>
            <Button size="sm" onClick={close}>
              {t('common.close', 'Stäng')}
            </Button>
          </div>
        ) : stage ? (
          <div className="space-y-2" data-testid={`trace-stage-${stage.id}`}>
            <p className="text-sm">
              {applied
                ? t('floormap.trace.applied', '{{count}} {{what}} inlagda. Ser det rätt ut?', {
                    count: stage.shapes.length,
                    what: label(stage.id),
                  })
                : t('floormap.trace.found', 'Jag hittade {{count}} {{what}}. Lägg in dem?', {
                    count: stage.shapes.length,
                    what: label(stage.id),
                  })}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('floormap.trace.stepOf', 'Steg {{step}} av {{total}}', {
                step: index + 1,
                total: stages.length,
              })}
            </p>

            {applied ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" data-testid="trace-keep" onClick={keep}>
                  {t('floormap.trace.keep', 'Ja, behåll')}
                </Button>
                <Button size="sm" variant="outline" data-testid="trace-discard" onClick={discard}>
                  {t('floormap.trace.discard', 'Nej, ångra steget')}
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" data-testid="trace-apply" onClick={applyStage}>
                  {t('floormap.trace.apply', 'Visa på canvasen')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  data-testid="trace-skip"
                  onClick={() => setIndex((i) => i + 1)}
                >
                  {t('floormap.trace.skip', 'Hoppa över')}
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};

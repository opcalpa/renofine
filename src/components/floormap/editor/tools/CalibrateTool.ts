/**
 * CalibrateTool — give a traced background image a real scale.
 *
 * Click along something on the drawing whose true length you know (a wall, a
 * door, the scale bar), then type that length. Until this has been done a layer
 * has no relationship to millimetres: the import assumes a 10 m span and a
 * manual upload uses the image's pixel size, so every wall traced on top
 * measures wrong while looking perfectly reasonable.
 *
 * Deliberately does NOT snap. Snapping pulls the click towards grid lines and
 * existing geometry, and here the person is pointing at pixels in a photo —
 * the drawn plan is precisely what is not yet trustworthy. Shift constrains to
 * horizontal/vertical instead, which is what a plan's walls usually are.
 */

import { toast } from 'sonner';
import i18n from '@/i18n/config';
import { BaseTool, ToolPointerEvent } from './BaseTool';
import { Point, useEditorUiStore } from '../state/uiStore';
import { useFloorMapStore } from '../../store';
import { CALIBRATE_MIN_SPAN } from '../core/commands';
import type { FloorMapShape } from '../../types';

/** Constrain to the dominant axis, the way a plan's walls run. */
function orthogonal(from: Point, to: Point): Point {
  return Math.abs(to.x - from.x) >= Math.abs(to.y - from.y)
    ? { x: to.x, y: from.y }
    : { x: from.x, y: to.y };
}

/**
 * Which layer are we calibrating?
 *
 * A selected image wins — that is the person being explicit. Otherwise, if the
 * plan holds exactly one image there is nothing to be ambiguous about. With
 * several and none selected we refuse rather than guess, because silently
 * rescaling the wrong drawing is worse than an extra click.
 */
export function resolveCalibrationTarget(): FloorMapShape | 'ambiguous' | null {
  const store = useFloorMapStore.getState();
  const onPlan = store.shapes.filter(
    (s) => s.type === 'image' && s.planId === store.currentPlanId,
  );
  if (onPlan.length === 0) return null;

  const selected = new Set(
    [...(store.selectedShapeIds ?? []), store.selectedShapeId].filter(Boolean) as string[],
  );
  const picked = onPlan.filter((s) => selected.has(s.id));
  if (picked.length === 1) return picked[0];
  if (onPlan.length === 1) return onPlan[0];
  return 'ambiguous';
}

export class CalibrateTool extends BaseTool {
  readonly id = 'calibrate';

  private start: Point | null = null;

  /**
   * Refuse up front rather than mid-gesture.
   *
   * The rule lives here, not in the toolbar, so the keyboard shortcut and the
   * button behave identically — a tool that activates with nothing to rescale
   * would just eat two clicks and do nothing.
   */
  activate(): void {
    const target = resolveCalibrationTarget();
    if (target && target !== 'ambiguous') {
      toast.info(
        i18n.t(
          'floormap.calibrate.hint',
          'Klicka längs något du vet måttet på — en vägg, en dörr — och skriv in måttet'
        )
      );
      return;
    }
    toast.info(
      target === 'ambiguous'
        ? i18n.t('floormap.calibrate.pickLayer', 'Markera vilken ritning du vill kalibrera först')
        : i18n.t(
            'floormap.calibrate.noLayer',
            'Lägg in en ritning som lager först — sedan kan du sätta dess skala'
          )
    );
    // Bounce back on the next tick: we are inside the controller's own
    // activate(), and re-entering it synchronously would fight it.
    setTimeout(() => useFloorMapStore.getState().setActiveTool('select'), 0);
  }

  deactivate(): void {
    this.cancel();
    useEditorUiStore.getState().setCalibration(null);
  }

  private ui() {
    return useEditorUiStore.getState();
  }

  private resolvePoint(e: ToolPointerEvent): Point {
    if (this.start && e.shiftKey) return orthogonal(this.start, e.world);
    return e.world;
  }

  onPointerMove(e: ToolPointerEvent): void {
    if (!this.start) return;
    const to = this.resolvePoint(e);
    // No length label while dragging: the current scale is the very thing we
    // are about to replace, so showing "2 400 mm" here would be a lie.
    this.ui().setDraft([this.start], to, null);
  }

  onPointerDown(e: ToolPointerEvent): void {
    if (e.button !== 0) return;

    // An open prompt owns the gesture — let the person answer it first.
    if (this.ui().calibration) return;

    const to = this.resolvePoint(e);

    if (!this.start) {
      this.start = { ...to };
      this.ui().setDraft([this.start], to, null);
      return;
    }

    if (Math.hypot(to.x - this.start.x, to.y - this.start.y) < CALIBRATE_MIN_SPAN) {
      // Too short to derive a factor from — keep the first point and let them
      // try the second click again rather than resetting the whole gesture.
      return;
    }

    const target = resolveCalibrationTarget();
    if (!target || target === 'ambiguous') {
      // The toolbar refuses to activate without a target, so reaching here
      // means the plan changed mid-gesture. Drop it quietly.
      this.cancel();
      return;
    }

    this.ui().setCalibration({ shapeId: target.id, from: this.start, to: { ...to } });
    this.start = null;
  }

  onKeyDown(e: KeyboardEvent): boolean {
    if (e.key !== 'Escape') return false;
    // First Escape drops the in-progress segment or the open prompt; with
    // nothing pending, upstream switches back to select.
    if (this.ui().calibration) {
      this.ui().setCalibration(null);
      return true;
    }
    if (this.start) {
      this.cancel();
      return true;
    }
    return false;
  }

  private cancel(): void {
    this.start = null;
    this.ui().setDraft([], null, null);
    this.ui().setSnapFeedback([], []);
  }
}

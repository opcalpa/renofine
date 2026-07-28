/**
 * ShapeDrawTool — basic free-form sketch primitives for the v2 editor:
 * straight line, rectangle, and circle. Drag to draw; the shape becomes a
 * regular FloorMapShape (rendered by LegacyShapesLayer) so it can be selected,
 * moved, measured and — the DIY point — grouped into one named "eget objekt".
 *
 * Lines and rectangles are corner-drags; circles are centre-drags (the shape
 * stores a true circle: cx/cy/radius). Snapping mirrors the wall/room tools.
 */

import { BaseTool, ToolPointerEvent } from './BaseTool';
import { execute } from '../core/commands';
import { snap } from '../snapping/SnapEngine';
import { formatWorldAsMm } from '../core/units';
import { Point, useEditorUiStore } from '../state/uiStore';
import { FloorMapShape } from '../../types';

export type BasicShapeKind = 'line' | 'rectangle' | 'circle';

/** Below this drag size (world units ≈ 150 mm) we treat it as a stray click. */
const MIN_SIZE = 15;
const SKETCH_STROKE = '#475569'; // slate-600
const SKETCH_FILL = 'rgba(100,116,139,0.10)'; // faint slate so the area is hittable

/** Polyline approximation of a circle for the live draft preview. */
function circleOutline(center: Point, radius: number, steps = 48): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    pts.push({ x: center.x + Math.cos(a) * radius, y: center.y + Math.sin(a) * radius });
  }
  return pts;
}

export class ShapeDrawTool extends BaseTool {
  readonly id: string;

  private start: Point | null = null;

  constructor(private readonly kind: BasicShapeKind) {
    super();
    this.id = kind;
  }

  deactivate(): void {
    this.cancel();
  }

  private ui() {
    return useEditorUiStore.getState();
  }

  onPointerDown(e: ToolPointerEvent): void {
    if (e.button !== 0) return;
    const result = snap({ point: e.world, disabled: e.metaOrCtrl });
    this.start = { ...result.point };
  }

  onPointerMove(e: ToolPointerEvent): void {
    // Circles snap freely from the centre; line/rect anchor to the start.
    const result = snap({
      point: e.world,
      anchor: this.kind === 'circle' ? undefined : this.start ?? undefined,
      disabled: e.metaOrCtrl,
    });
    this.ui().setSnapFeedback(result.glyphs, result.guides);
    if (!this.start) return;
    const p = result.point;

    if (this.kind === 'line') {
      const len = Math.hypot(p.x - this.start.x, p.y - this.start.y);
      this.ui().setDraft([this.start, p], p, formatWorldAsMm(len));
    } else if (this.kind === 'rectangle') {
      const label = `${formatWorldAsMm(Math.abs(p.x - this.start.x))} × ${formatWorldAsMm(Math.abs(p.y - this.start.y))}`;
      this.ui().setDraft(
        [this.start, { x: p.x, y: this.start.y }, p, { x: this.start.x, y: p.y }, this.start],
        p,
        label
      );
    } else {
      const radius = Math.hypot(p.x - this.start.x, p.y - this.start.y);
      this.ui().setDraft(circleOutline(this.start, radius), p, `⌀ ${formatWorldAsMm(radius * 2)}`);
    }
  }

  onPointerUp(e: ToolPointerEvent): void {
    if (!this.start) return;
    const result = snap({
      point: e.world,
      anchor: this.kind === 'circle' ? undefined : this.start,
      disabled: e.metaOrCtrl,
    });
    const a = this.start;
    const b = result.point;
    this.cancel();

    if (this.kind === 'line') {
      if (Math.hypot(b.x - a.x, b.y - a.y) < MIN_SIZE) return;
      this.add({ type: 'line', coordinates: { x1: a.x, y1: a.y, x2: b.x, y2: b.y }, strokeColor: SKETCH_STROKE });
      return;
    }
    if (this.kind === 'rectangle') {
      const width = Math.abs(b.x - a.x);
      const height = Math.abs(b.y - a.y);
      if (width < MIN_SIZE || height < MIN_SIZE) return;
      this.add({
        type: 'rectangle',
        coordinates: { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), width, height },
        strokeColor: SKETCH_STROKE,
        color: SKETCH_FILL,
      });
      return;
    }
    // circle
    const radius = Math.hypot(b.x - a.x, b.y - a.y);
    if (radius < MIN_SIZE) return;
    this.add({
      type: 'circle',
      coordinates: { cx: a.x, cy: a.y, radius },
      strokeColor: SKETCH_STROKE,
      color: SKETCH_FILL,
    });
  }

  private add(partial: Pick<FloorMapShape, 'type' | 'coordinates'> & Partial<FloorMapShape>): void {
    // Stay on the draw tool so several sketch shapes can be laid down in a row,
    // then switched to Välj and grouped into one "eget objekt".
    execute('shape.add', { shape: { strokeWidth: 1.5, ...partial } });
  }

  onKeyDown(e: KeyboardEvent): boolean {
    if (e.key === 'Escape' && this.start) {
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

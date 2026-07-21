/**
 * SnapEngine — the single snapping entry point for all v2 editor tools.
 *
 * Providers in priority order: endpoint/junction → midpoint → alignment
 * guides → ortho/45° constraint → grid. Thresholds are zoom-aware (defined in
 * screen px, converted to world units per call). The result carries visual
 * feedback (glyphs + guides) so the overlay renders exactly what snapped.
 */

import { FloorMapShape, LineCoordinates } from '../../types';
import { useFloorMapStore } from '../../store';
import { formatWorldAsMm } from '../core/units';
import { Point, SnapGlyph, SnapGuideLine } from '../state/uiStore';

export interface SnapInput {
  /** Raw pointer position in world coords. */
  point: Point;
  /** Anchor for ortho/45 constraint (e.g. previous polyline vertex). */
  anchor?: Point;
  /** Hold-key override: disable all snapping (Cmd/Ctrl held). */
  disabled?: boolean;
  /** Force ortho to anchor (Shift held). */
  forceOrtho?: boolean;
  /** Shape ids to ignore (e.g. the shape being dragged). */
  ignoreIds?: string[];
}

export interface SnapResult {
  point: Point;
  glyphs: SnapGlyph[];
  guides: SnapGuideLine[];
}

// Thresholds in screen px
const ENDPOINT_PX = 12;
const MIDPOINT_PX = 10;
const ALIGN_PX = 8;
const ORTHO_SNAP_DEG = 7; // auto-snap to 0/45/90 within this many degrees

const wallLines = (shapes: FloorMapShape[], planId: string | null, ignore: Set<string>) =>
  shapes.filter(
    (s): s is FloorMapShape & { coordinates: LineCoordinates } =>
      (s.type === 'wall' || s.type === 'line') &&
      !!s.coordinates &&
      'x1' in (s.coordinates as object) &&
      (!planId || s.planId === planId) &&
      !ignore.has(s.id)
  );

export function snap(input: SnapInput): SnapResult {
  const state = useFloorMapStore.getState();
  const { zoom } = state.viewState;
  const planId = state.currentPlanId;
  const snapEnabled = state.projectSettings.snapEnabled && !input.disabled;
  const ignore = new Set(input.ignoreIds ?? []);

  let point: Point = { ...input.point };
  const glyphs: SnapGlyph[] = [];
  const guides: SnapGuideLine[] = [];

  // 1. Angle constraint relative to anchor (applied first; positional snaps
  //    then project onto the constrained ray).
  let constrainedAngle: number | null = null;
  if (input.anchor) {
    const dx = point.x - input.anchor.x;
    const dy = point.y - input.anchor.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0) {
      const angle = Math.atan2(dy, dx);
      const step = Math.PI / 4; // 45°
      const snapped = Math.round(angle / step) * step;
      const deviation = Math.abs(angle - snapped) * (180 / Math.PI);
      if (input.forceOrtho || (snapEnabled && deviation < ORTHO_SNAP_DEG)) {
        constrainedAngle = snapped;
        point = {
          x: input.anchor.x + Math.cos(snapped) * dist,
          y: input.anchor.y + Math.sin(snapped) * dist,
        };
      }
    }
  }

  if (!snapEnabled) {
    return { point, glyphs, guides };
  }

  const lines = wallLines(state.shapes, planId, ignore);
  const endpointThreshold = ENDPOINT_PX / zoom;
  const midpointThreshold = MIDPOINT_PX / zoom;
  const alignThreshold = ALIGN_PX / zoom;

  const projectOntoConstraint = (p: Point): Point => {
    if (constrainedAngle === null || !input.anchor) return p;
    const ux = Math.cos(constrainedAngle);
    const uy = Math.sin(constrainedAngle);
    const t = (p.x - input.anchor.x) * ux + (p.y - input.anchor.y) * uy;
    return { x: input.anchor.x + ux * t, y: input.anchor.y + uy * t };
  };

  // 2. Endpoint snap (strongest positional snap; wins outright and may break
  //    the angle constraint — closing a loop beats staying orthogonal).
  let best: { p: Point; d: number; kind: SnapGlyph['kind'] } | null = null;
  for (const line of lines) {
    const c = line.coordinates;
    for (const p of [
      { x: c.x1, y: c.y1 },
      { x: c.x2, y: c.y2 },
    ]) {
      const d = Math.hypot(p.x - point.x, p.y - point.y);
      if (d < endpointThreshold && (!best || d < best.d)) {
        best = { p, d, kind: 'endpoint' };
      }
    }
  }

  // 3. Midpoint snap
  if (!best) {
    for (const line of lines) {
      const c = line.coordinates;
      const mid = { x: (c.x1 + c.x2) / 2, y: (c.y1 + c.y2) / 2 };
      const d = Math.hypot(mid.x - point.x, mid.y - point.y);
      if (d < midpointThreshold && (!best || d < best.d)) {
        best = { p: mid, d, kind: 'midpoint' };
      }
    }
  }

  if (best) {
    glyphs.push({ kind: best.kind, at: best.p });
    return { point: best.p, glyphs, guides };
  }

  // 4. Alignment guides: align x/y with existing endpoints (extension lines).
  let alignedX: { value: number; ref: Point } | null = null;
  let alignedY: { value: number; ref: Point } | null = null;
  for (const line of lines) {
    const c = line.coordinates;
    for (const p of [
      { x: c.x1, y: c.y1 },
      { x: c.x2, y: c.y2 },
    ]) {
      const dxAbs = Math.abs(p.x - point.x);
      const dyAbs = Math.abs(p.y - point.y);
      if (dxAbs < alignThreshold && (!alignedX || dxAbs < Math.abs(alignedX.value - point.x))) {
        alignedX = { value: p.x, ref: p };
      }
      if (dyAbs < alignThreshold && (!alignedY || dyAbs < Math.abs(alignedY.value - point.y))) {
        alignedY = { value: p.y, ref: p };
      }
    }
  }

  if (constrainedAngle === null) {
    if (alignedX) {
      point = { ...point, x: alignedX.value };
      guides.push({
        from: alignedX.ref,
        to: point,
        distanceLabel: formatWorldAsMm(Math.hypot(point.x - alignedX.ref.x, point.y - alignedX.ref.y)),
      });
      glyphs.push({ kind: 'alignment', at: { ...point } });
    }
    if (alignedY) {
      point = { ...point, y: alignedY.value };
      guides.push({
        from: alignedY.ref,
        to: point,
        distanceLabel: formatWorldAsMm(Math.hypot(point.x - alignedY.ref.x, point.y - alignedY.ref.y)),
      });
      glyphs.push({ kind: 'alignment', at: { ...point } });
    }
  }

  // 5. Grid snap (weakest). Project back onto the angle constraint if active.
  const gridWorld = state.projectSettings.gridInterval * (state.scaleSettings.pixelsPerMm || 0.1);
  if (gridWorld > 0 && !alignedX && !alignedY) {
    const snappedToGrid = {
      x: Math.round(point.x / gridWorld) * gridWorld,
      y: Math.round(point.y / gridWorld) * gridWorld,
    };
    point = projectOntoConstraint(snappedToGrid);
  }

  return { point, glyphs, guides };
}

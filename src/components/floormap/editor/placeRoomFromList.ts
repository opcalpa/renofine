/**
 * Pre-place an unplaced project room on the canvas (from the room-details
 * "Placera på planritningen" link).
 *
 * Drops a rectangle of walls sized from the room's known area (4:3 aspect,
 * default 4×3 m) at the view center, plus the room shape carrying the real
 * roomId — the auto-room reconciler then adopts the wall loop onto it, so
 * the user can immediately drag corners to adjust and every edit syncs back
 * to the rooms row. One transaction → one undo step.
 */

import { useFloorMapStore } from '../store';
import { execute, transaction } from './core/commands';
import { mmToWorld } from './core/units';
import { FloorMapShape, LineCoordinates } from '../types';

export interface PlaceRoomRequest {
  roomId: string;
  name: string;
  color?: string | null;
  areaSqm?: number | null;
}

interface Point {
  x: number;
  y: number;
}

function rectOverlapsWalls(
  left: number,
  top: number,
  w: number,
  h: number,
  shapes: FloorMapShape[],
  planId: string | null
): boolean {
  for (const shape of shapes) {
    if (shape.type !== 'wall') continue;
    if (planId && shape.planId && shape.planId !== planId) continue;
    const c = shape.coordinates as LineCoordinates;
    if (!c || c.x1 === undefined) continue;
    const minX = Math.min(c.x1, c.x2);
    const maxX = Math.max(c.x1, c.x2);
    const minY = Math.min(c.y1, c.y2);
    const maxY = Math.max(c.y1, c.y2);
    if (minX < left + w && maxX > left && minY < top + h && maxY > top) return true;
  }
  return false;
}

export function placeRoomOnPlan(request: PlaceRoomRequest, viewCenter: Point): FloorMapShape | null {
  const store = useFloorMapStore.getState();

  // Size from known area (4:3), fallback 4×3 m; snap dimensions to 100 mm.
  const areaSqm = request.areaSqm && request.areaSqm > 0.5 ? request.areaSqm : 12;
  const widthMm = Math.round(Math.sqrt((areaSqm * 1_000_000 * 4) / 3) / 100) * 100;
  const heightMm = Math.round((areaSqm * 1_000_000) / widthMm / 100) * 100;
  const w = mmToWorld(widthMm);
  const h = mmToWorld(heightMm);

  // Start at view center (grid-snapped); nudge right until clear of walls.
  const grid = mmToWorld(store.projectSettings.gridInterval || 100);
  let left = Math.round((viewCenter.x - w / 2) / grid) * grid;
  const top = Math.round((viewCenter.y - h / 2) / grid) * grid;
  for (
    let tries = 0;
    tries < 6 && rectOverlapsWalls(left, top, w, h, store.shapes, store.currentPlanId);
    tries++
  ) {
    left += w + mmToWorld(500);
  }

  const corners: Point[] = [
    { x: left, y: top },
    { x: left + w, y: top },
    { x: left + w, y: top + h },
    { x: left, y: top + h },
  ];

  return transaction('Placera rum', () => {
    const roomShape = execute('shape.add', {
      shape: {
        type: 'room',
        coordinates: { points: corners },
        name: request.name,
        roomId: request.roomId,
        color: request.color ?? undefined,
        area: parseFloat(areaSqm.toFixed(2)),
        zIndex: -10,
      },
    });
    // Closed wall loop around it — the reconciler adopts the face onto the
    // room shape above (same centroid & area), keeping roomId/name.
    execute('wall.draw', { points: [...corners, corners[0]] });
    return roomShape;
  });
}

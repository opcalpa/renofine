/**
 * Inline wall-length editor — opens when a wall's dimension label is clicked.
 *
 * Typing a new mm value moves the wall's freer endpoint (the one shared with
 * fewer walls) via junction.move, so connected walls follow and rooms
 * reconcile — the dimension-chain behavior: click a measurement, type the
 * real one, the plan adapts.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { FloorMapShape, LineCoordinates } from '../types';
import { useFloorMapStore } from '../store';
import { useEditorUiStore } from './state/uiStore';
import { execute, transaction, JUNCTION_EPSILON } from './core/commands';
import { mmToWorld, worldToMm } from './core/units';

function endpointConnections(shapes: FloorMapShape[], p: { x: number; y: number }): number {
  return shapes.filter(
    (s) =>
      s.type === 'wall' &&
      s.coordinates &&
      'x1' in (s.coordinates as object) &&
      ((): boolean => {
        const c = s.coordinates as LineCoordinates;
        return (
          Math.hypot(c.x1 - p.x, c.y1 - p.y) < JUNCTION_EPSILON ||
          Math.hypot(c.x2 - p.x, c.y2 - p.y) < JUNCTION_EPSILON
        );
      })()
  ).length;
}

export const WallLengthEditor = () => {
  const wallLengthEditId = useEditorUiStore((s) => s.wallLengthEditId);
  const shapes = useFloorMapStore((s) => s.shapes);
  const viewState = useFloorMapStore((s) => s.viewState);
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');

  const wall = useMemo(
    () => shapes.find((s) => s.id === wallLengthEditId && s.type === 'wall') ?? null,
    [shapes, wallLengthEditId]
  );

  const current = useMemo(() => {
    if (!wall) return null;
    const c = wall.coordinates as LineCoordinates;
    const length = Math.hypot(c.x2 - c.x1, c.y2 - c.y1);
    return {
      c,
      lengthMM: Math.round(worldToMm(length)),
      mid: {
        x: ((c.x1 + c.x2) / 2) * viewState.zoom + viewState.panX,
        y: ((c.y1 + c.y2) / 2) * viewState.zoom + viewState.panY,
      },
    };
  }, [wall, viewState]);

  useEffect(() => {
    if (current) {
      setValue(String(current.lengthMM));
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [wallLengthEditId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!wall || !current) return null;

  const close = () => useEditorUiStore.getState().setWallLengthEditId(null);

  const commitLength = () => {
    const lengthMM = parseInt(value, 10);
    if (!Number.isFinite(lengthMM) || lengthMM < 10 || lengthMM === current.lengthMM) {
      close();
      return;
    }
    const { c } = current;
    const a = { x: c.x1, y: c.y1 };
    const b = { x: c.x2, y: c.y2 };
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length === 0) {
      close();
      return;
    }
    const freshShapes = useFloorMapStore.getState().shapes;
    // Move the freer endpoint so junctions (and their rooms) stay intact.
    const moveEnd = endpointConnections(freshShapes, b) <= endpointConnections(freshShapes, a);
    const from = moveEnd ? b : a;
    const anchor = moveEnd ? a : b;
    const u = { x: (from.x - anchor.x) / length, y: (from.y - anchor.y) / length };
    const target = {
      x: anchor.x + u.x * mmToWorld(lengthMM),
      y: anchor.y + u.y * mmToWorld(lengthMM),
    };
    transaction('Sätt vägglängd', () => {
      execute('junction.move', { at: from, to: target });
      execute('shape.update', {
        id: wall.id,
        updates: { metadata: { ...wall.metadata, lengthMM } },
      });
    });
    close();
  };

  return (
    <div
      className="absolute z-30"
      style={{ left: current.mid.x, top: current.mid.y, transform: 'translate(-50%, -130%)' }}
    >
      <div className="flex items-center gap-1 rounded-md border bg-white px-1.5 py-1 shadow-lg">
        <input
          ref={inputRef}
          type="number"
          autoFocus
          className="h-7 w-20 rounded border px-1.5 text-right text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          value={value}
          min={10}
          step={10}
          data-testid="wall-length-input"
          onChange={(e) => setValue(e.target.value)}
          onBlur={commitLength}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') commitLength();
            if (e.key === 'Escape') close();
          }}
        />
        <span className="text-xs text-gray-500">mm</span>
      </div>
    </div>
  );
};

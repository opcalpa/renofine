/**
 * ZoomPanSvg — wraps an SVG with pinch / drag / wheel / button zoom + pan (W2).
 * Uses a CSS transform on a wrapping div (not the SVG viewBox) so markers inside
 * stay clickable and hit-testing keeps working. A gesture that pans/pinches
 * suppresses the trailing marker click (so panning never selects an object).
 *
 * touch-action is relaxed to pan-y when not zoomed, so a one-finger drag still
 * scrolls the page until the worker explicitly zooms in.
 */
import { useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent, type MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Minus, Maximize2 } from "lucide-react";

const MIN_SCALE = 1;
const MAX_SCALE = 6;

interface ZoomPanSvgProps {
  viewBox: string;
  className?: string;
  maxHeight?: number;
  children: ReactNode;
}

export function ZoomPanSvg({ viewBox, className, maxHeight = 220, children }: ZoomPanSvgProps) {
  const { t } = useTranslation();
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchDist = useRef<number | null>(null);
  const didGesture = useRef(false);
  const moved = useRef(0);

  const clamp = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

  const rel = (clientX: number, clientY: number) => {
    const r = containerRef.current?.getBoundingClientRect();
    return { x: clientX - (r?.left ?? 0), y: clientY - (r?.top ?? 0) };
  };

  // Zoom by `factor`, keeping the point (cx,cy) (container-relative px) stationary.
  const zoomAround = (factor: number, cx: number, cy: number) => {
    setTransform((prev) => {
      const scale = clamp(prev.scale * factor);
      if (scale === MIN_SCALE) return { scale: 1, x: 0, y: 0 };
      const f = scale / prev.scale;
      return { scale, x: cx - (cx - prev.x) * f, y: cy - (cy - prev.y) * f };
    });
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    try {
      containerRef.current?.setPointerCapture?.(e.pointerId);
    } catch {
      // ignore (e.g. synthetic events with no real pointer id)
    }
    pointers.current.set(e.pointerId, rel(e.clientX, e.clientY));
    moved.current = 0;
    didGesture.current = false;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchDist.current = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const prev = pointers.current.get(e.pointerId)!;
    const cur = rel(e.clientX, e.clientY);
    pointers.current.set(e.pointerId, cur);

    if (pointers.current.size === 2 && pinchDist.current != null) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist.current > 0) {
        zoomAround(dist / pinchDist.current, (a.x + b.x) / 2, (a.y + b.y) / 2);
      }
      pinchDist.current = dist;
      didGesture.current = true;
      return;
    }

    if (pointers.current.size === 1 && transform.scale > 1) {
      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      moved.current += Math.abs(dx) + Math.abs(dy);
      if (moved.current > 6) didGesture.current = true;
      setTransform((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
    }
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchDist.current = null;
  };

  const onWheel = (e: ReactWheelEvent) => {
    e.preventDefault();
    const { x, y } = rel(e.clientX, e.clientY);
    zoomAround(e.deltaY < 0 ? 1.15 : 1 / 1.15, x, y);
  };

  // Capture phase: swallow the click that ends a pan/pinch so it never selects a marker.
  const onClickCapture = (e: ReactMouseEvent) => {
    if (didGesture.current) {
      e.stopPropagation();
      didGesture.current = false;
    }
  };

  const zoomButton = (factor: number) => {
    const el = containerRef.current;
    zoomAround(factor, (el?.clientWidth ?? 0) / 2, (el?.clientHeight ?? 0) / 2);
  };

  const interactive = transform.scale > 1;

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="overflow-hidden rounded"
        style={{ maxHeight, touchAction: interactive ? "none" : "pan-y" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onClickCapture={onClickCapture}
      >
        <div
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transformOrigin: "0 0",
            cursor: interactive ? "grab" : "default",
          }}
        >
          <svg
            viewBox={viewBox}
            className={className}
            style={{ width: "100%", display: "block", maxHeight }}
            preserveAspectRatio="xMidYMid meet"
          >
            {children}
          </svg>
        </div>
      </div>

      <div className="absolute right-1 top-1 flex flex-col gap-1">
        <button
          type="button"
          aria-label={t("roomItems.zoomIn", "Zoom in")}
          onClick={() => zoomButton(1.4)}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background/90 text-foreground shadow-sm backdrop-blur-sm hover:bg-muted"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label={t("roomItems.zoomOut", "Zoom out")}
          onClick={() => zoomButton(1 / 1.4)}
          disabled={!interactive}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background/90 text-foreground shadow-sm backdrop-blur-sm hover:bg-muted disabled:opacity-40"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        {interactive && (
          <button
            type="button"
            aria-label={t("roomItems.resetZoom", "Reset view")}
            onClick={() => setTransform({ scale: 1, x: 0, y: 0 })}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background/90 text-foreground shadow-sm backdrop-blur-sm hover:bg-muted"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

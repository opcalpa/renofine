import { useEffect, useRef, useState } from "react";

/**
 * Tracks vertical scroll direction and returns whether a sticky header
 * should be hidden: hide while scrolling down, reveal while scrolling up,
 * always show near the top.
 *
 * The app has multiple scroll containers (an inner overflow:auto div and
 * the window) and which one scrolls isn't known up front. Instead of
 * pre-detecting a container, this listens to scroll events on `document`
 * in the capture phase, so it reacts to whichever element actually
 * scrolls. Scroll position is tracked per source.
 */
export function useScrollDirection(options?: {
  threshold?: number;
  topOffset?: number;
}): boolean {
  const threshold = options?.threshold ?? 8;
  const topOffset = options?.topOffset ?? 64;
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(new WeakMap<object, number>());
  const winLastY = useRef(0);

  useEffect(() => {
    const onScroll = (e: Event) => {
      const target = e.target;
      let y: number;
      let prev: number;

      if (target instanceof HTMLElement && target !== document.documentElement) {
        y = target.scrollTop;
        prev = lastY.current.get(target) ?? 0;
        lastY.current.set(target, y);
      } else {
        y = window.scrollY;
        prev = winLastY.current;
        winLastY.current = y;
      }

      const delta = y - prev;
      if (Math.abs(delta) < threshold) return;
      setHidden(y < topOffset ? false : delta > 0);
    };

    document.addEventListener("scroll", onScroll, {
      capture: true,
      passive: true,
    });
    return () =>
      document.removeEventListener("scroll", onScroll, { capture: true });
  }, [threshold, topOffset]);

  return hidden;
}

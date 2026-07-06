import { useEffect, useState } from "react";

/**
 * Tracks the visual viewport height (and top offset) while `active`.
 *
 * On iOS Safari the on-screen keyboard overlays `position:fixed` elements
 * without resizing them — a full-screen panel keeps its input row hidden
 * behind the keyboard. Sizing the panel to the visual viewport keeps the
 * input visible. Returns null when inactive or unsupported (use CSS height).
 */
export function useVisualViewportHeight(active: boolean): { height: number; offsetTop: number } | null {
  const [box, setBox] = useState<{ height: number; offsetTop: number } | null>(null);

  useEffect(() => {
    if (!active || typeof window === "undefined" || !window.visualViewport) {
      setBox(null);
      return;
    }
    const vv = window.visualViewport;
    const update = () => {
      // Only report when the keyboard actually shrinks the viewport — otherwise
      // let CSS (100dvh) own the height so URL-bar collapse stays smooth.
      const shrunk = window.innerHeight - vv.height > 50;
      setBox(shrunk ? { height: vv.height, offsetTop: vv.offsetTop } : null);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      setBox(null);
    };
  }, [active]);

  return box;
}

/**
 * v2 editor feature flag.
 *
 * Desktop-first default (2026-08): with no explicit choice, v2 is the default
 * editor on desktop and v1 stays on mobile (v2 has no mobile toolbar yet).
 * Explicit overrides, both persisted and sticky:
 *   ?editor=v2  → force v2   (or localStorage 'renofine.editorV2' = '1')
 *   ?editor=v1  → force v1   (localStorage 'renofine.editorV2' = '0')
 */

const STORAGE_KEY = 'renofine.editorV2';
const MOBILE_BREAKPOINT = 768; // matches useIsMobile

/** v2 has no mobile UI yet, so mobile viewports fall back to v1 by default. */
function isMobileViewport(): boolean {
  try {
    return (
      window.matchMedia?.(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches ??
      window.innerWidth < MOBILE_BREAKPOINT
    );
  } catch {
    return false;
  }
}

export function isEditorV2Enabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const param = new URLSearchParams(window.location.search).get('editor');
    if (param === 'v2') {
      localStorage.setItem(STORAGE_KEY, '1');
      return true;
    }
    if (param === 'v1') {
      // Sticky opt-out so the choice survives later visits without the param.
      localStorage.setItem(STORAGE_KEY, '0');
      return false;
    }
    // v2 has no touch gesture model yet (single-finger drags shapes instead of
    // panning; no pinch-zoom), so mobile viewports ALWAYS use v1 unless an
    // explicit ?editor=v2 forced it above. A previously-stored '1' — set on
    // desktop, or from testing v2 once on this phone — must not trap mobile in
    // a touch-less editor where walls move under your finger. (v1's
    // useCanvasNavigation pans on empty-canvas drag and pinch-zooms.)
    if (isMobileViewport()) return false;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === '1') return true;
    if (stored === '0') return false;
    // Desktop, no explicit choice → v2 default.
    return true;
  } catch {
    return false;
  }
}

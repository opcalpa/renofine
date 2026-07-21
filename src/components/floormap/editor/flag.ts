/**
 * v2 editor feature flag.
 *
 * Opt-in during the rebuild: enable with ?editor=v2 (persisted) or
 * localStorage.setItem('renofine.editorV2', '1'); disable with ?editor=v1.
 * Default flips to v2 when phase 1 reaches rendering parity.
 */

const STORAGE_KEY = 'renofine.editorV2';

export function isEditorV2Enabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const param = new URLSearchParams(window.location.search).get('editor');
    if (param === 'v2') {
      localStorage.setItem(STORAGE_KEY, '1');
      return true;
    }
    if (param === 'v1') {
      localStorage.removeItem(STORAGE_KEY);
      return false;
    }
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

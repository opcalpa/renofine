/**
 * Last-used library objects (P2 context menu): a tiny localStorage-backed
 * MRU list so the right-click menu can offer "place another X" instantly.
 */

const KEY = 'renofine.recentObjects';
const MAX = 3;

export function getRecentObjectIds(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string').slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function pushRecentObject(definitionId: string): void {
  try {
    const next = [definitionId, ...getRecentObjectIds().filter((id) => id !== definitionId)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable — MRU is a nicety, never an error
  }
}

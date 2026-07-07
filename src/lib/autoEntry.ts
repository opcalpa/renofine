/**
 * Auto-entry (Carl 2026-07-07): a fresh app load that lands on the start page
 * continues straight into the user's most relevant project — last visited,
 * falling back to newest. The start page stays reachable: only the initial
 * load redirects, explicit in-app navigation to Start stays put.
 */
const initialPath = typeof window !== "undefined" ? window.location.pathname : "";
let consumed = false;

const LAST_PROJECT_KEY = "rf-last-project";

/**
 * True exactly once per app load, and only when the app was opened at the
 * start page (or root). Callers must check this AFTER their data is ready —
 * the first call wins whether or not it redirects.
 */
export function consumeAutoEntry(): boolean {
  if (consumed) return false;
  consumed = true;
  return initialPath === "/" || initialPath === "/start" || initialPath === "/projects";
}

export function rememberLastProject(projectId: string): void {
  try {
    localStorage.setItem(LAST_PROJECT_KEY, projectId);
  } catch {
    /* private mode */
  }
}

export function getLastProjectId(): string | null {
  try {
    return localStorage.getItem(LAST_PROJECT_KEY);
  } catch {
    return null;
  }
}

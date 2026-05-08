import { ComponentType, lazy } from "react";

/**
 * Lazy import with retry on chunk-load failure.
 *
 * When a new build is deployed, browsers with the previous index.html cached
 * still reference old chunk filenames (e.g. `DashboardRedesign-abc123.js`).
 * Those chunks are gone from the CDN, so the dynamic import throws
 * "Failed to fetch dynamically imported module" and Suspense locks the UI.
 *
 * This helper:
 * 1. Retries the import once after a short delay.
 * 2. On permanent failure, runs `onPermanentFail` (e.g. clear a sticky toggle
 *    in localStorage) and reloads the page so the browser fetches the fresh
 *    index.html with the correct chunk hashes.
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  importer: () => Promise<{ default: T }>,
  onPermanentFail?: () => void,
) {
  return lazy(async () => {
    try {
      return await importer();
    } catch (firstErr) {
      // Wait a beat — the deployment may still be propagating.
      await new Promise((r) => setTimeout(r, 800));
      try {
        return await importer();
      } catch {
        // Permanent failure: clean up sticky state and force a fresh page load.
        try { onPermanentFail?.(); } catch { /* ignore cleanup errors */ }
        if (typeof window !== "undefined" && !sessionStorage.getItem("rf_chunk_reload")) {
          sessionStorage.setItem("rf_chunk_reload", "1");
          window.location.reload();
        }
        throw firstErr;
      }
    }
  });
}

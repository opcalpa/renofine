/**
 * /capture — the PWA landing pad for shared files and home-screen shortcuts.
 *
 * Two entry modes:
 * - ?shared=1  (from the service worker's /share-target redirect): reads the
 *   stashed files out of the Cache API, hands them to Renaida via the store
 *   (same D1 flow as the paperclip button) and opens the panel.
 * - ?intent=receipt|voice (manifest shortcuts): just opens the panel on /start —
 *   the entry chips are one tap away (file pickers/mic need a user gesture, so
 *   the shortcut cannot start them itself).
 *
 * Deliberately public (no RequireAuth): the page only moves bytes into memory
 * and navigates; every action after that goes through the app's normal auth.
 */

import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useRenaidaStore } from "@/stores/renaidaStore";

const SHARE_CACHE = "renofine-shared-v1";

async function readSharedFiles(): Promise<File[]> {
  if (typeof caches === "undefined") return [];
  try {
    const cache = await caches.open(SHARE_CACHE);
    const metaRes = await cache.match("/shared/meta");
    if (!metaRes) return [];
    const meta = (await metaRes.json()) as { count?: number };
    const files: File[] = [];
    for (let i = 0; i < (meta.count ?? 0); i++) {
      const res = await cache.match(`/shared/file-${i}`);
      if (!res) continue;
      const blob = await res.blob();
      const name = decodeURIComponent(res.headers.get("X-File-Name") || `delad-fil-${i}`);
      files.push(new File([blob], name, { type: blob.type }));
    }
    // Consume-once: clear the stash so a later visit doesn't re-import.
    await caches.delete(SHARE_CACHE);
    return files;
  } catch {
    return [];
  }
}

export default function Capture() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    void (async () => {
      const store = useRenaidaStore.getState();
      if (searchParams.get("shared")) {
        const files = await readSharedFiles();
        if (files.length > 0) store.setPendingShareFiles(files);
      }
      store.setPanelOpen(true);
      navigate("/start", { replace: true });
    })();
  }, [navigate, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

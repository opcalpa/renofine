/**
 * Renofine service worker — share-target relay ONLY.
 *
 * Deliberately does NO caching/offline: the app deploys as a normal SPA and a
 * caching worker would add stale-bundle risk for zero need. This worker exists
 * for one thing: the PWA share sheet ("dela till Renofine" on Android/desktop)
 * POSTs the shared photo/PDF to /share-target, we stash it in the Cache API
 * and bounce to /capture, where the app hands it straight to Renaida (D1).
 */
const SHARE_CACHE = "renofine-shared-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "POST" || url.pathname !== "/share-target") return;

  event.respondWith(
    (async () => {
      try {
        const form = await event.request.formData();
        const files = form.getAll("media").filter((f) => typeof f === "object" && f.size > 0);
        const cache = await caches.open(SHARE_CACHE);
        await cache.put(
          "/shared/meta",
          new Response(
            JSON.stringify({
              count: files.length,
              title: String(form.get("title") || ""),
              text: String(form.get("text") || ""),
              at: Date.now(),
            }),
            { headers: { "Content-Type": "application/json" } }
          )
        );
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          await cache.put(
            `/shared/file-${i}`,
            new Response(f, {
              headers: {
                "Content-Type": f.type || "application/octet-stream",
                "X-File-Name": encodeURIComponent(f.name || `delad-fil-${i}`),
              },
            })
          );
        }
      } catch {
        // Fail-open: /capture simply finds nothing to import.
      }
      return Response.redirect("/capture?shared=1", 303);
    })()
  );
});

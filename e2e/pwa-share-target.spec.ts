import { test, expect } from '@playwright/test';

/**
 * PWA share-target mechanics (mobil-skiva b): the no-cache service worker
 * intercepts POST /share-target, stashes the shared file in the Cache API and
 * bounces to /capture, which hands the file to Renaida (panel opens, the D1
 * document flow takes over). Driven end-to-end in-browser — no Android needed.
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'renofine_guest_mode',
      JSON.stringify({ isGuest: true, guestId: 'guest_pwa' }),
    );
    localStorage.setItem('i18nextLng', 'sv');
    localStorage.setItem('guest_onboarding_completed', 'true');
    localStorage.setItem('guest_user_type', 'homeowner');
  });
});

test('manifest is linked and reachable with share_target + shortcuts', async ({ page }) => {
  await page.goto('/start');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBe('/manifest.webmanifest');
  const manifest = await page.evaluate(async () => (await fetch('/manifest.webmanifest')).json());
  expect(manifest.share_target?.action).toBe('/share-target');
  expect(manifest.share_target?.params?.files?.[0]?.name).toBe('media');
  expect(Array.isArray(manifest.shortcuts)).toBe(true);
  expect(manifest.icons?.length).toBeGreaterThanOrEqual(2);
});

test('service worker stashes a shared file and /capture hands it to Renaida', async ({ page }) => {
  await page.goto('/start');
  await expect(page.getByRole('heading', { name: 'Mina projekt' })).toBeVisible({ timeout: 25000 });

  // Wait until the share-relay worker controls the page.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
    }
  });

  // Simulate the OS share sheet: POST a file to /share-target (what Android
  // does). The SW must stash it and redirect to /capture.
  const finalUrl = await page.evaluate(async () => {
    const form = new FormData();
    // 1×1 px PNG
    const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    form.append('media', new File([bytes], 'kvitto.png', { type: 'image/png' }));
    form.append('title', 'Kvitto');
    const res = await fetch('/share-target', { method: 'POST', body: form });
    return res.url;
  });
  expect(finalUrl).toContain('/capture?shared=1');

  // The stash exists…
  const stashed = await page.evaluate(async () => {
    const cache = await caches.open('renofine-shared-v1');
    const meta = await cache.match('/shared/meta');
    return meta ? await meta.json() : null;
  });
  expect(stashed?.count).toBe(1);

  // …and navigating to /capture consumes it: panel opens on /start with the
  // shared file appearing in the conversation (the D1 flow takes over from
  // there — its own behavior is covered by existing capture tests).
  await page.goto('/capture?shared=1');
  await page.waitForURL(/\/start/);
  await expect(page.getByText('kvitto.png')).toBeVisible({ timeout: 15000 });

  // Consume-once: the stash is gone.
  const remaining = await page.evaluate(async () => caches.has('renofine-shared-v1'));
  expect(remaining).toBe(false);
});

test('shortcut /capture?intent=receipt opens the panel on /start', async ({ page }) => {
  await page.goto('/capture?intent=receipt');
  await page.waitForURL(/\/start/);
  // Panel is open: the voice hero is the entry's primary CTA.
  await expect(page.getByText('Berätta vad som hänt')).toBeVisible({ timeout: 25000 });
  await expect(page.getByText('Fota kvitto')).toBeVisible();
});

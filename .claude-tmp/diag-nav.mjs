import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.addInitScript(() => {
  localStorage.setItem('renofine_guest_mode', JSON.stringify({ isGuest: true, guestId: 'guest_shot' }));
  localStorage.setItem('i18nextLng', 'sv');
  localStorage.setItem('guest_onboarding_completed', 'true');
  localStorage.setItem('guest_user_type', 'homeowner');
});
await page.goto('http://localhost:5002/start');
await page.getByRole('heading', { name: 'Mina projekt' }).waitFor({ timeout: 25000 });
await page.waitForTimeout(500);
const diag = await page.evaluate(() => {
  const nav = document.querySelector('nav.fixed.bottom-0');
  const btn = nav?.querySelector('button[aria-label="Renaida"]');
  const nb = nav?.getBoundingClientRect(), bb = btn?.getBoundingClientRect();
  const cx = bb ? bb.x + bb.width / 2 : 0, cy = bb ? bb.y + bb.height / 2 : 0;
  const hit = bb ? document.elementFromPoint(cx, cy) : null;
  return {
    vv: { w: window.innerWidth, h: window.innerHeight, vvh: window.visualViewport?.height },
    nav: nb ? { y: nb.y, h: nb.height } : null,
    btn: bb ? { x: bb.x, y: bb.y, w: bb.width, h: bb.height, cx, cy } : null,
    hitAtCenter: hit ? `${hit.tagName}.${String(hit.className).slice(0, 50)}` : null,
    navZ: nav ? getComputedStyle(nav).zIndex : null,
  };
});
console.log(JSON.stringify(diag, null, 2));
await browser.close();

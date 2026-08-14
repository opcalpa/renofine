import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); // no isMobile: pure 390 layout
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
  const wide = [];
  document.querySelectorAll('body *').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width > window.innerWidth + 1 || r.right > window.innerWidth + 1) {
      wide.push(`${el.tagName}.${String(el.className).slice(0, 60)} w=${Math.round(r.width)} right=${Math.round(r.right)}`);
    }
  });
  return { innerWidth: window.innerWidth, scrollWidth: document.documentElement.scrollWidth, wide: wide.slice(0, 8) };
});
console.log(JSON.stringify(diag, null, 2));
await browser.close();

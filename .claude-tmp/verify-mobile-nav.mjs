import { chromium } from '@playwright/test';
const SCRATCH = '/private/tmp/claude-501/-Users-calpa-Developer-Renofine/fe9a3851-2fea-46b9-8b43-9a88e38a50c0/scratchpad';
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
await page.waitForTimeout(800);
await page.screenshot({ path: `${SCRATCH}/mobil-1-start-nav.png` });
// FAB should be GONE on mobile /start; open via the nav center slot instead.
const fabCount = await page.locator('button[aria-label="Renaida"].fixed').count();
console.log('FAB count on /start mobile (expect 0):', fabCount);
await page.getByRole('button', { name: 'Renaida', exact: true }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${SCRATCH}/mobil-2-panel-chips.png` });
console.log('chips:', await page.getByText('Fota kvitto').count(), await page.getByText('Logga tid').count(), await page.getByText('Snabbanteckning').count(), await page.getByText('Statusuppdatering').count());
await browser.close();

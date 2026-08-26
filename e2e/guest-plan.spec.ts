import { test, expect, type Page } from '@playwright/test';

/**
 * The guest's renovation plan — the surplus shown BEFORE the account ask.
 *
 * Two things are worth a test here, and neither of them is the LLM:
 *  1. The landing page's intent survives the navigation into the wizard.
 *  2. Finishing the wizard lands on the PLAN (cost range + ROT + trade order),
 *     not on the old "Projekt skapat" card.
 *
 * So the AI parse is bypassed entirely ("Fyll i stegen själv") and the critic
 * is stubbed empty — the plan's numbers are deterministic by design, and a test
 * that depended on live model output would only ever measure the weather.
 */

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

async function stubCritic(page: Page) {
  await page.route('**/functions/v1/renaida-critic', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 200, headers: CORS_HEADERS, body: 'ok' });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
      body: JSON.stringify({ flags: [] }),
    });
  });
}

test('the landing page carries the visitor intent into the wizard', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'sv'));
  await page.goto('/');

  await page.getByRole('button', { name: 'Badrummet', exact: true }).click();

  // Guest mode is entered silently and the wizard opens with the preset's
  // sentence already in the describe field — no role modal, no language step.
  await page.waitForURL(/\/start/);
  const description = page.locator('textarea').first();
  await expect(description).toHaveValue(/badrummet/i, { timeout: 25000 });

  // Read once: a reload must not replay last week's sentence into a fresh wizard.
  const leftover = await page.evaluate(() => localStorage.getItem('renofine_guest_intent'));
  expect(leftover).toBeNull();
});

test('finishing the wizard shows the plan, not a "project created" card', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'renofine_guest_mode',
      JSON.stringify({ isGuest: true, guestId: 'guest_e2e_plan' }),
    );
    localStorage.setItem('i18nextLng', 'sv');
    localStorage.setItem('guest_onboarding_completed', 'true');
    localStorage.setItem('guest_user_type', 'homeowner');
  });
  await stubCritic(page);

  await page.goto('/start?setup=guided');
  await expect(page.getByText('Berätta om din renovering').first()).toBeVisible({ timeout: 25000 });

  // Skip the AI parse — the plan is deterministic and this test is about it.
  await page.getByRole('button', { name: 'Fyll i stegen själv' }).click();

  await page.getByRole('button', { name: '🛁 Badrum' }).click();
  await page.getByRole('button', { name: 'Nästa' }).click();

  await page.getByRole('button', { name: '🧱 Kakel' }).click();
  await page.getByRole('button', { name: '🚰 VVS' }).click();
  await page.getByRole('button', { name: 'Nästa' }).click();

  // Work matrix: tick each trade against the room.
  const checkboxes = page.getByRole('checkbox');
  const count = await checkboxes.count();
  for (let i = 0; i < count; i++) {
    const box = checkboxes.nth(i);
    if (await box.isChecked()) continue;
    await box.check();
  }
  await page.getByRole('button', { name: 'Nästa' }).click();

  await page.getByRole('button', { name: /Använd detta/ }).click();
  await page.getByRole('button', { name: 'Nästa' }).click();
  await page.getByRole('button', { name: 'Skapa projekt' }).click();

  // The plan, not the old finish card.
  await expect(page.getByRole('heading', { name: 'Rum för rum' })).toBeVisible({ timeout: 25000 });
  await expect(page.getByText('ROT-avdrag')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ordningen yrkena kommer i' })).toBeVisible();

  // A homeowner sees amounts INC VAT — the project's own rule, and the
  // difference between a plan they trust and one that is 25 % short.
  await expect(page.getByText('ink. moms')).toBeVisible();

  // The ask sits where the value is.
  await expect(page.getByRole('button', { name: /Spara planen/ })).toBeVisible();

  // And the way back to it lives in the project.
  await page.getByRole('button', { name: 'Fortsätt utan konto' }).click();
  await page.waitForURL(/\/projects\//);
  await expect(page.getByRole('button', { name: 'Visa hela planen' })).toBeVisible({ timeout: 25000 });

  // The tour must NOT be covering the plan the guest just earned. It used to
  // auto-start here, and in three of five recorded journeys it was the last
  // thing a guest did before leaving. It waits for their first own edit now.
  await page.waitForTimeout(1500);
  await expect(page.getByText('Ditt arbetsomfång')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('guest_planning_edited'))).toBeNull();

  // ...and it does arrive once they have added something of their own.
  await page.getByRole('button', { name: 'Arbete', exact: true }).click();
  await page.getByPlaceholder('t.ex. Riva badrum').fill('Spackling av hallen');
  await page.getByRole('button', { name: 'Lägg till', exact: true }).click();
  await expect(page.getByText('Ditt arbetsomfång')).toBeVisible({ timeout: 15000 });
});

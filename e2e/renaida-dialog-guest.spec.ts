import { test, expect } from '@playwright/test';

/**
 * End-to-end of the Renaida project-creation dialog via the guest path (no
 * credentials): drives the real UI through the guided flow and asserts a
 * project is actually born. The 'other' project type has no add-ons step, so
 * the flow completes without any network (parse/suggest) call.
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'renofine_guest_mode',
      JSON.stringify({ isGuest: true, guestId: 'guest_e2e' }),
    );
    localStorage.setItem('i18nextLng', 'sv');
    // Skip the first-run welcome/language modal so we land straight on Projects.
    localStorage.setItem('guest_onboarding_completed', 'true');
    localStorage.setItem('guest_user_type', 'homeowner');
  });
});

test('guest builds a project through the Renaida dialog', async ({ page }) => {
  await page.goto('/start');
  await expect(page.getByRole('heading', { name: 'Mina projekt' })).toBeVisible({ timeout: 25000 });

  // Open the dialog (icon + span button — match by its visible text).
  await page.getByText('Skapa med Renaida', { exact: true }).click();

  // describe → skip to the guided questions.
  await page.getByRole('button', { name: 'Guida mig i stället' }).click();

  // type → "Annat" (no add-ons step for this type).
  await page.getByRole('button', { name: 'Annat', exact: true }).click();

  // scope (multi-select) → pick one work type, then continue.
  await page.getByRole('button', { name: 'El', exact: true }).click();
  await page.getByRole('button', { name: /Fortsätt/ }).click();

  // A task with its source chip should now be in the live preview.
  await expect(page.getByText('El', { exact: false }).first()).toBeVisible();

  // Skip the remaining optional steps.
  await page.getByRole('button', { name: 'Vet inte än' }).click(); // size
  await page.getByRole('button', { name: 'Hoppa över' }).click(); // address
  await page.getByRole('button', { name: 'Ingen budget än' }).click(); // budget

  // Create → a guest project is born and we navigate into it.
  await page.getByRole('button', { name: 'Skapa projektet' }).click();
  await page.waitForURL(/\/projects\//);

  // The guest project persisted to localStorage.
  const projectCount = await page.evaluate(() => {
    const raw = localStorage.getItem('renofine_guest_projects');
    return raw ? (JSON.parse(raw) as unknown[]).length : 0;
  });
  expect(projectCount).toBeGreaterThan(0);
});

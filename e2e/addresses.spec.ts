import { test, expect } from '@playwright/test';
import { login, requireAuth } from './helpers/auth';

/**
 * Addresses (the property entity, S1–S3).
 *
 * Covers the two things a homeowner actually meets: the address list on /start
 * and the address page that rolls up every renovation on one home.
 *
 * Tolerant by design — an account with no addresses yet is a legitimate state,
 * so the test reports that rather than failing on someone else's data.
 */

const SHOTS = process.env.E2E_SHOT_DIR || 'test-results/addresses';

test.describe('Addresses', () => {
  test.beforeEach(() => {
    requireAuth();
  });

  test('address list on /start leads to an address page with a roll-up', async ({ page }) => {
    await login(page);

    // Auto-entry (autoEntry.ts) redirects a FRESH load of /start into the last
    // visited project. Reach the list the way a user does instead: load a page
    // that does not trigger it, then navigate in-app.
    await page.goto('/tips');
    await page.locator('header').getByText(/^Start$/i).first().click();
    await expect(page).toHaveURL(/\/start/);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${SHOTS}/01-start.png`, fullPage: true });

    const addressLinks = page.locator('a[href^="/addresses/"]');
    const count = await addressLinks.count();

    if (count === 0) {
      // No live projects carrying an address on this account — nothing to open.
      test.skip(true, 'No addresses with live projects on this account');
      return;
    }

    await expect(addressLinks.first()).toBeVisible();
    await addressLinks.first().click();

    await expect(page).toHaveURL(/\/addresses\/[0-9a-f-]{36}/);

    // The timeline is the one section that always renders on a valid address.
    // Assert BEFORE screenshotting — networkidle fires while the page is still
    // showing its loading skeleton.
    await expect(
      page.getByRole('heading', { name: /Renoveringar över tid|Renovations over time/i })
    ).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/02-address.png`, fullPage: true });

    // Back-link works — the page must not be a dead end.
    await page.getByRole('button', { name: /Tillbaka till projekt|Back to projects/i }).first().click();
    await expect(page).toHaveURL(/\/start/);
  });

  test('the edit dialog opens prefilled and cancels without saving', async ({ page }) => {
    await login(page);
    await page.goto('/tips');
    await page.locator('header').getByText(/^Start$/i).first().click();
    await expect(page).toHaveURL(/\/start/);
    await page.waitForLoadState('networkidle');

    const addressLinks = page.locator('a[href^="/addresses/"]');
    if ((await addressLinks.count()) === 0) {
      test.skip(true, 'No addresses with live projects on this account');
      return;
    }
    await addressLinks.first().click();
    await expect(
      page.getByRole('heading', { name: /Renoveringar över tid|Renovations over time/i })
    ).toBeVisible();

    await page.getByRole('button', { name: /Redigera adress|Edit address/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // The name field must carry the property's current name, not be blank.
    await expect(dialog.locator('#prop-name')).not.toHaveValue('');
    await page.screenshot({ path: `${SHOTS}/04-edit.png`, fullPage: true });

    // Cancel only — this runs against a real account and must not mutate it.
    await dialog.getByRole('button', { name: /Avbryt|Cancel/i }).click();
    await expect(dialog).not.toBeVisible();
  });

  test('the owner sees the sharing section with its scope warning', async ({ page }) => {
    await login(page);
    await page.goto('/tips');
    await page.locator('header').getByText(/^Start$/i).first().click();
    await expect(page).toHaveURL(/\/start/);
    await page.waitForLoadState('networkidle');

    const addressLinks = page.locator('a[href^="/addresses/"]');
    if ((await addressLinks.count()) === 0) {
      test.skip(true, 'No addresses with live projects on this account');
      return;
    }
    await addressLinks.first().click();
    await expect(
      page.getByRole('heading', { name: /Vilka når den här adressen|Who reaches this address/i })
    ).toBeVisible();

    // The scope warning is the whole point of the copy — assert it is there.
    await expect(
      page.getByText(/ALLA projekt på den här adressen|ALL projects at this address/i)
    ).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/05-members.png`, fullPage: true });
  });

  test('an unknown address id shows the not-found state instead of crashing', async ({ page }) => {
    await login(page);
    await page.goto('/addresses/00000000-0000-0000-0000-0000000000ff');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${SHOTS}/03-notfound.png`, fullPage: true });

    await expect(
      page.getByText(/Adressen hittades inte|Address not found/i)
    ).toBeVisible();
  });
});

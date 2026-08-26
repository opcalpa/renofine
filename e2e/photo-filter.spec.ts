/**
 * Bilder-sektionens dropdown: EN väljare (Alla/Före/Pågående/Färdigt/
 * Inspiration) i stället för två pills, och verktygen gatade per kategori.
 *
 * Kör mot publika demot som gäst — det har inspirationsbilder men inga
 * fasbilder, vilket också prövar tom-staterna.
 */
import { test, expect, Page } from '@playwright/test';

async function openOverview(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'sv'));
  await page.goto('/');
  await page.getByText('Se demoprojekt').first().click();
  await page.waitForURL(/\/projects\//);
  const guide = page.getByRole('alertdialog');
  const appeared = await guide
    .waitFor({ state: 'visible', timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  if (appeared) await guide.getByRole('button', { name: 'OK' }).click();
  await page.getByTestId('photo-filter').scrollIntoViewIfNeeded();
}

test.describe('Bilder-dropdownen', () => {
  test('erbjuder alla fem kategorierna med antal', async ({ page }) => {
    await openOverview(page);
    await page.getByTestId('photo-filter').click();
    for (const v of ['all', 'before', 'during', 'after', 'inspiration']) {
      await expect(page.getByTestId(`photo-filter-${v}`)).toBeVisible();
    }
    // Demot har inspirationsbilder — antalet är inte noll.
    await expect(page.getByTestId('photo-filter-inspiration')).not.toContainText('(0)');
  });

  test('en tom fas visar en förklaring, inte en tom yta', async ({ page }) => {
    await openOverview(page);
    await page.getByTestId('photo-filter').click();
    await page.getByTestId('photo-filter-before').click();
    await expect(page.getByText('Inga bilder i den här fasen ännu')).toBeVisible({ timeout: 10000 });
  });

  test('moodboard-verktyget hör till Inspiration och följer inte med till Alla', async ({ page }) => {
    await openOverview(page);
    // Inspiration är default — moodboard-togglen (palett-ikonen) ska finnas.
    await page.getByTestId('photo-filter').click();
    await page.getByTestId('photo-filter-inspiration').click();
    const moodboardToggle = page.locator('button[title*="oodboard"], button:has(svg.lucide-palette)').first();
    await expect(moodboardToggle).toBeVisible({ timeout: 10000 });

    await page.getByTestId('photo-filter').click();
    await page.getByTestId('photo-filter-all').click();
    await expect(moodboardToggle).toBeHidden();
  });
});

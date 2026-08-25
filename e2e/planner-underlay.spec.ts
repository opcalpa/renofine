/**
 * Getting a drawing onto the canvas.
 *
 * Two gaps this covers:
 *   B — the planner could only upload a NEW image, so a drawing the project
 *       already held had to be downloaded and uploaded again to be traced.
 *   C — PDFs were rejected outright, even though the rasterizer already
 *       existed for the import path.
 *
 * The demo project is readable by guests (its own storage policy), so the
 * picker has real files to list here — including a PDF.
 */
import { test, expect, Page } from '@playwright/test';
import { openDemoPlanner, countShapes } from './lib/demoPlanner';

/** Playwright resolves relative paths from the project root. */
const FIXTURE_PDF = 'e2e/fixtures/tvasidig-ritning.pdf';

async function openUnderlayMenu(page: Page): Promise<void> {
  await page.getByTestId('tool-underlay').click();
}

test.describe('Underlag på canvasen', () => {
  test('menyn erbjuder både projektets filer och en ny uppladdning', async ({ page }) => {
    await openDemoPlanner(page, { blank: true });
    await openUnderlayMenu(page);

    await expect(page.getByTestId('underlay-from-project')).toBeVisible();
    await expect(page.getByTestId('underlay-upload')).toBeVisible();
  });

  test('väljaren listar ritningar som redan finns i projektet', async ({ page }) => {
    await openDemoPlanner(page, { blank: true });
    await openUnderlayMenu(page);
    await page.getByTestId('underlay-from-project').click();

    await expect(page.getByTestId('underlay-picker')).toBeVisible({ timeout: 15000 });
    // The demo ships images and a PDF under its own storage prefix.
    await expect
      .poll(async () => page.getByTestId('underlay-candidate').count(), { timeout: 15000 })
      .toBeGreaterThan(0);
  });

  test('en bild ur projektets filer hamnar som lager utan ny uppladdning', async ({ page }) => {
    await openDemoPlanner(page, { blank: true });
    const before = await countShapes(page, 'image');

    await openUnderlayMenu(page);
    await page.getByTestId('underlay-from-project').click();
    await expect(page.getByTestId('underlay-picker')).toBeVisible({ timeout: 15000 });

    // Pick by NAME, not by thumbnail: the thumbnail is a signed transform that
    // may or may not be available to a guest, and an image is an image either
    // way. An image is referenced where it lies rather than copied.
    const candidates = page.getByTestId('underlay-candidate');
    await expect.poll(async () => candidates.count(), { timeout: 15000 }).toBeGreaterThan(0);

    const count = await candidates.count();
    let picked = false;
    for (let i = 0; i < count; i++) {
      const c = candidates.nth(i);
      const label = (await c.innerText()).toLowerCase();
      if (/\.(png|jpe?g|webp)\b/.test(label)) {
        await c.click();
        picked = true;
        break;
      }
    }
    expect(picked, 'demoprojektet ska ha minst en bild att välja').toBe(true);

    // Asserting the DELTA, not a total: the demo has its own geometry.
    await expect
      .poll(async () => countShapes(page, 'image'), { timeout: 15000 })
      .toBe(before + 1);
  });

  test('en flersidig PDF frågar vilken sida innan något läggs in', async ({ page }) => {
    await openDemoPlanner(page, { blank: true });
    const before = await countShapes(page, 'image');

    await openUnderlayMenu(page);
    // The input is hidden by design; setInputFiles does not need it visible.
    await page.locator('input[type="file"]').setInputFiles(FIXTURE_PDF);

    await expect(page.getByTestId('underlay-page-dialog')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('underlay-page-1')).toBeVisible();
    await expect(page.getByTestId('underlay-page-2')).toBeVisible();
    // Nothing has landed on the canvas while the question is open.
    expect(await countShapes(page, 'image')).toBe(before);
  });

  test('att avbryta sidvalet lägger inte in något', async ({ page }) => {
    await openDemoPlanner(page, { blank: true });
    const before = await countShapes(page, 'image');

    await openUnderlayMenu(page);
    await page.locator('input[type="file"]').setInputFiles(FIXTURE_PDF);
    await expect(page.getByTestId('underlay-page-dialog')).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: 'Avbryt' }).click();
    await expect(page.getByTestId('underlay-page-dialog')).toBeHidden();
    expect(await countShapes(page, 'image')).toBe(before);
  });

  test('filväljaren tar emot PDF, inte bara bilder', async ({ page }) => {
    await openDemoPlanner(page, { blank: true });
    const accept = await page.locator('input[type="file"]').getAttribute('accept');
    expect(accept).toContain('application/pdf');
    expect(accept).toContain('image/');
  });
});

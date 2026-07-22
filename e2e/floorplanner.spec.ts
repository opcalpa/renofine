import { test, expect, Page } from '@playwright/test';

/**
 * Floor planner v2 smoke tests.
 *
 * Runs against the public guest demo (no credentials needed): the landing
 * page's "Se demoprojekt" opens an editable demo project. The v2 editor is
 * opted into via its localStorage flag and asserted through the dev-only
 * window.__rfEditorDebug handle (available in dev builds only, which is what
 * the Playwright webServer runs).
 */

declare global {
  interface Window {
    __rfEditorDebug?: {
      getShapes: () => Array<{
        id: string;
        type: string;
        coordinates: Record<string, number>;
        metadata?: { lengthMM?: number };
      }>;
      getUi: () => { canUndo: boolean; canRedo: boolean };
      getTool: () => string;
    };
  }
}

async function openDemoPlanner(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('renofine.editorV2', '1');
    localStorage.setItem('i18nextLng', 'sv');
  });
  await page.goto('/');
  await page.getByText('Se demoprojekt').first().click();
  await page.waitForURL(/\/projects\//);
  // Dismiss the intro dialog if present
  const ok = page.getByRole('button', { name: 'OK' });
  if (await ok.isVisible({ timeout: 5000 }).catch(() => false)) {
    await ok.click();
  }
  // Navigate to the floor plan sub-view. The desktop nav labels it "Yta"
  // (dropdown) while the mobile nav has a direct "Planer" item — JS-click the
  // latter, which routes straight to the drawing view regardless of viewport.
  await page.waitForFunction(() =>
    [...document.querySelectorAll('nav a, nav button, header a, header button')].some(
      (e) => e.textContent?.trim() === 'Planer'
    )
  );
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('nav a, nav button, header a, header button')].find(
      (e) => e.textContent?.trim() === 'Planer'
    ) as HTMLElement | undefined;
    el?.click();
  });
  const okPlanner = page.getByRole('button', { name: 'OK' });
  if (await okPlanner.isVisible({ timeout: 5000 }).catch(() => false)) {
    await okPlanner.click();
  }
  await expect(page.getByTestId('editor-v2-canvas')).toBeVisible({ timeout: 15000 });
  await page.waitForFunction(() => !!window.__rfEditorDebug);
}

test.describe('Floor planner v2', () => {
  test('shows the beta badge so the active editor is unambiguous', async ({ page }) => {
    await openDemoPlanner(page);
    await expect(page.getByText('Ny ritmotor')).toBeVisible();
  });

  test('draws a mitered wall polyline with wall shapes in the store', async ({ page }) => {
    await openDemoPlanner(page);
    const canvas = page.getByTestId('editor-v2-canvas');
    const box = (await canvas.boundingBox())!;

    await page.keyboard.press('w');
    await page.mouse.move(box.x + 300, box.y + 300);
    await page.mouse.down();
    await page.mouse.up();
    await page.mouse.move(box.x + 600, box.y + 300);
    await page.mouse.down();
    await page.mouse.up();
    await page.mouse.move(box.x + 600, box.y + 500);
    await page.mouse.down();
    await page.mouse.up();
    await page.keyboard.press('Enter');

    const walls = await page.evaluate(() =>
      window.__rfEditorDebug!.getShapes().filter((s) => s.type === 'wall')
    );
    expect(walls.length).toBeGreaterThanOrEqual(2);
  });

  test('type-to-dimension commits an exact wall length', async ({ page }) => {
    await openDemoPlanner(page);
    const canvas = page.getByTestId('editor-v2-canvas');
    const box = (await canvas.boundingBox())!;

    await page.keyboard.press('w');
    await page.mouse.move(box.x + 300, box.y + 450);
    await page.mouse.down();
    await page.mouse.up();
    // Aim right, type an exact length
    await page.mouse.move(box.x + 500, box.y + 450);
    await page.keyboard.type('2400');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter'); // finish chain

    const lengths = await page.evaluate(() =>
      window.__rfEditorDebug!
        .getShapes()
        .filter((s) => s.type === 'wall')
        .map((s) => s.metadata?.lengthMM)
    );
    expect(lengths).toContain(2400);
  });

  test('undo and redo work as single steps', async ({ page }) => {
    await openDemoPlanner(page);
    const canvas = page.getByTestId('editor-v2-canvas');
    const box = (await canvas.boundingBox())!;

    await page.keyboard.press('w');
    await page.mouse.move(box.x + 300, box.y + 400);
    await page.mouse.down();
    await page.mouse.up();
    await page.mouse.move(box.x + 500, box.y + 400);
    await page.mouse.down();
    await page.mouse.up();
    await page.keyboard.press('Enter');

    const count = () =>
      page.evaluate(() => window.__rfEditorDebug!.getShapes().filter((s) => s.type === 'wall').length);

    const drawn = await count();
    await page.keyboard.press('ControlOrMeta+z');
    expect(await count()).toBe(drawn - 1);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    expect(await count()).toBe(drawn);
  });
});

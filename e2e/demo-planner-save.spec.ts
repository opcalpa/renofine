/**
 * The demo must not pretend to save.
 *
 * A guest owns no project, so every shape they draw is refused by RLS. The v2
 * canvas autosaved anyway and reported the refusal as "Saved offline. Changes
 * will sync when connection is restored." — a network problem that did not
 * exist, repeated every 2.5 seconds, to the exact person taking their first
 * real action in the product.
 *
 * Drawing stays allowed: trying the tool IS the demo. Only the lie is gone.
 */
import { test, expect, Page } from '@playwright/test';

async function openDemoPlanner(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('renofine.editorV2', '1');
    localStorage.setItem('i18nextLng', 'sv');
  });
  await page.goto('/');
  await page.getByText('Se demoprojekt').first().click();
  await page.waitForURL(/\/projects\//);
  await page.goto(`${new URL(page.url()).pathname}?tab=spaceplanner&subtab=floorplan`);
  await expect(page.getByTestId('editor-v2-canvas')).toBeVisible({ timeout: 15000 });
  await page.waitForFunction(() => !!(window as unknown as { __rfEditorDebug?: unknown }).__rfEditorDebug);
  // The demo guide's backdrop eats every click until it is dismissed, and
  // isVisible() does NOT wait — that is what killed this whole suite.
  const guide = page.getByRole('alertdialog');
  if (await guide.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false)) {
    await guide.getByRole('button', { name: 'OK' }).click();
    await guide.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }
  // The demo's own floor plan hydrates asynchronously.
  await page.waitForFunction(
    () => (window as never as { __rfEditorDebug: { getShapes: () => unknown[] } }).__rfEditorDebug.getShapes().length > 0,
    undefined,
    { timeout: 15000 }
  );
}

const wallCount = (page: Page) =>
  page.evaluate(() =>
    (window as never as { __rfEditorDebug: { getShapes: () => Array<{ type: string }> } })
      .__rfEditorDebug.getShapes()
      .filter((s) => s.type === 'wall').length
  );

test('a guest can draw in the demo, and is told the truth about it', async ({ page }) => {
  const refusedWrites: string[] = [];
  page.on('response', (r) => {
    if (r.request().method() !== 'GET' && r.status() >= 400 && /floor_map_shapes/.test(r.url())) {
      refusedWrites.push(`${r.request().method()} ${r.status()}`);
    }
  });

  await openDemoPlanner(page);
  const before = await wallCount(page);

  const box = (await page.getByTestId('editor-v2-canvas').boundingBox())!;
  const click = async (x: number, y: number) => {
    await page.mouse.move(box.x + x, box.y + y);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(80);
  };
  await page.keyboard.press('w');
  await click(150, 560);
  await click(450, 560);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);

  // Drawing still works — the fix must not turn the demo into a picture.
  expect(await wallCount(page)).toBe(before + 1);

  // Said once, honestly, instead of a network error that is not happening.
  await expect(page.getByText(/din ritning sparas inte/i)).toBeVisible({ timeout: 5000 });

  // Past the 2.5s autosave debounce: nothing may be attempted or claimed.
  await page.waitForTimeout(4000);
  expect(refusedWrites).toEqual([]);
  await expect(page.getByText(/synkas när du är uppkopplad|Saved offline/i)).toHaveCount(0);
});

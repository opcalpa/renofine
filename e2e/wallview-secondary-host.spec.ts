/**
 * Regression: an object hosted on a SECONDARY wall along a room edge (split /
 * overlapping collinear walls) must still appear in the wall view. Before the
 * multi-wall segment matching (Carls fynd 2026-07-24) the elevation matched
 * exactly ONE wall shape per edge and objects attached to any other wall on
 * the same edge were silently invisible.
 */
import { test, expect, Page } from '@playwright/test';
import { clearPlan, dismissDemoGuide, pinView, waitForDemoPlan } from './lib/demoPlanner';

declare global {
  interface Window {
    __rfEditorDebug?: { getShapes: () => Array<Record<string, unknown> & { id: string; type: string }> };
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
  await dismissDemoGuide(page);
  // Route straight to the drawing view. This used to click a nav item labelled
  // "Planer"; that label is now "Ritning" and lives inside the "Yta" dropdown,
  // which silently killed 38 tests. The URL is the stable contract — these
  // tests are about the editor, not about how the nav is worded.
  await page.goto(`${new URL(page.url()).pathname}?tab=spaceplanner&subtab=floorplan`);
  await dismissDemoGuide(page);
  await expect(page.getByTestId('editor-v2-canvas')).toBeVisible({ timeout: 15000 });
  await page.waitForFunction(() => !!window.__rfEditorDebug);
  // The demo ships its own furnished plan now; these tests build their own
  // geometry and translate screen pixels into millimetres.
  await waitForDemoPlan(page);
  await clearPlan(page);
  await pinView(page);
}

test('wall view shows objects hosted on secondary walls along the same edge', async ({ page }) => {
  await openDemoPlanner(page);
  const canvas = page.getByTestId('editor-v2-canvas');
  const box = (await canvas.boundingBox())!;
  const click = async (x: number, y: number) => {
    await page.mouse.move(box.x + x, box.y + y);
    await page.mouse.down();
    await page.mouse.up();
  };

  await page.keyboard.press('w');
  await click(300, 300);
  await click(600, 300);
  await click(600, 550);
  await click(300, 550);
  await click(300, 300);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 5000 });
  await dialog.getByRole('button', { name: 'Avbryt' }).click();
  await expect(dialog).not.toBeVisible({ timeout: 5000 });

  // Overlay: a second collinear wall along part of the top edge (split-wall scenario)
  await page.keyboard.press('w');
  await click(350, 300);
  await click(550, 300);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');

  // Toilet snapped to the top wall from the PLAN
  await page.getByTestId('tool-objects').click();
  await page.getByRole('button', { name: /Badrum & VVS/ }).click();
  await page.locator('button[title="Toalett"]').click();
  await page.mouse.move(box.x + 450, box.y + 340);
  await page.waitForTimeout(150);
  await page.mouse.down();
  await page.mouse.up();

  const state = await page.evaluate(() => {
    const shapes = window.__rfEditorDebug!.getShapes();
    const toilet = shapes.find(
      (s) => (s as { metadata?: { unifiedObjectId?: string } }).metadata?.unifiedObjectId?.includes('toilet') ||
             (s as { name?: string }).name === 'Toalett'
    ) as Record<string, unknown> | undefined;
    const room = shapes.find((s) => s.type === 'room') as Record<string, unknown> | undefined;
    const walls = shapes.filter((s) => s.type === 'wall').map((s) => ({ id: s.id, planId: (s as { planId?: string }).planId }));
    return {
      toilet: toilet && {
        planId: toilet.planId,
        wallRelative: toilet.wallRelative,
        name: toilet.name,
      },
      roomPlanId: room?.planId,
      walls,
    };
  });
  console.log('STATE:', JSON.stringify(state, null, 2));

  // Force the SECONDARY-host case: re-home the toilet to the overlay wall
  // (the 2000 mm collinear piece), distance measured from ITS start.
  const rehomed = await page.evaluate(() => {
    const dbg = window.__rfEditorDebug! as unknown as {
      getShapes: () => Array<Record<string, unknown> & { id: string; type: string }>;
      execute: (name: string, params: unknown) => unknown;
    };
    const shapes = dbg.getShapes();
    const toilet = shapes.find((sh) => (sh as { name?: string }).name === 'Toalett')!;
    const overlay = shapes.find((sh) => {
      if (sh.type !== 'wall') return false;
      const c = sh.coordinates as { x1: number; y1: number; x2: number; y2: number };
      return Math.abs(Math.abs(c.x2 - c.x1) - 200) < 5 && Math.abs(c.y1 - c.y2) < 5;
    });
    if (!overlay) return { ok: false };
    const oc = overlay.coordinates as { x1: number; x2: number };
    const startX = Math.min(oc.x1, oc.x2);
    const wr = toilet.wallRelative as Record<string, number | string>;
    dbg.execute('shape.update', {
      id: toilet.id,
      updates: {
        wallRelative: {
          ...wr,
          wallId: overlay.id,
          distanceFromWallStart: (450 - startX) * 10 - 185,
        },
      },
    });
    const after = dbg.getShapes().find((sh) => (sh as { name?: string }).name === 'Toalett')!;
    return { ok: true, wallId: (after.wallRelative as { wallId: string }).wallId, overlayId: overlay.id };
  });
  console.log('REHOMED:', JSON.stringify(rehomed));

  // Open the wall view on the top wall
  await page.keyboard.press('v');
  await click(340, 300);
  await page.getByTestId('show-wall-view').click();
  await expect(page.getByText(/Vägg \d+ av 4/)).toBeVisible();
  // The toilet (hosted on the overlay wall) must be part of the rendered
  // segment objects — before the fix this was 0.
  await expect(page.locator('[data-elevation-objects]')).toHaveAttribute(
    'data-elevation-objects',
    /^[1-9]/
  );
});

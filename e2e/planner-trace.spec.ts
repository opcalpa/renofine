/**
 * Tracing a layer, one confirmed step at a time.
 *
 * The old AI import dropped a whole floor plan into a BRAND NEW plan, saved
 * before you had seen it — undoing meant deleting a plan. A hand sketch is the
 * low-confidence case and needs the opposite: rooms, then walls, then details,
 * each shown on the canvas before the next is offered.
 *
 * The model call is intercepted. This suite is about the staging and the undo
 * behaviour, not about what a vision model happens to return today — and a real
 * call would be slow, costly and non-deterministic.
 */
import { test, expect, Page } from '@playwright/test';
import { openDemoPlanner, countShapes } from './lib/demoPlanner';

/** A file the demo project really holds, so the layer can be fetched. */
const DEMO_IMAGE = 'projects/00000000-0000-0000-0000-000000000001/1773321377834.jpeg';

/** Canned analysis in millimetre space: 2 rooms, 3 walls, 1 door. */
const CANNED = {
  rooms: [
    { name: 'Kök', points: [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 2000 }, { x: 0, y: 2000 }] },
    { name: 'Bad', points: [{ x: 3200, y: 0 }, { x: 5000, y: 0 }, { x: 5000, y: 2000 }, { x: 3200, y: 2000 }] },
  ],
  walls: [
    { x1: 0, y1: 0, x2: 3000, y2: 0, thickness: 120 },
    { x1: 3000, y1: 0, x2: 3000, y2: 2000, thickness: 120 },
    { x1: 3000, y1: 2000, x2: 0, y2: 2000, thickness: 120 },
  ],
  doors: [{ x: 1500, y: 0, width: 900, height: 100, rotation: 0 }],
  fixtures: [],
};

async function stubVision(page: Page, body: unknown = CANNED): Promise<void> {
  await page.route('**/functions/v1/process-floorplan', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(body),
    });
  });
}

async function addLayer(page: Page): Promise<string> {
  return page.evaluate((imageUrl) => {
    const dbg = window.__rfEditorDebug!;
    const shape = dbg.execute('shape.add', {
      shape: {
        type: 'image',
        // A calibrated-looking span: not the assumed 10 m, so the flow does not
        // warn about an unset scale.
        coordinates: { x: 0, y: 0, width: 620, height: 400 },
        imageUrl,
        imageOpacity: 0.5,
        zIndex: -100,
      },
    }) as { id: string };
    dbg.select([shape.id]);
    return shape.id;
  }, DEMO_IMAGE);
}

async function openTrace(page: Page): Promise<void> {
  await page.getByTestId('tool-underlay').click();
  await page.getByTestId('underlay-trace').click();
  await expect(page.getByTestId('trace-layer-panel')).toBeVisible({ timeout: 20000 });
}

/** The panel must not sit on top of what it is asking you to judge. */
async function panelClearsCanvasCentre(page: Page): Promise<boolean> {
  const panel = await page.getByTestId('trace-layer-panel').boundingBox();
  const canvas = await page.getByTestId('editor-v2-canvas').boundingBox();
  if (!panel || !canvas) return false;
  const centreY = canvas.y + canvas.height / 2;
  return panel.y > centreY;
}

test.describe('Rita av lagret stegvis', () => {
  test('lägger in ett slag i taget och frågar mellan varje', async ({ page }) => {
    await stubVision(page);
    await openDemoPlanner(page, { blank: true });
    await addLayer(page);

    const roomsBefore = await countShapes(page, 'room');
    const wallsBefore = await countShapes(page, 'wall');

    await openTrace(page);

    // Steg 1: rum. Ingenting ligger på canvasen förrän man ber om det.
    await expect(page.getByTestId('trace-stage-rooms')).toBeVisible({ timeout: 20000 });
    expect(await countShapes(page, 'room')).toBe(roomsBefore);

    await page.getByTestId('trace-apply').click();
    await expect.poll(async () => countShapes(page, 'room'), { timeout: 10000 }).toBe(roomsBefore + 2);
    // Väggarna har INTE smugit in på köpet.
    expect(await countShapes(page, 'wall')).toBe(wallsBefore);
    // Och man kan faktiskt SE det den frågar om — panelen ligger inte över planen.
    expect(await panelClearsCanvasCentre(page)).toBe(true);

    await page.getByTestId('trace-keep').click();

    // Steg 2: väggar.
    await expect(page.getByTestId('trace-stage-walls')).toBeVisible();
    await page.getByTestId('trace-apply').click();
    await expect.poll(async () => countShapes(page, 'wall'), { timeout: 10000 }).toBe(wallsBefore + 3);
    await page.getByTestId('trace-keep').click();

    // Steg 3: dörrar och fast inredning.
    await expect(page.getByTestId('trace-stage-details')).toBeVisible();
    await page.getByTestId('trace-apply').click();
    await page.getByTestId('trace-keep').click();

    await expect(page.getByTestId('trace-done')).toBeVisible();
  });

  test('"ångra steget" tar bort exakt det steget, inte det föregående', async ({ page }) => {
    await stubVision(page);
    await openDemoPlanner(page, { blank: true });
    await addLayer(page);

    const roomsBefore = await countShapes(page, 'room');
    const wallsBefore = await countShapes(page, 'wall');

    await openTrace(page);

    await expect(page.getByTestId('trace-stage-rooms')).toBeVisible({ timeout: 20000 });
    await page.getByTestId('trace-apply').click();
    await expect.poll(async () => countShapes(page, 'room'), { timeout: 10000 }).toBe(roomsBefore + 2);
    await page.getByTestId('trace-keep').click();

    await expect(page.getByTestId('trace-stage-walls')).toBeVisible();
    await page.getByTestId('trace-apply').click();
    await expect.poll(async () => countShapes(page, 'wall'), { timeout: 10000 }).toBe(wallsBefore + 3);

    await page.getByTestId('trace-discard').click();

    // Väggarna är borta, rummen står kvar — ett steg är ett ångra-steg.
    await expect.poll(async () => countShapes(page, 'wall'), { timeout: 10000 }).toBe(wallsBefore);
    expect(await countShapes(page, 'room')).toBe(roomsBefore + 2);
  });

  test('hoppar över ett slag som modellen inte hittade något av', async ({ page }) => {
    // Inga dörrar eller inredning i svaret — det steget ska inte visas alls.
    await stubVision(page, { ...CANNED, doors: [], fixtures: [] });
    await openDemoPlanner(page, { blank: true });
    await addLayer(page);
    await openTrace(page);

    await expect(page.getByTestId('trace-stage-rooms')).toBeVisible({ timeout: 20000 });
    await page.getByTestId('trace-apply').click();
    await page.getByTestId('trace-keep').click();

    await expect(page.getByTestId('trace-stage-walls')).toBeVisible();
    await page.getByTestId('trace-apply').click();
    await page.getByTestId('trace-keep').click();

    // Rakt till slutet — ingen tom fråga om noll dörrar.
    await expect(page.getByTestId('trace-done')).toBeVisible();
    await expect(page.getByTestId('trace-stage-details')).toBeHidden();
  });

  test('utan lager förklarar menyn vad som saknas', async ({ page }) => {
    await openDemoPlanner(page, { blank: true });
    await page.getByTestId('tool-underlay').click();
    await page.getByTestId('underlay-trace').click();
    await expect(page.getByTestId('trace-layer-panel')).toBeHidden();
  });
});

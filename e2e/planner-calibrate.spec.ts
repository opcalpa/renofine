/**
 * Scale calibration: the step that turns a background image from decoration
 * into a drawing you can build on.
 *
 * Before this exists, a traced layer has no relationship to millimetres — the
 * import assumes a 10 m span, a manual upload uses the image's pixel size — so
 * everything drawn on top looks plausible and measures wrong.
 *
 * These tests pin the view and assert DELTAS, per the lesson from the demo
 * planner suite: the demo has its own geometry and its own camera.
 */
import { test, expect, Page } from '@playwright/test';
import { openDemoPlanner, pinView } from './lib/demoPlanner';

interface ImageLike {
  id: string;
  type: string;
  coordinates: { x: number; y: number; width: number; height: number };
}

/** Put a background image on the blank plan with a known size, and select it. */
async function addLayer(page: Page, width = 1000, height = 750): Promise<string> {
  return page.evaluate(
    ({ width, height }) => {
      const dbg = window.__rfEditorDebug!;
      const shape = dbg.execute('shape.add', {
        shape: {
          type: 'image',
          coordinates: { x: 0, y: 0, width, height },
          // Never fetched in the geometry path; the stored size is usable, so
          // the natural-size fallback stays out of it.
          imageUrl: 'projects/none/placeholder.png',
          imageOpacity: 0.5,
          zIndex: -100,
        },
      }) as { id: string };
      dbg.select([shape.id]);
      return shape.id;
    },
    { width, height },
  );
}

function layer(page: Page, id: string): Promise<ImageLike | undefined> {
  return page.evaluate(
    (shapeId) =>
      (window.__rfEditorDebug?.getShapes() as unknown as ImageLike[]).find((s) => s.id === shapeId),
    id,
  );
}

test.describe('Skalkalibrering av bildlager', () => {
  test('sätter lagrets skala så en känd sträcka blir det mått man skrev in', async ({ page }) => {
    await openDemoPlanner(page, { blank: true });
    const id = await addLayer(page);
    const before = await layer(page, id);
    expect(before?.coordinates.width).toBe(1000);

    const pxPerMm = await page.evaluate(
      () => (window.__rfEditorDebug!.getScale() as { pixelsPerMm: number }).pixelsPerMm,
    );

    // 400 world units of image, declared to be 5 m in reality.
    const measuredWorld = 400;
    const realMM = 5000;
    const factor = await page.evaluate(
      ({ id, measuredWorld, realMM }) =>
        window.__rfEditorDebug!.execute('image.calibrate', {
          id,
          from: { x: 0, y: 0 },
          to: { x: measuredWorld, y: 0 },
          realMM,
          effective: { width: 1000, height: 750 },
        }) as number | null,
      { id, measuredWorld, realMM },
    );

    const expected = (realMM * pxPerMm) / measuredWorld;
    expect(factor).toBeCloseTo(expected, 5);

    const after = await layer(page, id);
    // The layer scales as a whole — proportions survive, which is the point of
    // tracing over it.
    expect(after!.coordinates.width).toBeCloseTo(1000 * expected, 3);
    expect(after!.coordinates.height).toBeCloseTo(750 * expected, 3);

    // What the person clicked stays put: the anchor is the first point.
    expect(after!.coordinates.x).toBeCloseTo(0, 6);
    expect(after!.coordinates.y).toBeCloseTo(0, 6);
  });

  test('anchor-punkten står stilla när lagret inte ligger i origo', async ({ page }) => {
    await openDemoPlanner(page, { blank: true });
    const id = await page.evaluate(() => {
      const dbg = window.__rfEditorDebug!;
      const shape = dbg.execute('shape.add', {
        shape: {
          type: 'image',
          coordinates: { x: 100, y: 100, width: 400, height: 400 },
          imageUrl: 'projects/none/placeholder.png',
          zIndex: -100,
        },
      }) as { id: string };
      dbg.select([shape.id]);
      return shape.id;
    });

    // Anchor at (300,300) — inside the image, away from its corner.
    const factor = await page.evaluate(
      (shapeId) =>
        window.__rfEditorDebug!.execute('image.calibrate', {
          id: shapeId,
          from: { x: 300, y: 300 },
          to: { x: 500, y: 300 },
          realMM: 4000,
          effective: { width: 400, height: 400 },
        }) as number | null,
      id,
    );
    expect(factor).not.toBeNull();

    const after = await layer(page, id);
    // The corner moved by exactly the scaling about (300,300).
    expect(after!.coordinates.x).toBeCloseTo(300 + (100 - 300) * factor!, 3);
    expect(after!.coordinates.y).toBeCloseTo(300 + (100 - 300) * factor!, 3);
  });

  test('vägrar på en sträcka som är för kort att räkna på', async ({ page }) => {
    await openDemoPlanner(page, { blank: true });
    const id = await addLayer(page);

    const factor = await page.evaluate(
      (shapeId) =>
        window.__rfEditorDebug!.execute('image.calibrate', {
          id: shapeId,
          from: { x: 0, y: 0 },
          to: { x: 1, y: 0 }, // under CALIBRATE_MIN_SPAN
          realMM: 3400,
          effective: { width: 1000, height: 750 },
        }) as number | null,
      id,
    );

    // A near-zero segment sends the factor to infinity — refuse instead.
    expect(factor).toBeNull();
    const after = await layer(page, id);
    expect(after!.coordinates.width).toBe(1000);
  });

  test('kalibreringen går att ångra', async ({ page }) => {
    await openDemoPlanner(page, { blank: true });
    const id = await addLayer(page);

    await page.evaluate(
      (shapeId) =>
        window.__rfEditorDebug!.execute('image.calibrate', {
          id: shapeId,
          from: { x: 0, y: 0 },
          to: { x: 400, y: 0 },
          realMM: 5000,
          effective: { width: 1000, height: 750 },
        }),
      id,
    );
    expect((await layer(page, id))!.coordinates.width).not.toBe(1000);

    await page.keyboard.press('Meta+z');
    await expect
      .poll(async () => (await layer(page, id))!.coordinates.width, { timeout: 5000 })
      .toBe(1000);
  });

  test('verktyget frågar efter måttet efter två klick', async ({ page }) => {
    await openDemoPlanner(page, { blank: true });
    await addLayer(page);
    await pinView(page);

    await page.getByTestId('tool-calibrate').click();
    await expect
      .poll(async () => page.evaluate(() => window.__rfEditorDebug?.getTool()), { timeout: 5000 })
      .toBe('calibrate');

    const canvas = page.getByTestId('editor-v2-canvas');
    const box = (await canvas.boundingBox())!;
    await page.mouse.click(box.x + 200, box.y + 200);
    await page.mouse.click(box.x + 500, box.y + 200);

    await expect(page.getByTestId('calibration-input')).toBeVisible({ timeout: 5000 });
  });

  test('tangenten K når samma verktyg som knappen', async ({ page }) => {
    await openDemoPlanner(page, { blank: true });
    await addLayer(page);
    await pinView(page);

    // Grinden bor i verktyget, inte i knappen — annars skulle genvägen kunna
    // aktivera ett verktyg som inte har något att skala om.
    // Lyssnaren sitter på window, så inget klick behövs för att nå den (och
    // verktygsfältet ligger över canvasens vänsterkant).
    await page.keyboard.press('k');
    await expect
      .poll(async () => page.evaluate(() => window.__rfEditorDebug?.getTool()), { timeout: 5000 })
      .toBe('calibrate');
  });

  test('utan bildlager förklarar knappen vad som saknas i stället för att göra något', async ({
    page,
  }) => {
    await openDemoPlanner(page, { blank: true });

    await page.getByTestId('tool-calibrate').click();
    // Refuses rather than starting a gesture that has nothing to rescale.
    await expect
      .poll(async () => page.evaluate(() => window.__rfEditorDebug?.getTool()), { timeout: 3000 })
      .not.toBe('calibrate');
  });
});

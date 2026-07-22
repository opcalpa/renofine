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
      getUi: () => {
        canUndo: boolean;
        canRedo: boolean;
        measurements: Array<{ from: { x: number; y: number }; to: { x: number; y: number } }>;
        snapGuides: Array<{ distanceLabel?: string }>;
      };
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

  test('closing a wall loop auto-creates a room with correct area', async ({ page }) => {
    await openDemoPlanner(page);
    const canvas = page.getByTestId('editor-v2-canvas');
    const box = (await canvas.boundingBox())!;
    const click = async (x: number, y: number) => {
      await page.mouse.move(box.x + x, box.y + y);
      await page.mouse.down();
      await page.mouse.up();
      await page.waitForTimeout(60);
    };

    await page.keyboard.press('w');
    // 400×300 world units = 4×3 m = 12 m²
    await click(300, 200);
    await click(700, 200);
    await click(700, 500);
    await click(300, 500);
    await click(300, 200); // close the loop

    const rooms = await page.evaluate(() =>
      window.__rfEditorDebug!
        .getShapes()
        .filter((s) => s.type === 'room')
        .map((s) => ({ area: (s as { area?: number }).area }))
    );
    expect(rooms.length).toBe(1);
    expect(rooms[0].area).toBeCloseTo(12, 1);

    // The naming dialog opens for the new room — cancel keeps the room.
    const namingDialog = page.getByRole('dialog');
    await expect(namingDialog).toBeVisible({ timeout: 5000 });
    await namingDialog.getByRole('button', { name: /avbryt/i }).click();
    await expect(namingDialog).not.toBeVisible();

    // Deleting a wall must NOT delete the room (detached, undoable)
    await page.keyboard.press('v');
    await page.mouse.click(box.x + 500, box.y + 200);
    await page.keyboard.press('Delete');
    const stillThere = await page.evaluate(
      () => window.__rfEditorDebug!.getShapes().filter((s) => s.type === 'room').length
    );
    expect(stillThere).toBe(1);
  });

  test('door placement snaps to a wall and slides along it', async ({ page }) => {
    await openDemoPlanner(page);
    const canvas = page.getByTestId('editor-v2-canvas');
    const box = (await canvas.boundingBox())!;

    // One wall
    await page.keyboard.press('w');
    await page.mouse.move(box.x + 300, box.y + 350);
    await page.mouse.down();
    await page.mouse.up();
    await page.mouse.move(box.x + 800, box.y + 350);
    await page.mouse.down();
    await page.mouse.up();
    await page.keyboard.press('Enter');

    // Door tool (D) → click near the wall
    await page.keyboard.press('d');
    await page.mouse.move(box.x + 550, box.y + 352);
    await page.waitForTimeout(100);
    await page.mouse.down();
    await page.mouse.up();

    const door = await page.evaluate(() => {
      const d = window.__rfEditorDebug!.getShapes().find((s) => s.type === 'opening') as
        | { openingKind?: string; parentWallId?: string; metadata?: { widthMM?: number } }
        | undefined;
      return d && { kind: d.openingKind, hosted: !!d.parentWallId, widthMM: d.metadata?.widthMM };
    });
    expect(door).toEqual({ kind: 'door', hosted: true, widthMM: 890 });
  });

  test('measure tool lays down a measurement without creating shapes', async ({ page }) => {
    await openDemoPlanner(page);
    const canvas = page.getByTestId('editor-v2-canvas');
    const box = (await canvas.boundingBox())!;

    const shapeCount = () => page.evaluate(() => window.__rfEditorDebug!.getShapes().length);
    const before = await shapeCount();

    await page.keyboard.press('m');
    await page.mouse.move(box.x + 300, box.y + 300);
    await page.mouse.down();
    await page.mouse.up();
    await page.mouse.move(box.x + 500, box.y + 300);
    await page.mouse.down();
    await page.mouse.up();

    const measurements = await page.evaluate(
      () => window.__rfEditorDebug!.getUi().measurements
    );
    expect(measurements.length).toBe(1);
    expect(await shapeCount()).toBe(before);

    // Switching back to select clears the measurements (ephemeral by design)
    await page.keyboard.press('v');
    expect(
      await page.evaluate(() => window.__rfEditorDebug!.getUi().measurements.length)
    ).toBe(0);
  });

  test('duplicate (Cmd+D) copies the selection and undoes as one step', async ({ page }) => {
    await openDemoPlanner(page);
    const canvas = page.getByTestId('editor-v2-canvas');
    const box = (await canvas.boundingBox())!;

    await page.keyboard.press('w');
    await page.mouse.move(box.x + 300, box.y + 300);
    await page.mouse.down();
    await page.mouse.up();
    await page.mouse.move(box.x + 500, box.y + 300);
    await page.mouse.down();
    await page.mouse.up();
    await page.keyboard.press('Enter');

    const wallCount = () =>
      page.evaluate(() => window.__rfEditorDebug!.getShapes().filter((s) => s.type === 'wall').length);
    const drawn = await wallCount();

    await page.keyboard.press('v');
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('ControlOrMeta+d');
    expect(await wallCount()).toBe(drawn * 2);
    await page.keyboard.press('ControlOrMeta+z');
    expect(await wallCount()).toBe(drawn);
  });

  test('copy/paste (Cmd+C/V) recreates the selection with fresh ids', async ({ page }) => {
    await openDemoPlanner(page);
    const canvas = page.getByTestId('editor-v2-canvas');
    const box = (await canvas.boundingBox())!;

    await page.keyboard.press('w');
    await page.mouse.move(box.x + 320, box.y + 420);
    await page.mouse.down();
    await page.mouse.up();
    await page.mouse.move(box.x + 520, box.y + 420);
    await page.mouse.down();
    await page.mouse.up();
    await page.keyboard.press('Enter');

    const wallIds = () =>
      page.evaluate(() =>
        window.__rfEditorDebug!.getShapes().filter((s) => s.type === 'wall').map((s) => s.id)
      );
    const before = await wallIds();

    await page.keyboard.press('v');
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('ControlOrMeta+c');
    await page.keyboard.press('ControlOrMeta+v');

    const after = await wallIds();
    expect(after.length).toBe(before.length * 2);
    expect(new Set(after).size).toBe(after.length);
  });

  test('selection toolbar rotates a wall 90 degrees', async ({ page }) => {
    await openDemoPlanner(page);
    const canvas = page.getByTestId('editor-v2-canvas');
    const box = (await canvas.boundingBox())!;

    // One horizontal wall
    await page.keyboard.press('w');
    await page.mouse.move(box.x + 300, box.y + 350);
    await page.mouse.down();
    await page.mouse.up();
    await page.mouse.move(box.x + 500, box.y + 350);
    await page.mouse.down();
    await page.mouse.up();
    await page.keyboard.press('Enter');

    // Select it → floating toolbar appears → rotate
    await page.keyboard.press('v');
    await page.mouse.click(box.x + 400, box.y + 350);
    await expect(page.getByTestId('selection-toolbar')).toBeVisible();
    await page.getByTitle('Rotera 90°').click();

    const wall = await page.evaluate(() => {
      const walls = window.__rfEditorDebug!.getShapes().filter((s) => s.type === 'wall');
      return walls[walls.length - 1].coordinates as { x1: number; y1: number; x2: number; y2: number };
    });
    // Horizontal → vertical
    expect(Math.abs(wall.x1 - wall.x2)).toBeLessThan(1);
    expect(Math.abs(wall.y1 - wall.y2)).toBeGreaterThan(100);
  });

  test('opening width edits from the selection toolbar and shows corner distances', async ({ page }) => {
    await openDemoPlanner(page);
    const canvas = page.getByTestId('editor-v2-canvas');
    const box = (await canvas.boundingBox())!;

    // Wall + door in the middle
    await page.keyboard.press('w');
    await page.mouse.move(box.x + 300, box.y + 350);
    await page.mouse.down();
    await page.mouse.up();
    await page.mouse.move(box.x + 800, box.y + 350);
    await page.mouse.down();
    await page.mouse.up();
    await page.keyboard.press('Enter');
    await page.keyboard.press('d');
    await page.mouse.move(box.x + 550, box.y + 352);
    await page.waitForTimeout(100);
    // Aiming shows the corner-distance readout
    const aimGuides = await page.evaluate(
      () => window.__rfEditorDebug!.getUi().snapGuides.filter((g) => g.distanceLabel).length
    );
    expect(aimGuides).toBe(2);
    await page.mouse.down();
    await page.mouse.up();

    // Select the door → width input appears → set 1200 mm
    await page.keyboard.press('v');
    await page.mouse.click(box.x + 550, box.y + 350);
    const input = page.getByTestId('selection-toolbar').locator('input[type="number"]');
    await expect(input).toBeVisible();
    await input.fill('1200');
    await input.press('Enter');

    const width = await page.evaluate(
      () =>
        (window.__rfEditorDebug!.getShapes().find((s) => s.type === 'opening') as {
          metadata?: { widthMM?: number };
        })?.metadata?.widthMM
    );
    expect(width).toBe(1200);
  });

  test('clicking a dimension label and typing a new length moves the wall', async ({ page }) => {
    await openDemoPlanner(page);
    const canvas = page.getByTestId('editor-v2-canvas');
    const box = (await canvas.boundingBox())!;

    // One horizontal wall 300→600 (3000 mm)
    await page.keyboard.press('w');
    await page.mouse.move(box.x + 300, box.y + 300);
    await page.mouse.down();
    await page.mouse.up();
    await page.mouse.move(box.x + 600, box.y + 300);
    await page.mouse.down();
    await page.mouse.up();
    await page.keyboard.press('Enter');

    // Click the label just above the wall midpoint → inline editor opens.
    // The Konva Text's x is its LEFT edge (at the midpoint), so aim a few px in.
    await page.keyboard.press('v');
    await page.mouse.click(box.x + 465, box.y + 291);
    const input = page.getByTestId('wall-length-input');
    await expect(input).toBeVisible();
    await expect(input).toHaveValue('3000');
    await input.fill('4000');
    await input.press('Enter');

    const length = await page.evaluate(() => {
      const w = window.__rfEditorDebug!.getShapes().find((s) => s.type === 'wall')!;
      const c = w.coordinates as { x1: number; y1: number; x2: number; y2: number };
      return Math.round(Math.hypot(c.x2 - c.x1, c.y2 - c.y1) * 10);
    });
    expect(length).toBe(4000);
  });

  test('fast drawing of separate wall chains commits every chain', async ({ page }) => {
    // Regression: Konva synthesizes a dblclick across a finished chain (the
    // Enter that ended it), which used to swallow the next chain's first
    // vertex when drawing quickly.
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
    await click(400, 300);
    await page.keyboard.press('Enter');
    await click(500, 360);
    await click(600, 360);
    await page.keyboard.press('Enter');
    await click(700, 420);
    await click(800, 420);
    await page.keyboard.press('Enter');

    const walls = await page.evaluate(
      () => window.__rfEditorDebug!.getShapes().filter((s) => s.type === 'wall').length
    );
    expect(walls).toBe(3);
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

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

  test('moving wall and opening together moves the opening once, with synced coordinates', async ({ page }) => {
    // Regression: when an opening AND its host wall were both selected, the
    // opening both slid along the wall and rode the wall's translation —
    // moving double. It must ride along only.
    await openDemoPlanner(page);
    const canvas = page.getByTestId('editor-v2-canvas');
    const box = (await canvas.boundingBox())!;

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
    await page.mouse.down();
    await page.mouse.up();

    const doorState = () =>
      page.evaluate(() => {
        const d = window.__rfEditorDebug!.getShapes().find((s) => s.type === 'opening') as {
          positionOnWall?: number;
          coordinates: { x1: number };
        };
        return { pos: d.positionOnWall, x1: d.coordinates.x1 };
      });
    const before = await doorState();
    // The executor sync writes real derived coordinates (elevation reads them)
    expect(before.x1).toBeGreaterThan(0);

    // Select everything and nudge right (Shift = 100 mm = 10 world units)
    await page.keyboard.press('v');
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Shift+ArrowRight');
    const after = await doorState();
    expect(after.pos).toBeCloseTo(before.pos!, 5);
    expect(after.x1 - before.x1).toBeCloseTo(10, 1);
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

  test('library object: place with wall snap + auto-rotate, slide, release, R-rotate', async ({ page }) => {
    await openDemoPlanner(page);
    const canvas = page.getByTestId('editor-v2-canvas');
    const box = (await canvas.boundingBox())!;

    // Wall to host the toilet
    await page.keyboard.press('w');
    await page.mouse.move(box.x + 300, box.y + 300);
    await page.mouse.down();
    await page.mouse.up();
    await page.mouse.move(box.x + 900, box.y + 300);
    await page.mouse.down();
    await page.mouse.up();
    await page.keyboard.press('Enter');
    await page.keyboard.press('v');

    // Pick "Toalett" from the object library panel (v2 rail slot)
    await page.getByTestId('tool-objects').click();
    await page.getByRole('button', { name: /Badrum & VVS/ }).click();
    await page.locator('button[title="Toalett"]').click();

    // Aim near the wall → placed snapped + auto-rotated flush
    await page.mouse.move(box.x + 550, box.y + 345);
    await page.waitForTimeout(150);
    await page.mouse.down();
    await page.mouse.up();

    const objState = () =>
      page.evaluate(() => {
        const o = window.__rfEditorDebug!.getShapes().find(
          (s) => (s as { metadata?: { isUnifiedObject?: boolean } }).metadata?.isUnifiedObject
        ) as unknown as {
          rotation?: number;
          metadata: { placementX: number; placementY: number };
          wallRelative?: { distanceFromWallStart: number; width: number };
        };
        return o && {
          rot: o.rotation ?? 0,
          y: o.metadata.placementY,
          attached: !!o.wallRelative,
          dist: o.wallRelative?.distanceFromWallStart,
          wrWidth: o.wallRelative?.width,
        };
      });

    const placed = await objState();
    expect(placed.attached).toBe(true);
    expect(placed.rot).toBe(0);
    // wallRelative is stored in mm: (550-300)=250 world = 2500 mm minus half width 185
    expect(placed.dist).toBeCloseTo(2315, 0);
    expect(placed.wrWidth).toBe(370);

    // Slide along the wall: drag right — stays flush (same y), dist grows
    await page.mouse.move(box.x + 550, box.y + placed.y);
    await page.mouse.down();
    await page.mouse.move(box.x + 650, box.y + placed.y + 5);
    await page.mouse.up();
    const slid = await objState();
    expect(slid.attached).toBe(true);
    expect(slid.y).toBeCloseTo(placed.y, 1);
    expect(slid.dist!).toBeGreaterThan(placed.dist!);

    // R rotates 90° in place and releases the wall hosting
    await page.keyboard.press('r');
    const rotated = await objState();
    expect(rotated.rot).toBe(90);
    expect(rotated.attached).toBe(false);
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

  test('v2 top bar has no elevation tab and the zoom cluster zooms', async ({ page }) => {
    await openDemoPlanner(page);

    // Segment control: 2D + 3D only — elevation is contextual (per wall) in v2
    await expect(page.getByRole('button', { name: '2D' })).toBeVisible();
    await expect(page.getByRole('button', { name: '3D' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Väggvy', exact: true })).toHaveCount(0);

    const cluster = page.getByTestId('zoom-cluster');
    await expect(cluster).toBeVisible();
    const pct = async () => parseInt((await cluster.textContent())!.match(/(\d+)%/)![1], 10);
    const before = await pct();
    await cluster.locator('button').first().click(); // −
    expect(await pct()).toBeLessThan(before);
    await cluster.locator('button').last().click(); // +
    expect(await pct()).toBe(before);
  });

  test('selecting a wall offers "Väggvy" and opens elevation with breadcrumb', async ({ page }) => {
    await openDemoPlanner(page);
    const canvas = page.getByTestId('editor-v2-canvas');
    const box = (await canvas.boundingBox())!;
    const click = async (x: number, y: number) => {
      await page.mouse.move(box.x + x, box.y + y);
      await page.mouse.down();
      await page.mouse.up();
    };

    // Closed loop → auto-room
    await page.keyboard.press('w');
    await click(300, 300);
    await click(600, 300);
    await click(600, 500);
    await click(300, 500);
    await click(300, 300);

    // Select the bottom wall → wall-view button appears in the selection toolbar
    await page.keyboard.press('v');
    await click(450, 500);
    const wallViewBtn = page.getByTestId('show-wall-view');
    await expect(wallViewBtn).toBeVisible();
    await wallViewBtn.click();

    // Elevation opens directly (no room picker) with the wall counter breadcrumb
    await expect(page.getByText(/Vägg \d+ av 4/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Välj rum för väggvy' })).toHaveCount(0);

    // v2 shell: compact left rail replaces the amber placement strip
    await expect(page.getByTestId('elevation-v2-rail')).toBeVisible();
    await expect(page.locator('.bg-amber-50')).toHaveCount(0);

    // Breadcrumb back returns to the floor plan
    await page.getByRole('button', { name: 'Planritning' }).click();
    await expect(page.getByTestId('editor-v2-canvas')).toBeVisible();
  });

  test('object placed inside a linked room gets the room id stamped (E3 mirror)', async ({ page }) => {
    await openDemoPlanner(page);
    const canvas = page.getByTestId('editor-v2-canvas');
    const box = (await canvas.boundingBox())!;
    const click = async (x: number, y: number) => {
      await page.mouse.move(box.x + x, box.y + y);
      await page.mouse.down();
      await page.mouse.up();
    };

    // Closed loop → auto-room, then link it to the existing project room "Hall"
    await page.keyboard.press('w');
    await click(300, 300);
    await click(600, 300);
    await click(600, 500);
    await click(300, 500);
    await click(300, 300);
    await page.keyboard.press('v');
    await page.mouse.dblclick(box.x + 450, box.y + 400);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // Wait for the project-rooms section (async fetch) so we hit the LINK
    // button, not the identically named "Vanliga rum" preset.
    await expect(dialog.getByText('Projektets rum')).toBeVisible();
    await dialog.getByRole('button', { name: 'Hall', exact: true }).first().click();
    await dialog.getByRole('button', { name: 'Spara' }).click();
    await expect(dialog).not.toBeVisible();
    // The link stamps roomId asynchronously after the dialog closes.
    await page.waitForFunction(() =>
      window.__rfEditorDebug!.getShapes().some((s) => s.type === 'room' && (s as { roomId?: string }).roomId)
    );

    // Place an electrical object inside the room via the rail's object panel
    await page.getByTestId('tool-objects').click();
    await page.getByRole('button', { name: /Enkeluttag/ }).first().click();
    await page.mouse.move(box.x + 450, box.y + 400);
    await page.mouse.down();
    await page.mouse.up();

    const placed = await page.evaluate(() => {
      const obj = window.__rfEditorDebug!
        .getShapes()
        .find((s) => (s as { metadata?: { isUnifiedObject?: boolean } }).metadata?.isUnifiedObject) as
        | { roomId?: string; name?: string }
        | undefined;
      const room = window.__rfEditorDebug!.getShapes().find((s) => s.type === 'room') as
        | { roomId?: string }
        | undefined;
      return { objRoomId: obj?.roomId ?? null, roomRoomId: room?.roomId ?? null };
    });
    expect(placed.roomRoomId).toBeTruthy();
    expect(placed.objRoomId).toBe(placed.roomRoomId);
  });
});

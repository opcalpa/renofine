import { test, expect } from '@playwright/test';
import {
  countShapes,
  openDemoPlanner,
  shapeIds,
} from './lib/demoPlanner';

/**
 * Floor planner v2 smoke tests.
 *
 * Runs against the public guest demo (no credentials needed): the landing
 * page's "Se demoprojekt" opens an editable demo project. The v2 editor is
 * opted into via its localStorage flag and asserted through the dev-only
 * window.__rfEditorDebug handle (available in dev builds only, which is what
 * the Playwright webServer runs).
 *
 * The demo ships its OWN floor plan (12 walls, 5 rooms, 5 openings). Every
 * count here is therefore a DELTA — asserting an absolute number would pin the
 * demo's seed data instead of the editor's behaviour, which is what silently
 * broke this suite once the demo gained geometry.
 */

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
    await openDemoPlanner(page, { blank: true });
    const canvas = page.getByTestId('editor-v2-canvas');
    const box = (await canvas.boundingBox())!;
    // The demo arrives with its own rooms, so this test is about the room the
    // LOOP creates — identified by id, not by being the only one on the plan.
    const roomsBefore = await shapeIds(page, 'room');
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

    const created = await page.evaluate(
      (before) =>
        (window.__rfEditorDebug!.getShapes() as Array<{ id: string; type: string; area?: number }>)
          .filter((s) => s.type === 'room' && !before.includes(s.id))
          .map((s) => ({ id: s.id, area: s.area })),
      roomsBefore
    );
    expect(created.length).toBe(1);
    expect(created[0].area).toBeCloseTo(12, 1);

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
      (id) => window.__rfEditorDebug!.getShapes().some((s) => s.id === id),
      created[0].id
    );
    expect(stillThere).toBe(true);
  });

  test('door placement snaps to a wall and slides along it', async ({ page }) => {
    await openDemoPlanner(page, { blank: true });
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
    const wallsBefore = await countShapes(page, 'wall');
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

    const wallCount = () => countShapes(page, 'wall');
    // Select-all now grabs the demo's own walls too, so the honest assertion
    // is that duplicating EVERYTHING doubles everything — and that one undo
    // puts all of it back. Both hold whatever the plan started with.
    const total = await wallCount();
    expect(total).toBeGreaterThan(wallsBefore); // the chain was drawn

    await page.keyboard.press('v');
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('ControlOrMeta+d');
    expect(await wallCount()).toBe(total * 2);
    await page.keyboard.press('ControlOrMeta+z');
    expect(await wallCount()).toBe(total);
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
    await openDemoPlanner(page, { blank: true });
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
    await openDemoPlanner(page, { blank: true });
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
    const wallsBefore = await countShapes(page, 'wall');
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

    // Three chains of one segment each — counted as a delta over the demo's
    // own walls, so this pins the editor and not the seed data.
    expect((await countShapes(page, 'wall')) - wallsBefore).toBe(3);
  });

  test('library object: place with wall snap + auto-rotate, slide, release, R-rotate', async ({ page }) => {
    await openDemoPlanner(page, { blank: true });
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
    await openDemoPlanner(page, { blank: true });
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

    // Breadcrumb back returns to the floor plan. The plan PICKER carries the
    // same label, so take the breadcrumb's copy (rendered after the picker)
    // rather than hoping for a single match.
    await page.getByRole('button', { name: 'Planritning' }).last().click();
    await expect(page.getByTestId('editor-v2-canvas')).toBeVisible();
  });

  test('object placed inside a linked room gets the room id stamped (E3 mirror)', async ({ page }) => {
    await openDemoPlanner(page, { blank: true });
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

  test('drag-and-drop from the object panel places a wall-snapped object', async ({ page }) => {
    await openDemoPlanner(page, { blank: true });
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
    await click(600, 500);
    await click(300, 500);
    await click(300, 300);
    await page.keyboard.press('Escape');

    const result = await page.evaluate(() => {
      const container = document.querySelector('[data-testid="editor-v2-canvas"]')!;
      const rect = container.getBoundingClientRect();
      const dt = new DataTransfer();
      dt.setData('application/x-renofine-object', 'plumbing_toilet');
      const mk = (type: string, x: number, y: number) =>
        new DragEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + x,
          clientY: rect.top + y,
          dataTransfer: dt,
        });
      container.dispatchEvent(mk('dragover', 450, 490));
      container.dispatchEvent(mk('drop', 450, 490));
      const objs = window
        .__rfEditorDebug!.getShapes()
        .filter((s) => (s as { metadata?: { isUnifiedObject?: boolean } }).metadata?.isUnifiedObject) as Array<{
        name?: string;
        wallRelative?: unknown;
      }>;
      const dropped = objs[objs.length - 1];
      return { count: objs.length, name: dropped?.name, wallAttached: !!dropped?.wallRelative };
    });
    expect(result.count).toBe(1);
    expect(result.name).toBe('Toalett');
    expect(result.wallAttached).toBe(true);
  });

  test('custom DIY object: place, rename and set real dimensions', async ({ page }) => {
    await openDemoPlanner(page);

    // Drop a custom box on the empty canvas
    await page.evaluate(() => {
      const container = document.querySelector('[data-testid="editor-v2-canvas"]')!;
      const rect = container.getBoundingClientRect();
      const dt = new DataTransfer();
      dt.setData('application/x-renofine-object', 'custom_box');
      const mk = (type: string) =>
        new DragEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + 500,
          clientY: rect.top + 400,
          dataTransfer: dt,
        });
      container.dispatchEvent(mk('dragover'));
      container.dispatchEvent(mk('drop'));
    });

    // Selection toolbar shows name + dimension inputs for the custom object
    const toolbar = page.getByTestId('selection-toolbar');
    await expect(toolbar).toBeVisible();
    const inputs = toolbar.locator('input');
    await inputs.nth(0).fill('Platsbyggd bänk');
    await inputs.nth(0).press('Enter');
    await inputs.nth(1).fill('2400');
    await inputs.nth(1).press('Enter');

    const custom = await page.evaluate(() => {
      const s = window.__rfEditorDebug!
        .getShapes()
        .find(
          (sh) =>
            (sh as { metadata?: { unifiedObjectId?: string } }).metadata?.unifiedObjectId ===
            'custom_box'
        ) as { name?: string; metadata?: { customWidthMM?: number; customDepthMM?: number } };
      return { name: s?.name, w: s?.metadata?.customWidthMM, d: s?.metadata?.customDepthMM };
    });
    expect(custom.name).toBe('Platsbyggd bänk');
    expect(custom.w).toBe(2400);
    expect(custom.d).toBe(600);
  });

  test('opening can be placed directly in the wall view at the clicked position', async ({ page }) => {
    await openDemoPlanner(page, { blank: true });
    const canvas = page.getByTestId('editor-v2-canvas');
    const box = (await canvas.boundingBox())!;
    const click = async (x: number, y: number) => {
      await page.mouse.move(box.x + x, box.y + y);
      await page.mouse.down();
      await page.mouse.up();
    };

    // Room, then into the wall view via the selected top wall
    await page.keyboard.press('w');
    await click(300, 300);
    await click(600, 300);
    await click(600, 500);
    await click(300, 500);
    await click(300, 300);
    // Dismiss the naming dialog if it opened for the new auto-room
    const dialog = page.getByRole('dialog');
    if (await dialog.isVisible({ timeout: 1500 }).catch(() => false)) {
      await dialog.getByRole('button', { name: 'Avbryt' }).click();
    }
    await page.keyboard.press('v');
    await click(450, 300);
    await page.getByTestId('show-wall-view').click();
    await expect(page.getByText(/Vägg \d+ av 4/)).toBeVisible();

    // Arm the door tool from the elevation rail and click mid-wall
    await page.getByTestId('elevation-tool-opening').click();
    await page.getByRole('button', { name: 'Dörr', exact: true }).click();
    const elevCanvas = page.locator('.fixed.inset-0 .konvajs-content canvas').last();
    const eb = (await elevCanvas.boundingBox())!;
    await elevCanvas.click({ position: { x: eb.width / 2, y: eb.height / 2 } });

    // Back on the floor plan the opening exists mid-wall on a real wall
    await page.getByRole('button', { name: 'Planritning' }).last().click();
    await expect(page.getByTestId('editor-v2-canvas')).toBeVisible();
    const opening = await page.evaluate(() => {
      const o = window.__rfEditorDebug!
        .getShapes()
        .find((s) => s.type === 'opening') as
        | { openingKind?: string; parentWallId?: string; positionOnWall?: number }
        | undefined;
      return { kind: o?.openingKind, hasWall: !!o?.parentWallId, t: o?.positionOnWall };
    });
    expect(opening.kind).toBe('door');
    expect(opening.hasWall).toBe(true);
    expect(opening.t!).toBeGreaterThan(0.3);
    expect(opening.t!).toBeLessThan(0.7);
  });

  test('wall view: text note placement and per-wall surface instruction', async ({ page }) => {
    await openDemoPlanner(page, { blank: true });
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
    await click(600, 500);
    await click(300, 500);
    await click(300, 300);
    const dialog = page.getByRole('dialog');
    if (await dialog.isVisible({ timeout: 1500 }).catch(() => false)) {
      await dialog.getByRole('button', { name: 'Avbryt' }).click();
    }
    await page.keyboard.press('v');
    await click(450, 300);
    await page.getByTestId('show-wall-view').click();
    await expect(page.getByText(/Vägg \d+ av 4/)).toBeVisible();

    // Text note: arm, click the wall, type, Enter
    await page.getByTestId('elevation-tool-text').click();
    const elevCanvas = page.locator('.fixed.inset-0 .konvajs-content canvas').last();
    const eb = (await elevCanvas.boundingBox())!;
    await elevCanvas.click({ position: { x: eb.width * 0.5, y: eb.height * 0.4 } });
    const noteInput = page.getByPlaceholder('Skriv anteckningen…');
    await expect(noteInput).toBeVisible();
    await noteInput.fill('Spotlights 3 st');
    await noteInput.press('Enter');

    // Surface instruction: open the chip, set material, blur commits
    await page.getByTestId('wall-surface-chip').click();
    const materialInput = page.getByPlaceholder('Gips, betong…');
    await materialInput.fill('Gips');
    await materialInput.blur();
    await expect(page.getByTestId('wall-surface-chip')).toContainText('Gips');

    // Back on the plan: the note exists wall-anchored and stays out of the floor view
    await page.getByRole('button', { name: 'Planritning' }).last().click();
    await expect(page.getByTestId('editor-v2-canvas')).toBeVisible();
    const result = await page.evaluate(() => {
      const shapes = window.__rfEditorDebug!.getShapes();
      const note = shapes.find(
        (s) => s.type === 'text' && (s as { shapeViewMode?: string }).shapeViewMode === 'elevation'
      ) as { text?: string; wallRelative?: { wallId?: string } } | undefined;
      const wall = shapes.find(
        (s) => s.id === note?.wallRelative?.wallId
      ) as { material?: string } | undefined;
      return { noteText: note?.text, anchored: !!note?.wallRelative?.wallId, wallMaterial: wall?.material };
    });
    expect(result.noteText).toBe('Spotlights 3 st');
    expect(result.anchored).toBe(true);
    expect(result.wallMaterial).toBe('Gips');
  });

  test('floor finish pattern renders from shape data and toggles in view settings', async ({ page }) => {
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
    await click(600, 500);
    await click(300, 500);
    await click(300, 300);
    const dialog = page.getByRole('dialog');
    if (await dialog.isVisible({ timeout: 1500 }).catch(() => false)) {
      await dialog.getByRole('button', { name: 'Avbryt' }).click();
    }

    // Stamp a floor finish (what room enrichment resolves from floor_spec)
    const stamped = await page.evaluate(() => {
      const dbg = window.__rfEditorDebug! as unknown as {
        getShapes: () => Array<{ id: string; type: string; surfacePattern?: string }>;
        execute: (name: string, params: unknown) => unknown;
      };
      const room = dbg.getShapes().find((s) => s.type === 'room')!;
      dbg.execute('shape.update', {
        id: room.id,
        updates: { surfaceTint: '#d8b98a', surfaceLabel: 'Ekparkett', surfacePattern: 'herringbone' },
      });
      return dbg.getShapes().find((s) => s.type === 'room')!.surfacePattern;
    });
    expect(stamped).toBe('herringbone');

    // View settings: patterns toggle exists and flips off
    await page.getByTestId('view-settings-trigger').click();
    await page.locator('#v2-show-patterns').click();
    await expect(page.locator('#v2-show-patterns')).toHaveAttribute('data-state', 'unchecked');

    // Surfaces master toggle hides the pattern toggle entirely
    await page.locator('#v2-show-surfaces').click();
    await expect(page.locator('#v2-show-patterns')).toHaveCount(0);
  });

  test('object finish edits from the selection toolbar and lands in metadata', async ({ page }) => {
    await openDemoPlanner(page);
    const canvas = page.getByTestId('editor-v2-canvas');
    const box = (await canvas.boundingBox())!;

    // Place a toilet free-standing
    await page.getByTestId('tool-objects').click();
    await page.getByRole('button', { name: /Badrum & VVS/ }).click();
    await page.locator('button[title="Toalett"]').click();
    await page.mouse.move(box.x + 500, box.y + 400);
    await page.waitForTimeout(150);
    await page.mouse.down();
    await page.mouse.up();

    // Select it → finish input appears in the selection toolbar
    await page.keyboard.press('v');
    await page.mouse.move(box.x + 500, box.y + 400);
    await page.mouse.down();
    await page.mouse.up();
    const finishInput = page.getByPlaceholder('Kulör/finish');
    await expect(finishInput).toBeVisible();
    await finishInput.fill('NCS S 3005-G80Y');
    await finishInput.press('Enter');

    const finish = await page.evaluate(() => {
      const o = window.__rfEditorDebug!.getShapes().find(
        (s) => (s as { metadata?: { isUnifiedObject?: boolean } }).metadata?.isUnifiedObject
      ) as unknown as { metadata?: { finishColor?: string } };
      return o?.metadata?.finishColor;
    });
    expect(finish).toBe('NCS S 3005-G80Y');

    // View settings: the wall colour-code toggle exists
    await page.keyboard.press('Escape');
    await page.getByTestId('view-settings-trigger').click();
    await expect(page.locator('#v2-show-finish-labels')).toHaveAttribute('data-state', 'checked');
  });

  test('templates tab places a default template as one grouped undo step', async ({ page }) => {
    await openDemoPlanner(page, { blank: true });
    // Placement needs currentPlanId — wait for the plan picker to resolve
    await expect(page.getByRole('button', { name: /Planritning|Floor Plan|Plan 1/i }).first()).toBeVisible({
      timeout: 15000,
    });

    const shapeCount = () =>
      page.evaluate(() => window.__rfEditorDebug!.getShapes().length);
    const before = await shapeCount();

    // Objects popover → Mallar tab → place the WC default template
    await page.getByTestId('tool-objects').click();
    await page.getByTestId('objects-tab-templates').click();
    await expect(page.getByPlaceholder('Sök mallar…')).toBeVisible();
    await page.getByRole('button', { name: 'WC', exact: true }).click();

    const after = await shapeCount();
    expect(after).toBeGreaterThan(before);

    // All placed shapes share a groupId (the template group contract)
    const groupInfo = await page.evaluate(() => {
      const shapes = window.__rfEditorDebug!.getShapes() as Array<{
        groupId?: string;
        isGroupLeader?: boolean;
      }>;
      const grouped = shapes.filter((s) => s.groupId);
      return {
        count: grouped.length,
        oneGroup: new Set(grouped.map((s) => s.groupId)).size === 1,
        hasLeader: grouped.some((s) => s.isGroupLeader),
      };
    });
    expect(groupInfo.count).toBeGreaterThan(0);
    expect(groupInfo.oneGroup).toBe(true);
    expect(groupInfo.hasLeader).toBe(true);

    // One undo removes the whole template placement
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    expect(await shapeCount()).toBe(before);
  });

  test('subtab=floorplan survives a reload (deep-link round trip)', async ({ page }) => {
    await openDemoPlanner(page);
    // The mirror effect should have written the restorable location
    await expect(page).toHaveURL(/tab=spaceplanner/);
    await expect(page).toHaveURL(/subtab=floorplan/);

    // Hard reload on the same URL → straight back into the drawing view,
    // no manual navigation to Planer needed (was: landed in Rumshantering)
    await page.reload();
    await expect(page.getByTestId('editor-v2-canvas')).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(/subtab=floorplan/);
  });

  test('v2 view settings filters placed objects by work type', async ({ page }) => {
    await openDemoPlanner(page);
    const canvas = page.getByTestId('editor-v2-canvas');
    const box = (await canvas.boundingBox())!;

    // Place a plumbing object so a work-type category is present on the canvas
    await page.getByTestId('tool-objects').click();
    await page.getByRole('button', { name: /Badrum & VVS/ }).click();
    await page.locator('button[title="Toalett"]').click();
    await page.mouse.move(box.x + 500, box.y + 400);
    await page.waitForTimeout(150);
    await page.mouse.down();
    await page.mouse.up();
    await page.keyboard.press('v');
    await page.keyboard.press('Escape');

    // View settings now offers a per-category filter toggle for that category
    await page.getByTestId('view-settings-trigger').click();
    const toggle = page.getByTestId('v2-cat-toggle-plumbing');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('data-state', 'checked');
    await toggle.click();
    await expect(toggle).toHaveAttribute('data-state', 'unchecked');
  });

  test('free shapes: draw, group into one named object, then ungroup', async ({ page }) => {
    await openDemoPlanner(page);
    const canvas = page.getByTestId('editor-v2-canvas');
    const box = (await canvas.boundingBox())!;
    const dragRect = async (x1: number, y1: number, x2: number, y2: number) => {
      await page.mouse.move(box.x + x1, box.y + y1);
      await page.mouse.down();
      await page.mouse.move(box.x + x2, box.y + y2);
      await page.mouse.up();
    };

    // Former flyout → rectangle tool, draw two rectangles
    await page.getByTestId('tool-shapes').click();
    await page.getByTestId('tool-shape-rectangle').click();
    await dragRect(300, 300, 420, 400);
    await dragRect(460, 300, 580, 400);

    const rectCount = () =>
      page.evaluate(
        () => window.__rfEditorDebug!.getShapes().filter((s) => s.type === 'rectangle').length
      );
    expect(await rectCount()).toBe(2);

    // Select both → floating toolbar → Gruppera
    await page.keyboard.press('v');
    await page.keyboard.press('ControlOrMeta+a');
    await expect(page.getByTestId('selection-toolbar')).toBeVisible();
    await page.getByTestId('group-shapes').click();

    const grouped = await page.evaluate(() => {
      const rects = window.__rfEditorDebug!.getShapes().filter((s) => s.type === 'rectangle') as Array<{
        groupId?: string;
        isGroupLeader?: boolean;
        name?: string;
        templateInfo?: { boundsWidth?: number };
      }>;
      return {
        count: rects.length,
        oneGroup: new Set(rects.map((r) => r.groupId)).size === 1 && rects.every((r) => r.groupId),
        leaders: rects.filter((r) => r.isGroupLeader).length,
        leaderName: rects.find((r) => r.isGroupLeader)?.name,
        bounds: rects.find((r) => r.isGroupLeader)?.templateInfo?.boundsWidth,
      };
    });
    expect(grouped.oneGroup).toBe(true);
    expect(grouped.leaders).toBe(1);
    expect(grouped.leaderName).toBe('Eget objekt');
    expect(grouped.bounds!).toBeGreaterThan(0);

    // Rename the group via the toolbar name input
    const nameInput = page.getByPlaceholder('Namnge objektet');
    await expect(nameInput).toBeVisible();
    await nameInput.fill('Platsbyggd hylla');
    await nameInput.press('Enter');
    const renamed = await page.evaluate(
      () =>
        (
          window.__rfEditorDebug!.getShapes().find(
            (s) => s.type === 'rectangle' && (s as { isGroupLeader?: boolean }).isGroupLeader
          ) as { name?: string }
        )?.name
    );
    expect(renamed).toBe('Platsbyggd hylla');

    // Clicking one member re-selects the whole group (Figma-style): the group
    // name input only shows for a coherent multi-shape group selection.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('selection-toolbar')).toHaveCount(0);
    await page.mouse.click(box.x + 360, box.y + 350);
    await expect(page.getByPlaceholder('Namnge objektet')).toBeVisible();

    // Ungroup clears the grouping from every member
    await page.getByTestId('ungroup-shapes').click();
    const afterUngroup = await page.evaluate(() =>
      window.__rfEditorDebug!
        .getShapes()
        .filter((s) => s.type === 'rectangle')
        .some((s) => (s as { groupId?: string }).groupId)
    );
    expect(afterUngroup).toBe(false);
  });

  test('right-click context menu: tools + recent objects + wall actions', async ({ page }) => {
    await openDemoPlanner(page, { blank: true });
    const canvas = page.getByTestId('editor-v2-canvas');
    const box = (await canvas.boundingBox())!;

    // A wall to right-click on later
    await page.keyboard.press('w');
    await page.mouse.move(box.x + 300, box.y + 300);
    await page.mouse.down();
    await page.mouse.up();
    await page.mouse.move(box.x + 700, box.y + 300);
    await page.mouse.down();
    await page.mouse.up();
    await page.keyboard.press('Enter');

    // Place a toilet → lands in the "recent objects" MRU
    await page.getByTestId('tool-objects').click();
    await page.getByRole('button', { name: /Badrum & VVS/ }).click();
    await page.locator('button[title="Toalett"]').click();
    await page.mouse.move(box.x + 500, box.y + 450);
    await page.waitForTimeout(150);
    await page.mouse.down();
    await page.mouse.up();
    await page.keyboard.press('v');
    await page.keyboard.press('Escape');

    // Right-click empty canvas: tools + recent objects
    await page.mouse.click(box.x + 850, box.y + 550, { button: 'right' });
    const menu = page.getByTestId('editor-context-menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByText('Verktyg')).toBeVisible();
    await expect(menu.getByText('Senaste objekt')).toBeVisible();
    await expect(menu.getByText('Toalett')).toBeVisible();

    // Recent object entry arms the object tool with that definition
    await menu.getByText('Toalett').click();
    await expect(menu).toHaveCount(0);
    expect(await page.evaluate(() => window.__rfEditorDebug!.getTool())).toBe('object');
    await page.keyboard.press('Escape');
    await page.keyboard.press('v');

    // Right-click ON the wall: selects it and offers wall actions
    await page.mouse.click(box.x + 350, box.y + 300, { button: 'right' });
    await expect(menu).toBeVisible();
    await expect(menu.getByText('Radera')).toBeVisible();
    await expect(menu.getByText('Rotera 90°')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
  });

  test('desktop default renders v2 with no editor flag set (desktop-first flip)', async ({ page }) => {
    // No editor flag in localStorage → the Desktop Chrome viewport must get v2.
    // (openDemoPlanner's tail asserts the v2 canvas + dev handle are present.)
    await openDemoPlanner(page, { flag: 'none' });
    await expect(page.getByTestId('editor-v2-canvas')).toBeVisible();
    await expect(page.getByText('Ny ritmotor')).toBeVisible();
  });

  test('resize handles: dragging a corner grows the rectangle (B2)', async ({ page }) => {
    await openDemoPlanner(page);
    const canvas = page.getByTestId('editor-v2-canvas');
    const box = (await canvas.boundingBox())!;

    // Draw a rectangle from (300,300) to (430,410)
    await page.getByTestId('tool-shapes').click();
    await page.getByTestId('tool-shape-rectangle').click();
    await page.mouse.move(box.x + 300, box.y + 300);
    await page.mouse.down();
    await page.mouse.move(box.x + 430, box.y + 410);
    await page.mouse.up();

    // Select it deterministically → the resize transformer attaches
    await page.keyboard.press('v');
    const id = await page.evaluate(() => {
      const dbg = window.__rfEditorDebug! as unknown as {
        getShapes: () => Array<{ id: string; type: string; coordinates: { width: number } }>;
        select: (ids: string[]) => void;
      };
      const r = dbg.getShapes().find((s) => s.type === 'rectangle')!;
      dbg.select([r.id]);
      return r.id;
    });
    await page.waitForTimeout(150);

    // Compute the actual bottom-right corner on screen from the shape's world
    // coords + the view transform (grid snap may have moved it off the cursor).
    const bottomRight = await page.evaluate((rid) => {
      const dbg = window.__rfEditorDebug! as unknown as {
        getShapes: () => Array<{ id: string; coordinates: { left: number; top: number; width: number; height: number } }>;
        getView: () => { zoom: number; panX: number; panY: number };
      };
      const c = dbg.getShapes().find((s) => s.id === rid)!.coordinates;
      const v = dbg.getView();
      return {
        x: (c.left + c.width) * v.zoom + v.panX,
        y: (c.top + c.height) * v.zoom + v.panY,
        width: c.width,
      };
    }, id);
    const widthBefore = bottomRight.width;

    // Drag the bottom-right handle outward (real mouse — Konva transformer)
    await page.mouse.move(box.x + bottomRight.x, box.y + bottomRight.y);
    await page.mouse.down();
    await page.mouse.move(box.x + bottomRight.x + 80, box.y + bottomRight.y + 80, { steps: 6 });
    await page.mouse.up();

    const widthAfter = await page.evaluate((rid) => {
      const r = window.__rfEditorDebug!.getShapes().find((s) => s.id === rid) as
        | { coordinates: { width: number } }
        | undefined;
      return r!.coordinates.width;
    }, id);
    expect(widthAfter).toBeGreaterThan(widthBefore);
  });

  test('closeout controls: shape fill colour, z-order, and text bold/size', async ({ page }) => {
    await openDemoPlanner(page, { blank: true });
    const canvas = page.getByTestId('editor-v2-canvas');
    const box = (await canvas.boundingBox())!;

    // Draw a rectangle → select → set fill via the toolbar colour input
    await page.getByTestId('tool-shapes').click();
    await page.getByTestId('tool-shape-rectangle').click();
    await page.mouse.move(box.x + 300, box.y + 300);
    await page.mouse.down();
    await page.mouse.move(box.x + 430, box.y + 410);
    await page.mouse.up();
    await page.keyboard.press('v');
    await page.keyboard.press('ControlOrMeta+a');
    await expect(page.getByTestId('selection-toolbar')).toBeVisible();
    await page.getByTestId('shape-fill').fill('#ff0000');

    const rect = await page.evaluate(() => {
      const r = window.__rfEditorDebug!.getShapes().find((s) => s.type === 'rectangle') as
        | { id: string; color?: string }
        | undefined;
      return { id: r?.id ?? '', color: r?.color };
    });
    expect(rect.color).toBe('#ff0000');

    // Bring to front → highest zIndex among non-room shapes
    const z = await page.evaluate((id) => {
      const dbg = window.__rfEditorDebug! as unknown as {
        execute: (n: string, p: unknown) => void;
        getShapes: () => Array<{ id: string; type: string; zIndex?: number }>;
      };
      dbg.execute('selection.reorder', { ids: [id], mode: 'front' });
      const shapes = dbg.getShapes();
      const mine = shapes.find((s) => s.id === id)!.zIndex ?? 0;
      const maxOther = Math.max(
        -Infinity,
        ...shapes.filter((s) => s.id !== id && s.type !== 'room').map((s) => s.zIndex ?? 0)
      );
      return { mine, maxOther };
    }, rect.id);
    expect(z.mine).toBeGreaterThan(z.maxOther);

    // Add a text shape, select it, toggle bold + set size via the toolbar
    const textId = await page.evaluate(() => {
      const dbg = window.__rfEditorDebug! as unknown as {
        execute: (n: string, p: unknown) => { id: string };
        select: (ids: string[]) => void;
      };
      const s = dbg.execute('shape.add', {
        shape: { type: 'text', text: 'Hej', coordinates: { x: 200, y: 200 }, fontSize: 16 },
      });
      dbg.select([s.id]);
      return s.id;
    });
    await page.getByTestId('text-bold').click();
    const sizeInput = page.getByTestId('text-size');
    await sizeInput.fill('28');
    await sizeInput.press('Enter');

    const text = await page.evaluate((id) => {
      const s = window.__rfEditorDebug!.getShapes().find((sh) => sh.id === id) as
        | { fontSize?: number; textStyle?: { isBold?: boolean } }
        | undefined;
      return { bold: s?.textStyle?.isBold, size: s?.fontSize };
    }, textId);
    expect(text.bold).toBe(true);
    expect(text.size).toBe(28);
  });

  test('trace image: scale to real width + opacity from the selection toolbar', async ({ page }) => {
    await openDemoPlanner(page);
    await page.keyboard.press('v');

    // Add a materialized background image (400×300 world units) and select it
    const id = await page.evaluate(() => {
      const dbg = window.__rfEditorDebug! as unknown as {
        execute: (n: string, p: unknown) => { id: string };
        select: (ids: string[]) => void;
      };
      const shape = dbg.execute('shape.add', {
        shape: {
          type: 'image',
          coordinates: { x: 100, y: 100, width: 400, height: 300 },
          imageUrl: 'data:image/png;base64,iVBORw0KGgo=',
          imageOpacity: 0.5,
        },
      });
      dbg.select([shape.id]);
      return shape.id;
    });

    // Toolbar shows image controls
    await expect(page.getByTestId('selection-toolbar')).toBeVisible();
    await expect(page.getByTestId('image-opacity')).toBeVisible();

    // Scale so the image spans 8 m → width 800 world (mm→world = ÷10), height keeps ratio
    const widthInput = page.getByTestId('image-width');
    await widthInput.fill('8000');
    await widthInput.press('Enter');

    const scaled = await page.evaluate((imgId) => {
      const s = window.__rfEditorDebug!.getShapes().find((sh) => sh.id === imgId) as
        | { coordinates: { width: number; height: number } }
        | undefined;
      return s?.coordinates;
    }, id);
    expect(scaled!.width).toBeCloseTo(800, 1); // 8000 mm ÷ 10
    expect(scaled!.height).toBeCloseTo(600, 1); // 300 × (800/400) — aspect kept

    // Opacity command clamps into [0.05, 1] and applies
    const op = await page.evaluate((imgId) => {
      const dbg = window.__rfEditorDebug! as unknown as {
        execute: (n: string, p: unknown) => void;
        getShapes: () => Array<{ id: string; imageOpacity?: number }>;
      };
      dbg.execute('image.setOpacity', { id: imgId, opacity: 0.2 });
      return dbg.getShapes().find((s) => s.id === imgId)?.imageOpacity;
    }, id);
    expect(op).toBeCloseTo(0.2, 5);
  });

  test('wall properties: thickness preset + height edit from the selection toolbar', async ({ page }) => {
    await openDemoPlanner(page);
    const canvas = page.getByTestId('editor-v2-canvas');
    const box = (await canvas.boundingBox())!;

    // One horizontal wall
    await page.keyboard.press('w');
    await page.mouse.move(box.x + 300, box.y + 350);
    await page.mouse.down();
    await page.mouse.up();
    await page.mouse.move(box.x + 700, box.y + 350);
    await page.mouse.down();
    await page.mouse.up();
    await page.keyboard.press('Enter');

    // Select it → wall property inputs appear in the floating toolbar
    await page.keyboard.press('v');
    await page.mouse.click(box.x + 500, box.y + 350);
    await expect(page.getByTestId('selection-toolbar')).toBeVisible();

    const thickness = page.getByTestId('wall-thickness');
    const height = page.getByTestId('wall-height');
    // New walls default to 150 mm / 2400 mm
    await expect(thickness).toHaveValue('150');
    await expect(height).toHaveValue('2400');

    // "Yttervägg" preset sets 300 mm
    await page.getByTestId('wall-preset').click();
    await page.getByRole('menuitem', { name: /Yttervägg/ }).click();
    await expect(thickness).toHaveValue('300');

    // Custom height commit
    await height.fill('2500');
    await height.press('Enter');

    const wall = await page.evaluate(() => {
      const w = window.__rfEditorDebug!.getShapes().filter((s) => s.type === 'wall').pop() as
        | { thicknessMM?: number; heightMM?: number }
        | undefined;
      return { t: w?.thicknessMM, h: w?.heightMM };
    });
    expect(wall.t).toBe(300);
    expect(wall.h).toBe(2500);
  });
});

/**
 * Regression: get-worker-data's wall→room resolution against REAL v2 editor
 * shapes, serialized exactly as plans.ts writes them to floor_map_shapes.
 *
 * Cowork varv 2 (2026-07-24) found the worker view silently dropping
 * wallNotes/wallSurfaces: room polygons are stored as {points: [...]}
 * (PolygonCoordinates) while the edge function expected a bare array, so no
 * wall ever resolved to a room. This test draws a linked room + wall note +
 * surface finish through the real UI and runs the ACTUAL resolution module
 * (imported from supabase/functions/get-worker-data) on the serialized data.
 */
import { test, expect, Page } from '@playwright/test';
import {
  extractWallInstructions,
  normalizeRoomPoints,
  resolveWallRooms,
  type ShapeRow,
} from '../supabase/functions/get-worker-data/wallRoomResolution';

declare global {
  interface Window {
    __rfEditorDebug?: {
      getShapes: () => Array<Record<string, unknown> & { id: string; type: string }>;
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
  const ok = page.getByRole('button', { name: 'OK' });
  if (await ok.isVisible({ timeout: 5000 }).catch(() => false)) {
    await ok.click();
  }
  // Route straight to the drawing view. This used to click a nav item labelled
  // "Planer"; that label is now "Ritning" and lives inside the "Yta" dropdown,
  // which silently killed 38 tests. The URL is the stable contract — these
  // tests are about the editor, not about how the nav is worded.
  await page.goto(`${new URL(page.url()).pathname}?tab=spaceplanner&subtab=floorplan`);
  const okPlanner = page.getByRole('button', { name: 'OK' });
  if (await okPlanner.isVisible({ timeout: 5000 }).catch(() => false)) {
    await okPlanner.click();
  }
  await expect(page.getByTestId('editor-v2-canvas')).toBeVisible({ timeout: 15000 });
  await page.waitForFunction(() => !!window.__rfEditorDebug);
}

test('wall note + surface finish resolve to the linked room from serialized v2 shapes', async ({ page }) => {
  await openDemoPlanner(page);
  const canvas = page.getByTestId('editor-v2-canvas');
  const box = (await canvas.boundingBox())!;
  const click = async (x: number, y: number) => {
    await page.mouse.move(box.x + x, box.y + y);
    await page.mouse.down();
    await page.mouse.up();
  };

  // Closed loop → auto-room, linked to the project's Hall (Cowork's scenario)
  await page.keyboard.press('w');
  await click(300, 300);
  await click(600, 300);
  await click(600, 500);
  await click(300, 500);
  await click(300, 300);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 5000 });
  await expect(dialog.getByText('Projektets rum')).toBeVisible({ timeout: 5000 });
  await dialog.getByRole('button', { name: 'Hall' }).first().click();
  const spara = dialog.getByRole('button', { name: 'Spara' });
  if (await spara.isEnabled({ timeout: 1000 }).catch(() => false)) {
    await spara.click();
  }
  await expect(dialog).not.toBeVisible({ timeout: 5000 });

  // Wall view on the top wall: place a note + set material
  await page.keyboard.press('v');
  await click(450, 300);
  await page.getByTestId('show-wall-view').click();
  await expect(page.getByText(/Vägg \d+ av 4/)).toBeVisible();

  await page.getByTestId('elevation-tool-text').click();
  const elevCanvas = page.locator('.fixed.inset-0 .konvajs-content canvas').last();
  const eb = (await elevCanvas.boundingBox())!;
  await elevCanvas.click({ position: { x: eb.width * 0.5, y: eb.height * 0.4 } });
  const noteInput = page.getByPlaceholder('Skriv anteckningen…');
  await expect(noteInput).toBeVisible();
  await noteInput.fill('Spotlights 3 st');
  await noteInput.press('Enter');

  await page.getByTestId('wall-surface-chip').click();
  const materialInput = page.getByPlaceholder('Gips, betong…');
  await materialInput.fill('Gips');
  await materialInput.blur();
  await expect(page.getByTestId('wall-surface-chip')).toContainText('Gips');

  await page.getByRole('button', { name: 'Planritning' }).click();
  await expect(page.getByTestId('editor-v2-canvas')).toBeVisible();

  // Serialize shapes EXACTLY as plans.ts saveShapesForPlan writes shape_data.
  // The room shape carries the REAL Hall roomId from the link dialog.
  const dbShapes = await page.evaluate(() => {
    const shapes = window.__rfEditorDebug!.getShapes() as Array<Record<string, unknown> & { id: string; type: string }>;
    return shapes.map((s) => ({
      id: s.id,
      shape_type: s.type,
      room_id: (s.roomId as string) || null,
      shape_data: {
        coordinates: s.coordinates,
        points: s.coordinates,
        text: s.text,
        material: s.material,
        treatment: s.treatment,
        treatmentColor: s.treatmentColor,
        wallRelative: s.wallRelative,
        shapeViewMode: s.shapeViewMode,
        metadata: s.metadata,
      },
    }));
  });
  const hallId = dbShapes.find((s) => s.shape_type === 'room')?.room_id || '';
  expect(hallId, 'room shape should carry the linked Hall roomId').toBeTruthy();

  // Mirror the edge function's data flow (index.ts 5b + 5g)
  const roomPolys = dbShapes
    .filter((s) => s.shape_type === 'room')
    .map((s) => ({
      id: s.id,
      roomId: s.room_id,
      points: normalizeRoomPoints(s.shape_data as Record<string, unknown>),
    }));
  const extraShapes = dbShapes.filter((s) =>
    ['wall', 'text'].includes(s.shape_type)
  ) as unknown as ShapeRow[];

  const wallRoom = resolveWallRooms(extraShapes, roomPolys, [hallId]);
  const { wallSurfaces, wallNotes } = extractWallInstructions(extraShapes, wallRoom);

  expect(Object.keys(wallRoom).length, 'all 4 loop walls should resolve to Hall').toBe(4);
  expect(wallSurfaces).toHaveLength(1);
  expect(wallSurfaces[0].material).toBe('Gips');
  expect(wallSurfaces[0].roomId).toBe(hallId);
  expect(wallNotes).toHaveLength(1);
  expect(wallNotes[0].text).toBe('Spotlights 3 st');
  expect(wallNotes[0].roomId).toBe(hallId);
});
